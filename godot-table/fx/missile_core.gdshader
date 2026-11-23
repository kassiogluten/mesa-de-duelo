// Núcleo do projétil (e o clarão do impacto): centro branco-quente, coroa na cor da carta e raios que tremulam.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(1.0, 0.4, 0.2);
uniform vec3 hot : source_color = vec3(1.0, 0.95, 0.85);
uniform float intensity = 1.0;
// Quanto os raios tremulam (radiante e elétrico mais; arcano quase nada).
uniform float rays = 0.5;
uniform float seed = 0.0;

void vertex() {
	// Sempre de frente para a câmera, mantendo a escala do nó.
	vec3 scale = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(scale.x, 0.0, 0.0, 0.0), vec4(0.0, scale.y, 0.0, 0.0), vec4(0.0, 0.0, scale.z, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}

void fragment() {
	vec2 p = UV - 0.5;
	float r = length(p) * 2.0;
	float a = atan(p.y, p.x);
	float t = TIME * 1.0 + seed;
	float flicker = 0.5 + 0.5 * sin(a * 7.0 + t * 23.0) * sin(a * 3.0 - t * 17.0 + seed * 3.0);
	float spikes = pow(max(0.0, sin(a * 5.0 + t * 9.0)), 12.0) * rays;
	float core = exp(-r * r * 28.0);
	float corona = exp(-r * 3.6) * (0.75 + 0.35 * flicker * rays);
	float streaks = spikes * exp(-r * 1.6) * smoothstep(1.0, 0.2, r);
	vec3 light = hot * core * 2.2 + color * (corona * 1.25 + streaks * 1.5);
	light *= intensity * smoothstep(1.0, 0.82, r);
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
