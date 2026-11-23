# Jogadas do laboratório de efeitos para os estados das permanentes: enjoo de invocação chegando e passando, desvirar,
# virar para mana, marcadores −1/−1, lealdade, veneno e energia no jogador, P/T subindo e caindo e selos novos.
class_name LabStates
extends RefCounted

## Cartas a mais da mesa de teste (o mesmo formato de EffectsLab.CARDS).
const CARDS := {
	801: ["Chandra, Torch of Defiance", "{2}{R}{R}", "Legendary Planeswalker — Chandra", false, false, 0, 0, 0],
}


## Os botões: [texto, jogada].
static func buttons(lab: EffectsLab) -> Array:
	return [
		["Enjoo chegando", sick_arrives.bind(lab)], ["Enjoo passando", sick_clears.bind(lab)],
		["Desvirar", untap.bind(lab)], ["Virar para mana", tap_for_mana.bind(lab)],
		["Marcadores −1/−1", minus_counters.bind(lab)], ["Lealdade", loyalty.bind(lab)],
		["Veneno", player_counter.bind(lab, "POISON", 3, 202)], ["Energia", player_counter.bind(lab, "ENERGY", 2, 102)],
		["P/T sobe", pump.bind(lab, 103, 3)], ["P/T cai", pump.bind(lab, 101, -2)], ["Selos novos", new_badges.bind(lab)],
	]


## Uma criatura entra com enjoo de invocação: sai da mão e pousa tonta.
static func sick_arrives(lab: EffectsLab) -> void:
	lab.absent.append(103)
	lab.rebuild()
	await lab.wait(0.3)
	lab.absent.erase(103)
	lab.extra[103] = {"sick": true}
	lab.extra[102] = {"sick": true}
	lab.rebuild([lab.make_event({"type": "entered", "card": lab.card_of(103), "to": "Battlefield"})])


## Duas criaturas tontas; o seu turno começa e o enjoo passa (as estrelinhas voam do selo).
static func sick_clears(lab: EffectsLab) -> void:
	lab.extra[103] = {"sick": true}
	lab.extra[102] = {"sick": true}
	lab.rebuild()
	await lab.wait(1.6)
	lab.extra.erase(103)
	lab.extra.erase(102)
	lab.turn += 2
	lab.rebuild([lab.make_event({"type": "turn", "actor": 0, "turn": lab.turn})])


## Terrenos e uma criatura virados; o seu turno começa e tudo desvira (a faixa de luz atravessa cada uma).
static func untap(lab: EffectsLab) -> void:
	for id: int in [101, 102, 104, 105, 106]:
		lab.tapped[id] = true
	lab.rebuild()
	await lab.wait(1.0)
	lab.tapped = {}
	lab.turn += 2
	lab.rebuild([lab.make_event({"type": "turn", "actor": 0, "turn": lab.turn})])


## Dois terrenos virados para mana (o tico de poeira quando encostam de lado).
static func tap_for_mana(lab: EffectsLab) -> void:
	lab.tapped[105] = true
	lab.tapped[106] = true
	lab.rebuild()


## Um −1/−1 no Goblin Guide: a ficha vermelha cai sobre a carta e se encaixa no selo.
static func minus_counters(lab: EffectsLab) -> void:
	lab.extra[202] = {"counters": {"M1M1": 1}, "power": 1, "toughness": 1}
	lab.rebuild([lab.make_event({"type": "counters", "sourceId": 202, "counter": "M1M1", "delta": 1})])


## Um planeswalker: +1 de lealdade pela habilidade (evento) e depois −3 de dano (sem evento de marcador).
static func loyalty(lab: EffectsLab) -> void:
	if not lab.field.has(801):
		lab.field.append(801)
	lab.extra[801] = {"planeswalker": true, "counters": {"LOYALTY": 4}}
	lab.rebuild()
	await lab.wait(1.0)
	lab.extra[801] = {"planeswalker": true, "counters": {"LOYALTY": 5}}
	lab.rebuild([lab.make_event({"type": "counters", "sourceId": 801, "counter": "LOYALTY", "delta": 1})])
	await lab.wait(1.6)
	lab.extra[801] = {"planeswalker": true, "counters": {"LOYALTY": 2}}
	lab.rebuild()


## Um marcador no jogador (veneno, energia): a ficha voa da carta até o selo do assento.
static func player_counter(lab: EffectsLab, kind: String, amount: int, source: int) -> void:
	var counters: Dictionary = (lab.player_extra.get(0, {}) as Dictionary).get("counters", {})
	counters[kind] = int(counters.get(kind, 0)) + amount
	lab.player_extra[0] = {"counters": counters}
	lab.rebuild([lab.make_event({"type": "counters", "sourceId": source, "counter": kind, "delta": amount, "targets": {"players": [0]}})])


## O P/T muda sem marcador (Giant Growth, um encolher): o selo pulsa e o "+3/+3" sai dele.
static func pump(lab: EffectsLab, id: int, amount: int) -> void:
	var base: Array = EffectsLab.CARDS[id]
	lab.extra[id] = {"power": int(base[5]) + amount, "toughness": int(base[6]) + amount}
	lab.rebuild()


## Selos que aparecem numa carta que já estava na mesa: ganhou voar, virou Portador do Anel (e o Anel tentou você).
static func new_badges(lab: EffectsLab) -> void:
	lab.extra[103] = {"keywords": ["FLYING"], "ringBearer": true}
	lab.player_extra[0] = {"ringTempted": 1}
	lab.rebuild()
