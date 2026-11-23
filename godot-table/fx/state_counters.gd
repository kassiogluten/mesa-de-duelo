# Marcadores chegando: na permanente, uma ficha com o ícone e o "+2" salta da carta (o +1/+1 sobe em verde, o −1/−1 cai
# em vermelho) e se encaixa no selo do marcador, que conta até o número novo; a lealdade vira algarismo por algarismo;
# no jogador (veneno, energia…), a ficha voa até o selo do assento.
class_name CounterFx
extends RefCounted

const GREEN := Color(0.45, 1.0, 0.55)
const RED := Color(1.0, 0.42, 0.36)
## Os tempos da ficha: aparecer (subir ou cair), parar um instante, ir até o selo.
const APPEAR := 0.24
const HOLD := 0.08
const SLIDE := 0.3


## O evento `counters` (EventFx.counters): no jogador, na lealdade ou num marcador da carta.
static func play(d: FxDirector, event: Dictionary) -> void:
	var delta: int = int(event.get("delta", 1))
	var kind: String = Txt.of(event.get("counter"))
	var players: Array = (event.get("targets", {}) as Dictionary).get("players", []) if event.get("targets") is Dictionary else []
	if not players.is_empty():
		_to_player(d, event, int(players[0]), kind, delta)
		return
	var id: int = FxDirector.card_id(event)
	var node: CardNode = d.table.card_node(id)
	if node == null or d.table.zone_of(id) != "battlefield":
		_fallback(d, id, kind, delta)
		return
	# A carta que entra já com os marcadores tem a entrada dela; a ficha só aparece nas que já estavam na mesa.
	if bool(event.get("entering", false)):
		return
	if kind == "LOYALTY":
		_loyalty(d, node, delta)
	else:
		_chip(d, node, kind, delta)


## A cor do marcador: verde no +1/+1, vermelho no −1/−1, o dourado claro dos selos nos outros.
static func color_of(kind: String) -> Color:
	return GREEN if kind == "P1P1" else (RED if kind == "M1M1" else BadgeSpec.GOLD_LIGHT)


## O texto da ficha: "+2", "−1".
static func chip_text(delta: int) -> String:
	return "+%d" % delta if delta >= 0 else "−%d" % absi(delta)


static func _now_value(node: CardNode, kind: String) -> int:
	var counters: Variant = node.data.get("counters")
	return int((counters as Dictionary).get(kind, 0)) if counters is Dictionary else 0


## A ficha salta da carta e se encaixa no selo; tirar marcadores: o selo conta para trás e uma ficha "−1" se solta dele.
static func _chip(d: FxDirector, node: CardNode, kind: String, delta: int) -> void:
	var camera: Camera3D = d.table.camera
	var key: String = "counter:" + CardLabels.counter_name(kind)
	var color: Color = color_of(kind)
	var now: int = _now_value(node, kind)
	var pt: bool = bool(node.data.get("creature", false)) and kind in ["P1P1", "M1M1"]
	var pt_delta: int = delta * (1 if kind == "P1P1" else -1)
	var card: Vector3 = node.global_position
	var up: Vector3 = camera.global_basis.y
	var list: Array[GeometryInstance3D] = BadgeFx.parts(node, key)
	if delta < 0:
		var from: Vector3 = BadgeFx.center(list, camera) if BadgeFx.alive(list) else card
		BadgeFx.tick(list, now - delta, now)
		var piece: Node3D = _piece(d, kind, delta, color)
		piece.global_position = from
		var tween := piece.create_tween()
		tween.tween_property(piece, "global_position", from - up * 0.2, 0.6).set_ease(Tween.EASE_IN)
		tween.parallel().tween_method(func(a: float) -> void: _fade(piece, a), 1.0, 0.0, 0.6)
		tween.tween_callback(piece.queue_free)
		if pt:
			BadgeFx.pt_pulse(d, node, pt_delta, pt_delta, camera)
		return
	var piece: Node3D = _piece(d, kind, delta, color)
	var rises: bool = kind != "M1M1"
	# O +1/+1 nasce na carta e sobe; o −1/−1 aparece no alto e cai sobre ela, pesado.
	var start: Vector3 = card + Vector3(0, 0.03, 0) if rises else card + Vector3(0, 0.75, 0.1)
	var peak: Vector3 = card + Vector3(0, 0.42, 0.06) if rises else card + Vector3(0, 0.26, 0.04)
	piece.global_position = start
	piece.scale = Vector3.ONE * (0.3 if rises else 1.1)
	_fade(piece, 0.0 if not rises else 1.0)
	if rises:
		Fx.burst(d, card, color, 8, 0.35, 0.6, 0.035, 1.4)
	var ref: WeakRef = weakref(node)
	var tween := piece.create_tween()
	if rises:
		tween.tween_property(piece, "global_position", peak, APPEAR).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(piece, "scale", Vector3.ONE * 1.15, APPEAR).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		tween.tween_property(piece, "global_position", peak, APPEAR).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tween.parallel().tween_method(func(a: float) -> void: _fade(piece, a), 0.0, 1.0, APPEAR * 0.6)
		tween.tween_callback(func() -> void:
			var alive: CardNode = ref.get_ref() as CardNode
			if alive:
				alive.jolt(0.02)
			Fx.burst(d, peak, color, 8, 0.4, 0.5, 0.035, -3.0))
		tween.tween_property(piece, "scale", Vector3.ONE * 1.15, 0.08).set_ease(Tween.EASE_OUT)
	tween.tween_interval(HOLD)
	# O selo é procurado de novo a cada quadro: a carta pode ter refeito os selos (ou se mexido) enquanto a ficha voava.
	var aim: Callable = func() -> Vector3:
		var alive: CardNode = ref.get_ref() as CardNode
		var target: Array[GeometryInstance3D] = BadgeFx.parts(alive, key) if alive else ([] as Array[GeometryInstance3D])
		return BadgeFx.center(target, camera) if BadgeFx.alive(target) else (alive.global_position if alive else card)
	var from_peak: Array = [peak]
	tween.tween_callback(func() -> void: from_peak[0] = piece.global_position)
	tween.tween_method(func(t: float) -> void:
		var to: Vector3 = aim.call()
		var k: float = t * t * (3.0 - 2.0 * t)
		piece.global_position = (from_peak[0] as Vector3).lerp(to, k) + up * sin(PI * t) * 0.08
		piece.scale = Vector3.ONE * lerpf(1.15, 1.0, k)
		if t > 0.8:
			_fade(piece, (1.0 - t) / 0.2), 0.0, 1.0, SLIDE)
	tween.tween_callback(func() -> void:
		piece.queue_free()
		var alive: CardNode = ref.get_ref() as CardNode
		if alive == null:
			return
		var target: Array[GeometryInstance3D] = BadgeFx.parts(alive, key)
		if BadgeFx.alive(target):
			BadgeFx.tick(target, now - delta, now)
			BadgeFx.glow(target, color, 1.9, 0.45, 0.85)
		if pt:
			BadgeFx.pt_pulse(d, alive, pt_delta, pt_delta, camera))


## A lealdade mudou: o selo de baixo vira algarismo por algarismo, com o brilho e o "+1"/"−3" saindo dele.
static func _loyalty(d: FxDirector, node: CardNode, delta: int) -> void:
	var list: Array[GeometryInstance3D] = BadgeFx.parts(node, "pt")
	if not BadgeFx.alive(list):
		_fallback(d, node.card_id, "LOYALTY", delta)
		return
	var now: int = _now_value(node, "LOYALTY")
	roll_loyalty(d, node, now - delta, now)


## A lealdade de `from` para `to` no selo (também a que muda sem evento: dano no planeswalker).
static func roll_loyalty(parent: Node3D, node: CardNode, from: int, to: int) -> void:
	var list: Array[GeometryInstance3D] = BadgeFx.parts(node, "pt")
	if not BadgeFx.alive(list) or from == to:
		return
	var camera: Camera3D = parent.get_viewport().get_camera_3d()
	var color: Color = GREEN if to > from else RED
	BadgeFx.flip(list, from, to, color)
	BadgeFx.glow(list, color, 2.0, 0.6, 0.85)
	if camera:
		BadgeFx.delta_text(parent, BadgeFx.center(list, camera), chip_text(to - from), color, camera, to < from)


## No jogador: a ficha voa da carta que deu o marcador (ou de perto do retrato) até o selo do assento.
static func _to_player(d: FxDirector, event: Dictionary, player: int, kind: String, delta: int) -> void:
	var from := Vector2(-1, -1)
	var source: int = FxDirector.card_id(event)
	if source >= 0:
		from = ManaPoolFx.project(d.table, source)
	if from.x < 0 and d.hud:
		from = d.hud.portrait_center(player) + Vector2(0, -90)
	if d.hud and from.x >= 0 and SeatBadgeFx.fly(d.hud, player, kind, from, delta):
		return
	_fallback(d, "player:%d" % player, kind, delta)


## Sem selo à mostra: o texto sobe no lugar (o efeito de antes).
static func _fallback(d: FxDirector, key: Variant, kind: String, delta: int) -> void:
	var pos: Variant = d.table.anchor(key)
	if not pos is Vector3:
		return
	var text: String = {"P1P1": "%s/%s" % [chip_text(delta), chip_text(delta)], "M1M1": "%s/%s" % [chip_text(-delta), chip_text(-delta)],
		"LOYALTY": "%s lealdade" % chip_text(delta), "POISON": "%s veneno" % chip_text(delta)}.get(kind, chip_text(delta))
	var color: Color = RED if kind in ["M1M1", "POISON"] else GREEN
	Fx.float_text(d, pos, text, color, 60, 0.9)
	Fx.burst(d, pos, color, 14, 0.9, 0.45, 0.06)


## A ficha: o fundo escuro do selo com o ícone do marcador e o "+2" (do mesmo tamanho que o selo na carta), por cima de tudo.
static func _piece(parent: Node3D, kind: String, delta: int, color: Color) -> Node3D:
	var h: int = CardBadges.CHIP_H
	var text: String = str(absi(delta)) if kind == "M1M1" else chip_text(delta)
	var font_size: int = CardBadges._font_size(h)
	var pad: float = h * 0.3
	var icon_w: float = h * 0.62 + 3.0
	var tw: float = CardBadges._text_width(text, font_size)
	var w: float = ceilf(pad * 2.0 + icon_w + tw)
	var root := Node3D.new()
	var bg := Sprite3D.new()
	bg.texture = CardIcons.chip_texture(int(w), h, BadgeSpec.DARK, Color(color, 0.85), CardLabels.counter_icon(kind), color)
	bg.pixel_size = CardBadges.PX
	_overlay(bg, BadgeFx.ABOVE)
	root.add_child(bg)
	var label := Label3D.new()
	label.text = text
	label.font = CardBadges.font()
	label.font_size = font_size
	label.outline_size = 0
	label.modulate = color
	label.pixel_size = CardBadges.PX
	label.offset = Vector2(-w / 2.0 + pad + icon_w + tw / 2.0, 0)
	_overlay(label, BadgeFx.ABOVE + 1)
	root.add_child(label)
	parent.add_child(root)
	return root


static func _overlay(node: GeometryInstance3D, priority: int) -> void:
	node.set("billboard", BaseMaterial3D.BILLBOARD_ENABLED)
	node.set("no_depth_test", true)
	node.set("render_priority", priority)
	node.set("double_sided", true)
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if node is Sprite3D:
		(node as Sprite3D).shaded = false
		(node as Sprite3D).texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	else:
		(node as Label3D).outline_render_priority = priority - 1


static func _fade(piece: Node3D, alpha: float) -> void:
	for child: Node in piece.get_children():
		var c: Color = child.get("modulate")
		c.a = clampf(alpha, 0.0, 1.0)
		child.set("modulate", c)
