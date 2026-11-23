// A cúpula do ward: favos hexagonais com a borda acesa (fresnel), uma faixa que sobe, a onda do golpe que bate e as trincas.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec4 color : source_color = vec4(0.45, 0.78, 1.0, 1.0);
uniform float alpha = 1.0;
// O clarão de quando segura, a onda do golpe (0 a 1, descendo do alto) e as trincas (0 a 1).
uniform float flash = 0.0;
uniform float hit = 0.0;
uniform float cracks = 0.0;

varying vec3 local;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float hex_dist(vec2 p) {
	p = abs(p);
	return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

// x: distância até a borda da célula (0 na borda); zw: o centro da célula (a identidade dela).
vec4 hex_cell(vec2 uv) {
	vec2 r = vec2(1.0, 1.7320508);
	vec2 h = r * 0.5;
	vec2 a = mod(uv, r) - h;
	vec2 b = mod(uv - h, r) - h;
	vec2 g = dot(a, a) < dot(b, b) ? a : b;
	return vec4(0.5 - hex_dist(g), 0.0, uv - g);
}

void vertex() {
	local = VERTEX;
}

void fragment() {
	float rim = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.4);
	vec2 uv = vec2(atan(local.x, local.z) * 2.6, local.y * 5.2);
	vec4 cell = hex_cell(uv);
	float line = smoothstep(0.06, 0.0, cell.x);
	float id = hash(cell.zw);
	float shimmer = 0.55 + 0.45 * sin(TIME * 3.2 + id * 6.2832);
	float band = exp(-pow((local.y - fract(TIME * 0.65)) / 0.06, 2.0));
	float foot = exp(-max(local.y, 0.0) / 0.05);
	float down = acos(clamp(local.y, -1.0, 1.0));
	float ripple = exp(-pow((down - hit * 1.9) / 0.16, 2.0)) * step(0.001, hit) * (1.0 - hit);
	float crack = step(1.0 - cracks * 0.9, id) * step(0.001, cracks) * (0.35 + line);
	vec3 tint = mix(color.rgb, vec3(1.0), clamp(flash * 0.6 + crack * 0.6 + ripple * 0.5, 0.0, 1.0));
	ALBEDO = tint * (1.25 + flash * 2.5 + crack * 1.2 + ripple * 2.0);
	float body = rim * 0.45 + line * (0.32 + 0.6 * rim) * shimmer + band * line * 0.6 + foot * 0.35;
	ALPHA = clamp(body + flash * 0.25 + ripple * (0.35 + line) + crack * 0.55, 0.0, 1.0) * alpha;
}
