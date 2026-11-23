// O selo do enjoo de invocação vivo: as três estrelinhas do ícone girando devagar numa elipse achatada (um halo de
// personagem tonto visto de cima), com o rastro tracejado fraco da órbita.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

// Cor do rastro (a do selo), o ouro das estrelas e quanto tempo leva uma volta.
uniform vec3 ring_color : source_color = vec3(0.784, 0.831, 0.941);
uniform vec3 star_color : source_color = vec3(1.0, 0.84, 0.42);
uniform float period = 3.4;
// Raios da órbita no quadrado do selo (−1 a 1).
uniform float rx = 0.56;
uniform float ry = 0.22;
// Força (para aparecer e sumir), deslocamento no plano da tela (o offset do selo) e a fase de cada carta.
instance uniform float alpha = 1.0;
instance uniform vec2 center = vec2(0.0);
instance uniform float phase = 0.0;

void vertex() {
	vec3 scale = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	VERTEX = (VERTEX + vec3(center, 0.0)) * scale;
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

// Estrela de quatro pontas finas de raio r em q (|x|^½ + |y|^½ = 1), com o miolo e um halo curto.
float star(vec2 q, float r, float spin) {
	float c = cos(spin);
	float s = sin(spin);
	q = vec2(c * q.x - s * q.y, s * q.x + c * q.y) / r;
	float a = sqrt(abs(q.x)) + sqrt(abs(q.y));
	float body = smoothstep(1.0, 0.7, a);
	float halo = exp(-dot(q, q) * 5.0) * 0.45;
	return clamp(body + halo, 0.0, 1.0);
}

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float t = TIME / period * 6.2831853 + phase;
	// O rastro tracejado da órbita, bem fraco, andando junto.
	vec2 e = vec2(p.x / rx, p.y / ry);
	float r = length(e);
	float dash = step(0.5, fract((atan(e.y, e.x) + t) / 6.2831853 * 12.0));
	float ring = smoothstep(0.09, 0.0, abs(r - 1.0) * ry * 4.0) * dash * 0.3;
	vec4 color = vec4(ring_color, ring);
	float sizes[3] = float[3](0.34, 0.26, 0.22);
	for (int i = 0; i < 3; i++) {
		float a = -1.5708 + float(i) * 2.0944 + t;
		// Na frente (embaixo, na tela) maiores e mais fortes; atrás, menores e apagadas: a órbita tem profundidade.
		float depth = sin(a) * 0.5 + 0.5;
		vec2 at = vec2(cos(a) * rx, sin(a) * ry);
		float k = star(p - at, sizes[i] * (0.7 + 0.4 * depth), t * 0.6 + float(i));
		float strength = k * (0.5 + 0.5 * depth);
		color.rgb = mix(color.rgb, mix(star_color, vec3(1.0), k * k * 0.35), strength);
		color.a = max(color.a, strength);
	}
	ALBEDO = color.rgb;
	ALPHA = color.a * alpha;
}
