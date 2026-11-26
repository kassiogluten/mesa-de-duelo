# O que muda numa permanente de um estado para o outro sem efeito próprio vira um toque pequeno: o enjoo de invocação
# (chegar, girar no selo, passar), desvirar na etapa de desvirar, virar para mana, P/T que muda, lealdade que muda sem
# marcador, nível de Classe e os selos novos (palavra-chave ganha, Portador do Anel, virou criatura). A mesa chama
# sync() a cada estado, depois de pôr as cartas no lugar.
class_name StateFx
extends Node3D

## Tetos por estado: 20 fichas novas não viram uma nuvem de estrelas, um hino não pisca o campo inteiro de uma vez.
const MAX_DIZZY := 8
const MAX_PULSES := 10
const MAX_SWEEPS := 16
const MAX_CLICKS := 10
const MAX_ARRIVALS := 8
## Espaço entre cartas vizinhas no mesmo efeito (a onda anda da esquerda para a direita).
const STAGGER := 0.04
## A faixa do turno (ui/turn_banner.gd) cobre o meio da mesa por ~1 s.
const AFTER_BANNER := 1.05
## Os grupos de selo que ganham o salto quando aparecem numa carta que já estava na mesa.
const ARRIVING := ["keyword:", "corner:", "top_right:"]

var table: TableView
var sickness: SicknessFx
## id → o que a carta mostrava no último estado (snapshot()).
var _before: Dictionary = {}
var _seen: bool = false
var _turn: int = -1
var _last_seq: int = -1


## Chamado pela mesa a cada estado, depois de pôr as permanentes no lugar: cria o nó na primeira vez.
static func sync(view: TableView) -> void:
	var fx: StateFx = view.get_node_or_null("StateFx") as StateFx
	if fx == null:
		fx = StateFx.new()
		fx.name = "StateFx"
		fx.table = view
		view.add_child(fx)
	fx.refresh()


func _init() -> void:
	sickness = SicknessFx.new()
	sickness.name = "Sickness"
	add_child(sickness)


## O que importa de uma carta para os efeitos daqui.
static func snapshot(card: Dictionary, keys: PackedStringArray) -> Dictionary:
	var counters: Dictionary = card.get("counters", {}) if card.get("counters") is Dictionary else {}
	return {
		"name": Txt.of(card.get("name")), "face_down": bool(card.get("faceDown", false)),
		"dizzy": CardLabels.dizzy(card), "tapped": bool(card.get("tapped", false)), "attacking": bool(card.get("attacking", false)),
		"creature": bool(card.get("creature", false)) and card.has("power"),
		"power": int(card.get("power", 0)), "toughness": int(card.get("toughness", 0)),
		"walker": bool(card.get("planeswalker", false)), "loyalty": int(counters.get("LOYALTY", 0)),
		"level": int(card["classLevel"]) if card.get("classLevel") != null else -1,
		"keys": keys,
	}


## Compara a carta antes e agora e diz o que mudou: {dizzy: "arrived"|"cleared"|"", untap (na etapa de desvirar),
## untapped (desvirou, na etapa ou por efeito), tap, pt: Vector2i, loyalty:
## Vector2i(antes, agora) ou null, level, badges: as chaves de selo novas}. `skip`: marcadores que chegam por evento
## nesta carta (o efeito do marcador já mostra o P/T e a lealdade). `new_turn`: começou o turno de quem a controla.
static func changes(before: Dictionary, now: Dictionary, skip: Dictionary, new_turn: bool) -> Dictionary:
	var out: Dictionary = {"dizzy": "", "untap": false, "untapped": false, "tap": false, "pt": Vector2i.ZERO, "loyalty": null, "level": false, "badges": PackedStringArray()}
	if before.is_empty():
		out["dizzy"] = "arrived" if bool(now["dizzy"]) else ""
		return out
	if bool(now["dizzy"]) != bool(before["dizzy"]):
		out["dizzy"] = "arrived" if bool(now["dizzy"]) else "cleared"
	if bool(before["tapped"]) and not bool(now["tapped"]):
		out["untap"] = new_turn
		out["untapped"] = true
	elif not bool(before["tapped"]) and bool(now["tapped"]) and not bool(now["attacking"]):
		out["tap"] = true
	# A mesma face: transformar (o nome muda) e desvirar para cima têm o efeito deles.
	var same: bool = before["name"] == now["name"] and before["face_down"] == now["face_down"] and not bool(now["face_down"])
	if not same:
		return out
	if bool(before["creature"]) and bool(now["creature"]) and not skip.has("P1P1") and not skip.has("M1M1"):
		out["pt"] = Vector2i(int(now["power"]) - int(before["power"]), int(now["toughness"]) - int(before["toughness"]))
	if bool(before["walker"]) and bool(now["walker"]) and int(before["loyalty"]) != int(now["loyalty"]) and not skip.has("LOYALTY"):
		out["loyalty"] = Vector2i(int(before["loyalty"]), int(now["loyalty"]))
	out["level"] = int(before["level"]) >= 0 and int(now["level"]) > int(before["level"])
	var fresh: PackedStringArray = []
	for key: String in now["keys"]:
		if (before["keys"] as PackedStringArray).has(key):
			continue
		for group: String in ARRIVING:
			if key.begins_with(group) and key != "top_right:text":
				fresh.append(key)
		if key == "pt" and not bool(before["creature"]) and not bool(before["walker"]) and int(before["level"]) < 0:
			fresh.append(key)
	out["badges"] = fresh
	return out


## Refaz a partir do estado que a mesa acabou de pôr.
func refresh() -> void:
	if table == null:
		return
	var state: Dictionary = table.current_state()
	var skip: Dictionary = _counter_events(state)
	var turn: int = int(state.get("turn", 0)) if state.get("turn") != null else 0
	var active: int = int(state["activePlayer"]) if state.get("activePlayer") != null else -1
	var new_turn: bool = _seen and turn != _turn
	var now: Dictionary = {}
	var dizzy: Array = []
	var arrived: Array = []
	var cleared: Array = []
	var untaps: Array = []
	var untapped: Array = []
	var taps: Array = []
	var pulses: Array = []
	var others: Array = []
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		for c: Variant in player.get("battlefield", []):
			var card: Dictionary = c
			var id: int = int(card.get("id", -1))
			var node: CardNode = table.card_node(id)
			if node == null:
				continue
			var badges: CardBadges = BadgeFx.badges_of(node)
			var snap: Dictionary = snapshot(card, badges.keys() if badges else PackedStringArray())
			now[id] = snap
			if bool(snap["dizzy"]):
				dizzy.append(id)
			if not _seen:
				continue
			var change: Dictionary = changes(_before.get(id, {}), snap, skip.get(id, {}), new_turn and int(card.get("controller", -1)) == active)
			match Txt.of(change["dizzy"]):
				"arrived":
					arrived.append(node)
				"cleared":
					cleared.append(node)
			if bool(change["untapped"]):
				untapped.append(node)
			if bool(change["untap"]):
				untaps.append(node)
			elif bool(change["tap"]):
				taps.append([node, card])
			if change["pt"] != Vector2i.ZERO or change["loyalty"] != null:
				pulses.append([node, change])
			elif bool(change["level"]) or not (change["badges"] as PackedStringArray).is_empty():
				others.append([node, change])
	_before = now
	_turn = turn
	var first: bool = not _seen
	_seen = true
	sickness.camera = table.camera
	sickness.keep(dizzy)
	if first:
		return
	var sounds: Sounds = table.get_meta(&"sounds", null) as Sounds if table.has_meta(&"sounds") else null
	TapFx.turn_sound(sounds, untapped, true)
	var tapped: Array = []
	for pair: Variant in taps:
		tapped.append((pair as Array)[0])
	TapFx.turn_sound(sounds, tapped, false)
	_play(arrived, cleared, untaps, taps, pulses, others, new_turn)


## Toca o que mudou, com tetos e a onda da esquerda para a direita.
func _play(arrived: Array, cleared: Array, untaps: Array, taps: Array, pulses: Array, others: Array, new_turn: bool = false) -> void:
	var by_x: Callable = func(a: Variant, b: Variant) -> bool:
		var na: CardNode = a[0] if a is Array else a
		var nb: CardNode = b[0] if b is Array else b
		return na.target_transform().origin.x < nb.target_transform().origin.x
	for list: Array in [arrived, cleared, untaps, taps, pulses, others]:
		list.sort_custom(by_x)
	for i: int in mini(untaps.size(), MAX_SWEEPS):
		TapFx.untap_sweep(untaps[i], i * STAGGER)
	# No começo do turno a faixa "Seu turno" passa por cima do meio da mesa: as estrelinhas esperam ela sair.
	var after_sweep: float = AFTER_BANNER if new_turn else 0.0
	for i: int in mini(cleared.size(), MAX_DIZZY):
		sickness.leave(cleared[i], after_sweep + i * 0.06)
	for i: int in mini(arrived.size(), MAX_DIZZY):
		var node: CardNode = arrived[i]
		sickness.arrive(node.card_id, node, i * 0.06)
	for i: int in mini(taps.size(), MAX_CLICKS):
		var pair: Array = taps[i]
		var card: Dictionary = pair[1]
		TapFx.tap_click(self, pair[0], TapFx.click_color(card), 1.0 if ManaPoolFx.produces(card) != "" else 0.7)
	var camera: Camera3D = table.camera
	for i: int in mini(pulses.size(), MAX_PULSES):
		var node: CardNode = pulses[i][0]
		var change: Dictionary = pulses[i][1]
		_later(i * STAGGER, func() -> void:
			if change["loyalty"] != null:
				var loyalty: Vector2i = change["loyalty"]
				CounterFx.roll_loyalty(self, node, loyalty.x, loyalty.y)
			else:
				var pt: Vector2i = change["pt"]
				BadgeFx.pt_pulse(self, node, pt.x, pt.y, camera), node)
	for i: int in mini(others.size(), MAX_ARRIVALS):
		var node: CardNode = others[i][0]
		var change: Dictionary = others[i][1]
		_later(0.1 + i * STAGGER, func() -> void:
			var badges: CardBadges = BadgeFx.badges_of(node)
			if badges == null:
				return
			for key: String in change["badges"]:
				BadgeFx.arrive(badges.parts_of(key), arrival_color(key))
			if bool(change["level"]):
				BadgeFx.arrive(badges.parts_of("pt"), BadgeSpec.GOLD), node)


## O brilho do selo que chega: o dourado do Anel e da coroa, o azul-claro das palavras-chave.
static func arrival_color(key: String) -> Color:
	if key.contains("ring") or key.contains("crown") or key.contains("gem"):
		return BadgeSpec.RING
	if key.begins_with("keyword:"):
		return BadgeSpec.KEYWORD_INK
	return BadgeSpec.GOLD_LIGHT


## Roda `play` daqui a `seconds`, se a carta ainda estiver na mesa.
func _later(seconds: float, play: Callable, node: CardNode) -> void:
	var ref: WeakRef = weakref(node)
	var me: WeakRef = weakref(self)
	get_tree().create_timer(seconds).timeout.connect(func() -> void:
		var card: CardNode = ref.get_ref() as CardNode
		if me.get_ref() != null and card != null and not card.is_queued_for_deletion():
			play.call())


## Os marcadores que chegam por evento neste estado: id da carta → {tipo: true} (o efeito do marcador cuida do P/T e da
## lealdade delas).
func _counter_events(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for raw: Variant in state.get("events", []):
		var event: Dictionary = raw
		var seq: int = int(event.get("seq", -1))
		if seq <= _last_seq:
			continue
		_last_seq = seq
		if Txt.of(event.get("type")) != "counters":
			continue
		var id: int = FxDirector.card_id(event)
		if id >= 0:
			var kinds: Dictionary = out.get(id, {})
			kinds[Txt.of(event.get("counter"))] = true
			out[id] = kinds
	return out
