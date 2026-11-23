// Estrelinha de quatro pontas (ou brilho macio) de frente para a câmera, somando luz: as do enjoo, o brilho dos selos.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

// Cor e força (a), giro da estrela, deslocamento no plano da tela (como o offset dos selos) e a forma: 0 estrela, 1 brilho.
instance uniform vec4 tint : source_color = vec4(1.0, 0.84, 0.42, 1.0);
instance uniform float spin = 0.0;
instance uniform vec2 center = vec2(0.0);
instance uniform float shape = 0.0;

void vertex() {
	// De frente para a câmera mantendo a escala do nó (como os selos): o deslocamento anda no plano da tela.
	vec3 scale = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	VERTEX = (VERTEX + vec3(center, 0.0)) * scale;
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float c = cos(spin);
	float s = sin(spin);
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
	float light;
	if (shape < 0.5) {
		// |x|^½ + |y|^½ = 1: a estrela de quatro pontas finas; o miolo mais claro e um halo curto.
		float a = sqrt(abs(p.x)) + sqrt(abs(p.y));
		float body = smoothstep(1.0, 0.7, a);
		float core = smoothstep(0.55, 0.0, length(p));
		float halo = exp(-dot(p, p) * 7.0) * 0.35;
		light = body * 0.9 + core * 0.6 + halo;
	} else {
		light = exp(-dot(p, p) * 3.2) * smoothstep(1.0, 0.7, length(p));
	}
	vec3 rgb = mix(tint.rgb, vec3(1.0), clamp(light - 0.9, 0.0, 0.6));
	ALBEDO = rgb * light * tint.a;
	ALPHA = clamp(light * tint.a, 0.0, 1.0);
}
