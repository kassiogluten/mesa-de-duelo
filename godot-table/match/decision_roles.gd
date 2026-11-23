# O que cada carta é na decisão atual (pode usar, alvo, selecionada, atacando, bloqueando, mana), as setas fixas do
# combate e dos alvos e os números dos alvos já escolhidos, a partir do estado e das escolhas locais (sem cena, para os testes).
class_name DecisionRoles
extends RefCounted

const GOLD := Color(1.0, 0.82, 0.3)
const RED := Color(1.0, 0.35, 0.25)
const BLUE := Color(0.35, 0.7, 1.0)


static func _input(s: Dictionary) -> Dictionary:
	return s.get("input", {}) if s.get("input") is Dictionary else {}


static func _ints(value: Variant) -> Array:
	return (value as Array).map(func(id: Variant) -> int: return int(id)) if value is Array else []


## Os papéis para TableHighlights: {selected, selectable, attacking, untappable, actionable, mana_only, blocking, stacks}.
## `dragged`: a permanente sendo arrastada (o atacante arrastado acende quem ele pode atacar).
static func build(s: Dictionary, blocks: BlockFlow, attacks: AttackFlow, dragged: CardNode = null) -> Dictionary:
	var input: Dictionary = _input(s)
	var selectable: Array = _ints(input.get("selectable"))
	var selected: Array = []
	var selection: Variant = input.get("selection")
	if selection is Dictionary:
		selected = _ints((selection as Dictionary).get("cards"))
	var actionable: Array = _ints(input.get("actionable"))
	if not BlockFlow.legal(s).is_empty():
		selectable = blocks.selectable(s)
		if blocks.pending():
			selected = [blocks.blocker]
	if AttackFlow.active(s):
		selected = attacks.selected.duplicate()
		# Com criaturas marcadas (ou uma arrastada), acendem os planeswalkers e batalhas que dá para atacar.
		var aiming: Array = attacks.selected.duplicate()
		if dragged != null and AttackFlow.attackers(s).has(dragged.card_id):
			aiming = [dragged.card_id]
		var defenders: Array = AttackFlow.group_targets(s, aiming) if not aiming.is_empty() else (AttackFlow.all_targets(s) if not attacks.pinned.is_empty() else [])
		for t: Dictionary in defenders:
			if t["kind"] == "card":
				selectable.append(int(t["id"]))
		if not attacks.pinned.is_empty() and attacks.pinned["kind"] == "card":
			selected.append(int(attacks.pinned["id"]))
	var targeting: Variant = input.get("targeting")
	if targeting is Dictionary and (targeting as Dictionary).get("source") != null:
		selected.append(int((targeting as Dictionary)["source"]))
	var attacking: Array = []
	var blocking: Array = []
	for raw: Variant in s.get("combat", []):
		var entry: Dictionary = raw
		attacking.append(int(entry.get("attacker", -1)))
		blocking.append_array(_ints(entry.get("blockers")))
	return {"selected": selected, "selectable": selectable, "attacking": attacking, "untappable": _ints(input.get("untappable")),
		"actionable": actionable, "mana_only": _ints(input.get("manaOnly")), "blocking": blocking, "stacks": _ints(input.get("selectableStacks"))}


## Setas fixas: ataque (vermelho, até o retrato ou a permanente) e bloqueio (azul) do combate, os alvos sendo
## escolhidos (dourado) e os do topo da pilha. [{from, to, color}] com o id da carta ou "player:<id>".
static func fixed_arrows(s: Dictionary) -> Array:
	var out: Array = []
	for raw: Variant in s.get("combat", []):
		var entry: Dictionary = raw
		var attacker: int = int(entry.get("attacker", -1))
		if entry.get("defender") != null:
			var to: Variant = "player:%d" % int(entry["defender"]) if Txt.of(entry.get("defenderKind", "player")) == "player" else int(entry["defender"])
			out.append({"from": attacker, "to": to, "color": RED})
		for blocker: Variant in entry.get("blockers", []):
			out.append({"from": int(blocker), "to": attacker, "color": BLUE})
	var targeting: Variant = _input(s).get("targeting")
	if targeting is Dictionary:
		_target_arrows(out, (targeting as Dictionary).get("source"), targeting)
	var stack: Array = s.get("stack", [])
	if not stack.is_empty() and (stack[0] as Dictionary).get("targets") is Dictionary:
		var top: Dictionary = stack[0]
		var source: Variant = (top.get("source") as Dictionary).get("id") if top.get("source") is Dictionary else null
		if Txt.of(top.get("kind", "spell")) != "spell":
			source = "stack:%d" % int(top["id"])
		_target_arrows(out, source, top["targets"])
	return out


static func _target_arrows(out: Array, source: Variant, targets: Dictionary) -> void:
	if source == null:
		return
	var from: Variant = int(source) if source is float or source is int else source
	for id: Variant in targets.get("cards", []):
		out.append({"from": from, "to": int(id), "color": GOLD})
	for id: Variant in targets.get("players", []):
		out.append({"from": from, "to": "player:%d" % int(id), "color": GOLD})


## Os números dos alvos já escolhidos na escolha em andamento (cartas e depois jogadores, na ordem do servidor):
## [{key, text, color}]; nada fora da escolha de alvos.
static func target_marks(s: Dictionary) -> Array:
	var targeting: Variant = _input(s).get("targeting")
	if not targeting is Dictionary:
		return []
	var out: Array = []
	for id: Variant in (targeting as Dictionary).get("cards", []):
		out.append({"key": int(id), "text": str(out.size() + 1), "color": GOLD})
	for id: Variant in (targeting as Dictionary).get("players", []):
		out.append({"key": "player:%d" % int(id), "text": str(out.size() + 1), "color": GOLD})
	return out
