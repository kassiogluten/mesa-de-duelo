# Peças de desenho do inspetor e da prévia de carta: cores, caixas, textos, selos de palavra-chave, notas e botões.
class_name InspectorKit
extends RefCounted

const BG := Color("#101a2e")
const LINE := Color("#3a4768")
const INK := Color("#eef1f8")
const MUTED := Color(0.78, 0.82, 0.9, 0.72)
const FAINT := Color(0.78, 0.82, 0.9, 0.45)
const GOLD := Color("#f0b84a")
const DAMAGE := Color("#ff7a6b")
## O destaque do tipo mudado por um efeito (o azul-claro de .ci-type-change no navegador).
const CHANGED := Color("#bfe6ff")
const CHANGED_BG := Color(0.62, 0.85, 1.0, 0.13)
const CARD_ASPECT := 88.0 / 63.0
const IMAGE_SHADER := preload("res://ui/card_image.gdshader")

static var _bold: FontVariation


## A fonte em negrito (a padrão, engrossada).
static func bold() -> FontVariation:
	if _bold == null:
		_bold = FontVariation.new()
		_bold.base_font = ThemeDB.fallback_font
		_bold.variation_embolden = 0.7
	return _bold


## Os detalhes de CardDetails.build no painel do inspetor: tipo (com o que um efeito mudou), texto, força, palavras-chave,
## marcadores e notas.
static func fill_details(column: VBoxContainer, details: Dictionary) -> void:
	for child: Node in column.get_children():
		column.remove_child(child)
		child.queue_free()
	if Txt.of(details["type"]) != "":
		var type := rich(18, MUTED)
		type.add_text(Txt.of(details["type"]))
		if Txt.of(details.get("type_change")) != "":
			# O tipo mudado por um efeito, em destaque depois da linha impressa: "— agora também Criatura 3/3".
			type.add_text(" ")
			type.push_bgcolor(CHANGED_BG)
			type.push_font(bold(), 18)
			type.push_color(CHANGED)
			type.add_text("— " + Txt.of(details["type_change"]))
			type.pop()
			type.pop()
			type.pop()
		column.add_child(type)
	if Txt.of(details["text"]) != "":
		column.add_child(rules(Txt.of(details["text"]), 19, INK))
	if Txt.of(details["power"]) != "":
		column.add_child(rule())
		var strength := rich(18, MUTED)
		strength.push_font(bold(), 30)
		strength.push_color(INK)
		strength.add_text("%s / %s" % [details["power"], details["toughness"]])
		strength.pop()
		strength.pop()
		if Txt.of(details["base"]) != "":
			strength.add_text("    Base: %s" % details["base"])
		if int(details["damage"]) > 0:
			strength.push_color(DAMAGE)
			strength.add_text("    %d de dano marcado" % int(details["damage"]))
			strength.pop()
		column.add_child(strength)
	var keywords: PackedStringArray = details["keywords"]
	if not keywords.is_empty():
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 8)
		flow.add_theme_constant_override("v_separation", 8)
		for keyword: String in keywords:
			flow.add_child(chip(keyword))
		column.add_child(flow)
	var counters: PackedStringArray = details["counters"]
	if not counters.is_empty():
		var line := rich(17, INK)
		line.push_color(MUTED)
		line.add_text("Marcadores: ")
		line.pop()
		line.add_text(", ".join(counters))
		column.add_child(line)
	for text: String in details["notes"] as PackedStringArray:
		column.add_child(note(text))


## A imagem de uma carta com o shader de cantos, reflexo, giro e foil.
static func card_image(width: float) -> TextureRect:
	var image := TextureRect.new()
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_SCALE
	image.custom_minimum_size = Vector2(width, round(width * CARD_ASPECT))
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = IMAGE_SHADER
	material.set_shader_parameter("aspect", CARD_ASPECT)
	material.set_shader_parameter("light", Vector2(0.3, 0.2))
	material.set_shader_parameter("rect_size", image.custom_minimum_size)
	image.material = material
	return image


## Botão do cabeçalho (Fechar, Ver o verso, Apontar), com a borda dourada no hover.
static func button(text: String, width: float = 0.0) -> Button:
	var out := Button.new()
	out.text = text
	out.focus_mode = Control.FOCUS_NONE
	out.custom_minimum_size = Vector2(width, 46)
	out.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	out.add_theme_font_size_override("font_size", 18)
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		var style := box(Color("#16223a") if state_name != "hover" else Color("#20304f"), 12, 1)
		style.border_color = GOLD if state_name == "hover" else LINE
		style.content_margin_left = 16
		style.content_margin_right = 16
		out.add_theme_stylebox_override(state_name, style)
	out.add_theme_color_override("font_color", INK)
	out.add_theme_color_override("font_hover_color", INK)
	out.add_theme_color_override("font_pressed_color", INK)
	return out


## Palavra-chave num selo arredondado.
static func chip(text: String) -> PanelContainer:
	var out := PanelContainer.new()
	var style := box(Color("#1b2944"), 14, 1)
	style.border_color = Color("#4a5d88")
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 4
	style.content_margin_bottom = 5
	out.add_theme_stylebox_override("panel", style)
	var text_label := label(16, INK)
	text_label.text = text
	text_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	out.add_child(text_label)
	return out


## Nota com a barra dourada à esquerda.
static func note(text: String) -> PanelContainer:
	var out := PanelContainer.new()
	var style := box(Color(0.94, 0.72, 0.29, 0.07), 6, 0)
	style.border_color = GOLD
	style.border_width_left = 3
	style.content_margin_left = 12
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 7
	out.add_theme_stylebox_override("panel", style)
	var text_label := rich(16, INK)
	ManaSymbols.append_rich(text_label, text, 16)
	out.add_child(text_label)
	return out


static func rule() -> ColorRect:
	var line := ColorRect.new()
	line.color = Color(LINE, 0.7)
	line.custom_minimum_size = Vector2(0, 1)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return line


static func label(size: int, color: Color) -> Label:
	var out := Label.new()
	out.add_theme_font_size_override("font_size", size)
	out.add_theme_color_override("font_color", color)
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return out


static func rich(size: int, color: Color) -> RichTextLabel:
	var out := RichTextLabel.new()
	out.fit_content = true
	out.scroll_active = false
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	out.add_theme_font_size_override("normal_font_size", size)
	out.add_theme_color_override("default_color", color)
	out.add_theme_constant_override("line_separation", 3)
	out.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return out


## O texto de regras com os símbolos de mana e um respiro entre os parágrafos.
static func rules(text: String, size: int, color: Color) -> RichTextLabel:
	var out := rich(size, color)
	var lines: PackedStringArray = text.split("\n")
	for i: int in lines.size():
		if i > 0:
			out.add_text("\n")
			out.push_font_size(int(size * 0.42))
			out.add_text("\n")
			out.pop()
		ManaSymbols.append_rich(out, lines[i], size)
	return out


static func margins(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)


static func box(color: Color, radius: int, border: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.border_color = LINE
	style.set_border_width_all(border)
	style.shadow_color = Color(0, 0, 0, 0.5)
	style.shadow_size = 18 if border > 0 or radius >= 14 else 0
	style.shadow_offset = Vector2(0, 8)
	style.anti_aliasing = true
	return style
