# Ícones da carta no campo (os mesmos SVG de src/ui/icons.ts e os símbolos de mana de src/ui/cardtext.ts), rasterizados em textura e guardados.
class_name CardIcons
extends RefCounted

## Corpo de cada ícone (dentro de um <svg viewBox="0 0 24 24">); "currentColor" vira a cor pedida.
const ICONS := {
	"sword": '<path d="M14.5 3H21v6.5L10 20.5l-2 .5-.5-2L18.5 8V5.5H16L5 16.5 3.5 15z" fill="currentColor"/>',
	"shield": '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/>',
	"crown": '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" fill="currentColor"/>',
	"clip": '<path d="M16.5 6.5 8.4 14.6a1.6 1.6 0 0 0 2.3 2.3l8.4-8.4a3.4 3.4 0 0 0-4.8-4.8L5.6 12.4a5.2 5.2 0 0 0 7.4 7.4l7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
	"exile": '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m6.5 17.5 11-11" stroke="currentColor" stroke-width="2.4"/>',
	"layers": '<path d="M12 2 2 7l10 5 10-5z" fill="currentColor"/><path d="m2 12 2.4-1.2L12 14.6l7.6-3.8L22 12l-10 5z" fill="currentColor"/><path d="m2 17 2.4-1.2L12 19.6l7.6-3.8L22 17l-10 5z" fill="currentColor"/>',
	"disc": '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" fill="currentColor" fill-rule="evenodd"/>',
	"untap": '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
	# Enjoo de invocação: as três estrelinhas em volta (sem girar).
	"dizzy": '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="2 2.4"/>'
		+ '<path transform="translate(12 5) scale(1.15)" d="M0-4.2 1.1-1.1 4.2 0 1.1 1.1 0 4.2-1.1 1.1-4.2 0-1.1-1.1z" fill="#ffd66b"/>'
		+ '<path transform="translate(18.06 15.5) scale(.85)" d="M0-4.2 1.1-1.1 4.2 0 1.1 1.1 0 4.2-1.1 1.1-4.2 0-1.1-1.1z" fill="#ffd66b"/>'
		+ '<path transform="translate(5.94 15.5) scale(.7)" d="M0-4.2 1.1-1.1 4.2 0 1.1 1.1 0 4.2-1.1 1.1-4.2 0-1.1-1.1z" fill="#ffd66b"/>',
	# Mira de quem é alvo de algo na pilha: aro e cruz.
	"aim": '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'
		+ '<path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
	# Marcadores.
	"P1P1": '<path d="M12 3 3 13h5v8h8v-8h5z" fill="currentColor"/>',
	"M1M1": '<path d="M12 21 3 11h5V3h8v8h5z" fill="currentColor"/>',
	"STUN": '<path d="M10.5 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	"CHARGE": '<path d="M2 7h16v10H2zm2 2v6h12V9z" fill="currentColor" fill-rule="evenodd"/><path d="M19 10h2.5v4H19zM5.5 10.5H8v3H5.5zm3.75 0h2.5v3h-2.5zm3.75 0h2.5v3H13z" fill="currentColor"/>',
	"LORE": '<path d="M4 4h7a3 3 0 0 1 1 .2V20a3 3 0 0 0-1-.2H4zm16 0h-7a3 3 0 0 0-1 .2V20a3 3 0 0 1 1-.2h7z" fill="currentColor"/>',
	"TIME": '<path d="M6 2h12v5l-4 5 4 5v5H6v-5l4-5-4-5zm2 2v2.3l4 5 4-5V4z" fill="currentColor" fill-rule="evenodd"/>',
	"OIL": '<path d="M12 2c3 4.5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7.5 6-12z" fill="currentColor"/>',
	# Palavras-chave.
	"FLYING": '<g fill="currentColor" fill-rule="evenodd"><path d="M2.5 21C3 13 8.5 5 21.5 2.5 20.5 6 17.5 8 13 9 9 10 5.5 14 2.5 21z"/><path d="M5.6 19.4C8 14.5 11 11.3 15 10.6c2-.3 4-.8 5.6-1.8-1.4 3-4.1 4.5-7.6 4.9-2.5.3-5 2-7.4 5.7z"/><path d="M8 20c2-2.6 4-4 6.5-4.4 1.5-.2 2.8-.4 4-.8-1.8 3-5.5 5-10.5 5.2z"/></g>',
	"REACH": '<g transform="rotate(45 12 12) translate(.96 .96) scale(.92)"><path d="M2.5 15Q12 2.5 21.5 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M2.5 15 12 19.2 21.5 15" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 20.5V6" stroke="currentColor" stroke-width="1.9"/><path d="M12 1 16 7.5H8zm0 18.8L9 23h2l1-1.4 1 1.4h2z" fill="currentColor"/></g>',
	"TRAMPLE": '<path d="M12 23c-3.8 0-6-2.6-5.4-6.2L3.2 9.5 3 4.2l3.6 4.4 2.6 5 1.3-.9.3-7.3L12 1l1.2 4.4.3 7.3 1.3.9 2.6-5L21 4.2l-.2 5.3-3.4 7.3c.6 3.6-1.6 6.2-5.4 6.2z" fill="currentColor"/>',
	"MENACE": '<path d="M12 22.5 5.2 15 1.5 12.2l3.8-1.6L3 2.5l6.2 3.6L12 1.5l2.8 4.6L21 2.5l-2.3 8.1 3.8 1.6-3.7 2.8zM6.8 10.6l4.4 2.2-.9 2c-2-.2-3.2-1.9-3.5-4.2zm10.4 0-4.4 2.2.9 2c2-.2 3.2-1.9 3.5-4.2z" fill="currentColor" fill-rule="evenodd"/>',
	"FIRST_STRIKE": '<path d="M21 3l-.9 4.6-8.6 8.6-3.7-3.7 8.6-8.6zM5.2 12.2l1.3-1.3 6.6 6.6-1.3 1.3zM7.6 16.4l-1.3-1.3-3 3 1.3 1.3zM3.2 19a1.3 1.3 0 1 0 1.8 1.8 1.3 1.3 0 0 0-1.8-1.8z" fill="currentColor" fill-rule="evenodd"/><path d="M21.5 9.5c.2 6.3-4 11.6-10.5 13 4.5-3 8-7.5 10.5-13z" fill="currentColor"/>',
	"DOUBLE_STRIKE": '<g fill="currentColor" fill-rule="evenodd"><path transform="translate(-1.6 1.4) scale(.78)" d="M21 3l-.9 4.6-8.6 8.6-3.7-3.7 8.6-8.6zM5.2 12.2l1.3-1.3 6.6 6.6-1.3 1.3zM7.6 16.4l-1.3-1.3-3 3 1.3 1.3zM3.2 19a1.3 1.3 0 1 0 1.8 1.8 1.3 1.3 0 0 0-1.8-1.8z"/><path transform="translate(3.4 2.4) scale(.78)" d="M21 3l-.9 4.6-8.6 8.6-3.7-3.7 8.6-8.6zM5.2 12.2l1.3-1.3 6.6 6.6-1.3 1.3zM7.6 16.4l-1.3-1.3-3 3 1.3 1.3zM3.2 19a1.3 1.3 0 1 0 1.8 1.8 1.3 1.3 0 0 0-1.8-1.8z"/></g><path d="M21.5 9.5c.2 6.3-4 11.6-10.5 13 4.5-3 8-7.5 10.5-13z" fill="currentColor"/>',
	"DEATHTOUCH": '<path d="M12 1.5c-5.2 0-9 3.6-9 8.6 0 3 1.4 5.3 3.6 6.5l.4 2.9 1.9-1.2.9 3 1.6-2 1.6 2 .9-3 1.9 1.2.4-2.9c2.2-1.2 3.6-3.5 3.6-6.5 0-5-3.8-8.6-9-8.6zM5.8 9.4l5.2 2-1 3c-2.6 0-4.3-2.1-4.2-5zm12.4 0-5.2 2 1 3c2.6 0 4.3-2.1 4.2-5zM12 14.6l1.3 2.6h-2.6z" fill="currentColor" fill-rule="evenodd"/>',
	"LIFELINK": '<path d="M12 21 3.5 12.5A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.5z" fill="currentColor"/>',
	"VIGILANCE": '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" fill="currentColor" fill-rule="evenodd"/>',
	"HASTE": '<path transform="translate(1.5 0) scale(.94)" d="M5.5 2h8.5v2.5h-.5v6.7c3.3 1 6 2.4 7.1 3.6.6.7.9 1.5.9 2.4V19H6.5V4.5h-1zM5.5 20h16.5v2H5.5z" fill="currentColor"/><path d="M1 8h5.5v2H1zm1 4h4.5v2H2zm1 4h3.5v2H3z" fill="currentColor"/>',
	"DEFENDER": '<path d="M2 5h9v4H2zm11 0h9v4h-9zM2 11h5v4H2zm7 0h6v4H9zm8 0h5v4h-5zM2 17h9v4H2zm11 0h9v4h-9z" fill="currentColor"/>',
	"HEXPROOF": '<g fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12" cy="12" r="7" stroke-width="1.2" stroke-dasharray="9.5 1.5"/><path d="M7.3 9.2h9.4L12 17.2z" stroke-width="1.9" stroke-linejoin="round"/></g>',
	"SHROUD": '<path d="M12 2a9 9 0 0 0-9 9v11l3-2 3 2 3-2 3 2 3-2 3 2V11a9 9 0 0 0-9-9z" fill="currentColor"/>',
	"WARD": '<g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12.0" cy="8.6" r="4.6"/><circle cx="14.9" cy="13.7" r="4.6"/><circle cx="9.1" cy="13.7" r="4.6"/></g>',
	"INDESTRUCTIBLE": '<path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor"/>',
	"PROTECTION": '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 2.2 6 2.2V11c0 4-2.6 7.6-6 8.9-3.4-1.3-6-4.9-6-8.9V6.4z" fill="currentColor" fill-rule="evenodd"/>',
	"INTIMIDATE": '<g fill="currentColor" fill-rule="evenodd"><path d="M2 5.5l8.5 3.6-.7 1.7L1.3 7.2zM22 5.5l-8.5 3.6.7 1.7 8.5-3.6z"/><path d="M2.5 12.5c2.6-1 5.6-.6 8 1.3-1 2.4-3 3.4-5 3.1-1.6-.3-2.6-2-3-4.4zm19 0c-2.6-1-5.6-.6-8 1.3 1 2.4 3 3.4 5 3.1 1.6-.3 2.6-2 3-4.4z"/></g>',
	"FEAR": '<path d="M12 1.5c-4.7 0-7.5 4-7.5 9.5 0 6.3 3.4 11.5 7.5 11.5s7.5-5.2 7.5-11.5c0-5.5-2.8-9.5-7.5-9.5zM7.3 9.6a1.9 2.4 0 1 0 3.8 0 1.9 2.4 0 1 0-3.8 0zm5.6 0a1.9 2.4 0 1 0 3.8 0 1.9 2.4 0 1 0-3.8 0zm-2.8 7.3a1.9 3.3 0 1 0 3.8 0 1.9 3.3 0 1 0-3.8 0z" fill="currentColor" fill-rule="evenodd"/>',
	"SHADOW": '<path d="M14.5 3.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM8 22c0-5.5 2.9-9 6.5-9s6.5 3.5 6.5 9z" fill="currentColor" opacity=".4"/><path d="M9.5 2a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM3 21c0-5.5 2.9-9 6.5-9s6.5 3.5 6.5 9z" fill="currentColor"/>',
	"SKULK": '<g fill="currentColor" fill-rule="evenodd"><path d="M6.2 13c1.8-.3 3.4 1 3.5 3.6.1 2.6-.9 5-2.8 5.2-2 .2-3-1.8-2.9-4.3.1-2.4.6-4.2 2.2-4.5zM4.6 10.6a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm2.5-.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm2.2.9a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0z"/><path d="M16.2 5c1.8-.3 3.4 1 3.5 3.6.1 2.6-.9 5-2.8 5.2-2 .2-3-1.8-2.9-4.3.1-2.4.6-4.2 2.2-4.5zM14.6 2.6a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm2.5-.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm2.2.9a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0z"/></g>',
	"HORSEMANSHIP": '<path d="M6.5 22.5h12l-.7-3.5c-.4-2 .2-3.8 1.3-5.3l.9-1.3c.9-1.4.7-3.2-.5-4.3L16.5 5.5 17 1.5l-3.2 2.6C9.8 3.8 6.8 6.6 5.6 10.4L4.1 15c-.4 1.2.5 2.3 1.7 2.3.7 0 1.2-.3 1.6-.9l2-2.8c.6 2.6-.2 4.9-1.7 6.8zM12.4 7.6a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0z" fill="currentColor" fill-rule="evenodd"/>',
	"LANDWALK": '<g fill="currentColor" fill-rule="evenodd"><path d="M1 22l6.5-9.5 4 5.5 3.5-4.5L23 22z"/><path d="M2 5h13.5V1.5l6 5-6 5V8H2z"/></g>',
}

## Símbolos de mana (src/ui/cardtext.ts): o desenho de cada cor e a cor do disco.
const MANA_GLYPHS := {
	"W": '<circle cx="12" cy="12" r="4"/><path d="M11 0h2v5h-2zm0 19h2v5h-2zM0 11h5v2H0zm19 0h5v2h-5zM3 2l4 4-1 2-4-4zm14 15 5 4-2 2-4-5zM2 20l4-4 2 1-4 5zM17 7l-1-1 4-4 2 2z"/>',
	"U": '<path d="M12 1C9 7 4 11 4 16a8 8 0 0 0 16 0c0-5-5-9-8-15zm4 17c-2 3-5 2-5 2 5-2 4-6 5-6 1 0 1 2 0 4z"/>',
	"B": '<path d="M12 2a9 9 0 0 0-9 9c0 4 2 6 5 7v4h8v-4c3-1 5-3 5-7a9 9 0 0 0-9-9zM6 10h4v4H6zm8 0h4v4h-4zm-4 6 2-3 2 3z"/>',
	"R": '<path d="M14 1c2 7-5 7-3 12 3-1 5-3 6-6 2 3 5 7 3 11a9 9 0 0 1-16-1c-2-5 3-8 5-10-1 5 1 4 2 2 1-2 2-5 3-8z"/>',
	"G": '<path d="M12 1 5 8h3l-6 7h8v5H6v3h12v-3h-4v-5h8l-6-7h3z"/>',
	"C": '<path d="m12 1 11 11-11 11L1 12zm0 5-6 6 6 6 6-6z"/>',
}
const MANA_COLORS := {"W": "#f7f0d2", "U": "#2f80d6", "B": "#6a5c6b", "R": "#e3593a", "G": "#3d9b54", "C": "#b7b4ad"}
const GENERIC_COLOR := "#cbc5b8"

static var _cache: Dictionary = {}


## O ícone na cor dada, quadrado de `px` pixels.
static func icon(key: String, color: Color, px: int = 64) -> Texture2D:
	var body: String = ICONS.get(key, ICONS["disc"])
	return svg_texture("icon:%s:%s:%d" % [key, color.to_html(), px], '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 24 24">%s</svg>' % [px, px, body.replace("currentColor", "#" + color.to_html(false))])


static func has_icon(key: String) -> bool:
	return ICONS.has(key)


## Selo: pílula (ou retângulo de cantos `radius`) com fundo, borda e, à esquerda, um ícone. Medidas em pixels.
static func chip_texture(width: int, height: int, bg: Color, border: Color, icon_key: String = "", icon_color: Color = Color.WHITE, radius: float = -1.0) -> Texture2D:
	var r: float = height / 2.0 if radius < 0.0 else radius
	var key: String = "chip:%d:%d:%s:%s:%s:%s:%.1f" % [width, height, bg.to_html(), border.to_html(), icon_key, icon_color.to_html(), r]
	if _cache.has(key):
		return _cache[key]
	var stroke: float = maxf(2.0, height * 0.06)
	var inset: float = stroke / 2.0 + 1.0
	var body: String = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#%s" fill-opacity="%.3f" stroke="#%s" stroke-opacity="%.3f" stroke-width="%.1f"/>' % [
		inset, inset, width - inset * 2.0, height - inset * 2.0, maxf(r - inset, 0.0), bg.to_html(false), bg.a, border.to_html(false), border.a, stroke]
	# Brilho de cima: o selo parece uma peça com volume, não um adesivo chapado.
	body += '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
	body += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="url(#g)"/>' % [inset, inset, width - inset * 2.0, height - inset * 2.0, maxf(r - inset, 0.0)]
	if icon_key != "":
		var size: float = height * 0.62
		var pad: float = (height - size) / 2.0
		var scale: float = size / 24.0
		var icon_body: String = (ICONS.get(icon_key, ICONS["disc"]) as String).replace("currentColor", "#" + icon_color.to_html(false))
		body += '<g transform="translate(%.2f %.2f) scale(%.4f)">%s</g>' % [pad + (r * 0.25 if r >= height / 2.0 - 0.1 else 0.0), pad, scale, icon_body]
	return svg_texture(key, '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">%s</svg>' % [width, height, body])


## Um símbolo de mana ("G", "2", "W/U") num disco de `px` pixels; os números e os híbridos vêm sem desenho (o texto vai por cima).
static func mana_texture(symbol: String, px: int = 64) -> Texture2D:
	var parts: PackedStringArray = symbol.split("/")
	var a: String = parts[0]
	var b: String = parts[1] if parts.size() > 1 else ""
	var color_a: String = MANA_COLORS.get(a, GENERIC_COLOR)
	var color_b: String = MANA_COLORS.get(b, color_a)
	var body: String = '<defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset=".5" stop-color="%s"/><stop offset=".5" stop-color="%s"/></linearGradient></defs>' % [color_a, color_b]
	body += '<circle cx="12" cy="12" r="11.2" fill="url(#h)" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>'
	if b == "" and MANA_GLYPHS.has(a):
		var ink: String = "#1d1b16" if a == "W" or a == "C" else "#fff"
		body += '<g transform="translate(4.8 4.8) scale(.6)" fill="%s">%s</g>' % [ink, MANA_GLYPHS[a]]
	return svg_texture("mana:%s:%d" % [symbol, px], '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 24 24">%s</svg>' % [px, px, body])


## Se o símbolo de mana leva texto por cima do disco (números, X, híbridos, os que não têm desenho).
static func mana_needs_text(symbol: String) -> bool:
	return not MANA_GLYPHS.has(symbol)


## Os símbolos de um custo ("{2}{G}{G}" → ["2", "G", "G"]).
static func mana_symbols(cost: String) -> PackedStringArray:
	var out: PackedStringArray = []
	var at: int = cost.find("{")
	while at >= 0:
		var end: int = cost.find("}", at)
		if end < 0:
			break
		out.append(cost.substr(at + 1, end - at - 1))
		at = cost.find("{", end)
	return out


## Rasteriza (uma vez) um SVG em textura com mipmaps.
static func svg_texture(key: String, svg: String) -> Texture2D:
	if _cache.has(key):
		return _cache[key]
	var image := Image.new()
	if image.load_svg_from_string(svg, 1.0) != OK:
		push_warning("SVG inválido: %s" % key)
		image = Image.create(4, 4, false, Image.FORMAT_RGBA8)
	image.generate_mipmaps()
	var tex := ImageTexture.create_from_image(image)
	_cache[key] = tex
	return tex
