# Aparência da tela inicial: a letra dos títulos, a marca dourada, as cores de mana dos fundos, os campos de escolha e os links discretos.
class_name HomeStyle
extends RefCounted

## Fundo da tela (o mesmo azul quase preto em que a arte se desfaz).
const BG := Color("#060912")
const DIM := Color("#9aa3b5")
const SOFT := Color("#cfd5e2")
const LINE := Color(1, 1, 1, 0.08)
const PANEL := Color(0.067, 0.086, 0.141, 0.82)
## As cores de mana dos fundos provisórios (enquanto a arte não chega): mais escuras que os símbolos.
const MANA := {"W": Color("#d8cfae"), "U": Color("#2f7fc4"), "B": Color("#5b4a6b"), "R": Color("#c4472c"), "G": Color("#2f9a5a")}
const COLORLESS := Color("#56607a")
## A marca da Mesa de Duelo (a do ícone): losango de cantos redondos em dourado.
const MARK_SVG := "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fbd27e'/><stop offset='1' stop-color='#e39532'/></linearGradient></defs><rect x='14' y='14' width='36' height='36' rx='9' transform='rotate(45 32 32)' fill='url(#g)' stroke='#ffe3a6' stroke-opacity='0.55' stroke-width='2.5'/></svg>"

static var _display: SystemFont
static var _caps: FontVariation
static var _mark: Texture2D


## A letra dos títulos grandes (o nome do deck e da mesa): a do sistema, bem encorpada.
static func display_font() -> SystemFont:
	if _display == null:
		_display = SystemFont.new()
		_display.font_names = PackedStringArray(["Segoe UI", "Ubuntu", "Arial", "Helvetica", "sans-serif"])
		_display.font_weight = 800
	return _display


## A letra das legendas em caixa alta ("SEU DECK"): encorpada e com as letras afastadas.
static func caps_font() -> FontVariation:
	if _caps == null:
		_caps = FontVariation.new()
		_caps.base_font = ThemeDB.fallback_font
		_caps.variation_embolden = 0.6
		_caps.spacing_glyph = 3
	return _caps


static func mark_texture() -> Texture2D:
	if _mark == null:
		var image := Image.new()
		image.load_svg_from_string(MARK_SVG, 2.0)
		_mark = ImageTexture.create_from_image(image)
	return _mark


## A cor de mana do fundo provisório (incolor: um cinza azulado).
static func mana_color(symbol: String) -> Color:
	return MANA.get(symbol, COLORLESS)


## O fundo provisório de um deck: as cores dele em diagonal, apagando no fundo da tela.
static func placeholder(colors: PackedStringArray) -> GradientTexture2D:
	var gradient := Gradient.new()
	var first: Color = mana_color(colors[0] if not colors.is_empty() else "")
	var second: Color = mana_color(colors[1] if colors.size() > 1 else (colors[0] if not colors.is_empty() else ""))
	gradient.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	gradient.colors = PackedColorArray([Color(first.darkened(0.35), 1.0), Color(second.darkened(0.6), 1.0), BG])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.3, 0.3)
	texture.fill_to = Vector2(1.05, 1.05)
	texture.width = 256
	texture.height = 256
	return texture


## Uma faixa de degradê (para apagar a arte nas bordas): `stops` é [[posição, cor], ...], de `from` para `to`.
static func fade(stops: Array, from: Vector2, to: Vector2) -> GradientTexture2D:
	var gradient := Gradient.new()
	var offsets: PackedFloat32Array = []
	var colors: PackedColorArray = []
	for stop: Array in stops:
		offsets.append(float(stop[0]))
		colors.append(stop[1])
	gradient.offsets = offsets
	gradient.colors = colors
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = from
	texture.fill_to = to
	texture.width = 256
	texture.height = 256
	return texture


## Um campo de escolha (OptionButton) escuro, de cantos quase retos, com a borda dourada ao passar o mouse e a lista no mesmo tom.
static func style_field(field: OptionButton) -> void:
	field.custom_minimum_size.y = 46
	field.add_theme_font_size_override("font_size", 18)
	field.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	field.focus_mode = Control.FOCUS_NONE
	field.fit_to_longest_item = false
	field.clip_text = true
	var fills: Dictionary = {
		"normal": [Color(0.04, 0.055, 0.094, 0.78), Color(1, 1, 1, 0.1)],
		"hover": [Color(0.07, 0.09, 0.15, 0.9), Color(HudStyle.GOLD, 0.6)],
		"pressed": [Color(0.03, 0.04, 0.07, 0.9), Color(HudStyle.GOLD, 0.8)],
		"disabled": [Color(0.04, 0.055, 0.094, 0.5), Color(1, 1, 1, 0.05)],
	}
	for state_name: String in fills:
		var style := ModalStyle.box((fills[state_name] as Array)[0], ModalStyle.RADIUS, (fills[state_name] as Array)[1], 1)
		style.content_margin_left = 14
		style.content_margin_right = 14
		field.add_theme_stylebox_override(state_name, style)
	field.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	field.add_theme_color_override("font_color", ModalStyle.INK)
	field.add_theme_color_override("font_hover_color", Color.WHITE)
	field.add_theme_color_override("font_pressed_color", ModalStyle.GOLD_LIGHT)
	field.add_theme_constant_override("arrow_margin", 14)
	style_popup(field.get_popup())


## A lista aberta de um campo: painel escuro, a linha do mouse em dourado.
static func style_popup(popup: PopupMenu) -> void:
	var panel := ModalStyle.box(Color(0.05, 0.07, 0.12, 0.98), ModalStyle.RADIUS, Color(HudStyle.GOLD, 0.3), 1)
	panel.content_margin_top = 6
	panel.content_margin_bottom = 6
	panel.content_margin_left = 6
	panel.content_margin_right = 6
	popup.add_theme_stylebox_override("panel", panel)
	var hover := ModalStyle.box(Color(HudStyle.GOLD, 0.16), 2)
	popup.add_theme_stylebox_override("hover", hover)
	popup.add_theme_font_size_override("font_size", 17)
	popup.add_theme_color_override("font_color", ModalStyle.INK)
	popup.add_theme_color_override("font_hover_color", ModalStyle.GOLD_LIGHT)
	popup.add_theme_color_override("font_separator_color", DIM)
	popup.add_theme_constant_override("v_separation", 10)
	popup.add_theme_constant_override("item_start_padding", 12)
	popup.add_theme_constant_override("item_end_padding", 12)


## Um botão com cara de link (texto apagado que acende em dourado), para o que fica à mão sem pesar na tela.
static func link(text: String) -> Button:
	var out := Button.new()
	out.text = text
	out.flat = true
	out.focus_mode = Control.FOCUS_NONE
	out.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	out.add_theme_font_size_override("font_size", 15)
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		var style := ModalStyle.box(Color(1, 1, 1, 0.06) if state_name == "hover" else Color(0, 0, 0, 0), 14)
		style.content_margin_left = 10
		style.content_margin_right = 10
		style.content_margin_top = 4
		style.content_margin_bottom = 4
		out.add_theme_stylebox_override(state_name, style)
	out.add_theme_color_override("font_color", DIM)
	out.add_theme_color_override("font_hover_color", HudStyle.GOLD_SOFT)
	out.add_theme_color_override("font_pressed_color", HudStyle.GOLD)
	out.add_theme_color_override("font_hover_pressed_color", HudStyle.GOLD)
	return out


## Um botão grande da coluna (dourado no principal), o das janelas (ModalStyle) na altura da tela inicial.
static func action_button(text: String, primary: bool, height: float = 60.0) -> Button:
	var out: Button = ModalStyle.button(text, ModalStyle.Kind.PRIMARY if primary else ModalStyle.Kind.SECONDARY, 0.0, height)
	out.add_theme_font_size_override("font_size", 20)
	return out
