// Rastro de calor do atacante (e o golpe que atropela): uma fita que sai da carta, quente perto dela e esfriando na
// ponta, com o ar ondulando por dentro.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec4 color : source_color = vec4(1.0, 0.3, 0.12, 1.0);
uniform float alpha = 1.0;
uniform float energy = 2.4;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	// UV.x: 0 junto da carta, 1 na ponta; UV.y: de um lado ao outro da fita.
	float age = UV.x;
	float across = 1.0 - abs(UV.y - 0.5) * 2.0;
	float heat = noise(vec2(UV.x * 7.0 - TIME * 5.0, UV.y * 3.0 + TIME * 2.0));
	float body = pow(across, 1.4) * pow(1.0 - age, 1.3);
	vec3 hot = mix(color.rgb, vec3(1.0, 0.92, 0.7), pow(across, 5.0) * (1.0 - age));
	ALBEDO = hot * energy;
	ALPHA = clamp(body * (0.55 + 0.45 * heat), 0.0, 1.0) * alpha;
}
