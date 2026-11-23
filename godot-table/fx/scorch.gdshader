// O tampo chamuscado atrás da onda do limpa-campo: fuligem manchada, brasas logo atrás da frente e a borda acesa na cor da mágica.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec4 color : source_color = vec4(1.0, 0.5, 0.2, 1.0);
// Onde está a frente da onda (0 no meio, 1 na borda da malha) e a força de tudo.
uniform float radius = 0.0;
uniform float alpha = 1.0;
// Quanto as brasas já esfriaram (0: acesas, 1: só fuligem).
uniform float cool = 0.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float r = length(p);
	// O ruído girado e em várias escalas: manchas soltas, sem a grade quadrada aparecendo.
	vec2 q = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * p;
	float n = noise(q * 5.0) * 0.55 + noise(q * 11.0 + 3.1) * 0.3 + noise(q * 23.0 + 7.7) * 0.15;
	float behind = smoothstep(radius + 0.01, radius - 0.05, r) * smoothstep(1.0, 0.8, r);
	float soot = behind * smoothstep(0.2, 0.8, n) * 0.7;
	float edge = exp(-pow((r - radius) / 0.012, 2.0)) * step(0.01, radius) * (0.6 + 0.4 * n);
	float embers = behind * smoothstep(0.55, 0.9, n) * smoothstep(radius - 0.3, radius - 0.02, r) * (1.0 - cool) * 0.7;
	vec3 burn = vec3(0.025, 0.018, 0.012);
	ALBEDO = burn + color.rgb * (edge * 3.5 + embers * 2.5);
	ALPHA = clamp(soot * 0.6 + edge * 0.9 + embers, 0.0, 1.0) * alpha;
}
