# Uma carta numa escolha: a imagem grande de cantos redondos; com o mouse sobe, cresce e ganha reflexo; escolhida, sobe com
# o contorno dourado; o selo redondo mostra a ordem, e a tecla de atalho fica no canto.
class_name ChoiceCard
extends VBoxContainer

## Clique esquerdo.
signal pressed
## Clique direito (abrir a carta de perto).
signal inspect
signal hovered(on: bool)

const ASPECT := 88.0 / 63.0
## Espaço em cima para a carta subir sem empurrar as vizinhas.
const LIFT_ROOM := 20.0
const IMAGE_SHADER := preload("res://ui/choice_card.gdshader")

## O FCard (ou null numa carta sem dados).
var card: Variant = null
var card_size: Vector2 = Vector2(200, 279)
var interactive: bool = true
var selected: bool = false
var dimmed: bool = false

var _card: Control
var _base: Panel
var _image: TextureRect
var _name: Label
var _outline: Panel
var _badge: PanelContainer
var _check: PanelContainer
var _key: PanelContainer
var _caption: Label
var _hover: bool = false
var _badge_lit: bool = false
var _tween: Tween


## Monta a carta com `width` de largura; `text` é o texto embaixo (habilidade), `caption` a legenda curta.
func setup(data: Variant, width: float, text: String = "", caption: String = "") -> ChoiceCard:
	card = data
	card_size = Vector2(width, round(width * ASPECT))
	add_theme_constant_override("separation", 8)
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var stage := Control.new()
	stage.custom_minimum_size = card_size + Vector2(0, LIFT_ROOM)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stage)
	_card = Control.new()
	_card.size = card_size
	_card.position = Vector2(0, LIFT_ROOM)
	_card.pivot_offset = card_size / 2.0
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(_card)
	var radius: int = int(round(width * 0.045))
	_base = Panel.new()
	var base_style := ModalStyle.box(Color(0.1, 0.13, 0.2), radius, Color(1, 1, 1, 0.1), 1)
	base_style.shadow_color = Color(0, 0, 0, 0.6)
	base_style.shadow_size = 18
	base_style.shadow_offset = Vector2(0, 10)
	_base.add_theme_stylebox_override("panel", base_style)
	_base.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card.add_child(_base)
	_name = ModalStyle.wrap(maxi(13, int(width / 12.0)), Color(1, 1, 1, 0.85), "", 0.0)
	_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_name.offset_left = 10
	_name.offset_right = -10
	_card.add_child(_name)
	_image = TextureRect.new()
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_SCALE
	_image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader_material := ShaderMaterial.new()
	shader_material.shader = IMAGE_SHADER
	shader_material.set_shader_parameter("aspect", ASPECT)
	shader_material.set_shader_parameter("sheen", 0.0)
	_image.material = shader_material
	_card.add_child(_image)
	_outline = Panel.new()
	_outline.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: int in [SIDE_LEFT, SIDE_TOP]:
		_outline.set_offset(side, -4)
	for side: int in [SIDE_RIGHT, SIDE_BOTTOM]:
		_outline.set_offset(side, 4)
	_outline.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_outline.visible = false
	_card.add_child(_outline)
	_key = PanelContainer.new()
	_key.visible = false
	_card.add_child(_key)
	_check = ModalStyle.badge("✓", true, 34)
	_check.position = Vector2(card_size.x - 24, -10)
	_check.visible = false
	_card.add_child(_check)
	_badge = ModalStyle.badge("", true, 36)
	_badge.position = Vector2(-12, -12)
	_badge.visible = false
	_card.add_child(_badge)
	if caption != "":
		_caption = ModalStyle.wrap(16, ModalStyle.MUTED, caption, width)
		add_child(_caption)
	if text != "":
		var body := ModalStyle.rich(text, 15, Color(1, 1, 1, 0.84), true, width)
		add_child(body)
	mouse_entered.connect(_set_hover.bind(true))
	mouse_exited.connect(_set_hover.bind(false))
	_paint()
	return self


## A imagem chegou (null: mostra o nome no lugar).
func set_texture(tex: Texture2D, fallback_name: String = "") -> void:
	_image.texture = tex
	_name.text = "" if tex != null else fallback_name


## Marca como escolhida (sobe com o contorno dourado e o ✓, quando `check`).
func set_selected(on: bool, check: bool = true) -> void:
	if on == selected and _check.visible == (on and check):
		return
	selected = on
	_check.visible = on and check
	if _check.visible:
		ModalStyle.pop(_check)
	_paint()


## O selo da ordem ("1", "2"…); vazio esconde. Um número novo entra com um pop.
func set_badge(text: String, lit: bool = true) -> void:
	var number: Label = _badge.get_node("Number")
	var changed: bool = number.text != text or not _badge.visible or (lit and not _badge_lit)
	_badge_lit = lit
	number.text = text
	_badge.visible = text != ""
	ModalStyle.paint_badge(_badge, lit)
	if changed and _badge.visible:
		ModalStyle.pop(_badge, 0.3)


## A legenda embaixo da carta (e se fica dourada).
func set_caption(text: String, lit: bool = false) -> void:
	if _caption == null:
		_caption = ModalStyle.wrap(16, ModalStyle.MUTED, "", card_size.x)
		add_child(_caption)
		move_child(_caption, 1)
	_caption.text = text
	_caption.add_theme_color_override("font_color", ModalStyle.GOLD if lit else ModalStyle.MUTED)


## O texto do selo (vazio sem selo), para os testes.
func badge_text() -> String:
	return (_badge.get_node("Number") as Label).text if _badge.visible else ""


## A tecla de atalho no canto de baixo da carta.
func set_key(text: String) -> void:
	for child: Node in _key.get_children():
		_key.remove_child(child)
		child.queue_free()
	_key.visible = text != ""
	if text == "":
		return
	# Escura e meio para fora da borda de baixo: legível em cima de qualquer moldura de carta.
	var style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.92), 6, Color(1, 1, 1, 0.35), 1)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 1
	style.content_margin_bottom = 2
	_key.add_theme_stylebox_override("panel", style)
	_key.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var label := ModalStyle.label(13, Color(1, 1, 1, 0.85), text)
	label.add_theme_constant_override("outline_size", 0)
	_key.add_child(label)
	_key.reset_size()
	_key.position = Vector2((card_size.x - _key.get_combined_minimum_size().x) / 2.0, card_size.y - 11)


## Apagada: sem clique, meio transparente.
func set_dimmed(on: bool) -> void:
	dimmed = on
	interactive = not on
	modulate = Color(1, 1, 1, 0.36) if on else Color.WHITE
	mouse_default_cursor_shape = Control.CURSOR_ARROW if on else Control.CURSOR_POINTING_HAND
	_paint()


## A carta vem deslizando de onde estava (`old_x`, posição global) até o lugar novo.
func slide_from(old_x: float) -> void:
	var dx: float = old_x - global_position.x
	if absf(dx) < 1.0:
		return
	_card.position.x = dx
	var tween := create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_card, "position:x", 0.0, 0.2)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and _hover:
		var light: Vector2 = (event as InputEventMouseMotion).position / Vector2(maxf(size.x, 1.0), maxf(card_size.y + LIFT_ROOM, 1.0))
		(_image.material as ShaderMaterial).set_shader_parameter("light", light)
	if not (event is InputEventMouseButton) or not (event as InputEventMouseButton).pressed:
		return
	var button: MouseButton = (event as InputEventMouseButton).button_index
	if button == MOUSE_BUTTON_RIGHT:
		inspect.emit()
		accept_event()
	elif button == MOUSE_BUTTON_LEFT and interactive:
		pressed.emit()
		accept_event()


func _set_hover(on: bool) -> void:
	_hover = on and interactive
	hovered.emit(on)
	_paint()


## Leva a carta ao jeito do estado (repouso, mouse por cima, escolhida) com uma animação curta.
func _paint() -> void:
	if _card == null:
		return
	var lift: float = 0.0
	if selected:
		lift = 16.0
	elif _hover:
		lift = 9.0
	var grow: float = 1.05 if _hover else 1.0
	_outline.visible = (selected or _hover) and not dimmed
	if _outline.visible:
		var color: Color = ModalStyle.GOLD if selected else Color(ModalStyle.BLUE, 0.85)
		var style := ModalStyle.box(Color(0, 0, 0, 0), int(round(card_size.x * 0.045)) + 4, color, 3 if selected else 2)
		style.shadow_color = Color(color, 0.45 if selected else 0.35)
		style.shadow_size = 18 if selected else 12
		style.draw_center = false
		_outline.add_theme_stylebox_override("panel", style)
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.tween_property(_card, "position:y", LIFT_ROOM - lift, 0.16)
	_tween.tween_property(_card, "scale", Vector2(grow, grow), 0.16)
	_tween.tween_method(func(v: float) -> void: (_image.material as ShaderMaterial).set_shader_parameter("sheen", v),
		float((_image.material as ShaderMaterial).get_shader_parameter("sheen")), 1.0 if _hover else 0.0, 0.2)
