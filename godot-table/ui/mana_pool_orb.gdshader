// Uma gota de mana voando pela tela: miolo branco quente, a cor em volta e um brilho que se espalha, tremendo de leve.
shader_type canvas_item;
render_mode blend_add, unshaded;

uniform vec4 tint : source_color = vec4(0.4, 0.9, 0.5, 1.0);
uniform float fade = 1.0;

void fragment() {
	float fade_all = COLOR.a;
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float flicker = 0.9 + 0.1 * sin(TIME * 31.0);
	float core = exp(-r * r / 0.02) * 1.5;
	float body = exp(-r * r / 0.1);
	float glow = exp(-r * r / 0.4) * 0.6;
	vec3 rgb = vec3(1.0) * core + tint.rgb * (body * 1.5 + glow);
	float a = fade * flicker * smoothstep(1.0, 0.8, r);
	COLOR = vec4(rgb * a, fade_all);
}
