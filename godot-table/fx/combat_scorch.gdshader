// Marca do golpe no tampo, debaixo do retrato: rachaduras em raio que acendem em brasa e esfriam.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec4 color : source_color = vec4(1.0, 0.4, 0.15, 1.0);
// 1 aceso, 0 frio.
uniform float heat = 1.0;
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

void fragment() {
	vec2 c = (UV - 0.5) * 2.0;
	float r = length(c);
	float a = atan(c.y, c.x);
	// Raios irregulares: o ângulo dobrado pelo ruído, finos e mais fortes perto do centro.
	float wobble = noise(vec2(a * 3.0 + seed, r * 4.0)) * 0.6;
	float rays = pow(abs(sin(a * 6.0 + wobble * 3.0 + seed)), 48.0);
	float cracks = rays * smoothstep(1.0, 0.15, r) * (0.6 + 0.4 * noise(vec2(r * 12.0, a * 5.0)));
	float crater = exp(-r * r * 14.0);
	float v = (cracks * 1.4 + crater) * heat;
	ALBEDO = mix(color.rgb, vec3(1.0, 0.9, 0.7), crater * heat) * 2.2;
	ALPHA = clamp(v, 0.0, 1.0) * smoothstep(1.0, 0.85, r);
}
