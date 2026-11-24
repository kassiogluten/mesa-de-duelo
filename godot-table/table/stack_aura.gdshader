// A presença do item do topo da pilha, numa malha presa à carta: o contorno aurora (camada 0), uma borda fina com um
// degradê de três tons da cor do item girando devagar e um brilho curto e desfocado junto dela; e a onda na forma da carta
// que se abre quando o item chega ou resolve (camada 2).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

// Os três tons do degradê (a cor do item e dois vizinhos dela) e o tom claro da onda.
uniform vec3 color : source_color = vec3(1.0, 0.5, 0.2);
uniform vec3 tone_b : source_color = vec3(1.0, 0.6, 0.4);
uniform vec3 tone_c : source_color = vec3(1.0, 0.8, 0.5);
uniform vec3 hot : source_color = vec3(1.0, 0.95, 0.85);
uniform vec2 card = vec2(0.63, 0.88);
uniform float pad = 0.4;
uniform float corner = 0.035;
uniform int layer = 0;
uniform float intensity = 1.0;
// 0 calmo; 1 quando a vez é sua e o item do topo é do oponente (pode responder): brilho um pouco maior.
uniform float urgency = 0.0;
// Quanto o degradê já girou, em voltas (acumulado no script, para a velocidade mudar sem salto).
uniform float spin = 0.0;
uniform float seed = 0.0;
// Camada 2: quanto a onda já se afastou da borda.
uniform float shock = 0.0;

float sd_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Degradê circular de três tons, fechando a volta sem emenda.
vec3 aurora(float s) {
	float k = fract(s) * 3.0;
	vec3 a = k < 1.0 ? color : (k < 2.0 ? tone_b : tone_c);
	vec3 b = k < 1.0 ? tone_b : (k < 2.0 ? tone_c : color);
	return mix(a, b, smoothstep(0.0, 1.0, fract(k)));
}

void fragment() {
	vec2 p = (UV - 0.5) * (card + vec2(pad * 2.0));
	float d = sd_box(p, card * 0.5, corner);
	vec3 light = vec3(0.0);
	if (layer == 0) {
		vec3 tint = aurora(atan(p.y, p.x) / 6.2831853 + spin + seed);
		// Borda fina, logo por fora da carta.
		float line = 1.0 - smoothstep(0.0025, 0.0055, abs(d - 0.003));
		// Brilho curto e desfocado, só do lado de fora.
		float outside = max(d, 0.0);
		float glow = exp(-pow(outside / (0.05 + urgency * 0.014), 1.3)) * smoothstep(-0.004, 0.004, d);
		light = tint * (line * (0.85 + urgency * 0.2) + glow * (0.34 + urgency * 0.2));
	} else {
		float wave = exp(-pow((d - shock) / 0.012, 2.0)) * 1.5 + exp(-abs(d - shock) / 0.05) * 0.6;
		light = mix(hot, color, 0.4) * wave * step(-0.002, d);
	}
	// Some antes da borda da malha (distância na mesa, para a malha do contorno, mais justa, não cortar o brilho).
	vec2 half_mesh = card * 0.5 + vec2(pad);
	float border = min(half_mesh.x - abs(p.x), half_mesh.y - abs(p.y));
	light *= intensity * smoothstep(0.0, layer == 0 ? 0.04 : 0.16, border);
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
