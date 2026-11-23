// A carta que morre em combate se despedaça: cada caco (um triângulo da face, com a imagem da carta) voa para longe do
// golpe, gira, cai no tampo, fica deitado e se desfaz. O movimento todo é calculado aqui, na placa (um desenho só).
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;

uniform sampler2D front_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform bool has_front = false;
uniform vec3 sleeve_color : source_color = vec3(0.42, 0.24, 0.12);
// Segundos desde o golpe.
uniform float t = 0.0;
// De onde veio o golpe (no espaço da carta, no plano dela) e para onde ele empurra.
uniform vec2 impact = vec2(0.0);
uniform vec3 push = vec3(0.0, 0.0, -1.0);
uniform float power = 1.0;
// Altura do tampo no espaço da carta.
uniform float floor_y = -0.02;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.2, 1.0);
// 0 a 1: quanto dos cacos já se desfez.
uniform float fade = 0.0;

const float GRAVITY = 7.5;

varying float v_seed;
// 1 quando a face do caco (a frente da carta) está virada para a câmera; 0 quando se vê o verso.
varying float v_front;

vec3 rotate(vec3 v, vec3 axis, float a) {
	return v * cos(a) + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - cos(a));
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	vec3 c = vec3(CUSTOM0.x, 0.0, CUSTOM0.y);
	float s1 = CUSTOM0.z;
	float s2 = CUSTOM0.w;
	v_seed = s1 * 13.0 + s2 * 7.0;
	vec2 away2 = c.xz - impact;
	float dist = length(away2);
	vec3 away = vec3(away2.x, 0.0, away2.y) / max(dist, 0.001);
	// Os cacos perto do golpe saem mais rápido.
	float near = exp(-dist * 2.5);
	vec3 vel = (away * (0.45 + s1 * 1.0) + push * (0.7 + s2 * 1.2)) * power * (0.55 + near * 0.9);
	vel.y = (0.9 + s2 * 1.3) * power;
	// Quando o caco chega no tampo (c.y = 0): vy t - g t²/2 = floor_y.
	float land = (vel.y + sqrt(vel.y * vel.y + 2.0 * GRAVITY * max(-floor_y, 0.0))) / GRAVITY;
	float air = min(t, land);
	float ground = max(t - land, 0.0);
	vec3 pos = c + vel * air + vec3(0.0, -0.5 * GRAVITY * air * air, 0.0);
	// No chão ainda escorrega um pouco e para.
	pos.xz += vel.xz * (1.0 - exp(-ground * 7.0)) * 0.1;
	pos.y = t > land ? floor_y + 0.003 * s1 : pos.y;
	vec3 axis = normalize(vec3(s1 - 0.5, 0.0, s2 - 0.5) + vec3(0.0001, 0.0, 0.0));
	float spin_air = (7.0 + s1 * 11.0) * air;
	// Ao pousar, gira até ficar deitado (de face ou de verso).
	float spin = mix(spin_air, round(spin_air / PI) * PI, 1.0 - exp(-ground * 18.0));
	float yaw = (s2 - 0.5) * 7.0 * air;
	vec3 v = rotate(rotate(VERTEX - c, axis, spin), vec3(0.0, 1.0, 0.0), yaw);
	VERTEX = pos + v;
	NORMAL = rotate(rotate(NORMAL, axis, spin), vec3(0.0, 1.0, 0.0), yaw);
	// O lado que a câmera vê, pela normal do caco (não pela ordem dos vértices).
	vec3 n_world = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
	vec3 p_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_front = dot(n_world, CAMERA_POSITION_WORLD - p_world) > 0.0 ? 1.0 : 0.0;
}

void fragment() {
	float n = hash(floor(UV * 48.0) + v_seed);
	if (n < fade) {
		discard;
	}
	vec3 face = has_front ? texture(front_tex, UV).rgb : sleeve_color;
	face = v_front > 0.5 ? face : sleeve_color * 0.75;
	// Perto da borda do caco (a vertex color é a coordenada baricêntrica), a quebra em brasa que esfria.
	float e = min(min(COLOR.r, COLOR.g), COLOR.b);
	float edge = smoothstep(0.035, 0.0, e);
	float hot = exp(-t * 2.6);
	ALBEDO = face;
	ROUGHNESS = 0.58;
	SPECULAR = 0.3;
	// Um pouco da própria face acesa (a carta na mesa tem verniz e fica clara), a brasa na quebra e um clarão no estalo.
	EMISSION = face * 0.28 + edge_color.rgb * (edge * hot * 2.6 + step(t, 0.06) * 0.6);
}
