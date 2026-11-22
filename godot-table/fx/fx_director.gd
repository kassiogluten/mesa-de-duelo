# Diretor dos efeitos: lê os eventos novos de cada estado (dano, vida, mágica, entrada, saída, combate, marcadores, turno)
# e toca um efeito por evento, em sequência curta. A carta destruída ou exilada fica com ele para sair em cena.
class_name FxDirector
extends Node3D

## A partida acabou (vitória ou derrota): a mesa fica com a cena final.
signal finale(won: bool)

const DURATION := {
	"damage": 0.26, "spell-cast": 0.32, "ability-activated": 0.22, "entered": 0.24, "left": 0.3,
	"attackers": 0.3, "blockers": 0.24, "countered": 0.3, "resolved": 0.12, "counters": 0.1, "survived": 0.3,
	"coin": 0.4, "die": 0.4, "turn": 0.1, "draw": 0.05,
}
## Tempo máximo para os efeitos de um estado: com muitos eventos (limpa-campo), o ritmo encurta.
const MAX_BATCH := 2.4

var table: TableView
var hud: Hud
var sounds: Sounds
## Escala de velocidade dos efeitos (o laboratório usa câmera lenta).
var speed: float = 1.0
var _last_seq: int = -1
var _you: int = 0
var _names: Dictionary = {}
var _slow_frames: float = 0.0


## Automático (o regulador escolhe) ou fixo pela opção do jogador.
var automatic: bool = true
var _ambience: GPUParticles3D


func _ready() -> void:
	var prefs: Dictionary = Prefs.load_all()
	var level: String = Txt.of(prefs.get("effects", "auto"))
	automatic = level == "auto"
	Fx.quality = {"alto": 2, "medio": 1, "leve": 0}.get(level, 2)
	if Fx.quality > 0:
		_ambience = Fx.ambience(self)


func _process(delta: float) -> void:
	# Regulador: com os quadros caindo por um tempo, os efeitos ficam mais leves (só no Automático).
	if not automatic:
		return
	if _ambience and Fx.quality == 0:
		_ambience.emitting = false
	if delta > 1.0 / 45.0:
		_slow_frames += delta
		if _slow_frames > 1.5 and Fx.quality > 0:
			Fx.quality -= 1
			_slow_frames = 0.0
	else:
		_slow_frames = maxf(0.0, _slow_frames - delta * 0.5)


## Chamar com cada estado ANTES de a mesa aplicá-lo: separa as cartas que vão sair e agenda os efeitos.
func before_state(state: Dictionary) -> void:
	_you = int(state.get("you", 0))
	for p: Variant in state.get("players", []):
		_names[int((p as Dictionary)["id"])] = Txt.of((p as Dictionary).get("name"))
	var fresh: Array = []
	for raw: Variant in state.get("events", []):
		var event: Dictionary = raw
		if int(event.get("seq", -1)) > _last_seq:
			fresh.append(event)
			_last_seq = int(event.get("seq", -1))
	if fresh.is_empty():
		return
	# Quem vai para o cemitério ou o exílio sai em cena: o nó fica com o diretor até o efeito dele.
	var leaving: Dictionary = {}
	for event: Dictionary in fresh:
		var id: int = _card_id(event)
		var dies: bool = event.get("type") == "left" and Txt.of(event.get("to")) in ["Graveyard", "Exile"] and table.zone_of(id) == "battlefield"
		var countered: bool = event.get("type") == "countered" and table.zone_of(id) == "stack"
		if id >= 0 and (dies or countered):
			var node: CardNode = table.detach(id)
			if node:
				leaving[id] = node
	var total: float = 0.0
	for event: Dictionary in fresh:
		total += float(DURATION.get(Txt.of(event.get("type")), 0.0))
	var pace: float = minf(1.0, MAX_BATCH / maxf(total, 0.001)) / speed
	var at: float = 0.05
	for event: Dictionary in fresh:
		var played: Dictionary = event
		# Referência fraca: a carta pode já ter sumido quando o temporizador dispara.
		var ref: WeakRef = weakref(leaving.get(_card_id(event)))
		get_tree().create_timer(at).timeout.connect(func() -> void: _play(played, ref.get_ref() as CardNode))
		at += float(DURATION.get(Txt.of(event.get("type")), 0.0)) * pace
	# Garantia: uma carta separada que não saiu em cena (evento sem efeito) se apaga mesmo assim.
	for id: Variant in leaving:
		var ref: WeakRef = weakref(leaving[id])
		get_tree().create_timer(at + 2.0).timeout.connect(func() -> void:
			var node: CardNode = ref.get_ref() as CardNode
			if node and not node.is_queued_for_deletion():
				node.vanish())


static func _card_id(event: Dictionary) -> int:
	if event.get("card") is Dictionary and (event["card"] as Dictionary).has("id"):
		return int((event["card"] as Dictionary)["id"])
	if event.get("sourceId") != null:
		return int(event["sourceId"])
	var cards: Array = event.get("cards", []) if event.get("cards") is Array else []
	return int(cards[0]) if not cards.is_empty() else -1


func _play(event: Dictionary, leaving: CardNode) -> void:
	if sounds:
		var where: Variant = table.anchor(_card_id(event)) if _card_id(event) >= 0 else null
		sounds.play(Sounds.cue_for(event, _you), where if where is Vector3 else Vector3.ZERO)
	match Txt.of(event.get("type")):
		"damage":
			_damage(event)
		"life-changed":
			_life(event)
		"spell-cast":
			_spell(event)
		"ability-activated":
			_ability(event)
		"resolved":
			_at_card(event, func(pos: Vector3, card: Dictionary) -> void: Fx.burst(self, pos, Fx.card_color(card), 24, 1.6, 0.45))
		"countered":
			if leaving and is_instance_valid(leaving):
				var pos: Vector3 = leaving.global_position
				Fx.burst(self, pos, Color(0.7, 0.75, 0.85), 60, 3.0, 0.6, 0.15)
				Fx.ring(self, pos, Color(0.7, 0.8, 1.0), 1.2, 0.5, 0.2)
				Fx.float_text(self, pos, "Anulada", Color(0.75, 0.85, 1.0), 60)
				leaving.burn_away(Color(0.6, 0.75, 1.0), 0.7 / speed)
		"entered":
			_entered(event)
		"left":
			_left(event, leaving)
		"attackers":
			for id: Variant in event.get("cards", []):
				var node: CardNode = table.card_node(int(id))
				if node:
					node.flash_color(Color(1.0, 0.3, 0.2), 0.5)
					Fx.burst(self, node.global_position, Color(1.0, 0.35, 0.2), 18, 1.4, 0.5)
			if not (event.get("cards", []) as Array).is_empty():
				hud.banner("Ataque!", Color(1.0, 0.45, 0.3))
		"blockers":
			for id: Variant in event.get("cards", []):
				var node: CardNode = table.card_node(int(id))
				if node:
					node.flash_color(Color(0.35, 0.65, 1.0), 0.5)
					Fx.ring(self, node.global_position, Color(0.4, 0.7, 1.0), 0.9, 0.4)
		"counters":
			_counters(event)
		"survived":
			_at_card(event, func(pos: Vector3, _card: Dictionary) -> void:
				var node: CardNode = table.card_node(_card_id(event))
				if node:
					node.flash_color(Color(1, 1, 1), 0.6)
					node.jolt()
				Fx.float_text(self, pos, "Indestrutível" if event.get("survived") == "indestructible" else "Regenerada", Color(0.95, 0.95, 1.0), 52))
		"turn":
			var mine: bool = int(event.get("actor", -1)) == _you
			var title: String = "Seu turno" if mine else "Turno de %s" % _names.get(int(event.get("actor", -1)), "Oponente")
			if bool(event.get("extra", false)):
				title += " extra"
			hud.banner(title, Hud.GOLD if mine else Color(0.75, 0.85, 1.0))
		"draw":
			var actor: int = int(event.get("actor", _you))
			Fx.burst(self, table.library_position(actor) + Vector3(0, 0.3, 0), Color(0.8, 0.9, 1.0), 10, 0.8, 0.4, 0.09)
		"shuffle":
			var pile: CardNode = table.card_node("library:%d" % int(event.get("actor", _you)))
			if pile:
				pile.jolt(0.12)
		"coin":
			Fx.float_text(self, Vector3(0, 0.5, 0.3), "Cara" if bool(event.get("heads", false)) else "Coroa", Hud.GOLD, 90, 1.6)
		"die":
			Fx.float_text(self, Vector3(0, 0.5, 0.3), "d%d: %d" % [int(event.get("sides", 6)), int(event.get("result", 0))], Hud.GOLD, 90, 1.6)


## Dano: no combate o atacante avança e golpeia; fora dele, um projétil sai da fonte. O alvo pisca, solta faíscas e o número.
func _damage(event: Dictionary) -> void:
	var amount: int = absi(int(event.get("delta", 0)))
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var to_key: Variant = null
	if not (targets.get("cards", []) as Array).is_empty():
		to_key = int(targets["cards"][0])
	elif not (targets.get("players", []) as Array).is_empty():
		to_key = "player:%d" % int(targets["players"][0])
	var target: Variant = table.anchor(to_key) if to_key != null else null
	if not target is Vector3:
		return
	var source_id: int = _card_id(event)
	var source: Variant = table.anchor(source_id) if source_id >= 0 else null
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else table.card_data(source_id)
	var color: Color = Color(1.0, 0.4, 0.2) if bool(event.get("combat", false)) else Fx.card_color(card)
	var impact: Callable = func() -> void: _impact(target, to_key, amount, color, event)
	if bool(event.get("combat", false)) and source is Vector3:
		var attacker: CardNode = table.card_node(source_id)
		if attacker:
			attacker.lunge(target)
		get_tree().create_timer(0.13 / speed).timeout.connect(impact)
	elif source is Vector3:
		Fx.bolt(self, source, target, color, 0.32 / speed, impact)
	else:
		impact.call()


func _impact(target: Vector3, to_key: Variant, amount: int, color: Color, event: Dictionary) -> void:
	if bool(event.get("prevented", false)):
		Fx.ring(self, target, Color(0.6, 0.85, 1.0), 1.2, 0.5, 0.2)
		Fx.float_text(self, target, "Prevenido", Color(0.7, 0.9, 1.0), 56)
		return
	var big: bool = amount >= 5 or bool(event.get("lethal", false))
	Fx.burst(self, target, color, 40 + amount * 8, 2.2 + amount * 0.15, 0.6)
	Fx.ring(self, target, color, 1.0 + amount * 0.12, 0.45)
	Fx.light(self, target, color, 3.0 + amount * 0.4, 4.0)
	var text: String = ("%d veneno" % amount) if bool(event.get("infect", false)) else "-%d" % amount
	Fx.float_text(self, target, text, Color(0.6, 1.0, 0.4) if bool(event.get("infect", false)) else Color(1.0, 0.35, 0.3), 84 if big else 72)
	if to_key is int:
		var node: CardNode = table.card_node(to_key)
		if node:
			node.flash_color(Color(1.0, 0.25, 0.2), 0.4)
	if big:
		Fx.shake(table.camera, 0.08 + minf(amount, 12) * 0.012)
	if bool(event.get("lethal", false)):
		Fx.focus(table.camera, target, 0.14, 1.1)


## Vida: o ganho sobe em verde no retrato; a perda sem dano (pagar vida, perder vida) sobe em vermelho.
func _life(event: Dictionary) -> void:
	var delta: int = int(event.get("delta", 0))
	var actor: int = int(event.get("actor", -1))
	if actor < 0 or delta == 0:
		return
	var pos: Variant = table.anchor("player:%d" % actor)
	if not pos is Vector3:
		return
	if delta > 0:
		Fx.burst(self, pos, Color(0.45, 1.0, 0.55), 26, 1.2, 0.7, 0.06)
		Fx.float_text(self, pos, "+%d" % delta, Color(0.5, 1.0, 0.6), 72)
	hud.pulse_life(actor, delta)


## Mágica conjurada: a carta na pilha acende na cor dela, com onda e luz; cópia, reforço e X ganham um selo.
func _spell(event: Dictionary) -> void:
	_at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Fx.card_color(card)
		Fx.ring(self, pos - Vector3(0, pos.y - 0.05, 0), color, 2.2, 0.6)
		Fx.burst(self, pos, color, 50, 2.0, 0.7)
		Fx.light(self, pos, color, 3.5, 5.0, 0.5)
		var tags: PackedStringArray = []
		if bool(event.get("copy", false)):
			tags.append("Cópia")
		if bool(event.get("kicked", false)):
			tags.append("Reforçada")
		if event.get("x") != null:
			tags.append("X = %d" % int(event["x"]))
		if not tags.is_empty():
			Fx.float_text(self, pos, " · ".join(tags), color.lightened(0.3), 54)
		var node: CardNode = table.card_node(int(card.get("id", -1)))
		if node:
			node.flash_color(color, 0.5))


## Habilidade ativada ou gatilho: a fonte pisca e solta um anel (dourado nos gatilhos).
func _ability(event: Dictionary) -> void:
	_at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Hud.GOLD if bool(event.get("trigger", false)) else Fx.card_color(card)
		Fx.ring(self, pos, color, 1.0, 0.4, 0.18)
		Fx.burst(self, pos, color, 20, 1.2, 0.45)
		var node: CardNode = table.card_node(_card_id(event))
		if node:
			node.flash_color(color, 0.35))


## Entrada no campo: poeira e onda na cor; a lendária desce com coluna de luz e um tremor leve.
func _entered(event: Dictionary) -> void:
	_at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Fx.card_color(card)
		var type_line: String = Txt.of(card.get("typeLine"))
		var legendary: bool = type_line.contains("Legendary") or type_line.contains("Lendári")
		Fx.ring(self, pos, color, 1.4 if legendary else 0.9, 0.5)
		Fx.burst(self, pos, color.lerp(Color.WHITE, 0.4), 50 if legendary else 22, 1.8 if legendary else 1.1, 0.6, 0.06)
		var node: CardNode = table.card_node(int(card.get("id", -1)))
		if node:
			node.flash_color(color, 0.45)
		if legendary:
			Fx.pillar(self, pos, Hud.GOLD)
			Fx.light(self, pos, Hud.GOLD, 5.0, 6.0, 0.8)
			Fx.focus(table.camera, pos, 0.1)
			Fx.shake(table.camera, 0.06))


## Saída do campo em cena: destruída queima, sacrificada queima em roxo, exilada é sugada por um portal.
func _left(event: Dictionary, node: CardNode) -> void:
	if node == null or not is_instance_valid(node):
		return
	var pos: Vector3 = node.global_position
	if Txt.of(event.get("to")) == "Exile":
		Fx.ring(self, pos, Color(0.75, 0.9, 1.0), 1.3, 0.7, 0.25)
		Fx.burst(self, pos, Color(0.7, 0.85, 1.0), 40, 1.4, 0.7)
		node.swirl_away(0.75 / speed)
	elif event.get("reason") == "sacrificed":
		Fx.burst(self, pos, Color(0.6, 0.25, 0.85), 40, 1.6, 0.9)
		node.burn_away(Color(0.7, 0.3, 1.0), 0.9 / speed)
	else:
		Fx.burst(self, pos, Color(1.0, 0.5, 0.15), 50, 1.8, 0.9)
		Fx.light(self, pos, Color(1.0, 0.5, 0.2), 2.5, 3.0, 0.8)
		node.burn_away(Color(1.0, 0.45, 0.12), 0.9 / speed)


## Marcadores: o número sobe na carta (ou no jogador, no veneno e afins) e a carta treme.
func _counters(event: Dictionary) -> void:
	var delta: int = int(event.get("delta", 1))
	var kind: String = Txt.of(event.get("counter"))
	var text: String = {"P1P1": "+%d/+%d" % [delta, delta], "M1M1": "-%d/-%d" % [delta, delta], "LOYALTY": "+%d lealdade" % delta, "POISON": "+%d veneno" % delta}.get(kind, "+%d" % delta)
	var color: Color = Color(1.0, 0.4, 0.35) if kind in ["M1M1", "POISON"] else Color(0.55, 1.0, 0.6)
	var players: Array = (event.get("targets", {}) as Dictionary).get("players", []) if event.get("targets") is Dictionary else []
	var key: Variant = "player:%d" % int(players[0]) if not players.is_empty() else _card_id(event)
	var pos: Variant = table.anchor(key)
	if pos is Vector3:
		Fx.float_text(self, pos, text, color, 60, 0.9)
		var node: CardNode = table.card_node(key) if key is int else null
		if node:
			node.jolt()


## Roda `play(posição, carta)` na carta do evento (na pilha, no campo), se ela está à mostra.
func _at_card(event: Dictionary, play: Callable) -> void:
	var id: int = _card_id(event)
	var pos: Variant = table.anchor(id) if id >= 0 else null
	if event.get("stackId") != null and not pos is Vector3:
		pos = table.anchor("stack:%d" % int(event["stackId"]))
	if pos is Vector3:
		var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else table.card_data(id)
		play.call(pos, card)


## Fim da partida: fogos dourados na vitória, brasas escuras na derrota.
func game_over(won: bool) -> void:
	var color: Color = Hud.GOLD if won else Color(0.55, 0.3, 0.7)
	for i: int in 6 if won else 3:
		var pos := Vector3(randf_range(-4.5, 4.5), randf_range(1.0, 2.5), randf_range(-2.5, 1.5))
		get_tree().create_timer(i * 0.25).timeout.connect(func() -> void:
			Fx.burst(self, pos, color if i % 2 == 0 else color.lightened(0.4), 90, 3.5, 1.2, 0.08)
			Fx.light(self, pos, color, 4.0, 6.0, 0.8))
	if sounds:
		sounds.play("victory" if won else "defeat")
	finale.emit(won)
