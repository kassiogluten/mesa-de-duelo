// Tampo da mesa: feltro com fibras, trama fina e relevo, brilho de tecido na luz rasante, centro mais claro que as bordas,
// a poça de luz do lado de quem joga o turno e o filete dourado da sua metade.
shader_type spatial;

uniform vec3 center_color : source_color = vec3(0.118, 0.155, 0.27);
uniform vec3 edge_color : source_color = vec3(0.018, 0.022, 0.048);
uniform vec3 frame_color : source_color = vec3(0.9, 0.72, 0.4);
uniform vec2 size = vec2(30.0, 18.0);
// Sua metade: z de onde começa a onde termina e meia largura (unidades da mesa).
uniform vec3 my_half = vec3(0.2, 2.75, 6.6);
// A poça de luz de quem joga o turno: centro (x, z) e meia largura e meia profundidade; a força vai de 0 a 1
// (TableEnvironment a move devagar de um lado para o outro).
uniform vec4 pool = vec4(0.0, 1.6, 4.4, 1.4);
uniform float pool_strength : hint_range(0.0, 1.0) = 0.0;
uniform vec3 pool_color : source_color = vec3(1.0, 0.86, 0.66);
// O feltro já calculado (table/felt_bake.gd): R o feltro, G e B a variação para x e para z (+0,5). Enquanto ele não
// chega (e sem placa de vídeo, nos testes), o tampo calcula o feltro a cada pixel, como a textura foi feita.
uniform sampler2D felt_map : filter_linear_mipmap, repeat_disable;
uniform bool felt_baked = false;

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

#include "res://table/felt.gdshaderinc"

// A trama miúda, só de perto: sarja (fios na diagonal) ondulada por ruído e um pelo fino por cima, de -0,5 a 0,5.
float weave(vec2 p) {
	vec2 q = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8)) * p;
	float twill = sin(q.x * 70.0 + noise(q * vec2(3.0, 11.0)) * 2.5) * 0.5 + 0.5;
	float fuzz = noise(q * vec2(40.0, 140.0));
	return twill * 0.6 + fuzz * 0.4 - 0.5;
}

void fragment() {
	vec2 p = (UV - 0.5) * size;
	// Quanto do tampo cabe num pixel: perto da câmera, a trama aparece; longe, só as fibras largas.
	float footprint = length(fwidth(p));
	float fine = 1.0 - smoothstep(0.004, 0.012, footprint);
	float r = length(p * vec2(0.085, 0.13));
	vec3 color = mix(center_color, edge_color, smoothstep(0.1, 1.05, r));
	// Relevo do feltro: a normal segue a variação das fibras (a luz rasante revela a trama).
	float e = FELT_STEP;
	float f;
	float fx;
	float fz;
	if (felt_baked) {
		vec3 baked = texture(felt_map, UV).rgb;
		f = baked.r;
		fx = baked.g - 0.5;
		fz = baked.b - 0.5;
	} else {
		f = felt(p);
		fx = felt(p + vec2(e, 0.0)) - f;
		fz = felt(p + vec2(0.0, e)) - f;
	}
	float w = fine > 0.0 ? weave(p) * fine : 0.0;
	color *= 0.94 + 0.12 * f + 0.07 * w;
	// O relevo da trama sai das derivadas da tela (ela só aparece de perto, onde cada fio ocupa vários pixels).
	vec2 dpx = dFdx(p);
	vec2 dpy = dFdy(p);
	float det = dpx.x * dpy.y - dpx.y * dpy.x;
	vec2 wgrad = abs(det) > 1e-9 ? vec2(dFdx(w) * dpy.y - dFdy(w) * dpx.y, dFdy(w) * dpx.x - dFdx(w) * dpy.x) / det : vec2(0.0);
	vec2 slope = vec2(fx, fz) * (2.6 / e) * 0.02 + wgrad * 0.005;
	NORMAL_MAP = normalize(vec3(-slope.x, -slope.y, 1.0)) * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 0.55;
	// A poça de luz de quem joga o turno: um retângulo bem macio, só um pouco mais claro e quente.
	float pd = box(p - pool.xy, pool.zw, 0.9);
	float lit = pool_strength * (1.0 - smoothstep(-0.9, 1.3, pd));
	color = mix(color, color * 1.24 + pool_color * 0.003, lit);
	// Sua metade: o miolo um pouco mais claro, com um degrau de luz junto ao filete (como um rebaixo no tampo).
	vec2 center = vec2(0.0, (my_half.x + my_half.y) * 0.5);
	vec2 half_size = vec2(my_half.z, (my_half.y - my_half.x) * 0.5);
	float d = box(p - center, half_size, 0.35);
	float inside = smoothstep(0.02, -0.02, d);
	color = mix(color, color * 1.12 + vec3(0.006, 0.008, 0.014), inside);
	color *= 1.0 + 0.1 * smoothstep(-0.22, -0.03, d) * inside;
	// O filete: um fio dourado fino, um fio mais fraco por dentro e os cantos um pouco mais marcados.
	vec2 corner = abs(p - center) - half_size + 0.35;
	float near_corner = smoothstep(-1.1, 0.0, min(corner.x, corner.y));
	float px = max(footprint, 0.004);
	float outer = 1.0 - smoothstep(0.0, 0.012 + near_corner * 0.008 + px, abs(d));
	float inner = (1.0 - smoothstep(0.0, 0.004 + px, abs(d + 0.075))) * 0.45;
	float frame = clamp(outer + inner, 0.0, 1.0);
	float halo = exp(-abs(d) / 0.06) * (0.6 + 0.4 * near_corner);
	color = mix(color, frame_color * 0.55, frame * 0.8);
	ALBEDO = color;
	EMISSION = frame_color * (frame * 0.12 + halo * 0.03) + pool_color * lit * 0.002;
	ROUGHNESS = 0.92 - frame * 0.45;
	SPECULAR = 0.18 + frame * 0.32;
	METALLIC = frame * 0.65;
	// Brilho de tecido: o pelo do feltro acende de leve quando a luz vem de lado.
	RIM = 0.14 * (1.0 - frame);
	RIM_TINT = 0.25;
}
