# Uma opção em lista numa escolha (modo, jeito de jogar, voto, nome): a tecla de atalho, o texto com os símbolos de mana,
# um detalhe embaixo e o custo à direita; acende com o mouse e fica dourada quando escolhida.
class_name ChoiceOption
extends PanelContainer

signal pressed

var selected: bool = false
var disabled: bool = false
var _hover: bool = false
var _key: PanelContainer
var _title: RichTextLabel
var _title_size: int = 18


## `key` é a tecla ("1"…; vazio sem tecla), `detail` o texto menor embaixo e `cost` o custo em símbolos ("{1}{R}").
func setup(text: String, detail: String = "", cost: String = "", key: String = "", side: Control = null) -> ChoiceOption:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)
	if key != "":
		_key = ModalStyle.badge(key, false, 28)
		_key.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(_key)
	var texts := VBoxContainer.new()
	texts.add_theme_constant_override("separation", 2)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(texts)
	_title = ModalStyle.rich(text, _title_size, ModalStyle.INK)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.add_child(_title)
	if detail != "":
		var small := ModalStyle.rich(detail, 14, ModalStyle.MUTED)
		small.name = "Detail"
		small.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		texts.add_child(small)
	if cost != "" and not ManaSymbols.parse(cost).is_empty():
		var icons := ModalStyle.cost_icons(cost, 22)
		icons.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icons)
	if side:
		side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(side)
	mouse_entered.connect(func() -> void:
		_hover = true
		_paint())
	mouse_exited.connect(func() -> void:
		_hover = false
		_paint())
	_paint()
	return self


func set_selected(on: bool) -> void:
	selected = on
	if _key:
		ModalStyle.paint_badge(_key, on)
		if on:
			ModalStyle.pop(_key, 0.6)
	_paint()


## Desligada: apagada, sem clique, com o motivo ao lado (`why`).
func set_disabled(on: bool, why: String = "") -> void:
	disabled = on
	modulate = Color(1, 1, 1, 0.45) if on else Color.WHITE
	mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if on else Control.CURSOR_POINTING_HAND
	if on and why != "":
		var reason := ModalStyle.label(13, ModalStyle.WARN, why)
		(get_child(0) as HBoxContainer).add_child(reason)
	_paint()


## O texto da opção como aparece (sem os ícones), para os testes.
func text() -> String:
	return _title.get_parsed_text()


func _gui_input(event: InputEvent) -> void:
	if disabled:
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		pressed.emit()
		accept_event()


func _paint() -> void:
	var fill := Color(0.085, 0.125, 0.21, 0.92)
	var border := Color(0.62, 0.76, 1.0, 0.16)
	var width: int = 1
	if selected:
		fill = Color(0.24, 0.18, 0.07, 0.95)
		border = ModalStyle.GOLD
		width = 2
	elif _hover and not disabled:
		fill = Color(0.12, 0.17, 0.28, 0.96)
		border = Color(ModalStyle.BLUE, 0.85)
		width = 2
	var style := ModalStyle.box(fill, 14, border, width)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	if selected:
		style.shadow_color = Color(ModalStyle.GOLD, 0.3)
		style.shadow_size = 12
	elif _hover and not disabled:
		style.shadow_color = Color(ModalStyle.BLUE, 0.22)
		style.shadow_size = 10
	add_theme_stylebox_override("panel", style)
	_title.add_theme_color_override("default_color", ModalStyle.GOLD_LIGHT if selected else ModalStyle.INK)
