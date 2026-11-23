# A lista dos itens debaixo do topo da pilha, na ordem em que resolvem: o item que acabou de ser coberto entra deslizando
# por cima e empurra os outros para baixo; o que resolveu ou foi anulado pisca e se fecha; o que virou topo sobe para a carta.
class_name StackRows
extends Control

## Clicou num item que dá para escolher como alvo.
signal picked(id: int)
## Clicou num item que não é uma escolha agora (a pilha abre em galeria nele).
signal opened(id: int)
## O mouse entrou num item ({} ao sair): a mesa acende a carta dele e os alvos.
signal hovered(item: Dictionary)
## A carta do item sob o mouse (null ao sair), para a carta ampliada.
signal preview(texture: Texture2D)

const ROW_H := 34.0
const GAP := 4.0
const MORE_H := 20.0
const SLIDE_TIME := 0.32

var catalog: CardCatalog
## O nome em português de uma carta (CardCatalog.label).
var translate: Callable = func(name: String) -> String: return name
## O texto em português da carta, para o efeito no balão do item.
var pt_text: Callable = func(_source: Dictionary) -> String: return ""

## id do primeiro item do grupo → a linha
var _rows: Dictionary = {}
var _signatures: Dictionary = {}
var _order: Array = []
var _more: Label
var _height_tween: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = false
	_more = Hud._label(13, Color(1, 1, 1, 0.5))
	_more.visible = false
	add_child(_more)
	resized.connect(func() -> void:
		for row: Control in _rows.values():
			row.size.x = size.x)


## Mostra os itens debaixo do topo (até `max_rows` linhas, o resto em "+ N na pilha"), animando quem entra, sai e muda de lugar.
func show_items(state: Dictionary, max_rows: int) -> void:
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var selectable: Array = input.get("selectableStacks", []) if input.get("selectableStacks") is Array else []
	var shown: Array = []
	var hidden_from: int = -1
	for g: Dictionary in StackText.group(stack, selectable):
		if int(g["at"]) == 0:
			continue
		if shown.size() >= max_rows:
			hidden_from = int(g["at"])
			break
		shown.append(g)
	var in_stack: Dictionary = {}
	for i: int in stack.size():
		in_stack[int((stack[i] as Dictionary).get("id", -1))] = i
	var ids: Array = shown.map(func(g: Dictionary) -> int: return int((g["item"] as Dictionary).get("id", -1)))
	for id: int in _order:
		if ids.has(id):
			continue
		var row: Control = _rows[id]
		_rows.erase(id)
		_signatures.erase(id)
		if int(in_stack.get(id, -1)) == 0:
			_rise(row)
		elif in_stack.has(id):
			_fade(row)
		else:
			_collapse(row)
	var first_fill: bool = _order.is_empty()
	for i: int in shown.size():
		var g: Dictionary = shown[i]
		var id: int = ids[i]
		var y: float = i * (ROW_H + GAP)
		var signature: String = _signature(g, selectable)
		var row: Control = _rows.get(id)
		if row != null and _signatures.get(id) != signature:
			var old_y: float = row.position.y
			row.name = "Gone"
			row.queue_free()
			row = _make_row(g, selectable, state)
			row.position.y = old_y
			add_child(row)
			_rows[id] = row
		elif row == null:
			row = _make_row(g, selectable, state)
			add_child(row)
			_rows[id] = row
			# O que acabou de ser coberto entra por cima; o que subiu de "+ N" entra por baixo.
			row.position.y = y - (ROW_H * 0.9 if i == 0 and not first_fill else -ROW_H * 0.6)
			row.modulate.a = 0.0
			var enter := row.create_tween().set_parallel(true)
			enter.tween_property(row, "modulate:a", 1.0, SLIDE_TIME * 0.8)
			if i == 0 and not first_fill:
				row.modulate = Color(1.6, 1.5, 1.3, 0.0)
				enter.tween_property(row, "modulate", Color(1, 1, 1, 1), SLIDE_TIME * 1.4)
		_signatures[id] = signature
		row.size = Vector2(size.x, ROW_H)
		if not is_equal_approx(row.position.y, y):
			row.create_tween().tween_property(row, "position:y", y, SLIDE_TIME).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_order = ids
	var count_y: float = shown.size() * (ROW_H + GAP)
	_more.visible = hidden_from >= 0
	if _more.visible:
		_more.text = "+ %d na pilha" % (stack.size() - hidden_from)
		_more.position = Vector2(4, count_y)
	var height: float = maxf(0.0, count_y - GAP) + (MORE_H + GAP if _more.visible else 0.0)
	_resize(height)


## Quantas linhas estão à mostra (para os testes e para o painel saber se mostra o título).
func row_count() -> int:
	return _order.size()


## Os ids na ordem em que aparecem.
func row_ids() -> Array:
	return _order.duplicate()


func row_of(id: int) -> Control:
	return _rows.get(id)


func _resize(height: float) -> void:
	if _height_tween:
		_height_tween.kill()
	if not is_inside_tree() or not is_visible_in_tree():
		custom_minimum_size.y = height
		return
	_height_tween = create_tween()
	_height_tween.tween_property(self, "custom_minimum_size:y", height, SLIDE_TIME).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## O item que virou o topo sobe para a carta e some.
func _rise(row: Control) -> void:
	_leave(row)
	var tween := row.create_tween().set_parallel(true)
	tween.tween_property(row, "position:y", row.position.y - ROW_H * 1.2, SLIDE_TIME).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tween.tween_property(row, "modulate:a", 0.0, SLIDE_TIME)
	tween.chain().tween_callback(row.queue_free)


## O item que saiu da lista sem sair da pilha (passou do limite de linhas) só some.
func _fade(row: Control) -> void:
	_leave(row)
	var tween := row.create_tween()
	tween.tween_property(row, "modulate:a", 0.0, 0.18)
	tween.tween_callback(row.queue_free)


## O item que resolveu (ou foi anulado) no meio da pilha: pisca claro e se fecha na própria linha.
func _collapse(row: Control) -> void:
	_leave(row)
	row.pivot_offset = Vector2(size.x / 2.0, ROW_H / 2.0)
	var tween := row.create_tween()
	tween.tween_property(row, "modulate", Color(2.4, 2.2, 1.8, 1.0), 0.08)
	tween.tween_property(row, "scale", Vector2(1.04, 1.0), 0.06)
	tween.tween_property(row, "scale", Vector2(0.9, 0.0), 0.24).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(row, "modulate", Color(1.5, 1.4, 1.2, 0.0), 0.24)
	tween.tween_callback(row.queue_free)


func _leave(row: Control) -> void:
	# Libera o nome "Row<id>" para a linha nova do mesmo item.
	row.name = "Gone"
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if row is Button:
		(row as Button).disabled = true


func _signature(g: Dictionary, selectable: Array) -> String:
	var item: Dictionary = g["item"]
	return JSON.stringify([g["count"], g["at"], item.get("controller"), item.get("kind"), item.get("source"), item.get("text"), item.get("cast"), item.get("loyalty"),
		selectable.any(func(id: Variant) -> bool: return int(id) == int(item.get("id", -1)))])


func _make_row(g: Dictionary, selectable: Array, state: Dictionary) -> Button:
	var item: Dictionary = g["item"]
	var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
	var count: int = int(g["count"])
	var at: int = int(g["at"])
	var id: int = int(item.get("id", -1))
	var pick: bool = selectable.any(func(value: Variant) -> bool: return int(value) == id)
	var name: String = Txt.of(translate.call(Txt.of(source.get("name")))) if source.has("name") else "Efeito"
	var you: int = int(state.get("you", 0))
	var mine: bool = int(item.get("controller", -1)) == you
	var kind_color: Color = StackStyle.kind_color(item)
	var button := Button.new()
	button.name = "Row%d" % id
	button.focus_mode = Control.FOCUS_NONE
	button.tooltip_text = "%s\n%s" % [StackText.owner_line(item, you, StackText.player_name(state, int(item.get("controller", -1)), "")),
		StackText.effect_text(item, Txt.of(pt_text.call(source)))]
	button.custom_minimum_size = Vector2(0, ROW_H)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var line := HBoxContainer.new()
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	line.offset_left = 12
	line.offset_right = -10
	line.add_theme_constant_override("separation", 7)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(line)
	var number := Hud._label(15, Color(1, 1, 1, 0.5))
	number.text = "%d–%d" % [at + 1, at + count] if count > 1 else str(at + 1)
	line.add_child(number)
	var icon := TextureRect.new()
	icon.texture = StackStyle.kind_icon(StackText.kind_of(item), 32)
	icon.modulate = kind_color.lightened(0.2)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(14, 14)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.visible = icon.texture != null
	line.add_child(icon)
	var title := Hud._label(15, Color(1, 0.92, 0.7) if pick else Color(1, 1, 1, 0.88))
	title.text = name + ("  ×%d" % count if count > 1 else "")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	line.add_child(title)
	var tag := Hud._label(13, kind_color.lightened(0.3))
	var kind_label: String = Txt.of((StackText.KINDS.get(StackText.kind_of(item), {}) as Dictionary).get("label"))
	tag.text = StackText.tag(item) if StackText.tag(item) != "" else kind_label
	line.add_child(tag)
	for label: Control in [number, icon, title, tag]:
		if label is Label:
			(label as Label).vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.size_flags_vertical = Control.SIZE_SHRINK_CENTER if label == icon else Control.SIZE_FILL
	var edge: Color = StackStyle.GOLD if pick else Color(StackStyle.MINE if mine else StackStyle.THEIRS, 0.5)
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		var style := ModalStyle.box(Color(0.22, 0.18, 0.08, 0.95) if pick else Color(0.1, 0.12, 0.19, 0.9), 8, edge, 0)
		style.content_margin_left = 10
		style.border_width_left = 4
		if state_name == "hover":
			style.bg_color = style.bg_color.lightened(0.14)
			style.border_color = edge.lightened(0.3)
			style.shadow_color = Color(kind_color, 0.35)
			style.shadow_size = 6
		button.add_theme_stylebox_override(state_name, style)
	button.pressed.connect(func() -> void:
		if pick:
			picked.emit(id)
		else:
			opened.emit(id))
	button.mouse_entered.connect(func() -> void:
		hovered.emit(item)
		if catalog and not source.is_empty():
			preview.emit(catalog.texture(catalog.image_url_for(source))))
	button.mouse_exited.connect(func() -> void:
		hovered.emit({})
		preview.emit(null))
	return button
