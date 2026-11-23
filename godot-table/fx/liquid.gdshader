// A gota da ficha de Sangue: líquido que treme, escuro no fundo e vivo na borda por onde a luz atravessa, com verniz.
shader_type spatial;
render_mode cull_back, specular_schlick_ggx;

uniform vec4 color : source_color = vec4(0.55, 0.0, 0.04, 1.0);
uniform float wobble = 1.0;

void vertex() {
	float w = sin(TIME * 13.0 + VERTEX.y * 18.0) * 0.5 + sin(TIME * 9.0 + VERTEX.x * 22.0) * 0.5;
	VERTEX += NORMAL * w * 0.012 * wobble;
}

void fragment() {
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float fresnel = pow(1.0 - facing, 3.0);
	ALBEDO = mix(color.rgb * 1.7, color.rgb * 0.3, pow(facing, 1.4));
	ROUGHNESS = 0.06;
	SPECULAR = 0.6;
	CLEARCOAT = 0.6;
	CLEARCOAT_ROUGHNESS = 0.08;
	EMISSION = color.rgb * (fresnel * 1.3 + 0.1);
}
