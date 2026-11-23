# O que o painel "Atacar quem?" mostra (attackChoices de src/ui/attackChoice.ts), a partir do estado e da escolha de
# ataque: um defensor por linha com vida ou lealdade, nome, de quem é e quantos atacantes já vão nele, o escolhido antes
# aceso, e se cabe "Retirar do combate"; e a cor de cada defensor nas setas de ataque (sem cena, para os testes).
class_name AttackPanelModel
extends RefCounted

const TITLE := "Atacar quem?"
## Cor das setas de ataque: vermelho no duelo; com 3 ou 4 jogadores, a de quem é atacado, pela ordem da mesa
## (combatPose.css: .beam.attack.def-1..3; o laranja um pouco mais forte, que na mesa 3D o do navegador parecia o dourado
## das setas de alvo).
const RED := Color(1.0, 0.35, 0.25)
const PALETTE: Array[Color] = [Color(1.0, 0.35, 0.25), Color("#ff7a18"), Color("#e0457b"), Color("#b46cf0")]


## {title, caption, targets: [{defender, name, detail, mark, coming, pinned, permanent, color}], removable}; {} sem
## nada marcado (o painel some). `name_of` dá o nome em português de uma carta.
static func build(state: Dictionary, flow: AttackFlow, name_of: Callable = Callable()) -> Dictionary:
	if not AttackFlow.active(state) or not flow.pending():
		return {}
	var targets: Array = []
	for raw: Variant in flow.current_targets(state):
		targets.append(_entry(state, raw, flow, name_of))
	return {"title": TITLE, "caption": caption(state, flow, name_of), "targets": targets, "removable": flow.removable(state)}


static func _entry(state: Dictionary, defender: Dictionary, flow: AttackFlow, name_of: Callable) -> Dictionary:
	var id: int = int(defender["id"])
	var out: Dictionary = {"defender": {"id": id, "kind": defender["kind"]}, "coming": coming(state, defender), "color": defender_color(state, defender),
		"pinned": not flow.pinned.is_empty() and int(flow.pinned["id"]) == id and flow.pinned["kind"] == defender["kind"]}
	if defender["kind"] == "player":
		var player: Dictionary = _player(state, id)
		var life: int = int(player.get("life", 0))
		out.merge({"name": Txt.of(player.get("name", "Jogador")), "detail": "%d de vida" % life, "mark": str(life), "permanent": false})
		return out
	var card: Dictionary = _card(state, id)
	var counters: Dictionary = card.get("counters", {}) if card.get("counters") is Dictionary else {}
	var planeswalker: bool = bool(card.get("planeswalker", false))
	var battle: bool = card.get("protector") != null
	var owner: Dictionary = _player(state, int(card["protector"] if battle else card.get("controller", -1)))
	var kind: String = "Planeswalker" if planeswalker else ("Batalha" if battle else "Permanente")
	var mark: Variant = counters.get("LOYALTY", 0) if planeswalker else counters.get("DEFENSE", "")
	out.merge({"name": _card_name(card, name_of), "detail": "%s de %s" % [kind, Txt.of(owner["name"])] if owner.has("name") else kind,
		"mark": Txt.of(mark) if mark is String else str(int(mark)), "permanent": true})
	return out


## A linha embaixo do título: quem está marcado (e quem já ataca), ou para quem vão as próximas criaturas.
static func caption(state: Dictionary, flow: AttackFlow, name_of: Callable = Callable()) -> String:
	if flow.selected.is_empty():
		var pinned_name: String = _defender_name(state, flow.pinned, name_of)
		return "As criaturas que você tocar vão atacar %s." % pinned_name
	if flow.selected.size() > 1:
		return "%d criaturas marcadas." % flow.selected.size()
	var id: int = flow.selected[0]
	var name: String = _card_name(_card(state, id), name_of)
	for raw: Variant in state.get("combat", []):
		var pair: Dictionary = raw
		if int(pair.get("attacker", -1)) == id and pair.get("defender") != null:
			var current: Dictionary = {"id": int(pair["defender"]), "kind": Txt.of(pair.get("defenderKind", "player"))}
			return "%s ataca %s. Escolha outro defensor ou retire do combate." % [name, _defender_name(state, current, name_of)]
	return "%s marcada." % name


## Quantos atacantes já vão nesse defensor.
static func coming(state: Dictionary, defender: Dictionary) -> int:
	var count: int = 0
	for raw: Variant in state.get("combat", []):
		var pair: Dictionary = raw
		if pair.get("defender") != null and int(pair["defender"]) == int(defender["id"]) and Txt.of(pair.get("defenderKind", "player")) == defender["kind"]:
			count += 1
	return count


## A cor da seta (e da marca no painel) de quem é atacado: no duelo, vermelho; com 3 ou 4 jogadores, a do jogador
## atacado (ou de quem controla o planeswalker ou defende a batalha), pela ordem da mesa, como drawCombatArrows.
static func defender_color(state: Dictionary, defender: Dictionary) -> Color:
	var players: Array = state.get("players", [])
	if players.size() <= 2:
		return RED
	var owner: int = int(defender["id"])
	if defender["kind"] != "player":
		owner = -1
		for raw: Variant in players:
			for card: Variant in (raw as Dictionary).get("battlefield", []):
				if int((card as Dictionary)["id"]) == int(defender["id"]):
					owner = int((raw as Dictionary)["id"])
	for i: int in players.size():
		if int((players[i] as Dictionary)["id"]) == owner:
			return PALETTE[i % PALETTE.size()]
	return RED


static func _defender_name(state: Dictionary, defender: Dictionary, name_of: Callable) -> String:
	if defender.is_empty():
		return "o defensor"
	if defender["kind"] == "player":
		return Txt.of(_player(state, int(defender["id"])).get("name", "Jogador"))
	return _card_name(_card(state, int(defender["id"])), name_of)


static func _card_name(card: Dictionary, name_of: Callable) -> String:
	var name: String = Txt.of(name_of.call(int(card["id"]))) if name_of.is_valid() and card.has("id") else ""
	return name if name != "" else Txt.of(card.get("name", "Permanente"))


static func _player(state: Dictionary, id: int) -> Dictionary:
	for raw: Variant in state.get("players", []):
		if int((raw as Dictionary)["id"]) == id:
			return raw
	return {}


static func _card(state: Dictionary, id: int) -> Dictionary:
	for raw: Variant in state.get("players", []):
		for card: Variant in (raw as Dictionary).get("battlefield", []):
			if int((card as Dictionary)["id"]) == id:
				return card
	return {"id": id}
