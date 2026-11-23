// Seta de energia (alvo, ataque, bloqueio): feixe com núcleo claro e brilho em volta, pulsos correndo para a ponta e a ponta com entalhe.
shader_type spatial;
render_mode unshaded, blend_add, depth_test_disabled, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform float time = 0.0;

// UV.x: ao longo (0 na origem, 1 na ponta); UV.y: atravessado (0 a 1, 0,5 no meio).
// UV2.x: 0 no corpo, 1 na ponta; UV2.y: 1 na seta viva (a que segue o mouse).

// Chevron (›) que corre para a ponta: 1 no traço, 0 no vão, com bordas macias.
float chevrons(float u, float v, float speed, float count) {
	float s = fract(u * count - abs(v) * 0.9 - time * speed);
	return smoothstep(0.0, 0.12, s) * smoothstep(0.42, 0.24, s);
}

void fragment() {
	float u = UV.x;
	float v = UV.y * 2.0 - 1.0;
	bool live = UV2.y > 0.5;
	vec3 tint = COLOR.rgb;
	vec3 light = vec3(0.0);
	if (UV2.x < 0.5) {
		// Corpo: núcleo fino e quase branco, brilho largo e macio na cor.
		float core = exp(-v * v / 0.018);
		float glow = exp(-v * v / 0.32);
		float energy;
		if (live) {
			energy = 0.5 + 0.8 * chevrons(u, v, 1.5, 5.0);
		} else {
			// Uma luz que passa devagar da origem para a ponta.
			float sweep = exp(-pow((fract(u - time * 0.45) - 0.5) / 0.07, 2.0));
			energy = 0.7 + 0.6 * sweep;
		}
		// Nasce da carta aos poucos e chega cheia na ponta.
		float grow = smoothstep(0.0, 0.18, u) * (0.55 + 0.45 * u);
		light = (tint * glow * 0.7 + mix(tint, vec3(1.0), 0.3) * core * 0.95) * energy * grow;
	} else {
		// Ponta: triângulo com entalhe atrás (u = 0 na base, 1 na ponta), borda macia e brilho em volta.
		float x = u;
		float w = 1.0 - x;
		float d = abs(v) - w;
		float notch = 0.32 * (1.0 - abs(v)) - x;
		float shape = max(d, notch);
		float fill = smoothstep(0.035, -0.02, shape);
		float glow = exp(-max(shape, 0.0) / 0.09) * 0.6;
		float edge = exp(-pow(shape / 0.03, 2.0));
		float beat = live ? 0.85 + 0.15 * sin(time * 6.0) : 1.0;
		light = (tint * (fill * 0.75 + glow * 0.8) + mix(tint, vec3(1.0), 0.4) * edge * 0.75) * beat;
	}
	ALBEDO = light;
	ALPHA = clamp(COLOR.a, 0.0, 1.0);
}
