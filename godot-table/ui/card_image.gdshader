// Imagem de carta no inspetor e na prévia: cantos arredondados e um reflexo de luz que segue o mouse (a carta parece ter brilho).
shader_type canvas_item;

// Altura sobre largura da carta (88/63) e o raio dos cantos, em frações da largura.
uniform float aspect = 1.397;
uniform float radius = 0.045;
// Onde está a luz (0 a 1 na carta) e quanto ela brilha (0 apaga).
uniform vec2 light = vec2(0.3, 0.2);
uniform float sheen = 0.0;

void fragment() {
	vec4 color = texture(TEXTURE, UV);
	vec2 p = (UV - 0.5) * vec2(1.0, aspect);
	vec2 box = vec2(0.5, 0.5 * aspect) - radius;
	float d = length(max(abs(p) - box, 0.0)) - radius;
	float inside = 1.0 - smoothstep(-0.003, 0.003, d);
	// Reflexo: um brilho largo em volta da luz e uma faixa diagonal fina que passa por ela.
	float glow = pow(max(0.0, 1.0 - distance(UV * vec2(1.0, aspect), light * vec2(1.0, aspect)) * 1.4), 2.0);
	float band = exp(-pow(((UV.x - light.x) + (UV.y - light.y) * 0.6) * 9.0, 2.0));
	vec3 lit = color.rgb + vec3(1.0, 0.97, 0.9) * sheen * (glow * 0.22 + band * 0.08);
	COLOR = vec4(lit, color.a * inside);
}
