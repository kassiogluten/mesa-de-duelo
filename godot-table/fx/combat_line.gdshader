// Linha de energia entre o bloqueador e o atacante: núcleo branco, borda na cor, pulsos correndo e estalos ao longo dela.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec4 color : source_color = vec4(0.45, 0.75, 1.0, 1.0);
uniform float alpha = 1.0;

float hash(float x) {
	return fract(sin(x * 91.3458) * 47453.5453);
}

void fragment() {
	float across = 1.0 - abs(UV.y - 0.5) * 2.0;
	float core = pow(across, 6.0);
	float halo = pow(across, 1.6);
	// Pulsos que correm do bloqueador para o atacante e estalos curtos.
	float run = 0.5 + 0.5 * sin(UV.x * 26.0 - TIME * 22.0);
	float crack = step(0.82, hash(floor(UV.x * 18.0) + floor(TIME * 24.0)));
	float ends = smoothstep(0.0, 0.06, UV.x) * smoothstep(1.0, 0.94, UV.x);
	ALBEDO = mix(color.rgb, vec3(1.0), core) * (1.6 + crack * 1.5);
	ALPHA = clamp(halo * (0.35 + 0.35 * run) + core * 0.9 + crack * halo * 0.5, 0.0, 1.0) * ends * alpha;
}
