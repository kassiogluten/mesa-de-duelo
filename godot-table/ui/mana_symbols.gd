# Símbolos de mana ({2}{G}, {T}, {W/U}) como ícones redondos, desenhados de SVG na hora: no custo e no texto das cartas.
class_name ManaSymbols
extends RefCounted

## Cor de fundo de cada mana (.pip-* de src/style.css); o resto (genérica, X, virar) é o bege das genéricas.
const COLORS := {"W": "#f7f0d2", "U": "#2f80d6", "B": "#6a5c6b", "R": "#e3593a", "G": "#3d9b54", "C": "#b7b4ad"}
const GENERIC := "#cbc5b8"
const INK := "#1d1b16"
## Desenho de cada cor (os mesmos de src/ui/cardtext.ts), numa caixa de 24×24.
const GLYPHS := {
	"W": "<circle cx='12' cy='12' r='4'/><path d='M11 0h2v5h-2zm0 19h2v5h-2zM0 11h5v2H0zm19 0h5v2h-5zM3 2l4 4-1 2-4-4zm14 15 5 4-2 2-4-5zM2 20l4-4 2 1-4 5zM17 7l-1-1 4-4 2 2z'/>",
	"U": "<path d='M12 1C9 7 4 11 4 16a8 8 0 0 0 16 0c0-5-5-9-8-15zm4 17c-2 3-5 2-5 2 5-2 4-6 5-6 1 0 1 2 0 4z'/>",
	"B": "<path d='M12 2a9 9 0 0 0-9 9c0 4 2 6 5 7v4h8v-4c3-1 5-3 5-7a9 9 0 0 0-9-9zM6 10h4v4H6zm8 0h4v4h-4zm-4 6 2-3 2 3z'/>",
	"R": "<path d='M14 1c2 7-5 7-3 12 3-1 5-3 6-6 2 3 5 7 3 11a9 9 0 0 1-16-1c-2-5 3-8 5-10-1 5 1 4 2 2 1-2 2-5 3-8z'/>",
	"G": "<path d='M12 1 5 8h3l-6 7h8v5H6v3h12v-3h-4v-5h8l-6-7h3z'/>",
	"C": "<path d='m12 1 11 11-11 11L1 12zm0 5-6 6 6 6 6-6z'/>",
}
## Números e letras em traço (o SVG do Godot não desenha texto), também numa caixa de 24×24.
const STROKES := {
	"0": "<ellipse cx='12' cy='12' rx='4.6' ry='7'/>",
	"1": "<path d='M9.5 7.5 13 5v14'/>",
	"2": "<path d='M7.6 8.6C8 4.6 16.2 4.4 16.2 9c0 3-8 6-8.6 10h9'/>",
	"3": "<path d='M8 5.2h8l-4.6 5.4c5.6-.2 6.4 8.4.4 8.4-2 0-3.4-.8-4.2-2'/>",
	"4": "<path d='M14.2 19V5L7 15h10'/>",
	"5": "<path d='M16 5.2H9.4L8.8 11c1.6-1 7.8-1.6 7.8 3.6 0 5-6.4 5.6-9 2.8'/>",
	"6": "<path d='M15.4 5.6C10.4 4.8 7.6 9 7.6 14c0 3 2 5 4.4 5s4.4-2 4.4-4.4-2-4.4-4.4-4.4c-2 0-3.8 1.4-4.4 2.8'/>",
	"7": "<path d='M7.4 5.2h9.2L10.6 19'/>",
	"8": "<circle cx='12' cy='8.6' r='3.4'/><circle cx='12' cy='15.4' r='3.8'/>",
	"9": "<path d='M8.6 18.4c5 .8 7.8-3.4 7.8-8.4 0-3-2-5-4.4-5S7.6 7 7.6 9.4s2 4.4 4.4 4.4c2 0 3.8-1.4 4.4-2.8'/>",
	"X": "<path d='M8 6l8 12M16 6 8 18'/>",
	"Y": "<path d='M7.6 5.6 12 12l4.4-6.4M12 12v6.6'/>",
	"Z": "<path d='M7.6 6h8.8l-8.8 12h8.8'/>",
	"T": "<path d='M6.4 15.6A6 6 0 1 1 17 9.4'/><path d='M18.4 4.6 17.4 10l-5-1.4'/>",
	"Q": "<path d='M17.6 15.6A6 6 0 1 0 7 9.4'/><path d='M5.6 4.6 6.6 10l5-1.4'/>",
	"S": "<path d='M12 4v16M5 8l14 8M19 8 5 16'/>",
	"E": "<path d='M13 4 7 13h5l-1 7 6-9h-5z'/>",
	"P": "<circle cx='12' cy='12' r='4.4'/><path d='M12 4v16'/>",
	"H": "<path d='M8 6v12M16 6v12M8 12h8'/>",
}

static var _cache: Dictionary = {}


## Os símbolos de um custo, sem as chaves: "{2}{G}{G}" → ["2", "G", "G"].
static func parse(cost: String) -> PackedStringArray:
	var out: PackedStringArray = []
	var start: int = cost.find("{")
	while start >= 0:
		var end: int = cost.find("}", start)
		if end < 0:
			break
		out.append(cost.substr(start + 1, end - start - 1).to_upper())
		start = cost.find("{", end)
	return out


## O ícone de um símbolo com `px` de lado (em cache).
static func texture(symbol: String, px: int) -> Texture2D:
	var key: String = "%s@%d" % [symbol, px]
	if _cache.has(key):
		return _cache[key]
	var image := Image.new()
	var tex: Texture2D = null
	if image.load_svg_from_string(svg(symbol), float(px) / 24.0) == OK:
		tex = ImageTexture.create_from_image(image)
	_cache[key] = tex
	return tex


## O SVG de um símbolo: o disco na cor (dividido ao meio nos híbridos) com o desenho ou o número por cima.
static func svg(symbol: String) -> String:
	var parts: PackedStringArray = symbol.to_upper().split("/")
	var a: String = parts[0]
	var b: String = parts[1] if parts.size() > 1 else ""
	var body: String = ""
	if b != "" and b != "P":
		# Híbrido: metade de cada cor, os dois desenhos pequenos nos cantos.
		body = "<circle cx='12' cy='12' r='11.4' fill='%s'/><path d='M20.06 3.94A11.4 11.4 0 0 0 3.94 20.06z' fill='%s'/>" % [_color(b), _color(a)]
		body += _glyph(a, 7.8, 7.8, 0.42) + _glyph(b, 16.2, 16.2, 0.42)
	else:
		body = "<circle cx='12' cy='12' r='11.4' fill='%s'/>" % _color(a)
		body += _glyph(a, 12, 12, 0.74)
		if b == "P":
			# Phyrexiana: o anel fino por dentro.
			body += "<circle cx='12' cy='12' r='9.4' fill='none' stroke='%s' stroke-width='1.2' opacity='.55'/>" % INK
	var shade: String = "<circle cx='12' cy='12' r='11.4' fill='none' stroke='#000' stroke-opacity='.35' stroke-width='.9'/>"
	return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'>%s%s</svg>" % [body, shade]


## Escreve um texto de carta num RichTextLabel, com os {símbolos} como ícones da altura da letra.
static func append_rich(label: RichTextLabel, text: String, px: int) -> void:
	var at: int = 0
	while at < text.length():
		var start: int = text.find("{", at)
		var end: int = text.find("}", start) if start >= 0 else -1
		if start < 0 or end < 0:
			label.add_text(text.substr(at))
			return
		label.add_text(text.substr(at, start - at))
		var tex: Texture2D = texture(text.substr(start + 1, end - start - 1).to_upper(), px * 2)
		if tex:
			label.add_image(tex, px, px, Color.WHITE, INLINE_ALIGNMENT_CENTER)
		else:
			label.add_text(text.substr(start, end - start + 1))
		at = end + 1


static func _color(symbol: String) -> String:
	return Txt.of(COLORS.get(symbol, GENERIC))


## O desenho de um símbolo centrado em (x, y), na escala dada: o da cor, ou o número em traço (dois algarismos lado a lado).
static func _glyph(symbol: String, x: float, y: float, scale: float) -> String:
	var open: String = "<g transform='translate(%s %s) scale(%s) translate(-12 -12)'" % [x, y, scale]
	if GLYPHS.has(symbol):
		return "%s fill='%s'>%s</g>" % [open, INK, GLYPHS[symbol]]
	var stroke: String = " fill='none' stroke='%s' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>" % INK
	if STROKES.has(symbol):
		return open + stroke + Txt.of(STROKES[symbol]) + "</g>"
	if symbol.is_valid_int() and symbol.length() == 2:
		var pair: String = ""
		for i: int in 2:
			pair += "<g transform='translate(%s 12) scale(.62) translate(-12 -12)'>%s</g>" % [8.0 + i * 8.0, STROKES[symbol[i]]]
		return open + stroke + pair + "</g>"
	return open + stroke + "<path d='M9 9a3 3 0 1 1 3 3v2M12 17.5v.5'/></g>"
