# Combates do laboratório de efeitos: uma mesa com criaturas de palavras-chave (atropelar, toque mortífero, vínculo com a
# vida, golpe duplo, infectar) e os estados de um combate inteiro como o servidor mandaria (declarar, bloquear, golpe de
# iniciativa, golpe normal, mortes e o fim do combate), para ver e medir cada momento.
class_name LabCombat
extends RefCounted

## As criaturas do combate: id → [nome, custo, poder, resistência, dono, palavras-chave].
const ROSTER := {
	801: ["Craw Wurm", "{4}{G}{G}", 6, 4, 0, ["TRAMPLE"]],
	802: ["Vampire Nighthawk", "{1}{B}{B}", 2, 3, 0, ["FLYING", "DEATHTOUCH", "LIFELINK"]],
	803: ["Boros Swiftblade", "{R}{W}", 1, 2, 0, ["DOUBLE_STRIKE"]],
	804: ["Glistener Elf", "{G}", 1, 1, 0, ["INFECT"]],
	811: ["Hill Giant", "{3}{R}", 3, 3, 1, []],
	812: ["Grizzly Bears", "{1}{G}", 2, 2, 1, []],
	813: ["Shivan Dragon", "{4}{R}{R}", 5, 5, 1, ["FLYING"]],
	814: ["Wall of Stone", "{1}{R}{R}", 0, 8, 1, ["DEFENDER"]],
}
const LANDS := {0: [104, 105, 106], 1: [203, 204]}


## Os botões: [texto, jogada].
static func buttons(lab: EffectsLab) -> Array:
	return [
		["Combate completo", full.bind(lab)], ["Combate: atacar", declare.bind(lab)], ["Combate: bloquear", block.bind(lab)],
		["Combate: troca", trade.bind(lab)], ["Combate: atropelar", trample.bind(lab)], ["Combate: toque mortífero", deathtouch.bind(lab)],
		["Combate: vínculo", lifelink.bind(lab)], ["Combate: golpe duplo", double_strike.bind(lab)], ["Combate: infectar", infect.bind(lab)],
		["Combate: em você", at_you.bind(lab)], ["Combate: fim", finish.bind(lab)],
	]


## A carta do combate como o servidor manda (atacando ou bloqueando conforme `combat`).
static func card(id: int, combat: Array, damage: int = 0) -> Dictionary:
	var c: Array = ROSTER[id]
	var attacking: bool = combat.any(func(e: Variant) -> bool: return int((e as Dictionary)["attacker"]) == id)
	var blocking: bool = combat.any(func(e: Variant) -> bool: return ((e as Dictionary).get("blockers", []) as Array).has(id))
	return {"id": id, "name": c[0], "manaCost": c[1], "typeLine": "Creature", "creature": true, "land": false, "power": c[2],
		"toughness": c[3], "basePower": c[2], "baseToughness": c[3], "controller": c[4], "damage": damage, "keywords": c[5],
		"tapped": attacking and not (c[5] as Array).has("VIGILANCE"), "attacking": attacking, "blocking": blocking, "sick": false}


## O estado com as criaturas `present` (id → dano marcado), o combate e os eventos.
static func state(lab: EffectsLab, present: Dictionary, combat: Array, events: Array, phase: String = "COMBAT_DECLARE_ATTACKERS") -> Dictionary:
	var s: Dictionary = lab._state(events)
	for raw: Variant in s["players"]:
		var player: Dictionary = raw
		var pid: int = int(player["id"])
		var cards: Array = []
		for id: Variant in present:
			if int((ROSTER[id] as Array)[4]) == pid:
				cards.append(card(int(id), combat, int(present[id])))
		for land: Variant in LANDS[pid]:
			cards.append(lab.card_of(int(land)))
		player["battlefield"] = cards
	s["combat"] = combat
	s["phase"] = phase
	return s


static func show(lab: EffectsLab, s: Dictionary) -> void:
	lab.fx.before_state(s)
	lab.table.apply_state(s)
	lab.hud.apply_state(s)


static func damage(lab: EffectsLab, source: int, target: Variant, amount: int, extra: Dictionary = {}) -> Dictionary:
	var c: Array = ROSTER[source]
	var keywords: Array = c[5]
	# O alvo: uma carta (id) ou um jogador ("player:<id>").
	var targets: Dictionary = {"players": [int(Txt.of(target).substr(7))]} if target is String else {"cards": [int(target)]}
	var data: Dictionary = {"type": "damage", "combat": true, "card": card(source, []), "sourceId": source, "delta": -amount,
		"step": "regular", "targets": targets}
	data["deathtouch"] = keywords.has("DEATHTOUCH")
	data["lifelink"] = keywords.has("LIFELINK")
	data["doubleStrike"] = keywords.has("DOUBLE_STRIKE")
	data["infect"] = keywords.has("INFECT")
	data.merge(extra, true)
	return lab.make_event(data)


static func left(lab: EffectsLab, id: int) -> Dictionary:
	return lab.make_event({"type": "left", "card": card(id, []), "from": "Battlefield", "to": "Graveyard", "reason": "destroyed"})


## Começa uma jogada nova: a anterior (que ainda espera nos awaits dela) para no próximo passo.
static func _run(lab: EffectsLab) -> int:
	var run: int = int(lab.get_meta("combat_run", 0)) + 1
	lab.set_meta("combat_run", run)
	return run


## Espera e diz se a jogada ainda vale (outra começou, ou o laboratório fechou: para).
static func _wait(lab: EffectsLab, run: int, seconds: float) -> bool:
	await lab.wait(seconds)
	if not is_instance_valid(lab) or int(lab.get_meta("combat_run", 0)) != run:
		return false
	# "Remontar mesa" no meio (a série de prints remonta antes de cada botão): as criaturas do combate saíram, para.
	return ROSTER.keys().any(func(id: Variant) -> bool: return lab.table.card_node(int(id)) != null)


## Monta o campo do combate e declara os atacantes (`attacks`: atacante → jogador atacado).
static func _open(lab: EffectsLab, run: int, present: Dictionary, attacks: Dictionary) -> Array:
	show(lab, state(lab, present, [], [], "MAIN1"))
	if not await _wait(lab, run, 0.25):
		return []
	var combat: Array = []
	var by_player: Dictionary = {}
	for id: Variant in attacks:
		combat.append({"attacker": int(id), "defender": int(attacks[id]), "defenderKind": "player", "blockers": []})
		by_player[int(attacks[id])] = true
	var event: Dictionary = lab.make_event({"type": "attackers", "cards": attacks.keys(), "actor": int((ROSTER[attacks.keys()[0]] as Array)[4]),
		"targets": {"players": by_player.keys()}})
	show(lab, state(lab, present, combat, [event]))
	return combat


## Os bloqueios (`blocks`: bloqueador → atacante) entram no combate.
static func _block(lab: EffectsLab, present: Dictionary, combat: Array, blocks: Dictionary) -> void:
	for raw: Variant in combat:
		var entry: Dictionary = raw
		for blocker: Variant in blocks:
			if int(blocks[blocker]) == int(entry["attacker"]):
				(entry["blockers"] as Array).append(int(blocker))
	var event: Dictionary = lab.make_event({"type": "blockers", "cards": blocks.keys(), "actor": int((ROSTER[blocks.keys()[0]] as Array)[4])})
	show(lab, state(lab, present, combat, [event], "COMBAT_DECLARE_BLOCKERS"))


## O combate inteiro: quatro atacantes, dois bloqueios, o golpe de iniciativa, o golpe normal (atropelar, toque
## mortífero com vínculo, golpe duplo e infectar), as mortes e o fim.
static func full(lab: EffectsLab) -> void:
	var run: int = _run(lab)
	var present: Dictionary = {801: 0, 802: 0, 803: 0, 804: 0, 811: 0, 812: 0}
	var combat: Array = await _open(lab, run, present, {801: 1, 802: 1, 803: 1, 804: 1})
	if combat.is_empty() or not await _wait(lab, run, 1.6):
		return
	_block(lab, present, combat, {811: 801, 812: 802})
	if not await _wait(lab, run, 1.4):
		return
	show(lab, state(lab, present, combat, [damage(lab, 803, "player:1", 1, {"step": "first-strike"}),
		lab.make_event({"type": "life-changed", "actor": 1, "delta": -1})], "COMBAT_FIRST_STRIKE_DAMAGE"))
	if not await _wait(lab, run, 1.0):
		return
	var hits: Array = [
		damage(lab, 801, 811, 3, {"lethal": true}), damage(lab, 801, "player:1", 3, {"trample": true}), damage(lab, 811, 801, 3),
		damage(lab, 802, 812, 2, {"lethal": true}), damage(lab, 812, 802, 2),
		damage(lab, 803, "player:1", 1), damage(lab, 804, "player:1", 1),
		lab.make_event({"type": "life-changed", "actor": 0, "delta": 2}), lab.make_event({"type": "life-changed", "actor": 1, "delta": -4}),
	]
	present = {801: 3, 802: 2, 803: 0, 804: 0, 811: 3, 812: 2}
	show(lab, state(lab, present, combat, hits, "COMBAT_DAMAGE"))
	# As mortes chegam no estado seguinte (como no servidor): esperam os golpes que as causaram.
	if not await _wait(lab, run, 0.1):
		return
	present.erase(811)
	present.erase(812)
	show(lab, state(lab, present, combat, [left(lab, 811), left(lab, 812)], "COMBAT_DAMAGE"))
	if not await _wait(lab, run, 2.4):
		return
	show(lab, state(lab, present, [], [], "COMBAT_END"))


## Só a declaração: dois atacantes avançam com o rastro de calor e a mesa entra no clima de combate.
static func declare(lab: EffectsLab) -> void:
	await _open(lab, _run(lab), {801: 0, 802: 0, 811: 0, 812: 0}, {801: 1, 802: 1})


## A declaração e o bloqueio: os escudos sobem e as linhas ligam cada bloqueador ao atacante dele.
static func block(lab: EffectsLab) -> void:
	var run: int = _run(lab)
	var present: Dictionary = {801: 0, 802: 0, 811: 0, 812: 0}
	var combat: Array = await _open(lab, run, present, {801: 1, 802: 1})
	if combat.is_empty() or not await _wait(lab, run, 1.5):
		return
	_block(lab, present, combat, {811: 801, 812: 802})


## Uma troca de golpes entre o atacante e o bloqueador; o bloqueador morre e se despedaça.
static func trade(lab: EffectsLab) -> void:
	await _strike(lab, {801: 0, 812: 0}, {801: 1}, {812: 801}, [[801, 812, 6, {"lethal": true}], [812, 801, 2, {}]], [812])


static func trample(lab: EffectsLab) -> void:
	await _strike(lab, {801: 0, 812: 0}, {801: 1}, {812: 801}, [[801, 812, 2, {"lethal": true}], [801, "player:1", 4, {"trample": true}], [812, 801, 2, {}]], [812])


static func deathtouch(lab: EffectsLab) -> void:
	await _strike(lab, {802: 0, 813: 0}, {802: 1}, {813: 802}, [[802, 813, 2, {"lethal": true}], [813, 802, 5, {"lethal": true}]], [813, 802])


static func lifelink(lab: EffectsLab) -> void:
	await _strike(lab, {802: 0, 811: 0}, {802: 1}, {}, [[802, "player:1", 2, {}]], [], [lab.make_event({"type": "life-changed", "actor": 0, "delta": 2})])


## Golpe duplo: duas ondas (a iniciativa e a normal), cada uma com o corte dela.
static func double_strike(lab: EffectsLab) -> void:
	var run: int = _run(lab)
	var present: Dictionary = {803: 0, 814: 0}
	var combat: Array = await _open(lab, run, present, {803: 1})
	if combat.is_empty() or not await _wait(lab, run, 1.5):
		return
	show(lab, state(lab, present, combat, [damage(lab, 803, "player:1", 1, {"step": "first-strike"})], "COMBAT_FIRST_STRIKE_DAMAGE"))
	if not await _wait(lab, run, 0.9):
		return
	show(lab, state(lab, present, combat, [damage(lab, 803, "player:1", 1)], "COMBAT_DAMAGE"))


static func infect(lab: EffectsLab) -> void:
	await _strike(lab, {804: 0, 814: 0}, {804: 1}, {}, [[804, "player:1", 1, {}]], [])


## O dragão do oponente acerta você sem bloqueio: salta até o seu retrato e as bordas da tela ficam vermelhas.
static func at_you(lab: EffectsLab) -> void:
	await _strike(lab, {813: 0, 801: 0}, {813: 0}, {}, [[813, "player:0", 5, {}]], [], [lab.make_event({"type": "life-changed", "actor": 0, "delta": -5})])


## O fim do combate: a mesa volta ao clima normal e os escudos se apagam.
static func finish(lab: EffectsLab) -> void:
	await block(lab)
	var run: int = int(lab.get_meta("combat_run", 0))
	if not await _wait(lab, run, 1.2):
		return
	show(lab, state(lab, {801: 0, 802: 0, 811: 0, 812: 0}, [], [], "COMBAT_END"))


## Um combate curto: declara, bloqueia (se houver bloqueio), golpeia com `hits` ([fonte, alvo, dano, extras]) e tira
## do campo quem morre (`deaths`, no estado seguinte).
static func _strike(lab: EffectsLab, present: Dictionary, attacks: Dictionary, blocks: Dictionary, hits: Array, deaths: Array, more: Array = []) -> void:
	var run: int = _run(lab)
	var combat: Array = await _open(lab, run, present, attacks)
	if combat.is_empty() or not await _wait(lab, run, 1.5):
		return
	if not blocks.is_empty():
		_block(lab, present, combat, blocks)
		if not await _wait(lab, run, 1.0):
			return
	var events: Array = []
	for raw: Variant in hits:
		var hit: Array = raw
		events.append(damage(lab, int(hit[0]), hit[1], int(hit[2]), hit[3]))
	events.append_array(more)
	show(lab, state(lab, present, combat, events, "COMBAT_DAMAGE"))
	if deaths.is_empty() or not await _wait(lab, run, 0.1):
		return
	var gone: Array = []
	for id: Variant in deaths:
		present.erase(id)
		gone.append(left(lab, int(id)))
	show(lab, state(lab, present, combat, gone, "COMBAT_DAMAGE"))
