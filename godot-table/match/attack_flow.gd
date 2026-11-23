# A escolha de ataque (porte do essencial de src/ui/attackChoice.ts e commanderTable.ts): clicar na criatura marca ou
# desmarca o ataque; com um defensor só, vai direto; com vários, a criatura fica marcada até escolher quem (o retrato,
# o planeswalker ou a batalha), ou arrasta a criatura até ele. Manda {type:"attack-group", attackers, defender,
# defenderKind, gen} como a mesa do navegador (defender null tira do combate).
class_name AttackFlow
extends RefCounted

## Criaturas marcadas para atacar, ainda sem defensor (valem só no prompt `selection_gen`).
var selected: Array[int] = []
var selection_gen: int = -1
## Defensor escolhido antes das criaturas ({id, kind}; {} sem nenhum).
var pinned: Dictionary = {}


static func _input(state: Dictionary) -> Dictionary:
	return state.get("input", {}) if state.get("input") is Dictionary else {}


## A declaração de ataque está aberta para você.
static func active(state: Dictionary) -> bool:
	return _input(state).get("attacking") is Dictionary and not bool(state.get("gameOver", false)) and not state.get("question") is Dictionary \
		and not bool(state.get("spectating", false))


## As criaturas que podem atacar agora.
static func attackers(state: Dictionary) -> Array:
	if not active(state):
		return []
	return ((_input(state)["attacking"] as Dictionary).get("attackers", []) as Array).map(func(id: Variant) -> int: return int(id))


## Quem essa criatura pode atacar: [{id, kind}] (jogadores vivos que não são você e permanentes no campo).
static func defenders_for(state: Dictionary, attacker: int) -> Array:
	if not attackers(state).has(attacker):
		return []
	var you: int = int(state.get("you", -1))
	var alive: Dictionary = {}
	var on_field: Dictionary = {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		if bool(player.get("eliminated", false)):
			continue
		alive[int(player["id"])] = true
		for card: Variant in player.get("battlefield", []):
			on_field[int((card as Dictionary)["id"])] = true
	var out: Array = []
	for raw: Variant in (_input(state)["attacking"] as Dictionary).get("legalAssignments", []):
		var entry: Dictionary = raw
		if int(entry["attacker"]) != attacker:
			continue
		for d: Variant in entry.get("defenders", []):
			var target: Dictionary = {"id": int((d as Dictionary)["id"]), "kind": Txt.of((d as Dictionary).get("kind", "player"))}
			var ok: bool = (alive.has(target["id"]) and target["id"] != you) if target["kind"] == "player" else on_field.has(target["id"])
			if ok:
				out.append(target)
	return out


## Os defensores que todas essas criaturas podem atacar juntas.
static func group_targets(state: Dictionary, ids: Array) -> Array:
	if ids.is_empty():
		return []
	var first: Array = defenders_for(state, int(ids[0]))
	return first.filter(func(t: Dictionary) -> bool:
		return ids.all(func(id: Variant) -> bool: return _has(defenders_for(state, int(id)), t)))


## Todos os defensores possíveis de alguma criatura (o que acende quando há criaturas marcadas ou se arrasta uma).
static func all_targets(state: Dictionary) -> Array:
	var out: Array = []
	for id: int in attackers(state):
		for t: Dictionary in defenders_for(state, id):
			if not _has(out, t):
				out.append(t)
	return out


## A criatura já está declarada atacando.
static func assigned(state: Dictionary, attacker: int) -> bool:
	for raw: Variant in state.get("combat", []):
		if int((raw as Dictionary).get("attacker", -1)) == attacker:
			return true
	return false


static func message(ids: Array, defender: Variant, gen: int) -> Dictionary:
	if defender == null:
		return {"type": "attack-group", "attackers": ids.duplicate(), "defender": null, "gen": gen}
	var d: Dictionary = defender
	return {"type": "attack-group", "attackers": ids.duplicate(), "defender": int(d["id"]), "defenderKind": Txt.of(d["kind"]), "gen": gen}


static func _has(list: Array, target: Dictionary) -> bool:
	return list.any(func(t: Dictionary) -> bool: return int(t["id"]) == int(target["id"]) and t["kind"] == target["kind"])


## Estado novo: fora da declaração tudo volta ao começo; marcadas de um prompt velho ou que não podem mais atacar saem.
func sync(state: Dictionary) -> void:
	if not active(state):
		clear()
		return
	var gen: int = int(_input(state).get("gen", 0))
	var ok: Array = attackers(state)
	if selection_gen != gen:
		selected.clear()
	selected.assign(selected.filter(func(id: int) -> bool: return ok.has(id)))
	if not pinned.is_empty() and not _has(all_targets(state), pinned):
		pinned = {}


func clear() -> void:
	selected.clear()
	pinned = {}
	selection_gen = -1


## Há algo marcado esperando (criaturas sem defensor ou um defensor escolhido antes).
func pending() -> bool:
	return not selected.is_empty() or not pinned.is_empty()


## Esc ou clique direito: solta o que estava marcado. Devolve true se havia algo.
func cancel() -> bool:
	var had: bool = pending()
	clear()
	return had


## Clique numa criatura que pode atacar: {send: mensagem}, {notice: texto}, {changed: true} ou {}.
## `name_of` dá o nome em português de uma carta (para o aviso de ataque não permitido).
func click_attacker(state: Dictionary, id: int, name_of: Callable = Callable()) -> Dictionary:
	if not attackers(state).has(id):
		return {}
	var gen: int = int(_input(state).get("gen", 0))
	if selected.has(id):
		selected.erase(id)
		return {"changed": true}
	var targets: Array = defenders_for(state, id)
	var is_assigned: bool = assigned(state, id)
	if not pinned.is_empty() and not is_assigned:
		if _has(targets, pinned):
			return {"send": message([id], pinned, gen)}
		return {"notice": refuse_text(state, id, pinned, name_of)}
	# Já atacando: o clique tira do combate (com um defensor só, como no navegador; com vários, também: para trocar o
	# defensor, arraste a criatura até o novo).
	if is_assigned and selected.is_empty():
		return {"send": message([id], null, gen)}
	if selected.is_empty() and targets.size() == 1:
		return {"send": message([id], targets[0], gen)}
	selected.append(id)
	selection_gen = gen
	return {"changed": true}


## Escolheu um defensor (retrato, planeswalker ou batalha): as marcadas vão atacá-lo; sem marcadas, ele fica escolhido
## e as próximas criaturas clicadas vão nele.
func choose(state: Dictionary, defender: Dictionary, name_of: Callable = Callable()) -> Dictionary:
	if not active(state):
		return {}
	var gen: int = int(_input(state).get("gen", 0))
	if not selected.is_empty():
		if not _has(group_targets(state, selected), defender):
			var cannot: Array = selected.filter(func(a: int) -> bool: return not _has(defenders_for(state, a), defender))
			return {"notice": refuse_text(state, int(cannot[0]) if not cannot.is_empty() else selected[0], defender, name_of)}
		var ids: Array = selected.duplicate()
		clear()
		return {"send": message(ids, defender, gen)}
	if not _has(all_targets(state), defender):
		return {}
	pinned = {} if _has([pinned], defender) and not pinned.is_empty() else defender
	return {"changed": true}


## Arrastou a criatura até um defensor: ataca ele (ou avisa por que não pode).
func drop(state: Dictionary, attacker: int, defender: Dictionary, name_of: Callable = Callable()) -> Dictionary:
	if not attackers(state).has(attacker):
		return {}
	if not _has(defenders_for(state, attacker), defender):
		return {"notice": refuse_text(state, attacker, defender, name_of)}
	selected.erase(attacker)
	return {"send": message([attacker], defender, gen_of(state))}


static func gen_of(state: Dictionary) -> int:
	return int(_input(state).get("gen", 0))


## O aviso de ataque não permitido: a atiçada diz por quem foi atiçada (refuseAttack de src/ui/attackChoice.ts).
static func refuse_text(state: Dictionary, attacker: int, defender: Dictionary, name_of: Callable) -> String:
	var name: String = Txt.of(name_of.call(attacker)) if name_of.is_valid() else ""
	if name == "":
		name = "Essa criatura"
	var who: String = Txt.of(name_of.call(int(defender["id"]))) if name_of.is_valid() and defender["kind"] == "card" else ""
	var goaded: Array = []
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		if defender["kind"] == "player" and int(player["id"]) == int(defender["id"]):
			who = Txt.of(player.get("name", "Jogador"))
		for card: Variant in player.get("battlefield", []):
			if int((card as Dictionary)["id"]) == attacker and (card as Dictionary).get("goadedBy") is Array:
				goaded = (card as Dictionary)["goadedBy"]
	if who == "":
		who = "esse permanente"
	if defender["kind"] == "player" and goaded.any(func(g: Variant) -> bool: return int(g) == int(defender["id"])):
		return "%s foi atiçada por %s e precisa atacar outro jogador, se puder." % [name, who]
	return "%s não pode atacar %s neste combate." % [name, who]
