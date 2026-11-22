// Carta na mesa: frente com a imagem, verso desenhado com a cor do jogador, cantos arredondados e brilho de destaque.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D front_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform bool has_front = false;
uniform vec3 sleeve_color : source_color = vec3(0.42, 0.24, 0.12);
// Destaque: rgb a cor, a a força (pode jogar, alvo, selecionada).
uniform vec4 glow = vec4(0.35, 0.8, 1.0, 0.0);
// Escurece a carta que não pode ser escolhida no prompt atual.
uniform float dim : hint_range(0.0, 1.0) = 0.0;
// Brilho de passagem de mouse.
uniform float hover : hint_range(0.0, 1.0) = 0.0;
// Queimar (destruída): 0 inteira, 1 consumida; a borda do que queima acende na cor dada.
uniform float dissolve : hint_range(0.0, 1.0) = 0.0;
uniform vec3 dissolve_color : source_color = vec3(1.0, 0.45, 0.12);
// Clarão rápido (dano, entrada): soma luz na carta inteira.
uniform vec4 flash = vec4(1.0, 1.0, 1.0, 0.0);

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

void fragment() {
	float d = card_sdf(UV);
	if (d > 0.0) {
		discard;
	}
	float burn = noise(UV * vec2(6.0, 8.4)) * 0.65 + noise(UV * 19.0) * 0.35;
	if (dissolve > 0.0 && burn < dissolve * 1.1 - 0.05) {
		discard;
	}
	vec3 color;
	if (FRONT_FACING) {
		color = has_front ? texture(front_tex, UV).rgb : vec3(0.18, 0.17, 0.2);
	} else {
		color = card_back(vec2(1.0 - UV.x, UV.y));
	}
	color = mix(color, color * 0.32, dim);
	float rim = smoothstep(-0.028, 0.0, d);
	ALBEDO = color;
	ROUGHNESS = 0.62;
	SPECULAR = 0.25;
	float edge = dissolve > 0.0 ? smoothstep(dissolve * 1.1 + 0.06, dissolve * 1.1 - 0.05, burn) : 0.0;
	EMISSION = glow.rgb * glow.a * (rim * 2.2 + 0.06) + vec3(hover * 0.05) + dissolve_color * edge * 4.0 + flash.rgb * flash.a;
}
