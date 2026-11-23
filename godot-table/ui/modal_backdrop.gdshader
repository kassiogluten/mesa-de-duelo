// Fundo das janelas: a mesa de verdade atrás, desfocada, menos saturada e escurecida numa vinheta (mais escura nas bordas).
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
// 0: a mesa como está; 1: desfocada e escura por inteiro (a entrada e a saída animam daqui).
uniform float amount : hint_range(0.0, 1.0) = 1.0;
// Quanto desfoca (nível de mipmap) e quanto escurece no centro e nas bordas.
uniform float blur = 2.4;
uniform float dim_center = 0.5;
uniform float dim_edge = 0.9;

void fragment() {
	float lod = blur * amount;
	vec2 step_px = SCREEN_PIXEL_SIZE * exp2(lod) * 0.8;
	vec3 c = textureLod(screen_tex, SCREEN_UV, lod).rgb * 0.36;
	c += textureLod(screen_tex, SCREEN_UV + vec2(step_px.x, step_px.y), lod).rgb * 0.16;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-step_px.x, step_px.y), lod).rgb * 0.16;
	c += textureLod(screen_tex, SCREEN_UV + vec2(step_px.x, -step_px.y), lod).rgb * 0.16;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-step_px.x, -step_px.y), lod).rgb * 0.16;
	float gray = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(c, vec3(gray), 0.25 * amount);
	vec2 d = (UV - vec2(0.5, 0.46)) / vec2(0.75, 0.7);
	float v = smoothstep(0.0, 1.0, length(d));
	vec3 tint = mix(vec3(0.04, 0.07, 0.13), vec3(0.008, 0.016, 0.04), v);
	c = mix(c, tint, mix(dim_center, dim_edge, v) * amount);
	COLOR = vec4(c, 1.0);
}
