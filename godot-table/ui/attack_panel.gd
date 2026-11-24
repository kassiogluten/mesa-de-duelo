# O painel "Atacar quem?" logo acima da caixa de ação (o da mesa do navegador, src/ui/attackChoice.ts): um botão por
# defensor (a marca com a vida ou a lealdade na cor da seta dele, o nome, de quem é e quantos atacantes já vão nele),
# o escolhido antes aceso em dourado, e embaixo "Retirar do combate" e "Limpar seleção". O conteúdo vem pronto de
# AttackPanelModel; o painel só desenha e avisa o que foi apertado.
class_name AttackPanel
extends PanelContainer

## Escolheu um defensor ({id, kind}).
signal chosen(defender: Dictionary)
## O mouse entrou num defensor ({id, kind}) ou saiu dele ({}): a seta da mesa mira nele.
signal hovered(defender: Dictionary)
signal remove_pressed
signal clear_pressed

const WIDTH := ActionPanel.WIDTH
## Distância até a caixa de ação.
const GAP := 12.0
const ROW_H := 56.0
const MARK := 38.0
## Até quantos defensores à vista; mais que isso, a lista rola.
const MAX_ROWS := 6
const PERMANENT_BORDER := Color("#8f7bd0")
const PERMANENT_TEXT := Color("#e3d9ff")

## Onde está a caixa de ação na tela (Hud.action_rect; vazio quando escondida): o painel fica logo acima dela.
var anchor: Callable = func() -> Rect2: return Rect2()

var _title: Label
var _caption: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _tools: HBoxContainer
var _key: String = ""
var _shown: bool = false
## 0 a 1: entrando (sobe e aparece).
var _enter: float = 0.0
var _fade: Tween


func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(WIDTH, 0)
	var style: StyleBoxFlat = HudStyle.framed(HudStyle.panel(HudStyle.PANEL_BG, 14))
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 16
	style.shadow_offset = Vector2(0, 5)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(column)
	_title = HudStyle.label(HudStyle.SIZE_BODY + 2, HudStyle.GOLD)
	_title.add_theme_font_override("font", HudStyle.bold_font())
	_title.add_theme_constant_override("outline_size", 0)
	column.add_child(_title)
	_caption = HudStyle.label(HudStyle.SIZE_CAPTION + 1, HudStyle.TEXT_SOFT)
	_caption.add_theme_constant_override("outline_size", 0)
	_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_caption.custom_minimum_size = Vector2(WIDTH - 24.0, 0)
	column.add_child(_caption)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	column.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 6)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	_tools = HBoxContainer.new()
	_tools.add_theme_constant_override("separation", 8)
	column.add_child(_tools)


## Mostra o painel com o modelo de AttackPanelModel.build ({} esconde). Só refaz os botões quando o conteúdo muda.
func show_model(model: Dictionary) -> void:
	if model.is_empty():
		if _shown:
			_shown = false
			_key = ""
			hovered.emit({})
			var ref: WeakRef = weakref(self)
			_fade = create_tween()
			_fade.tween_property(self, "modulate:a", 0.0, 0.12).finished.connect(func() -> void:
				var me: AttackPanel = ref.get_ref() as AttackPanel
				if me != null and not me._shown:
					me.visible = false)
		return
	var key: String = var_to_str(model)
	if key == _key and _shown:
		return
	_key = key
	_title.text = Txt.of(model.get("title", AttackPanelModel.TITLE))
	_caption.text = Txt.of(model.get("caption"))
	_caption.visible = _caption.text != ""
	_build_rows(model.get("targets", []))
	_build_tools(bool(model.get("removable", false)))
	if not _shown:
		_shown = true
		_enter = 0.0
		if _fade != null and _fade.is_valid():
			_fade.kill()
		visible = true
		modulate.a = 0.0
	reset_size()


## O painel está à vista (para os testes e para a seta não seguir o mouse por cima dele).
func showing() -> bool:
	return _shown


func _build_rows(targets: Array) -> void:
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	hovered.emit({})
	for raw: Variant in targets:
		_list.add_child(_row(raw as Dictionary))
	var rows: int = mini(targets.size(), MAX_ROWS)
	_scroll.custom_minimum_size = Vector2(0, rows * ROW_H + maxi(rows - 1, 0) * 6)
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO if targets.size() > MAX_ROWS else ScrollContainer.SCROLL_MODE_DISABLED


## Uma linha: a marca (redonda para jogador, quadrada para permanente) na cor da seta, nome e detalhe, e quantos
## atacantes já vão nele.
func _row(target: Dictionary) -> Button:
	var defender: Dictionary = target["defender"]
	var color: Color = target.get("color", AttackPanelModel.RED)
	var pinned: bool = bool(target.get("pinned", false))
	var permanent: bool = bool(target.get("permanent", false))
	var button := Button.new()
	button.custom_minimum_size = Vector2(0, ROW_H)
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var coming: int = int(target.get("coming", 0))
	# O que a linha diz, numa frase (o aria-label do navegador): sem dica flutuante, que cobriria a linha de baixo.
	button.set_meta("label", "Atacar %s, %s%s" % [target["name"], target["detail"],
		(", %d %s já indo" % [coming, "atacante" if coming == 1 else "atacantes"]) if coming > 0 else ""])
	var base: Color = Color("#2a2213") if pinned else Color("#0b1526")
	var fills: Dictionary = {"normal": base, "hover": base.lightened(0.08) if pinned else Color("#13223a"), "pressed": base.darkened(0.2), "focus": base}
	for state_name: String in fills:
		var style := StyleBoxFlat.new()
		style.bg_color = fills[state_name]
		style.set_corner_radius_all(10)
		style.set_border_width_all(2 if pinned else 1)
		style.border_color = HudStyle.GOLD if pinned else (Color(HudStyle.GOLD, 0.55) if state_name == "hover" else Color(1, 1, 1, 0.12))
		style.anti_aliasing = true
		button.add_theme_stylebox_override(state_name, style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 8
	row.offset_right = -10
	button.add_child(row)
	row.add_child(_mark(Txt.of(target.get("mark")), color, permanent))
	var text := VBoxContainer.new()
	text.alignment = BoxContainer.ALIGNMENT_CENTER
	text.add_theme_constant_override("separation", 0)
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var name_label: Label = HudStyle.label(HudStyle.SIZE_BODY, HudStyle.TEXT)
	name_label.add_theme_font_override("font", HudStyle.bold_font())
	name_label.add_theme_constant_override("outline_size", 0)
	name_label.text = Txt.of(target["name"])
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.clip_text = true
	text.add_child(name_label)
	var detail: Label = HudStyle.label(HudStyle.SIZE_CAPTION, Color("#aab6ca"))
	detail.add_theme_constant_override("outline_size", 0)
	detail.text = Txt.of(target["detail"])
	detail.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	detail.clip_text = true
	text.add_child(detail)
	row.add_child(text)
	if coming > 0:
		row.add_child(_count(coming, color))
	button.pressed.connect(func() -> void: chosen.emit(defender))
	button.mouse_entered.connect(func() -> void: hovered.emit(defender))
	button.mouse_exited.connect(func() -> void: hovered.emit({}))
	return button


## A marca à esquerda: a vida (jogador, redonda) ou a lealdade/defesa (permanente, quadrada), com o aro na cor da seta.
static func _mark(text: String, color: Color, permanent: bool) -> PanelContainer:
	var box := PanelContainer.new()
	box.custom_minimum_size = Vector2(MARK, MARK)
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#16263d")
	style.set_corner_radius_all(8 if permanent else int(MARK / 2.0))
	style.set_border_width_all(2)
	style.border_color = PERMANENT_BORDER.lerp(color, 0.35) if permanent else color
	style.anti_aliasing = true
	box.add_theme_stylebox_override("panel", style)
	var label: Label = HudStyle.label(HudStyle.SIZE_SMALL, PERMANENT_TEXT if permanent else Color("#ffe5ac"))
	label.add_theme_font_override("font", HudStyle.bold_font())
	label.add_theme_constant_override("outline_size", 0)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text = text
	box.add_child(label)
	return box


## Quantos atacantes já vão nesse defensor (a pílula na cor da seta dele).
static func _count(count: int, color: Color) -> PanelContainer:
	var pill := PanelContainer.new()
	pill.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = color.darkened(0.1)
	style.set_corner_radius_all(11)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 1
	style.content_margin_bottom = 1
	style.anti_aliasing = true
	pill.add_theme_stylebox_override("panel", style)
	var label: Label = HudStyle.label(HudStyle.SIZE_CAPTION, Color.WHITE)
	label.add_theme_font_override("font", HudStyle.bold_font())
	label.add_theme_constant_override("outline_size", 0)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.text = str(count)
	pill.add_child(label)
	return pill


func _build_tools(removable: bool) -> void:
	for child: Node in _tools.get_children():
		_tools.remove_child(child)
		child.queue_free()
	if removable:
		var remove: Button = _tool("Retirar do combate")
		remove.pressed.connect(func() -> void: remove_pressed.emit())
		_tools.add_child(remove)
	var clear: Button = _tool("Limpar seleção")
	clear.pressed.connect(func() -> void: clear_pressed.emit())
	_tools.add_child(clear)


static func _tool(text: String) -> Button:
	var button: Button = HudStyle.chip_button(text)
	button.add_theme_font_size_override("font_size", HudStyle.SIZE_CAPTION + 1)
	button.custom_minimum_size = Vector2(0, 36)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return button


func _process(delta: float) -> void:
	if not visible:
		return
	if _shown and _enter < 1.0:
		_enter = minf(1.0, _enter + delta / 0.18)
		modulate.a = _enter
	size = Vector2(WIDTH, get_combined_minimum_size().y)
	var box: Rect2 = anchor.call()
	var view: Vector2 = get_viewport_rect().size
	var right: float = box.end.x if box.has_area() else view.x - HudStyle.MARGIN
	var bottom: float = (box.position.y - GAP) if box.has_area() else view.y - HudStyle.MARGIN - 70.0
	var slide: float = 1.0 - pow(1.0 - _enter, 3.0)
	position = Vector2(right - size.x, bottom - size.y + (1.0 - slide) * 14.0).round()
