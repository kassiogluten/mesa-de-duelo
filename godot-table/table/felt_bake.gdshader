// Desenha o feltro do tampo numa textura, uma vez (table/felt_bake.gd): R o feltro, G e B a variação dele para x e
// para z (+0,5), as mesmas contas que o tampo fazia a cada pixel e a cada quadro.
shader_type canvas_item;

#include "res://table/felt.gdshaderinc"

uniform vec2 size = vec2(30.0, 18.0);

void fragment() {
	vec2 p = (UV - 0.5) * size;
	float f = felt(p);
	float fx = felt(p + vec2(FELT_STEP, 0.0)) - f;
	float fz = felt(p + vec2(0.0, FELT_STEP)) - f;
	COLOR = vec4(f, fx + 0.5, fz + 0.5, 1.0);
}
