# O efeito de cada evento na mesa (dano, vida, mágica, habilidade, entrada, saída, marcadores, anexar, mudar de controle,
# ward, sobreviver, limpa-campo): o diretor (FxDirector) decide quando cada um toca e chama a função dele aqui.
class_name EventFx
extends RefCounted


## Dano: no combate o atacante avança e golpeia; fora dele, um projétil sai da fonte. O alvo pisca, solta faíscas e o número.
static func damage(d: FxDirector, event: Dictionary) -> void:
	var amount: int = absi(int(event.get("delta", 0)))
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var to_key: Variant = null
	if not (targets.get("cards", []) as Array).is_empty():
		to_key = int(targets["cards"][0])
	elif not (targets.get("players", []) as Array).is_empty():
		to_key = "player:%d" % int(targets["players"][0])
	var target: Variant = d.table.anchor(to_key) if to_key != null else null
	if not target is Vector3:
		return
	var source_id: int = FxDirector.card_id(event)
	var source: Variant = d.table.anchor(source_id) if source_id >= 0 else null
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else d.table.card_data(source_id)
	var color: Color = Color(1.0, 0.4, 0.2) if bool(event.get("combat", false)) else Fx.card_color(card)
	var impact: Callable = func() -> void: _impact(d, target, to_key, amount, color, event)
	if bool(event.get("combat", false)) and source is Vector3:
		var attacker: CardNode = d.table.card_node(source_id)
		if attacker:
			attacker.lunge(target)
		d.get_tree().create_timer(0.13 / d.speed).timeout.connect(impact)
	elif source is Vector3:
		Fx.bolt(d, source, target, color, 0.32 / d.speed, impact)
	else:
		impact.call()


static func _impact(d: FxDirector, target: Vector3, to_key: Variant, amount: int, color: Color, event: Dictionary) -> void:
	if bool(event.get("prevented", false)):
		if to_key is int:
			CardGlow.pulse(d.table.card_node(int(to_key)), Color(0.6, 0.85, 1.0), 0.05, d.speed)
		else:
			Fx.ring(d, target, Color(0.6, 0.85, 1.0), 1.2, 0.5, 0.2)
		Fx.float_text(d, target, "Prevenido", Color(0.7, 0.9, 1.0), 56)
		return
	var big: bool = amount >= 5 or bool(event.get("lethal", false))
	Fx.burst(d, target, color, 40 + amount * 8, 2.2 + amount * 0.15, 0.6)
	Fx.burst(d, target, Color(1.0, 0.95, 0.85), 10 + amount * 2, 1.2, 0.25, 0.22)
	# Na carta, o contorno dela acende e se afasta; no jogador, a onda de choque no tampo.
	if to_key is int:
		CardGlow.pulse(d.table.card_node(int(to_key)), color, 0.03 + minf(amount, 8) * 0.006, d.speed)
	else:
		Fx.ring(d, target, color, 1.0 + amount * 0.12, 0.45)
	Fx.light(d, target, color, 3.0 + amount * 0.4, 4.0)
	var text: String = ("%d veneno" % amount) if bool(event.get("infect", false)) else "-%d" % amount
	Fx.float_text(d, target, text, Color(0.6, 1.0, 0.4) if bool(event.get("infect", false)) else Color(1.0, 0.35, 0.3), 84 if big else 72)
	if bool(event.get("combat", false)) and bool(event.get("doubleStrike", false)):
		PermanentFx.double_strike(d, target, Txt.of(event.get("step")) == "regular")
	if to_key is int:
		var node: CardNode = d.table.card_node(to_key)
		if node:
			node.flash_color(Color(1.0, 0.25, 0.2), 0.4)
			node.jolt(0.05)
	if big:
		Fx.shake(d.table.camera, 0.08 + minf(amount, 12) * 0.012)
	if bool(event.get("lethal", false)):
		Fx.focus(d.table.camera, target, 0.14, 1.1)


## Vida: o ganho sobe em verde no retrato; a perda sem dano (pagar vida, perder vida) só pulsa o retrato.
static func life(d: FxDirector, event: Dictionary) -> void:
	var delta: int = int(event.get("delta", 0))
	var actor: int = int(event.get("actor", -1))
	if actor < 0 or delta == 0:
		return
	var pos: Variant = d.table.anchor("player:%d" % actor)
	if not pos is Vector3:
		return
	if delta > 0:
		Fx.burst(d, pos, Color(0.45, 1.0, 0.55), 30, 1.2, 0.8, 0.07)
		MomentPieces.spiral(d, pos - Vector3(0, 0.3, 0), Color(0.5, 1.0, 0.6), 10, 0.9, 0.8 / d.speed)
		Fx.float_text(d, pos, "+%d" % delta, Color(0.5, 1.0, 0.6), 72)
	d.hud.pulse_life(actor, delta)


## Mágica conjurada: a mana voa dos terrenos até ela, a carta na pilha acende na cor dela, com onda e luz; cópia, reforço
## e X ganham um selo; o Game Changer ganha a cena dele.
static func spell(d: FxDirector, event: Dictionary, mana: Array, game_changer: bool) -> void:
	d.at_card(event, func(now: Vector3, card: Dictionary) -> void:
		# A carta ainda está saindo da mão: o efeito acende onde ela vai parar na pilha.
		var landing: Variant = d.landing(int(card.get("id", -1)))
		var pos: Vector3 = landing if landing is Vector3 else now
		var color: Color = Fx.card_color(card)
		var delay: float = 0.0
		if not mana.is_empty():
			var sources: Array = []
			for raw: Variant in mana:
				var land: Dictionary = raw
				var at: Variant = d.table.anchor(int(land["id"]))
				if at is Vector3:
					sources.append({"at": at, "color": land["color"]})
			if not sources.is_empty():
				delay = PermanentFx.mana(d, sources, pos, d.speed) * 0.85
		MomentPieces.after(d, delay, func() -> void:
			if d.mood:
				d.mood.pulse(color)
			var node: CardNode = d.table.card_node(int(card.get("id", -1)))
			CardGlow.trace(node, color, 0.6, d.speed)
			Fx.burst(d, pos, color, 36, 1.6, 0.6)
			Fx.light(d, pos, color, 3.5, 5.0, 0.5)
			if node:
				node.flash_color(color, 0.5))
		var tags: PackedStringArray = []
		if bool(event.get("copy", false)):
			tags.append("Cópia")
		if bool(event.get("kicked", false)):
			tags.append("Reforçada")
		if event.get("x") != null:
			tags.append("X = %d" % int(event["x"]))
		if not tags.is_empty():
			Fx.float_text(d, pos, " · ".join(tags), color.lightened(0.3), 54)
		if game_changer:
			ArrivalFx.game_changer(d, d.table, pos, d.table.catalog.label(Txt.of(card.get("name"))), d.speed))


## Habilidade ativada ou gatilho: a fonte pisca e uma luz dá a volta na borda dela (dourada nos gatilhos); o gatilho do ward ergue a cúpula.
static func ability(d: FxDirector, event: Dictionary) -> void:
	d.at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Hud.GOLD if bool(event.get("trigger", false)) else Fx.card_color(card)
		var node: CardNode = d.table.card_node(FxDirector.card_id(event))
		CardGlow.trace(node, color, 0.5, d.speed)
		Fx.burst(d, pos, color, 14, 1.0, 0.4)
		if bool(event.get("ward", false)):
			PermanentFx.ward(d, pos, "rise", d.speed)
		if node:
			node.flash_color(color, 0.35))


## Resolveu: faíscas na carta; o ward resolvendo segura (anulou quem mirou) ou trinca (o custo foi pago).
static func resolved(d: FxDirector, event: Dictionary) -> void:
	d.at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		if bool(event.get("ward", false)):
			PermanentFx.ward(d, pos, "hold" if bool(event.get("held", false)) else "break", d.speed)
		else:
			Fx.burst(d, pos, Fx.card_color(card), 24, 1.6, 0.45))


## Entrada no campo: o contorno da carta se abre em luz e uma faixa de brilho atravessa a face; a lendária desce com coluna de luz e um tremor leve; o comandante saindo da
## zona de comando tem a cena dele; a ficha de Tesouro, Pista, Comida ou Sangue vira objeto.
static func entered(d: FxDirector, event: Dictionary, commander: bool) -> void:
	d.at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Fx.card_color(card)
		var node: CardNode = d.table.card_node(int(card.get("id", -1)))
		if commander and node:
			ArrivalFx.commander(d, node, d.table.camera, color, d.speed)
			return
		var type_line: String = Txt.of(card.get("typeLine"))
		var legendary: bool = type_line.contains("Legendary") or type_line.contains("Lendári")
		CardGlow.entered(node, color, legendary, d.speed)
		Fx.burst(d, pos, color.lerp(Color.WHITE, 0.4), 40 if legendary else 14, 1.6 if legendary else 0.9, 0.6, 0.05)
		if node:
			node.flash_color(color, 0.45)
		var token: String = ArrivalFx.token_kind(card)
		if token != "":
			ArrivalFx.token(d, pos, token, d.speed)
		if legendary:
			Fx.pillar(d, pos, Hud.GOLD)
			Fx.light(d, pos, Hud.GOLD, 5.0, 6.0, 0.8)
			Fx.focus(d.table.camera, pos, 0.1)
			Fx.shake(d.table.camera, 0.06))


## Saída do campo em cena: destruída trinca e queima, sacrificada queima em roxo, exilada é sugada por um portal.
static func left(d: FxDirector, event: Dictionary, node: CardNode) -> void:
	if node == null or not is_instance_valid(node):
		return
	var pos: Vector3 = node.global_position
	if Txt.of(event.get("to")) == "Exile":
		Fx.ring(d, pos, Color(0.75, 0.9, 1.0), 1.3, 0.7, 0.25)
		Fx.burst(d, pos, Color(0.7, 0.85, 1.0), 40, 1.4, 0.7)
		MomentPieces.spiral(d, pos, Color(0.7, 0.85, 1.0), 12, 0.8, 0.7 / d.speed)
		node.swirl_away(0.75 / d.speed)
	elif event.get("reason") == "sacrificed":
		Fx.burst(d, pos, Color(0.6, 0.25, 0.85), 40, 1.6, 0.9)
		node.burn_away(Color(0.7, 0.3, 1.0), 0.9 / d.speed)
	else:
		Fx.burst(d, pos, Color(1.0, 0.5, 0.15), 50, 1.8, 0.9)
		Fx.light(d, pos, Color(1.0, 0.5, 0.2), 2.5, 3.0, 0.8)
		var material: ShaderMaterial = CardDressing.material_of(node)
		if material:
			# Antes de queimar, a carta trinca.
			material.set_shader_parameter("crack_color", Color(1.0, 0.55, 0.2))
			var tween := node.create_tween()
			tween.tween_method(func(v: float) -> void: material.set_shader_parameter("cracks", v), 0.0, 1.0, 0.18 / d.speed)
		node.burn_away(Color(1.0, 0.45, 0.12), 0.9 / d.speed)


## Marcadores: o número sobe na carta (ou no jogador, no veneno e afins) e a carta treme.
static func counters(d: FxDirector, event: Dictionary) -> void:
	var delta: int = int(event.get("delta", 1))
	var kind: String = Txt.of(event.get("counter"))
	var text: String = {"P1P1": "+%d/+%d" % [delta, delta], "M1M1": "-%d/-%d" % [delta, delta], "LOYALTY": "+%d lealdade" % delta, "POISON": "+%d veneno" % delta}.get(kind, "+%d" % delta)
	var color: Color = Color(1.0, 0.4, 0.35) if kind in ["M1M1", "POISON"] else Color(0.55, 1.0, 0.6)
	var players: Array = (event.get("targets", {}) as Dictionary).get("players", []) if event.get("targets") is Dictionary else []
	var key: Variant = "player:%d" % int(players[0]) if not players.is_empty() else FxDirector.card_id(event)
	var pos: Variant = d.table.anchor(key)
	if pos is Vector3:
		Fx.float_text(d, pos, text, color, 60, 0.9)
		Fx.burst(d, pos, color, 14, 0.9, 0.45, 0.06)
		var node: CardNode = d.table.card_node(key) if key is int else null
		if node:
			node.jolt()


## Aura ou equipamento preso: a corrente de luz da carta até a permanente (ou o jogador) em que ela se prendeu.
static func attached(d: FxDirector, event: Dictionary) -> void:
	var id: int = FxDirector.card_id(event)
	var from: Variant = d.table.anchor(id)
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var to: Variant = null
	if not (targets.get("cards", []) as Array).is_empty():
		to = d.table.anchor(int(targets["cards"][0]))
	elif not (targets.get("players", []) as Array).is_empty():
		to = d.table.anchor("player:%d" % int(targets["players"][0]))
	if not from is Vector3 or not to is Vector3:
		return
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else d.table.card_data(id)
	var host: CardNode = d.table.card_node(int(targets["cards"][0])) if not (targets.get("cards", []) as Array).is_empty() else null
	PermanentFx.attach(d, from, to, Fx.card_color(card), d.speed, host)
	var node: CardNode = d.table.card_node(id)
	if node:
		node.flash_color(Fx.card_color(card), 0.4)


## Mudou de controle: o rastro do lugar antigo (`from`, guardado antes de a mesa mudar) até o novo.
static func control(d: FxDirector, event: Dictionary, from: Variant) -> void:
	var id: int = FxDirector.card_id(event)
	var to: Variant = d.table.anchor(id)
	if not to is Vector3:
		return
	var node: CardNode = d.table.card_node(id)
	PermanentFx.control(d, from, to, d.speed, node)
	if node:
		node.flash_color(PermanentFx.CONTROL, 0.5)


## Sobreviveu (indestrutível ou regenerada): rachaduras que se fecham e o texto.
static func survived(d: FxDirector, event: Dictionary) -> void:
	var id: int = FxDirector.card_id(event)
	var pos: Variant = d.table.anchor(id)
	if not pos is Vector3:
		return
	var regenerated: bool = event.get("survived") == "regenerated"
	PermanentFx.survive(d, d.table.card_node(id), regenerated, d.speed)
	Fx.float_text(d, pos, "Regenerada" if regenerated else "Indestrutível", Color(0.95, 0.95, 1.0), 52)


## Limpa-campo: a onda na cor da mágica varre a mesa a partir do meio e cada carta sai quando a frente chega nela (as
## criaturas atingidas por um dano em massa piscam e mostram o número). `nodes`: seq → WeakRef da carta que sai.
static func sweep(d: FxDirector, group: Dictionary, nodes: Dictionary) -> void:
	var color: Color = group["color"]
	var origin := Vector3(0, 0.02, 0.0)
	var wave: bool = bool(group.get("wave", true))
	if wave:
		BoardSweep.wave(d, origin, color, d.speed)
		if d.mood:
			d.mood.pulse(color, 2.0)
		Fx.shake(d.table.camera, 0.07, 0.5)
		MomentPieces.title(d, MomentPieces.beside(d.table, origin, 0.0), Txt.of(group["text"]), color.lerp(Color.WHITE, 0.35), color.darkened(0.75), 76, 1.5 / d.speed, 0.35 / d.speed)
		if d.sounds:
			d.sounds.play("impact", origin, 0.8)
	var events: Array = group["events"]
	var i: int = 0
	for raw: Variant in events:
		var event: Dictionary = raw
		var cue: String = Sounds.cue_for(event, 0)
		if bool(group.get("damage", false)):
			var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
			for id: Variant in targets.get("cards", []):
				var at: Variant = d.table.anchor(int(id))
				if at is Vector3:
					var hit: Vector3 = at
					MomentPieces.after(d, BoardSweep.arrival(Vector2(hit.x, hit.z).length()) / d.speed, func() -> void:
						_impact(d, hit, int(id), absi(int(event.get("delta", 0))), color, {}))
			continue
		var ref: WeakRef = nodes.get(int(event.get("seq", -1)))
		var node: CardNode = ref.get_ref() as CardNode if ref else null
		if node == null:
			continue
		var place: Vector3 = node.global_position
		var when: float = BoardSweep.arrival(Vector2(place.x, place.z).length()) / d.speed if wave else i * 0.08 / d.speed
		i += 1
		MomentPieces.after(d, when, func() -> void:
			var alive: CardNode = ref.get_ref() as CardNode
			if alive and not alive.is_queued_for_deletion():
				left(d, event, alive)
				if d.sounds and i <= 3:
					d.sounds.play(cue, place))
