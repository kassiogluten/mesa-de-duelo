// Tampo da mesa: feltro com fibras e relevo, centro mais claro que as bordas, um selo arcano bem fraco no meio e a moldura dourada da sua metade.
shader_type spatial;

uniform vec3 center_color : source_color = vec3(0.13, 0.17, 0.29);
uniform vec3 edge_color : source_color = vec3(0.022, 0.027, 0.055);
uniform vec3 frame_color : source_color = vec3(0.94, 0.72, 0.29);
uniform vec2 size = vec2(30.0, 18.0);
// Sua metade: z de onde começa a onde termina e meia largura (unidades da mesa).
uniform vec3 my_half = vec3(0.2, 2.75, 6.6);
// Quanto o selo do meio aparece (0 some).
uniform float seal = 1.0;

float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 3; i++) {
		v += a * noise(p);
		p = p * 2.03 + vec2(1.7, 9.2);
		a *= 0.5;
	}
	return v;
}

// O feltro: fibras finas esticadas em dois sentidos e manchas largas e suaves.
float felt(vec2 p) {
	float fibers = noise(p * vec2(19.0, 5.0)) * 0.5 + noise(p * vec2(5.0, 21.0)) * 0.5;
	return fibers * 0.6 + fbm(p * 0.7) * 0.4;
}

// O selo do meio: dois anéis finos e runas em volta, quase sumindo no feltro.
float arcane(vec2 p) {
	float r = length(p);
	float rings = smoothstep(0.025, 0.0, abs(r - 1.55)) + smoothstep(0.018, 0.0, abs(r - 1.32)) * 0.8;
	float a = atan(p.y, p.x);
	float ticks = step(0.5, fract(a * 24.0 / 6.2831)) * smoothstep(0.06, 0.0, abs(r - 1.44)) * 0.5;
	float star = 0.0;
	for (int i = 0; i < 3; i++) {
		float ang = float(i) * 2.0944;
		vec2 n = vec2(cos(ang), sin(ang));
		star += smoothstep(0.016, 0.0, abs(dot(p, n) - 0.66)) * step(r, 1.32);
		star += smoothstep(0.016, 0.0, abs(dot(p, -n) - 0.66)) * step(r, 1.32);
	}
	return clamp(rings + ticks + star * 0.6, 0.0, 1.0);
}

void fragment() {
	vec2 p = (UV - 0.5) * size;
	float r = length(p * vec2(0.085, 0.13));
	vec3 color = mix(center_color, edge_color, smoothstep(0.1, 1.05, r));
	float f = felt(p);
	color *= 0.95 + 0.1 * f;
	// Relevo do feltro: a normal segue a variação das fibras (a luz rasante revela a trama).
	float e = 0.02;
	float fx = felt(p + vec2(e, 0.0)) - f;
	float fz = felt(p + vec2(0.0, e)) - f;
	NORMAL_MAP = normalize(vec3(-fx * 3.0, -fz * 3.0, 1.0)) * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 0.5;
	// Selo arcano no meio da mesa, entre os dois campos.
	float mark = arcane((p - vec2(0.0, 0.0)) * 1.0) * seal;
	color = mix(color, color * 1.35 + vec3(0.012, 0.016, 0.03), mark * 0.55);
	// Moldura da sua metade: fundo um pouco mais claro e borda dourada dupla, com um brilho fraco.
	vec2 center = vec2(0.0, (my_half.x + my_half.y) * 0.5);
	float d = box(p - center, vec2(my_half.z, (my_half.y - my_half.x) * 0.5), 0.35);
	color = mix(color, color * 1.16 + vec3(0.008, 0.01, 0.018), smoothstep(0.02, -0.02, d));
	float outer = smoothstep(0.03, 0.0, abs(d));
	float inner = smoothstep(0.014, 0.0, abs(d + 0.09));
	float halo = smoothstep(0.35, 0.0, abs(d)) * 0.12;
	float frame = outer + inner * 0.6;
	color = mix(color, frame_color * 0.6, clamp(frame, 0.0, 1.0) * 0.75);
	ALBEDO = color;
	EMISSION = frame_color * (frame * 0.16 + halo * 0.18);
	ROUGHNESS = 0.9 - frame * 0.4;
	SPECULAR = 0.2 + frame * 0.3;
	METALLIC = frame * 0.6;
}
