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
import io.netty.util.concurrent.GlobalEventExecutor;

/**
 * Servidor WebSocket em ws://HOST:PORTA/ws. No modo watch, quem conecta recebe na hora o último estado publicado
 * por {@link #broadcast}; no modo play cada conexão recebe só o que é endereçado a ela ({@link #send(Channel, String)}).
 * Na mesma porta: GET /metrics, GET /health e, no modo play, POST /api/relatos ({@link Feedback}) e a área de admin ({@link Admin}).
 */
final class BridgeServer {
    private final String host;
    private final int port;
    private final ChannelGroup clients = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
    private final Listener listener;
    private volatile String last;
    /** Rota POST /api/relatos; null no modo watch. */
    private volatile Feedback feedback;
    /** Rotas /api/admin/; null no modo watch. */
    private volatile Admin admin;

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
                    ch.pipeline().addLast("agregador", new HttpObjectAggregator(1 << 16));
                    if (f != null) ch.pipeline().addLast(f.new Handler());
                    Admin a = admin;
                    if (a != null) ch.pipeline().addLast(a.new Handler());
                    ch.pipeline()
                        .addLast(new HttpEndpoints())
                        .addLast(new WebSocketServerProtocolHandler("/ws", null, true, 1 << 20))
                        .addLast(new SimpleChannelInboundHandler<TextWebSocketFrame>() {
                            @Override protected void channelRead0(ChannelHandlerContext ctx, TextWebSocketFrame frame) {
                                listener.onMessage(ctx.channel(), frame.text());
                            }
                            @Override public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
                                if (evt instanceof WebSocketServerProtocolHandler.HandshakeComplete) {
                                    clients.add(ctx.channel());
                                    String snapshot = last;
                                    if (snapshot != null) ctx.channel().writeAndFlush(new TextWebSocketFrame(snapshot));
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

    /** Envia para uma conexão só; ignora se ela já fechou. */
    static void send(Channel ch, String json) {
        if (ch != null && ch.isActive()) ch.writeAndFlush(new TextWebSocketFrame(json));
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
