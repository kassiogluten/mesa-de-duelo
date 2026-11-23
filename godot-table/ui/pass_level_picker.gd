# Escolha do nível de passar automaticamente na barra do alto: uma pílula "Passar: Só com ações ▾" que abre um painel
# com os quatro níveis, cada um com o nome, a explicação e a marca no que vale agora.
class_name PassLevelPicker
extends Button

## O jogador escolheu outro nível (a chave de MatchBar.LEVELS).
signal level_chosen(level: String)

const CHEVRON := "<path d=\"m6 9 6 6 6-6\"/>"
const CHECK := "<path d=\"m5 12 5 5 9-10\"/>"
const PANEL_WIDTH := 360.0

var level: String = ""
var _panel: PanelContainer
var _catcher: Control
var _list: VBoxContainer


func _ready() -> void:
	HudStyle.style_chip_button(self)
	icon = HudIcons.texture(CHEVRON, 32)
	icon_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	expand_icon = false
	add_theme_constant_override("icon_max_width", 16)
	add_theme_constant_override("h_separation", 8)
	add_theme_color_override("icon_normal_color", Color(1, 1, 1, 0.6))
	add_theme_color_override("icon_hover_color", HudStyle.GOLD)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	tooltip_text = "Quando o jogo passa a prioridade sozinho por você."
	pressed.connect(func() -> void: set_open(not _panel.visible))
	_catcher = Control.new()
	_catcher.top_level = true
	_catcher.mouse_filter = Control.MOUSE_FILTER_STOP
	_catcher.visible = false
	_catcher.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			set_open(false))
	add_child(_catcher)
	_panel = PanelContainer.new()
	_panel.top_level = true
	_panel.visible = false
	var style := HudStyle.panel(Color(0.035, 0.05, 0.085, 0.97), HudStyle.RADIUS_PANEL)
	style.border_color = HudStyle.BORDER
	style.set_border_width_all(1)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 10
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 18
	style.shadow_offset = Vector2(0, 6)
	_panel.add_theme_stylebox_override("panel", style)
	add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	_panel.add_child(column)
	var title := HudStyle.label(HudStyle.SIZE_CAPTION, HudStyle.TEXT_DIM)
	title.add_theme_constant_override("outline_size", 0)
	title.text = "  PASSAR AUTOMATICAMENTE"
	column.add_child(title)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	column.add_child(_list)
	_refresh_text()


## Mostra o nível que vale agora (sem avisar).
func set_level(value: String) -> void:
	if value == level:
		return
	level = value
	_refresh_text()
	if _panel and _panel.visible:
		_build_list()


func is_open() -> bool:
	return _panel != null and _panel.visible


func set_open(open: bool) -> void:
	_panel.visible = open
	_catcher.visible = open
	if open:
		_build_list()
		_place.call_deferred()


func _refresh_text() -> void:
	text = "Passar: %s" % Txt.of(_entry(level)[1])


static func _entry(key: String) -> Array:
	for entry: Array in MatchBar.LEVELS:
		if entry[0] == key:
			return entry
	return MatchBar.LEVELS[1]


func _build_list() -> void:
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	for entry: Array in MatchBar.LEVELS:
		_list.add_child(_option(entry))


## Uma linha do painel: a marca, o nome e a explicação; acende ao passar o mouse.
func _option(entry: Array) -> PanelContainer:
	var key: String = entry[0]
	var current: bool = key == level
	var row := PanelContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_STOP
	row.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	row.custom_minimum_size = Vector2(PANEL_WIDTH, 0)
	var normal := _row_style(Color(HudStyle.GOLD, 0.12) if current else Color(0, 0, 0, 0), current)
	var hover := _row_style(Color(HudStyle.GOLD, 0.18) if current else Color(1, 1, 1, 0.07), current)
	row.add_theme_stylebox_override("panel", normal)
	row.mouse_entered.connect(func() -> void: row.add_theme_stylebox_override("panel", hover))
	row.mouse_exited.connect(func() -> void: row.add_theme_stylebox_override("panel", normal))
	row.gui_input.connect(func(event: InputEvent) -> void:
		var click := event as InputEventMouseButton
		if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
			set_open(false)
			if key != level:
				set_level(key)
				level_chosen.emit(key))
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(line)
	var mark := HudIcons.rect(CHECK, 16, HudStyle.GOLD if current else Color(0, 0, 0, 0))
	mark.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	mark.custom_minimum_size = Vector2(16, 22)
	line.add_child(mark)
	var texts := VBoxContainer.new()
	texts.add_theme_constant_override("separation", 1)
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(texts)
	var name := HudStyle.label(HudStyle.SIZE_BODY, HudStyle.GOLD_SOFT if current else HudStyle.TEXT)
	name.add_theme_constant_override("outline_size", 0)
	name.text = Txt.of(entry[1])
	name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.add_child(name)
	var hint := HudStyle.label(HudStyle.SIZE_CAPTION, HudStyle.TEXT_DIM)
	hint.add_theme_constant_override("outline_size", 0)
	hint.text = Txt.of(entry[2])
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(PANEL_WIDTH - 60.0, 0)
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.add_child(hint)
	return row


static func _row_style(fill: Color, current: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.set_corner_radius_all(10)
	style.bg_color = fill
	if current:
		style.border_color = Color(HudStyle.GOLD, 0.35)
		style.set_border_width_all(1)
	style.content_margin_left = 10
	style.content_margin_right = 12
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style


## O painel abre embaixo da pílula, alinhado pela direita, sem sair da tela.
func _place() -> void:
	var view: Rect2 = get_viewport_rect()
	_catcher.position = Vector2.ZERO
	_catcher.size = view.size
	_panel.reset_size()
	var box: Vector2 = _panel.get_combined_minimum_size()
	var anchor: Rect2 = get_global_rect()
	var left: float = clampf(anchor.end.x - box.x, 8.0, view.size.x - box.x - 8.0)
	_panel.position = Vector2(left, anchor.end.y + 8.0)
	_panel.modulate.a = 0.0
	_panel.create_tween().tween_property(_panel, "modulate:a", 1.0, 0.12)
