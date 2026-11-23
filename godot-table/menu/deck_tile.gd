# Um deck na fileira da tela inicial: a arte da capa recortada em cantos redondos e o nome; o escolhido com o contorno dourado.
class_name DeckTile
extends Button

const SIZE := Vector2(192, 112)
const RADIUS := 12
## Quanto o escolhido sobe.
const LIFT := 5.0

## O índice do deck na fileira (-1 no "+ Meus decks").
var index: int = -1
var selected: bool = false

var _mask: Panel
var _placeholder: TextureRect
var _art: TextureRect
var _outline: Panel
var _hovered: bool = false


## `title` é o nome do deck; `more` faz o ladrilho "+ Meus decks" (sem arte).
func _init(title: String, colors: PackedStringArray = [], more: bool = false) -> void:
	custom_minimum_size = SIZE
	flat = true
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state_name, StyleBoxEmpty.new())
	# A máscara de cantos redondos: o que fica dentro dela é recortado pelo desenho dela.
	_mask = Panel.new()
	_mask.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	_mask.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mask.add_theme_stylebox_override("panel", ModalStyle.box(Color(0.08, 0.1, 0.17, 0.92) if more else HomeStyle.BG, RADIUS))
	add_child(_mask)
	if more:
		var caption := ModalStyle.label(17, HomeStyle.DIM, title)
		caption.add_theme_font_override("font", HudStyle.bold_font())
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		caption.name = "Caption"
		_mask.add_child(caption)
	else:
		_placeholder = _cover_rect()
		_placeholder.texture = HomeStyle.placeholder(colors)
		_mask.add_child(_placeholder)
		_art = _cover_rect()
		_art.modulate.a = 0.0
		_mask.add_child(_art)
		# Escurece embaixo para o nome ficar legível sobre qualquer arte.
		var shade := _cover_rect()
		shade.texture = HomeStyle.fade([[0.0, Color(0, 0, 0, 0)], [0.5, Color(0, 0, 0, 0.05)], [1.0, Color(0, 0, 0, 0.82)]], Vector2(0, 0), Vector2(0, 1))
		_mask.add_child(shade)
		var name_label := ModalStyle.label(15, Color.WHITE, title)
		name_label.name = "Title"
		name_label.add_theme_font_override("font", HudStyle.bold_font())
		name_label.add_theme_constant_override("outline_size", 5)
		name_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		name_label.clip_text = true
		name_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		name_label.offset_left = 10
		name_label.offset_right = -10
		name_label.offset_top = -32
		name_label.offset_bottom = -7
		_mask.add_child(name_label)
		# O nome já está escrito no ladrilho: a dica só para o que não coube (cortado com reticências).
		if name_label.get_theme_font("font").get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x > SIZE.x - 20:
			tooltip_text = title
	_outline = Panel.new()
	_outline.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_outline)
	mouse_entered.connect(func() -> void:
		_hovered = true
		_paint())
	mouse_exited.connect(func() -> void:
		_hovered = false
		_paint())
	resized.connect(_layout)
	_paint()


func _ready() -> void:
	_layout()


## A arte da capa chegou: aparece por cima do fundo provisório.
func set_art(texture: Texture2D) -> void:
	if _art == null or _art.texture == texture:
		return
	_art.texture = texture
	if is_inside_tree():
		create_tween().tween_property(_art, "modulate:a", 1.0, 0.3)
	else:
		_art.modulate.a = 1.0


func has_art() -> bool:
	return _art != null and _art.texture != null


func set_selected(on: bool) -> void:
	selected = on
	_paint()
	_layout()


func _cover_rect() -> TextureRect:
	var rect := TextureRect.new()
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return rect


func _layout() -> void:
	var lift: float = LIFT if selected else 0.0
	for part: Control in [_mask, _outline]:
		part.position = Vector2(0, LIFT - lift)
		part.size = size - Vector2(0, LIFT)


## O contorno e o brilho: dourado no escolhido; claro ao passar o mouse; apagado nos outros.
func _paint() -> void:
	var border: Color = Color(1, 1, 1, 0.14)
	var width: int = 1
	if selected:
		border = HudStyle.GOLD
		width = 3
	elif _hovered:
		border = Color(HudStyle.GOLD, 0.55)
		width = 2
	var style := ModalStyle.box(Color(0, 0, 0, 0), RADIUS, border, width)
	style.draw_center = false
	if selected:
		style.shadow_color = Color(HudStyle.GOLD, 0.32)
		style.shadow_size = 14
	_outline.add_theme_stylebox_override("panel", style)
	_mask.modulate = Color(1, 1, 1, 1.0 if selected or _hovered else 0.72)
