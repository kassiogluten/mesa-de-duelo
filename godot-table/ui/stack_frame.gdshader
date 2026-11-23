// Moldura viva das peças da pilha: borda fina na cor do item do topo, duas luzes dando a volta nela e um halo por fora
// que acende quando dá para responder (e pulsa devagar).
shader_type canvas_item;
render_mode blend_premul_alpha;

uniform vec4 color : source_color = vec4(0.94, 0.72, 0.29, 1.0);
// Tamanho da moldura em pixels (sem a margem) e o raio dos cantos.
uniform vec2 box = vec2(280.0, 44.0);
uniform float radius = 22.0;
// Margem em volta da moldura, onde o halo se espalha.
uniform float pad = 18.0;
// 0 a 1: quanto o halo de fora acende (responder) e quanto a borda aparece.
uniform float glow = 0.0;
uniform float border = 0.55;
// Quanto as luzes que correm aparecem e a velocidade delas (voltas por segundo).
uniform float runner = 0.8;
uniform float speed = 0.16;
// Clarão de entrada (1 na hora em que um item novo chega, cai a 0).
uniform float flash = 0.0;

float rounded_box(vec2 p, vec2 half_size, float r) {
	vec2 q = abs(p) - half_size + vec2(r);
	return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Posição (0 a 1) ao longo do perímetro, contando pelo ângulo em volta do centro, corrigido pela proporção da caixa.
float along(vec2 p, vec2 half_size) {
	vec2 n = p / max(half_size, vec2(1.0));
	return atan(n.y, n.x) / 6.2831853 + 0.5;
}

void fragment() {
	vec2 full = box + vec2(pad * 2.0);
	vec2 p = (UV - 0.5) * full;
	vec2 half_size = box * 0.5;
	float d = rounded_box(p, half_size, radius);
	// A borda: uma linha de ~1,5 px.
	float line = 1.0 - smoothstep(0.6, 1.6, abs(d));
	// As duas luzes que correm (opostas), com um rastro que some.
	float t = fract(TIME * speed);
	float a = along(p, half_size);
	float run = 0.0;
	for (int i = 0; i < 2; i++) {
		float head = fract(t + float(i) * 0.5);
		float dist = fract(head - a);
		run += exp(-dist * 22.0) * (dist < 0.5 ? 1.0 : 0.0);
	}
	float lit = line * (border + run * runner * 1.6);
	// O halo por fora: some com a distância e respira devagar.
	float breathe = 0.75 + 0.25 * sin(TIME * 3.2);
	float outside = max(d, 0.0);
	float halo = exp(-outside / (pad * 0.38)) * (glow * breathe + flash) * step(-0.5, d);
	// Brilho junto da linha, por dentro, quando acende.
	float inner = exp(-max(-d, 0.0) / 5.0) * step(d, 0.0) * (glow * 0.35 + flash * 0.6);
	float alpha = clamp(lit + halo * 0.85 + inner, 0.0, 1.0);
	vec3 rgb = mix(color.rgb, vec3(1.0), clamp(run * 0.45 + flash * 0.4, 0.0, 0.7));
	COLOR = vec4(rgb * alpha, alpha);
}
