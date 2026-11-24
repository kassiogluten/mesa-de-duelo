// A arte da criatura com enjoo de invocação ondulando de leve, como um reflexo na água: uma folha fina sobre a caixa
// da ilustração que redesenha o que já está na tela um pouco deslocado (faixas quase horizontais, lentas). Na borda da
// caixa o deslocamento é zero, então a moldura, o nome, o texto e o P/R ficam parados e não aparece emenda.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

uniform sampler2D screen : hint_screen_texture, filter_linear, repeat_disable;
// Tamanho da caixa da arte (unidades da mesa) e o maior deslocamento, também em unidades da mesa (a carta tem 0,63 de largura).
uniform vec2 box = vec2(0.53, 0.39);
uniform float amplitude = 0.0075;
// Força (0 parada, 1 ondulando: entra devagar e se acalma quando o enjoo passa) e a fase de cada carta.
instance uniform float strength = 0.0;
instance uniform float phase = 0.0;

// Os eixos da carta na vista (com a escala dela): o deslocamento anda junto quando a carta vira, gira ou sobe.
varying vec3 axis_x;
varying vec3 axis_z;

void vertex() {
	axis_x = (MODELVIEW_MATRIX * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
	axis_z = (MODELVIEW_MATRIX * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
}

void fragment() {
	vec2 p = UV * box;
	float t = TIME + phase;
	// Faixas que correm devagar para baixo, tortas pelo lado (o ruído baixo de x), com uma segunda mais fina por cima.
	float bend = sin(p.x * 11.0 + t * 0.45) * 0.9 + sin(p.x * 23.0 - t * 0.3 + 1.7) * 0.4;
	float dx = sin(p.y * 62.0 - t * 1.5 + bend) * 0.65 + sin(p.y * 97.0 + p.x * 9.0 - t * 2.1) * 0.35;
	float dy = sin(p.y * 41.0 + p.x * 17.0 - t * 1.2 + bend * 0.5) * 0.35;
	vec2 fade = smoothstep(vec2(0.0), vec2(0.14), UV) * smoothstep(vec2(1.0), vec2(0.86), UV);
	vec2 off = vec2(dx, dy) * amplitude * strength * fade.x * fade.y;
	vec4 here = PROJECTION_MATRIX * vec4(VERTEX, 1.0);
	vec4 there = PROJECTION_MATRIX * vec4(VERTEX + axis_x * off.x + axis_z * off.y, 1.0);
	vec2 shift = (there.xy / there.w - here.xy / here.w) * 0.5;
	ALBEDO = textureLod(screen, SCREEN_UV + shift, 0.0).rgb;
	ALPHA = 1.0;
}
