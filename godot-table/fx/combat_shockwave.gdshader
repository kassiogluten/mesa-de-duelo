// Onda de choque do golpe: um anel de frente para a câmera que entorta a imagem da mesa atrás dele (lê a tela), com um
// leve desvio de cor na frente da onda.
shader_type spatial;
render_mode unshaded, blend_mix, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled;

uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap, repeat_disable;
// 0 a 1: o raio da onda (em fração do quadrado) e quanto ela já se apagou.
uniform float progress = 0.0;
// Quanto a imagem entorta (em fração da tela) e a largura da frente.
uniform float strength = 0.035;
uniform float width = 0.16;
uniform vec4 tint : source_color = vec4(1.0, 0.6, 0.35, 1.0);

void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}

void fragment() {
	vec2 c = UV - 0.5;
	float r = length(c) * 2.0;
	if (r > 1.0) {
		discard;
	}
	float ring = progress * 0.92 + 0.04;
	float band = 1.0 - smoothstep(0.0, width, abs(r - ring));
	float fade = (1.0 - progress) * (1.0 - progress);
	float k = band * fade;
	if (k < 0.002) {
		discard;
	}
	vec2 dir = c / max(r * 0.5, 0.0001);
	// Do lado de dentro da frente a imagem é empurrada para fora, do lado de fora puxada (a lente da onda).
	float side = sign(r - ring);
	vec2 off = vec2(dir.x, -dir.y) * k * strength * (0.6 + 0.4 * side);
	float red = textureLod(screen_texture, SCREEN_UV - off * 1.35, 0.0).r;
	float green = textureLod(screen_texture, SCREEN_UV - off, 0.0).g;
	float blue = textureLod(screen_texture, SCREEN_UV - off * 0.65, 0.0).b;
	ALBEDO = vec3(red, green, blue) + tint.rgb * k * 0.18;
	ALPHA = clamp(k * 3.0, 0.0, 1.0);
}
