// Imagem de carta no inspetor e na prévia: cantos arredondados, o reflexo de luz que segue o mouse, a carta que inclina
// e gira em perspectiva (virar a dupla face, girar a flip) e o foil pela raridade.
shader_type canvas_item;

// Altura sobre largura da carta (88/63) e o raio dos cantos, em frações da largura.
uniform float aspect = 1.397;
uniform float radius = 0.045;
// Onde está a luz (0 a 1 na carta) e quanto ela brilha (0 apaga).
uniform vec2 light = vec2(0.3, 0.2);
uniform float sheen = 0.0;
// Quanto o desenho passa da caixa (fração da largura de cada lado): a carta inclinada ou girando cresce do lado que
// chega perto e não pode ser cortada. rect_size é o tamanho da caixa em pixels (a imagem a preenche).
uniform float overscan = 0.0;
uniform vec2 rect_size = vec2(360.0, 503.0);
// Inclinação em radianos (x: em torno do eixo horizontal, y: do vertical), o giro de virar (em torno do vertical) e o
// giro no plano da carta (a flip de cabeça para baixo).
uniform vec2 tilt = vec2(0.0);
uniform float turn = 0.0;
uniform float spin = 0.0;
// Foil: 0 comum (só o reflexo), 1 incomum (prateado), 2 rara (dourado), 3 mítica (arco-íris), 4 especial (arco-íris e cintilado).
uniform float foil = 0.0;

// Distância do olho à carta, em larguras da carta: quanto menor, mais forte a perspectiva.
const float EYE = 3.2;

void vertex() {
	if (overscan > 0.0) {
		VERTEX += (UV - 0.5) * 2.0 * overscan * rect_size.x;
		UV = 0.5 + (UV - 0.5) * (vec2(1.0) + 2.0 * overscan * rect_size.x / rect_size);
	}
}

mat3 rot_x(float a) { float c = cos(a); float s = sin(a); return mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, c, s), vec3(0.0, -s, c)); }
mat3 rot_y(float a) { float c = cos(a); float s = sin(a); return mat3(vec3(c, 0.0, -s), vec3(0.0, 1.0, 0.0), vec3(s, 0.0, c)); }

vec3 hue(float h) {
	return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	// O ponto da tela, em larguras da carta e com o meio em 0; o raio que sai do olho acha a carta girada.
	vec2 s = (UV - 0.5) * vec2(1.0, aspect);
	mat3 r = rot_y(turn + tilt.y) * rot_x(tilt.x);
	vec3 n = r * vec3(0.0, 0.0, 1.0);
	vec3 eye = vec3(0.0, 0.0, -EYE);
	vec3 dir = vec3(s, 0.0) - eye;
	float facing = dot(n, dir);
	vec2 local = s;
	if (abs(facing) > 1e-4) {
		vec3 hit = eye + dir * (dot(n, -eye) / facing);
		vec3 back = transpose(r) * hit;
		local = back.xy;
	}
	float cs = cos(spin);
	float sn = sin(spin);
	local = vec2(cs * local.x + sn * local.y, -sn * local.x + cs * local.y);
	vec2 uv = local / vec2(1.0, aspect) + 0.5;
	vec2 box = vec2(0.5, 0.5 * aspect) - radius;
	float d = length(max(abs(local) - box, 0.0)) - radius;
	float inside = (1.0 - smoothstep(-0.003, 0.003, d)) * step(1e-4, abs(facing));
	vec4 color = texture(TEXTURE, clamp(uv, 0.0, 1.0));
	// Reflexo: um brilho largo em volta da luz e uma faixa diagonal fina que passa por ela.
	float glow = pow(max(0.0, 1.0 - distance(uv * vec2(1.0, aspect), light * vec2(1.0, aspect)) * 1.4), 2.0);
	float band = exp(-pow(((uv.x - light.x) + (uv.y - light.y) * 0.6) * 9.0, 2.0));
	vec3 lit = color.rgb + vec3(1.0, 0.97, 0.9) * sheen * (glow * 0.22 + band * 0.08);
	if (foil > 0.5) {
		// Foil: faixas na diagonal que andam com a luz (o mouse) e devagar com o tempo, mais fortes nas partes claras.
		float diag = uv.x * 0.8 + uv.y * 1.1;
		float shift = light.x * 0.9 + light.y * 0.6;
		float stripes = 0.5 + 0.5 * sin(diag * 10.0 - shift * 7.0 - TIME * 0.6);
		float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		vec3 tint = foil < 1.5 ? vec3(0.82, 0.9, 1.0) : foil < 2.5 ? vec3(1.0, 0.82, 0.45) : hue(diag * 1.3 + shift + TIME * 0.04);
		float k = foil < 1.5 ? 0.16 : foil < 2.5 ? 0.24 : 0.34;
		lit += tint * stripes * (0.25 + 0.6 * luma) * k * (0.6 + 0.8 * glow);
		if (foil > 3.5) {
			float sparkle = step(0.982, hash(floor(uv * vec2(80.0, 112.0)) + floor(TIME * 4.0)));
			lit += vec3(sparkle) * 0.5 * (0.4 + glow);
		}
	}
	// De lado a carta escurece um pouco: o giro parece ter volume.
	lit *= mix(0.62, 1.0, abs(n.z));
	COLOR = vec4(lit, color.a * inside);
}
