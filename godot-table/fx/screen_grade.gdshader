// A tela inteira tirando a cor e escurecendo pelas bordas (a derrota): lê o que já foi desenhado e devolve em cinza.
shader_type spatial;
render_mode unshaded, depth_draw_never, depth_test_disabled, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
// 0: cores normais, 1: tudo em cinza.
uniform float gray = 0.0;
// Quanto escurece (mais nas bordas).
uniform float dark = 0.0;
// A cor do cinza (um pouco fria na derrota).
uniform vec3 tint : source_color = vec3(1.0);

void vertex() {
	POSITION = vec4(VERTEX.xy * 2.0, 0.0, 1.0);
}

void fragment() {
	vec3 c = textureLod(screen, SCREEN_UV, 0.0).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	vec3 graded = mix(c, vec3(l) * tint, gray);
	float edge = smoothstep(0.25, 0.95, distance(SCREEN_UV, vec2(0.5)) * 1.45);
	graded *= 1.0 - dark * (0.4 + 0.6 * edge);
	ALBEDO = graded;
	ALPHA = 1.0;
}
