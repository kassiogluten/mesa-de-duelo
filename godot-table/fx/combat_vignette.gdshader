// Bordas da tela quando você leva o golpe: um vermelho que entra pelas bordas com veias finas pulsando (no ângulo, sem
// grade), e some. Sem nada ligado, o retângulo nem aparece.
shader_type canvas_item;

uniform float amount = 0.0;
uniform vec4 color : source_color = vec4(0.75, 0.03, 0.02, 1.0);

void fragment() {
	vec2 p = (UV - 0.5) * vec2(1.6, 1.0);
	float d = length(p);
	float a = atan(p.y, p.x);
	// Veias: ondas no ângulo (suaves por construção), mexendo devagar; só perto das bordas.
	float veins = sin(a * 9.0 + sin(a * 4.0 + TIME * 1.3) * 1.6) * 0.5 + 0.5;
	veins *= sin(a * 23.0 - TIME * 0.8 + sin(a * 7.0) * 2.0) * 0.5 + 0.5;
	// A borda avança para dentro com a força do golpe (no pico, até um pouco antes do meio da tela).
	float reach = mix(0.78, 0.5, clamp(amount, 0.0, 1.0));
	float edge = smoothstep(reach, reach + 0.38, d + veins * 0.07);
	float glow = edge * (0.75 + 0.35 * veins);
	COLOR = vec4(color.rgb * (0.8 + 0.5 * veins), clamp(glow * amount, 0.0, 0.62));
}
