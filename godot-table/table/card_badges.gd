# Desenha os selos de uma permanente (BadgeSpec) nos cantos da carta: pequenos, sempre de frente para a câmera e por cima da arte.
# Também monta o selo de custo da carta da mão (deitado na carta, que já está de frente para a câmera).
class_name CardBadges
extends Node3D

## Mundo por pixel dos selos (o selo comum tem CHIP_H pixels: ~11% da altura da carta).
const PX := 0.0024
const CHIP_H := 62
const KEYWORD_H := 52
const PT_H := 72
const GAP := 6
const MARGIN := 0.045
## Altura dos selos sobre a carta: o selo fica de frente para a câmera, e a parte de baixo dele desce em direção à carta;
## alto assim, o selo do alto da carta não entra nela.
const LIFT := 0.12
## Quanto a âncora vem para a frente para, vista da câmera (inclinada ~56°), cair no mesmo ponto da carta que sem a altura.
const LIFT_SHIFT := LIFT * 0.67
const PRIORITY_BG := 10
const PRIORITY_TEXT := 12

static var _font: SystemFont

var _key: String = ""
var _boost: float = 1.0
var _dim: float = 0.0
var _aim_tween: Tween


## Mostra os selos de `spec` numa carta de `size` (virada: deitada de lado). Só refaz quando algo muda.
func show_spec(spec: Dictionary, size: Vector2, tapped: bool, boost: float = 1.0) -> void:
	var key: String = var_to_str(spec) + ("T" if tapped else "") + str(size) + str(snappedf(boost, 0.01))
	if key == _key:
		return
	_key = key
	clear()
	_boost = boost
	if spec.is_empty():
		return
	# A metade da carta na tela (virada, largura e altura trocam), e os cantos onde cada grupo de selos se ancora.
	var half := Vector2(size.y, size.x) / 2.0 if tapped else size / 2.0
	var top_left: Node3D = _region(Vector2(-half.x + MARGIN, -half.y + MARGIN), tapped)
	var top_mid: Node3D = _region(Vector2(0, -half.y + MARGIN * 0.6), tapped)
	var top_right: Node3D = _region(Vector2(half.x - MARGIN, -half.y + MARGIN), tapped)
	var bottom_left: Node3D = _region(Vector2(-half.x + MARGIN, half.y - MARGIN), tapped)
	var bottom_right: Node3D = _region(Vector2(half.x - MARGIN, half.y - MARGIN), tapped)
	# Colunas dos cantos de cima: comandante, cópia e ficha à esquerda; cópias, anexos e exiladas à direita.
	_stack_column(top_left, spec.get("corner", []), 1.0)
	_stack_column(top_right, spec.get("top_right", []), -1.0)
	var tag: Dictionary = spec.get("tag", {})
	if not tag.is_empty():
		if bool(tag.get("bare", false)):
			_icon_sprite(top_mid, Txt.of(tag["icon"]), tag["fg"], 104, Vector2(0, -46))
		else:
			_chip(top_mid, tag, CHIP_H, Vector2(0, -CHIP_H / 2.0), 0.0)
	# P/T (ou lealdade, ou nível) embaixo à direita; as palavras-chave em fileiras acima dele; os marcadores embaixo à esquerda.
	var pt_h: float = _pt(bottom_right, spec.get("pt", {}))
	_row(bottom_left, spec.get("counters", []), CHIP_H, 1.0, 0.0, size.x / PX / boost * (0.62 if not tapped else 0.9))
	_row(bottom_right, spec.get("keywords", []), KEYWORD_H, -1.0, pt_h + (GAP if pt_h > 0 else 0), size.x / PX / boost * 0.55)
	var aim: String = Txt.of(spec.get("aim", ""))
	if aim != "":
		_aim(BadgeSpec.MINE if aim == "mine" else BadgeSpec.THEIRS, size)


## Esmaece os selos junto com a carta (a que não pode ser escolhida no prompt atual).
func set_dim(amount: float) -> void:
	if is_equal_approx(amount, _dim):
		return
	_dim = amount
	for node: Node in find_children("*", "GeometryInstance3D", true, false):
		(node as GeometryInstance3D).transparency = _dim * 0.7


func clear() -> void:
	if _aim_tween:
		_aim_tween.kill()
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()


## Um ponto de ancoragem na tela da carta (x para a direita, y para baixo, em unidades da mesa), levado para a carta.
func _region(screen: Vector2, tapped: bool) -> Node3D:
	var node := Node3D.new()
	screen.y += LIFT_SHIFT
	# Virada (−90° em Y), o "direita" da tela é o +Z da carta e o "baixo" da tela é o −X dela.
	node.position = Vector3(screen.y, LIFT, -screen.x) if tapped else Vector3(screen.x, LIFT, screen.y)
	node.scale = Vector3.ONE * _boost
	add_child(node)
	return node


## Selos empilhados numa coluna, descendo a partir da âncora; `side` 1 alinha à esquerda, −1 à direita.
func _stack_column(region: Node3D, chips: Array, side: float) -> void:
	var y: float = 0.0
	for raw: Variant in chips:
		var chip: Dictionary = raw
		var h: int = CHIP_H if chip.has("icon") else 46
		_chip(region, chip, h, Vector2(0, -y - h / 2.0), side)
		y += h + GAP


## Fileira de selos a partir da âncora (para a direita com `side` 1, para a esquerda com −1), subindo uma linha quando passa de `max_w`.
func _row(region: Node3D, chips: Array, h: int, side: float, base_y: float, max_w: float) -> void:
	var x: float = 0.0
	var y: float = base_y
	for raw: Variant in chips:
		var w: float = _chip_width(raw, h)
		if x > 0.0 and x + w > max_w:
			x = 0.0
			y += h + GAP
		_chip(region, raw, h, Vector2(side * x, y + h / 2.0), side)
		x += w + GAP


## Largura de um selo em pixels: ícone (quadrado) e texto, com folga nas pontas.
func _chip_width(chip: Dictionary, h: int) -> float:
	var text: String = Txt.of(chip.get("text", ""))
	if text == "":
		return float(h)
	var pad: float = h * 0.3
	var icon_w: float = h * 0.62 + 3.0 if chip.has("icon") else 0.0
	return ceilf(pad * 2.0 + icon_w + _text_width(text, _font_size(h)))


## Desenha um selo com o centro em `at` deslocado conforme o alinhamento (`side` 1: `at.x` é a borda esquerda; −1: a direita; 0: o centro).
func _chip(region: Node3D, chip: Dictionary, h: int, at: Vector2, side: float) -> float:
	var w: float = _chip_width(chip, h)
	var center := Vector2(at.x + side * w / 2.0, at.y)
	var text: String = Txt.of(chip.get("text", ""))
	var bg: Color = chip.get("bg", BadgeSpec.DARK)
	var border: Color = chip.get("border", bg.darkened(0.45) if bg.a > 0.95 else Color(1, 1, 1, 0.14))
	var icon_key: String = Txt.of(chip.get("icon", ""))
	var radius: float = -1.0 if text != "" or icon_key == "" else h * 0.28
	var tex: Texture2D = CardIcons.chip_texture(int(w), h, bg, border, icon_key if text != "" else "", chip.get("fg", Color.WHITE), radius)
	_sprite(region, tex, center, PRIORITY_BG)
	if text == "":
		if icon_key != "":
			_icon_sprite(region, icon_key, chip.get("fg", Color.WHITE), int(h * 0.68), center)
		return w
	var pad: float = h * 0.3
	var icon_w: float = h * 0.62 + 3.0 if icon_key != "" else 0.0
	var tw: float = _text_width(text, _font_size(h))
	_label(region, text, chip.get("fg", Color.WHITE), _font_size(h), Vector2(center.x - w / 2.0 + pad + icon_w + tw / 2.0, center.y))
	return w


## P/T (base x atual, dano em vermelho), lealdade ou nível de Classe; volta a altura usada (0 sem nenhum).
func _pt(region: Node3D, pt: Dictionary) -> float:
	if pt.is_empty():
		return 0.0
	var size: int = int(PT_H * 0.72)
	var parts: Array = []
	var bg: Color = BadgeSpec.PAPER
	var border: Color = Color(0, 0, 0, 0.55)
	match Txt.of(pt.get("kind", "")):
		"pt":
			parts = [[str(pt["power"]), pt["pcolor"]], ["/", BadgeSpec.PAPER_INK], [str(pt["toughness"]), pt["tcolor"]]]
		"loyalty":
			parts = [[str(pt["value"]), BadgeSpec.PAPER]]
			bg = BadgeSpec.PAPER_INK
			border = BadgeSpec.PAPER
		"level":
			parts = [["Nv " + str(pt["value"]) + ("/%d" % int(pt["max"]) if int(pt.get("max", 0)) > 0 else ""), BadgeSpec.PAPER]]
			bg = BadgeSpec.PAPER_INK
			border = BadgeSpec.GOLD
	var widths: Array[float] = []
	var total: float = 0.0
	for part: Array in parts:
		var tw: float = _text_width(Txt.of(part[0]), size)
		widths.append(tw)
		total += tw
	var w: float = ceilf(total + PT_H * 0.42)
	_sprite(region, CardIcons.chip_texture(int(w), PT_H, bg, border, "", Color.WHITE, PT_H * 0.2), Vector2(-w / 2.0, PT_H / 2.0), PRIORITY_BG)
	var x: float = -w + PT_H * 0.21
	for i: int in parts.size():
		var part: Array = parts[i]
		_label(region, Txt.of(part[0]), part[1], size, Vector2(x + widths[i] / 2.0, PT_H / 2.0 + 1.0))
		x += widths[i]
	return float(PT_H)


## A mira deitada no meio da carta, pulsando de leve.
func _aim(color: Color, size: Vector2) -> void:
	var sprite := Sprite3D.new()
	sprite.texture = CardIcons.icon("aim", color.lightened(0.15), 256)
	sprite.pixel_size = size.x * 0.62 / 256.0
	sprite.rotation_degrees = Vector3(-90, 0, 0)
	sprite.position = Vector3(0, 0.006, -size.y * 0.06)
	sprite.shaded = false
	sprite.modulate = Color(1.2, 1.2, 1.2, 0.95)
	sprite.render_priority = PRIORITY_BG
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	add_child(sprite)
	_aim_tween = sprite.create_tween().set_loops()
	_aim_tween.tween_property(sprite, "scale", Vector3.ONE * 1.12, 0.6).set_trans(Tween.TRANS_SINE)
	_aim_tween.tween_property(sprite, "scale", Vector3.ONE * 0.94, 0.6).set_trans(Tween.TRANS_SINE)


func _icon_sprite(region: Node3D, key: String, color: Color, px: int, at: Vector2) -> void:
	_sprite(region, CardIcons.icon(key, color, px * 2), at, PRIORITY_TEXT, 0.5)


func _sprite(region: Node3D, tex: Texture2D, at: Vector2, priority: int, scale: float = 1.0) -> void:
	var sprite := Sprite3D.new()
	sprite.texture = tex
	sprite.pixel_size = PX * scale
	sprite.offset = at / scale
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.shaded = false
	sprite.double_sided = true
	sprite.render_priority = priority
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sprite.transparency = _dim * 0.7
	region.add_child(sprite)


func _label(region: Node3D, text: String, color: Color, size: int, at: Vector2) -> void:
	var label := Label3D.new()
	label.text = text
	label.font = font()
	label.font_size = size
	label.outline_size = 0
	label.modulate = color
	label.pixel_size = PX
	label.offset = at
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.double_sided = true
	label.render_priority = PRIORITY_TEXT
	label.outline_render_priority = PRIORITY_TEXT - 1
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	label.transparency = _dim * 0.7
	region.add_child(label)


static func _font_size(h: int) -> int:
	return int(h * 0.68)


static func _text_width(text: String, size: int) -> float:
	return font().get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


## A fonte dos selos (a do sistema, em negrito).
static func font() -> SystemFont:
	if _font == null:
		_font = SystemFont.new()
		_font.font_names = PackedStringArray(["Segoe UI", "Arial", "Helvetica", "sans-serif"])
		_font.font_weight = 700
	return _font


## O selo de custo da carta da mão: os símbolos de mana numa pílula escura, saindo pela borda de cima, à esquerda.
## Jogável, a borda acende em azul; mais barato que o impresso, verde; mais caro, vermelho.
static func cost_chip(cost: String, playable: bool, delta: int, card_size: Vector2) -> Node3D:
	var root := Node3D.new()
	var symbols: PackedStringArray = CardIcons.mana_symbols(cost)
	if symbols.is_empty():
		symbols = PackedStringArray(["0"])
	var pip: float = card_size.x * 0.115
	var gap: float = pip * 0.12
	var pad: float = pip * 0.28
	var w: float = pad * 2.0 + symbols.size() * pip + (symbols.size() - 1) * gap
	var h: float = pip + pad * 1.4
	var px_per: float = 160.0 / h
	var border: Color = Color("#5fd38a") if delta < 0 else (Color("#ff8f78") if delta > 0 else (BadgeSpec.MINE if playable else Color(BadgeSpec.GOLD, 0.55)))
	var bg := Sprite3D.new()
	bg.texture = CardIcons.chip_texture(int(w * px_per), 160, Color(0.03, 0.047, 0.094, 0.9), border)
	bg.pixel_size = 1.0 / px_per
	_lay_flat(bg, Vector3(0, 0.0, 0), PRIORITY_BG)
	root.add_child(bg)
	for i: int in symbols.size():
		var symbol: String = symbols[i]
		var x: float = -w / 2.0 + pad + pip / 2.0 + i * (pip + gap)
		var disc := Sprite3D.new()
		disc.texture = CardIcons.mana_texture(symbol, 96)
		disc.pixel_size = pip / 96.0
		_lay_flat(disc, Vector3(x, 0.002, 0), PRIORITY_BG + 1)
		root.add_child(disc)
		if CardIcons.mana_needs_text(symbol):
			var label := Label3D.new()
			label.text = symbol.replace("/", "")
			label.font = font()
			label.font_size = 64
			label.pixel_size = pip * 0.7 / 64.0 / maxf(1.0, label.text.length() * 0.7)
			label.modulate = Color.WHITE if symbol.contains("/") else Color("#1d1b16")
			label.outline_size = 0
			_lay_flat(label, Vector3(x, 0.004, 0), PRIORITY_TEXT)
			root.add_child(label)
	root.position = Vector3(-card_size.x / 2.0 + card_size.x * 0.05 + w / 2.0, 0.006, -card_size.y / 2.0 + h * 0.1)
	root.set_meta("lit", playable)
	if not playable:
		for child: Node in root.get_children():
			(child as GeometryInstance3D).set("modulate", Color(0.75, 0.75, 0.75, 0.85))
	return root


static func _lay_flat(node: GeometryInstance3D, pos: Vector3, priority: int) -> void:
	node.rotation_degrees = Vector3(-90, 0, 0)
	node.position = pos
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if node is SpriteBase3D:
		(node as SpriteBase3D).shaded = false
		(node as SpriteBase3D).render_priority = priority
		(node as SpriteBase3D).texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	elif node is Label3D:
		(node as Label3D).render_priority = priority
		(node as Label3D).outline_render_priority = priority - 1
