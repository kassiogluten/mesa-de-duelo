// O feltro do tampo (fibras cruzadas e manchas largas), comum ao tampo (table_top.gdshader) e à textura que guarda o
// feltro pronto (felt_bake.gdshader, table/felt_bake.gd): as duas contas precisam dar o mesmo desenho.

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

// O feltro: fibras esticadas em dois sentidos cruzados na diagonal (sem alinhar com a grade do ruído, que daria
// manchas retangulares) e manchas largas.
float felt(vec2 p) {
	vec2 a = mat2(vec2(0.82, 0.57), vec2(-0.57, 0.82)) * p;
	vec2 b = mat2(vec2(0.57, -0.82), vec2(0.82, 0.57)) * p;
	float fibers = noise(a * vec2(21.0, 5.5) + 3.1) * 0.5 + noise(b * vec2(21.0, 5.5) + 7.7) * 0.5;
	return fibers * 0.6 + fbm(p * 0.7) * 0.4;
}

// Passo do relevo do feltro (unidades da mesa): a inclinação sai da diferença entre dois pontos a essa distância.
const float FELT_STEP = 0.02;
