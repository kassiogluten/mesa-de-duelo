# Ícones do HUD da partida: os mesmos traços SVG da mesa do navegador, desenhados em branco (a cor vem do modulate).
class_name HudIcons
extends RefCounted

const MENU := "<path d=\"M4 7h16M4 12h16M4 17h16\"/>"
const HISTORY := "<path d=\"M3 12a9 9 0 1 0 3-6.7L3 8\"/><path d=\"M3 3v5h5M12 7v5l3 2\"/>"
const CLOCK := "<circle cx=\"12\" cy=\"13\" r=\"7\"/><path d=\"M12 9.5V13l2.5 1.5M10 3h4\"/>"
const HOURGLASS := "<path d=\"M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9\"/>"
const SUN := "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>"
const MOON := "<path d=\"M17 15.5A7 7 0 0 1 8.5 7a7 7 0 1 0 8.5 8.5z\"/><path d=\"M17.5 3.5v3M16 5h3M21 9v2M20 10h2\"/>"
const GEAR := "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>"
const FLAG := "<path d=\"M5 21V4M5 4h11l-2 4 2 4H5\"/>"
const HOME := "<path d=\"m3 11 9-7 9 7M5 10v10h14V10\"/>"
## Atalhos de teclado: um teclado.
const KEYBOARD := "<rect x=\"2.5\" y=\"6\" width=\"19\" height=\"12\" rx=\"2\"/><path d=\"M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6.5 14h11\"/>"
## Relatar um problema: balão com exclamação.
const REPORT := "<path d=\"M4 5h16v11H10l-4 4v-4H4z\"/><path d=\"M12 8v3.5M12 13.6v.01\"/>"
const CLOSE := "<path d=\"m6 6 12 12M18 6 6 18\"/>"
const REPLAY := "<path d=\"M8 5v14l11-7z\"/>"

static var _cache: Dictionary = {}


## O ícone em `size` px (branco, com traço como na mesa do navegador); a cor vem do modulate de quem o usa.
static func texture(body: String, size: int = 20, stroke: float = 1.8) -> Texture2D:
	var key: String = "%s|%d|%s" % [body, size, stroke]
	if _cache.has(key):
		return _cache[key]
	var svg: String = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"%s\" stroke-linecap=\"round\" stroke-linejoin=\"round\">%s</svg>" % [stroke, body]
	var image := Image.new()
	var err: Error = image.load_svg_from_string(svg, float(size) / 24.0)
	var tex: Texture2D = ImageTexture.create_from_image(image) if err == OK else PlaceholderTexture2D.new()
	_cache[key] = tex
	return tex


## Um TextureRect com o ícone, centrado e sem pegar o mouse.
static func rect(body: String, size: int, color: Color = Color.WHITE) -> TextureRect:
	var r := TextureRect.new()
	r.texture = texture(body, size * 2)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(size, size)
	r.modulate = color
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r
