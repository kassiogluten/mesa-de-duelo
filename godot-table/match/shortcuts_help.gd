# A ajuda dos atalhos de teclado (tecla "?"): um quadro pequeno no meio da tela com cada tecla e o que ela faz; qualquer
# clique, o "?" ou o Esc fecham.
class_name ShortcutsHelp
extends Control

var _panel: PanelContainer


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var shade := ColorRect.new()
	shade.color = Color(0, 0, 0, 0.45)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_panel = PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.08, 0.12, 0.96)
	style.border_color = Color(0.95, 0.75, 0.32, 0.55)
	style.set_border_width_all(1)
	style.set_corner_radius_all(14)
	style.set_content_margin_all(26)
	style.shadow_color = Color(0, 0, 0, 0.5)
	style.shadow_size = 18
	_panel.add_theme_stylebox_override("panel", style)
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	_panel.add_child(column)
	var title := Label.new()
	title.text = "Atalhos de teclado"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(1.0, 0.84, 0.45))
	column.add_child(title)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 20)
	grid.add_theme_constant_override("v_separation", 10)
	column.add_child(grid)
	for raw: Variant in KeyMap.SHORTCUTS:
		var entry: Array = raw
		grid.add_child(_key_cap(Txt.of(entry[0])))
		var text := Label.new()
		text.text = Txt.of(entry[2])
		text.add_theme_font_size_override("font_size", 17)
		text.add_theme_color_override("font_color", Color(1, 1, 1, 0.88))
		text.custom_minimum_size = Vector2(520, 0)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		grid.add_child(text)
	var tip := Label.new()
	tip.text = "Clique direito numa carta: ver de perto. Com uma escolha em andamento, o clique direito a desfaz."
	tip.add_theme_font_size_override("font_size", 15)
	tip.add_theme_color_override("font_color", Color(1, 1, 1, 0.6))
	tip.custom_minimum_size = Vector2(640, 0)
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(tip)


## A tecla desenhada como uma tampa de teclado.
func _key_cap(text: String) -> Control:
	var cap := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.16, 0.17, 0.23)
	style.border_color = Color(1, 1, 1, 0.22)
	style.set_border_width_all(1)
	style.border_width_bottom = 3
	style.set_corner_radius_all(7)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	cap.add_theme_stylebox_override("panel", style)
	cap.size_flags_horizontal = Control.SIZE_SHRINK_END
	cap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 17)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cap.add_child(label)
	return cap


func toggle() -> void:
	visible = not visible


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		visible = false
		accept_event()
