# A capa da tela inicial: a arte do deck escolhido ocupando a esquerda como a capa de um jogo, apagando no fundo à direita
# e embaixo, com "SEU DECK", o nome e a linha das cores e do formato; troca de deck num esmaecer, deriva bem devagar e
# tem umas poucas luzinhas subindo devagar por cima. A arte passa uma vez por um filtro de pintura, que troca o borrado da
# ampliação por pinceladas.
class_name HomeCover
extends Control

## Quanto da largura da tela a arte ocupa.
const ART_SHARE := 0.66
const FADE_S := 0.35
## Um ciclo inteiro da deriva lenta da arte (aproxima e afasta, andando um pouco para o lado).
const DRIFT_PERIOD_S := 46.0
const DRIFT_ZOOM := 0.06
## A arte recortada do Scryfall tem uns 626 px de largura e aqui fica com mais de 1200: ampliada, ela borra e mostra os
## blocos do JPEG. Por isso passa uma vez (por arte) pelo filtro de Kuwahara generalizado (Kyprianidis, pesos
## polinomiais): 8 setores num disco em volta de cada ponto, cada um pesado pelo inverso da variação. As áreas viram
## manchas lisas de bordas nítidas, que leem como pinceladas em qualquer ampliação. Caro (uns 13 ms na UHD 770): roda
## num viewport só para isso, que desenha um quadro e guarda (`_painted`).
const PAINT_SHADER := """
shader_type canvas_item;
// O tamanho do passo, em pixels da arte original: o disco cobre uns 2,5 px dela.
uniform float step_px = 0.62;
// Quanto a variação pesa contra um setor (maior: bordas mais duras).
uniform float q = 8.0;
const int R = 4;
void fragment() {
	vec2 px = TEXTURE_PIXEL_SIZE * step_px;
	vec4 m[8];
	vec3 s[8];
	for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
	float zeta = 2.0 / float(R);
	float eta = 0.84;
	for (int j = -R; j <= R; j++) {
		for (int i = -R; i <= R; i++) {
			vec2 v = vec2(float(i), float(j)) / float(R);
			if (dot(v, v) > 1.0) { continue; }
			vec3 c = textureLod(TEXTURE, UV + vec2(float(i), float(j)) * px, 0.0).rgb;
			float w[8];
			float sum = 0.0;
			float z; float vxx; float vyy;
			vxx = zeta - eta * v.x * v.x;
			vyy = zeta - eta * v.y * v.y;
			z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
			z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
			z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
			z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
			vec2 r = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
			vxx = zeta - eta * r.x * r.x;
			vyy = zeta - eta * r.y * r.y;
			z = max(0.0, r.y + vxx); w[1] = z * z; sum += w[1];
			z = max(0.0, -r.x + vyy); w[3] = z * z; sum += w[3];
			z = max(0.0, -r.y + vxx); w[5] = z * z; sum += w[5];
			z = max(0.0, r.x + vyy); w[7] = z * z; sum += w[7];
			float g = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
			for (int k = 0; k < 8; k++) {
				float wk = w[k] * g;
				m[k] += vec4(c * wk, wk);
				s[k] += c * c * wk;
			}
		}
	}
	vec3 acc = vec3(0.0);
	float wsum = 0.0;
	vec3 calm = vec3(0.0);
	float calm_sigma = 1e9;
	for (int k = 0; k < 8; k++) {
		vec3 mean = m[k].rgb / max(m[k].w, 1e-6);
		vec3 var = abs(s[k] / max(m[k].w, 1e-6) - mean * mean);
		float sigma2 = var.r + var.g + var.b;
		float w = 1.0 / (1.0 + pow(255.0 * sigma2, 0.5 * q));
		acc += mean * w;
		wsum += w;
		if (sigma2 < calm_sigma) { calm_sigma = sigma2; calm = mean; }
	}
	// Onde todos os setores variam muito, os pesos somem: fica o setor mais calmo.
	// Sem "* COLOR": na entrada do fragment o COLOR já é a textura (vezes o modulate); aqui a cor sai como a da arte.
	COLOR = vec4(wsum > 1e-30 ? acc / wsum : calm, 1.0);
}
"""

## A arte já pintada, na capa: o tom escuro da capa, uma trama de tela leve e um grão fino (sem suavizar, que apagaria
## as bordas das manchas).
const ART_SHADER := """
shader_type canvas_item;
uniform float grain = 0.02;
uniform float weave = 0.035;
// O modulate (os esmaeceres da arte e da camada), guardado antes de o fragment misturar a textura no COLOR.
varying vec4 modulate;
void vertex() {
	modulate = COLOR;
}
// hash12 (Dave Hoskins): sem os padrões de listras do fract(sin()) em coordenadas grandes.
float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void fragment() {
	vec3 c = texture(TEXTURE, UV).rgb;
	// O tom da capa: a cor ao quadrado, mais escura e contrastada que a arte, de propósito (os degradês das bordas, o
	// nome do deck e as luzinhas foram acertados em cima dele).
	c = c * c;
	// Trama de tela: fios na horizontal e na vertical, presos à tela.
	vec2 f = FRAGCOORD.xy;
	float threads = (vnoise(vec2(f.x * 0.09, f.y * 0.55)) + vnoise(vec2(f.x * 0.55 + 31.0, f.y * 0.09))) * 0.5;
	c *= 1.0 + (threads - 0.5) * weave;
	c += (hash(f) - 0.5) * grain;
	COLOR = vec4(c, 1.0) * modulate;
}
"""
## A arte pintada fica com 1,5 vez o tamanho da original (a capa ainda amplia um pouco o resultado, sem perder as bordas).
const PAINT_SCALE := 1.5
## Quantas artes pintadas ficam guardadas, para voltar a um deck sem pintar de novo.
const PAINT_CACHE := 6

## Luzinhas subindo sobre a arte: poucas, pequenas e lentas, só um toque de ambiente.
const MOTES := 14
const MOTE_LIFE_S := 12.0
const MOTE_COLOR := Color(1.0, 0.88, 0.64, 0.4)

## A deriva lenta da arte e as luzinhas (desligadas no nível de efeitos leve).
var drift: bool = true:
	set(on):
		drift = on
		if _motes:
			_motes.emitting = on
			_motes.visible = on

var _art_box: Control
## As camadas da arte: a do deck da vez por cima, as antigas apagando embaixo.
var _layers: Array[Control] = []
var _key: String = ""
var _info: VBoxContainer
var _title: Label
var _pips: HBoxContainer
var _meta: Label
var _time: float = 0.0
var _motes: CPUParticles2D
## As artes pintadas (textura original -> o viewport que a pintou), da mais antiga para a mais nova.
var _paintings: Dictionary = {}
var _bakery: Node
static var _art_material: ShaderMaterial
static var _paint_material: ShaderMaterial


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var background := ColorRect.new()
	background.color = HomeStyle.BG
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	_art_box = Control.new()
	_art_box.name = "Art"
	_art_box.clip_contents = true
	_art_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_art_box)
	# A arte apaga para a direita (até o fundo) e embaixo (onde ficam o nome e a fileira de decks).
	# O fim da rampa é suave (sem quina), para a borda da arte não parecer uma linha no fundo.
	var side := _overlay(HomeStyle.fade([
		[0.0, Color(HomeStyle.BG, 0.12)], [0.5, Color(HomeStyle.BG, 0.32)], [0.7, Color(HomeStyle.BG, 0.62)],
		[0.84, Color(HomeStyle.BG, 0.88)], [0.93, Color(HomeStyle.BG, 0.97)], [1.0, HomeStyle.BG],
	], Vector2(0, 0), Vector2(1, 0)))
	side.name = "FadeSide"
	var bottom := _overlay(HomeStyle.fade([[0.0, Color(HomeStyle.BG, 0.0)], [0.5, Color(HomeStyle.BG, 0.0)], [0.78, Color(HomeStyle.BG, 0.72)], [1.0, HomeStyle.BG]], Vector2(0, 0), Vector2(0, 1)))
	bottom.name = "FadeBottom"
	var top := _overlay(HomeStyle.fade([[0.0, Color(HomeStyle.BG, 0.55)], [0.14, Color(HomeStyle.BG, 0.0)], [1.0, Color(HomeStyle.BG, 0.0)]], Vector2(0, 0), Vector2(0, 1)))
	top.name = "FadeTop"
	# Os viewports que pintam as artes (não desenham na tela: só guardam o quadro pintado).
	_bakery = Node.new()
	_bakery.name = "Paintings"
	add_child(_bakery)
	_motes = _build_motes()
	add_child(_motes)
	_build_info()
	resized.connect(_layout)
	_layout()


func _overlay(texture: Texture2D) -> TextureRect:
	var rect := TextureRect.new()
	rect.texture = texture
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_art_box.add_child(rect)
	return rect


func _build_motes() -> CPUParticles2D:
	var motes := CPUParticles2D.new()
	motes.name = "Motes"
	motes.amount = MOTES
	motes.lifetime = MOTE_LIFE_S
	# Já espalhadas quando a tela abre, em vez de nascerem todas juntas.
	motes.preprocess = MOTE_LIFE_S
	motes.randomness = 1.0
	motes.local_coords = false
	motes.texture = _mote_texture()
	motes.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	motes.direction = Vector2(0, -1)
	motes.spread = 28.0
	motes.gravity = Vector2(0, -1.5)
	motes.initial_velocity_min = 6.0
	motes.initial_velocity_max = 15.0
	# Cada uma nasce de um tamanho sorteado, de um pontinho a um brilho maior e macio (textura de 32 px: de ~8 a ~50 px).
	motes.scale_amount_min = 0.25
	motes.scale_amount_max = 1.6
	motes.color = MOTE_COLOR
	# Acende devagar, fica e apaga devagar.
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.25, 0.7, 1.0])
	ramp.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.85), Color(1, 1, 1, 0.6), Color(1, 1, 1, 0)])
	motes.color_ramp = ramp
	# Somam luz à arte (aditivo): clareiam o que está embaixo em vez de pintar um disco por cima.
	var additive := CanvasItemMaterial.new()
	additive.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	motes.material = additive
	motes.emitting = drift
	motes.visible = drift
	return motes


## Um ponto de luz redondo e macio (centro claro que se desfaz na borda).
static func _mote_texture() -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.18, 0.5, 1.0])
	gradient.colors = PackedColorArray([Color(1, 1, 1, 0.9), Color(1, 1, 1, 0.5), Color(1, 1, 1, 0.12), Color(1, 1, 1, 0)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 32
	texture.height = 32
	return texture


func _build_info() -> void:
	_info = VBoxContainer.new()
	_info.name = "DeckInfo"
	_info.add_theme_constant_override("separation", 2)
	_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_info.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_info)
	var kicker := ModalStyle.label(16, HudStyle.GOLD, "SEU DECK")
	kicker.add_theme_font_override("font", HomeStyle.caps_font())
	kicker.add_theme_constant_override("outline_size", 0)
	kicker.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	kicker.add_theme_constant_override("shadow_offset_y", 1)
	_info.add_child(kicker)
	_title = ModalStyle.label(70, Color("#f3f5fa"), "")
	_title.name = "DeckName"
	_title.add_theme_font_override("font", HomeStyle.display_font())
	_title.add_theme_constant_override("outline_size", 0)
	_title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.42))
	_title.add_theme_constant_override("shadow_offset_x", 0)
	_title.add_theme_constant_override("shadow_offset_y", 3)
	_title.add_theme_constant_override("shadow_outline_size", 18)
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title.clip_text = true
	_info.add_child(_title)
	var meta := HBoxContainer.new()
	meta.add_theme_constant_override("separation", 14)
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_info.add_child(meta)
	_pips = HBoxContainer.new()
	_pips.add_theme_constant_override("separation", 4)
	_pips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.add_child(_pips)
	_meta = ModalStyle.label(20, HomeStyle.SOFT, "")
	_meta.name = "DeckMeta"
	_meta.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.5))
	meta.add_child(_meta)


func _layout() -> void:
	# Em pixels inteiros: numa borda fracionária a arte escaparia um fio além do degradê.
	var art_w: float = floorf(size.x * ART_SHARE)
	_art_box.position = Vector2.ZERO
	_art_box.size = Vector2(art_w, ceilf(size.y))
	for child: Node in _art_box.get_children():
		if child is TextureRect:
			(child as Control).position = Vector2(-1, -1)
			(child as Control).size = _art_box.size + Vector2(2, 2)
	for layer: Control in _layers:
		_fit_layer(layer)
	# As luzinhas nascem na parte de baixo e no meio da arte e sobem, apagando antes de chegar ao alto.
	_motes.position = Vector2(art_w * 0.46, size.y * 0.68)
	_motes.emission_rect_extents = Vector2(art_w * 0.42, size.y * 0.26)
	var left: float = maxf(56.0, size.x * 0.03)
	_info.position = Vector2(left, size.y * 0.755 - _info.get_combined_minimum_size().y)
	_info.size = Vector2(art_w - left - 40.0, 0)


## O deck da vez: nome, a linha do formato e as cores. Um deck novo (outra `key`) entra num esmaecer sobre o anterior.
func show_deck(key: String, title: String, meta: String, colors: PackedStringArray) -> void:
	_title.text = title
	_meta.text = meta
	_set_pips(colors)
	if key == _key:
		var current: Control = _layers[-1] if not _layers.is_empty() else null
		if current and not current.get_meta("has_art", false):
			(current.get_node("Placeholder") as TextureRect).texture = HomeStyle.placeholder(colors)
		return
	_key = key
	var layer := _new_layer(colors)
	_art_box.add_child(layer)
	# Por baixo dos degradês das bordas (eles ficam no fim da lista de filhos).
	_art_box.move_child(layer, _layers.size())
	_layers.append(layer)
	_fit_layer(layer)
	if is_inside_tree() and _layers.size() > 1:
		layer.modulate.a = 0.0
		var tween := create_tween()
		tween.tween_property(layer, "modulate:a", 1.0, FADE_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tween.tween_callback(_drop_old_layers)
		_info.modulate.a = 0.0
		create_tween().tween_property(_info, "modulate:a", 1.0, FADE_S * 0.8).set_delay(FADE_S * 0.25)
	else:
		_drop_old_layers()
	_layout()


## A arte da capa do deck da vez chegou (`key` é a do show_deck): aparece por cima do fundo provisório.
func set_art(key: String, texture: Texture2D) -> void:
	if key != _key or _layers.is_empty() or texture == null:
		return
	var layer: Control = _layers[-1]
	if _source(layer) == texture:
		return
	layer.set_meta("source", texture)
	var fresh: bool = not _paintings.has(texture)
	var painted: Texture2D = _painted(texture)
	if fresh and is_inside_tree():
		# A pintura sai no próximo quadro desenhado: até lá fica o que já estava (o fundo provisório, ou a pintura da
		# versão pequena da arte), sem piscar a original sem o filtro.
		RenderingServer.frame_post_draw.connect(_show_painting.bind(layer, texture, painted), CONNECT_ONE_SHOT)
	else:
		_show_painting(layer, texture, painted)


func _show_painting(layer: Control, source: Texture2D, painted: Texture2D) -> void:
	if not is_instance_valid(layer) or _source(layer) != source:
		return
	var art: TextureRect = layer.get_node("Art")
	art.texture = painted
	layer.set_meta("has_art", true)
	if is_inside_tree() and layer.modulate.a > 0.99:
		art.modulate.a = 0.0
		create_tween().tween_property(art, "modulate:a", 1.0, FADE_S).set_trans(Tween.TRANS_SINE)
	else:
		art.modulate.a = 1.0


## A arte original do deck à mostra agora (null enquanto só há o fundo provisório; na tela ela aparece pintada).
func art_texture() -> Texture2D:
	return _source(_layers[-1]) if not _layers.is_empty() else null


static func _source(layer: Control) -> Texture2D:
	return layer.get_meta("source") if layer.has_meta("source") else null


## A arte pintada de uma textura: a guardada, ou um viewport novo que a pinta no próximo quadro (um só) e guarda.
func _painted(source: Texture2D) -> Texture2D:
	if _paintings.has(source):
		var keep: SubViewport = _paintings[source]
		# A mais usada vai para o fim (a primeira da lista é a que sai quando enche).
		_paintings.erase(source)
		_paintings[source] = keep
		return keep.get_texture()
	var bake := SubViewport.new()
	bake.size = Vector2i((source.get_size() * PAINT_SCALE).round())
	bake.disable_3d = true
	bake.transparent_bg = false
	bake.render_target_update_mode = SubViewport.UPDATE_ONCE
	var canvas := TextureRect.new()
	canvas.texture = source
	canvas.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	canvas.stretch_mode = TextureRect.STRETCH_SCALE
	canvas.size = Vector2(bake.size)
	canvas.material = _paint_shader()
	bake.add_child(canvas)
	_bakery.add_child(bake)
	_paintings[source] = bake
	while _paintings.size() > PAINT_CACHE:
		var oldest: Texture2D = _paintings.keys()[0]
		var gone: SubViewport = _paintings[oldest]
		_paintings.erase(oldest)
		_forget_painting(gone)
	return bake.get_texture()


## Uma pintura que saiu da lista: some quando nenhuma camada a mostra mais (a anterior pode estar apagando).
func _forget_painting(bake: SubViewport) -> void:
	for layer: Control in _layers:
		if (layer.get_node("Art") as TextureRect).texture == bake.get_texture():
			layer.tree_exited.connect(bake.queue_free)
			return
	bake.queue_free()


func current_key() -> String:
	return _key


func _new_layer(colors: PackedStringArray) -> Control:
	var layer := Control.new()
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var placeholder := TextureRect.new()
	placeholder.name = "Placeholder"
	placeholder.texture = HomeStyle.placeholder(colors)
	placeholder.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	placeholder.stretch_mode = TextureRect.STRETCH_SCALE
	placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	placeholder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(placeholder)
	var art := TextureRect.new()
	art.name = "Art"
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.material = _material()
	layer.add_child(art)
	return layer


static func _paint_shader() -> ShaderMaterial:
	if _paint_material == null:
		var shader := Shader.new()
		shader.code = PAINT_SHADER
		_paint_material = ShaderMaterial.new()
		_paint_material.shader = shader
	return _paint_material


static func _material() -> ShaderMaterial:
	if _art_material == null:
		var shader := Shader.new()
		shader.code = ART_SHADER
		_art_material = ShaderMaterial.new()
		_art_material.shader = shader
	return _art_material


func _fit_layer(layer: Control) -> void:
	layer.position = Vector2.ZERO
	layer.size = _art_box.size
	var art: TextureRect = layer.get_node("Art")
	art.size = _art_box.size
	art.pivot_offset = Vector2(_art_box.size.x * 0.5, _art_box.size.y * 0.38)
	_apply_drift(art)


func _drop_old_layers() -> void:
	while _layers.size() > 1:
		var old: Control = _layers.pop_front()
		old.queue_free()


func _set_pips(colors: PackedStringArray) -> void:
	for child: Node in _pips.get_children():
		_pips.remove_child(child)
		child.queue_free()
	for color: String in (colors if not colors.is_empty() else PackedStringArray(["C"])):
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(color, 48)
		icon.custom_minimum_size = Vector2(24, 24)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if colors.is_empty():
			icon.modulate.a = 0.5
		_pips.add_child(icon)


func _process(delta: float) -> void:
	if not drift or _layers.is_empty():
		return
	_time += delta
	for layer: Control in _layers:
		_apply_drift(layer.get_node("Art") as TextureRect)


## A deriva bem lenta (Ken Burns): aproxima até 6% e anda um pouco para o lado, num ciclo de quase um minuto.
func _apply_drift(art: TextureRect) -> void:
	if not drift:
		art.scale = Vector2(1.02, 1.02)
		art.position = Vector2.ZERO
		return
	var phase: float = _time / DRIFT_PERIOD_S * TAU
	var zoom: float = 1.03 + DRIFT_ZOOM * 0.5 * (1.0 - cos(phase))
	art.scale = Vector2(zoom, zoom)
	art.position = Vector2(sin(phase * 0.5) * _art_box.size.x * 0.012, -sin(phase) * _art_box.size.y * 0.006)
