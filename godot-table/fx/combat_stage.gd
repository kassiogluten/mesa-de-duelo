# O palco do combate (filho do FxDirector): lembra quem ataca quem e quem bloqueia quem, junta os golpes de cada troca
# numa coreografia só (CombatExchange), ergue o escudo de energia do bloqueador com a linha estalando até o atacante
# (CombatLinks), faz o atacante arder, liga o clima de combate na mesa, aproxima a câmera, avisa nas bordas da tela
# quando atacam você e faz a criatura que morre em combate se despedaçar (CombatShatter) depois do golpe que a matou.
class_name CombatStage
extends Node3D

const ATTACK := Color(1.0, 0.36, 0.14)
const BLOCK := Color(0.4, 0.7, 1.0)
## Por quanto tempo uma carta atingida em combate ainda "morre do golpe" (despedaça em vez de queimar).
const STRUCK_MEMORY := 3.0
## A morte que espera o golpe que ainda não caiu: no máximo isto.
const DEATH_WAIT := 2.2
## O fim do combate espera os golpes na fila e mais isto.
const END_AFTER := 0.7
## O pulso do retrato dura ~0,35 s: o seguinte espera ele terminar.
const PULSE_GAP := 0.4

var director: FxDirector
var camera_rig := CombatCamera.new()
var screen := CombatScreen.new()
## Os escudos dos bloqueadores e as linhas até os atacantes.
var links := CombatLinks.new()
var you: int = 0
var _in_combat: bool = false
var _ending: bool = false
var _clock: float = 0.0
var _last_blow: float = -10.0
## Do último estado com combate: bloqueador → atacante, atacante → bloqueadores, atacante → jogador atacado (-1: uma permanente).
var _attacker_of: Dictionary = {}
var _blockers_of: Dictionary = {}
var _defender_of: Dictionary = {}
## As trocas planejadas: seq do primeiro golpe → troca; seq dos outros golpes dela → seq do primeiro.
var _groups: Dictionary = {}
var _members: Dictionary = {}
## Cartas que saem da mesa mas ainda estão em cena (o diretor as separou): id → WeakRef.
var _nodes: Dictionary = {}
## Golpes ainda por cair em cada carta, as mortes esperando por eles e as cartas atingidas há pouco (de onde, que cor).
var _pending: Dictionary = {}
var _deaths: Dictionary = {}
var _struck: Dictionary = {}
## As mudanças de vida que o combate já mostra (o golpe no retrato, as luzes do vínculo com a vida chegando): seq.
var _life_absorbed: Dictionary = {}
## As fagulhas de cada atacante enquanto o ataque dura: id → GPUParticles3D (seguem a carta em _process).
var _smolder: Dictionary = {}
## Quando o retrato de cada jogador pulsou pela última vez (relógio do palco).
var _pulsed_at: Dictionary = {}


func _ready() -> void:
	add_child(camera_rig)
	add_child(screen)
	links.stage = self
	add_child(links)
	if Fx.quality > 0:
		screen.warm.call_deferred()


func _exit_tree() -> void:
	CombatCamera.release_all()
	if director and director.mood:
		director.mood.set_combat(false)


## Cada estado (antes de a mesa aplicá-lo): quem ataca e bloqueia agora; com o combate vazio, o fim espera a fila.
func observe(state: Dictionary) -> void:
	you = int(state.get("you", 0))
	if camera_rig.camera == null and director and director.table:
		camera_rig.camera = director.table.camera
	var combat: Array = state.get("combat", []) if state.get("combat") is Array else []
	if combat.is_empty():
		if _in_combat:
			_ending = true
		return
	_ending = false
	_attacker_of = {}
	_blockers_of = {}
	_defender_of = {}
	for raw: Variant in combat:
		var entry: Dictionary = raw
		var attacker: int = int(entry.get("attacker", -1))
		var kind: String = Txt.of(entry.get("defenderKind", "player"))
		_defender_of[attacker] = int(entry["defender"]) if entry.get("defender") != null and kind == "player" else -1
		var blockers: Array = []
		for b: Variant in entry.get("blockers", []):
			blockers.append(int(b))
			_attacker_of[int(b)] = attacker
		_blockers_of[attacker] = blockers
	if not _in_combat:
		_begin()
	links.keep_only(_attacker_of)


## Junta os golpes de combate dos eventos novos em trocas (pelo atacante e pela etapa: iniciativa e normal em ondas
## separadas). `leaving`: as cartas que o diretor separou para saírem em cena.
func plan(fresh: Array, leaving: Dictionary) -> void:
	for id: Variant in leaving:
		_nodes[int(id)] = weakref(leaving[id])
	var by_key: Dictionary = {}
	for raw: Variant in fresh:
		var event: Dictionary = raw
		if Txt.of(event.get("type")) != "damage" or not bool(event.get("combat", false)):
			continue
		var blow: Dictionary = CombatExchange.blow_of(event)
		var source: int = blow["source"]
		var attacker: int = int(_attacker_of.get(source, source))
		var key: String = "%d|%s" % [attacker, Txt.of(event.get("step"))]
		var seq: int = int(event.get("seq", -1))
		if by_key.has(key):
			var lead: int = by_key[key]
			((_groups[lead] as Dictionary)["blows"] as Array).append(blow)
			_members[seq] = lead
		else:
			by_key[key] = seq
			_groups[seq] = {"attacker": attacker, "blows": [blow]}
		if int(blow["target"]) >= 0:
			_pending[int(blow["target"])] = int(_pending.get(int(blow["target"]), 0)) + 1
	_absorb_life(fresh)


## As mudanças de vida que vêm do combate no mesmo estado ficam com ele: a perda pulsa o retrato no golpe, e o ganho do
## vínculo com a vida aparece quando as luzes verdes chegam ao retrato (e não antes, solto).
func _absorb_life(fresh: Array) -> void:
	var hit: Dictionary = {}
	var gain_blow: Dictionary = {}
	for lead: Variant in _groups:
		for raw: Variant in (_groups[lead] as Dictionary)["blows"]:
			var blow: Dictionary = raw
			var event: Dictionary = blow["event"]
			if bool(event.get("prevented", false)) or int(blow["amount"]) <= 0:
				continue
			if int(blow["player"]) >= 0 and not bool(event.get("infect", false)):
				hit[int(blow["player"])] = true
			if bool(event.get("lifelink", false)):
				var controller: int = _controller_of(blow)
				if controller >= 0 and not gain_blow.has(controller):
					gain_blow[controller] = blow
	for raw: Variant in fresh:
		var event: Dictionary = raw
		if Txt.of(event.get("type")) != "life-changed":
			continue
		var actor: int = int(event.get("actor", -1))
		var delta: int = int(event.get("delta", 0))
		if delta < 0 and hit.has(actor):
			_life_absorbed[int(event.get("seq", -1))] = true
		elif delta > 0 and gain_blow.has(actor):
			_life_absorbed[int(event.get("seq", -1))] = true
			var blow: Dictionary = gain_blow[actor]
			blow["gain"] = int(blow.get("gain", 0)) + delta


## Quem controla a fonte do golpe (para onde vão as luzes do vínculo com a vida), ou -1.
func _controller_of(blow: Dictionary) -> int:
	var event: Dictionary = blow["event"]
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else {}
	if card.is_empty() and director and director.table:
		card = director.table.card_data(int(blow["source"]))
	return int(card.get("controller", -1))


## Quanto o evento ocupa no ritmo do diretor: a troca toda no primeiro golpe, nada nos outros; -1 se não é do combate.
func event_time(seq: int) -> float:
	if _groups.has(seq):
		return CombatExchange.duration(_groups[seq])
	if _members.has(seq) or _life_absorbed.has(seq):
		return 0.0
	return -1.0


## O golpe faz parte de uma troca que outro evento toca, ou a mudança de vida é mostrada pelo combate (o diretor
## pergunta uma vez por evento, ao agendar: a mudança de vida sai da lista aqui).
func absorbed(seq: int) -> bool:
	if _life_absorbed.has(seq):
		_life_absorbed.erase(seq)
		return true
	return _members.has(seq)


## Quanto depois do começo da troca o golpe acerta (o momento grande do golpe toca junto do impacto).
func lead_in(seq: int) -> float:
	var lead: int = int(_members.get(seq, seq))
	return CombatExchange.lead_in(_groups[lead]) if _groups.has(lead) else 0.0


## Toca o evento se ele é do combate (declarar atacantes e bloqueadores, golpe, morte de quem levou golpe); false deixa
## o evento para o EventFx.
func handles(event: Dictionary, leaving: CardNode) -> bool:
	match Txt.of(event.get("type")):
		"attackers":
			_declare_attackers(event)
			return true
		"blockers":
			_declare_blockers(event)
			return true
		"damage":
			if not bool(event.get("combat", false)):
				return false
			var seq: int = int(event.get("seq", -1))
			if _members.has(seq):
				_members.erase(seq)
				return true
			var group: Dictionary = _groups.get(seq, {"blows": [CombatExchange.blow_of(event)]})
			_groups.erase(seq)
			for member: Variant in _members.keys():
				if int(_members[member]) == seq:
					_members.erase(member)
			CombatExchange.play(self, group)
			_last_blow = _clock
			return true
		"left":
			return _claim_death(event, leaving)
	return false


## A carta (na mesa ou saindo dela em cena), ou null.
func node_of(id: int) -> CardNode:
	if id < 0 or director == null:
		return null
	var node: CardNode = director.table.card_node(id)
	if node:
		return node
	var ref: WeakRef = _nodes.get(id)
	var held: CardNode = ref.get_ref() as CardNode if ref else null
	return held if held and is_instance_valid(held) and not held.is_queued_for_deletion() else null


## Onde a carta está agora (o desenho dela, que avança no golpe), ou null.
func position_of(id: int) -> Variant:
	var node: CardNode = node_of(id)
	if node == null or not node.is_inside_tree():
		return null
	return CardDressing.visual_of(node).global_position + Vector3(0, 0.05, 0)


## Onde está o primeiro bloqueador do atacante (o atropelar passa por ele), ou null.
func blocker_spot(attacker: int) -> Variant:
	for blocker: Variant in _blockers_of.get(attacker, []):
		var at: Variant = position_of(int(blocker))
		if at is Vector3:
			return at
	return null


## A carta levou um golpe de combate agora (vindo de `from`): se morrer logo, despedaça para longe dele.
func struck(id: int, from: Vector3, color: Color) -> void:
	_struck[id] = {"at": _clock, "from": from, "color": color}


## Um golpe caiu na carta `id` (-1: num jogador): a morte que esperava por ele acontece agora.
func blow_landed(id: int) -> void:
	_last_blow = _clock
	if id < 0 or not _pending.has(id):
		return
	_pending[id] = int(_pending[id]) - 1
	if int(_pending[id]) > 0:
		return
	_pending.erase(id)
	if _deaths.has(id):
		var death: Dictionary = _deaths[id]
		_deaths.erase(id)
		var ref: WeakRef = death["ref"]
		MomentPieces.after(self, 0.08 / director.speed, func() -> void:
			var node: CardNode = ref.get_ref() as CardNode
			if node:
				_shatter(id, node))


## O retrato do jogador pulsa (perda ou ganho de vida no combate), no máximo uma vez a cada PULSE_GAP: dois pulsos
## por cima um do outro deixariam o retrato com a cor do meio.
func pulse_life(player: int, delta: int) -> void:
	if director == null or director.hud == null or player < 0:
		return
	if _clock - float(_pulsed_at.get(player, -10.0)) < PULSE_GAP:
		return
	_pulsed_at[player] = _clock
	director.hud.pulse_life(player, delta)


## O golpe acertou um bloqueador (ou o atacante dele): o escudo dele acende e se parte, e a linha se apaga.
func shield_hit(id: int, at: Vector3) -> void:
	links.hit(id, at)


# — Atacar e bloquear —

func _begin() -> void:
	_in_combat = true
	_ending = false
	if director and director.mood:
		director.mood.set_combat(true)


func _finish() -> void:
	_in_combat = false
	_ending = false
	if director and director.mood:
		director.mood.set_combat(false)
	for id: Variant in _smolder.keys():
		_quench(int(id))
	links.spend_all()
	_attacker_of = {}
	_blockers_of = {}
	_defender_of = {}


func _declare_attackers(event: Dictionary) -> void:
	var ids: Array = event.get("cards", [])
	if ids.is_empty():
		return
	_begin()
	var d: FxDirector = director
	var focus: Variant = null
	var at_you: bool = false
	var first: Vector3 = Vector3.ZERO
	for i: int in ids.size():
		var id: int = int(ids[i])
		var node: CardNode = d.table.card_node(id)
		var defender: int = int(_defender_of.get(id, -1))
		if defender < 0:
			var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
			var players: Array = targets.get("players", [])
			defender = int(players[0]) if not players.is_empty() else -1
		at_you = at_you or (defender == you and defender >= 0)
		if focus == null and defender >= 0:
			focus = d.table.anchor("player:%d" % defender)
		if node == null:
			continue
		var base: Vector3 = node.global_position
		if i == 0:
			first = base
		# A arrancada: poeira na base, o contorno aceso e o rastro de calor seguindo a carta.
		CardGlow.pulse(node, ATTACK, 0.04, d.speed)
		TouchFx.dust(d, base, Color(1.0, 0.45, 0.25), 0.8)
		CombatPieces.smoke(d, base + Vector3(0, 0.03, 0), Color(0.3, 0.24, 0.2, 0.45), 10, 1.0, 0.25, 0.8, 0.26)
		CombatPieces.heat_trail(d, node, ATTACK, (0.75 + i * FieldPlacement.ATTACK_STAGGER) / d.speed, 0.5, 0.32)
		# Enquanto ataca, a criatura arde (as fagulhas sobem das bordas dela até o fim do combate).
		if Fx.quality > 0 and not _smolder.has(id):
			_smolder[id] = CombatPieces.embers(d, base)
	if d.hud:
		# A faixa entra depois da arrancada (por cima dela, esconderia as cartas avançando).
		var hud: Hud = d.hud
		MomentPieces.after(self, 0.3 / d.speed, func() -> void: hud.banner("Ataque!", Color(1.0, 0.45, 0.3)))
	if d.sounds:
		d.sounds.play("attack", first)
		# O tambor: duas batidas graves, como um coração acelerando.
		d.sounds.play("impact", first, 0.5, 0.55)
		var sounds: Sounds = d.sounds
		MomentPieces.after(self, 0.2 / d.speed, func() -> void: sounds.play("impact", first, 0.46, 0.4))
	if focus is Vector3:
		camera_rig.push(focus, 0.8, 0.9)
	if at_you:
		screen.threat()


func _declare_blockers(event: Dictionary) -> void:
	var d: FxDirector = director
	var any: bool = false
	for raw: Variant in event.get("cards", []):
		var id: int = int(raw)
		var node: CardNode = d.table.card_node(id)
		if node == null:
			continue
		any = true
		var color: Color = _shield_color(d.table.card_data(id))
		CardGlow.pulse(node, color, 0.05, d.speed)
		node.jolt(0.025)
		var attacker: int = int(_attacker_of.get(id, -1))
		if attacker >= 0:
			links.link(id, attacker, color)
	if any and d.sounds:
		var at: Variant = d.table.anchor(int((event.get("cards", []) as Array)[0]))
		d.sounds.play("block", at if at is Vector3 else Vector3.ZERO)
		d.sounds.play("shield", at if at is Vector3 else Vector3.ZERO, 1.15, 0.6)


## O escudo na cor do bloqueador; nas incolores (e terrenos animados), o azul do bloqueio.
static func _shield_color(card: Dictionary) -> Color:
	var color: Color = Fx.card_color(card)
	if color.is_equal_approx(Color(0.75, 0.82, 0.95)):
		return BLOCK
	return color.lerp(BLOCK, 0.15)


func _process(delta: float) -> void:
	_clock += delta
	if _ending and _groups.is_empty() and _clock - _last_blow > END_AFTER:
		_finish()
	for id: Variant in _deaths.keys():
		var death: Dictionary = _deaths[id]
		if _clock - float(death["since"]) > DEATH_WAIT:
			_deaths.erase(id)
			_pending.erase(id)
			var node: CardNode = (death["ref"] as WeakRef).get_ref() as CardNode
			if node:
				_shatter(int(id), node)
	for id: Variant in _nodes.keys():
		if (_nodes[id] as WeakRef).get_ref() == null:
			_nodes.erase(id)
	for id: Variant in _smolder.keys():
		# As fagulhas seguem o desenho da carta (que avança no golpe); a carta que saiu do ataque apaga.
		var at: Variant = position_of(int(id)) if _defender_of.has(id) or _ending else null
		if at is Vector3:
			(_smolder[id] as GPUParticles3D).global_position = at as Vector3
		else:
			_quench(int(id))


## As fagulhas do atacante param de nascer; as que estão no ar terminam o voo.
func _quench(id: int) -> void:
	var sparks: GPUParticles3D = _smolder.get(id)
	_smolder.erase(id)
	if sparks == null or not is_instance_valid(sparks):
		return
	sparks.emitting = false
	get_tree().create_timer(sparks.lifetime + 0.2).timeout.connect(sparks.queue_free)


# — Mortes —

## A criatura que sai para o cemitério logo depois de levar um golpe de combate (ou com golpe ainda por cair) se
## despedaça; as outras saídas ficam com o EventFx.
func _claim_death(event: Dictionary, node: CardNode) -> bool:
	if Txt.of(event.get("to")) != "Graveyard" or Txt.of(event.get("reason")) == "sacrificed":
		return false
	if node == null or not is_instance_valid(node) or node.is_queued_for_deletion():
		return false
	var id: int = FxDirector.card_id(event)
	var recent: bool = _struck.has(id) and _clock - float((_struck[id] as Dictionary)["at"]) < STRUCK_MEMORY
	var waiting: bool = int(_pending.get(id, 0)) > 0
	if not recent and not waiting:
		return false
	_nodes[id] = weakref(node)
	if waiting:
		_deaths[id] = {"ref": weakref(node), "since": _clock}
		return true
	_shatter(id, node)
	return true


## A carta trinca na cor do golpe, segura um instante e se despedaça para longe dele.
func _shatter(id: int, node: CardNode) -> void:
	if node == null or not is_instance_valid(node) or node.is_queued_for_deletion():
		return
	var d: FxDirector = director
	var hit: Dictionary = _struck.get(id, {})
	var color: Color = hit.get("color", ATTACK)
	var from: Variant = hit.get("from")
	var material: ShaderMaterial = CardDressing.material_of(node)
	if material:
		material.set_shader_parameter("crack_color", color.lerp(Color.WHITE, 0.2))
		var tween := node.create_tween()
		tween.tween_method(func(v: float) -> void: material.set_shader_parameter("cracks", v), 0.0, 1.0, 0.1 / d.speed).set_ease(Tween.EASE_OUT)
	node.jolt(0.03)
	var ref: WeakRef = weakref(node)
	MomentPieces.after(self, 0.16 / d.speed, func() -> void:
		var alive: CardNode = ref.get_ref() as CardNode
		if alive == null or alive.is_queued_for_deletion():
			return
		var at: Vector3 = alive.global_position
		CombatShatter.break_card(d, alive, from, color, d.speed)
		Fx.burst(d, at + Vector3(0, 0.1, 0), color.lerp(Color.WHITE, 0.3), 26, 1.8, 0.5, 0.06)
		CombatPieces.smoke(d, at, Color(0.25, 0.2, 0.17, 0.5), 12, 0.9, 0.3, 0.9, 0.24)
		Fx.light(d, at, color, 2.5, 3.0, 0.4)
		if d.sounds:
			d.sounds.play("shatter", at))
	_struck.erase(id)
