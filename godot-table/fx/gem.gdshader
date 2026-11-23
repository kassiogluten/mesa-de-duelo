// A gema do Game Changer: facetas planas que refratam a mesa atrás, borda acesa (fresnel) e reflexos que dançam de faceta em faceta.
shader_type spatial;
render_mode blend_mix, cull_back, depth_draw_always, specular_schlick_ggx;

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
uniform vec4 color : source_color = vec4(0.35, 1.0, 0.82, 1.0);
uniform float energy = 1.0;

void fragment() {
	vec3 n = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	n = dot(n, VIEW) < 0.0 ? -n : n;
	float facing = clamp(dot(n, VIEW), 0.0, 1.0);
	float fresnel = pow(1.0 - facing, 3.0);
	vec3 behind = textureLod(screen, SCREEN_UV - n.xy * 0.07, 0.0).rgb;
	vec3 light = normalize(vec3(sin(TIME * 2.3), 0.7, cos(TIME * 2.3)));
	float sparkle = pow(max(dot(reflect(-VIEW, n), light), 0.0), 50.0);
	float facet = 0.5 + 0.5 * sin(dot(n, vec3(7.0, 11.0, 5.0)) * 3.0 + TIME * 2.5);
	ALBEDO = behind * color.rgb * 0.85;
	EMISSION = color.rgb * (0.12 + facet * 0.38 + fresnel * 1.3) * energy + vec3(sparkle * 2.2 * energy);
	NORMAL = n;
	ROUGHNESS = 0.04;
	SPECULAR = 1.0;
	ALPHA = 0.94;
}
