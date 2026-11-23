// Escudo de energia do bloqueador: uma placa curva translúcida com favos hexagonais, contorno forte na borda (fresnel),
// uma linha que sobe enquanto ele se ergue, ruído que corre e o clarão quando o golpe acerta.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec4 color : source_color = vec4(0.4, 0.7, 1.0, 1.0);
// 0 a 1: quanto do escudo já subiu (de baixo para cima).
uniform float rise = 0.0;
uniform float alpha = 1.0;
// O golpe acertando (1 no impacto, cai depois) e onde (UV.x).
uniform float hit = 0.0;
uniform float hit_x = 0.5;
// Quanto a placa se curva para trás nas pontas.
uniform float bend = 0.45;
uniform float seed = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Distância até a borda do favo hexagonal mais próximo (0 na borda).
float hex_edge(vec2 p) {
	vec2 r = vec2(1.0, 1.7320508);
	vec2 h = r * 0.5;
	vec2 a = mod(p, r) - h;
	vec2 b = mod(p - h, r) - h;
	vec2 g = dot(a, a) < dot(b, b) ? a : b;
	g = abs(g);
	float d = max(dot(g, normalize(vec2(1.0, 1.7320508))), g.x);
	return 0.5 - d;
}

void vertex() {
	VERTEX.z -= bend * VERTEX.x * VERTEX.x;
}

void fragment() {
	float height = 1.0 - UV.y;
	float shown = smoothstep(rise + 0.02, rise - 0.04, height);
	// As bordas da placa se esfumam (sem quina reta).
	float border = smoothstep(0.0, 0.12, UV.x) * smoothstep(1.0, 0.88, UV.x) * smoothstep(1.0, 0.8, height) * smoothstep(0.0, 0.05, height);
	float fres = pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), 2.2);
	float edge = hex_edge(UV * vec2(7.0, 5.0) + vec2(seed, TIME * 0.15));
	float cells = smoothstep(0.08, 0.0, edge);
	float flicker = noise(UV * vec2(9.0, 6.0) + vec2(TIME * 1.7, -TIME * 2.3) + seed);
	float scan = smoothstep(0.06, 0.0, abs(height - rise)) * step(rise, 0.995);
	float impact = hit * exp(-pow((UV.x - hit_x) * 3.2, 2.0)) * (0.6 + 0.4 * cells);
	float v = 0.08 + cells * (0.35 + 0.4 * flicker) + fres * 0.55 + scan * 1.4 + impact * 2.4 + hit * 0.25;
	ALBEDO = mix(color.rgb, vec3(1.0), clamp(scan + impact * 0.6, 0.0, 1.0)) * 1.8;
	ALPHA = clamp(v, 0.0, 1.0) * shown * border * alpha;
}
