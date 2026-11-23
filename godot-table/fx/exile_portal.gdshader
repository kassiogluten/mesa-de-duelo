// Portal do exílio deitado no tampo: braços em espiral girando para dentro, borda acesa e um centro escuro e fundo, como um
// buraco na mesa por onde a carta entra.
shader_type spatial;
render_mode unshaded, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(0.55, 0.75, 1.0);
uniform vec3 deep : source_color = vec3(0.35, 0.15, 0.7);
// 0 fechado, 1 aberto por inteiro.
uniform float open = 0.0;
uniform float intensity = 1.0;
uniform float seed = 0.0;
// Clarão do fechamento (a implosão).
uniform float flash = 0.0;

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
	vec2 p = (UV - 0.5) * 2.0;
	float r = length(p) / max(open, 0.001);
	float a = atan(p.y, p.x);
	if (r > 1.0) {
		discard;
	}
	// Espiral: o ângulo torce com o logaritmo do raio e gira com o tempo, puxando tudo para o centro.
	float swirl = a + log(max(r, 0.02)) * 2.6 + TIME * 3.2 + seed;
	float arms = 0.5 + 0.5 * sin(swirl * 4.0);
	arms = pow(arms, 3.0);
	float grain = noise(vec2(swirl * 2.0, r * 6.0 - TIME * 2.0));
	float rim = smoothstep(0.88, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
	// O fundo: escuro no centro (profundidade), arroxeado no meio, os braços acesos na cor do exílio.
	float hole = smoothstep(0.0, 0.55, r);
	vec3 base = mix(vec3(0.0), deep * 0.35, hole);
	vec3 light = color * arms * (0.35 + 0.65 * grain) * smoothstep(0.08, 0.6, r) * (1.0 - smoothstep(0.85, 1.0, r)) * 1.3;
	light += mix(color, vec3(1.0), 0.2) * rim * 1.1;
	light += mix(color, vec3(1.0), 0.6) * flash * exp(-r * 3.0) * 2.0;
	vec3 albedo = base + light;
	ALBEDO = albedo * intensity;
	// O centro escuro cobre o tampo (o buraco); a borda some macia.
	ALPHA = clamp((1.0 - hole * 0.55 + max(max(light.r, light.g), light.b)) * (1.0 - smoothstep(0.96, 1.0, r)), 0.0, 1.0) * intensity;
}
