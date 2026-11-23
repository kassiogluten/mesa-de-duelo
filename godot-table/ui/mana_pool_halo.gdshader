// Halo atrás de um pip da reserva de mana: brilho que respira na cor, faíscas orbitando devagar, o contorno âmbar de
// aviso (mana que vai se perder), o arco que corre em volta quando dá para clicar e o clarão de quando a mana chega.
shader_type canvas_item;
render_mode blend_add, unshaded;

uniform vec4 tint : source_color = vec4(0.4, 0.9, 0.5, 1.0);
// Raio do símbolo dentro do retângulo (0..1, sendo 1 a borda do retângulo).
uniform float core = 0.46;
// 1 no seu assento, menos nos oponentes (mais calmo).
uniform float intensity = 1.0;
// Quantas faíscas orbitam (0 a 4).
uniform float motes = 3.0;
// 0..1: o contorno âmbar pulsando devagar.
uniform float warn = 0.0;
// 0..1: o arco claro que corre em volta (pagando: dá para clicar).
uniform float shimmer = 0.0;
// 0..1: mouse por cima (pagando).
uniform float hover = 0.0;
// 0..1: o clarão da chegada (some sozinho).
uniform float flash = 0.0;
// Cada pip começa numa fase diferente, para não respirarem juntos.
uniform float phase = 0.0;

void fragment() {
	// A transparência do nó (o modulate) apaga tudo junto: a luz somada é rgb × esta força.
	float fade_all = COLOR.a;
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float ang = atan(p.y, p.x);
	float t = TIME + phase * 7.0;
	vec3 col = tint.rgb;
	vec3 hot = mix(col, vec3(1.0), 0.55);

	// Brilho suave em volta do disco, respirando (0,55 a 0,75 da força).
	float breath = 0.62 + 0.12 * sin(t * 1.7);
	float outside = max(r - core, 0.0);
	float glow = exp(-outside * outside / (0.05 + 0.04 * hover)) * (breath + 0.5 * hover + 1.2 * flash);
	glow *= smoothstep(1.0, 0.75, r);
	float a = glow * 0.55 * intensity;
	vec3 rgb = col * a;

	// Faíscas orbitando: cada uma numa órbita um pouco diferente, com um rastro curto.
	for (int i = 0; i < 4; i++) {
		float fi = float(i);
		if (fi >= motes) {
			break;
		}
		float speed = (0.55 + 0.17 * fi) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
		float orbit = core + 0.16 + 0.07 * sin(t * 0.9 + fi * 2.1);
		float theta = t * speed + fi * TAU / max(motes, 1.0) + phase * TAU;
		for (int k = 0; k < 3; k++) {
			float lag = float(k) * 0.12 * sign(speed);
			vec2 m = orbit * vec2(cos(theta - lag), sin(theta - lag) * 0.88);
			float d = length(p - m);
			float size = (0.07 - float(k) * 0.017) * (0.8 + 0.4 * intensity);
			float dot_a = smoothstep(size, 0.0, d) * (1.0 - float(k) * 0.33) * (0.55 + 0.45 * sin(t * 3.1 + fi * 1.7));
			rgb += hot * dot_a * 0.9 * intensity;
		}
	}

	// Aviso: contorno âmbar logo fora do disco, pulsando devagar (não assusta).
	if (warn > 0.0) {
		float pulse = 0.45 + 0.55 * (0.5 + 0.5 * sin(TIME * 2.4));
		float ring = exp(-pow((r - core - 0.07) / 0.035, 2.0));
		float halo = exp(-pow((r - core - 0.07) / 0.14, 2.0)) * 0.35;
		vec3 amber = vec3(1.0, 0.66, 0.18);
		rgb += amber * (ring + halo) * warn * pulse;
	}

	// Pagando: um arco claro que dá voltas no aro (o "pode tocar").
	if (shimmer > 0.0) {
		float sweep = fract((ang / TAU) - TIME * 0.35);
		float arc = smoothstep(0.78, 1.0, sweep) * exp(-pow((r - core - 0.03) / 0.045, 2.0));
		float rim = exp(-pow((r - core - 0.03) / 0.03, 2.0)) * (0.18 + 0.3 * hover);
		vec3 ice = mix(vec3(0.55, 0.8, 1.0), hot, 0.4);
		rgb += ice * (arc * 1.3 + rim) * shimmer;
	}

	// O clarão da chegada: um miolo branco que se abre.
	rgb += vec3(1.0) * flash * exp(-r * r / 0.12) * 0.8;
	COLOR = vec4(rgb, fade_all);
}
