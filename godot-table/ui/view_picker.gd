# O botão da vista na barra do alto da partida: o ícone de câmera com o ângulo de agora, que abre um painel com os
# ângulos prontos (o de agora marcado), o zoom (− e +) e a volta à vista padrão, cada um com a tecla ao lado.
class_name ViewPicker
extends Button

const CAMERA := "<path d=\"M3 8h3.5l2-3h7l2 3H21v11H3z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>"
const CHECK := "<path d=\"m5 12 5 5 9-10\"/>"
const PANEL_WIDTH := 280.0

## A vista da mesa (table/table_camera.gd).
var rig: TableCamera:
	set(value):
		rig = value
		if rig and not rig.changed.is_connected(_on_changed):
			rig.changed.connect(_on_changed)
		_refresh_text()
var _panel: PanelContainer
var _catcher: Control
var _list: VBoxContainer


func _ready() -> void:
	HudStyle.style_chip_button(self)
	icon = HudIcons.texture(CAMERA, 40)
	expand_icon = false
	add_theme_constant_override("icon_max_width", 18)
	add_theme_constant_override("h_separation", 8)
	add_theme_color_override("icon_normal_color", Color(1, 1, 1, 0.75))
	add_theme_color_override("icon_hover_color", HudStyle.GOLD)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	focus_mode = Control.FOCUS_NONE
	tooltip_text = "Vista da mesa: a roda do mouse aproxima e afasta, V troca o ângulo, 0 volta à padrão."
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
	var style := HudStyle.framed(HudStyle.panel(Color(0.035, 0.05, 0.085, 0.97), HudStyle.RADIUS_PANEL))
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 10
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 18
	style.shadow_offset = Vector2(0, 6)
	_panel.add_theme_stylebox_override("panel", style)
	add_child(_panel)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	_panel.add_child(_list)
	_refresh_text()


func is_open() -> bool:
	return _panel != null and _panel.visible


func set_open(open: bool) -> void:
	_panel.visible = open
	_catcher.visible = open
	if open:
		_build_list()
		_place.call_deferred()


func _on_changed() -> void:
	_refresh_text()
	if is_open():
		_build_list()


func _refresh_text() -> void:
	text = rig.angle_name() if rig else "Padrão"


func _build_list() -> void:
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	if rig == null:
		return
	var title := HudStyle.label(HudStyle.SIZE_CAPTION, HudStyle.TEXT_DIM)
	title.add_theme_constant_override("outline_size", 0)
	title.text = "  VISTA DA MESA"
	_list.add_child(title)
	for i: int in TableCamera.ANGLES.size():
		var index: int = i
		_list.add_child(_row(Txt.of((TableCamera.ANGLES[i] as Array)[1]), "V", i == rig.angle, func() -> void: rig.set_angle(index)))
	var line := HSeparator.new()
	line.add_theme_constant_override("separation", 6)
	_list.add_child(line)
	_list.add_child(_zoom_row())
	_list.add_child(_row("Vista padrão", "0", false, func() -> void: rig.reset(), rig.is_default()))


## Uma linha do painel: a marca, o nome e a tecla; acende ao passar o mouse.
func _row(label: String, key: String, current: bool, run: Callable, disabled: bool = false) -> PanelContainer:
	var row := PanelContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_STOP
	row.mouse_default_cursor_shape = Control.CURSOR_ARROW if disabled else Control.CURSOR_POINTING_HAND
	row.custom_minimum_size = Vector2(PANEL_WIDTH, 0)
	var normal := PassLevelPicker._row_style(Color(HudStyle.GOLD, 0.12) if current else Color(0, 0, 0, 0), current)
	var hover := PassLevelPicker._row_style(Color(HudStyle.GOLD, 0.18) if current else Color(1, 1, 1, 0.07), current)
	row.add_theme_stylebox_override("panel", normal)
	if not disabled:
		row.mouse_entered.connect(func() -> void: row.add_theme_stylebox_override("panel", hover))
		row.mouse_exited.connect(func() -> void: row.add_theme_stylebox_override("panel", normal))
		row.gui_input.connect(func(event: InputEvent) -> void:
			var click := event as InputEventMouseButton
			if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
				run.call())
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(line)
	var mark := HudIcons.rect(CHECK, 16, HudStyle.GOLD if current else Color(0, 0, 0, 0))
	mark.custom_minimum_size = Vector2(16, 22)
	line.add_child(mark)
	var name := HudStyle.label(HudStyle.SIZE_BODY, HudStyle.GOLD_SOFT if current else (HudStyle.TEXT_DIM if disabled else HudStyle.TEXT))
	name.add_theme_constant_override("outline_size", 0)
	name.text = label
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(name)
	line.add_child(_key(key))
	return row


## O zoom: − , quanto está e +, com as teclas.
func _zoom_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(36, 0)
	row.add_child(gap)
	var label := HudStyle.label(HudStyle.SIZE_BODY, HudStyle.TEXT)
	label.add_theme_constant_override("outline_size", 0)
	label.text = "Zoom %d%%" % roundi(100.0 / rig.zoom)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	for entry: Array in [["−", -1.0, rig.zoom >= TableCamera.ZOOM_FAR - 0.001], ["+", 1.0, rig.zoom <= TableCamera.ZOOM_NEAR + 0.001]]:
		var steps: float = entry[1]
		var button := HudStyle.button(Txt.of(entry[0]), false)
		button.custom_minimum_size = Vector2(40, 34)
		button.focus_mode = Control.FOCUS_NONE
		button.disabled = bool(entry[2])
		button.tooltip_text = "Aproximar (+ ou a roda do mouse)" if steps > 0.0 else "Afastar (− ou a roda do mouse)"
		button.pressed.connect(func() -> void: rig.zoom_by(steps))
		row.add_child(button)
	return row


## A tecla desenhada como uma tampa pequena.
static func _key(text: String) -> PanelContainer:
	var cap := PanelContainer.new()
	cap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.16, 0.17, 0.23)
	style.border_color = Color(1, 1, 1, 0.2)
	style.set_border_width_all(1)
	style.border_width_bottom = 2
	style.set_corner_radius_all(5)
	style.content_margin_left = 7
	style.content_margin_right = 7
	cap.add_theme_stylebox_override("panel", style)
	var label := HudStyle.label(HudStyle.SIZE_CAPTION, Color(1, 1, 1, 0.75))
	label.add_theme_constant_override("outline_size", 0)
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cap.add_child(label)
	return cap


## O painel abre embaixo do botão, alinhado pela direita, sem sair da tela.
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
