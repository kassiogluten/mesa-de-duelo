// Energia viva dentro de um pip da reserva de mana: fios claros girando devagar dentro do disco do símbolo, um aro aceso
// e um reflexo que passa, somados por cima do desenho sem apagá-lo.
shader_type canvas_item;
render_mode blend_add, unshaded;

uniform vec4 tint : source_color = vec4(0.4, 0.9, 0.5, 1.0);
uniform float intensity = 1.0;
uniform float flash = 0.0;
uniform float phase = 0.0;

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
	float fade_all = COLOR.a;
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float t = TIME + phase * 11.0;
	// Só dentro do disco, com a borda macia.
	float mask = smoothstep(1.0, 0.9, r);
	// Redemoinho: o ângulo gira mais perto do centro.
	float ang = atan(p.y, p.x) + t * 0.45 + (1.0 - r) * 2.6;
	vec2 q = vec2(cos(ang), sin(ang)) * r * 2.4;
	float n = noise(q + vec2(t * 0.25, -t * 0.18)) * 0.65 + noise(q * 2.1 - vec2(t * 0.4, t * 0.1)) * 0.35;
	float wisps = smoothstep(0.55, 0.85, n);
	vec3 hot = mix(tint.rgb, vec3(1.0), 0.5);
	// O aro aceso por dentro e um reflexo que passa de vez em quando.
	float rim = smoothstep(0.62, 0.98, r) * 0.55;
	float glint_at = fract(t * 0.12) * 3.0 - 1.0;
	float glint = exp(-pow((p.x + p.y * 0.6 - glint_at * 1.6) / 0.18, 2.0)) * 0.45;
	float a = (wisps * 0.32 + rim * 0.5 + glint + flash * 0.7) * mask * intensity;
	COLOR = vec4(hot * a, fade_all);
}
