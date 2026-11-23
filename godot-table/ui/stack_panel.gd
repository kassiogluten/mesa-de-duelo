# Painel da pilha à direita da mesa: "Pilha N", o selo do topo (Mágica/Habilidade/Gatilho e a forma de conjurar), a faixa da
# lealdade ou dos modos, quem resolve agora, o efeito, os alvos e os outros itens na ordem em que resolvem. A carta grande
# do topo é a carta 3D da mesa, que voa até o vão do painel (TableView._place_stack pergunta onde fica com layer_rect).
class_name StackPanel
extends Control

## Mensagem pronta para o servidor ({type:"stack", id, gen}).
signal action(message: Dictionary)
## A carta de um item sob o mouse (null ao sair), para a carta ampliada.
signal preview(texture: Texture2D)
## O vão da carta mudou (recolheu, expandiu, a tela mudou de tamanho): a mesa recoloca as cartas da pilha.
signal layout_changed

const GOLD := Color("#f0b84a")
const WIDTH := 280.0
const MARGIN_RIGHT := 24.0
const TOP := 150.0
const HEADER_H := 44.0
## Altura da carta do topo na tela; a largura sai da proporção da carta.
const CARD_H := 270.0
const COLLAPSED_H := 84.0
## Quanto cada camada de baixo aparece por trás do topo (para cima e para a esquerda), até a terceira.
const PEEK := Vector2(-10, -13)
const MAX_PEEK := 3
const MAX_ROWS := 3
const KIND_COLORS := {"spell": Color("#8f74ff"), "ability": Color("#3fb6c9"), "trigger": Color("#f0b84a")}
const TONE_COLORS := {"up": Color("#3fbf6a"), "down": Color("#e0574f"), "zero": Color("#9aa3b5")}

var catalog: CardCatalog
var collapsed: bool = false

var _state: Dictionary = {}
var _top_id: int = -1
var _header: PanelContainer
var _count: Label
var _toggle: Button
var _badge: PanelContainer
var _badge_label: Label
var _status: PanelContainer
var _status_label: Label
var _strip: PanelContainer
var _strip_box: VBoxContainer
var _effect_face: PanelContainer
var _effect_face_label: Label
var _info: PanelContainer
var _owner: Label
var _effect: Label
var _cast: Label
var _targets: Label
var _choose: Button
var _rows: VBoxContainer
var _rows_title: Label
## O aro de luz em volta do vão quando uma carta nova pousa no topo.
var _flash: Panel


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

	_header = _pill(Color(0.05, 0.07, 0.12, 0.92), 22)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_header.add_child(head)
	var title := Hud._label(22, Color(1, 0.97, 0.9))
	title.text = "Pilha"
	head.add_child(title)
	_count = Hud._label(18, Color(0.12, 0.08, 0.02))
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_count.custom_minimum_size = Vector2(30, 30)
	_count.add_theme_constant_override("outline_size", 0)
	var count_bg := PanelContainer.new()
	count_bg.add_theme_stylebox_override("panel", _style(GOLD, 15, 2, 0))
	count_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	count_bg.add_child(_count)
	head.add_child(count_bg)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(spacer)
	_toggle = Button.new()
	_toggle.custom_minimum_size = Vector2(34, 30)
	_toggle.add_theme_font_size_override("font_size", 20)
	_toggle.flat = true
	_toggle.add_theme_color_override("font_color", Color(1, 1, 1, 0.8))
	_toggle.pressed.connect(func() -> void:
		collapsed = not collapsed
		_refresh()
		layout_changed.emit())
	head.add_child(_toggle)

	_effect_face = _pill(Color(0.1, 0.11, 0.17, 0.97), 14)
	_effect_face_label = Hud._label(17, Color(1, 1, 1, 0.9))
	_effect_face_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_effect_face_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_effect_face_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_effect_face.add_child(_effect_face_label)

	_strip = _pill(Color(0.04, 0.05, 0.09, 0.9), 10)
	_strip_box = VBoxContainer.new()
	_strip_box.add_theme_constant_override("separation", 4)
	_strip_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_strip.add_child(_strip_box)

	_badge = _pill(Color(0.05, 0.06, 0.1, 0.95), 14)
	_badge_label = Hud._label(15, Color.WHITE)
	_badge_label.uppercase = true
	_badge.add_child(_badge_label)

	_status = _pill(Color(0.05, 0.06, 0.1, 0.95), 14)
	_status_label = Hud._label(15, GOLD)
	_status.add_child(_status_label)

	_info = _pill(Color(0.05, 0.07, 0.12, 0.9), 14)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_info.add_child(column)
	_owner = Hud._label(15, GOLD)
	column.add_child(_owner)
	_effect = _wrapping(16, Color(1, 1, 1, 0.92))
	_effect.max_lines_visible = 5
	_effect.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_effect)
	_cast = _wrapping(14, Color(0.78, 0.84, 1.0, 0.9))
	column.add_child(_cast)
	_targets = _wrapping(15, Color(1.0, 0.82, 0.55))
	column.add_child(_targets)
	_choose = Hud._button("Escolher como alvo", true)
	_choose.custom_minimum_size = Vector2(0, 40)
	_choose.add_theme_font_size_override("font_size", 16)
	_choose.pressed.connect(func() -> void: _send(_top_id))
	column.add_child(_choose)
	_rows_title = Hud._label(13, Color(1, 1, 1, 0.5))
	_rows_title.text = "Depois, nesta ordem"
	column.add_child(_rows_title)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 4)
	column.add_child(_rows)

	_flash = Panel.new()
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.modulate.a = 0.0
	var ring := StyleBoxFlat.new()
	ring.draw_center = false
	ring.set_border_width_all(6)
	ring.set_corner_radius_all(12)
	ring.border_blend = true
	_flash.add_theme_stylebox_override("panel", ring)
	add_child(_flash)
	# O cabeçalho e o texto seguram o clique (não vaza para a carta da mesa atrás); o vão da carta deixa passar.
	_header.mouse_filter = Control.MOUSE_FILTER_STOP
	_info.mouse_filter = Control.MOUSE_FILTER_STOP
	for node: Control in [_effect_face, _strip, _info, _badge, _status, _header]:
		add_child(node)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_place()
			layout_changed.emit())


## Mostra a pilha do estado (some com a pilha vazia ou no fim do jogo).
func apply_state(state: Dictionary) -> void:
	_state = state
	_refresh()


## Onde fica na tela a camada `depth` da pilha (0 é o topo): o retângulo da carta. Não depende do estado: a mesa pode
## perguntar antes do painel receber o estado novo.
func layer_rect(depth: int) -> Rect2:
	var view: Vector2 = get_viewport_rect().size
	var left: float = view.x - MARGIN_RIGHT - WIDTH
	if collapsed:
		var small := Vector2(COLLAPSED_H * CardNode.SIZE.x / CardNode.SIZE.y, COLLAPSED_H)
		var d: int = mini(depth, 2)
		return Rect2(Vector2(view.x - MARGIN_RIGHT - small.x - 14.0 + d * -6.0, TOP + HEADER_H + 14.0 + d * -6.0), small)
	var size := Vector2(CARD_H * CardNode.SIZE.x / CardNode.SIZE.y, CARD_H)
	var base := Vector2(left + (WIDTH - size.x) / 2.0 - PEEK.x * MAX_PEEK / 2.0, TOP + HEADER_H + 22.0 - PEEK.y * MAX_PEEK)
	return Rect2(base + PEEK * mini(depth, MAX_PEEK), size)


func _refresh() -> void:
	var stack: Array = _state.get("stack", []) if _state.get("stack") is Array else []
	var show: bool = not stack.is_empty() and not bool(_state.get("gameOver", false))
	visible = show
	if not show:
		_top_id = -1
		return
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	var selectable: Array = input.get("selectableStacks", []) if input.get("selectableStacks") is Array else []
	var top: Dictionary = stack[0]
	var source: Dictionary = top.get("source", {}) if top.get("source") is Dictionary else {}
	var pt: String = _pt_text(source)
	var kind: String = StackText.kind_of(top)
	_count.text = str(stack.size())
	_toggle.text = "+" if collapsed else "−"
	_toggle.tooltip_text = "Expandir a pilha" if collapsed else "Recolher a pilha para ver o campo"

	var badge: String = StackText.badge_text(top)
	_badge_label.text = badge
	_badge.visible = badge != "" and not collapsed
	(_badge.get_theme_stylebox("panel") as StyleBoxFlat).border_color = KIND_COLORS.get(kind, Color(1, 1, 1, 0.3))
	_badge_label.add_theme_color_override("font_color", (KIND_COLORS.get(kind, Color.WHITE) as Color).lightened(0.35))

	var waiting: Dictionary = StackText.resolving_choice(_state)
	_status_label.text = StackText.top_label(_state)
	_status.visible = not collapsed
	var status_style: StyleBoxFlat = _status.get_theme_stylebox("panel")
	status_style.border_color = Color(1.0, 0.55, 0.3) if not waiting.is_empty() else GOLD
	status_style.bg_color = Color(0.3, 0.14, 0.04, 0.96) if not waiting.is_empty() and bool(waiting["mine"]) else Color(0.05, 0.06, 0.1, 0.95)

	_effect_face.visible = source.is_empty() and not collapsed
	_effect_face_label.text = "Efeito na pilha\n\n" + StackText.effect_text(top, "")

	_fill_strip(top, pt)
	_strip.visible = _strip_box.get_child_count() > 0 and not collapsed

	var owner: String = StackText.player_name(_state, int(top.get("controller", -1)), "")
	_owner.text = StackText.owner_line(top, int(_state.get("you", 0)), owner)
	var loyalty_line: String = StackText.loyalty_line(top)
	_effect.text = StackText.effect_text(top, pt) if _strip_box.get_child_count() == 0 else (loyalty_line if loyalty_line != "" else "")
	_effect.visible = _effect.text != ""
	_cast.text = StackText.cast_line(top.get("cast"))
	_cast.visible = _cast.text != ""
	_targets.text = StackText.targets_text(_state, top.get("targets"), _translate)
	_targets.visible = _targets.text != ""
	_choose.visible = selectable.any(func(id: Variant) -> bool: return int(id) == int(top.get("id", -1)))
	_fill_rows(stack, selectable)
	_info.visible = not collapsed

	var id: int = int(top.get("id", -1))
	if id != _top_id:
		_top_id = id
		# A carta voa até o vão; o texto chega logo depois dela.
		for node: Control in [_info, _badge, _status, _strip]:
			node.modulate.a = 0.0
			var tween := node.create_tween()
			tween.tween_interval(0.28)
			tween.tween_property(node, "modulate:a", 1.0, 0.22)
		if not collapsed:
			_land_flash(KIND_COLORS.get(kind, GOLD))
	_place.call_deferred()


## A faixa no pé da carta: a habilidade de lealdade (custo e texto) ou os modos escolhidos, um por linha.
func _fill_strip(top: Dictionary, pt: String) -> void:
	for child: Node in _strip_box.get_children():
		child.queue_free()
		_strip_box.remove_child(child)
	var loyalty: Dictionary = StackText.loyalty_strip(top, pt)
	if not loyalty.is_empty():
		_strip_box.add_child(_chip_row(Txt.of(loyalty["cost"]), TONE_COLORS.get(loyalty["tone"], Color.GRAY), Txt.of(loyalty["text"])))
		return
	for row: Dictionary in StackText.mode_rows(top, pt):
		_strip_box.add_child(_chip_row(str(int(row["index"])), Color("#6f7d99"), Txt.of(row["text"])))


func _chip_row(chip: String, color: Color, text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var chip_bg := PanelContainer.new()
	chip_bg.add_theme_stylebox_override("panel", _style(color, 6, 6, 1))
	chip_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip_bg.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var chip_label := Hud._label(16, Color.WHITE)
	chip_label.text = chip
	chip_bg.add_child(chip_label)
	row.add_child(chip_bg)
	var label := _wrapping(14, Color(1, 1, 1, 0.95))
	label.text = text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.custom_minimum_size = Vector2(150, 0)
	label.max_lines_visible = 4
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	row.add_child(label)
	return row


## Os outros itens, na ordem em que resolvem (os iguais seguidos juntos, ×N); o escolhível aceso e clicável.
func _fill_rows(stack: Array, selectable: Array) -> void:
	for child: Node in _rows.get_children():
		child.queue_free()
		_rows.remove_child(child)
	var groups: Array = StackText.group(stack, selectable)
	var shown: int = 0
	for g: Dictionary in groups:
		if int(g["at"]) == 0:
			continue
		if shown >= MAX_ROWS:
			var more := Hud._label(13, Color(1, 1, 1, 0.5))
			more.text = "+ %d na pilha" % (stack.size() - int(g["at"]))
			_rows.add_child(more)
			break
		shown += 1
		_rows.add_child(_row(g, selectable))
	_rows_title.visible = shown > 0


func _row(g: Dictionary, selectable: Array) -> Button:
	var item: Dictionary = g["item"]
	var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
	var count: int = int(g["count"])
	var at: int = int(g["at"])
	var pick: bool = selectable.any(func(id: Variant) -> bool: return int(id) == int(item.get("id", -1)))
	var name: String = _translate.call(Txt.of(source.get("name"))) if source.has("name") else "Efeito"
	var order: String = "%d–%d" % [at + 1, at + count] if count > 1 else str(at + 1)
	var button := Button.new()
	button.tooltip_text = "%s
%s" % [StackText.owner_line(item, int(_state.get("you", 0)), StackText.player_name(_state, int(item.get("controller", -1)), "")), StackText.effect_text(item, _pt_text(source))]
	button.custom_minimum_size = Vector2(0, 34)
	var line := HBoxContainer.new()
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	line.offset_left = 12
	line.offset_right = -10
	line.add_theme_constant_override("separation", 8)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(line)
	var number := Hud._label(15, Color(1, 1, 1, 0.5))
	number.text = order
	line.add_child(number)
	var title := Hud._label(15, Color(1, 0.92, 0.7) if pick else Color(1, 1, 1, 0.88))
	title.text = name + ("  ×%d" % count if count > 1 else "")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	line.add_child(title)
	var tag := Hud._label(13, (KIND_COLORS.get(StackText.kind_of(item), Color.GRAY) as Color).lightened(0.3))
	tag.text = StackText.badge_text(item)
	line.add_child(tag)
	for label: Label in [number, title, tag]:
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.size_flags_vertical = Control.SIZE_FILL
	var mine: bool = int(item.get("controller", -1)) == int(_state.get("you", -2))
	var edge: Color = GOLD if pick else (Color(0.45, 0.65, 1.0, 0.5) if mine else Color(1.0, 0.5, 0.45, 0.45))
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		var style := _style(Color(0.22, 0.18, 0.08, 0.95) if pick else Color(0.1, 0.12, 0.19, 0.9), 8, 10, 0)
		if state_name == "hover":
			style.bg_color = style.bg_color.lightened(0.12)
		style.border_color = edge
		style.border_width_left = 4
		button.add_theme_stylebox_override(state_name, style)
	var id: int = int(item.get("id", -1))
	button.pressed.connect(func() -> void:
		if pick:
			_send(id))
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if pick else Control.CURSOR_ARROW
	button.mouse_entered.connect(func() -> void:
		if catalog and not source.is_empty():
			preview.emit(catalog.texture(catalog.image_url_for(source))))
	button.mouse_exited.connect(func() -> void: preview.emit(null))
	return button


## Quando a carta pousa no vão: um aro na cor do tipo do item abre e some em volta dela.
func _land_flash(color: Color) -> void:
	var card: Rect2 = layer_rect(0)
	var ring: StyleBoxFlat = _flash.get_theme_stylebox("panel")
	ring.border_color = color.lightened(0.2)
	_flash.position = card.position - Vector2(4, 4)
	_flash.size = card.size + Vector2(8, 8)
	_flash.pivot_offset = _flash.size / 2.0
	_flash.scale = Vector2.ONE
	_flash.modulate.a = 0.0
	var tween := _flash.create_tween()
	tween.tween_interval(0.3)
	tween.tween_property(_flash, "modulate:a", 1.0, 0.06)
	tween.tween_property(_flash, "scale", Vector2(1.12, 1.12), 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(_flash, "modulate:a", 0.0, 0.45)


func _send(id: int) -> void:
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	action.emit({"type": "stack", "id": id, "gen": int(input.get("gen", 0))})


## Põe cada peça em volta do vão da carta do topo.
func _place() -> void:
	var view: Vector2 = get_viewport_rect().size
	var left: float = view.x - MARGIN_RIGHT - WIDTH
	var card: Rect2 = layer_rect(0)
	_header.position = Vector2(left, TOP)
	_header.size = Vector2(WIDTH, HEADER_H)
	if collapsed:
		return
	_effect_face.position = card.position
	_effect_face.size = card.size
	_badge.reset_size()
	_badge.position = Vector2(card.get_center().x - _badge.size.x / 2.0, card.position.y - _badge.size.y / 2.0)
	_status.reset_size()
	_status.position = Vector2(card.get_center().x - _status.size.x / 2.0, card.end.y - _status.size.y / 2.0)
	_strip.size = Vector2(card.size.x + 24.0, 0)
	_strip.reset_size()
	_strip.size.x = card.size.x + 24.0
	_strip.position = Vector2(card.get_center().x - _strip.size.x / 2.0, card.end.y - _status.size.y / 2.0 - _strip.size.y - 4.0)
	_info.position = Vector2(left, card.end.y + _status.size.y / 2.0 + 10.0)
	_info.size = Vector2(WIDTH, 0)
	_info.reset_size()
	_info.size.x = WIDTH


func _pt_text(source: Dictionary) -> String:
	if catalog == null or not source.has("name"):
		return ""
	return Txt.of(catalog.info(Txt.of(source["name"])).get("text"))


var _translate: Callable = func(name: String) -> String: return catalog.label(name) if catalog else name


static func _style(color: Color, radius: int, margin_x: int, border: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = margin_x
	style.content_margin_right = margin_x
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	style.set_border_width_all(border)
	style.border_color = Color(1, 1, 1, 0.14)
	return style


func _pill(color: Color, radius: int) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := _style(color, radius, 14, 1)
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 8
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return panel


static func _wrapping(size: int, color: Color) -> Label:
	var label := Hud._label(size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(WIDTH - 30.0, 0)
	return label
