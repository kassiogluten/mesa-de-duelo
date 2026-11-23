# Histórico da partida agrupado (porte de src/ui/historyLog.ts): um bloco por turno e uma linha por jogada; a mágica e o
# que ela causou, o dano de combate com as mortes e os gatilhos seguidos da mesma carta viram uma linha só.
# `names` é um Dictionary: you, e Callables player(id), card(evento), cardById(id, evento), label(carta), describe(evento).
class_name HistoryLog
extends RefCounted

## O que uma mágica ou habilidade pode causar ao resolver (fica na linha dela).
const EFFECTS := ["left", "entered", "damage", "life-changed", "mill", "discard", "draw"]


static func _t(e: Dictionary) -> String:
	return Txt.of(e.get("type"))


static func _player(names: Dictionary, id: Variant) -> String:
	return Txt.of((names["player"] as Callable).call(id))


static func _card(names: Dictionary, e: Dictionary) -> Variant:
	return (names["card"] as Callable).call(e)


static func _card_or(names: Dictionary, e: Dictionary, fallback: String) -> String:
	var name: Variant = _card(names, e)
	return Txt.of(name) if name != null else fallback


static func _describe(names: Dictionary, e: Dictionary) -> String:
	return Txt.of((names["describe"] as Callable).call(e))


static func _unit(head: Dictionary, effects: Array = [], outcome: Variant = null, parts: Variant = null) -> Dictionary:
	return {"head": head, "effects": effects, "outcome": outcome, "parts": parts}


static func _plain(unit: Dictionary) -> bool:
	return unit["outcome"] == null and (unit["effects"] as Array).is_empty() and unit["parts"] == null


static func _card_key(e: Dictionary) -> String:
	var c: Variant = e.get("card")
	if c is Dictionary and EventText.truthy((c as Dictionary).get("name")) and not EventText.truthy((c as Dictionary).get("faceDown")):
		return Txt.of((c as Dictionary)["name"])
	return ""


static func _is_trigger(unit: Dictionary) -> bool:
	var head: Dictionary = unit["head"]
	return (_t(head) == "ability-activated" or _t(head) == "resolved") and EventText.truthy(head.get("trigger"))


static func _same(a: Variant, b: Variant) -> bool:
	if a == null or b == null:
		return a == null and b == null
	if (a is int or a is float) and (b is int or b is float):
		return float(a) == float(b)
	return a == b


static func _seq(e: Dictionary) -> int:
	return int(e.get("seq", 0))


static func _cards(n: int) -> String:
	return "uma carta" if n == 1 else "%d cartas" % n


static func _permanents(n: int) -> String:
	return "uma permanente" if n == 1 else "%d permanentes" % n


static func _no_dot(text: String) -> String:
	return text.trim_suffix(".")


## Divide a partida em turnos, na ordem em que aconteceram ({key, turn, actor, lines}).
static func history_turns(events: Array, names: Dictionary) -> Array:
	var turns: Array = []
	for raw: Variant in events:
		var event: Dictionary = raw
		if _t(event) == "turn":
			turns.append({"head": event, "events": []})
		elif not turns.is_empty():
			((turns[-1] as Dictionary)["events"] as Array).append(event)
		else:
			turns.append({"head": null, "events": [event]})
	var out: Array = []
	for t: Dictionary in turns:
		var head: Variant = t["head"]
		var turn: Variant = null
		if head is Dictionary:
			turn = (head as Dictionary).get("turn")
			if turn == null and (head as Dictionary).get("frame") is Dictionary:
				turn = ((head as Dictionary)["frame"] as Dictionary).get("turn")
		var lines: Array = _merge(_units(t["events"])).map(func(u: Dictionary) -> Dictionary: return _line(u, names))
		if turn == null and lines.is_empty():
			continue
		out.append({"key": "t%d" % _seq(head) if head is Dictionary else "inicio", "turn": turn, "actor": (head as Dictionary).get("actor") if head is Dictionary else null, "lines": lines})
	return out


## Primeira passada: cada evento vira uma linha, e a resolução leva junto o que aconteceu enquanto ela acontecia.
static func _units(events: Array) -> Array:
	var list: Array = []
	for raw: Variant in events:
		var event: Dictionary = raw
		var last: Variant = list[-1] if not list.is_empty() else null
		if _t(event) == "draw" and last != null and _plain(last) and _t((last as Dictionary)["head"]) == "draw":
			var lh: Dictionary = (last as Dictionary)["head"]
			if _same(lh.get("actor"), event.get("actor")) and EventText.truthy(lh.get("searched")) == EventText.truthy(event.get("searched")):
				var joined: Dictionary = lh.duplicate()
				joined["count"] = EventText.num(lh, "count", 1) + EventText.num(event, "count", 1)
				list[-1] = _unit(joined)
				continue
		if (_t(event) == "resolved" or _t(event) == "countered") and event.get("stackId") != null:
			var effects: Array = []
			while not list.is_empty() and _plain(list[-1]):
				var head: Dictionary = (list[-1] as Dictionary)["head"]
				var frame: Variant = head.get("frame")
				var top: Variant = null
				if frame is Dictionary and (frame as Dictionary).get("stack") is Array and not ((frame as Dictionary)["stack"] as Array).is_empty():
					top = (((frame as Dictionary)["stack"] as Array)[0] as Dictionary).get("id")
				var from_this: bool = EFFECTS.has(_t(head)) and _same(top, event.get("stackId"))
				if not from_this and _t(head) != "draw":
					break
				effects.push_front((list.pop_back() as Dictionary)["head"])
			var cast: Variant = list[-1] if not list.is_empty() else null
			if cast != null and _plain(cast):
				var ch: Dictionary = (cast as Dictionary)["head"]
				if _same(ch.get("stackId"), event.get("stackId")) and (_t(ch) == "spell-cast" or _t(ch) == "ability-activated"):
					list[-1] = _unit(ch, effects, event)
					continue
			list.append(_unit(event, effects))
			continue
		list.append(_unit(event))
	return list


## Que tipo de linha é, para juntar as parecidas e seguidas ("" nunca se junta).
static func _merge_key(unit: Dictionary) -> String:
	var head: Dictionary = unit["head"]
	if _is_trigger(unit) and _card_key(head) != "":
		return "trigger:" + _card_key(head)
	if not _plain(unit):
		return ""
	match _t(head):
		"damage":
			return "combat" if EventText.truthy(head.get("combat")) else ""
		"left":
			var why: Variant = head.get("reason") if head.get("reason") != null else head.get("to")
			return "left:" + Txt.of(why)
		"entered":
			return "entered"
		"discard":
			return "discard:" + _id_text(head.get("actor"))
		"life-changed":
			return "life:%s:%d" % [_id_text(head.get("actor")), signi(int(EventText.num(head, "delta")))]
	return ""


static func _id_text(id: Variant) -> String:
	return "undefined" if id == null else str(int(id))


static func _joins(run: Dictionary, unit: Dictionary) -> bool:
	var first: Dictionary = (run["parts"] as Array)[0] if run["parts"] is Array else run
	var key: String = _merge_key(first)
	if key == "":
		return false
	if key.begins_with("trigger:"):
		return _merge_key(unit) == key
	if key == "combat":
		var head: Dictionary = unit["head"]
		return _plain(unit) and ((_t(head) == "damage" and EventText.truthy(head.get("combat"))) or _t(head) == "life-changed" or _t(head) == "left")
	return _merge_key(unit) == key


static func _merge(list: Array) -> Array:
	var out: Array = []
	for unit: Dictionary in list:
		var last: Variant = out[-1] if not out.is_empty() else null
		if last != null and _joins(last, unit):
			var parts: Array = ((last as Dictionary)["parts"] as Array).duplicate() if (last as Dictionary)["parts"] is Array else [last]
			parts.append(unit)
			out[-1] = _unit((parts[0] as Dictionary)["head"], [], null, parts)
		else:
			out.append(unit)
	return out


## De quem eram as permanentes: "3 suas e 4 de Ana", as suas primeiro.
static func owners_text(events: Array, names: Dictionary) -> String:
	var actors: Array = []
	for e: Dictionary in events:
		if not actors.any(func(a: Variant) -> bool: return _same(a, e.get("actor"))):
			actors.append(e.get("actor"))
	var you: Variant = names.get("you")
	var mine: Array = actors.filter(func(a: Variant) -> bool: return _same(a, you))
	var others: Array = actors.filter(func(a: Variant) -> bool: return not _same(a, you))
	actors = mine + others
	var parts: Array = actors.map(func(actor: Variant) -> String:
		var n: int = events.filter(func(e: Dictionary) -> bool: return _same(e.get("actor"), actor)).size()
		if _same(actor, you):
			return "%d %s" % [n, "sua" if n == 1 else "suas"]
		return "%d de %s" % [n, _player(names, actor)])
	return EventText.list_names(parts, actors.size())


static func _actors_of(events: Array, type: String) -> Array:
	var out: Array = []
	for e: Dictionary in events:
		if _t(e) == type and not out.any(func(a: Variant) -> bool: return _same(a, e.get("actor"))):
			out.append(e.get("actor"))
	return out


static func _by(events: Array, type: String, actor: Variant) -> Array:
	return events.filter(func(e: Dictionary) -> bool: return _t(e) == type and _same(e.get("actor"), actor))


## O que a mágica, a habilidade ou o combate causou, em poucas palavras ("destruiu 7 permanentes (3 suas e 4 de Ana)").
static func effect_parts(events: Array, names: Dictionary, skip: Variant = null, owners: bool = true) -> Array:
	var parts: Array = []
	var left: Array = events.filter(func(e: Dictionary) -> bool: return _t(e) == "left")
	var leaving: Array = [["destroyed", "destruiu %s"], ["sacrificed", "fez sacrificar %s"], ["Exile", "exilou %s"],
		["Hand", "devolveu %s à mão"], ["Library", "pôs %s no grimório"], ["Graveyard", "mandou %s para o cemitério"], ["", "tirou %s do campo"]]
	var kinds: Array = leaving.map(func(l: Array) -> String: return l[0])
	var kind_of: Callable = func(e: Dictionary) -> String:
		if e.get("reason") != null:
			return Txt.of(e["reason"])
		return Txt.of(e.get("to")) if kinds.slice(0, 6).has(Txt.of(e.get("to"))) else ""
	for l: Array in leaving:
		var group: Array = left.filter(func(e: Dictionary) -> bool: return kind_of.call(e) == l[0])
		if not group.is_empty():
			var what: String = _card_or(names, group[0], _permanents(1)) if group.size() == 1 else _permanents(group.size()) + ((" (%s)" % owners_text(group, names)) if owners else "")
			parts.append(Txt.of(l[1]) % what)
	var entered: Array = events.filter(func(e: Dictionary) -> bool: return _t(e) == "entered" and (skip == null or not _same(e.get("sourceId"), skip)))
	if not entered.is_empty():
		parts.append(_entered_text(entered, names, true))
	var damage: Array = events.filter(func(e: Dictionary) -> bool: return _t(e) == "damage" and not EventText.truthy(e.get("prevented")))
	if not damage.is_empty():
		var total: int = 0
		var targets: Array = []
		for e: Dictionary in damage:
			total += absi(int(EventText.num(e, "delta")))
			for id: Variant in _targets(e, "players"):
				var n: String = _player(names, id)
				if not targets.has(n):
					targets.append(n)
			for id: Variant in _targets(e, "cards"):
				var c: Variant = (names["cardById"] as Callable).call(id, e)
				var n: String = Txt.of((names["label"] as Callable).call(c)) if c is Dictionary else "#%d" % int(id)
				if not targets.has(n):
					targets.append(n)
		if targets.size() > 3:
			parts.append("causou %d de dano a %d alvos" % [total, targets.size()])
		else:
			parts.append("causou %d de dano%s" % [total, (" a " + EventText.list_names(targets)) if not targets.is_empty() else ""])
	for actor: Variant in _actors_of(events, "draw"):
		var n: int = 0
		for e: Dictionary in _by(events, "draw", actor):
			n += int(EventText.num(e, "count", 1))
		parts.append("%s comprou %s" % [_player(names, actor), _cards(n)])
	for actor: Variant in _actors_of(events, "mill"):
		var milled: Array = _by(events, "mill", actor)
		var n: int = 0
		for e: Dictionary in milled:
			n += (e["milled"] as Array).size() if e.get("milled") is Array else 1
		var surveil: bool = milled.all(func(e: Dictionary) -> bool: return EventText.truthy(e.get("surveil")))
		parts.append(("%s pôs %s no cemitério" if surveil else "%s moeu %s") % [_player(names, actor), _cards(n)])
	for actor: Variant in _actors_of(events, "discard"):
		var discarded: Array = _by(events, "discard", actor)
		parts.append("%s descartou %s" % [_player(names, actor), _card_or(names, discarded[0], _cards(1)) if discarded.size() == 1 else _cards(discarded.size())])
	var damaged: Array = []
	for e: Dictionary in damage:
		damaged.append_array(_targets(e, "players"))
	for actor: Variant in _actors_of(events, "life-changed"):
		var delta: int = 0
		for e: Dictionary in _by(events, "life-changed", actor):
			delta += int(EventText.num(e, "delta"))
		if delta > 0:
			parts.append("%s ganhou %d de vida" % [_player(names, actor), delta])
		elif delta < 0 and (actor == null or not damaged.any(func(id: Variant) -> bool: return _same(id, actor))):
			parts.append("%s perdeu %d de vida" % [_player(names, actor), -delta])
	return parts


static func _targets(e: Dictionary, kind: String) -> Array:
	var t: Variant = e.get("targets")
	return (t as Dictionary)[kind] if t is Dictionary and (t as Dictionary).get(kind) is Array else []


static func _entered_text(entered: Array, names: Dictionary, by_effect: bool = false) -> String:
	if entered.is_empty():
		return ""
	var first: Dictionary = entered[0]
	var same: bool = entered.all(func(e: Dictionary) -> bool: return _card_key(e) != "" and _card_key(e) == _card_key(first))
	if by_effect and entered.all(func(e: Dictionary) -> bool: return e.get("card") is Dictionary and EventText.truthy((e["card"] as Dictionary).get("token")) and not EventText.truthy(e.get("from"))):
		var n: int = entered.size()
		var name: Variant = _card(names, first)
		if same and EventText.truthy(name):
			return "criou uma ficha de %s" % name if n == 1 else "criou %d fichas de %s" % [n, name]
		return "criou uma ficha" if n == 1 else "criou %d fichas" % n
	if entered.size() == 1:
		return "%s entrou no campo" % _card_or(names, first, "uma permanente")
	return "%d × %s entraram no campo" % [entered.size(), Txt.of(_card(names, first))] if same else "%s entraram no campo" % _permanents(entered.size())


## O que mostrar ao abrir a linha: cada evento com a sua frase, menos a vida que só repete o dano.
static func _details(events: Array, names: Dictionary) -> Array:
	var damaged: Array = []
	for e: Dictionary in events:
		if _t(e) == "damage":
			damaged.append_array(_targets(e, "players"))
	return events.filter(func(e: Dictionary) -> bool:
		return not (_t(e) == "life-changed" and EventText.num(e, "delta") < 0 and e.get("actor") != null and damaged.any(func(id: Variant) -> bool: return _same(id, e.get("actor"))))
	).map(func(e: Dictionary) -> Dictionary: return _item(e, _describe(names, e)))


static func _item(event: Dictionary, text: String) -> Dictionary:
	return {"key": "e%d" % _seq(event), "text": text, "card": event["card"] if _card_key(event) != "" else null, "actor": event.get("actor")}


static func _unit_events(unit: Dictionary) -> Array:
	if unit["parts"] is Array:
		var out: Array = []
		for p: Dictionary in unit["parts"]:
			out.append_array(_unit_events(p))
		return out
	var list: Array = [unit["head"]]
	list.append_array(unit["effects"])
	if unit["outcome"] != null:
		list.append(unit["outcome"])
	return list


## Os momentos da jogada que ganham um selo na linha ("Primeiro sangue", "Eliminação dupla").
static func badges_of(events: Array) -> Array:
	var badges: Array = []
	if events.any(func(e: Dictionary) -> bool: return EventText.truthy(e.get("firstBlood"))):
		badges.append("Primeiro sangue")
	var out: Array = []
	for e: Dictionary in events:
		if _t(e) == "damage" and EventText.truthy(e.get("lethal")) and not EventText.truthy(e.get("prevented")):
			for id: Variant in _targets(e, "players"):
				if not out.any(func(o: Variant) -> bool: return _same(o, id)):
					out.append(id)
	if out.size() == 2:
		badges.append("Eliminação dupla")
	elif out.size() == 3:
		badges.append("Eliminação tripla")
	elif out.size() > 3:
		badges.append("Eliminação de %d" % out.size())
	return badges


static func _line(unit: Dictionary, names: Dictionary) -> Dictionary:
	var events: Array = _unit_events(unit)
	var line: Dictionary = _item(unit["head"], "")
	line["events"] = events
	line["badges"] = badges_of(events)
	if unit["parts"] is Array and (unit["parts"] as Array).size() > 1:
		line.merge(_run_line(unit["parts"], names), true)
		return line
	var head: Dictionary = unit["head"]
	var effects: Array = unit["effects"]
	var children: Array = _details(effects, names) if effects.size() > 1 else []
	line["children"] = children
	if unit["outcome"] != null:
		var cast: String = _no_dot(_describe(names, head))
		if _t(unit["outcome"]) == "countered":
			line["text"] = "%s: não resolveu." % cast
			return line
		var parts: Array = effect_parts(effects, names, head.get("sourceId"))
		line["text"] = "%s: %s." % [cast, "; ".join(PackedStringArray(parts))] if not parts.is_empty() else "%s." % cast
		return line
	if _t(head) == "resolved" and not effects.is_empty():
		var parts: Array = effect_parts(effects, names, head.get("sourceId"))
		var name: String = _card_or(names, head, "Efeito")
		line["text"] = "%s (%s) resolveu: %s." % [name, _player(names, head.get("actor")), "; ".join(PackedStringArray(parts))] if not parts.is_empty() else _describe(names, head)
		return line
	line["text"] = _describe(names, head)
	if _t(head) == "attackers":
		var kids: Array = []
		for id: Variant in head.get("cards", []) if head.get("cards") is Array else []:
			var c: Variant = (names["cardById"] as Callable).call(id, head)
			if c is Dictionary:
				kids.append({"key": "e%dc%d" % [_seq(head), int((c as Dictionary).get("id", 0))], "text": Txt.of((names["label"] as Callable).call(c)), "card": c})
		line["children"] = kids
	elif _t(head) == "blockers":
		line["children"] = _blocks(head, names)
	return line


## "Grizzly Bears bloqueia Serra Angel", pelo combate como estava quando os bloqueadores foram declarados.
static func _blocks(head: Dictionary, names: Dictionary) -> Array:
	var mine: Array = head.get("cards", []) if head.get("cards") is Array else []
	var out: Array = []
	var frame: Dictionary = head["frame"] if head.get("frame") is Dictionary else {}
	for pair: Variant in frame.get("combat", []) if frame.get("combat") is Array else []:
		for id: Variant in (pair as Dictionary).get("blockers", []):
			if not mine.any(func(m: Variant) -> bool: return _same(m, id)):
				continue
			var blocker: Variant = (names["cardById"] as Callable).call(id, head)
			var attacker: Variant = (names["cardById"] as Callable).call((pair as Dictionary).get("attacker"), head)
			var b: String = Txt.of((names["label"] as Callable).call(blocker)) if blocker is Dictionary else "Criatura"
			var a: String = Txt.of((names["label"] as Callable).call(attacker)) if attacker is Dictionary else "um atacante"
			out.append({"key": "e%db%d" % [_seq(head), int(id)], "text": "%s bloqueia %s" % [b, a], "card": blocker})
	return out


static func _run_line(parts: Array, names: Dictionary) -> Dictionary:
	var first: Dictionary = (parts[0] as Dictionary)["head"]
	var key: String = _merge_key(parts[0])
	var heads: Array = parts.map(func(p: Dictionary) -> Dictionary: return p["head"])
	var n: int = parts.size()
	if key.begins_with("trigger:"):
		var name: String = _card_or(names, first, "uma carta")
		var ids: Array = []
		for e: Dictionary in heads:
			var id: int = int(e["stackId"]) if e.get("stackId") != null else _seq(e)
			if not ids.has(id):
				ids.append(id)
		var effects: Array = []
		for p: Dictionary in parts:
			effects.append_array(p["effects"])
		var said: Array = effect_parts(effects, names)
		var children: Array
		if not effects.is_empty():
			children = _details(effects, names)
		else:
			children = parts.map(func(p: Dictionary) -> Dictionary:
				var single: Dictionary = _line(_unit(p["head"], p["effects"], p["outcome"]), names)
				single.erase("children")
				return single)
		var resolved: bool = parts.any(func(p: Dictionary) -> bool: return p["outcome"] != null or _t(p["head"]) == "resolved")
		var tail: String = (": " + "; ".join(PackedStringArray(said))) if not said.is_empty() else ("" if resolved else " na pilha")
		return {"text": "%d gatilhos de %s%s." % [ids.size(), name, tail], "children": children}
	var children: Array = _details(heads, names)
	if key == "combat":
		var damage: Array = heads.filter(func(e: Dictionary) -> bool: return _t(e) == "damage")
		var said: Array = []
		var hit: Array = []
		for e: Dictionary in damage:
			for id: Variant in _targets(e, "players"):
				if not hit.any(func(h: Variant) -> bool: return _same(h, id)):
					hit.append(id)
		for id: Variant in hit:
			var hits: Array = damage.filter(func(e: Dictionary) -> bool: return _targets(e, "players").any(func(x: Variant) -> bool: return _same(x, id)))
			var total: int = 0
			for e: Dictionary in hits:
				total += absi(int(EventText.num(e, "delta")))
			var poison: bool = hits.all(func(e: Dictionary) -> bool: return EventText.truthy(e.get("infect")))
			said.append("%s sofreu %d %s" % [_player(names, id), total, "de veneno" if poison else "de dano"])
		var died: Array = heads.filter(func(e: Dictionary) -> bool: return _t(e) == "left")
		if not died.is_empty():
			if died.size() > 3:
				said.append("%d criaturas morreram" % died.size())
			else:
				said.append("%s %s" % [EventText.list_names(died.map(func(e: Dictionary) -> String: return _card_or(names, e, "uma criatura"))), "morreu" if died.size() == 1 else "morreram"])
		var lifelink: Array = heads.filter(func(e: Dictionary) -> bool: return _t(e) == "life-changed" and EventText.num(e, "delta") > 0)
		for actor: Variant in _actors_of(lifelink, "life-changed"):
			var gained: int = 0
			for e: Dictionary in _by(lifelink, "life-changed", actor):
				gained += int(EventText.num(e, "delta"))
			said.append("%s ganhou %d de vida" % [_player(names, actor), gained])
		if said.is_empty():
			var cards: Array = []
			for e: Dictionary in damage:
				for id: Variant in _targets(e, "cards"):
					if not cards.any(func(c: Variant) -> bool: return _same(c, id)):
						cards.append(id)
			said.append("dano em %s" % _permanents(cards.size()))
		return {"text": "Dano de combate: %s." % "; ".join(PackedStringArray(said)), "children": children}
	if key.begins_with("left:"):
		var what: Dictionary = {"destroyed": "destruídas", "sacrificed": "sacrificadas", "Exile": "exiladas", "Hand": "devolvidas à mão", "Library": "postas no grimório", "Graveyard": "postas no cemitério"}
		var list: String = EventText.list_names(heads.map(func(e: Dictionary) -> String: return _card_or(names, e, "uma carta")))
		return {"text": "%d cartas %s: %s." % [n, Txt.of(what.get(key.substr(5), "saíram do campo")), list], "children": children}
	if key == "entered":
		var text: String = _entered_text(heads, names)
		return {"text": "%s%s." % [text.left(1).to_upper(), text.substr(1)], "children": children}
	if key.begins_with("discard:"):
		var list: String = EventText.list_names(heads.map(func(e: Dictionary) -> String: return _card_or(names, e, "uma carta")))
		return {"text": "%s descartou %d cartas: %s." % [_player(names, first.get("actor")), n, list], "children": children}
	if key.begins_with("life:"):
		var delta: int = 0
		for e: Dictionary in heads:
			delta += int(EventText.num(e, "delta"))
		return {"text": "%s: %s%d de vida." % [_player(names, first.get("actor")), "+" if delta > 0 else "", delta], "children": children}
	return {"text": _describe(names, first), "children": children}


## Quantas jogadas o turno teve, para o cabeçalho de um turno recolhido.
static func turn_summary(turn: Dictionary) -> String:
	var n: int = (turn.get("lines", []) as Array).size()
	return "Nenhuma jogada" if n == 0 else ("1 jogada" if n == 1 else "%d jogadas" % n)


## A saída enxuta que os fixtures dourados guardam (PROJECT.historyTurns de scripts/godot-golden-record.mjs).
static func project(turns: Array) -> Array:
	return turns.map(func(t: Dictionary) -> Dictionary:
		return {"key": t["key"], "turn": t["turn"], "actor": t["actor"], "lines": (t["lines"] as Array).map(func(l: Dictionary) -> Dictionary:
			return {"key": l["key"], "text": l["text"], "card": (l["card"] as Dictionary).get("name") if l["card"] is Dictionary else null, "badges": l["badges"],
				"children": (l["children"] as Array).map(func(c: Dictionary) -> Dictionary:
					return {"text": c["text"], "card": (c["card"] as Dictionary).get("name") if c["card"] is Dictionary else null})})})
