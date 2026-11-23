# Ícones do assento (marcadores, monarca, cemitério, exílio, símbolos de mana) desenhados de SVG, os mesmos da mesa do navegador, com cache por cor e tamanho.
class_name SeatIcons
extends RefCounted

## Caminhos (viewBox 24×24) de playerCounters.ts, playerStatus.ts, dungeon.ts e icons.ts.
const PATHS := {
	"poison": "M12 2.5c3.6 4.6 6 8.3 6 11.3a6 6 0 0 1-12 0c0-3 2.4-6.7 6-11.3z",
	"rad": "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10.3 8.9 7.2 3.5A9.5 9.5 0 0 0 2.5 11.8h6.2a3.4 3.4 0 0 1 1.6-2.9zm3.4 0a3.4 3.4 0 0 1 1.6 2.9h6.2a9.5 9.5 0 0 0-4.7-8.3zM12 15.4a3.4 3.4 0 0 1-1.7-.4l-3.1 5.4a9.5 9.5 0 0 0 9.6 0L13.7 15a3.4 3.4 0 0 1-1.7.4z",
	"energy": "M13 2 4 14h6l-1 8 9-12h-6z",
	"experience": "m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z",
	"ticket": "M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zm6 0v10h2V7z",
	"contract": "M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8.5 12h9v1.5h-9zm0 3.5h9V17h-9z",
	"disc": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
	"ring": "M12 4C7 4 3 7.6 3 12s4 8 9 8 9-3.6 9-8-4-8-9-8zm0 3c3.6 0 6 2.3 6 5s-2.4 5-6 5-6-2.3-6-5 2.4-5 6-5z",
	"monarch": "M2 8l5 4 5-7 5 7 5-4-2 11H4zm2 13h16v2H4z",
	"initiative": "M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6zm-1 5h2v6h-2zm0 8h2v2h-2z",
	"shield": "M12 2 4 5v6c0 5.3 3.4 9.7 8 11 4.6-1.3 8-5.7 8-11V5z",
	"land": "M2 20 9 7l4 7 2-3 7 9z",
	"blessing": "M3 21V10l3-3 3 3V6l3-4 3 4v4l3-3 3 3v11h-7v-5h-4v5z",
	"speed": "M12 4a10 10 0 0 0-10 10c0 2 .6 3.9 1.6 5.5h16.8A10 10 0 0 0 22 14 10 10 0 0 0 12 4zm5.2 4.4-4 6.3a1.8 1.8 0 1 1-2.4-1.9z",
	"spells": "M13 2 4 14h7l-1 8 9-12h-7z",
	"hourglass": "M6 2h12v2h-1v3l-4 5 4 5v3h1v2H6v-2h1v-3l4-5-4-5V4H6zm3 2v2.3l3 3.7 3-3.7V4zm3 9.9-3 3.8V20h6v-2.3z",
	"hand": "M4 5.5 11 4l2 13-7 1.5zM13.5 3.7l6.6 2.4-4.4 12.3-1.2-.4z",
	"command": "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm6 4.5-1.7 3.4-3.8.6 2.7 2.6-.6 3.8 3.4-1.8 3.4 1.8-.6-3.8 2.7-2.6-3.8-.6z",
	"sword": "M20.5 2.5 21.5 3.5 21 8 11.6 17.4 13 18.8 11.6 20.2 9.5 18.1 5.6 22 2 18.4 5.9 14.5 3.8 12.4 5.2 11 6.6 12.4 16 3z",
	"eye": "M12 5C5 5 2 12 2 12s3 7 10 7 10-7 10-7-3-7-10-7zm0 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
}
## Ícones de traço (cemitério e exílio, de icons.ts).
const STROKES := {
	"graveyard": "M6.5 21V10.5a5.5 5.5 0 0 1 11 0V21M4 21h16M12 9.5v6M9.5 12h5",
	"exile": "M12 3.5a8.5 8.5 0 1 0 8.5 8.5A6 6 0 1 0 14.5 18a3.6 3.6 0 1 0-3.5-4.5",
}
## Símbolos de mana (cardtext.ts): cor do disco e o desenho por cima.
const MANA_COLORS := {"W": "#f7f0d2", "U": "#67a5d7", "B": "#6a5c6b", "R": "#e87c61", "G": "#79af80", "C": "#b7b4ad"}
const MANA_GLYPHS := {
	"W": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M11 0h2v5h-2zm0 19h2v5h-2zM0 11h5v2H0zm19 0h5v2h-5zM3 2l4 4-1 2-4-4zm14 15 5 4-2 2-4-5zM2 20l4-4 2 1-4 5zM17 7l-1-1 4-4 2 2z\"/>",
	"U": "<path d=\"M12 1C9 7 4 11 4 16a8 8 0 0 0 16 0c0-5-5-9-8-15zm4 17c-2 3-5 2-5 2 5-2 4-6 5-6 1 0 1 2 0 4z\"/>",
	"B": "<path d=\"M12 2a9 9 0 0 0-9 9c0 4 2 6 5 7v4h8v-4c3-1 5-3 5-7a9 9 0 0 0-9-9zM6 10h4v4H6zm8 0h4v4h-4zm-4 6 2-3 2 3z\"/>",
	"R": "<path d=\"M14 1c2 7-5 7-3 12 3-1 5-3 6-6 2 3 5 7 3 11a9 9 0 0 1-16-1c-2-5 3-8 5-10-1 5 1 4 2 2 1-2 2-5 3-8z\"/>",
	"G": "<path d=\"M12 1 5 8h3l-6 7h8v5H6v3h12v-3h-4v-5h8l-6-7h3z\"/>",
	"C": "<path d=\"m12 1 11 11-11 11L1 12zm0 5-6 6 6 6 6-6z\"/>",
}

static var _cache: Dictionary = {}


## O ícone `name` na cor e no tamanho (px) pedidos; um disco para nomes desconhecidos.
static func icon(name: String, color: Color, size: int = 20) -> Texture2D:
	var key: String = "%s|%s|%d" % [name, color.to_html(), size]
	if _cache.has(key):
		return _cache[key]
	var hex: String = "#" + color.to_html(false)
	var body: String = ""
	if STROKES.has(name):
		body = "<path d=\"%s\" fill=\"none\" stroke=\"%s\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" % [STROKES[name], hex]
	else:
		body = "<path d=\"%s\" fill=\"%s\"/>" % [PATHS.get(name, PATHS["disc"]), hex]
	return _store(key, body, size)


## O símbolo de mana de uma cor (W, U, B, R, G, C): disco colorido com o desenho escuro, como na mesa do navegador.
static func mana(color: String, size: int = 26) -> Texture2D:
	var key: String = "mana|%s|%d" % [color, size]
	if _cache.has(key):
		return _cache[key]
	var fill: String = Txt.of(MANA_COLORS.get(color, "#cbc5b8"))
	var glyph: String = Txt.of(MANA_GLYPHS.get(color, ""))
	var body: String = "<circle cx=\"12\" cy=\"12\" r=\"11.5\" fill=\"%s\" stroke=\"#000\" stroke-opacity=\".45\" stroke-width=\"1\"/><g fill=\"%s\" transform=\"translate(5.4 5.4) scale(.55)\">%s</g>" % [fill, "#efe6f0" if color == "B" else "#1d1a17", glyph]
	return _store(key, body, size)


static func _store(key: String, body: String, size: int) -> Texture2D:
	var svg: String = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\">%s</svg>" % body
	var image := Image.new()
	if image.load_svg_from_string(svg, size / 24.0) != OK:
		return null
	var tex: Texture2D = ImageTexture.create_from_image(image)
	_cache[key] = tex
	return tex
