# Diretor dos efeitos: lê os eventos novos de cada estado (dano, vida, mágica, entrada, saída, combate, marcadores, turno)
# e o que mudou sem evento (transformar, monarca, dia/noite), e toca um efeito por evento, em sequência curta (o efeito de
# cada um fica em EventFx). A carta destruída ou exilada fica com ele para sair em cena.
class_name FxDirector
extends Node3D

## A partida acabou (vitória ou derrota): a mesa fica com a cena final.
signal finale(won: bool)

const DURATION := {
	"damage": 0.26, "spell-cast": 0.32, "ability-activated": 0.22, "entered": 0.24, "left": 0.3,
	"attackers": 0.3, "blockers": 0.24, "countered": 0.3, "resolved": 0.12, "counters": 0.1, "survived": 0.3,
	"coin": 0.6, "die": 0.6, "starting-roll": 1.2, "turn": 0.1, "draw": 0.05, "attached": 0.3, "control-changed": 0.4,
	"land-played": 0.08,
}
## Momentos com cena mais longa: o limpa-campo com a onda, o comandante saindo da zona de comando e o Game Changer.
const SWEEP_TIME := 1.3
const COMMANDER_TIME := 1.1
const GAME_CHANGER_TIME := 1.6
## Onde caem o dado e a moeda: no meio do tampo.
const TABLE_CENTER := Vector3(0, 0, 0.3)
## Tempo máximo para os efeitos de um estado: com muitos eventos (limpa-campo), o ritmo encurta.
const MAX_BATCH := 2.4

var table: TableView
var hud: Hud
var sounds: Sounds
## Clima da mesa: a luz puxa para a cor das mágicas conjuradas e volta devagar.
var mood: TableMood
## Escala de velocidade dos efeitos (o laboratório usa câmera lenta).
var speed: float = 1.0
var _last_seq: int = -1
## Momentos grandes (primeiro sangue, eliminação dupla/tripla, golpe de comandante, ultimate): detectados a cada estado.
var _moments := Moments.new()
var _you: int = 0
var _names: Dictionary = {}
var _slow_frames: float = 0.0
## O que muda sem evento (transformar, monarca, mana dos terrenos…), os limpa-campos e os bichos.
var _watch := StateWatch.new()
var _sweeps := BoardSweep.new()
var _critters := Critters.new()
var _commander_rules: bool = false
## Do estado em andamento: seq do spell-cast → os terrenos que pagaram; seq das entradas do comandante; seq do
## control-changed → onde a carta estava antes.
var _mana: Dictionary = {}
var _commander_entries: Dictionary = {}
var _control_from: Dictionary = {}


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
	_commander_rules = GameChangers.commander_rules(state)
	for p: Variant in state.get("players", []):
		_names[int((p as Dictionary)["id"])] = Txt.of((p as Dictionary).get("name"))
	var fresh: Array = []
	for raw: Variant in state.get("events", []):
		var event: Dictionary = raw
		if int(event.get("seq", -1)) > _last_seq:
			fresh.append(event)
			_last_seq = int(event.get("seq", -1))
	fresh = _group_mills(fresh)
	# O que mudou sem evento, olhando a mesa como ela está agora (antes do estado novo).
	var now: float = Time.get_ticks_msec() / 1000.0
	var watch: Dictionary = _watch.observe(state, fresh, func(id: int) -> Dictionary:
		return table.card_data(id) if table.zone_of(id) == "battlefield" else {}, now)
	_mana = watch["mana"]
	_commander_entries = watch["commander_entries"]
	_schedule_changes(watch)
	# Os momentos olham o estado inteiro (vida, eliminados), mesmo sem eventos novos.
	var moments: Array = _moments.observe(state)
	if fresh.is_empty() and moments.is_empty():
		return
	# Quem vai para o cemitério ou o exílio sai em cena: o nó fica com o diretor até o efeito dele.
	var leaving: Dictionary = {}
	for event: Dictionary in fresh:
		var id: int = card_id(event)
		var dies: bool = event.get("type") == "left" and Txt.of(event.get("to")) in ["Graveyard", "Exile"] and table.zone_of(id) == "battlefield"
		var countered: bool = event.get("type") == "countered" and table.zone_of(id) == "stack"
		if id >= 0 and (dies or countered):
			var node: CardNode = table.detach(id)
			if node:
				leaving[id] = node
		if event.get("type") == "control-changed":
			_control_from[int(event.get("seq", -1))] = table.anchor(id)
	# Limpa-campo: as saídas da mesma mágica viram uma onda só, no lugar do primeiro evento do grupo.
	var sweep_first: Dictionary = {}
	var sweep_member: Dictionary = {}
	for raw: Variant in _sweeps.observe(fresh, func(id: int) -> bool: return table.zone_of(id) == "battlefield" or leaving.has(id)):
		var group: Dictionary = raw
		var members: Array = group["events"]
		sweep_first[int((members[0] as Dictionary).get("seq", -1))] = group
		for member: Variant in members:
			sweep_member[int((member as Dictionary).get("seq", -1))] = true
	var total: float = 0.0
	for event: Dictionary in fresh:
		total += _event_time(event, sweep_first, sweep_member)
	var pace: float = minf(1.0, MAX_BATCH / maxf(total, 0.001)) / speed
	var at: float = 0.05
	## seq do evento → quando ele toca, para o momento dele tocar junto.
	var times: Dictionary = {}
	for event: Dictionary in fresh:
		var played: Dictionary = event
		var seq: int = int(event.get("seq", -1))
		times[seq] = at
		if sweep_first.has(seq):
			var group: Dictionary = sweep_first[seq]
			var refs: Dictionary = {}
			for member: Variant in group["events"]:
				refs[int((member as Dictionary).get("seq", -1))] = weakref(leaving.get(card_id(member as Dictionary)))
			get_tree().create_timer(at).timeout.connect(func() -> void: EventFx.sweep(self, group, refs))
		elif not sweep_member.has(seq):
			# Referência fraca: a carta pode já ter sumido quando o temporizador dispara.
			var ref: WeakRef = weakref(leaving.get(card_id(event)))
			get_tree().create_timer(at).timeout.connect(func() -> void: _play(played, ref.get_ref() as CardNode))
		at += _event_time(event, sweep_first, sweep_member) * pace
	# Cada momento junto do evento que o causou; a eliminação múltipla depois do último golpe.
	for raw: Variant in moments:
		var moment: Dictionary = raw
		var when: float = at if moment.get("kind") == "multi-kill" else float(times.get(int(moment.get("seq", -1)), at)) + 0.12 / speed
		get_tree().create_timer(when).timeout.connect(func() -> void: Moments.play(moment, self, table))
	# Garantia: uma carta separada que não saiu em cena (evento sem efeito) se apaga mesmo assim.
	for id: Variant in leaving:
		var ref: WeakRef = weakref(leaving[id])
		get_tree().create_timer(at + 2.0).timeout.connect(func() -> void:
			var node: CardNode = ref.get_ref() as CardNode
			if node and not node.is_queued_for_deletion():
				node.vanish())


## Quanto o evento ocupa na sequência, contando o limpa-campo (o primeiro do grupo leva a onda, os outros não ocupam).
func _event_time(event: Dictionary, sweep_first: Dictionary, sweep_member: Dictionary) -> float:
	var seq: int = int(event.get("seq", -1))
	if sweep_first.has(seq):
		return SWEEP_TIME if bool((sweep_first[seq] as Dictionary).get("wave", true)) else 0.5
	if sweep_member.has(seq):
		return 0.0
	if _commander_entries.has(seq):
		return COMMANDER_TIME
	if GameChangers.play(event, _commander_rules):
		return GAME_CHANGER_TIME
	return _duration(event)


## O que mudou sem evento: a carta que transformou gira e troca de face (a imagem antiga ainda está na carta), as
## medalhas do monarca, da dianteira e do dia/noite, e a mesa rangendo com o campo lotado.
func _schedule_changes(watch: Dictionary) -> void:
	for raw: Variant in watch["transforms"]:
		var change: Dictionary = raw
		var node: CardNode = table.card_node(int(change["id"]))
		var material: ShaderMaterial = CardDressing.material_of(node)
		var old_tex: Variant = material.get_shader_parameter("front_tex") if material else null
		var ref: WeakRef = weakref(node)
		var face_up: bool = bool(change["face_up"])
		get_tree().create_timer(0.05).timeout.connect(func() -> void:
			PermanentFx.flip(self, ref.get_ref() as CardNode, old_tex as Texture2D, face_up, speed))
	var monarch: Variant = watch["monarch"]
	if monarch != null and int(monarch) >= 0:
		_medal(int(monarch), false)
	var initiative: Variant = watch["initiative"]
	if initiative != null and int(initiative) >= 0:
		_medal(int(initiative), true)
	if Txt.of(watch["day"]) != "":
		var day: bool = watch["day"] == "day"
		get_tree().create_timer(0.1).timeout.connect(func() -> void: Medallions.day_night(self, table.camera, day, mood, speed))
	if int(watch["creak"]) >= 0:
		var side: Vector3 = table.seat_center(int(watch["creak"]))
		get_tree().create_timer(0.2).timeout.connect(func() -> void:
			Critters.creak(self, table.camera, side)
			if sounds:
				sounds.play("creak", side))


## A medalha do monarca (ou da dianteira) indo para o jogador.
func _medal(player: int, initiative: bool) -> void:
	var mine: bool = player == _you
	var name: String = Txt.of(_names.get(player, "Oponente"))
	var subtitle: String
	if initiative:
		subtitle = "Você tem a dianteira" if mine else "%s tem a dianteira" % name
	else:
		subtitle = "Você é o monarca" if mine else "%s é o monarca" % name
	get_tree().create_timer(0.15).timeout.connect(func() -> void:
		Medallions.crown_holder(self, table.camera, table.anchor("player:%d" % player), "Dianteira" if initiative else "Monarca", subtitle, initiative, speed))


## Quanto o evento ocupa na sequência: as cartas voando têm a duração delas, o resto a da tabela.
func _duration(event: Dictionary) -> float:
	match Txt.of(event.get("type")):
		"cascade":
			return CardFlights.cascade_duration((event.get("revealed", []) as Array).size(), int(event.get("hit", -1)) >= 0) * 0.6
		"mill":
			return CardFlights.mill_duration((event.get("milled", []) as Array).size()) * 0.6
		"scry":
			return CardFlights.scry_duration(int(event.get("top", 0)), int(event.get("bottom", 0))) * 0.6
		"draw":
			return CardFlights.TUTOR_TIME * 0.6 if bool(event.get("searched", false)) else float(DURATION["draw"])
	return float(DURATION.get(Txt.of(event.get("type")), 0.0))


## Junta os `mill` seguidos do mesmo jogador, da mesma origem e do mesmo jeito (moer ou vigilância) num evento só, com
## as cartas em `milled` (como a mesa do navegador, em presentationTimeline.ts).
static func _group_mills(events: Array) -> Array:
	var out: Array = []
	for raw: Variant in events:
		var event: Dictionary = raw
		if event.get("type") != "mill":
			out.append(event)
			continue
		var card: Variant = event.get("card")
		var last: Dictionary = out[out.size() - 1] if not out.is_empty() else {}
		var same: bool = last.get("type") == "mill" and last.get("actor") == event.get("actor") \
			and Txt.of(last.get("sourceName")) == Txt.of(event.get("sourceName")) and bool(last.get("surveil", false)) == bool(event.get("surveil", false))
		if same:
			if card is Dictionary:
				(last["milled"] as Array).append(card)
			continue
		var group: Dictionary = event.duplicate()
		group["milled"] = [card] if card is Dictionary else []
		out.append(group)
	return out


## O id da carta do evento (a carta, a fonte, ou a primeira de `cards`), ou -1.
static func card_id(event: Dictionary) -> int:
	if event.get("card") is Dictionary and (event["card"] as Dictionary).has("id"):
		return int((event["card"] as Dictionary)["id"])
	if event.get("sourceId") != null:
		return int(event["sourceId"])
	var cards: Array = event.get("cards", []) if event.get("cards") is Array else []
	return int(cards[0]) if not cards.is_empty() else -1


func _play(event: Dictionary, leaving: CardNode) -> void:
	var seq: int = int(event.get("seq", -1))
	if sounds:
		var where: Variant = table.anchor(card_id(event)) if card_id(event) >= 0 else null
		sounds.play(Sounds.cue_for(event, _you), where if where is Vector3 else Vector3.ZERO)
		# A criatura entrando também traz o som do tipo dela (o urso rosna, o lobo uiva…).
		if Txt.of(event.get("type")) == "entered":
			CreatureSounds.play_cue(sounds, CreatureSounds.cue_for_event(event), where if where is Vector3 else Vector3.ZERO)
	match Txt.of(event.get("type")):
		"damage":
			EventFx.damage(self, event)
		"life-changed":
			EventFx.life(self, event)
		"spell-cast":
			EventFx.spell(self, event, _mana.get(seq, []), GameChangers.play(event, _commander_rules))
		"land-played":
			if GameChangers.play(event, _commander_rules):
				at_card(event, func(pos: Vector3, card: Dictionary) -> void:
					ArrivalFx.game_changer(self, table, pos, table.catalog.label(Txt.of(card.get("name"))), speed))
		"ability-activated":
			EventFx.ability(self, event)
		"resolved":
			EventFx.resolved(self, event)
		"countered":
			if leaving and is_instance_valid(leaving):
				var pos: Vector3 = leaving.global_position
				Fx.burst(self, pos, Color(0.7, 0.75, 0.85), 60, 3.0, 0.6, 0.15)
				Fx.ring(self, pos, Color(0.7, 0.8, 1.0), 1.2, 0.5, 0.2)
				Fx.float_text(self, pos, "Anulada", Color(0.75, 0.85, 1.0), 60)
				leaving.burn_away(Color(0.6, 0.75, 1.0), 0.7 / speed)
		"entered":
			EventFx.entered(self, event, _commander_entries.has(seq))
			var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else {}
			var critter: String = _critters.on_entered(card, Time.get_ticks_msec() / 1000.0)
			if critter != "":
				Critters.spawn(self, critter, speed)
		"left":
			EventFx.left(self, event, leaving)
		"attackers":
			for id: Variant in event.get("cards", []):
				var node: CardNode = table.card_node(int(id))
				if node:
					node.flash_color(Color(1.0, 0.3, 0.2), 0.5)
					Fx.burst(self, node.global_position, Color(1.0, 0.35, 0.2), 18, 1.4, 0.5)
					Fx.ring(self, node.global_position, Color(1.0, 0.35, 0.2), 0.8, 0.4, 0.2)
			if not (event.get("cards", []) as Array).is_empty():
				hud.banner("Ataque!", Color(1.0, 0.45, 0.3))
		"blockers":
			for id: Variant in event.get("cards", []):
				var node: CardNode = table.card_node(int(id))
				if node:
					node.flash_color(Color(0.35, 0.65, 1.0), 0.5)
					Fx.ring(self, node.global_position, Color(0.4, 0.7, 1.0), 0.9, 0.4)
		"counters":
			EventFx.counters(self, event)
		"survived":
			EventFx.survived(self, event)
		"attached":
			EventFx.attached(self, event)
		"control-changed":
			EventFx.control(self, event, _control_from.get(seq))
			_control_from.erase(seq)
		"turn":
			var mine: bool = int(event.get("actor", -1)) == _you
			var title: String = "Seu turno" if mine else "Turno de %s" % _names.get(int(event.get("actor", -1)), "Oponente")
			if bool(event.get("extra", false)):
				title += " extra"
			hud.banner(title, Hud.GOLD if mine else Color(0.75, 0.85, 1.0))
			# De vez em quando, um bicho atravessa a mesa na virada do turno.
			var critter: String = _critters.on_turn(Time.get_ticks_msec() / 1000.0, randf())
			if critter != "":
				get_tree().create_timer(1.2).timeout.connect(func() -> void: Critters.spawn(self, critter, speed))
		"draw":
			var actor: int = int(event.get("actor", _you))
			if bool(event.get("searched", false)):
				# Busca no grimório (tutor): a carta sai brilhando do grimório e vai para a mão.
				CardFlights.tutor(self, table.library_position(actor), table.zone_position(actor, "hand"), table.sleeve_of(actor))
			else:
				Fx.burst(self, table.library_position(actor) + Vector3(0, 0.3, 0), Color(0.8, 0.9, 1.0), 10, 0.8, 0.4, 0.09)
		"cascade":
			var digger: int = int(event.get("actor", _you))
			CardFlights.cascade(self, table.catalog, table.library_position(digger), table.zone_position(digger, "exile"),
				event.get("revealed", []), int(event.get("hit", -1)), Txt.of(event.get("dig")) == "discover", table.sleeve_of(digger))
		"mill":
			var miller: int = int(event.get("actor", _you))
			CardFlights.mill(self, table.catalog, table.library_position(miller), table.zone_position(miller, "graveyard"),
				event.get("milled", []), bool(event.get("surveil", false)), table.sleeve_of(miller))
		"scry":
			var seer: int = int(event.get("actor", _you))
			CardFlights.scry(self, table.library_position(seer), int(event.get("top", 0)), int(event.get("bottom", 0)), table.sleeve_of(seer))
		"shuffle":
			var pile: CardNode = table.card_node("library:%d" % int(event.get("actor", _you)))
			if pile:
				pile.jolt(0.12)
		"coin":
			Dice3D.coin(self, TABLE_CENTER, bool(event.get("heads", false)), 1.3 / speed)
		"die":
			Dice3D.roll(self, TABLE_CENTER, int(event.get("sides", 6)), int(event.get("result", 1)), 1.4 / speed)
		"starting-roll":
			# O d6 de quem começa: um dado na frente de cada jogador.
			var spots: Dictionary = {}
			for rolls: Variant in event.get("rolls", []):
				for entry: Variant in rolls:
					var player: int = int((entry as Dictionary).get("player", -1))
					spots[player] = table.seat_center(player)
			Dice3D.starting_roll(self, spots, event.get("rolls", []))


## Roda `play(posição, carta)` na carta do evento (na pilha, no campo), se ela está à mostra.
func at_card(event: Dictionary, play: Callable) -> void:
	var id: int = card_id(event)
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
