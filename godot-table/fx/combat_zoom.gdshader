// O quadro do impacto grande: a imagem da mesa estica para fora a partir do ponto do golpe (desfoque radial, como a
// câmera tremendo no tranco) e clareia um pouco no centro, por um piscar. Lê a tela já desenhada.
shader_type canvas_item;

uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap, repeat_disable;
// Onde o golpe caiu (em UV da tela) e quanto a imagem estica (0 desligado).
uniform vec2 center = vec2(0.5);
uniform float amount = 0.0;
uniform vec4 tint : source_color = vec4(1.0, 0.6, 0.35, 1.0);

const int SAMPLES = 12;

// Ruído por pixel (interleaved gradient noise): espalha o começo das amostras, sem cópias em degraus.
float ign(vec2 pixel) {
	return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void fragment() {
	vec2 to_center = center - SCREEN_UV;
	float dist = length(to_center * vec2(SCREEN_PIXEL_SIZE.y / SCREEN_PIXEL_SIZE.x, 1.0));
	// Perto do golpe fica nítido (o golpe se lê); a borda da tela estica mais.
	float pull = amount * smoothstep(0.05, 0.7, dist) * 0.035;
	float jitter = ign(FRAGCOORD.xy);
	vec3 sum = vec3(0.0);
	for (int i = 0; i < SAMPLES; i++) {
		float k = (float(i) + jitter) / float(SAMPLES);
		sum += textureLod(screen_texture, SCREEN_UV + to_center * pull * k, 0.0).rgb;
	}
	vec3 blurred = sum / float(SAMPLES);
	float flare = exp(-dist * dist * 18.0) * amount * 0.3;
	COLOR = vec4(blurred + tint.rgb * flare, 1.0);
}
