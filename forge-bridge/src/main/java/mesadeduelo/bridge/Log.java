package mesadeduelo.bridge;

import java.io.PrintStream;
import java.util.Locale;

/**
 * Log do servidor: uma linha por evento, com o nível e, quando há, a sala (ou partida contra a IA) e a partida na
 * frente, para um relato de produção levar direto às linhas daquela mesa: {@code [ABCD partida 1a2b3c4d] ...}.
 * Info vai para a saída padrão; aviso e erro, para a de erro, com "AVISO:"/"ERRO:" na frente. Sem contexto e no nível
 * info, a linha sai igual à mensagem (as linhas de partida do servidor continuam as mesmas).
 * {@code -Dmesa.log=warn} (ou {@code error}) cala os níveis abaixo. Nunca passe tokens, senhas ou e-mails na mensagem.
 */
final class Log {
    enum Level { INFO, WARN, ERROR }

    private static final Level MIN = parse(System.getProperty("mesa.log", "info"));
    private static final Log BRIDGE = new Log("");

    private final String prefix;
    private Log(String prefix) { this.prefix = prefix; }

    /** Sem sala: o servidor como um todo (início, contas, relatos). */
    static Log bridge() { return BRIDGE; }

    /** Uma sala ou partida contra a IA, sem partida em andamento (ou quando a partida não importa). */
    static Log room(String code) { return code == null || code.isEmpty() ? BRIDGE : new Log("[" + code + "] "); }

    /** A sessão e a partida atual dela. */
    static Log of(Session session) { return session == null ? BRIDGE : match(session.code, session.matchId); }

    /** A sala (ou partida contra a IA) e a partida, pelos 8 primeiros caracteres do id dela. */
    static Log match(String code, String matchId) {
        if (matchId == null || matchId.isEmpty()) return room(code);
        return new Log("[" + (code == null ? "" : code + " ") + "partida " + matchId.substring(0, Math.min(8, matchId.length())) + "] ");
    }

    void info(String message) { write(Level.INFO, message); }
    void warn(String message) { write(Level.WARN, message); }
    void error(String message) { write(Level.ERROR, message); }
    void info(String format, Object... args) { info(String.format(format, args)); }

    private void write(Level level, String message) {
        if (level.ordinal() < MIN.ordinal()) return;
        PrintStream out = level == Level.INFO ? System.out : System.err;
        String tag = level == Level.WARN ? "AVISO: " : level == Level.ERROR ? "ERRO: " : "";
        out.println(tag + prefix + message);
    }

    private static Level parse(String value) {
        try { return Level.valueOf(value.trim().toUpperCase(Locale.ROOT)); }
        catch (RuntimeException e) { return Level.INFO; }
    }
}
