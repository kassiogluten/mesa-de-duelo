// Clarão em estrela de frente para a câmera (o impacto no retrato, o reflexo na moeda, as cintilas da gema): miolo, quatro raios e uma auréola.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled, fog_disabled;

uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 1.0;
// Comprimento dos raios (0: só o miolo e a auréola).
uniform float rays = 1.0;

void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0),
		vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float core = exp(-dot(p, p) * 22.0);
	float cross = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 2.8) + exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 2.8);
	vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071;
	float diagonal = (exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 6.0) + exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 6.0)) * 0.45;
	float halo = exp(-length(p) * 4.5) * 0.4;
	float v = core * 1.8 + (cross + diagonal) * rays + halo;
	vec3 tint = color.rgb * COLOR.rgb;
	ALBEDO = mix(tint, vec3(1.0), clamp(core * 1.5, 0.0, 1.0)) * v * 2.0;
	ALPHA = clamp(v * alpha * COLOR.a, 0.0, 1.0);
}
