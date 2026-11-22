// Tampo da mesa: centro mais claro que as bordas, trama fina e a moldura dourada da sua metade, como na mesa do navegador.
shader_type spatial;

uniform vec3 center_color : source_color = vec3(0.13, 0.17, 0.29);
uniform vec3 edge_color : source_color = vec3(0.025, 0.03, 0.06);
uniform vec3 frame_color : source_color = vec3(0.94, 0.72, 0.29);
uniform vec2 size = vec2(30.0, 18.0);
// Sua metade: z de onde começa a onde termina e meia largura (unidades da mesa).
uniform vec3 my_half = vec3(0.2, 2.75, 6.6);

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = (UV - 0.5) * size;
	float r = length(p * vec2(0.085, 0.13));
	vec3 color = mix(center_color, edge_color, smoothstep(0.15, 1.05, r));
	// Trama de losangos bem fraca.
	vec2 g = abs(fract(vec2(p.x + p.y, p.x - p.y) * 0.9) - 0.5);
	color *= 0.97 + 0.03 * smoothstep(0.45, 0.5, max(g.x, g.y));
	// Moldura da sua metade: fundo um pouco mais claro e borda dourada fina.
	vec2 center = vec2(0.0, (my_half.x + my_half.y) * 0.5);
	float d = box(p - center, vec2(my_half.z, (my_half.y - my_half.x) * 0.5), 0.35);
	color = mix(color, color * 1.18 + vec3(0.01, 0.012, 0.02), smoothstep(0.02, -0.02, d));
	float frame = smoothstep(0.035, 0.0, abs(d));
	color = mix(color, frame_color * 0.55, frame * 0.7);
	ALBEDO = color;
	EMISSION = frame_color * frame * 0.12;
	ROUGHNESS = 0.92;
	SPECULAR = 0.15;
}
