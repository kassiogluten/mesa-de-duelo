# A capa da tela inicial: a arte do deck escolhido ocupando a esquerda como a capa de um jogo, apagando no fundo à direita
# e embaixo, com "SEU DECK", o nome e a linha das cores e do formato; troca de deck num esmaecer e deriva bem devagar.
class_name HomeCover
extends Control

## Quanto da largura da tela a arte ocupa.
const ART_SHARE := 0.66
const FADE_S := 0.35
## Um ciclo inteiro da deriva lenta da arte (aproxima e afasta, andando um pouco para o lado).
const DRIFT_PERIOD_S := 46.0
const DRIFT_ZOOM := 0.06
## A arte recortada do Scryfall tem uns 626 px de largura e aqui fica com mais de 1200: o desenho suaviza os blocos do
## JPEG ampliado e põe um grão fino por cima, que lê como pintura em vez de imagem esticada.
const ART_SHADER := """
shader_type canvas_item;
uniform float grain = 0.022;
void fragment() {
	vec2 px = TEXTURE_PIXEL_SIZE * 0.85;
	vec4 c = texture(TEXTURE, UV) * 0.36;
	c += texture(TEXTURE, UV + vec2(px.x, px.y)) * 0.16;
	c += texture(TEXTURE, UV + vec2(-px.x, px.y)) * 0.16;
	c += texture(TEXTURE, UV + vec2(px.x, -px.y)) * 0.16;
	c += texture(TEXTURE, UV + vec2(-px.x, -px.y)) * 0.16;
	// hash12 (Dave Hoskins): sem os padrões de listras do fract(sin()) em coordenadas grandes.
	vec3 p3 = fract(vec3(FRAGCOORD.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	float n = fract((p3.x + p3.y) * p3.z);
	c.rgb += (n - 0.5) * grain;
	COLOR = c * COLOR;
}
"""

## A deriva lenta da arte (desligada no nível de efeitos leve).
var drift: bool = true

var _art_box: Control
## As camadas da arte: a do deck da vez por cima, as antigas apagando embaixo.
var _layers: Array[Control] = []
var _key: String = ""
var _info: VBoxContainer
var _title: Label
var _pips: HBoxContainer
var _meta: Label
var _time: float = 0.0
static var _art_material: ShaderMaterial


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
	var art: TextureRect = layer.get_node("Art")
	if art.texture == texture:
		return
	art.texture = texture
	layer.set_meta("has_art", true)
	if is_inside_tree() and layer.modulate.a > 0.99:
		art.modulate.a = 0.0
		create_tween().tween_property(art, "modulate:a", 1.0, FADE_S).set_trans(Tween.TRANS_SINE)
	else:
		art.modulate.a = 1.0


## A textura da arte à mostra agora (null enquanto só há o fundo provisório).
func art_texture() -> Texture2D:
	return (_layers[-1].get_node("Art") as TextureRect).texture if not _layers.is_empty() else null


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
