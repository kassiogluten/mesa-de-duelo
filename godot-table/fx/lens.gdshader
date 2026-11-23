// A lente da lupa da Pista: aumenta o que está atrás dela (a carta), com a borda azulada e um reflexo de vidro.
shader_type spatial;
render_mode unshaded, blend_mix, cull_back, depth_draw_always, shadows_disabled, fog_disabled;

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
// O raio da lente (o da malha) e quanto ela aumenta.
uniform float radius = 0.175;
uniform float power = 1.0;

varying vec2 local;

void vertex() {
	local = VERTEX.xz / radius;
}

void fragment() {
	float r = clamp(length(local), 0.0, 1.0);
	vec3 bulge = normalize(vec3(local.x, sqrt(max(1.0 - r * r, 0.0)) + 0.35, local.y));
	vec3 n = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(bulge, 0.0)).xyz);
	vec2 offset = -n.xy * 0.035 * power;
	vec3 seen = textureLod(screen, SCREEN_UV + offset, 0.0).rgb;
	float fresnel = pow(1.0 - abs(dot(n, VIEW)), 2.0);
	float glint = pow(max(dot(reflect(-VIEW, n), normalize(vec3(-0.4, 0.75, 0.55))), 0.0), 36.0);
	ALBEDO = seen * vec3(0.95, 1.02, 1.08) * 1.06 + vec3(0.55, 0.82, 1.0) * fresnel * 0.7 + vec3(glint * 3.0);
	ALPHA = 1.0;
}
