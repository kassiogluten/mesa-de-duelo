// Moldura das peças da pilha: borda fina e fixa na cor do item do topo, e um halo por fora que só acende quando dá para
// responder (respirando devagar) ou no clarão de um item novo.
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
// Clarão de entrada (1 na hora em que um item novo chega, cai a 0).
uniform float flash = 0.0;

float rounded_box(vec2 p, vec2 half_size, float r) {
	vec2 q = abs(p) - half_size + vec2(r);
	return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 full = box + vec2(pad * 2.0);
	vec2 p = (UV - 0.5) * full;
	float d = rounded_box(p, box * 0.5, radius);
	// A borda: uma linha de ~1,5 px.
	float line = 1.0 - smoothstep(0.6, 1.6, abs(d));
	float lit = line * (border + glow * 0.25);
	// O halo por fora: some com a distância e respira devagar (uma vez a cada ~4 s).
	float breathe = 0.78 + 0.22 * sin(TIME * 1.6);
	float outside = max(d, 0.0);
	float halo = exp(-outside / (pad * 0.38)) * (glow * breathe + flash) * step(-0.5, d);
	// Brilho junto da linha, por dentro, quando acende.
	float inner = exp(-max(-d, 0.0) / 5.0) * step(d, 0.0) * (glow * 0.3 + flash * 0.6);
	float alpha = clamp(lit + halo * 0.8 + inner, 0.0, 1.0);
	vec3 rgb = mix(color.rgb, vec3(1.0), clamp(flash * 0.4, 0.0, 0.7));
	COLOR = vec4(rgb * alpha, alpha);
}
