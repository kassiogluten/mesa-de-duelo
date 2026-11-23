// Rastro do projétil: fita que afina até a cauda, quente perto da cabeça e na cor da carta atrás, rasgada por ruído que corre.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(1.0, 0.4, 0.2);
uniform vec3 tail : source_color = vec3(1.0, 0.25, 0.1);
uniform vec3 hot : source_color = vec3(1.0, 0.95, 0.85);
uniform float intensity = 1.0;
// Quanto o ruído rasga a fita (fogo e sombra mais; arcano liso).
uniform float roughness = 0.5;
uniform float seed = 0.0;

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
	// UV.x: 0 na cabeça, 1 na cauda; UV.y: de um lado ao outro da fita.
	float along = UV.x;
	float across = abs(UV.y * 2.0 - 1.0);
	float n = noise(vec2(along * 7.0 - TIME * 9.0 + seed, UV.y * 3.0 + seed)) * 0.65
		+ noise(vec2(along * 15.0 - TIME * 14.0, UV.y * 6.0 - seed)) * 0.35;
	float body = pow(1.0 - along, 1.4);
	// Três camadas: o halo macio e largo, o corpo rasgado pelo ruído e o filamento quente no meio.
	float halo = exp(-across * across * 3.5) * body * 0.55;
	float width = 0.3 + 0.55 * body;
	float edge = 1.0 - smoothstep(width * 0.2, width, across + (n - 0.5) * roughness * (0.35 + along));
	float breakup = mix(1.0, smoothstep(0.15, 0.7, n), roughness * along);
	float filament = exp(-across * across * 22.0) * pow(1.0 - along, 2.2) * 1.3;
	vec3 tint = mix(hot, color, smoothstep(0.0, 0.25, along));
	tint = mix(tint, tail, smoothstep(0.4, 1.0, along));
	// Na cabeça a fita afina até o núcleo, sem a ponta reta.
	float head = smoothstep(0.0, 0.12, along);
	float taper = 1.0 - smoothstep(head * 0.9 + 0.1, head + 0.15, across);
	vec3 light = (color * halo * head + tint * edge * breakup * body * 1.5 * taper + hot * filament * taper) * intensity;
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
