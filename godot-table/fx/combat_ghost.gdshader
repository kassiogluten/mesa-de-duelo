// Imagem fantasma do golpe: a face da carta, tingida e translúcida, que fica para trás no caminho do avanço e some.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform sampler2D front_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform bool has_front = false;
uniform vec4 tint : source_color = vec4(1.0, 0.45, 0.25, 1.0);
uniform float alpha = 0.5;

const vec2 SIZE = vec2(0.63, 0.88);
const float CORNER = 0.035;

void fragment() {
	vec2 p = (UV - 0.5) * SIZE;
	vec2 q = abs(p) - (SIZE * 0.5 - vec2(CORNER));
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - CORNER;
	float inside = smoothstep(0.004, -0.004, d);
	float rim = smoothstep(-0.03, 0.0, d) * inside;
	vec3 face = has_front ? texture(front_tex, UV).rgb : vec3(0.35);
	ALBEDO = face * tint.rgb * 1.1 + tint.rgb * rim * 2.0;
	ALPHA = inside * alpha;
}
