// Raio de luz que desce do alto (raios de deus da vitória, da entrada do comandante e do dia): uma faixa macia que gira em
// volta do próprio eixo para ficar sempre de frente para a câmera, mais larga embaixo, com poeira correndo por dentro.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 0.0;
uniform float seed = 0.0;
// Largura no alto, em fração da de baixo.
uniform float taper = 0.25;

varying float across;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise1(float x) {
	float i = floor(x);
	float f = fract(x);
	return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
}

void vertex() {
	// O eixo do raio é o Y do nó (com o comprimento na escala), a largura é o X; a face gira em volta do eixo.
	vec3 axis = MODEL_MATRIX[1].xyz;
	float width = length(MODEL_MATRIX[0].xyz);
	vec3 center = MODEL_MATRIX[3].xyz;
	vec3 side = normalize(cross(normalize(axis), normalize(CAMERA_POSITION_WORLD - center)));
	float spread = mix(1.0, taper, VERTEX.y + 0.5);
	vec3 world = center + axis * VERTEX.y + side * VERTEX.x * width * spread;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(world, 1.0);
	across = VERTEX.x * 2.0;
}

void fragment() {
	// UV.y 0 no alto, 1 embaixo: nasce fraco no alto, cheio no meio e esfuma antes do pé (sem pontas nem cortes).
	float along = smoothstep(0.0, 0.4, UV.y) * smoothstep(1.0, 0.55, UV.y);
	float profile = exp(-across * across * 3.2);
	float streaks = 0.55 + 0.45 * noise1(UV.x * 9.0 + seed * 7.0 + TIME * 0.3);
	float dust = 0.8 + 0.2 * noise1(UV.y * 30.0 - TIME * 1.4 + seed * 3.0 + UV.x * 5.0);
	ALBEDO = mix(color.rgb, vec3(1.0), profile * 0.3) * 1.3;
	ALPHA = clamp(profile * along * streaks * dust * alpha, 0.0, 1.0);
}
