// Feixe de energia (EnergyBeam): o raio que corre de um lugar a outro, a corrente de elos de luz e a coluna de luz fina.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(0.72, 0.42, 1.0);
uniform vec3 hot : source_color = vec3(1.0, 0.95, 1.0);
// 0: raio; 1: corrente; 2: coluna.
uniform int style = 0;
// Até onde o feixe já chegou (cabeça) e de onde ele já se recolheu (cauda), de 0 a 1 ao longo da curva.
uniform float head = 1.0;
uniform float tail = 0.0;
uniform float alpha = 1.0;
// Quantos elos cabem na corrente (pelo comprimento) e onde está o pulso de luz que corre por ela.
uniform float links = 10.0;
uniform float pulse = -1.0;
uniform float seed = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(float x) {
	float i = floor(x);
	float f = fract(x);
	return mix(hash(vec2(i, seed)), hash(vec2(i + 1.0, seed)), f * f * (3.0 - 2.0 * f));
}

void fragment() {
	float along = UV.x;
	float y = UV.y * 2.0 - 1.0;
	// O trecho visível: entre a cauda e a cabeça, com as pontas macias.
	float shown = smoothstep(tail, tail + 0.04, along) * (1.0 - smoothstep(head - 0.03, head, along));
	float tip = exp(-pow((along - head) / 0.035, 2.0)) * step(0.001, head) * (1.0 - step(0.999, head));
	vec3 light = vec3(0.0);
	if (style == 0) {
		// Raio: um filamento que serpenteia (o ruído corre ao longo), a fita macia em volta e nós de luz que fluem.
		float wiggle = (noise(along * 9.0 - TIME * 7.0) - 0.5) * 0.9 + (noise(along * 23.0 + TIME * 11.0) - 0.5) * 0.35;
		float d = abs(y - wiggle * 0.55);
		float filament = exp(-d * d * 90.0);
		float glow = exp(-y * y * 3.0) * 0.4;
		float flow = 0.6 + 0.4 * sin(along * 40.0 - TIME * 26.0);
		light = hot * filament * 1.6 + color * (glow * flow + filament * 0.8);
	} else if (style == 1) {
		// Corrente: elos ovais de frente alternando com elos de lado (uma barra), metal claro com brilho na cor.
		float u = along * links;
		float f = fract(u);
		vec2 q = vec2((f - 0.5) * 2.0, y / 0.62);
		float ring = exp(-pow((length(q) - 0.72) / 0.13, 2.0));
		float g = fract(u + 0.5);
		float bar = exp(-pow(y / 0.13, 2.0)) * smoothstep(0.18, 0.3, g) * (1.0 - smoothstep(0.7, 0.82, g));
		float metal = max(ring, bar);
		float sheen = 0.65 + 0.35 * sin(u * 6.2831 + TIME * 3.0);
		float halo = exp(-y * y * 2.2) * 0.22;
		float run = exp(-pow((along - pulse) / 0.07, 2.0));
		light = mix(color, hot, 0.45) * metal * sheen * 1.3 + color * halo + hot * metal * run * 1.6;
	} else {
		// Coluna: um núcleo claro e um halo largo, forte embaixo (o pé aceso no monte) e sumindo em cima; faixas que sobem.
		float core = exp(-y * y * 7.0);
		float soft = exp(-y * y * 1.6) * 0.45;
		float rise = 0.7 + 0.3 * sin(along * 22.0 - TIME * 8.0 + y * 2.0);
		float fall = pow(1.0 - along, 0.9);
		float foot = exp(-along * 12.0) * exp(-y * y * 3.0) * 0.8;
		light = mix(color, hot, core * 0.6) * (core + soft) * rise * fall * 2.0 + hot * foot;
	}
	light += hot * tip * exp(-y * y * 4.0) * (style == 2 ? 0.0 : 1.4);
	light *= shown * alpha;
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
