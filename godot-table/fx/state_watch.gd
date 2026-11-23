# O que muda de um estado para o outro sem evento próprio e vira efeito: a permanente que transforma (o nome muda no
# mesmo id), o monarca, a dianteira e o dia/noite que trocam de mão, os terrenos virados para pagar a mágica, o comandante
# que sai da zona de comando e o campo lotado. Só lógica: o diretor toca os efeitos.
class_name StateWatch
extends RefCounted

## Por quanto tempo um terreno virado ainda conta como mana da próxima mágica de quem o virou (segundos).
const MANA_WINDOW := 10.0
## Com mais permanentes que isto no campo de um jogador, a mesa range quando chega mais uma (como na mesa do navegador).
const CROWDED := 30
## Ranger de novo só depois deste tempo (segundos).
const CREAK_GAP := 15.0

var _seen: bool = false
var _monarch: int = -1
var _initiative: int = -1
var _day: String = ""
## jogador → [{id, color, time}]: os terrenos virados há pouco que ainda não pagaram uma mágica.
var _mana: Dictionary = {}
## Ids conjurados da zona de comando que ainda não entraram no campo.
var _command_casts: Dictionary = {}
var _last_creak: float = -1000.0


## Olha o estado novo (antes de a mesa aplicá-lo): `previous(id)` devolve a carta como a mesa a mostra agora ({} se não
## está à mostra) e `events` são os eventos novos. Devolve o que mudou:
## {transforms: [{id, from, to, face_up}], monarch: id|-1|null, initiative: id|-1|null, day: "day"|"night"|"",
##  mana: {seq do spell-cast: [{id, color}]}, commander_entries: {seq: true}, creak: id do jogador|-1}.
## monarch/initiative null: não mudou; -1: ninguém mais tem.
func observe(state: Dictionary, events: Array, previous: Callable, now: float) -> Dictionary:
	var out: Dictionary = {"monarch": null, "initiative": null, "day": "", "creak": -1}
	var transforms: Array = []
	var mana: Dictionary = {}
	var entries: Dictionary = {}
	var players: Array = state.get("players", []) if state.get("players") is Array else []
	var monarch: int = -1
	var initiative: int = -1
	for raw: Variant in players:
		var player: Dictionary = raw
		var pid: int = int(player.get("id", -1))
		if bool(player.get("monarch", false)):
			monarch = pid
		if bool(player.get("initiative", false)):
			initiative = pid
		for card_raw: Variant in player.get("battlefield", []):
			var card: Dictionary = card_raw
			var old: Dictionary = previous.call(int(card.get("id", -1)))
			if old.is_empty():
				continue
			var change: Dictionary = transform_of(old, card)
			if not change.is_empty():
				transforms.append(change)
			# Terreno que virou agora: guardado como mana do jogador até ele conjurar.
			if bool(card.get("land", false)) and bool(card.get("tapped", false)) and not bool(old.get("tapped", false)):
				var pool: Array = _mana.get(pid, [])
				pool.append({"id": int(card["id"]), "color": land_color(card), "time": now})
				_mana[pid] = pool
	var day: String = Txt.of(state.get("dayTime"))
	if _seen:
		if monarch != _monarch:
			out["monarch"] = monarch
		if initiative != _initiative:
			out["initiative"] = initiative
		if day != _day and day != "":
			out["day"] = day
	_monarch = monarch
	_initiative = initiative
	_day = day
	_seen = true
	for pid: Variant in _mana.keys():
		_mana[pid] = (_mana[pid] as Array).filter(func(e: Dictionary) -> bool: return now - float(e["time"]) <= MANA_WINDOW)
	for raw: Variant in events:
		var event: Dictionary = raw
		var id: int = _card_id(event)
		match Txt.of(event.get("type")):
			"spell-cast":
				var actor: int = int(event.get("actor", -1))
				var paid: Array = _mana.get(actor, [])
				if not paid.is_empty() and not bool(event.get("copy", false)):
					mana[int(event.get("seq", -1))] = paid.map(func(e: Dictionary) -> Dictionary: return {"id": e["id"], "color": e["color"]})
					_mana[actor] = []
				if Txt.of(event.get("from")) == "Command":
					_command_casts[id] = true
				else:
					_command_casts.erase(id)
			"countered":
				_command_casts.erase(id)
			"entered":
				if _command_casts.has(id) and Txt.of(event.get("from", "Stack")) == "Stack":
					_command_casts.erase(id)
					entries[int(event.get("seq", -1))] = true
				var owner: int = int((event.get("card", {}) as Dictionary).get("controller", event.get("actor", -1))) if event.get("card") is Dictionary else int(event.get("actor", -1))
				if crowded(players, owner) and now - _last_creak >= CREAK_GAP:
					_last_creak = now
					out["creak"] = owner
	out["transforms"] = transforms
	out["mana"] = mana
	out["commander_entries"] = entries
	return out


## A troca de face de uma permanente: o nome mudou no mesmo id (transformar, dia/noite de lobisomem) ou ela foi desvirada
## (metamorfose, manifestar). {} se nada mudou.
static func transform_of(old: Dictionary, card: Dictionary) -> Dictionary:
	var was_down: bool = bool(old.get("faceDown", false))
	var is_down: bool = bool(card.get("faceDown", false))
	var before: String = Txt.of(old.get("name"))
	var after: String = Txt.of(card.get("name"))
	if is_down or after == "":
		return {}
	if was_down:
		return {"id": int(card.get("id", -1)), "from": "", "to": after, "face_up": true}
	if before != "" and before != after:
		return {"id": int(card.get("id", -1)), "from": before, "to": after, "face_up": false}
	return {}


## A cor da mana de um terreno pelo tipo (Planície branca, Ilha azul…); dourado nos que não têm tipo básico.
static func land_color(card: Dictionary) -> Color:
	var types: String = Txt.of(card.get("typeLine")) + " " + Txt.of(card.get("name"))
	for entry: Array in [["Plains", Color(1.0, 0.93, 0.7)], ["Island", Color(0.35, 0.65, 1.0)], ["Swamp", Color(0.68, 0.4, 0.95)],
			["Mountain", Color(1.0, 0.38, 0.18)], ["Forest", Color(0.35, 0.95, 0.4)]]:
		if types.contains(Txt.of(entry[0])):
			return entry[1]
	return Color(0.95, 0.82, 0.5)


## O campo do jogador passou do lotado.
static func crowded(players: Array, owner: int) -> bool:
	for raw: Variant in players:
		var player: Dictionary = raw
		if int(player.get("id", -2)) == owner:
			return (player.get("battlefield", []) as Array).size() > CROWDED
	return false


static func _card_id(event: Dictionary) -> int:
	if event.get("card") is Dictionary and (event["card"] as Dictionary).has("id"):
		return int((event["card"] as Dictionary)["id"])
	return int(event.get("sourceId", -1)) if event.get("sourceId") != null else -1
