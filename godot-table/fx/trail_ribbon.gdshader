// Rastro em fita (TrailRibbon): o borrão macio atrás da carta que voa e o cometa fino atrás da gota de mana.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform vec3 color : source_color = vec3(1.0);
uniform vec3 tail : source_color = vec3(1.0);
uniform float intensity = 1.0;
// 0: o lençol da carta (macio, com riscas finas do movimento); 1: o cometa (filamento quente no meio).
uniform float core = 0.0;
uniform float seed = 0.0;

void fragment() {
	// UV.x: a idade do ponto (0 na cabeça, 1 na cauda); UV.y: de um lado ao outro da fita.
	float along = UV.x;
	float across = abs(UV.y * 2.0 - 1.0);
	float fade = pow(1.0 - along, 1.7);
	// A cabeça nasce já esmaecida (sem a linha reta da borda da carta ou do núcleo).
	float head = smoothstep(0.0, mix(0.12, 0.04, core), along);
	// O lençol: as bordas se esfumam; riscas finas no sentido do voo, como o borrão de uma foto.
	float sheet = 1.0 - smoothstep(0.35, 1.0, across);
	float lines = 0.7 + 0.3 * sin(UV.y * 31.0 + seed) * sin(UV.y * 13.0 - seed * 2.0);
	// O cometa: um filamento claro no meio e um halo curto em volta.
	float filament = exp(-across * across * 14.0) * pow(1.0 - along, 1.4);
	float halo = exp(-across * across * 2.5) * fade * 0.45;
	vec3 tint = mix(color, tail, smoothstep(0.1, 0.9, along));
	vec3 card_light = tint * sheet * fade * lines;
	vec3 comet_light = tint * halo + mix(tint, vec3(1.0), 0.55) * filament * 1.5;
	vec3 light = mix(card_light, comet_light, core) * head * intensity * COLOR.a;
	ALBEDO = light;
	ALPHA = clamp(max(max(light.r, light.g), light.b), 0.0, 1.0);
}
