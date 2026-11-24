# Estilo comum das peças do HUD (cores, raios, tamanhos de letra, painéis, pílulas, botões e textos com símbolos de mana),
# para a caixa de ação, a barra do alto, os relógios, a trilha, os assentos e os avisos falarem a mesma língua, na
# direção "Nítido" das janelas (docs/direcao-visual-mesa-pc.md): cantos quase retos, botões com a base de tecla.
class_name HudStyle
extends RefCounted

## Dourado da mesa (a sua vez, o botão principal, o realce).
const GOLD := Color("#f0b84a")
const GOLD_SOFT := Color("#ffe2a0")
## Texto sobre o dourado.
const INK := Color("#1b1203")
const DANGER := Color("#ff5a4e")
const SUCCESS := Color("#6fd08c")
const INFO := Color("#8fb8ff")
## Texto principal (branco quente), secundário e apagado.
const TEXT := Color(1, 0.97, 0.9)
const TEXT_SOFT := Color(1, 1, 1, 0.82)
const TEXT_DIM := Color(1, 1, 1, 0.58)
## Fundo dos painéis grandes (caixa de ação, menus) e das pílulas do alto.
const PANEL_BG := Color(0.035, 0.05, 0.085, 0.92)
const CHIP_BG := Color(0.04, 0.06, 0.1, 0.84)
const CHIP_HOVER := Color(0.1, 0.13, 0.2, 0.94)
const CHIP_PRESSED := Color(0.03, 0.045, 0.075, 0.96)
const BORDER := Color(1, 1, 1, 0.1)
const BUTTON_BG := Color(0.12, 0.15, 0.24)

## Cantos quase retos (ModalStyle.RADIUS), em tudo; um pouco mais nas pílulas, que são pequenas.
const RADIUS_PANEL := 4
const RADIUS_CHIP := 5
const RADIUS_BUTTON := 4
## Altura das pílulas do alto (menu, histórico, relógios, Desfazer, nível de passar).
const CHIP_H := 40

const SIZE_TITLE := 22
const SIZE_BUTTON := 19
const SIZE_BODY := 16
const SIZE_SMALL := 15
const SIZE_CAPTION := 13

## Distância das bordas da tela.
const MARGIN := 24.0

static var _bold: FontVariation


## A letra padrão um pouco mais encorpada (títulos da caixa de ação, botões principais).
static func bold_font() -> FontVariation:
	if _bold == null:
		_bold = FontVariation.new()
		_bold.base_font = ThemeDB.fallback_font
		_bold.variation_embolden = 0.55
	return _bold


## Um painel com as margens de dentro de sempre, de cantos quase retos (o raio pedido só vale nos redondos de verdade,
## como o retrato: de 40 para cima).
static func panel(color: Color = PANEL_BG, radius: int = RADIUS_PANEL) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius if radius >= 40 else mini(radius, RADIUS_PANEL))
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	style.anti_aliasing = true
	return style


## A moldura das janelas (ModalStyle.panel_style) num painel do HUD: o filete dourado no alto e a sombra macia.
static func framed(style: StyleBoxFlat) -> StyleBoxFlat:
	style.border_color = ModalStyle.GOLD
	style.set_border_width_all(0)
	style.border_width_top = ModalStyle.TOP_LINE
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = maxi(style.shadow_size, 18)
	style.shadow_offset = Vector2(0, 6)
	return style


## O fundo das pílulas do alto (escuro, borda fina).
static func chip_style(color: Color = CHIP_BG, border: Color = BORDER) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(RADIUS_CHIP)
	style.border_color = border
	style.set_border_width_all(1)
	style.content_margin_left = 12
	style.content_margin_right = 14
	style.content_margin_top = 5
	style.content_margin_bottom = 5
	return style


## Uma pílula com uma fileira dentro (relógios, placar).
static func chip() -> PanelContainer:
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", chip_style())
	box.mouse_filter = Control.MOUSE_FILTER_PASS
	box.custom_minimum_size = Vector2(0, CHIP_H)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(row)
	return box


## Dá a um botão o visual das pílulas do alto: escuro, acende ao passar o mouse, afunda ao apertar.
static func style_chip_button(button: Button) -> void:
	button.add_theme_font_size_override("font_size", SIZE_BODY)
	var fills: Dictionary = {"normal": CHIP_BG, "hover": CHIP_HOVER, "pressed": CHIP_PRESSED, "disabled": Color(CHIP_BG, 0.5), "focus": CHIP_BG}
	for state_name: String in fills:
		var style := chip_style(fills[state_name], Color(ModalStyle.GOLD_LIGHT, 0.55) if state_name == "hover" else BORDER)
		if state_name == "focus":
			button.add_theme_stylebox_override(state_name, StyleBoxEmpty.new())
			continue
		if state_name == "pressed":
			style.content_margin_top += 1
			style.content_margin_bottom -= 1
		button.add_theme_stylebox_override(state_name, style)
	button.add_theme_color_override("font_color", Color(1, 1, 1, 0.92))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color(1, 1, 1, 0.8))
	button.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.35))
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, CHIP_H)


## Um botão pílula do alto com texto.
static func chip_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	style_chip_button(button)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return button


static func label(size: int, color: Color) -> Label:
	var out := Label.new()
	out.add_theme_font_size_override("font_size", size)
	out.add_theme_color_override("font_color", color)
	out.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	out.add_theme_constant_override("outline_size", 6)
	return out


## Um texto que quebra as linhas e desenha os {símbolos} de mana como ícones (escreva com set_rich_text).
static func rich_label(size: int, color: Color, width: float, bold: bool = false) -> RichTextLabel:
	var out := RichTextLabel.new()
	out.bbcode_enabled = false
	out.fit_content = true
	out.scroll_active = false
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	out.custom_minimum_size = Vector2(width, 0)
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	out.add_theme_font_size_override("normal_font_size", size)
	out.add_theme_color_override("default_color", color)
	out.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	out.add_theme_constant_override("outline_size", 4)
	out.add_theme_constant_override("line_separation", 2)
	if bold:
		out.add_theme_font_override("normal_font", bold_font())
	return out


## Troca o texto de um rich_label, com os símbolos de mana na altura da letra.
static func set_rich_text(label_node: RichTextLabel, text: String) -> void:
	label_node.clear()
	var size: int = label_node.get_theme_font_size("normal_font_size")
	ManaSymbols.append_rich(label_node, text, int(round(size * 1.05)))


## Tem {símbolo} de mana para desenhar.
static func has_symbols(text: String) -> bool:
	var start: int = text.find("{")
	return start >= 0 and text.find("}", start) > start


## Botão grande da mesa (principal em dourado): o das janelas (ModalStyle, a base de tecla que afunda ao apertar, o
## brilho dourado com o mouse), na altura e na letra da caixa de ação.
static func button(text: String, primary: bool) -> Button:
	var out: Button = ModalStyle.button(text, ModalStyle.Kind.PRIMARY if primary else ModalStyle.Kind.SECONDARY, 0.0, 52.0)
	out.focus_mode = Control.FOCUS_ALL
	out.add_theme_font_size_override("font_size", 20)
	for state_name: String in ["normal", "hover", "pressed", "disabled"]:
		var style: StyleBoxFlat = out.get_theme_stylebox(state_name)
		style.content_margin_top = 8 + (ModalStyle.BUTTON_BASE if state_name == "pressed" else 0)
		style.content_margin_bottom = 8
	out.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	return out


## Botão menor (barra do alto, gavetas): o mesmo visual das pílulas.
static func small_button(text: String) -> Button:
	return chip_button(text)


## Uma tecla desenhada ("Espaço") para lembrar o atalho num botão.
static func keycap(text: String, dark: bool) -> PanelContainer:
	var box := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0.16) if dark else Color(1, 1, 1, 0.1)
	style.border_color = Color(0, 0, 0, 0.35) if dark else Color(1, 1, 1, 0.3)
	style.set_border_width_all(1)
	style.border_width_bottom = 2
	style.set_corner_radius_all(5)
	style.content_margin_left = 6
	style.content_margin_right = 6
	style.content_margin_top = 1
	style.content_margin_bottom = 1
	box.add_theme_stylebox_override("panel", style)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var text_label := Label.new()
	text_label.text = text
	text_label.add_theme_font_size_override("font_size", 12)
	text_label.add_theme_color_override("font_color", Color(INK, 0.75) if dark else Color(1, 1, 1, 0.7))
	box.add_child(text_label)
	return box
