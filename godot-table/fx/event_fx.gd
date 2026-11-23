# O efeito de cada evento na mesa (dano, vida, mágica, habilidade, entrada, saída, marcadores, anexar, mudar de controle,
# ward, sobreviver, limpa-campo): o diretor (FxDirector) decide quando cada um toca e chama a função dele aqui.
class_name EventFx
extends RefCounted


## Dano: no combate o atacante recua, avança e golpeia; fora dele, um projétil no estilo da cor da carta sai da fonte
## (SpellMissile). O alvo pisca, solta faíscas e o número estoura.
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
	var color: Color = DamageNumber.color_for(event, Fx.card_color(card))
	var impact: Callable = func() -> void: _impact(d, target, to_key, amount, color, event, source)
	if bool(event.get("combat", false)) and source is Vector3:
		var attacker: CardNode = d.table.card_node(source_id)
		if attacker:
			CombatFx.strike(attacker, target, d.speed)
		MomentPieces.after(d, CombatFx.impact_delay() / d.speed, impact)
	elif source is Vector3:
		var struck: CardNode = d.table.card_node(int(to_key)) if to_key is int else null
		SpellMissile.launch(d, source, target, card, impact, d.speed, struck)
	else:
		impact.call()


## O impacto do dano em `target`. `source`: de onde veio o golpe (para o clarão e as faíscas seguirem a direção dele).
static func _impact(d: FxDirector, target: Vector3, to_key: Variant, amount: int, color: Color, event: Dictionary, source: Variant = null) -> void:
	if bool(event.get("prevented", false)):
		if to_key is int:
			CardGlow.pulse(d.table.card_node(int(to_key)), Color(0.6, 0.85, 1.0), 0.05, d.speed)
		else:
			MomentExtras.flare(d, target, Color(0.6, 0.85, 1.0), 1.0, 0.4)
		Fx.float_text(d, target, "Prevenido", Color(0.7, 0.9, 1.0), 56)
		return
	var lethal: bool = bool(event.get("lethal", false))
	var big: bool = amount >= 5 or lethal
	# O projétil da mágica (SpellMissile) já faz o clarão, os estilhaços e a luz no ponto do golpe: aqui só no combate
	# e no dano sem projétil (limpa-campo de dano).
	var by_missile: bool = not bool(event.get("combat", false)) and source is Vector3
	if not by_missile:
		CombatFx.impact(d, target, source, color, amount, d.table.camera, d.speed)
	Fx.burst(d, target, color, 24 + amount * 5, 1.8 + minf(amount, 10) * 0.12, 0.55)
	# Na carta, o contorno dela acende e se afasta; no jogador, um clarão em estrela (sem anel em volta do retrato).
	if to_key is int:
		CardGlow.pulse(d.table.card_node(int(to_key)), color, 0.03 + minf(amount, 8) * 0.006, d.speed)
	else:
		MomentExtras.flare(d, target, color, 0.9 + minf(amount, 10) * 0.06, 0.4)
	if not by_missile:
		Fx.light(d, target, color, 3.0 + minf(amount, 10) * 0.4, 4.0)
	DamageNumber.pop(d, target, DamageNumber.text_for(event, amount), color, amount, not to_key is int, lethal)
	if bool(event.get("combat", false)) and bool(event.get("doubleStrike", false)):
		PermanentFx.double_strike(d, target, Txt.of(event.get("step")) == "regular")
	if to_key is int:
		var node: CardNode = d.table.card_node(to_key)
		if node:
			node.flash_color(Color(1.0, 0.25, 0.2), 0.4)
			node.jolt(0.04 + minf(amount, 8) * 0.006)
	if lethal:
		Fx.shake(d.table.camera, 0.06 + minf(amount, 12) * 0.006, 0.3)
		Fx.focus(d.table.camera, target, 0.14, 1.1)
	elif big and not bool(event.get("combat", false)):
		# Mágica grande: sem golpe de onde vir o empurrão, um tremor curto.
		Fx.shake(d.table.camera, 0.05, 0.25)


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
		DamageNumber.pop(d, pos, "+%d" % delta, DamageNumber.LIFE, delta, true)
	if d.hud:
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
			# Na pilha do painel (perto da câmera) a própria carta acende; a luz e as faíscas ficam para a carta no tampo.
			if Fx.depth_scale(d, pos) > 0.7:
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


## Habilidade ativada ou gatilho: uma luz dá a volta na borda dela (dourada nos gatilhos); o gatilho do ward ergue a cúpula.
static func ability(d: FxDirector, event: Dictionary) -> void:
	d.at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		var color: Color = Hud.GOLD if bool(event.get("trigger", false)) else Fx.card_color(card)
		var node: CardNode = d.table.card_node(FxDirector.card_id(event))
		CardGlow.trace(node, color, 0.5, d.speed)
		Fx.burst(d, pos, color, 14, 1.0, 0.4)
		if bool(event.get("ward", false)):
			PermanentFx.ward(d, pos, "rise", d.speed))


## Resolveu: a carta solta a luz dela onde estava na pilha (`from`, guardado antes de ela sair de lá); o ward resolvendo
## segura (anulou quem mirou) ou trinca (o custo foi pago).
static func resolved(d: FxDirector, event: Dictionary, from: Variant = null) -> void:
	if from is Vector3 and not bool(event.get("ward", false)):
		var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else d.table.card_data(FxDirector.card_id(event))
		var color: Color = Fx.card_color(card)
		Fx.burst(d, from, color.lerp(Color.WHITE, 0.25), 22, 1.3, 0.45, 0.07, 1.5)
		if Fx.depth_scale(d, from) > 0.7:
			Fx.light(d, from, color, 2.2, 3.0, 0.3)
		return
	d.at_card(event, func(pos: Vector3, card: Dictionary) -> void:
		if bool(event.get("ward", false)):
			# A cúpula só na permanente que ainda está no campo (a que morreu já está no cemitério, perto da câmera).
			if d.table.zone_of(FxDirector.card_id(event)) == "battlefield":
				PermanentFx.ward(d, pos, "hold" if bool(event.get("held", false)) else "break", d.speed)
		else:
			Fx.burst(d, pos, Fx.card_color(card), 24, 1.6, 0.45))


## Entrada no campo: quando a carta pousa (a que ainda voa da mão ou da pilha espera chegar), o contorno dela se abre em
## luz, uma faixa de brilho atravessa a face e a poeira de luz corre rente ao feltro; o terreno só assenta com a poeira e
## um brilho fraco embaixo; a lendária desce com coluna de luz e um tremor leve; o comandante saindo da zona de comando
## tem a cena dele; a ficha de Tesouro, Pista, Comida ou Sangue vira objeto.
static func entered(d: FxDirector, event: Dictionary, commander: bool) -> void:
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else d.table.card_data(FxDirector.card_id(event))
	var node: CardNode = d.table.card_node(int(card.get("id", FxDirector.card_id(event))))
	if node == null:
		d.at_card(event, func(pos: Vector3, data: Dictionary) -> void:
			Fx.burst(d, pos, Fx.card_color(data).lerp(Color.WHITE, 0.4), 14, 0.9, 0.6, 0.05))
		return
	var ref: WeakRef = weakref(node)
	TouchFx.when_landed(d, node, func() -> void:
		var alive: CardNode = ref.get_ref() as CardNode
		if alive and is_instance_valid(alive):
			_land(d, alive, card, commander))


## A carta pousou no campo: o efeito da entrada, no lugar dela.
static func _land(d: FxDirector, node: CardNode, card: Dictionary, commander: bool) -> void:
	var pos: Vector3 = node.global_position
	var color: Color = Fx.card_color(card)
	if commander:
		ArrivalFx.commander(d, node, d.table.camera, color, d.speed)
		return
	var type_line: String = Txt.of(card.get("typeLine"))
	if bool(card.get("land", false)) or type_line.contains("Land") or type_line.contains("Terreno"):
		# Terreno: assenta com peso, sem festa (entra um por turno, e a mana dele já brilha depois).
		var tone: Color = _land_color(type_line)
		TouchFx.dust(d, pos, tone, 0.8)
		CardGlow.settle(node, tone, d.speed)
		return
	var legendary: bool = type_line.contains("Legendary") or type_line.contains("Lendári")
	CardGlow.entered(node, color, legendary, d.speed)
	TouchFx.dust(d, pos, color, 1.3 if legendary else 1.0)
	Fx.burst(d, pos, color.lerp(Color.WHITE, 0.4), 40 if legendary else 12, 1.6 if legendary else 0.8, 0.6, 0.05)
	var token: String = ArrivalFx.token_kind(card)
	if token != "":
		ArrivalFx.token(d, pos, token, d.speed)
	if legendary:
		Fx.pillar(d, pos, Hud.GOLD)
		Fx.light(d, pos, Hud.GOLD, 5.0, 6.0, 0.8)
		Fx.focus(d.table.camera, pos, 0.1)
		Fx.shake(d.table.camera, 0.04)


## A cor da mana de um terreno básico pelo tipo (a poeira do pouso); os outros, um dourado neutro.
static func _land_color(type_line: String) -> Color:
	for entry: Array in [["Plains", Color(1.0, 0.93, 0.7)], ["Island", Color(0.45, 0.7, 1.0)], ["Swamp", Color(0.7, 0.5, 0.9)],
			["Mountain", Color(1.0, 0.5, 0.3)], ["Forest", Color(0.45, 0.95, 0.5)]]:
		if type_line.contains(Txt.of(entry[0])):
			return entry[1]
	return Color(0.95, 0.82, 0.55)


## Saída do campo em cena: destruída trinca, segura um instante e queima de baixo para cima com brasas subindo;
## sacrificada queima em roxo; exilada é sugada por um portal.
static func left(d: FxDirector, event: Dictionary, node: CardNode) -> void:
	if node == null or not is_instance_valid(node):
		return
	var pos: Vector3 = node.global_position
	if Txt.of(event.get("to")) == "Exile":
		# Um portal se abre no tampo e a carta entra nele em espiral (ExilePortal).
		ExilePortal.swallow(d, node, d.speed)
	elif event.get("reason") == "sacrificed":
		Fx.burst(d, pos, Color(0.6, 0.25, 0.85), 40, 1.6, 0.9)
		node.burn_away(Color(0.7, 0.3, 1.0), 0.9 / d.speed)
	else:
		var material: ShaderMaterial = CardDressing.material_of(node)
		if material == null:
			node.burn_away(Color(1.0, 0.45, 0.12), 0.9 / d.speed)
			return
		# Primeiro a carta trinca e treme (a pancada); um instante depois a brasa acende e ela queima.
		material.set_shader_parameter("crack_color", Color(1.0, 0.55, 0.2))
		var tween := node.create_tween()
		tween.tween_method(func(v: float) -> void: material.set_shader_parameter("cracks", v), 0.0, 1.0, 0.14 / d.speed).set_ease(Tween.EASE_OUT)
		node.jolt(0.035)
		Fx.light(d, pos, Color(1.0, 0.5, 0.2), 1.5, 2.5, 0.25)
		var ref: WeakRef = weakref(node)
		MomentPieces.after(d, 0.22 / d.speed, func() -> void:
			var alive: CardNode = ref.get_ref() as CardNode
			if alive == null or alive.is_queued_for_deletion():
				return
			Fx.burst(d, pos, Color(1.0, 0.5, 0.15), 36, 1.4, 0.8)
			Fx.light(d, pos, Color(1.0, 0.5, 0.2), 2.5, 3.0, 0.8)
			alive.burn_away(Color(1.0, 0.45, 0.12), 0.85 / d.speed)
			_embers(d, pos))


## Brasas que sobem devagar de onde a carta queimou.
static func _embers(d: FxDirector, pos: Vector3) -> void:
	if Fx.quality == 0:
		return
	for i: int in 3:
		MomentPieces.after(d, (0.15 + i * 0.18) / d.speed, func() -> void:
			var spot: Vector3 = pos + Vector3(randf_range(-0.2, 0.2), 0.1, randf_range(-0.3, 0.3))
			Fx.burst(d, spot, Color(1.0, 0.55, 0.2), 5, 0.3, 1.2, 0.04, 0.7))


## Marcadores: na permanente, a ficha salta da carta e se encaixa no selo (que conta até o número novo); a lealdade vira
## algarismo por algarismo; no jogador (veneno, energia…), a ficha voa até o selo do assento (fx/state_counters.gd).
static func counters(d: FxDirector, event: Dictionary) -> void:
	CounterFx.play(d, event)


## Aura ou equipamento preso: a corrente de luz da carta até a permanente (ou o jogador) em que ela se prendeu, depois que
## a carta pousa (ela ainda pode estar voando da pilha).
static func attached(d: FxDirector, event: Dictionary) -> void:
	var id: int = FxDirector.card_id(event)
	var node: CardNode = d.table.card_node(id)
	var ref: WeakRef = weakref(node)
	TouchFx.when_landed(d, node, func() -> void:
		if node != null and ref.get_ref() == null:
			return
		_attach_now(d, event, id))


static func _attach_now(d: FxDirector, event: Dictionary, id: int) -> void:
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
		CardGlow.pulse(node, Fx.card_color(card), 0.03, d.speed)


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
