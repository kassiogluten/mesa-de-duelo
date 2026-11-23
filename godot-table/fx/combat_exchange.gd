# Uma troca de golpes do combate (o atacante e quem o bloqueia, ou o atacante e o jogador): todos que causam dano recuam,
# avançam com o rastro de calor e as imagens fantasmas e acertam juntos; no impacto, a pausa curta (hit-stop), a onda
# que entorta a tela, o corte, as faíscas, o empurrão de quem apanha, o tremor da câmera e o número. Atropelar,
# toque mortífero, vínculo com a vida e infectar têm a variação deles; o golpe no jogador salta até o retrato e racha o
# tampo, e as bordas da tela ficam vermelhas quando o golpe é em você.
class_name CombatExchange
extends RefCounted

## Quanto uma troca ocupa no ritmo do diretor (o jogador e o atropelar levam um pouco mais).
const TIME := 0.36
const PLAYER_TIME := 0.42
const TRAMPLE_EXTRA := 0.14
## O risco do atropelar, do bloqueador até o jogador.
const TRAMPLE_RUN := 0.16
const FIRE := Color(1.0, 0.36, 0.14)
const PREVENTED := Color(0.6, 0.85, 1.0)


## Quanto a troca `group` ocupa na sequência.
static func duration(group: Dictionary) -> float:
	var time: float = TIME
	for raw: Variant in group["blows"]:
		var blow: Dictionary = raw
		if blow["player"] >= 0:
			time = maxf(time, PLAYER_TIME)
		if bool((blow["event"] as Dictionary).get("trample", false)):
			time = maxf(time, PLAYER_TIME + TRAMPLE_EXTRA)
	return time


## Quando o impacto acontece depois de a troca começar (para o momento do golpe tocar junto).
static func lead_in(group: Dictionary) -> float:
	for raw: Variant in group["blows"]:
		if (raw as Dictionary)["player"] >= 0:
			return CombatFx.leap_delay()
	return CombatFx.impact_delay()


## Toca a troca: cada fonte golpeia o alvo dela; os impactos caem juntos.
static func play(stage: CombatStage, group: Dictionary) -> void:
	var d: FxDirector = stage.director
	var speed: float = d.speed
	var blows: Array = group["blows"]
	var struck_by: Dictionary = {}
	var leaping: bool = false
	for raw: Variant in blows:
		var blow: Dictionary = raw
		var source: int = blow["source"]
		if struck_by.has(source):
			continue
		var node: CardNode = stage.node_of(source)
		var target: Variant = _target_of(stage, blow)
		if node == null or not target is Vector3:
			continue
		struck_by[source] = true
		var leap: bool = blow["player"] >= 0 and not bool((blow["event"] as Dictionary).get("trample", false))
		leaping = leaping or leap
		var tint: Color = _tint(blow)
		CombatFx.strike(node, target, speed, leap, Color(tint, 0.9) if Fx.quality > 0 else Color(0, 0, 0, 0))
		CombatPieces.heat_trail(d, node, tint, (0.42 if leap else 0.32) / speed, 0.46, 0.16)
		# No recuo, o contorno da carta acende (a força juntando).
		CardGlow.pulse(node, tint, 0.03, speed)
	var delay: float = (CombatFx.leap_delay() if leaping else CombatFx.impact_delay()) / speed
	var ref: WeakRef = weakref(stage)
	MomentPieces.after(d, delay, func() -> void:
		var alive: CombatStage = ref.get_ref() as CombatStage
		if alive:
			_land(alive, group))


## O impacto de todos os golpes da troca, com uma pausa e um tremor só (pelo maior).
static func _land(stage: CombatStage, group: Dictionary) -> void:
	var d: FxDirector = stage.director
	var biggest: int = 0
	var weight: float = 0.0
	var lethal: bool = false
	var player_hit: bool = false
	var loudest: Dictionary = {}
	for raw: Variant in group["blows"]:
		var blow: Dictionary = raw
		var event: Dictionary = blow["event"]
		var amount: int = blow["amount"]
		if bool(event.get("prevented", false)):
			_prevented(stage, blow)
			if loudest.is_empty():
				loudest = event
			continue
		if amount >= biggest:
			biggest = amount
			loudest = event
		weight += amount
		lethal = lethal or bool(event.get("lethal", false))
		if bool(event.get("trample", false)) and blow["player"] >= 0:
			_trample(stage, blow)
			continue
		player_hit = player_hit or blow["player"] >= 0
		_hit(stage, blow)
	# Os golpes caíram: as mortes que esperavam por eles acontecem agora.
	for raw: Variant in group["blows"]:
		stage.blow_landed(int((raw as Dictionary)["target"]))
	var at: Variant = null
	if not loudest.is_empty():
		at = _target_of(stage, {"event": loudest, "player": _player_of(loudest), "target": _card_of(loudest)})
	var where: Vector3 = at if at is Vector3 else Vector3.ZERO
	if d.sounds and not loudest.is_empty():
		d.sounds.play(Sounds.cue_for(loudest, stage.you), where, 1.0 if biggest < 5 else 0.85)
		if biggest >= 5 or lethal:
			# O baque grave por baixo do golpe grande.
			d.sounds.play("impact", where, 0.55)
	if biggest <= 0:
		return
	var big: bool = biggest >= 4 or lethal or (player_hit and biggest >= 3)
	if big:
		CombatCamera.hit_stop(d.get_tree(), clampf(0.045 + biggest * 0.004, 0.05, 0.085))
	# O golpe enorme ganha o quadro do impacto: a imagem estica para fora a partir dele por um piscar.
	if at is Vector3 and (biggest >= 6 or (player_hit and (biggest >= 4 or lethal))):
		stage.screen.zoom(d.table.camera, at as Vector3, clampf(weight / 10.0, 0.0, 1.0), _tint({"event": loudest}))
	stage.camera_rig.shake(clampf(0.12 + weight * 0.045 + (0.15 if lethal else 0.0), 0.0, 0.85))


## Um golpe que acerta: o clarão, as faíscas na direção dele, o corte, a onda, o número e o resto pelo tipo de alvo e
## pelas palavras-chave da fonte.
static func _hit(stage: CombatStage, blow: Dictionary) -> void:
	var d: FxDirector = stage.director
	var event: Dictionary = blow["event"]
	var amount: int = blow["amount"]
	var at: Variant = _target_of(stage, blow)
	if not at is Vector3:
		return
	var target: Vector3 = at
	var source: Variant = stage.position_of(int(blow["source"]))
	var color: Color = _tint(blow)
	var weight: float = clampf(amount / 8.0, 0.0, 1.0)
	var direction: Vector3 = (target - (source as Vector3)) if source is Vector3 else Vector3(0, 0, -1)
	direction.y = 0.0
	direction = direction.normalized() if direction.length() > 0.001 else Vector3.FORWARD
	var lethal: bool = bool(event.get("lethal", false))
	CombatFx.impact(d, target, source, color, amount, d.table.camera, d.speed)
	CombatPieces.streaks(d, target + Vector3(0, 0.2, 0), direction + Vector3(0, 0.35, 0), color, 14 + amount * 3, lerpf(4.0, 7.0, weight), 32.0)
	MomentPieces.slash(d, target + Vector3(0, 0.3, 0), color.lerp(Color.WHITE, 0.35), randf_range(-0.9, 0.9), lerpf(1.0, 1.9, weight), lerpf(0.16, 0.26, weight), 0.0)
	if amount >= 3 or lethal or blow["player"] >= 0:
		CombatPieces.shockwave(d, target + Vector3(0, 0.25, 0), lerpf(0.9, 2.2, weight), lerpf(0.025, 0.05, weight), color)
	Fx.light(d, target, color, 3.0 + minf(amount, 10) * 0.45, 4.5, 0.35)
	# Na carta, o número sai do lado de lá (longe de quem golpeou): os dois números da troca não se cobrem.
	var number_at: Vector3 = target + direction * 0.35 if blow["player"] < 0 else target
	DamageNumber.pop(d, number_at, DamageNumber.text_for(event, amount), DamageNumber.color_for(event, color), amount, blow["player"] >= 0, lethal)
	if bool(event.get("doubleStrike", false)):
		PermanentFx.double_strike(d, target, Txt.of(event.get("step")) == "regular")
	var victim: CardNode = stage.node_of(int(blow["target"])) if int(blow["target"]) >= 0 else null
	if victim:
		CombatFx.recoil(victim, source if source is Vector3 else target - direction, weight + (0.3 if lethal else 0.0), d.speed)
		victim.flash_color(Color(1.0, 0.25, 0.2), 0.35)
		CardGlow.pulse(victim, color, 0.03 + minf(amount, 8) * 0.006, d.speed)
		stage.shield_hit(int(blow["target"]), target)
		stage.struck(int(blow["target"]), source if source is Vector3 else target - direction, color)
	if blow["player"] >= 0:
		_player_slam(stage, blow, target, color, weight)
	if bool(event.get("deathtouch", false)) and victim:
		CombatPieces.necrotic(d, target)
		var material: ShaderMaterial = CardDressing.material_of(victim)
		if material:
			material.set_shader_parameter("crack_color", CombatPieces.NECROTIC)
			var cracks := victim.create_tween()
			cracks.tween_method(func(v: float) -> void: material.set_shader_parameter("cracks", v), 0.0, 1.0, 0.16 / d.speed)
	if bool(event.get("infect", false)) or bool(event.get("wither", false)):
		CombatPieces.toxic(d, target)
	if bool(event.get("lifelink", false)):
		_lifelink(stage, blow, target, amount)


## O golpe no jogador: o tampo racha debaixo do retrato, sobe a poeira, o retrato balança e, se é você, as bordas da
## tela ficam vermelhas (verdes no veneno).
static func _player_slam(stage: CombatStage, blow: Dictionary, target: Vector3, color: Color, weight: float) -> void:
	var d: FxDirector = stage.director
	var event: Dictionary = blow["event"]
	var ground: Vector3 = Vector3(target.x, 0.02, target.z)
	var poison: bool = bool(event.get("infect", false))
	var tint: Color = CombatPieces.TOXIC if poison else color
	CombatPieces.scorch(d, ground, tint, lerpf(1.6, 3.0, weight))
	Fx.ring(d, ground, tint, lerpf(1.4, 2.6, weight), 0.5, 0.14)
	CombatPieces.smoke(d, ground + Vector3(0, 0.05, 0), Color(0.32, 0.26, 0.2, 0.55), 16 + int(weight * 16), 1.4, 0.4, 1.0, 0.3)
	CombatPieces.smoke(d, ground + Vector3(0, 0.1, 0), Color(0.12, 0.09, 0.07, 0.9), 10 + int(weight * 10), 2.4, -6.0, 0.6, 0.07)
	var player: int = blow["player"]
	stage.pulse_life(player, -int(blow["amount"]))
	if player == stage.you:
		stage.screen.flash(weight, Color(0.25, 0.7, 0.05) if poison else Color(0.75, 0.03, 0.02))
	if weight >= 0.5:
		stage.camera_rig.push(target, 0.6, 0.35)


## Atropelar: o golpe passa pelo bloqueador e corre como um risco de fogo até o jogador, que leva o resto.
static func _trample(stage: CombatStage, blow: Dictionary) -> void:
	var d: FxDirector = stage.director
	var through: Variant = stage.blocker_spot(int(blow["source"]))
	var to: Variant = _target_of(stage, blow)
	if not to is Vector3:
		return
	var from: Vector3 = through if through is Vector3 else (stage.position_of(int(blow["source"])) if stage.position_of(int(blow["source"])) is Vector3 else to)
	var color: Color = _tint(blow).lerp(Color(1.0, 0.75, 0.3), 0.3)
	# O nome no meio do caminho do risco, longe dos números da troca.
	var middle: Vector3 = from.lerp(to, 0.3) + Vector3(0, 0.45, 0)
	MomentPieces.after(d, TRAMPLE_RUN * 0.5 / d.speed, func() -> void: Fx.float_text(d, middle, "Atropelar", color.lightened(0.2), 50, 0.8))
	var ref: WeakRef = weakref(stage)
	CombatPieces.trample(d, from, to, color, TRAMPLE_RUN / d.speed, func() -> void:
		var alive: CombatStage = ref.get_ref() as CombatStage
		if alive:
			_hit(alive, blow))


## Vínculo com a vida: as luzes verdes vão do golpe até o retrato de quem controla a fonte, que pulsa quando chegam.
static func _lifelink(stage: CombatStage, blow: Dictionary, from: Vector3, amount: int) -> void:
	var d: FxDirector = stage.director
	var card: Dictionary = (blow["event"] as Dictionary).get("card", {}) if (blow["event"] as Dictionary).get("card") is Dictionary else d.table.card_data(int(blow["source"]))
	var controller: int = int(card.get("controller", -1))
	if controller < 0:
		return
	var to: Variant = d.table.anchor("player:%d" % controller)
	if not to is Vector3:
		return
	var stage_ref: WeakRef = weakref(stage)
	# O ganho de vida que o combate segurou (o mesmo estado trouxe) aparece quando as luzes chegam.
	var gain: int = int(blow.get("gain", 0))
	var ref: WeakRef = weakref(d)
	CombatPieces.motes(d, from + Vector3(0, 0.25, 0), to, amount + 2, d.speed, func() -> void:
		var alive: FxDirector = ref.get_ref() as FxDirector
		if alive == null:
			return
		Fx.burst(alive, to, CombatPieces.LIFELINK, 22, 1.0, 0.6, 0.07)
		if gain > 0:
			MomentPieces.spiral(alive, to - Vector3(0, 0.3, 0), Color(0.5, 1.0, 0.6), 10, 0.9, 0.8 / alive.speed)
			DamageNumber.pop(alive, to, "+%d" % gain, DamageNumber.LIFE, gain, true)
			if alive.sounds:
				alive.sounds.play("heal", to)
			var alive_stage: CombatStage = stage_ref.get_ref() as CombatStage
			if alive_stage:
				alive_stage.pulse_life(controller, gain))


## O golpe que a prevenção (ou a proteção do jogador) segurou: o golpe bate num escudo azul e volta.
static func _prevented(stage: CombatStage, blow: Dictionary) -> void:
	var d: FxDirector = stage.director
	var at: Variant = _target_of(stage, blow)
	if not at is Vector3:
		return
	var target: Vector3 = at
	CombatFx.flash(d, target + Vector3(0, 0.25, 0), PREVENTED, 1.1, 0.16 / d.speed)
	Fx.ring(d, target, PREVENTED, 1.1, 0.45, 0.12)
	Fx.float_text(d, target, "Prevenido", PREVENTED.lightened(0.2), 56)
	if d.sounds:
		d.sounds.play("shield", target)
	var victim: CardNode = stage.node_of(int(blow["target"])) if int(blow["target"]) >= 0 else null
	if victim:
		CardGlow.pulse(victim, PREVENTED, 0.05, d.speed)
	var attacker: CardNode = stage.node_of(int(blow["source"]))
	if attacker:
		CombatFx.recoil(attacker, target, 0.4, d.speed)


## Onde o golpe acerta: a carta atingida (o desenho dela), ou o tampo debaixo do retrato do jogador.
static func _target_of(stage: CombatStage, blow: Dictionary) -> Variant:
	if int(blow.get("player", -1)) >= 0:
		return stage.director.table.anchor("player:%d" % int(blow["player"]))
	return stage.position_of(int(blow.get("target", -1)))


## A cor do golpe pela palavra-chave da fonte: toque mortífero violeta, infectar verde, o resto em fogo.
static func _tint(blow: Dictionary) -> Color:
	var event: Dictionary = blow["event"]
	if bool(event.get("deathtouch", false)):
		return CombatPieces.NECROTIC
	if bool(event.get("infect", false)) or bool(event.get("wither", false)):
		return CombatPieces.TOXIC
	return FIRE


static func _player_of(event: Dictionary) -> int:
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var players: Array = targets.get("players", [])
	return int(players[0]) if not players.is_empty() else -1


static func _card_of(event: Dictionary) -> int:
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var cards: Array = targets.get("cards", [])
	return int(cards[0]) if not cards.is_empty() else -1


## Um golpe do evento de dano: {event, source, target (carta, -1), player (-1), amount}.
static func blow_of(event: Dictionary) -> Dictionary:
	return {"event": event, "source": FxDirector.card_id(event), "target": _card_of(event), "player": _player_of(event),
		"amount": absi(int(event.get("delta", 0)))}
