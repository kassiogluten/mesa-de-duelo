// O tampo chamuscado atrás da onda do limpa-campo: fuligem manchada, brasas logo atrás da frente e a borda acesa na cor da mágica.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec4 color : source_color = vec4(1.0, 0.5, 0.2, 1.0);
// Onde está a frente da onda (0 no meio, 1 na borda da malha) e a força de tudo.
uniform float radius = 0.0;
uniform float alpha = 1.0;
// Quanto as brasas já esfriaram (0: acesas, 1: só fuligem).
uniform float cool = 0.0;

// Manchas por ondas entortadas umas pelas outras: macias, sem a grade de um ruído por células.
float blotches(vec2 p) {
	float a = sin(p.x * 1.7 + sin(p.y * 1.3) * 1.8);
	float b = sin(p.y * 2.1 + sin(p.x * 1.1 + 1.7) * 1.6);
	float c = sin((p.x + p.y) * 3.3 + sin(p.x * 2.6 - p.y * 1.9) * 1.2);
	return 0.5 + 0.22 * a + 0.18 * b + 0.1 * c;
}

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float r = length(p);
	float n = blotches(p * 6.0);
	float behind = smoothstep(radius + 0.01, radius - 0.05, r) * smoothstep(1.0, 0.8, r);
	float soot = behind * smoothstep(0.2, 0.8, n) * 0.7;
	float edge = exp(-pow((r - radius) / 0.012, 2.0)) * step(0.01, radius) * (0.6 + 0.4 * n);
	float embers = behind * smoothstep(0.55, 0.9, n) * smoothstep(radius - 0.3, radius - 0.02, r) * (1.0 - cool) * 0.7;
	vec3 burn = vec3(0.025, 0.018, 0.012);
	ALBEDO = burn + color.rgb * (edge * 3.5 + embers * 2.5);
	ALPHA = clamp(soot * 0.85 + edge * 0.9 + embers, 0.0, 1.0) * alpha;
}
