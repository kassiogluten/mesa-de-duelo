# As cartas ligadas a uma permanente, para as miniaturas do inspetor: as que ela (ou o que está preso a ela) exilou, as de
# baixo de uma mutação e a carta a que ela está anexada; e se dá para apontar uma carta para os outros jogadores.
class_name CardLinks
extends RefCounted

## Zonas do jogador que todos veem (o "Apontar" só vale nelas e na pilha).
const PUBLIC_ZONES: PackedStringArray = ["battlefield", "commandZone", "graveyard", "exile"]


## As ligadas, na ordem do inspetor: [{card, caption, hidden}]. `card` é a carta do estado (ou a parte da mutação, com
## nome e imagem); hidden diz que é uma virada para baixo que você não pode ver.
static func of(card: Dictionary, state: Dictionary, label: Callable) -> Array:
	var out: Array = []
	if card.is_empty():
		return out
	var id: int = int(card.get("id", -1))
	var hosts: Array = [card]
	if not state.is_empty() and id >= 0:
		for permanent: Dictionary in _battlefield(state):
			if permanent.get("attachedTo") != null and int(permanent["attachedTo"]) == id:
				hosts.append(permanent)
	for h: int in hosts.size():
		var host: Dictionary = hosts[h]
		var exiling: Array = host.get("exiling", []) if host.get("exiling") is Array else []
		for raw: Variant in exiling:
			var exiled: Dictionary = find(state, int(raw))
			if exiled.is_empty():
				continue
			var caption: String = "Exilada por esta carta" if h == 0 else "Exilada por %s, anexada a esta carta" % _name(host, label)
			out.append(_link(exiled, caption))
	var merged: Array = card.get("merged", []) if card.get("merged") is Array else []
	for i: int in range(1, merged.size()):
		var part: Dictionary = merged[i] if merged[i] is Dictionary else {}
		var shown: Dictionary = {"id": int(part.get("id", -1)), "name": Txt.of(part.get("name"))}
		if Txt.of(part.get("image")) != "":
			shown["image"] = part["image"]
		if bool(part.get("faceDown", false)):
			shown["faceDown"] = true
		out.append(_link(shown, "Embaixo dela, na mutação"))
	if card.get("attachedTo") != null:
		var attached: Dictionary = find(state, int(card["attachedTo"]))
		if not attached.is_empty():
			out.append(_link(attached, "A carta a que esta está anexada"))
	return out


## A carta com esse id numa zona que a mesa conhece (campo, comando, cemitério, exílio, mão e a pilha), ou {}.
static func find(state: Dictionary, id: int) -> Dictionary:
	if state.is_empty() or id < 0:
		return {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		for zone: String in ["battlefield", "exile", "graveyard", "commandZone", "hand"]:
			for card: Variant in player.get(zone, []) if player.get(zone) is Array else []:
				if card is Dictionary and int((card as Dictionary).get("id", -2)) == id:
					return card
		if player.get("companion") is Dictionary and int((player["companion"] as Dictionary).get("id", -2)) == id:
			return player["companion"]
	for item: Variant in state.get("stack", []):
		if item is Dictionary and (item as Dictionary).get("source") is Dictionary and int(((item as Dictionary)["source"] as Dictionary).get("id", -2)) == id:
			return (item as Dictionary)["source"]
	return {}


## Dá para apontar: quem joga (não quem só assiste), com outra pessoa na mesa, e a carta numa zona que todos veem
## (canPoint de src/ui/cardPointer.ts).
static func can_point(state: Dictionary, id: int) -> bool:
	if state.is_empty() or id < 0 or bool(state.get("watching", false)) or bool(state.get("gameOver", false)):
		return false
	var you: int = int(state.get("you", -1))
	var someone: bool = false
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		if int(player.get("id", -1)) != you and not bool(player.get("ai", false)):
			someone = true
	return someone and is_public(state, id)


static func is_public(state: Dictionary, id: int) -> bool:
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		for zone: String in PUBLIC_ZONES:
			for card: Variant in player.get(zone, []) if player.get(zone) is Array else []:
				if card is Dictionary and int((card as Dictionary).get("id", -2)) == id:
					return true
		if player.get("companion") is Dictionary and int((player["companion"] as Dictionary).get("id", -2)) == id:
			return true
	for item: Variant in state.get("stack", []):
		if item is Dictionary and (item as Dictionary).get("source") is Dictionary and int(((item as Dictionary)["source"] as Dictionary).get("id", -2)) == id:
			return true
	return false


## A carta ligada; a virada para baixo só diz qual é a quem pode vê-la (hiddenFace).
static func _link(card: Dictionary, caption: String) -> Dictionary:
	var shown: Dictionary = card
	var hidden: bool = false
	if bool(card.get("faceDown", false)):
		var face: Variant = card.get("hiddenFace")
		if face is Dictionary and Txt.of((face as Dictionary).get("name")) != "":
			shown = (face as Dictionary).duplicate()
			shown["id"] = card.get("id", -1)
		else:
			hidden = true
	elif Txt.of(card.get("name")) == "":
		hidden = true
	return {"card": shown, "caption": caption, "hidden": hidden}


static func _battlefield(state: Dictionary) -> Array:
	var out: Array = []
	for raw: Variant in state.get("players", []):
		for card: Variant in (raw as Dictionary).get("battlefield", []):
			if card is Dictionary:
				out.append(card)
	return out


static func _name(card: Dictionary, label: Callable) -> String:
	var name: String = Txt.of(card.get("name"))
	return Txt.of(label.call(name)) if label.is_valid() and name != "" else name
