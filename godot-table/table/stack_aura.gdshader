// A presença do item na pilha, numa malha presa à carta: atrás dela, chamas de luz saindo das bordas e raios girando
// devagar (camada 0); na frente, duas luzes correndo pela borda sem parar (camada 1); e a onda na forma da carta que se
// abre quando o item chega ou resolve (camada 2).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(1.0, 0.5, 0.2);
uniform vec3 hot : source_color = vec3(1.0, 0.95, 0.85);
uniform vec2 card = vec2(0.63, 0.88);
uniform float pad = 0.4;
uniform float corner = 0.035;
uniform int layer = 0;
uniform float intensity = 1.0;
// 0 calmo; 1 quando a vez é sua e o item do topo é do oponente (pode responder): pulsa mais rápido e mais forte.
uniform float urgency = 0.0;
uniform float seed = 0.0;
// Camada 2: quanto a onda já se afastou da borda.
uniform float shock = 0.0;

float sd_box(vec2 p, vec2 b, float r) {
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
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void fragment() {
	vec2 p = (UV - 0.5) * (card + vec2(pad * 2.0));
	float d = sd_box(p, card * 0.5, corner);
	float a = atan(p.y, p.x);
	float t = TIME * (1.0 + urgency * 1.6) + seed;
	float breath = 0.82 + 0.18 * sin(t * 2.2) + urgency * 0.25 * max(0.0, sin(t * 6.0));
	vec3 light = vec3(0.0);
	if (layer == 0) {
		float outside = max(d, 0.0);
		// Chamas: o ruído corre para fora a partir da borda, com línguas de comprimentos diferentes ao longo dela.
		float n = noise(vec2(a * 9.0 + seed, outside * 14.0 - t * 3.2));
		float n2 = noise(vec2(a * 23.0 - seed, outside * 30.0 - t * 5.0));
		float reach = 0.035 + 0.085 * n + 0.03 * n2;
		float flame = exp(-outside / reach) * smoothstep(-0.01, 0.01, d);
		float rim = exp(-pow(d / 0.012, 2.0));
		// Raios largos e lentos que giram atrás da carta.
		float rays = pow(abs(sin(a * 5.0 + t * 0.35)), 4.0) * 0.6 + pow(abs(sin(a * 9.0 - t * 0.22 + 1.3)), 6.0) * 0.4;
		float ray_fall = exp(-outside / 0.22) * smoothstep(0.0, 0.03, d);
		vec3 tint = mix(hot, color, smoothstep(0.0, 0.02, outside));
		light = tint * flame * 0.7 + hot * rim * 0.6 + color * rays * ray_fall * 0.3;
		light *= breath;
	} else if (layer == 1) {
		// Duas luzes dando a volta na borda sem parar, com rastro; e a borda inteira acesa de leve.
		float s = fract(a / 6.2831853 + 0.5);
		float head = fract(t * 0.32);
		float tail = exp(-fract(head - s) * 7.0) + exp(-fract(head + 0.5 - s) * 7.0);
		float edge = exp(-pow(d / 0.009, 2.0)) * 1.6 + exp(-abs(d) / 0.03) * 0.6;
		light = mix(color, hot, 0.55) * edge * (0.25 + tail * 1.9) * (0.9 + urgency * 0.5);
	} else {
		float wave = exp(-pow((d - shock) / 0.012, 2.0)) * 1.5 + exp(-abs(d - shock) / 0.05) * 0.6;
		light = mix(hot, color, 0.4) * wave * step(-0.002, d);
	}
	// Some antes da borda da malha (sem o corte reto dos raios e das chamas).
	float border = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
	light *= intensity * smoothstep(0.0, 0.12, border);
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
