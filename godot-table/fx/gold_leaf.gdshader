// Folha que cai girando (ouro da vitória, cinza da derrota, cacos da cúpula do ward): cada partícula vira em 3D no seu eixo e reluz quando fica de frente para a câmera.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

// Quanto a folha reluz ao virar de frente (ouro: forte; cinza: quase nada).
uniform float shine = 1.0;
// Fração das folhas que são brasa (brilham laranja sozinhas) e a força do brilho delas.
uniform float embers = 0.0;
uniform float glow = 0.0;
// Voltas por segundo.
uniform float spin = 5.0;

varying float facing;
varying float ember;

mat3 rotation(vec3 a, float t) {
	float c = cos(t);
	float s = sin(t);
	float k = 1.0 - c;
	return mat3(vec3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s),
		vec3(a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s),
		vec3(a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k));
}

void vertex() {
	float id = float(INSTANCE_ID);
	vec3 axis = normalize(vec3(sin(id * 12.9898), cos(id * 78.233), sin(id * 37.719)) + vec3(0.0, 0.0, 0.05));
	float angle = TIME * spin * (0.5 + fract(id * 0.618)) + id * 1.7;
	mat3 r = rotation(axis, angle);
	VERTEX = r * VERTEX;
	vec3 n = normalize((MODELVIEW_MATRIX * vec4(r * vec3(0.0, 0.0, 1.0), 0.0)).xyz);
	facing = abs(n.z);
	ember = step(1.0 - embers, fract(id * 0.371 + 0.13));
}

void fragment() {
	float flash = pow(facing, 12.0) * shine;
	vec3 base = COLOR.rgb * (0.5 + 0.65 * facing);
	vec3 hot = vec3(1.0, 0.42, 0.1) * ember * glow * (0.6 + 0.4 * sin(TIME * 9.0 + facing * 6.0));
	ALBEDO = base + mix(COLOR.rgb, vec3(1.0), 0.4) * flash * 2.6 + hot * 2.5;
	ALPHA = clamp(COLOR.a * (1.0 + flash), 0.0, 1.0);
}
