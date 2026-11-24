# O Theme único da direção "Nítido" (roadmap 150, docs/direcao-visual-mesa-pc.md): campos de texto, campos de escolha
# e a lista deles, caixas de marcar, deslizantes, barras de rolagem, abas, listas e dicas, posto no tema padrão para
# valer em todas as telas (o controle com cor ou caixa própria continua com a dele). As peças montadas ficam em ui_kit.gd.
class_name UiTheme
extends RefCounted

const FIELD_FILL := Color(0.04, 0.055, 0.094, 0.85)
const FIELD_LINE := Color(1, 1, 1, 0.12)

static var _theme: Theme
static var _installed: bool = false


## Põe o tema no tema padrão: todo controle sem cor ou caixa própria passa a usá-lo. Pode chamar mais de uma vez.
static func install() -> void:
	if _installed:
		return
	_installed = true
	ThemeDB.get_default_theme().merge_with(theme())


static func theme() -> Theme:
	if _theme == null:
		_theme = Theme.new()
		_buttons(_theme)
		_text_fields(_theme)
		_option_button(_theme)
		_popup(_theme)
		_check_box(_theme)
		_slider(_theme)
		_scroll_bars(_theme)
		_tabs(_theme)
		_lists(_theme)
		_tooltip(_theme)
	return _theme


## Uma caixa de cantos quase retos: fundo, filete (largura 0: sem) e margens de dentro.
static func flat(fill: Color, line: Color = Color(0, 0, 0, 0), width: int = 0, margin_x: int = 0, margin_y: int = 0) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(ModalStyle.RADIUS)
	box.border_color = line
	box.set_border_width_all(width)
	box.content_margin_left = margin_x
	box.content_margin_right = margin_x
	box.content_margin_top = margin_y
	box.content_margin_bottom = margin_y
	box.anti_aliasing = true
	return box


## A caixa de um campo (texto ou escolha) num estado: escuro, filete fino que fica dourado com o mouse e com o foco.
static func field_box(state_name: String) -> StyleBoxFlat:
	match state_name:
		"hover":
			return flat(Color(0.07, 0.09, 0.15, 0.92), Color(ModalStyle.GOLD, 0.6), 1, 14, 8)
		"pressed", "focus":
			return flat(Color(0.03, 0.04, 0.07, 0.92), Color(ModalStyle.GOLD, 0.85), 1, 14, 8)
		"disabled", "read_only":
			return flat(Color(0.04, 0.055, 0.094, 0.5), Color(1, 1, 1, 0.05), 1, 14, 8)
	return flat(FIELD_FILL, FIELD_LINE, 1, 14, 8)


## O botão sem estilo próprio vira o secundário das janelas.
static func _buttons(out: Theme) -> void:
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		out.set_stylebox(state_name, "Button", ModalStyle.button_box(ModalStyle.Kind.SECONDARY, state_name))
	out.set_color("font_color", "Button", ModalStyle.INK)
	out.set_color("font_hover_color", "Button", Color.WHITE)
	out.set_color("font_pressed_color", "Button", ModalStyle.INK)
	out.set_color("font_disabled_color", "Button", ModalStyle.DISABLED_INK)


static func _text_fields(out: Theme) -> void:
	for type: String in ["LineEdit", "TextEdit"]:
		out.set_stylebox("normal", type, field_box("normal"))
		out.set_stylebox("focus", type, field_box("focus"))
		out.set_stylebox("read_only", type, field_box("read_only"))
		out.set_color("font_color", type, ModalStyle.INK)
		out.set_color("font_placeholder_color", type, Color(ModalStyle.MUTED, 0.5))
		out.set_color("font_readonly_color", type, ModalStyle.DISABLED_INK)
		out.set_color("font_selected_color", type, Color.WHITE)
		out.set_color("selection_color", type, Color(ModalStyle.GOLD, 0.32))
		out.set_color("caret_color", type, ModalStyle.GOLD_LIGHT)
		out.set_color("clear_button_color", type, ModalStyle.MUTED)
		out.set_color("clear_button_color_pressed", type, ModalStyle.GOLD)
		out.set_constant("caret_width", type, 2)
		out.set_font_size("font_size", type, 17)


static func _option_button(out: Theme) -> void:
	for state_name: String in ["normal", "hover", "pressed", "disabled"]:
		out.set_stylebox(state_name, "OptionButton", field_box(state_name))
	var focus := flat(Color(0, 0, 0, 0), Color(1, 1, 1, 0.85), 2)
	focus.set_expand_margin_all(3)
	out.set_stylebox("focus", "OptionButton", focus)
	out.set_color("font_color", "OptionButton", ModalStyle.INK)
	out.set_color("font_hover_color", "OptionButton", Color.WHITE)
	out.set_color("font_pressed_color", "OptionButton", ModalStyle.GOLD_LIGHT)
	out.set_color("font_focus_color", "OptionButton", ModalStyle.INK)
	out.set_color("font_disabled_color", "OptionButton", ModalStyle.DISABLED_INK)
	out.set_constant("arrow_margin", "OptionButton", 14)


static func _popup(out: Theme) -> void:
	var panel := flat(Color(0.05, 0.07, 0.12, 0.98), Color(ModalStyle.GOLD, 0.3), 1, 6, 6)
	panel.border_width_top = ModalStyle.TOP_LINE
	panel.border_color = Color(ModalStyle.GOLD, 0.6)
	out.set_stylebox("panel", "PopupMenu", panel)
	out.set_stylebox("hover", "PopupMenu", flat(Color(ModalStyle.GOLD, 0.16)))
	out.set_font_size("font_size", "PopupMenu", 17)
	out.set_color("font_color", "PopupMenu", ModalStyle.INK)
	out.set_color("font_hover_color", "PopupMenu", ModalStyle.GOLD_LIGHT)
	out.set_color("font_separator_color", "PopupMenu", ModalStyle.MUTED)
	out.set_color("font_disabled_color", "PopupMenu", ModalStyle.DISABLED_INK)
	out.set_constant("v_separation", "PopupMenu", 10)
	out.set_constant("item_start_padding", "PopupMenu", 12)
	out.set_constant("item_end_padding", "PopupMenu", 12)


## O quadrado da caixa de marcar: escuro com filete, ou dourado com o tique; cinza desligado.
static func check_icon(on: bool, disabled: bool = false) -> Texture2D:
	var fill: String = "#f0b84a" if on else "#0b1220"
	var line: String = "#ffd27a" if on else "#8fa3c8"
	var tick: String = "#2a1a04"
	if disabled:
		fill = "#292e3a"
		line = "#3a4150"
		tick = "#8a8f9a"
	var svg := "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><rect x='1.5' y='1.5' width='19' height='19' rx='3' fill='%s' stroke='%s' stroke-width='2'/>%s</svg>" % [fill, line,
		"<path d='M6 11.5l3.5 3.5L16.5 7.5' fill='none' stroke='%s' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>" % tick if on else ""]
	var image := Image.new()
	image.load_svg_from_string(svg, 1.0)
	return ImageTexture.create_from_image(image)


static func _check_box(out: Theme) -> void:
	for type: String in ["CheckBox", "CheckButton"]:
		if type == "CheckBox":
			out.set_icon("checked", type, check_icon(true))
			out.set_icon("unchecked", type, check_icon(false))
			out.set_icon("checked_disabled", type, check_icon(true, true))
			out.set_icon("unchecked_disabled", type, check_icon(false, true))
		var empty := StyleBoxEmpty.new()
		empty.set_content_margin_all(4)
		for state_name: String in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			out.set_stylebox(state_name, type, empty)
		var focus := flat(Color(0, 0, 0, 0), Color(1, 1, 1, 0.85), 2)
		out.set_stylebox("focus", type, focus)
		out.set_constant("h_separation", type, 10)
		out.set_font_size("font_size", type, 16)
		out.set_color("font_color", type, ModalStyle.INK)
		out.set_color("font_hover_color", type, Color.WHITE)
		out.set_color("font_pressed_color", type, ModalStyle.GOLD_LIGHT)
		out.set_color("font_hover_pressed_color", type, ModalStyle.GOLD_LIGHT)
		out.set_color("font_focus_color", type, ModalStyle.INK)
		out.set_color("font_disabled_color", type, ModalStyle.DISABLED_INK)


## Um trilho fino (a espessura vem das margens).
static func _track(fill: Color, thickness: int, horizontal: bool = true) -> StyleBoxFlat:
	var box := flat(fill)
	box.set_corner_radius_all(2)
	var half: int = thickness / 2
	if horizontal:
		box.content_margin_top = half
		box.content_margin_bottom = thickness - half
	else:
		box.content_margin_left = half
		box.content_margin_right = thickness - half
	return box


## O puxador do deslizante: um quadrado dourado de cantos quase retos, com a base mais escura (como os botões);
## com o mouse em cima, mais claro e com brilho.
static func grabber_icon(lit: bool, disabled: bool = false) -> Texture2D:
	var fill: String = "#ffd27a" if lit else "#f0b84a"
	if disabled:
		fill = "#3a4150"
	var glow: String = "<rect x='1' y='1' width='24' height='24' rx='6' fill='#f0b84a' opacity='0.35'/>" if lit else ""
	var svg := "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'>%s<rect x='5' y='4' width='16' height='18' rx='3' fill='#9a6a1c'/><rect x='5' y='4' width='16' height='15' rx='3' fill='%s'/></svg>" % [glow, fill]
	var image := Image.new()
	image.load_svg_from_string(svg, 1.0)
	return ImageTexture.create_from_image(image)


static func _slider(out: Theme) -> void:
	for type: String in ["HSlider", "VSlider"]:
		var horizontal: bool = type == "HSlider"
		out.set_stylebox("slider", type, _track(Color(1, 1, 1, 0.12), 6, horizontal))
		out.set_stylebox("grabber_area", type, _track(ModalStyle.GOLD, 6, horizontal))
		out.set_stylebox("grabber_area_highlight", type, _track(ModalStyle.GOLD_LIGHT, 6, horizontal))
		out.set_icon("grabber", type, grabber_icon(false))
		out.set_icon("grabber_highlight", type, grabber_icon(true))
		out.set_icon("grabber_disabled", type, grabber_icon(false, true))
		out.set_constant("center_grabber", type, 1)


static func _scroll_bars(out: Theme) -> void:
	for type: String in ["VScrollBar", "HScrollBar"]:
		var horizontal: bool = type == "HScrollBar"
		var track: StyleBoxFlat = _track(Color(1, 1, 1, 0.04), 8, horizontal)
		out.set_stylebox("scroll", type, track)
		out.set_stylebox("scroll_focus", type, track)
		out.set_stylebox("grabber", type, _track(Color(1, 1, 1, 0.22), 8, horizontal))
		out.set_stylebox("grabber_highlight", type, _track(Color(ModalStyle.GOLD, 0.7), 8, horizontal))
		out.set_stylebox("grabber_pressed", type, _track(ModalStyle.GOLD, 8, horizontal))


## As abas de cima: a marcada em azul-escuro com o filete dourado no alto e a letra acesa; as outras só com a letra.
static func tab_box(state_name: String) -> StyleBoxFlat:
	var box := flat(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 18, 8)
	box.corner_radius_bottom_left = 0
	box.corner_radius_bottom_right = 0
	match state_name:
		"tab_selected":
			box.bg_color = ModalStyle.SECONDARY_FILL
			box.border_color = ModalStyle.GOLD
			box.border_width_top = ModalStyle.TOP_LINE
		"tab_hovered":
			box.bg_color = Color(1, 1, 1, 0.06)
			box.border_color = Color(ModalStyle.GOLD_LIGHT, 0.5)
			box.border_width_top = 1
		"tab_focus":
			box.border_color = Color(1, 1, 1, 0.85)
			box.set_border_width_all(2)
	return box


static func _tabs(out: Theme) -> void:
	for type: String in ["TabBar", "TabContainer"]:
		for state_name: String in ["tab_selected", "tab_hovered", "tab_unselected", "tab_disabled", "tab_focus"]:
			out.set_stylebox(state_name, type, tab_box(state_name))
		out.set_font("font", type, HudStyle.bold_font())
		out.set_font_size("font_size", type, 16)
		out.set_color("font_selected_color", type, ModalStyle.GOLD_LIGHT)
		out.set_color("font_hovered_color", type, Color.WHITE)
		out.set_color("font_unselected_color", type, ModalStyle.MUTED)
		out.set_color("font_disabled_color", type, ModalStyle.DISABLED_INK)
		out.set_constant("h_separation", type, 6)
	out.set_stylebox("panel", "TabContainer", flat(Color(0.045, 0.06, 0.1, 0.85), Color(1, 1, 1, 0.08), 1, 18, 18))
	out.set_stylebox("tabbar_background", "TabContainer", StyleBoxEmpty.new())


static func _lists(out: Theme) -> void:
	out.set_stylebox("panel", "ItemList", flat(FIELD_FILL, FIELD_LINE, 1, 6, 6))
	out.set_stylebox("focus", "ItemList", StyleBoxEmpty.new())
	out.set_stylebox("hovered", "ItemList", flat(Color(1, 1, 1, 0.06)))
	out.set_stylebox("selected", "ItemList", flat(Color(ModalStyle.GOLD, 0.16), Color(ModalStyle.GOLD, 0.5), 1))
	out.set_stylebox("selected_focus", "ItemList", flat(Color(ModalStyle.GOLD, 0.2), Color(ModalStyle.GOLD, 0.7), 1))
	out.set_color("font_color", "ItemList", ModalStyle.INK)
	out.set_color("font_hovered_color", "ItemList", Color.WHITE)
	out.set_color("font_selected_color", "ItemList", ModalStyle.GOLD_LIGHT)
	out.set_constant("v_separation", "ItemList", 8)


static func _tooltip(out: Theme) -> void:
	var panel := flat(Color(0.035, 0.05, 0.085, 0.97), Color(ModalStyle.GOLD, 0.35), 1, 12, 8)
	out.set_stylebox("panel", "TooltipPanel", panel)
	out.set_color("font_color", "TooltipLabel", ModalStyle.INK)
	out.set_font_size("font_size", "TooltipLabel", 15)
