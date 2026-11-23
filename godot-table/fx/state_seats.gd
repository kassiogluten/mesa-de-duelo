# Os selos do assento (veneno, energia, o Anel, monarca, dianteira, bênção, velocidade, proteções) quando aparecem ou
# mudam: o selo salta com um anel de faíscas na cor dele; o marcador ganho num jogador voa como uma ficha até o selo.
class_name SeatBadgeFx
extends RefCounted

## Selos que mudam sozinhos (o relógio do turno, os terrenos e as mágicas do turno) não ganham efeito.
const QUIET := ["TURN", "LASTTURN", "LANDS", "SPELLS"]
## Os selos que acabam de aparecer esperam o HUD se arrumar antes de saltar.
const SETTLE := 0.12
## Monarca e dianteira: a medalha (fx/medallions.gd) ainda voa até o retrato; o selo salta quando ela chega.
const LANDING := {"MONARCH": 1.9, "INITIATIVE": 1.9}
## A ficha voando até o selo.
const FLY_TIME := 0.55

var _seen: bool = false
## id do jogador → {chave do selo: texto}
var _before: Dictionary = {}


## Olha os selos de cada assento no estado novo (antes de o HUD aplicá-lo) e faz saltar, logo depois, os que
## apareceram ou mudaram. Os marcadores que chegam por evento (`fresh`) ficam com a ficha voando (CounterFx).
func observe(state: Dictionary, fresh: Array, hud: Hud) -> void:
	var changes: Array = diff(state, fresh)
	if changes.is_empty() or hud == null or not hud.is_inside_tree():
		return
	var ref: WeakRef = weakref(hud)
	for raw: Variant in changes:
		var change: Dictionary = raw
		if LANDING.has(change["key"]) and bool(change["new"]):
			# Escondido até a medalha chegar (o salto o devolve).
			hud.get_tree().create_timer(0.0).timeout.connect(func() -> void:
				var alive: Hud = ref.get_ref() as Hud
				var seat: SeatPanel = alive.seat_panel(int(change["player"])) if alive else null
				var chip: Control = seat.badge_chip(Txt.of(change["key"])) if seat else null
				if chip:
					chip.scale = Vector2.ONE * 0.01)
		hud.get_tree().create_timer(SETTLE + float(LANDING.get(change["key"], 0.0))).timeout.connect(func() -> void:
			var alive: Hud = ref.get_ref() as Hud
			if alive:
				pulse(alive, int(change["player"]), Txt.of(change["key"]), change["tone"], bool(change["new"])))


## Os selos que apareceram ou mudaram desde o último estado: [{player, key, tone, new}] (nada no primeiro estado).
func diff(state: Dictionary, fresh: Array) -> Array:
	var flying: Dictionary = {}
	for raw: Variant in fresh:
		var event: Dictionary = raw
		if Txt.of(event.get("type")) == "counters" and event.get("targets") is Dictionary:
			for p: Variant in (event["targets"] as Dictionary).get("players", []):
				flying["%d|%s" % [int(p), Txt.of(event.get("counter"))]] = true
	var changes: Array = []
	var now: Dictionary = {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		var pid: int = int(player.get("id", -1))
		var badges: Dictionary = {}
		for b: Variant in SeatInfo.badges(player, state):
			var badge: Dictionary = b
			if QUIET.has(badge["key"]):
				continue
			badges[badge["key"]] = Txt.of(badge["text"])
			var before: Dictionary = _before.get(pid, {})
			if not _seen or flying.has("%d|%s" % [pid, badge["key"]]):
				continue
			if not before.has(badge["key"]) or Txt.of(before[badge["key"]]) != Txt.of(badge["text"]):
				changes.append({"player": pid, "key": badge["key"], "tone": Color(Txt.of(badge["tone"])), "new": not before.has(badge["key"])})
		now[pid] = badges
	_before = now
	_seen = true
	return changes


## O selo `key` do assento salta (do pequeno, quando acaba de aparecer) e solta um anel de faíscas na cor `tone`.
static func pulse(hud: Hud, player: int, key: String, tone: Color, appeared: bool) -> bool:
	var seat: SeatPanel = hud.seat_panel(player)
	var chip: Control = seat.badge_chip(key) if seat else null
	if chip == null or not chip.is_visible_in_tree():
		return false
	chip.pivot_offset = chip.size / 2.0
	var base: Color = chip.modulate
	var tween := chip.create_tween()
	if appeared:
		chip.scale = Vector2.ONE * 0.4
		tween.tween_property(chip, "scale", Vector2.ONE * 1.18, 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	else:
		tween.tween_property(chip, "scale", Vector2.ONE * 1.22, 0.1).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(chip, "modulate", Color(base.r * 1.5, base.g * 1.5, base.b * 1.5, base.a), 0.1)
	tween.tween_property(chip, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(chip, "modulate", base, 0.35)
	if Fx.quality > 0 or appeared:
		ManaPoolFx.sparks_ring(hud, chip.get_global_rect().get_center(), tone, Fx.quality == 0, 1.0 if appeared else 0.6)
	return true


## Um marcador ganho por um jogador: a ficha (ícone e "+1") sai de `from` (a carta que o deu, na tela) e voa até o selo
## dele; chegando, o selo salta. Volta false se o assento não mostra o selo (quem chama faz o efeito de antes).
static func fly(hud: Hud, player: int, key: String, from: Vector2, delta: int) -> bool:
	var seat: SeatPanel = hud.seat_panel(player) if hud else null
	if seat == null or seat.badge_chip(key) == null:
		return false
	var known: Dictionary = SeatInfo.COUNTERS.get(key, {})
	var tone := Color(Txt.of(known.get("tone", "#c9c3b5")))
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_theme_stylebox_override("panel", SeatPanel._chip_style(Color(0.06, 0.08, 0.13, 0.95), Color(tone, 0.9), 13))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_child(row)
	var icon := TextureRect.new()
	icon.texture = SeatIcons.icon(Txt.of(known.get("icon", "disc")), tone, 20)
	icon.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var label := HudStyle.label(18, Color.WHITE)
	label.text = ("+%d" % delta) if delta >= 0 else ("−%d" % absi(delta))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(label)
	chip.z_index = 20
	hud.add_child(chip)
	chip.size = chip.get_combined_minimum_size()
	chip.pivot_offset = chip.size / 2.0
	chip.global_position = from - chip.size / 2.0
	chip.scale = Vector2.ONE * 0.3
	var seat_ref: WeakRef = weakref(seat)
	var hud_ref: WeakRef = weakref(hud)
	# O alvo é lido a cada quadro: o HUD pode refazer os selos no meio do voo.
	var target: Callable = func() -> Vector2:
		var s: SeatPanel = seat_ref.get_ref() as SeatPanel
		var c: Control = s.badge_chip(key) if s else null
		return c.get_global_rect().get_center() if c else from
	var lift: Vector2 = Vector2(0, -60)
	var step: Callable = func(t: float) -> void:
		var to: Vector2 = target.call()
		var k: float = 1.0 - pow(1.0 - t, 2.0)
		var mid: Vector2 = from.lerp(to, 0.5) + lift
		var at: Vector2 = from.lerp(mid, k).lerp(mid.lerp(to, k), k)
		chip.global_position = at - chip.size / 2.0
	var tween := chip.create_tween()
	tween.tween_property(chip, "scale", Vector2.ONE * 1.25, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_interval(0.08)
	tween.tween_method(step, 0.0, 1.0, FLY_TIME).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.parallel().tween_property(chip, "scale", Vector2.ONE * 0.7, FLY_TIME).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(chip, "modulate:a", 0.0, 0.12).set_delay(FLY_TIME - 0.1)
	tween.tween_callback(func() -> void:
		var h: Hud = hud_ref.get_ref() as Hud
		if h:
			pulse(h, player, key, tone, false)
		chip.queue_free())
	return true
