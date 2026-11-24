// Carta na mesa: frente com a imagem e verniz acetinado, verso de papel com a cor do jogador, cantos arredondados com o fio
// da borda pegando luz, brilho de destaque que corre a borda e foil nas raras e míticas.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D front_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform bool has_front = false;
uniform vec3 sleeve_color : source_color = vec3(0.42, 0.24, 0.12);
// Destaque: rgb a cor, a a força (pode jogar, alvo, selecionada).
uniform vec4 glow = vec4(0.35, 0.8, 1.0, 0.0);
// Estilo do destaque: 0 a borda que respira com um brilho correndo (alvo, selecionada, atacando); 1 o "pode usar", só um
// fio azul firme na beira da carta, sem nada entrar na face (o halo curto que respira, do lado de fora, é do CardDressing).
uniform int glow_style = 0;
// A carta da sua mão (1): aparece como impressa, sem a luz da cena, reflexo nem brilho; as cores da imagem chegam à tela
// quase iguais (o branco do papel fica logo abaixo do limiar do bloom). Entre 0 e 1 na carta arrastada saindo da mão.
uniform float printed : hint_range(0.0, 1.0) = 0.0;
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
// O tonemap Filmic da mesa (TableEnvironment: tonemap_white 6) e o quanto do branco a carta impressa usa: 0,74 da tela em
// luz linear é o que o Filmic entrega para 1,35, logo abaixo do limiar do bloom (1,4).
const float TONE_WHITE = 6.0;
const float PRINT_PEAK = 0.74;

float card_sdf(vec2 uv) {
	vec2 p = (uv - 0.5) * SIZE;
	vec2 q = abs(p) - (SIZE * 0.5 - vec2(CORNER));
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - CORNER;
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

// O verso: a moldura escura, um filete claro por dentro, o losango com as faces em relevo e um brilho suave no meio.
vec3 card_back(vec2 uv) {
	vec2 p = (uv - 0.5) * SIZE;
	float d = card_sdf(uv);
	float border = smoothstep(-0.028, -0.032, d);
	vec3 base = mix(sleeve_color * 0.35, sleeve_color, border);
	float line = 1.0 - smoothstep(0.0, 0.0025, abs(d + 0.042));
	base = mix(base, sleeve_color * 1.45 + 0.05, line * 0.7);
	float diamond = abs(p.x) / 0.16 + abs(p.y) / 0.22;
	// As quatro faces do losango: a de cima à esquerda mais clara, a de baixo à direita mais escura.
	float facet = 1.0 - 0.07 * (sign(p.x) + sign(p.y));
	base = mix(base, (sleeve_color * 1.8 + 0.1) * facet, smoothstep(1.0, 0.96, diamond) * border);
	base = mix(base, base * 0.55, smoothstep(0.62, 0.58, diamond) * smoothstep(0.5, 0.56, diamond));
	base *= 0.85 + 0.25 * (1.0 - length(p) * 1.6);
	return base;
}

// Papel: o grão das fibras e a textura de linho do cartão (o verso não é plástico). `fine` (de 0 a 1) apaga o linho
// quando ele fica menor que um pixel, para não cintilar com a carta longe.
float paper(vec2 uv, float fine) {
	vec2 q = uv * vec2(230.0, 320.0);
	float linen = (sin(q.x) * 0.5 + 0.5) * 0.5 + (sin(q.y * 1.02) * 0.5 + 0.5) * 0.5;
	return mix(0.5, linen, fine) * 0.55 + noise(uv * vec2(46.0, 64.0)) * 0.45;
}

// O fio da borda: a direção para fora da carta (no plano dela) e quanto o canto chanfrado inclina ali (0 no miolo).
vec3 bevel(vec2 uv) {
	vec2 p = (uv - 0.5) * SIZE;
	vec2 q = abs(p) - (SIZE * 0.5 - vec2(CORNER));
	vec2 out_dir = q.x > 0.0 && q.y > 0.0 ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
	out_dir *= sign(p);
	float slope = smoothstep(-0.005, 0.0, card_sdf(uv));
	return vec3(out_dir, slope);
}

// O Filmic do Godot ao contrário: a luz que, depois do tonemap, aparece na tela como `y` (linear, de 0 a ~1).
vec3 untonemap(vec3 y) {
	const float FA = 0.88;
	const float FB = 0.6;
	const float FC = 0.1;
	const float FD = 0.2;
	const float FE = 0.01;
	const float FF = 0.3;
	float w = ((TONE_WHITE * (FA * TONE_WHITE + FC * FB) + FD * FE) / (TONE_WHITE * (FA * TONE_WHITE + FB) + FD * FF)) - FE / FF;
	vec3 k = clamp(y, 0.0, 0.98) * w + FE / FF;
	vec3 a = FA * (1.0 - k);
	vec3 b = FB * (FC - k);
	vec3 c = FD * (FE - k * FF);
	return max((-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a), 0.0);
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
	// Quanto da carta cabe num pixel (antes do discard, que bagunça as derivadas): o linho do verso só aparece de perto.
	float fine = 1.0 - smoothstep(0.0012, 0.003, length(fwidth(UV)));
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
		// O branco do papel (moldura e caixa de texto) não estoura sob a lâmpada: as partes mais claras descem um pouco.
		// Na mão (impressa, sem lâmpada) o branco fica como está, para o texto ter contraste.
		color *= 1.0 - 0.1 * (1.0 - printed) * smoothstep(0.55, 1.0, max(max(color.r, color.g), color.b));
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
	// O fio da borda chanfrado: a normal se inclina para fora, e a luz quente e a contraluz fria riscam o contorno.
	vec3 edge = bevel(UV);
	vec2 tilt = edge.xy * edge.z * 0.4;
	if (FRONT_FACING) {
		// Verniz acetinado de cartão impresso: o reflexo é largo e fraco (não é plástico); só a laca fina dá um fio de
		// brilho quando a carta fica de lado.
		NORMAL_MAP = normalize(vec3(tilt.x, -tilt.y, 1.0)) * 0.5 + 0.5;
		ROUGHNESS = 0.66;
		SPECULAR = 0.2;
		CLEARCOAT = 0.05;
		CLEARCOAT_ROUGHNESS = 0.32;
	} else {
		// O verso é papel: grão e linho no relevo e na cor, mais fosco que a frente.
		float g = paper(UV, fine);
		float gx = paper(UV + vec2(0.004, 0.0), fine) - g;
		float gy = paper(UV + vec2(0.0, 0.003), fine) - g;
		color *= 0.94 + 0.1 * g;
		NORMAL_MAP = normalize(vec3(tilt.x - gx * 0.9, -tilt.y - gy * 0.9, 1.0)) * 0.5 + 0.5;
		ROUGHNESS = 0.74;
		SPECULAR = 0.3;
	}
	// Na mão, a carta impressa: a cor vem toda da emissão (passada pelo Filmic ao contrário), sem luz nem reflexo.
	ALBEDO = color * (1.0 - printed);
	if (printed > 0.0) {
		SPECULAR = (FRONT_FACING ? 0.2 : 0.3) * (1.0 - printed);
		ROUGHNESS = mix(FRONT_FACING ? 0.66 : 0.74, 1.0, printed);
		CLEARCOAT = FRONT_FACING ? 0.05 * (1.0 - printed) : 0.0;
	}
	vec3 shown = printed > 0.0 ? untonemap(color * PRINT_PEAK) * printed : vec3(0.0);
	vec3 glow_light = vec3(0.0);
	if (glow.a > 0.0) {
		if (glow_style == 1) {
			// Pode usar: um fio azul firme na beira, por cima da borda preta impressa (nada entra na arte nem no texto),
			// na cor do destaque como ela é na tela; abaixo do bloom parado, um pouco acima com o mouse em cima.
			float line = smoothstep(-0.0125, -0.0085, d);
			glow_light = untonemap(pow(glow.rgb, vec3(2.2)) * min(glow.a * 1.06, 0.97)) * line;
		} else {
			// Destaque: a borda acesa respira, um brilho corre em volta e um véu suave entra um pouco na carta.
			vec2 p = (UV - 0.5) * SIZE;
			float angle = atan(p.y, p.x);
			float run = pow(0.5 + 0.5 * sin(angle - TIME * 2.6), 10.0) + pow(0.5 + 0.5 * sin(angle + 3.14159 - TIME * 2.6), 10.0);
			float breathe = 0.82 + 0.18 * sin(TIME * 3.2);
			float edge_band = smoothstep(-0.034, 0.0, d);
			float veil = smoothstep(-0.08, 0.0, d) * 0.12;
			glow_light = glow.rgb * glow.a * (edge_band * (1.15 * breathe + run * 1.6) + veil);
		}
	}
	EMISSION = shown + glow_light + vec3(hover * 0.06 * (1.0 - printed)) + dissolve_color * (dissolve > 0.0 ? smoothstep(dissolve * 1.1 + 0.06, dissolve * 1.1 - 0.05, burn) : 0.0) * 4.0 + flash.rgb * flash.a + extra;
}
