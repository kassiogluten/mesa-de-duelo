# Jogadas do laboratório de efeitos para os efeitos da lapidação: limpa-campo, ward, comandante, Game Changer, medalhas,
# fichas, anexar, mudar de controle, mana, transformar, golpe duplo, bichos e a mesa lotada. Cada uma monta o estado
# como o servidor mandaria e deixa o diretor tocar o efeito.
class_name LabPlays
extends RefCounted


## Os botões: [texto, jogada].
static func buttons(lab: EffectsLab) -> Array:
	return [
		["Limpa-campo", wrath.bind(lab)], ["Limpa-campo de dano", pyroclasm.bind(lab)],
		["Ward segura", ward.bind(lab, true)], ["Ward pago", ward.bind(lab, false)],
		["Comandante entrando", commander.bind(lab)], ["Game Changer", game_changer.bind(lab)],
		["Monarca", medal.bind(lab, "monarch")], ["Dianteira", medal.bind(lab, "initiative")], ["Dia e noite", day_night.bind(lab)],
		["Tesouro", token.bind(lab, 601)], ["Pista", token.bind(lab, 602)], ["Comida", token.bind(lab, 603)], ["Sangue", token.bind(lab, 604)],
		["Anexar aura", attach.bind(lab)], ["Mudar de controle", control.bind(lab)], ["Mana voando", mana.bind(lab)],
		["Transformar", transform.bind(lab)], ["Golpe duplo", double_strike.bind(lab)],
		["Esquilo", squirrel.bind(lab)], ["Rato", critter.bind(lab, "rat")], ["Aranha", critter.bind(lab, "spider")], ["Morcego", critter.bind(lab, "bat")],
		["Mesa rangendo", creak.bind(lab)], ["Pode jogar", playable.bind(lab)],
	]


## Wrath of God do oponente: resolve e as criaturas saem do campo pela mesma mágica (a onda branca).
static func wrath(lab: EffectsLab) -> void:
	var events: Array = [lab.make_event({"type": "resolved", "card": lab.card_of(302), "stackId": 950, "actor": 1})]
	for id: Variant in lab.field.duplicate():
		if bool((EffectsLab.CARDS[id] as Array)[3]):
			events.append(lab.make_event({"type": "left", "card": lab.card_of(int(id)), "from": "Battlefield", "to": "Graveyard", "reason": "destroyed", "stackId": 950}))
			lab.absent.append(id)
	lab.rebuild(events)


## Pyroclasm: 2 de dano em cada criatura (a onda de fogo); as de resistência 2 morrem logo depois.
static func pyroclasm(lab: EffectsLab) -> void:
	var events: Array = [lab.make_event({"type": "resolved", "card": lab.card_of(303), "stackId": 951, "actor": 1})]
	var creatures: Array = []
	for id: Variant in lab.field:
		if bool((EffectsLab.CARDS[id] as Array)[3]):
			creatures.append(id)
	for id: Variant in creatures:
		events.append(lab.make_event({"type": "damage", "card": lab.card_of(303), "sourceId": 303, "targets": {"cards": [id]}, "delta": -2}))
	lab.rebuild(events)


## Ward: o Lightning Bolt do oponente mira o Serra Angel; a cúpula sobe e depois segura (ou trinca com o custo pago).
static func ward(lab: EffectsLab, held: bool) -> void:
	lab.stack_card = 301
	lab.rebuild([lab.make_event({"type": "ability-activated", "card": lab.card_of(101), "sourceId": 101, "trigger": true, "ward": true, "wardAgainst": 900})])
	await lab.wait(1.2)
	var events: Array = [lab.make_event({"type": "resolved", "card": lab.card_of(101), "sourceId": 101, "ward": true, "held": held})]
	if held:
		events.append(lab.make_event({"type": "countered", "card": lab.card_of(301), "stackId": 900}))
		lab.stack_card = -1
	lab.rebuild(events)


## O comandante conjurado da zona de comando: vai para a pilha e entra no campo.
static func commander(lab: EffectsLab) -> void:
	lab.format = "commander"
	lab.stack_card = 306
	lab.rebuild([lab.make_event({"type": "spell-cast", "card": lab.card_of(306), "actor": 0, "stackId": 900, "from": "Command"})])
	await lab.wait(0.9)
	lab.stack_card = -1
	lab.field.append(306)
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(306), "from": "Stack", "to": "Battlefield"})])


## Demonic Tutor numa partida de Commander: a cena do Game Changer na pilha.
static func game_changer(lab: EffectsLab) -> void:
	lab.format = "commander"
	lab.stack_card = 304
	lab.rebuild([lab.make_event({"type": "spell-cast", "card": lab.card_of(304), "actor": 0, "stackId": 900})])


## O monarca (ou a dianteira) vai para o oponente; apertar de novo devolve para você.
static func medal(lab: EffectsLab, which: String) -> void:
	if which == "monarch":
		lab.monarch = 1 if lab.monarch != 1 else 0
	else:
		lab.initiative = 1 if lab.initiative != 1 else 0
	lab.rebuild()


## Vira noite (ou dia, se já era noite).
static func day_night(lab: EffectsLab) -> void:
	lab.day_time = "day" if lab.day_time == "night" else "night"
	lab.rebuild()


## Uma ficha entra no campo: vira o objeto dela e mergulha na carta.
static func token(lab: EffectsLab, id: int) -> void:
	lab.field.append(id)
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(id), "to": "Battlefield"})])


## Rancor entra e se prende ao Grizzly Bears.
static func attach(lab: EffectsLab) -> void:
	lab.field.append(305)
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(305), "to": "Battlefield"})])
	await lab.wait(0.5)
	lab.rebuild([lab.make_event({"type": "attached", "card": lab.card_of(305), "targets": {"cards": [103]}})])


## O Goblin Guide do oponente passa para você.
static func control(lab: EffectsLab) -> void:
	lab.controller[202] = 0
	lab.rebuild([lab.make_event({"type": "control-changed", "card": lab.card_of(202), "actor": 0, "previous": 1})])


## Você vira as duas Florestas e conjura Giant Growth: a mana voa delas até a carta na pilha.
static func mana(lab: EffectsLab) -> void:
	lab.tapped[105] = true
	lab.tapped[106] = true
	lab.rebuild()
	await lab.wait(0.3)
	lab.hand.erase(111)
	lab.stack_card = 111
	lab.rebuild([lab.make_event({"type": "spell-cast", "card": lab.card_of(111), "actor": 0, "stackId": 900})])


## Delver of Secrets transforma em Insectile Aberration (o nome muda no mesmo id).
static func transform(lab: EffectsLab) -> void:
	lab.field.erase(103)
	lab.field.append(307)
	lab.rebuild()
	await lab.wait(1.5)
	lab.faces[307] = 308
	lab.rebuild()


## Golpe duplo: o Serra Angel golpeia o oponente duas vezes (primeiro golpe e golpe normal).
static func double_strike(lab: EffectsLab) -> void:
	lab.rebuild([lab.make_event({"type": "damage", "combat": true, "doubleStrike": true, "step": "first-strike", "card": lab.card_of(101), "sourceId": 101, "targets": {"players": [1]}, "delta": -4})])
	await lab.wait(0.6)
	lab.rebuild([lab.make_event({"type": "damage", "combat": true, "doubleStrike": true, "step": "regular", "card": lab.card_of(101), "sourceId": 101, "targets": {"players": [1]}, "delta": -4})])


## Um esquilo entra no campo: o esquilo atravessa a mesa.
static func squirrel(lab: EffectsLab) -> void:
	lab.fx.set("_critters", Critters.new())
	lab.field.append(309)
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(309), "to": "Battlefield"})])


## Os outros bichos, direto (sem a criatura).
static func critter(lab: EffectsLab, kind: String) -> void:
	Critters.spawn(lab.fx, kind, lab.fx.speed)


## O oponente com 31 permanentes recebe mais uma: a mesa range.
static func creak(lab: EffectsLab) -> void:
	lab.crowd[1] = 30
	lab.rebuild()
	await lab.wait(0.4)
	lab.fx.set("_watch", StateWatch.new())
	lab.field.append(601)
	lab.controller[601] = 1
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(601), "to": "Battlefield"})])


## As cartas da mão e o Llanowar Elves acesos como "pode jogar" (o halo e o brilho que corre a borda).
static func playable(lab: EffectsLab) -> void:
	lab.table.highlight([111, 112, 113, 102], [], [], false)
