// Efeitos contínuos de uma permanente com a mesa parada (voar, vínculo com a vida, indestrutível…): uma camada no formato da carta, quase só na borda.
shader_type spatial;
// Pré-multiplicado: luz soma (ALPHA 0) e a fumaça escura cobre (ALPHA > 0), no mesmo material.
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

// Tamanho da carta e a margem da malha em volta (os mesmos do AmbientFx).
uniform vec2 card = vec2(0.63, 0.88);
uniform float pad = 0.08;
uniform float corner = 0.035;
// Força de todos de uma vez: baixa nos momentos grandes (pilha, combate, limpa-campo).
uniform float gain_all = 1.0;

// x, y: os dois efeitos (AmbientTraits.Mode); z: semente da carta; w: força desta carta (entrada, escurecida, mouse).
instance uniform vec4 slots = vec4(0.0);
// rgb: a cor da carta (lealdade, elo do anexo); a: a lealdade.
instance uniform vec4 tint = vec4(1.0);
// O elo com o anexo: rgb na cor dele, a força; o anexo tem `link_dir` (de onde está o hospedeiro).
instance uniform vec4 link = vec4(0.0);

float sd_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

float hash2(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	return noise(p) * 0.55 + noise(p * 2.03 + 7.1) * 0.3 + noise(p * 4.1 + 3.3) * 0.15;
}

// Linha fina colada na borda (d = 0) e o brilho curto para fora.
float rim(float d, float w) {
	return exp(-(d * d) / (w * w));
}

float halo(float d, float reach) {
	return exp(-max(d, 0.0) / reach) * smoothstep(-0.004, 0.002, d);
}

// Posição ao longo do contorno, de 0 a 1 (ângulo em volta do centro, achatado pela proporção da carta).
float around(vec2 p) {
	return atan(p.y / card.y, p.x / card.x) / TAU + 0.5;
}

// Ponto que brilha: q é a distância ao centro dele.
float mote(vec2 q, float r) {
	return exp(-dot(q, q) / (r * r));
}

// Um efeito: rgb de luz (somada) e a de cobertura escura (pré-multiplicado). p em unidades da carta (y > 0 é o pé
// da carta, na direção de quem joga), d a distância até a borda (negativa dentro), t o tempo próprio da carta.
vec4 effect(int mode, vec2 p, float d, float t, float seed, vec3 col, float param, vec3 view_n) {
	vec2 h = card * 0.5;
	float inside = smoothstep(0.004, -0.004, d);
	vec3 light = vec3(0.0);
	float cover = 0.0;
	if (mode == 1) {
		// Voar: fiapos de vento passando por baixo da carta, dos lados e no pé.
		float band = smoothstep(0.0, 0.012, d) * smoothstep(pad * 0.85, 0.02, d);
		float n = noise(vec2(p.x * 4.0 - t * 0.55 + seed * 9.0, p.y * 34.0));
		float n2 = noise(vec2(p.y * 4.0 - t * 0.4 + seed * 5.0, p.x * 30.0));
		float streak = smoothstep(0.52, 0.85, mix(n, n2, smoothstep(h.x - 0.05, h.x + 0.02, abs(p.x))));
		light += vec3(0.78, 0.9, 1.0) * streak * band * (0.35 + 0.75 * smoothstep(-h.y, h.y * 0.5, p.y));
	} else if (mode == 2) {
		// Vínculo com a vida: a borda bate como um coração (dois toques) e luzinhas verdes sobem da carta.
		float ph = fract(t / 2.6);
		float beat = exp(-pow((ph - 0.04) / 0.03, 2.0)) + 0.65 * exp(-pow((ph - 0.17) / 0.035, 2.0));
		vec3 green = mix(vec3(0.45, 1.0, 0.55), vec3(1.0), 0.35);
		light += green * (rim(d, 0.007) * (0.18 + beat * 0.85) + halo(d, 0.025) * beat * 0.35);
		for (int i = 0; i < 5; i++) {
			float fi = float(i);
			float life = fract(t * 0.16 + hash(fi + seed * 13.0));
			float x = (hash(fi * 7.3 + seed) - 0.5) * card.x * 0.95 + sin(t * 1.1 + fi * 2.0) * 0.012;
			float y = h.y * 0.95 - life * card.y * 1.05;
			float fade = sin(life * 3.14159) * smoothstep(-0.02, 0.06, abs(x) + 0.02);
			light += green * mote(p - vec2(x, y), 0.0065) * fade * 0.75;
		}
	} else if (mode == 3) {
		// Indestrutível: a cada poucos segundos um brilho de metal dourado atravessa a carta; a borda fica dourada.
		vec3 gold = vec3(1.0, 0.82, 0.42);
		float ph = fract(t / 5.5);
		float s = (p.x / card.x - p.y / card.y) * 0.5 + 0.5;
		float pos = ph * 2.6 - 0.5;
		float band = exp(-pow((s - pos) / 0.045, 2.0)) + 0.5 * exp(-pow((s - pos + 0.07) / 0.015, 2.0));
		light += mix(gold, vec3(1.0), 0.45) * band * inside * 0.32;
		float edge_hit = exp(-pow((s - pos) / 0.12, 2.0));
		light += gold * rim(d, 0.006) * (0.32 + edge_hit * 0.9);
	} else if (mode == 4) {
		// Toque mortífero: fiapos de fumaça preta e violeta se enrolando no pé da carta.
		vec2 q = vec2(p.x * 5.0, (p.y - h.y) * 7.0);
		q += vec2(sin(q.y * 1.5 + t * 0.5), cos(q.x * 1.2 - t * 0.4)) * 0.5;
		float smoke = fbm(q + vec2(seed * 3.0, -t * 0.3));
		float mask = smoothstep(h.y - 0.06, h.y + 0.005, p.y) * smoothstep(h.y + pad * 0.95, h.y + 0.01, p.y);
		mask *= smoothstep(h.x + 0.05, h.x - 0.04, abs(p.x));
		mask *= 1.0 - inside * 0.6;
		// Fios finos (a curva de nível da fumaça) e um bafo escuro por baixo.
		float strands = exp(-pow((smoke - 0.56) / 0.03, 2.0)) * mask;
		float haze = smoothstep(0.42, 0.75, smoke) * mask;
		cover += haze * 0.5;
		light += vec3(0.6, 0.25, 0.9) * strands * 0.5 + vec3(0.2, 0.04, 0.3) * haze * 0.15;
	} else if (mode == 5 || mode == 6) {
		// Resistência à magia (iridescente) e manto (o mesmo, apagado e frio): uma película que muda de cor com o ângulo.
		float fres = 1.0 - abs(view_n.z);
		float hue = fract(p.x * 0.9 + p.y * 0.6 + t * 0.04 + fres * 3.0 + seed);
		vec3 film = 0.5 + 0.5 * cos(TAU * (hue + vec3(0.0, 0.33, 0.67)));
		film = mix(film, vec3(0.55, 0.85, 1.0), 0.3);
		if (mode == 6) {
			film = mix(vec3(dot(film, vec3(0.33))), vec3(0.65, 0.6, 0.85), 0.5);
		}
		float drift = 0.5 + 0.5 * sin((p.x - p.y) * 7.0 - t * 0.5 + seed * 4.0);
		light += film * (rim(d, 0.009) * 0.3 + inside * (0.03 + drift * 0.04) + halo(d, 0.02) * 0.08);
	} else if (mode == 7) {
		// Proteção contra alvos: uma grade de hexágonos quase invisível pisca de vez em quando, de baixo para cima.
		vec2 g = p * 26.0;
		vec2 r = vec2(1.0, 1.7320508);
		vec2 a = mod(g, r) - r * 0.5;
		vec2 b = mod(g - r * 0.5, r) - r * 0.5;
		vec2 c = dot(a, a) < dot(b, b) ? a : b;
		vec2 ac = abs(c);
		float hex = max(ac.x * 0.8660254 + ac.y * 0.5, ac.y);
		float line = smoothstep(0.38, 0.47, hex);
		float ph = fract(t / 6.5);
		float front = 1.0 - ph * 4.0;
		float wave = exp(-pow((p.y / card.y + 0.5 - front) / 0.14, 2.0)) * step(ph, 0.35);
		vec3 blue = vec3(0.6, 0.82, 1.0);
		light += blue * line * inside * wave * 0.18 + blue * rim(d, 0.006) * (0.12 + wave * 0.3);
	} else if (mode == 8) {
		// Ameaçar: brasas vermelho-escuras nos cantos, com um bafo escuro em volta.
		for (int k = 0; k < 4; k++) {
			vec2 cs = vec2(k % 2 == 0 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0);
			vec2 cp = cs * (h - vec2(0.012));
			float dist = length(p - cp);
			float flick = 0.6 + 0.4 * noise(vec2(t * 2.2 + float(k) * 5.0, seed * 3.0));
			cover += exp(-dist / 0.035) * 0.22 * (1.0 - inside * 0.6);
			light += vec3(0.85, 0.12, 0.04) * exp(-dist / 0.022) * flick * 0.55;
			for (int i = 0; i < 2; i++) {
				float life = fract(t * 0.35 + hash(float(k * 2 + i) + seed * 11.0));
				vec2 e = cp + cs * vec2(0.02 + life * 0.05, 0.01 + life * 0.04) + vec2(sin(t * 3.0 + float(i)) * 0.006, 0.0);
				light += vec3(1.0, 0.3, 0.08) * mote(p - e, 0.0045) * sin(life * 3.14159) * 0.9;
			}
		}
	} else if (mode == 9) {
		// Ímpeto (no turno em que entrou): o ar treme de calor em volta, ondas quentes subindo da borda.
		float along = around(p);
		float wave = sin(d * 110.0 - t * 4.5 + sin(along * 40.0 + t * 1.7) * 1.8);
		float band = smoothstep(0.0, 0.01, d) * smoothstep(pad * 0.9, 0.0, d);
		float upward = smoothstep(h.y, -h.y, p.y) * 0.7 + 0.3;
		vec3 heat = vec3(1.0, 0.55, 0.2);
		light += heat * smoothstep(0.75, 1.0, wave) * band * upward * 0.32;
		light += heat * rim(d, 0.006) * (0.2 + 0.12 * noise(vec2(along * 30.0, t * 3.0)));
	} else if (mode == 10 || mode == 11) {
		// Iniciativa (e golpe duplo: dois): um fio de luz de lâmina corre pelo alto da carta de vez em quando.
		float ph = fract(t / 4.2);
		float top = exp(-pow((p.y + h.y) / 0.006, 2.0)) * step(abs(p.x), h.x - 0.01);
		float gx = mix(-h.x, h.x, smoothstep(0.0, 0.14, ph));
		float glint = exp(-pow((p.x - gx) / 0.035, 2.0)) * step(ph, 0.16);
		if (mode == 11) {
			float ph2 = ph - 0.2;
			float gx2 = mix(h.x, -h.x, smoothstep(0.0, 0.14, ph2));
			glint += exp(-pow((p.x - gx2) / 0.035, 2.0)) * step(0.0, ph2) * step(ph2, 0.16);
		}
		vec3 steel = vec3(0.85, 0.93, 1.0);
		light += steel * top * (0.12 + glint * 1.6);
		float star = glint * (exp(-pow(p.y + h.y, 2.0) / 0.0004) * exp(-pow(p.x - gx, 2.0) / 0.00004) + exp(-pow(p.x - gx, 2.0) / 0.0004) * exp(-pow(p.y + h.y, 2.0) / 0.00004));
		light += steel * star * 0.8;
	} else if (mode == 12) {
		// Vigilância: uma borda branco-dourada firme, respirando bem devagar.
		float breathe = 0.85 + 0.15 * sin(t * 1.0);
		light += vec3(1.0, 0.93, 0.75) * (rim(d, 0.008) * 0.38 + halo(d, 0.02) * 0.1) * breathe;
	} else if (mode == 13) {
		// Atropelar: de vez em quando sobe um pouco de poeira no pé da carta.
		for (int i = 0; i < 2; i++) {
			float fi = float(i);
			float cycle = t / 3.6 + fi * 0.5 + hash(fi + seed);
			float life = fract(cycle);
			float x = (hash(floor(cycle) * 3.1 + fi + seed) - 0.5) * card.x * 0.9;
			vec2 c = vec2(x, h.y + 0.012 + life * 0.025);
			float r = 0.012 + life * 0.045;
			float puff = mote((p - c) * vec2(0.7, 1.2), r) * smoothstep(0.0, 0.12, life) * (1.0 - life) * fbm(p * 30.0 + vec2(fi, t * 0.3));
			light += vec3(0.75, 0.63, 0.47) * puff * 0.9 * (1.0 - inside);
		}
	} else if (mode == 14) {
		// Alcance: uma trepadeira de luz verde no pé da carta, com a luz subindo por ela.
		float along = around(p);
		float wave = sin(p.x * 34.0 + seed * 6.0) * 0.008 + sin(p.y * 40.0 + seed) * 0.005;
		float vine = exp(-pow((d - 0.008 - wave) / 0.0035, 2.0));
		float lower = smoothstep(h.y * 0.1, h.y * 0.85, p.y);
		float flow = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(along * 40.0 - t * 1.4), 3.0);
		light += vec3(0.45, 1.0, 0.45) * vine * lower * flow * 0.5;
	} else if (mode == 15) {
		// Defensor: uma borda de pedra cinza, firme e opaca.
		float stone = 0.75 + 0.25 * fbm(p * 40.0 + seed);
		float band = smoothstep(-0.016, -0.009, d) * smoothstep(0.006, 0.0, d);
		cover += band * 0.6;
		light += vec3(0.5, 0.5, 0.53) * stone * band * 0.6 + vec3(0.8) * rim(d + 0.016, 0.0025) * 0.12;
	} else if (mode == 16) {
		// Lendária: uma aura dourada bem fraca em volta.
		float breathe = 0.75 + 0.25 * sin(t * 0.8);
		light += vec3(1.0, 0.8, 0.4) * (halo(d, 0.035) * 0.16 + rim(d, 0.006) * 0.1) * breathe;
	} else if (mode == 17) {
		// Comandante: uma coroa de luz dourada no alto da carta, pulsando devagar.
		float pulse = 0.55 + 0.45 * sin(t * 1.5);
		float crown = exp(-pow(p.x / 0.13, 2.0)) * exp(-pow((p.y + h.y + 0.012) / 0.03, 2.0));
		vec3 gold = vec3(1.0, 0.8, 0.38);
		light += gold * crown * pulse * 0.55 + gold * (rim(d, 0.006) * 0.16 + halo(d, 0.03) * 0.08) * (0.7 + 0.3 * pulse);
	} else if (mode == 18) {
		// Ficha: uma borda prateada, com um reflexo dando a volta devagar.
		float glide = pow(0.5 + 0.5 * cos(TAU * (around(p) - t * 0.06)), 8.0);
		light += vec3(0.85, 0.9, 1.0) * rim(d, 0.006) * (0.2 + glide * 0.5);
	} else if (mode == 19) {
		// Planeswalker: a borda pulsa na cor da carta; quanto mais lealdade, mais rápido e mais aceso.
		float loyalty = clamp(param, 0.0, 10.0);
		float pulse = 0.5 + 0.5 * sin(t * (1.3 + loyalty * 0.25));
		light += mix(col, vec3(1.0), 0.25) * (rim(d, 0.008) * (0.12 + pulse * (0.2 + loyalty * 0.03)) + halo(d, 0.03) * pulse * (0.05 + loyalty * 0.012));
	} else if (mode == 20) {
		// Marcadores +1/+1: um pulso verde fraco na borda.
		float pulse = pow(0.5 + 0.5 * sin(t * 2.0), 2.0);
		light += vec3(0.4, 1.0, 0.45) * (rim(d, 0.007) * 0.24 + halo(d, 0.02) * 0.08) * pulse;
	}
	return vec4(light, cover);
}

void fragment() {
	vec2 p = (UV - 0.5) * (card + vec2(pad * 2.0));
	float d = sd_box(p, card * 0.5, corner);
	float seed = slots.z;
	float t = TIME + seed * 37.0;
	vec4 sum = effect(int(slots.x + 0.5), p, d, t, seed, tint.rgb, tint.a, NORMAL);
	sum += effect(int(slots.y + 0.5), p, d, t + 11.0, seed + 0.37, tint.rgb, tint.a, NORMAL);
	// O elo do anexo com o hospedeiro, no mesmo compasso nos dois: no hospedeiro (a > 0) acende o canto de cima à
	// direita, de onde o anexo sai; no anexo (a < 0) a borda que aparece pulsa um instante antes, como se a luz passasse.
	if (link.a != 0.0) {
		vec2 h = card * 0.5;
		bool host = link.a > 0.0;
		float meet = host ? exp(-length(p - vec2(h.x, -h.y) * 0.92) / 0.09) : 0.6;
		float pulse = pow(0.5 + 0.5 * sin(TIME * 1.6 + (host ? 0.0 : 0.6)), 3.0);
		sum.rgb += link.rgb * (rim(d, 0.008) * meet * (0.2 + pulse * 0.6) + halo(d, 0.03) * meet * pulse * 0.25) * abs(link.a);
	}
	float gain = slots.w * gain_all;
	// Fora da malha, nada: a borda da malha nunca aparece.
	float fade = smoothstep(pad, pad * 0.75, d);
	ALBEDO = sum.rgb * gain * fade;
	ALPHA = clamp(sum.a * gain * fade, 0.0, 1.0);
}
