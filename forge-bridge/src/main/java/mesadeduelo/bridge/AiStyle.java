package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import java.util.Map;

/**
 * Estilo do computador (S12): os perfis de IA que o Forge já traz (res/ai/*.ai). Não são níveis de dificuldade, são
 * jeitos de jogar, e a mesa os chama assim: equilibrado (Default), cauteloso (Cautious), agressivo (Reckless, ataca
 * e troca mais) e experimental (Experimental, com as decisões novas que o Forge ainda testa).
 */
final class AiStyle {
    private AiStyle() {}

    static final String DEFAULT = "equilibrado";
    private static final Map<String, String> PROFILE = Map.of(
        "equilibrado", "Default", "cauteloso", "Cautious", "agressivo", "Reckless", "experimental", "Experimental");

    /** O estilo da mensagem {@code start}; sem o campo, o equilibrado. */
    static String parse(JsonElement value) {
        if (value == null || value.isJsonNull()) return DEFAULT;
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString() || !PROFILE.containsKey(value.getAsString()))
            throw new IllegalArgumentException("Estilo do computador inválido.");
        return value.getAsString();
    }

    /** O perfil do Forge para o estilo. */
    static String profile(String style) { return PROFILE.getOrDefault(style, "Default"); }

    /** O estilo de um perfil do Forge; um perfil sem nome na mesa (ou vazio) é o equilibrado. */
    static String of(String profile) {
        for (var e : PROFILE.entrySet()) if (e.getValue().equals(profile)) return e.getKey();
        return DEFAULT;
    }
}
