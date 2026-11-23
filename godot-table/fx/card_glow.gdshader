// Brilho no formato da carta: contorno que se afasta da borda, faixa de luz na face, luz correndo pela borda e halo macio.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(1.0);
// Tamanho da carta e a margem da malha em volta dela (os mesmos valores do CardGlow).
uniform vec2 card = vec2(0.63, 0.88);
uniform float pad = 0.3;
uniform float corner = 0.035;
// Contorno: quanto já se afastou da borda e a força.
uniform float outline = 0.0;
uniform float outline_alpha = 0.0;
// Faixa de luz atravessando a face na diagonal (0 a 1).
uniform float sweep = -1.0;
uniform float sweep_alpha = 0.0;
// Luz correndo pela borda: duas cabeças opostas, com rastro.
uniform float trace = 0.0;
uniform float trace_alpha = 0.0;
// Halo macio em volta (o reflexo embaixo da carta, no tampo).
uniform float under = 0.0;

float sd_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = (UV - 0.5) * (card + vec2(pad * 2.0));
	float d = sd_box(p, card * 0.5, corner);
	vec3 tint = color;
	vec3 light = vec3(0.0);

	// A borda acende colada na carta e solta um brilho curto para fora; o contorno se afasta pouco.
	float beyond = max(d - outline, 0.0);
	float o = exp(-pow((d - outline) / 0.01, 2.0)) * 1.4 + exp(-beyond / 0.03) * step(-0.004, d - outline) * 0.7;
	light += tint * o * outline_alpha;

	float inside = smoothstep(0.004, -0.004, d);
	float s = (p.x / card.x + p.y / card.y) * 0.5 + 0.5;
	float band = exp(-pow((s - sweep) / 0.08, 2.0)) * inside;
	light += mix(tint, vec3(1.0), 0.45) * band * sweep_alpha * 0.55;

	float t = atan(p.y, p.x) / 6.2831853 + 0.5;
	float tail = exp(-fract(trace - t) * 7.0) + exp(-fract(trace + 0.5 - t) * 7.0);
	float edge = exp(-pow(d / 0.012, 2.0)) * 1.6 + exp(-abs(d) / 0.04) * 0.8;
	light += mix(tint, vec3(1.0), 0.35) * tail * edge * trace_alpha;

	// O reflexo no tampo: uma poça de luz macia que sai de baixo da carta.
	light += tint * exp(-max(d, 0.0) / 0.12) * under * 0.9;

	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
