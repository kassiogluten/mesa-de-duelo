package mesadeduelo.bridge;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.group.ChannelGroup;
import io.netty.channel.group.DefaultChannelGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.util.AttributeKey;
import io.netty.util.concurrent.GlobalEventExecutor;

import java.net.InetSocketAddress;

/**
 * Servidor WebSocket em ws://HOST:PORTA/ws. No modo watch, quem conecta recebe na hora o último estado publicado
 * por {@link #broadcast}; no modo play cada conexão recebe só o que é endereçado a ela ({@link #send(Channel, String)}).
 * Na mesma porta: GET /metrics, GET /health e, no modo play, POST /api/relatos ({@link Feedback}), POST /api/funil ({@link Funnel}),
 * os torneios ({@link Tournaments}), os dados das cartas ({@link CardDataCache}), a tela de detalhes do deck ({@link DeckApi}), a área de admin ({@link Admin}) e GET /api/aviso
 * ({@link ServerNotice}, que também chega pelo WebSocket a quem conecta enquanto o aviso vale).
 */
final class BridgeServer {
    private final String host;
    private final int port;
    private final ChannelGroup clients = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
    private final Listener listener;
    private volatile String last;
    /** IP de quem abriu a conexão, pelo X-Real-IP do nginx (sem ele, o endereço do socket). */
    private static final AttributeKey<String> IP = AttributeKey.valueOf("mesa.ip");
    /** Rota POST /api/relatos; null no modo watch. */
    private volatile Feedback feedback;
    /** Rotas /api/admin/; null no modo watch. */
    private volatile Admin admin;
    /** Rotas /api/conta/; null no modo watch. */
    private volatile Accounts accounts;
    /** Rota POST /api/funil; null no modo watch. */
    private volatile Funnel funnel;
    /** Rotas /api/torneios/; null no modo watch. */
    private volatile Tournaments tournaments;
    /** Rota POST /api/cartas; null no modo watch. */
    private volatile CardDataCache cardData;
    /** Rotas /api/deck/ (deck público, impressões, funções); null no modo watch. */
    private volatile DeckApi deckApi;
    /** Aviso do servidor (manutenção); null no modo watch. */
    private volatile ServerNotice notice;

    interface Listener {
        void onConnect(Channel ch);
        void onMessage(Channel ch, String text);
        void onDisconnect(Channel ch);
    }

    BridgeServer(String host, int port, Listener listener) {
        this.host = host;
        this.port = port;
        this.listener = listener;
        Metrics.gauge("mesa.ws.connections", "Conexões WebSocket abertas", this, BridgeServer::clientCount);
    }

    void feedback(Feedback f) { feedback = f; }
    void admin(Admin a) { admin = a; }
    void accounts(Accounts a) { accounts = a; }
    void funnel(Funnel f) { funnel = f; }
    void tournaments(Tournaments t) { tournaments = t; }
    void cardData(CardDataCache c) { cardData = c; }
    void deckApi(DeckApi d) { deckApi = d; }
    void notice(ServerNotice n) { notice = n; n.broadcaster(this::sendAll); }

    void start() throws InterruptedException {
        EventLoopGroup boss = new NioEventLoopGroup(1);
        EventLoopGroup workers = new NioEventLoopGroup(2);
        new ServerBootstrap()
            .group(boss, workers)
            .channel(NioServerSocketChannel.class)
            .childHandler(new ChannelInitializer<SocketChannel>() {
                @Override protected void initChannel(SocketChannel ch) {
                    Feedback f = feedback;
                    ch.pipeline().addLast(new HttpServerCodec());
                    // Os relatos têm agregador próprio de 3 MB; as outras rotas continuam com 64 KB.
                    if (f != null) ch.pipeline().addLast(new Feedback.Route("agregador"));
                    // A sincronia dos decks da conta também: até 4 MB.
                    if (accounts != null) ch.pipeline().addLast(new Accounts.Route("agregador"));
                    ch.pipeline().addLast("agregador", new HttpObjectAggregator(1 << 16));
                    if (f != null) ch.pipeline().addLast(f.new Handler());
                    Admin a = admin;
                    if (a != null) ch.pipeline().addLast(a.new Handler());
                    Accounts c = accounts;
                    if (c != null) ch.pipeline().addLast(c.new Handler());
                    Funnel n = funnel;
                    if (n != null) ch.pipeline().addLast(n.new Handler());
                    Tournaments t = tournaments;
                    if (t != null) ch.pipeline().addLast(t.new Handler());
                    CardDataCache d = cardData;
                    if (d != null) ch.pipeline().addLast(d.new Handler());
                    DeckApi da = deckApi;
                    if (da != null) ch.pipeline().addLast(da.new Handler());
                    ServerNotice sn = notice;
                    if (sn != null) ch.pipeline().addLast(sn.new Handler());
                    ch.pipeline()
                        .addLast(new HttpEndpoints())
                        .addLast(new WebSocketServerProtocolHandler("/ws", null, true, 1 << 20))
                        .addLast(new SimpleChannelInboundHandler<TextWebSocketFrame>() {
                            @Override protected void channelRead0(ChannelHandlerContext ctx, TextWebSocketFrame frame) {
                                listener.onMessage(ctx.channel(), frame.text());
                            }
                            @Override public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
                                if (evt instanceof WebSocketServerProtocolHandler.HandshakeComplete handshake) {
                                    String real = handshake.requestHeaders().get("X-Real-IP");
                                    if (real != null && !real.isBlank()) ctx.channel().attr(IP).set(real.strip());
                                    clients.add(ctx.channel());
                                    String snapshot = last;
                                    if (snapshot != null) ctx.channel().writeAndFlush(new TextWebSocketFrame(snapshot));
                                    // Quem conecta enquanto vale um aviso do servidor recebe-o logo de cara.
                                    ServerNotice sn = notice;
                                    ServerNotice.Notice current = sn == null ? null : sn.current();
                                    if (current != null) ctx.channel().writeAndFlush(new TextWebSocketFrame(ServerNotice.message(current)));
                                    listener.onConnect(ctx.channel());
                                }
                                super.userEventTriggered(ctx, evt);
                            }
                            @Override public void channelInactive(ChannelHandlerContext ctx) throws Exception {
                                listener.onDisconnect(ctx.channel());
                                super.channelInactive(ctx);
                            }
                        });
                }
            })
            .bind(host, port).sync();
    }

    void broadcast(String json) {
        last = json;
        clients.writeAndFlush(new TextWebSocketFrame(json));
    }

    /** Envia para todas as conexões abertas, sem mexer no último estado do modo watch. */
    void sendAll(String json) { clients.writeAndFlush(new TextWebSocketFrame(json)); }

    /** Envia para uma conexão só; ignora se ela já fechou. */
    static void send(Channel ch, String json) {
        if (ch != null && ch.isActive()) ch.writeAndFlush(new TextWebSocketFrame(json));
    }

    static String ip(Channel ch) {
        String ip = ch.attr(IP).get();
        if (ip != null) return ip;
        return ch.remoteAddress() instanceof InetSocketAddress a && a.getAddress() != null ? a.getAddress().getHostAddress() : String.valueOf(ch.remoteAddress());
    }

    int clientCount() { return clients.size(); }

    /** GET /metrics (Prometheus) e GET /health; o resto segue para o WebSocket em /ws. */
    private static final class HttpEndpoints extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof FullHttpRequest req && req.method() == HttpMethod.GET) {
                String path = new QueryStringDecoder(req.uri()).path();
                if ("/metrics".equals(path) || "/health".equals(path)) {
                    req.release();
                    boolean metrics = "/metrics".equals(path);
                    byte[] body = (metrics ? Metrics.scrape() : "ok\n").getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    var res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.OK, Unpooled.wrappedBuffer(body));
                    res.headers().set(HttpHeaderNames.CONTENT_TYPE, metrics ? "text/plain; version=0.0.4; charset=utf-8" : "text/plain; charset=utf-8");
                    res.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, body.length);
                    ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
                    return;
                }
            }
            ctx.fireChannelRead(msg);
        }
    }
}
