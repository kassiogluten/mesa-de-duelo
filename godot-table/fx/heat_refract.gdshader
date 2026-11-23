// O ar entortando no muro da onda do limpa-campo: o que está atrás aparece deslocado, mais perto do tampo e de lado.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
uniform float strength = 0.0;

void fragment() {
	// UV.y 0 no alto do muro, 1 no tampo.
	float fall = pow(UV.y, 1.4);
	float side = 1.0 - abs(dot(NORMAL, VIEW));
	float ripple = 0.75 + 0.25 * sin(UV.y * 40.0 - TIME * 18.0 + UV.x * 60.0);
	vec2 offset = NORMAL.xy * strength * fall * (0.35 + side) * ripple;
	ALBEDO = textureLod(screen, SCREEN_UV + offset, 0.0).rgb;
	ALPHA = clamp(fall * 1.6, 0.0, 1.0) * step(0.0001, strength);
}
