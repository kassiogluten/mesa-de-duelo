# A carta desenhada que aparece enquanto a imagem não chega (ou na ficha sem arte): o que vai nela (nome, custo, tipo, texto
# em português e P/R, na cor da carta) e o desenho em controles, no estilo da carta de verdade (barras claras, moldura na cor).
class_name CardSketch
extends RefCounted

## O tamanho do desenho (a proporção da carta, 63 × 88).
const SIZE := Vector2i(400, 558)
## A moldura de cada cor (W U B R G, multicolorida, incolor, terreno).
const TONES := {
	"W": Color("#cbbf9a"), "U": Color("#2f62a8"), "B": Color("#4a4150"), "R": Color("#b0412e"), "G": Color("#2f7a3c"),
	"M": Color("#b8913a"), "C": Color("#8a9098"), "L": Color("#86694a"),
}
const INK := Color("#161514")
const PAPER := Color("#f3efe4")


## O que vai na carta desenhada: {label, cost, type, text, pt, tone, token}. Os dados em português vêm do catálogo
## quando já chegaram; antes disso (e nas fichas), os do estado, com a ficha sem "Token" e no tipo em português.
static func spec(card: Dictionary, catalog: CardCatalog) -> Dictionary:
	var name: String = Txt.of(card.get("name", ""))
	var token: bool = bool(card.get("token", false)) or name.ends_with(" Token")
	var info: Dictionary = catalog.info(name) if catalog and name != "" else {}
	if info.is_empty() and catalog:
		var found: Dictionary = catalog.face_of(name)
		if not found.is_empty():
			info = ((found["entry"] as Dictionary).get("faces", []) as Array)[int(found["index"])]
	var line: String = Txt.of(card.get("typeLine", ""))
	var label: String = Txt.of(info.get("label", ""))
	if label == "":
		label = TokenNames.label(name) if token else name
	var type: String = Txt.of(info.get("type_line", ""))
	if type == "":
		type = TokenNames.type_line(line, token)
	var text: String = Txt.of(info.get("text", ""))
	if text == "":
		text = _state_text(card)
	var colors: Array = info.get("colors", []) if info.get("colors") is Array else []
	if colors.is_empty():
		colors = _cost_colors(Txt.of(card.get("manaCost", "")))
	if colors.is_empty() and token:
		colors = TokenNames.colors(line)
	var tone: String = "C"
	if colors.size() > 1:
		tone = "M"
	elif colors.size() == 1:
		tone = Txt.of(colors[0])
	elif bool(card.get("land", false)) or line.contains("Land"):
		tone = "L"
	return {"label": label, "cost": Txt.of(card.get("manaCost", "")), "type": type, "text": text, "pt": _pt(card), "tone": tone, "token": token}


## A chave do desenho: cartas com os mesmos dados dividem a mesma textura.
static func key(data: Dictionary) -> String:
	return "%s|%s|%s|%s|%s|%s" % [data.get("label"), data.get("cost"), data.get("type"), data.get("tone"), data.get("pt"), str(Txt.of(data.get("text")).hash())]


## P/R impressos (sem os bônus, que a mesa mostra à parte) nas criaturas, e a lealdade nos planeswalkers.
static func _pt(card: Dictionary) -> String:
	if bool(card.get("creature", false)) and card.has("power"):
		return "%d/%d" % [int(card.get("basePower", card["power"])), int(card.get("baseToughness", card.get("toughness", 0)))]
	if bool(card.get("planeswalker", false)) and card.get("counters") is Dictionary and (card["counters"] as Dictionary).has("LOYALTY"):
		return str(int((card["counters"] as Dictionary)["LOYALTY"]))
	return ""


## O texto quando a carta em português ainda não chegou: as palavras-chave em português e o resto como o Forge escreve.
static func _state_text(card: Dictionary) -> String:
	var keywords: PackedStringArray = []
	var english: Dictionary = {}
	for raw: Variant in card.get("keywords", []) if card.get("keywords") is Array else []:
		var keyword: String = Txt.of(raw)
		if CardLabels.KEYWORD_LABEL.has(keyword):
			keywords.append(CardLabels.keyword_name(keyword))
			english[keyword.to_lower().replace("_", " ")] = true
	var lines: PackedStringArray = []
	if not keywords.is_empty():
		lines.append(", ".join(keywords))
	for line: String in Txt.of(card.get("text", "")).replace("\r", "").split("\n", false):
		# A linha que só repete as palavras-chave ("Flying, haste") já foi em português.
		var only_keywords: bool = true
		for part: String in line.split(",", false):
			if not english.has(part.strip_edges().to_lower()):
				only_keywords = false
		if not only_keywords:
			lines.append(line.strip_edges())
	return "\n".join(lines)


static func _cost_colors(cost: String) -> Array:
	var out: Array = []
	for symbol: String in ManaSymbols.parse(cost):
		for color: String in ["W", "U", "B", "R", "G"]:
			if symbol.contains(color) and not out.has(color):
				out.append(color)
	return out


# — O desenho —

## A carta desenhada em controles, do tamanho SIZE, para uma SubViewport transformar em textura.
static func build(data: Dictionary) -> Control:
	var w: float = SIZE.x
	var h: float = SIZE.y
	var tone: Color = TONES.get(Txt.of(data.get("tone")), TONES["C"])
	var bar: Color = tone.lerp(Color.WHITE, 0.8)
	var root := Panel.new()
	root.size = Vector2(w, h)
	root.add_theme_stylebox_override("panel", _box(Color("#141414"), 20))
	# A moldura na cor da carta, mais escura embaixo.
	var frame := _gradient_rect(Rect2(12, 12, w - 24, h - 24), tone.lightened(0.08), tone.darkened(0.32), 12)
	root.add_child(frame)
	# Nome e custo.
	var name_bar := _panel(Rect2(22, 22, w - 44, 46), bar, 7, tone.darkened(0.45))
	root.add_child(name_bar)
	var symbols: PackedStringArray = ManaSymbols.parse(Txt.of(data.get("cost")))
	var pip: float = 27.0
	var cost_w: float = symbols.size() * (pip + 2.0)
	for i: int in symbols.size():
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(symbols[i], 64)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.position = Vector2(w - 34 - cost_w + i * (pip + 2.0), 22 + (46 - pip) / 2.0)
		icon.size = Vector2(pip, pip)
		root.add_child(icon)
	root.add_child(_fit_label(Txt.of(data.get("label")), Rect2(34, 22, w - 76 - cost_w, 46), 27, 15, true))
	# A arte: um degradê na cor, com o símbolo da cor bem apagado no meio.
	var art := _gradient_rect(Rect2(28, 74, w - 56, 238), tone.darkened(0.55), tone.lightened(0.12), 3, true)
	root.add_child(art)
	var glyph: String = Txt.of(data.get("tone"))
	if glyph in ["W", "U", "B", "R", "G"]:
		var mark := TextureRect.new()
		mark.texture = ManaSymbols.texture(glyph, 256)
		mark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		mark.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		mark.size = Vector2(120, 120)
		mark.position = Vector2((w - 120) / 2.0, 74 + (238 - 120) / 2.0)
		mark.modulate = Color(1, 1, 1, 0.16)
		root.add_child(mark)
	# Tipo.
	root.add_child(_panel(Rect2(22, 316, w - 44, 40), bar, 7, tone.darkened(0.45)))
	root.add_child(_fit_label(Txt.of(data.get("type")), Rect2(34, 316, w - 68, 40), 21, 12, false))
	# Texto, com os {símbolos} como ícones.
	var pt: String = Txt.of(data.get("pt"))
	root.add_child(_panel(Rect2(30, 360, w - 60, 168 if pt == "" else 156), PAPER.lerp(tone, 0.06), 4, Color(0, 0, 0, 0)))
	var text: String = Txt.of(data.get("text"))
	if text != "":
		root.add_child(_rules(text, Rect2(42, 368, w - 84, 140 if pt == "" else 128)))
	if pt != "":
		root.add_child(_panel(Rect2(w - 112, h - 66, 84, 42), bar, 8, tone.darkened(0.45)))
		var stats := _fit_label(pt, Rect2(w - 112, h - 66, 84, 42), 26, 16, true)
		stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		root.add_child(stats)
	return root


static func _box(color: Color, radius: int, border: Color = Color(0, 0, 0, 0)) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(radius)
	box.anti_aliasing = true
	if border.a > 0.0:
		box.border_color = border
		box.set_border_width_all(2)
	return box


static func _panel(rect: Rect2, color: Color, radius: int, border: Color) -> Panel:
	var panel := Panel.new()
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", _box(color, radius, border))
	return panel


static func _gradient_rect(rect: Rect2, top: Color, bottom: Color, radius: int, diagonal: bool = false) -> Control:
	var gradient := Gradient.new()
	gradient.set_color(0, top)
	gradient.set_color(1, bottom)
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.width = 64
	texture.height = 64
	texture.fill_from = Vector2(0, 0) if diagonal else Vector2(0.5, 0)
	texture.fill_to = Vector2(1, 1) if diagonal else Vector2(0.5, 1)
	var holder := Panel.new()
	holder.position = rect.position
	holder.size = rect.size
	holder.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	holder.add_theme_stylebox_override("panel", _box(Color.WHITE, radius))
	var fill := TextureRect.new()
	fill.texture = texture
	fill.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	fill.stretch_mode = TextureRect.STRETCH_SCALE
	fill.size = rect.size
	holder.add_child(fill)
	return holder


## Uma linha que diminui a letra até caber na largura (de `big` a `small`).
static func _fit_label(text: String, rect: Rect2, big: int, small: int, bold: bool) -> Label:
	var font: Font = HudStyle.bold_font() if bold else ThemeDB.fallback_font
	var size: int = big
	while size > small and font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x > rect.size.x:
		size -= 1
	var label := Label.new()
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", INK)
	return label


## O texto de regras, com a letra que cabe na caixa (de 24 a 11) e os símbolos de mana na altura da letra.
static func _rules(text: String, rect: Rect2) -> RichTextLabel:
	var font: Font = ThemeDB.fallback_font
	var size: int = 24
	while size > 11 and font.get_multiline_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, rect.size.x, size).y > rect.size.y:
		size -= 1
	var out := RichTextLabel.new()
	out.position = rect.position
	out.size = rect.size
	out.scroll_active = false
	out.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	out.add_theme_font_size_override("normal_font_size", size)
	out.add_theme_color_override("default_color", INK)
	ManaSymbols.append_rich(out, text, size)
	return out
