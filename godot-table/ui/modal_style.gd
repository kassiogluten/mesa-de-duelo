# Aparência comum das janelas da mesa (perguntas, sala de espera, conceder): painel, título, botões, selos e textos com os símbolos de mana.
class_name ModalStyle
extends RefCounted

enum Kind { PRIMARY, SECONDARY, GHOST, DANGER }

const GOLD := Color("#f0b84a")
const GOLD_LIGHT := Color("#ffd27a")
const INK := Color("#eef1f8")
const MUTED := Color(0.78, 0.83, 0.92, 0.74)
const FAINT := Color(0.78, 0.83, 0.92, 0.45)
const BLUE := Color("#59b5ff")
const GOOD := Color("#7fe08a")
const WARN := Color("#ffb37a")
const BAD := Color("#ff7a6b")
const NAVY := Color(0.105, 0.15, 0.25)
## Tempo de entrada e de saída das janelas.
const ENTER_TIME := 0.18
const EXIT_TIME := 0.16


## O painel das janelas: azul-escuro translúcido, cantos redondos, borda dourada fina e sombra funda.
static func panel_style(radius: int = 18) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.088, 0.155, 0.95)
	style.set_corner_radius_all(radius)
	style.border_color = Color(GOLD, 0.3)
	style.set_border_width_all(1)
	style.shadow_color = Color(0, 0, 0, 0.6)
	style.shadow_size = 42
	style.shadow_offset = Vector2(0, 16)
	style.content_margin_left = 34
	style.content_margin_right = 34
	style.content_margin_top = 24
	style.content_margin_bottom = 24
	style.anti_aliasing = true
	return style


## Caixa simples (selos, faixas, cartões de jogador).
static func box(color: Color, radius: int, border: Color = Color(0, 0, 0, 0), border_width: int = 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.border_color = border
	style.set_border_width_all(border_width)
	style.anti_aliasing = true
	return style


static func label(size: int, color: Color, text: String = "") -> Label:
	var out := Label.new()
	out.text = text
	out.add_theme_font_size_override("font_size", size)
	out.add_theme_color_override("font_color", color)
	out.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.55))
	out.add_theme_constant_override("outline_size", 4)
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return out


## Texto que quebra linhas na largura dada (0: a do contêiner), centrado ou não.
static func wrap(size: int, color: Color, text: String, width: float = 0.0, center: bool = true) -> Label:
	var out := label(size, color, text)
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if center:
		out.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if width > 0.0:
		out.custom_minimum_size = Vector2(width, 0)
	return out


## Texto com os {símbolos} de mana como ícones da altura da letra.
static func rich(text: String, size: int, color: Color, center: bool = false, width: float = 0.0) -> RichTextLabel:
	var out := RichTextLabel.new()
	out.bbcode_enabled = false
	out.fit_content = true
	out.scroll_active = false
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	out.add_theme_font_size_override("normal_font_size", size)
	out.add_theme_color_override("default_color", color)
	out.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.5))
	out.add_theme_constant_override("outline_size", 3)
	if width > 0.0:
		out.custom_minimum_size = Vector2(width, 0)
	set_rich(out, text, size, center)
	return out


## Troca o texto de um rich() (mesma letra e alinhamento).
static func set_rich(out: RichTextLabel, text: String, size: int, center: bool = false) -> void:
	out.clear()
	if center:
		out.push_paragraph(HORIZONTAL_ALIGNMENT_CENTER)
	ManaSymbols.append_rich(out, text, size)
	if center:
		out.pop()


## Os ícones de um custo ("{2}{R}") lado a lado; vazio quando não há símbolo.
static func cost_icons(cost: String, px: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 3)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for symbol: String in ManaSymbols.parse(cost):
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(symbol, px * 2)
		icon.custom_minimum_size = Vector2(px, px)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)
	return row


## Título dourado, centrado, com um filete que some nas pontas embaixo.
static func title(text: String, size: int = 28) -> VBoxContainer:
	var holder := VBoxContainer.new()
	holder.add_theme_constant_override("separation", 8)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var heading := rich(text, size, GOLD, true)
	heading.name = "Title"
	heading.add_theme_constant_override("outline_size", 6)
	heading.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	holder.add_child(heading)
	var line := TextureRect.new()
	var gradient := Gradient.new()
	gradient.set_color(0, Color(GOLD, 0.0))
	gradient.set_color(1, Color(GOLD, 0.0))
	gradient.add_point(0.5, Color(GOLD, 0.55))
	var tex := GradientTexture2D.new()
	tex.gradient = gradient
	tex.width = 256
	tex.height = 2
	line.texture = tex
	line.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	line.stretch_mode = TextureRect.STRETCH_SCALE
	line.custom_minimum_size = Vector2(320, 2)
	line.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(line)
	return holder


## Botão da janela: principal (dourado), secundário (azul-escuro), discreto ou perigoso; o desligado fica cinza e legível.
static func button(text: String, kind: int = Kind.SECONDARY, min_width: float = 0.0, height: float = 50.0) -> Button:
	var out := Button.new()
	out.text = text
	out.focus_mode = Control.FOCUS_NONE
	out.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	out.custom_minimum_size = Vector2(min_width, height)
	out.add_theme_font_size_override("font_size", 18 if height >= 44.0 else 15)
	style_button(out, kind)
	return out


static func style_button(out: Button, kind: int) -> void:
	var fill: Color
	var border: Color
	var ink: Color
	match kind:
		Kind.PRIMARY:
			fill = GOLD
			border = Color(GOLD_LIGHT, 0.9)
			ink = Color(0.16, 0.1, 0.02)
		Kind.DANGER:
			fill = Color("#b9452f")
			border = Color("#ff9b80", 0.55)
			ink = Color.WHITE
		Kind.GHOST:
			fill = Color(1, 1, 1, 0.0)
			border = Color(1, 1, 1, 0.2)
			ink = Color(1, 1, 1, 0.86)
		_:
			fill = NAVY
			border = Color(0.62, 0.76, 1.0, 0.24)
			ink = INK
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := box(fill, 25, border, 1)
		style.content_margin_left = 24
		style.content_margin_right = 24
		style.content_margin_top = 6
		style.content_margin_bottom = 6
		match state_name:
			"hover":
				style.bg_color = fill.lightened(0.14) if kind != Kind.GHOST else Color(1, 1, 1, 0.08)
				style.border_color = GOLD_LIGHT if kind == Kind.PRIMARY else (Color(BLUE, 0.8) if kind != Kind.DANGER else Color("#ffb7a3"))
			"pressed":
				style.bg_color = fill.darkened(0.14) if kind != Kind.GHOST else Color(1, 1, 1, 0.12)
			"disabled":
				style.bg_color = Color(0.17, 0.19, 0.24, 0.92)
				style.border_color = Color(1, 1, 1, 0.08)
			"focus":
				style.bg_color = Color(0, 0, 0, 0)
				style.border_color = Color(0, 0, 0, 0)
				style.set_border_width_all(0)
		if kind == Kind.PRIMARY and state_name in ["normal", "hover"]:
			style.shadow_color = Color(GOLD, 0.32 if state_name == "normal" else 0.5)
			style.shadow_size = 10 if state_name == "normal" else 16
		out.add_theme_stylebox_override(state_name, style)
	out.add_theme_color_override("font_color", ink)
	out.add_theme_color_override("font_hover_color", ink if kind != Kind.GHOST else Color.WHITE)
	out.add_theme_color_override("font_pressed_color", ink)
	out.add_theme_color_override("font_hover_pressed_color", ink)
	out.add_theme_color_override("font_disabled_color", Color(0.74, 0.77, 0.84, 0.78))


## Caixa de marcar com o quadrado desenhado em dourado (o do tema padrão some no fundo escuro).
static func checkbox(text: String, on: bool = false) -> CheckBox:
	var box_svg := "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><rect x='1.5' y='1.5' width='19' height='19' rx='5' fill='%s' stroke='%s' stroke-width='2'/>%s</svg>"
	var off := Image.new()
	off.load_svg_from_string(box_svg % ["#0b1220", "#8fa3c8", ""], 1.0)
	var lit := Image.new()
	lit.load_svg_from_string(box_svg % ["#f0b84a", "#ffd27a", "<path d='M6 11.5l3.5 3.5L16.5 7.5' fill='none' stroke='#2a1a04' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>"], 1.0)
	var out := CheckBox.new()
	out.text = text
	out.button_pressed = on
	out.focus_mode = Control.FOCUS_NONE
	out.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	out.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	out.add_theme_font_size_override("font_size", 16)
	out.add_theme_constant_override("h_separation", 10)
	out.add_theme_icon_override("unchecked", ImageTexture.create_from_image(off))
	out.add_theme_icon_override("checked", ImageTexture.create_from_image(lit))
	out.add_theme_color_override("font_color", INK)
	out.add_theme_color_override("font_hover_color", Color.WHITE)
	out.add_theme_color_override("font_pressed_color", GOLD_LIGHT)
	out.add_theme_color_override("font_hover_pressed_color", GOLD_LIGHT)
	return out


## Uma tecla de atalho num selo pequeno ("Enter", "Esc", "1").
static func keycap(text: String) -> PanelContainer:
	var cap := PanelContainer.new()
	var style := box(Color(1, 1, 1, 0.07), 5, Color(1, 1, 1, 0.22), 1)
	style.content_margin_left = 6
	style.content_margin_right = 6
	style.content_margin_top = 1
	style.content_margin_bottom = 1
	cap.add_theme_stylebox_override("panel", style)
	cap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var text_label := label(12, Color(1, 1, 1, 0.75), text)
	text_label.add_theme_constant_override("outline_size", 0)
	cap.add_child(text_label)
	return cap


## Selo redondo com um número (ordem, atalho), dourado quando aceso.
static func badge(text: String, lit: bool, diameter: float = 30.0) -> PanelContainer:
	var holder := PanelContainer.new()
	holder.name = "Badge"
	holder.custom_minimum_size = Vector2(diameter, diameter)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var number := label(int(diameter * 0.55), Color(0.16, 0.1, 0.02) if lit else INK, text)
	number.name = "Number"
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	number.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	number.add_theme_constant_override("outline_size", 0)
	holder.add_child(number)
	paint_badge(holder, lit)
	return holder


static func paint_badge(holder: PanelContainer, lit: bool) -> void:
	var style := box(GOLD if lit else Color(0.07, 0.1, 0.17, 0.95), 99, GOLD_LIGHT if lit else Color(1, 1, 1, 0.35), 2)
	if lit:
		style.shadow_color = Color(GOLD, 0.45)
		style.shadow_size = 8
	holder.add_theme_stylebox_override("panel", style)
	var number: Label = holder.get_node_or_null("Number")
	if number:
		number.add_theme_color_override("font_color", Color(0.16, 0.1, 0.02) if lit else INK)


## Um "pop" de entrada num controle (selo, número que mudou).
static func pop(node: Control, from: float = 0.55) -> void:
	if not node.is_inside_tree():
		return
	node.pivot_offset = node.size / 2.0
	node.scale = Vector2(from, from)
	var tween := node.create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(node, "scale", Vector2.ONE, 0.22)
