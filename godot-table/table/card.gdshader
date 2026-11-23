// Carta na mesa: frente com a imagem e verniz, verso com a cor do jogador, cantos arredondados, brilho de destaque que corre a borda e foil nas raras e míticas.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D front_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform bool has_front = false;
uniform vec3 sleeve_color : source_color = vec3(0.42, 0.24, 0.12);
// Destaque: rgb a cor, a a força (pode jogar, alvo, selecionada).
uniform vec4 glow = vec4(0.35, 0.8, 1.0, 0.0);
// Estilo do destaque: 0 a borda que respira com um brilho correndo (alvo, selecionada, atacando); 1 o "pode jogar", com
// filamentos de energia fluindo pela borda, luz entrando por dentro e um brilho que atravessa a face de tempos em tempos.
uniform int glow_style = 0;
// Escurece a carta que não pode ser escolhida no prompt atual.
uniform float dim : hint_range(0.0, 1.0) = 0.0;
// Brilho de passagem de mouse.
uniform float hover : hint_range(0.0, 1.0) = 0.0;
// Queimar (destruída): 0 inteira, 1 consumida; a borda do que queima acende na cor dada.
uniform float dissolve : hint_range(0.0, 1.0) = 0.0;
uniform vec3 dissolve_color : source_color = vec3(1.0, 0.45, 0.12);
// Clarão rápido (dano, entrada): soma luz na carta inteira.
uniform vec4 flash = vec4(1.0, 1.0, 1.0, 0.0);
// Foil: 0 nenhum, 1 rara (um brilho que passa), 2 mítica (arco-íris mais forte). CardDressing liga pela raridade.
uniform float foil : hint_range(0.0, 2.0) = 0.0;
// Rachaduras (sobreviveu): 0 nenhuma, 1 a carta inteira trincada; a cor acende nas fendas.
uniform float cracks : hint_range(0.0, 1.0) = 0.0;
uniform vec3 crack_color : source_color = vec3(1.0, 0.95, 0.8);

const vec2 SIZE = vec2(0.63, 0.88);
const float CORNER = 0.035;

float card_sdf(vec2 uv) {
	vec2 p = (uv - 0.5) * SIZE;
	vec2 q = abs(p) - (SIZE * 0.5 - vec2(CORNER));
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - CORNER;
}

vec3 card_back(vec2 uv) {
	vec2 p = (uv - 0.5) * SIZE;
	float border = step(card_sdf(uv), -0.03);
	vec3 base = mix(sleeve_color * 0.35, sleeve_color, border);
	// Losango central e um brilho suave no meio.
	float diamond = abs(p.x) / 0.16 + abs(p.y) / 0.22;
	base = mix(base, sleeve_color * 1.8 + 0.1, smoothstep(1.0, 0.94, diamond) * border);
	base = mix(base, base * 0.55, smoothstep(0.62, 0.58, diamond) * smoothstep(0.5, 0.56, diamond));
	base *= 0.85 + 0.25 * (1.0 - length(p) * 1.6);
	return base;
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

vec3 hue(float h) {
	return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// Fendas de Voronoi: perto da borda entre duas células, 1; longe, 0.
float crack_lines(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = vec2(hash(i + g), hash(i + g + 17.3));
			float d = length(g + o - f);
			if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
		}
	}
	return smoothstep(0.07, 0.0, d2 - d1);
}

void fragment() {
	float d = card_sdf(UV);
	// O corte dos cantos é seco (alfa deixaria a carta translúcida e misturaria com a de baixo); o SMAA da tela
	// (project.godot) é quem suaviza essa borda.
	if (d > 0.0) {
		discard;
	}
	float burn = noise(UV * vec2(6.0, 8.4)) * 0.65 + noise(UV * 19.0) * 0.35;
	if (dissolve > 0.0 && burn < dissolve * 1.1 - 0.05) {
		discard;
	}
	vec3 color;
	// Quanto a carta está de frente para quem olha (1 de frente, 0 de lado): o verniz e o foil mudam com o ângulo.
	float facing = abs(dot(NORMAL, VIEW));
	vec3 extra = vec3(0.0);
	if (FRONT_FACING) {
		color = has_front ? texture(front_tex, UV).rgb : vec3(0.18, 0.17, 0.2);
		if (foil > 0.0 && has_front) {
			// Foil: faixas de arco-íris na diagonal que andam com o ângulo da carta e com o tempo, mais fortes nas partes claras.
			float diag = UV.x * 0.8 + UV.y * 1.1;
			float h = diag * 1.4 + (1.0 - facing) * 2.2 + TIME * 0.05;
			float band = 0.5 + 0.5 * sin(diag * 9.0 - TIME * 0.7 + (1.0 - facing) * 8.0);
			float luma = dot(color, vec3(0.299, 0.587, 0.114));
			float sparkle = step(0.985, hash(floor(UV * vec2(90.0, 126.0)) + floor(TIME * 3.0))) * band;
			float k = foil >= 1.5 ? 0.55 : 0.3;
			extra += hue(h) * band * (0.1 + 0.25 * luma) * k + vec3(sparkle) * 0.6 * k;
			// O brilho que passa de tempos em tempos.
			float sweep = smoothstep(0.08, 0.0, abs(fract(TIME * 0.12) * 3.0 - 1.0 - diag * 0.9));
			extra += vec3(1.0, 0.97, 0.9) * sweep * 0.22 * k;
		}
	} else {
		color = card_back(vec2(1.0 - UV.x, UV.y));
	}
	color = mix(color, color * 0.32, dim);
	if (cracks > 0.0) {
		// As rachaduras partem do meio e se espalham; dentro delas a carta escurece e a luz vaza.
		vec2 c = (UV - 0.5) * SIZE;
		float reach = cracks * 0.75;
		float lines = crack_lines(UV * vec2(5.0, 7.0)) * smoothstep(reach, reach - 0.15, length(c));
		color = mix(color, color * 0.25, lines);
		extra += crack_color * lines * 3.0 * cracks;
	}
	ALBEDO = color;
	// Verniz de carta: um pouco brilhante, com uma camada de laca por cima.
	ROUGHNESS = 0.58;
	SPECULAR = 0.28;
	CLEARCOAT = 0.18;
	CLEARCOAT_ROUGHNESS = 0.5;
	vec3 glow_light = vec3(0.0);
	if (glow.a > 0.0) {
		// Destaque: a borda acesa respira, um brilho corre em volta e um véu suave entra um pouco na carta.
		vec2 p = (UV - 0.5) * SIZE;
		float angle = atan(p.y, p.x);
		float run = pow(0.5 + 0.5 * sin(angle - TIME * 2.6), 10.0) + pow(0.5 + 0.5 * sin(angle + 3.14159 - TIME * 2.6), 10.0);
		float breathe = 0.82 + 0.18 * sin(TIME * 3.2);
		float edge_band = smoothstep(-0.034, 0.0, d);
		float veil = smoothstep(-0.08, 0.0, d) * 0.12;
		glow_light = glow.rgb * glow.a * (edge_band * (1.15 * breathe + run * 1.6) + veil);
		if (glow_style == 1) {
			// Pode jogar: energia viva na borda em vez do brilho que corre.
			float s = angle / 6.2831853 + 0.5;
			float n1 = noise(vec2(s * 26.0 - TIME * 1.7, TIME * 0.55));
			float n2 = noise(vec2(s * 57.0 + TIME * 2.6, 3.1 + TIME * 0.8));
			float plasma = smoothstep(0.42, 0.95, n1 * 0.62 + n2 * 0.48);
			float line = exp(-pow(d / 0.0035, 2.0));
			float rim = smoothstep(-0.06, 0.0, d);
			rim *= rim;
			float diag2 = UV.x * 0.6 + UV.y * 0.9;
			float sheen = smoothstep(0.07, 0.0, abs(fract(TIME * 0.26) * 2.6 - 0.8 - diag2));
			vec3 hot = mix(glow.rgb, vec3(1.0), 0.6);
			glow_light = glow.a * (hot * line * 1.6 + glow.rgb * rim * (0.45 + 1.4 * plasma) * breathe
				+ hot * plasma * smoothstep(-0.02, 0.0, d) * 1.4 + vec3(0.9, 0.97, 1.0) * sheen * 0.12);
		}
	}
	EMISSION = glow_light + vec3(hover * 0.06) + dissolve_color * (dissolve > 0.0 ? smoothstep(dissolve * 1.1 + 0.06, dissolve * 1.1 - 0.05, burn) : 0.0) * 4.0 + flash.rgb * flash.a + extra;
}
