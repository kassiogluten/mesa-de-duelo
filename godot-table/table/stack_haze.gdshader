// Ar tremendo em volta da carta do topo da pilha: o fundo atrás dela ondula de leve, como calor de magia acumulada.
shader_type spatial;
render_mode unshaded, depth_draw_never, cull_disabled, shadows_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform vec2 card = vec2(0.63, 0.88);
uniform float pad = 0.4;
uniform float corner = 0.035;
uniform float strength = 0.006;
uniform float seed = 0.0;

float sd_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	vec2 p = (UV - 0.5) * (card + vec2(pad * 2.0));
	float d = sd_box(p, card * 0.5, corner);
	float border = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
	float mask = smoothstep(0.0, 0.025, d) * exp(-max(d, 0.0) / 0.13) * smoothstep(0.0, 0.15, border);
	vec2 flow = UV * 9.0 + vec2(seed, TIME * 1.6);
	vec2 offset = (vec2(noise(flow), noise(flow + 17.3)) - 0.5) * strength * mask;
	ALBEDO = textureLod(screen_tex, SCREEN_UV + offset, 0.0).rgb;
	ALPHA = clamp(mask * 2.0, 0.0, 1.0) * smoothstep(0.0, 0.15, border);
}
