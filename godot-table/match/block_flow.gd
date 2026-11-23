# A escolha de bloqueio: escolhe a sua criatura (uma linha segue o mouse) e depois o atacante; direto se ela só pode
# bloquear um. Manda {type:"block", blocker, attacker, gen} como a mesa do navegador (blockPairAction de src/ui/tableClicks.ts).
class_name BlockFlow
extends RefCounted

## A sua criatura escolhida para bloquear, esperando o atacante (-1 sem nenhuma).
var blocker: int = -1


## Quem pode bloquear quem no estado: id do bloqueador → [ids dos atacantes]. {} fora da declaração de bloqueadores.
static func legal(state: Dictionary) -> Dictionary:
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var blocking: Variant = input.get("blocking")
	var out: Dictionary = {}
	if not blocking is Dictionary or bool(state.get("gameOver", false)) or state.get("question") is Dictionary:
		return out
	for raw: Variant in (blocking as Dictionary).get("legalAssignments", []):
		var entry: Dictionary = raw
		out[int(entry["blocker"])] = (entry.get("attackers", []) as Array).map(func(id: Variant) -> int: return int(id))
	return out


## Estado novo: a escolha cai se a declaração acabou ou a criatura não pode mais bloquear.
func sync(state: Dictionary) -> void:
	if blocker >= 0 and not legal(state).has(blocker):
		blocker = -1


## Há uma criatura esperando o atacante.
func pending() -> bool:
	return blocker >= 0


## Esc ou clique direito: solta a criatura escolhida. Devolve true se havia uma.
func cancel() -> bool:
	var had: bool = blocker >= 0
	blocker = -1
	return had


## O clique numa carta durante o bloqueio: {send: mensagem} para mandar, {notice: texto} para avisar, {changed: true}
## quando só a escolha local mudou, {} quando o clique não faz nada.
func click(state: Dictionary, id: int) -> Dictionary:
	var pairs: Dictionary = legal(state)
	if pairs.is_empty():
		return {}
	var gen: int = int((state["input"] as Dictionary).get("gen", 0))
	if pairs.has(id):
		if blocker == id:
			blocker = -1
			return {"changed": true}
		var targets: Array = pairs[id]
		if targets.size() == 1:
			blocker = -1
			return {"send": message(id, int(targets[0]), gen)}
		blocker = id
		return {"changed": true}
	if not _is_attacker(state, id):
		return {}
	if blocker < 0:
		return {"notice": "Selecione primeiro uma criatura sua para bloquear."}
	if not (pairs[blocker] as Array).has(id):
		return {"notice": "Essa criatura não pode bloquear esse atacante."}
	var chosen: int = blocker
	blocker = -1
	return {"send": message(chosen, id, gen)}


## Soltou a criatura arrastada em cima de um atacante (o mesmo que escolher e clicar).
func drop(state: Dictionary, from: int, attacker: int) -> Dictionary:
	var pairs: Dictionary = legal(state)
	if not pairs.has(from):
		return {}
	blocker = from
	return click(state, attacker)


## O que acende agora: as suas criaturas que podem bloquear ou, com uma escolhida, os atacantes que ela pode bloquear.
func selectable(state: Dictionary) -> Array:
	var pairs: Dictionary = legal(state)
	if blocker >= 0 and pairs.has(blocker):
		return (pairs[blocker] as Array).duplicate()
	return pairs.keys()


static func message(blocker_id: int, attacker_id: int, gen: int) -> Dictionary:
	return {"type": "block", "blocker": blocker_id, "attacker": attacker_id, "gen": gen}


static func _is_attacker(state: Dictionary, id: int) -> bool:
	var blocking: Dictionary = (state["input"] as Dictionary)["blocking"]
	return (blocking.get("attackers", []) as Array).any(func(a: Variant) -> bool: return int(a) == id)
