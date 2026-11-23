# Como as permanentes de um jogador se arrumam no campo (como src/ui/permanentView.ts): criaturas na frente, planeswalkers e
# batalhas num grupo ao lado; atrás, artefatos/encantamentos e depois terrenos; cópias iguais num monte "×N" e auras e
# equipamentos presos atrás da carta a que estão presos.
class_name FieldLayout
extends RefCounted

const CARD := Vector2(0.63, 0.88)
## Espaço entre montes da mesma fileira e entre grupos (unidades da mesa).
const ITEM_GAP := 0.11
const GROUP_GAP := 0.42
## Cada cópia de um monte mostra esta fração da carta de baixo (como .stack no navegador); acima de 4, a faixa encolhe.
const STACK_STEP := 0.18
const STACK_STEP_TAPPED := 0.14
## Anexos: cada um sai para a direita e para o alto da carta, menores.
const ATTACH_STEP := 0.22
const ATTACH_RISE := 0.12
const ATTACH_SCALE := 0.86


## O que vale para o estado inteiro: quem pode ser usado, a declaração em curso, combate, anexos e quem exila algo.
static func context(state: Dictionary) -> Dictionary:
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var usable: Dictionary = {}
	for list: String in ["selectable", "actionable"]:
		if input.get(list) is Array:
			for id: Variant in input[list]:
				usable[int(id)] = true
	var untappable: Dictionary = {}
	if input.get("untappable") is Array:
		for id: Variant in input["untappable"]:
			untappable[int(id)] = true
	var blockers: Dictionary = {}
	if input.get("blocking") is Dictionary and (input["blocking"] as Dictionary).get("blockers") is Array:
		for id: Variant in (input["blocking"] as Dictionary)["blockers"]:
			blockers[int(id)] = true
	var on_field: Dictionary = {}
	var exiled_ids: Dictionary = {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		for c: Variant in player.get("battlefield", []):
			on_field[int((c as Dictionary)["id"])] = c
		if player.get("exile") is Array:
			for c: Variant in player["exile"]:
				exiled_ids[int((c as Dictionary)["id"])] = true
	return {"you": int(state.get("you", 0)), "usable": usable, "untappable": untappable, "blockers": blockers,
		"attacking": input.get("attacking") is Dictionary, "selection": input.get("selection") != null and input.has("selection"),
		"blocking": input.get("blocking") is Dictionary, "combat": state.get("combat", []) if state.get("combat") is Array else [],
		"attachments": attachments(on_field), "exiling": _exiling(on_field, exiled_ids)}


## Auras e equipamentos por carta a que estão presos (só quando ela está no campo): id → [cartas].
static func attachments(on_field: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for id: Variant in on_field:
		var card: Dictionary = on_field[id]
		var host: Variant = card.get("attachedTo")
		if host != null and on_field.has(int(host)):
			if not out.has(int(host)):
				out[int(host)] = []
			(out[int(host)] as Array).append(card)
	return out


## Quem exila alguma carta que está no exílio (ela ou o que está preso a ela): id → true.
static func _exiling(on_field: Dictionary, exiled_ids: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for id: Variant in on_field:
		var card: Dictionary = on_field[id]
		if card.get("exiling") is Array:
			for x: Variant in card["exiling"]:
				if exiled_ids.has(int(x)):
					var host: Variant = card.get("attachedTo")
					out[int(id)] = true
					if host != null:
						out[int(host)] = true
	return out


## As duas fileiras de um jogador: {front: [monte], back: [monte]}, cada monte {cards, group, x, width, tapped}, com `x` o
## centro da carta de baixo em relação ao meio da fileira (unidades da mesa, antes da escala do assento). `width` é a largura
## que cabe na fileira (unidades da mesa).
static func rows(player: Dictionary, ctx: Dictionary, width: float) -> Dictionary:
	var attached_ids: Dictionary = {}
	for host: Variant in ctx["attachments"]:
		for c: Variant in ctx["attachments"][host]:
			attached_ids[int((c as Dictionary)["id"])] = true
	var creatures: Array = []
	var attackable: Array = []
	var others: Array = []
	var lands: Array = []
	for raw: Variant in player.get("battlefield", []):
		var card: Dictionary = raw
		if attached_ids.has(int(card["id"])):
			continue
		if CardLabels.is_back_row(card):
			(lands if bool(card.get("land", false)) else others).append(card)
		elif CardLabels.is_attackable(card):
			attackable.append(card)
		else:
			creatures.append(card)
	var front: Array = _arrange([stacks(creatures, ctx), stacks(attackable, ctx)], ctx, width)
	var back: Array = _arrange([stacks(others, ctx), stacks(lands, ctx)], ctx, width)
	return {"front": front, "back": back}


## Agrupa cópias iguais na ordem em que aparecem: [[carta, ...], ...].
static func stacks(cards: Array, ctx: Dictionary) -> Array:
	var order: Array = []
	var groups: Dictionary = {}
	for raw: Variant in cards:
		var card: Dictionary = raw
		var key: String = stack_key(card, ctx)
		if not groups.has(key):
			groups[key] = []
			order.append(key)
		(groups[key] as Array).append(card)
	var out: Array = []
	for key: String in order:
		out.append(groups[key])
	return out


## A chave do monte: cartas com a mesma chave são cópias iguais (nome, estado, marcadores, P/T, dano, palavras-chave,
## enjoo). Ficam sozinhas as que têm algo preso, exilam algo, estão no combate, viradas para baixo, mutadas, ou numa escolha.
static func stack_key(card: Dictionary, ctx: Dictionary) -> String:
	var id: int = int(card["id"])
	var creature: bool = bool(card.get("creature", false))
	var land: bool = bool(card.get("land", false))
	var in_combat: bool = bool(card.get("attacking", false)) or bool(card.get("blocking", false))
	for raw: Variant in ctx.get("combat", []):
		var entry: Dictionary = raw
		if int(entry.get("attacker", -1)) == id or (entry.get("blockers", []) as Array).has(id) or (int(entry.get("defender", -1)) == id and Txt.of(entry.get("defenderKind", "player")) == "card"):
			in_combat = true
	var merged: Variant = card.get("merged")
	var alone: bool = (bool(ctx.get("attacking", false)) and not land) or bool(ctx.get("selection", false)) \
		or (bool(ctx.get("blocking", false)) and creature and int(card.get("controller", -1)) == int(ctx.get("you", 0))) \
		or (ctx["attachments"] as Dictionary).has(id) or (ctx["exiling"] as Dictionary).has(id) \
		or (merged is Array and not (merged as Array).is_empty()) or bool(card.get("faceDown", false)) or in_combat
	if alone:
		return "#%d" % id
	var counters: PackedStringArray = []
	if card.get("counters") is Dictionary:
		for k: Variant in card["counters"]:
			if int(card["counters"][k]) != 0:
				counters.append("%s=%d" % [Txt.of(k), int(card["counters"][k])])
	counters.sort()
	var keywords: PackedStringArray = CardLabels.field_keywords(card)
	keywords.sort()
	var body: String = "|%d/%d|%d|%s" % [int(card.get("power", 0)), int(card.get("toughness", 0)), int(card.get("damage", 0)), str(bool(card.get("sick", false)))] if creature else ""
	return "%s|%s|%s|%s|%s|%s|%s|%s%s|%s" % [Txt.of(card.get("name", "")), str(bool(card.get("tapped", false))), str((ctx["usable"] as Dictionary).has(id)),
		str((ctx["untappable"] as Dictionary).has(id)), str(bool(card.get("token", false))), str(bool(card.get("prepared", false))), Txt.of(card.get("copyOf", "")),
		",".join(counters), body, ",".join(keywords)]


## Quanto a fileira ocupa de um monte: a carta (deitada de lado se virada), as faixas das cópias e o leque dos anexos.
static func stack_width(cards: Array, ctx: Dictionary) -> float:
	var first: Dictionary = cards[0]
	var tapped: bool = bool(first.get("tapped", false))
	var w: float = CARD.y if tapped else CARD.x
	w += (cards.size() - 1) * copy_step(cards.size(), tapped)
	var atts: Array = (ctx["attachments"] as Dictionary).get(int(first["id"]), [])
	w += atts.size() * ATTACH_STEP * CARD.x
	return w


## A distância entre uma cópia e a seguinte num monte de `n`.
static func copy_step(n: int, tapped: bool) -> float:
	var spread: float = minf(1.0, 3.0 / maxf(n - 1, 1))
	return (STACK_STEP_TAPPED * CARD.y if tapped else STACK_STEP * CARD.x) * spread


## Põe os montes de cada grupo lado a lado, com espaço entre os grupos; se não cabem em `width`, aperta tudo por igual.
static func _arrange(groups: Array, ctx: Dictionary, width: float) -> Array:
	var items: Array = []
	var cursor: float = 0.0
	var first_group: bool = true
	for gi: int in groups.size():
		var group: Array = groups[gi]
		if group.is_empty():
			continue
		if not first_group:
			cursor += GROUP_GAP - ITEM_GAP
		first_group = false
		for cards: Variant in group:
			var w: float = stack_width(cards, ctx)
			var tapped: bool = bool(((cards as Array)[0] as Dictionary).get("tapped", false))
			var card_w: float = CARD.y if tapped else CARD.x
			items.append({"cards": cards, "group": gi, "left": cursor, "x": cursor + card_w / 2.0, "width": w, "tapped": tapped})
			cursor += w + ITEM_GAP
	var total: float = maxf(cursor - ITEM_GAP, 0.0)
	var squeeze: float = minf(1.0, width / total) if total > 0.0 else 1.0
	for item: Dictionary in items:
		item["x"] = float(item["x"]) * squeeze - total * squeeze / 2.0
		item["squeeze"] = squeeze
	return items
