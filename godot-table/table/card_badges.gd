# Desenha os selos de uma permanente (BadgeSpec) nos cantos da carta: pequenos, sempre de frente para a câmera e por cima da arte.
# Os selos acompanham a carta girando (virar, transformar) e trocam o selo do alto por "Selecionada" na sua declaração.
# Também monta o selo de custo da carta da mão (deitado na carta, que já está de frente para a câmera).
class_name CardBadges
extends Node3D

## Mundo por pixel dos selos (o selo comum tem CHIP_H pixels: ~11% da altura da carta).
const PX := 0.0024
const CHIP_H := 62
const KEYWORD_H := 52
const PT_H := 72
## Selos redondos de canto (Portador do Anel, Game Changer): menores, como no navegador.
const ROUND_H := 50
const GAP := 6
const MARGIN := 0.045
## O selo do dano somado do monte de atacantes fica por fora da borda de baixo.
const BOTTOM_OUT := 0.03
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
## O pedido da última vez (para refazer quando a seleção local muda).
var _spec: Dictionary = {}
var _size := Vector2.ZERO
var _tapped: bool = false
## A carta está selecionada na sua declaração de ataque ou de bloqueio (o selo do alto vira "Selecionada").
var _selected: bool = false
## Cada canto: {node, up, tap}, com o lugar na carta de pé e na carta virada (no espaço da carta de pé).
var _regions: Array = []
## O giro da carta da última vez que os cantos foram postos (virada de 0 a 1, de lado de 0 a 1).
var _pose := Vector2(-1, -1)
## A chave do selo sendo desenhado ("tag", "pt", "counter:<nome>", "keyword:<ícone>", "corner:<ícone>", "top_right:<ícone>"):
## cada peça leva a dela em "badge", para os efeitos dos estados (fx/state_badges.gd) acharem o selo certo.
var _drawing: String = ""


## Mostra os selos de `spec` numa carta de `size` (virada: deitada de lado). Só refaz quando algo muda.
func show_spec(spec: Dictionary, size: Vector2, tapped: bool, boost: float = 1.0) -> void:
	var key: String = var_to_str(spec) + ("T" if tapped else "") + str(size) + str(snappedf(boost, 0.01))
	if key == _key:
		return
	_key = key
	_spec = spec
	_size = size
	_tapped = tapped
	_boost = boost
	if (spec.get("pending", {}) as Dictionary).is_empty():
		_selected = false
	_build()
	set_process(not spec.is_empty())


func _build() -> void:
	clear()
	var spec: Dictionary = _spec
	if spec.is_empty():
		return
	var size: Vector2 = _size
	var tapped: bool = _tapped
	# Os cantos onde cada grupo de selos se ancora, na carta de pé e na virada (largura e altura trocam na tela); enquanto
	# a carta gira, cada canto anda de um lugar para o outro junto com ela (_follow).
	var top_left: Node3D = _region(Vector2(-1, -1), Vector2(MARGIN, MARGIN))
	var top_mid: Node3D = _region(Vector2(0, -1), Vector2(0, MARGIN * 0.6))
	var top_right: Node3D = _region(Vector2(1, -1), Vector2(MARGIN, MARGIN))
	var bottom_left: Node3D = _region(Vector2(-1, 1), Vector2(MARGIN, MARGIN))
	var bottom_right: Node3D = _region(Vector2(1, 1), Vector2(MARGIN, MARGIN))
	# Colunas dos cantos de cima: comandante, cópia, mutada, ficha e preparada à esquerda; o Anel, a gema, cópias, anexos e
	# exiladas à direita.
	_stack_column(top_left, spec.get("corner", []), 1.0, "corner")
	_stack_column(top_right, spec.get("top_right", []), -1.0, "top_right")
	var tag: Dictionary = spec.get("tag", {})
	if _selected and not (spec.get("pending", {}) as Dictionary).is_empty():
		tag = spec["pending"]
	if not tag.is_empty():
		_drawing = "tag"
		if bool(tag.get("bare", false)):
			_icon_sprite(top_mid, Txt.of(tag["icon"]), tag["fg"], 104, Vector2(0, -46))
		else:
			var tag_h: int = KEYWORD_H if bool(tag.get("small", false)) else CHIP_H
			_chip(top_mid, tag, tag_h, Vector2(0, -tag_h / 2.0), 0.0)
	# P/T (ou lealdade, ou nível) embaixo à direita; as palavras-chave em fileiras acima dele; os marcadores embaixo à esquerda.
	_drawing = "pt"
	var pt_h: float = _pt(bottom_right, spec.get("pt", {}))
	_row(bottom_left, spec.get("counters", []), CHIP_H, 1.0, 0.0, size.x / PX / _boost * (0.62 if not tapped else 0.9), "counter")
	_row(bottom_right, spec.get("keywords", []), KEYWORD_H, -1.0, pt_h + (GAP if pt_h > 0 else 0), size.x / PX / _boost * 0.55, "keyword")
	# O dano somado do monte de atacantes, no meio da borda de baixo, por fora.
	var bottom: Array = spec.get("bottom_mid", [])
	if not bottom.is_empty():
		var bottom_mid: Node3D = _region(Vector2(0, 1), Vector2(0, -BOTTOM_OUT))
		_drawing = "bottom_mid"
		_chip(bottom_mid, bottom[0], CHIP_H, Vector2(0, 0), 0.0)
	_drawing = ""
	var aim: String = Txt.of(spec.get("aim", ""))
	if aim != "":
		_aim(BadgeSpec.MINE if aim == "mine" else BadgeSpec.THEIRS, size)
	_pose = Vector2(-1, -1)
	_follow()


func _ready() -> void:
	# Só a permanente com selos acompanha o giro (as cartas da mão e dos montes não gastam nada por quadro).
	set_process(not _spec.is_empty())


func _process(_delta: float) -> void:
	_follow()
	_watch_selection()


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
	_regions.clear()
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()


## Um canto da carta: `corner` diz qual (x de −1 a 1 da esquerda para a direita, y de −1 a 1 de cima para baixo na tela) e
## `inset` quanto ele entra na carta. Guarda o lugar dele na carta de pé e na virada; _follow põe no meio do caminho.
func _region(corner: Vector2, inset: Vector2) -> Node3D:
	var node := Node3D.new()
	node.scale = Vector3.ONE * _boost
	add_child(node)
	_regions.append({"node": node, "up": region_anchor(corner, inset, _size, false), "tap": region_anchor(corner, inset, _size, true)})
	return node


## O lugar de um canto no espaço da carta de pé (sem a virada nem o giro do desenho), para a carta de pé ou virada.
static func region_anchor(corner: Vector2, inset: Vector2, size: Vector2, tapped: bool) -> Vector3:
	var half := Vector2(size.y, size.x) / 2.0 if tapped else size / 2.0
	var screen := Vector2(corner.x * (half.x - inset.x), corner.y * (half.y - inset.y) + LIFT_SHIFT)
	# Virada (−90° em Y), o "direita" da tela é o −Z da carta e o "baixo" da tela é o +X dela.
	return Vector3(screen.y, LIFT, -screen.x) if tapped else Vector3(screen.x, LIFT, screen.y)


## Quanto a carta está virada (0 de pé, 1 deitada de lado) pelo eixo comprido dela, `long_axis` (o +Z da carta na mesa):
## o seno² do giro em torno do eixo vertical, que anda junto com a animação de virar.
static func tap_amount(long_axis: Vector3) -> float:
	var flat: float = long_axis.x * long_axis.x + long_axis.z * long_axis.z
	return long_axis.x * long_axis.x / flat if flat > 0.000001 else 0.0


## Leva cada canto para onde a carta está agora: no meio do caminho entre de pé e virada enquanto ela vira; deitados no
## tampo e apertados para o meio enquanto ela gira de lado ao transformar (e somem quando ela fica de perfil).
func _follow() -> void:
	var visual: Node3D = get_parent() as Node3D
	if visual == null or _regions.is_empty():
		return
	var card: Node3D = visual.get_parent() as Node3D
	var tap: float = tap_amount(card.basis.z) if card else (1.0 if _tapped else 0.0)
	var edge: float = absf(cos(visual.rotation.z))
	edge = 1.0 if edge > 0.95 else edge
	var pose := Vector2(tap, edge)
	if pose.distance_squared_to(_pose) < 0.000001 and visual.basis.is_equal_approx(Basis.IDENTITY):
		return
	_pose = pose
	# O desenho pode estar girando (transformar) ou inclinado (mouse): os cantos ficam no espaço da carta de pé.
	var undo: Basis = (visual.basis * basis).inverse() * basis
	for raw: Variant in _regions:
		var region: Dictionary = raw
		var at: Vector3 = (region["up"] as Vector3).lerp(region["tap"], tap)
		at.x *= edge
		var node: Node3D = region["node"]
		node.position = undo * at
		node.scale = Vector3(_boost * maxf(edge, 0.01), _boost, _boost)
		node.visible = edge > 0.12


## Na sua declaração de ataque ou de bloqueio, a escolha é local (a mesa a acende como "selecionada"): o selo do alto
## troca para "Selecionada" enquanto ela durar.
func _watch_selection() -> void:
	if (_spec.get("pending", {}) as Dictionary).is_empty():
		return
	var card: CardNode = get_parent().get_parent() as CardNode if get_parent() else null
	var view: TableView = card.get_parent() as TableView if card else null
	var on: bool = view != null and view.highlights.role(card.card_id) == "selected"
	if on != _selected:
		_selected = on
		_build()


## Selos empilhados numa coluna, descendo a partir da âncora; `side` 1 alinha à esquerda, −1 à direita.
func _stack_column(region: Node3D, chips: Array, side: float, group: String) -> void:
	var y: float = 0.0
	for raw: Variant in chips:
		var chip: Dictionary = raw
		_drawing = badge_key(group, chip)
		var h: int = (ROUND_H if bool(chip.get("round", false)) else CHIP_H) if chip.has("icon") else 46
		_chip(region, chip, h, Vector2(0, -y - h / 2.0), side)
		y += h + GAP


## Fileira de selos a partir da âncora (para a direita com `side` 1, para a esquerda com −1), subindo uma linha quando passa de `max_w`.
func _row(region: Node3D, chips: Array, h: int, side: float, base_y: float, max_w: float, group: String) -> void:
	var x: float = 0.0
	var y: float = base_y
	for raw: Variant in chips:
		_drawing = badge_key(group, raw)
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
	var radius: float = -1.0 if text != "" or icon_key == "" or bool(chip.get("round", false)) else h * 0.28
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


## P/T (base x atual, dano em vermelho), lealdade (com a prevista depois do combate, "3 → 1") ou nível de Classe; volta a
## altura usada (0 sem nenhum). Cada parte é [texto, cor, tamanho relativo].
func _pt(region: Node3D, pt: Dictionary) -> float:
	if pt.is_empty():
		return 0.0
	var size: int = int(PT_H * 0.72)
	var parts: Array = []
	var bg: Color = BadgeSpec.PAPER
	var border: Color = Color(0, 0, 0, 0.55)
	match Txt.of(pt.get("kind", "")):
		"pt":
			parts = [[str(pt["power"]), pt["pcolor"], 1.0], ["/", BadgeSpec.PAPER_INK, 1.0], [str(pt["toughness"]), pt["tcolor"], 1.0]]
		"loyalty":
			parts = [[str(pt["value"]), BadgeSpec.PAPER, 1.0]]
			bg = BadgeSpec.PAPER_INK
			border = BadgeSpec.PAPER
			if pt.has("after"):
				# A de agora menor e apagada, a seta e a prevista; letal, a borda e o número em vermelho.
				var lethal: bool = bool(pt.get("lethal", false))
				parts = [[str(pt["value"]), Color(BadgeSpec.PAPER, 0.65), 0.85], [" → ", BadgeSpec.PAPER, 0.8],
					[str(pt["after"]), Color("#ffb3a4") if lethal else BadgeSpec.PAPER, 1.0]]
				border = BadgeSpec.RED if lethal else BadgeSpec.PAPER
		"level":
			parts = [["Nv " + str(pt["value"]) + ("/%d" % int(pt["max"]) if int(pt.get("max", 0)) > 0 else ""), BadgeSpec.PAPER, 1.0]]
			bg = BadgeSpec.PAPER_INK
			border = BadgeSpec.GOLD
	var widths: Array[float] = []
	var total: float = 0.0
	for part: Array in parts:
		var tw: float = _text_width(Txt.of(part[0]), int(size * float(part[2])))
		widths.append(tw)
		total += tw
	var w: float = ceilf(total + PT_H * 0.42)
	_sprite(region, CardIcons.chip_texture(int(w), PT_H, bg, border, "", Color.WHITE, PT_H * 0.2), Vector2(-w / 2.0, PT_H / 2.0), PRIORITY_BG)
	var x: float = -w + PT_H * 0.21
	for i: int in parts.size():
		var part: Array = parts[i]
		_label(region, Txt.of(part[0]), part[1], int(size * float(part[2])), Vector2(x + widths[i] / 2.0, PT_H / 2.0 + 1.0))
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


## A chave de um selo de um grupo: o marcador pelo nome, os outros pelo ícone (ou "text", o ×N e afins).
static func badge_key(group: String, chip: Dictionary) -> String:
	if group == "counter":
		return "counter:" + Txt.of(chip.get("name", chip.get("icon", "")))
	return group + ":" + Txt.of(chip.get("icon", "text"))


## As peças à mostra (fundo, ícone, texto) do selo de chave `key` (badge_key, "tag" ou "pt"), o fundo primeiro; [] sem ele.
func parts_of(key: String) -> Array[GeometryInstance3D]:
	var out: Array[GeometryInstance3D] = []
	for region: Variant in _regions:
		for child: Node in ((region as Dictionary)["node"] as Node3D).get_children():
			if child is GeometryInstance3D and Txt.of(child.get_meta("badge", "")) == key and not child.is_queued_for_deletion():
				out.append(child as GeometryInstance3D)
	return out


## As chaves dos selos à mostra agora.
func keys() -> PackedStringArray:
	var out: PackedStringArray = []
	for region: Variant in _regions:
		for child: Node in ((region as Dictionary)["node"] as Node3D).get_children():
			var key: String = Txt.of(child.get_meta("badge", ""))
			if key != "" and not out.has(key):
				out.append(key)
	return out


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
	if _drawing != "":
		sprite.set_meta("badge", _drawing)
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
	if _drawing != "":
		label.set_meta("badge", _drawing)
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
		# Campo de distância (MSDF): o texto 3D fica nítido em qualquer tamanho, sem serrilhar nem tremer de longe.
		_font.multichannel_signed_distance_field = true
		_font.generate_mipmaps = true
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
