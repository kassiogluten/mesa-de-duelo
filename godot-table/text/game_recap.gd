# O destaque do jogo que acabou (porte resumido de gameHighlight em src/ui/gameEnding.ts e das linhas de historyLog.ts):
# guarda os eventos do jogo, junta cada mágica com o que ela causou e o dano de combate com as mortes, e escolhe a jogada
# de mais dano em jogadores, de mais vida ganha ou a que mais tirou permanentes do campo.
class_name GameRecap
extends RefCounted

## O que uma mágica ou habilidade pode causar ao resolver (fica na linha dela).
const EFFECTS: PackedStringArray = ["left", "entered", "damage", "life-changed", "mill", "discard", "draw"]

var _events: Array = []
var _last_seq: int = -1


## Guarda os eventos novos de um estado; o turno 1 começa um jogo novo (na melhor de três, só vale o jogo atual).
func observe(state: Dictionary) -> void:
	var list: Array = state.get("events") if state.get("events") is Array else []
	for raw: Variant in list:
		if not raw is Dictionary:
			continue
		var event: Dictionary = raw
		var seq: int = int(event.get("seq", -1))
		if seq <= _last_seq:
			continue
		_last_seq = seq
		if Txt.of(event.get("type")) == "turn" and int(event.get("turn", 0)) == 1:
			_events.clear()
		_events.append(event)


## Os eventos guardados do jogo atual.
func events() -> Array:
	return _events


## O destaque: {kind, text, card} ou {} quando nenhuma jogada passa do mínimo. `label` traduz o nome de uma carta.
func highlight(state: Dictionary, label: Callable) -> Dictionary:
	return GameRecap.best(_events, state, label)


## Escolhe o destaque entre as jogadas de `events` (pesos da mesa do navegador: uma remoção vale 3 de dano; 4 de vida, 3).
static func best(events: Array, state: Dictionary, label: Callable) -> Dictionary:
	var chosen: Dictionary = {}
	var chosen_score: float = -1.0
	for unit: Dictionary in merge(units(events)):
		var all: Array = unit_events(unit)
		var damage: int = 0
		var healed: int = 0
		var removed: int = 0
		for e: Dictionary in all:
			var t: String = Txt.of(e.get("type"))
			if t == "damage" and not bool(e.get("prevented", false)) and not _list(_dict(e.get("targets")).get("players")).is_empty():
				damage += absi(int(e.get("delta", 0)))
			elif t == "life-changed" and int(e.get("delta", 0)) > 0:
				healed += int(e["delta"])
			elif _removal(e):
				removed += 1
		var options: Array = []
		if damage >= 3:
			options.append({"kind": "Maior golpe", "score": float(damage)})
		if healed >= 4:
			options.append({"kind": "Maior ganho de vida", "score": healed * 0.75})
		if removed >= 2:
			options.append({"kind": "Maior limpeza", "score": removed * 3.0})
		if options.is_empty():
			continue
		options.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["score"]) > float(b["score"]))
		var top: Dictionary = options[0]
		if float(top["score"]) >= chosen_score:
			chosen_score = float(top["score"])
			var head: Dictionary = unit["head"]
			var card: Dictionary = _dict(head.get("card"))
			chosen = {"kind": top["kind"], "text": line_text(unit, state, label), "card": card if card.has("name") and not bool(card.get("faceDown", false)) else {}}
	return chosen


## Saídas do campo que tiram a permanente do jogo de alguém (morrer, ser exilada, voltar para a mão ou o grimório).
static func _removal(e: Dictionary) -> bool:
	return Txt.of(e.get("type")) == "left" and not (Txt.of(e.get("reason")) in ["warped", "ninjutsu", "sneak"]) and Txt.of(e.get("to")) != "Battlefield"


static func _dict(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


static func _list(value: Variant) -> Array:
	return value if value is Array else []


static func _plain(unit: Dictionary) -> bool:
	return not unit.has("outcome") and (unit["effects"] as Array).is_empty() and not unit.has("parts")


## Primeira passada: cada evento vira uma unidade, e a resolução leva junto o que aconteceu enquanto ela acontecia.
static func units(events: Array) -> Array:
	var list: Array = []
	for raw: Variant in events:
		var event: Dictionary = raw
		var t: String = Txt.of(event.get("type"))
		if (t == "resolved" or t == "countered") and event.get("stackId") != null:
			var stack_id: int = int(event["stackId"])
			var effects: Array = []
			while not list.is_empty() and _plain(list[-1]):
				var head: Dictionary = list[-1]["head"]
				var frame_stack: Array = _list(_dict(head.get("frame")).get("stack"))
				var from_this: bool = EFFECTS.has(Txt.of(head.get("type"))) and not frame_stack.is_empty() and int(_dict(frame_stack[0]).get("id", -1)) == stack_id
				if not from_this and Txt.of(head.get("type")) != "draw":
					break
				effects.push_front((list.pop_back() as Dictionary)["head"])
			var cast: Dictionary = list[-1] if not list.is_empty() else {}
			if not cast.is_empty() and _plain(cast) and _dict(cast["head"]).get("stackId") != null and int(cast["head"]["stackId"]) == stack_id \
					and Txt.of(cast["head"].get("type")) in ["spell-cast", "ability-activated"]:
				list[-1] = {"head": cast["head"], "effects": effects, "outcome": event}
			else:
				list.append({"head": event, "effects": effects})
			continue
		list.append({"head": event, "effects": []})
	return list


## Que tipo de linha é, para juntar as parecidas e seguidas ("" nunca junta).
static func merge_key(unit: Dictionary) -> String:
	if not _plain(unit):
		return ""
	var head: Dictionary = unit["head"]
	match Txt.of(head.get("type")):
		"damage":
			return "combat" if bool(head.get("combat", false)) else ""
		"left":
			return "left:" + (Txt.of(head.get("reason")) if Txt.of(head.get("reason")) != "" else Txt.of(head.get("to")))
		"entered":
			return "entered"
		"life-changed":
			return "life:%s:%d" % [Txt.of(head.get("actor")), signi(int(head.get("delta", 0)))]
	return ""


static func _joins(run: Dictionary, unit: Dictionary) -> bool:
	var key: String = merge_key((run["parts"] as Array)[0] if run.has("parts") else run)
	if key == "":
		return false
	if key == "combat":
		var t: String = Txt.of(_dict(unit["head"]).get("type"))
		return _plain(unit) and ((t == "damage" and bool(_dict(unit["head"]).get("combat", false))) or t == "life-changed" or t == "left")
	return merge_key(unit) == key


## Segunda passada: as linhas parecidas e seguidas (o dano de combate com as mortes, as remoções em sequência) viram uma.
static func merge(list: Array) -> Array:
	var out: Array = []
	for unit: Dictionary in list:
		if not out.is_empty() and _joins(out[-1], unit):
			var last: Dictionary = out[-1]
			var parts: Array = last["parts"] if last.has("parts") else [last]
			out[-1] = {"head": (parts[0] as Dictionary)["head"], "effects": [], "parts": parts + [unit]}
		else:
			out.append(unit)
	return out


## Todos os eventos de uma linha: a jogada, o que ela causou, a resolução e as linhas juntadas a ela.
static func unit_events(unit: Dictionary) -> Array:
	if unit.has("parts"):
		var all: Array = []
		for part: Dictionary in unit["parts"]:
			all.append_array(unit_events(part))
		return all
	var out: Array = [unit["head"]]
	out.append_array(unit["effects"])
	if unit.has("outcome"):
		out.append(unit["outcome"])
	return out


# — Texto —

static func _player(state: Dictionary, id: Variant) -> String:
	if id == null:
		return "Jogador"
	return StackText.player_name(state, int(id), "Jogador")


static func _card_name(event: Dictionary, label: Callable) -> String:
	var card: Dictionary = _dict(event.get("card"))
	if Txt.of(card.get("name")) == "" or bool(card.get("faceDown", false)):
		return ""
	return Txt.of(label.call(Txt.of(card["name"])))


## Junta "a", "b" e "c" como "a, b e c"; com muitas, corta e diz quantas faltam.
static func list_names(names: PackedStringArray, max_shown: int = 4) -> String:
	var shown: PackedStringArray = names.slice(0, max_shown)
	if names.size() > max_shown:
		shown.append("mais %d" % (names.size() - max_shown))
	if shown.size() > 1:
		return "%s e %s" % [", ".join(shown.slice(0, shown.size() - 1)), shown[shown.size() - 1]]
	return shown[0] if not shown.is_empty() else ""


## O nome de uma carta citada pelo evento (alvo), pelo estado ou pela mesa gravada no evento.
static func _target_card(state: Dictionary, event: Dictionary, id: int, label: Callable) -> String:
	var card: Dictionary = StackText.find_card(state, id)
	if card.is_empty():
		for raw: Variant in _list(_dict(event.get("frame")).get("players")):
			for c: Variant in _list(_dict(raw).get("battlefield")):
				if int(_dict(c).get("id", -1)) == id:
					card = c
	return Txt.of(label.call(Txt.of(card["name"]))) if card.has("name") else "#%d" % id


## A frase da jogada que abre a linha ("Ana conjurou Raio", "Gatilho de Arconte"), sem o ponto.
static func describe(event: Dictionary, state: Dictionary, label: Callable) -> String:
	var who: String = _player(state, event.get("actor"))
	var name: String = _card_name(event, label)
	var shown: String = name if name != "" else "uma carta"
	match Txt.of(event.get("type")):
		"spell-cast":
			return "%s conjurou %s" % [who, shown]
		"ability-activated":
			if bool(event.get("trigger", false)):
				return "Gatilho de %s" % name if name != "" else "Gatilho"
			return "%s ativou uma habilidade de %s" % [who, name] if name != "" else "%s ativou uma habilidade" % who
		"resolved":
			return "Resolução: %s" % (name if name != "" else "efeito")
		"damage":
			var n: int = absi(int(event.get("delta", 0)))
			var targets: PackedStringArray = _damage_targets([event], state, label)
			var from: String = " de %s" % name if name != "" else ""
			return ("%s sofreu %d de dano%s" % [", ".join(targets), n, from]) if not targets.is_empty() else "%d de dano causado%s" % [n, from]
		"life-changed":
			var delta: int = int(event.get("delta", 0))
			return "%s: %s%d de vida" % [who, "+" if delta > 0 else "", delta]
		"left":
			return "%s saiu do campo" % shown
	return Re.replace_all(r" \(\d+\)", Txt.of(event.get("text")), "").trim_suffix(".") if Txt.of(event.get("text")) != "" else "O jogo avançou"


static func _damage_targets(damage: Array, state: Dictionary, label: Callable) -> PackedStringArray:
	var out: PackedStringArray = []
	for e: Dictionary in damage:
		var targets: Dictionary = _dict(e.get("targets"))
		for id: Variant in _list(targets.get("players")):
			var n: String = _player(state, id)
			if not out.has(n):
				out.append(n)
		for id: Variant in _list(targets.get("cards")):
			var n: String = _target_card(state, e, int(id), label)
			if not out.has(n):
				out.append(n)
	return out


## O que a mágica ou o combate causou, em poucas palavras ("destruiu 3 permanentes", "causou 5 de dano a Ana").
static func effect_parts(events: Array, state: Dictionary, label: Callable, skip: int = -1) -> PackedStringArray:
	var parts: PackedStringArray = []
	var left: Array = events.filter(func(e: Dictionary) -> bool: return Txt.of(e.get("type")) == "left")
	var leaving: Array = [["destroyed", "destruiu %s"], ["sacrificed", "fez sacrificar %s"], ["Exile", "exilou %s"], ["Hand", "devolveu %s à mão"],
		["Library", "pôs %s no grimório"], ["Graveyard", "mandou %s para o cemitério"], ["", "tirou %s do campo"]]
	var kinds: PackedStringArray = ["destroyed", "sacrificed", "Exile", "Hand", "Library", "Graveyard"]
	for pair: Array in leaving:
		var group: Array = left.filter(func(e: Dictionary) -> bool:
			var k: String = Txt.of(e.get("reason")) if Txt.of(e.get("reason")) != "" else (Txt.of(e.get("to")) if kinds.has(Txt.of(e.get("to"))) else "")
			return k == pair[0])
		if group.is_empty():
			continue
		var what: String = ""
		if group.size() == 1:
			what = _card_name(group[0], label)
			if what == "":
				what = "uma permanente"
		else:
			what = "%d permanentes" % group.size()
		parts.append(Txt.of(pair[1]) % what)
	var entered: Array = events.filter(func(e: Dictionary) -> bool: return Txt.of(e.get("type")) == "entered" and int(e.get("sourceId", -2)) != skip)
	if entered.size() == 1:
		var n: String = _card_name(entered[0], label)
		parts.append("%s entrou no campo" % (n if n != "" else "uma permanente"))
	elif entered.size() > 1:
		parts.append("%d permanentes entraram no campo" % entered.size())
	var damage: Array = events.filter(func(e: Dictionary) -> bool: return Txt.of(e.get("type")) == "damage" and not bool(e.get("prevented", false)))
	if not damage.is_empty():
		var total: int = 0
		for e: Dictionary in damage:
			total += absi(int(e.get("delta", 0)))
		var targets: PackedStringArray = _damage_targets(damage, state, label)
		if targets.size() > 3:
			parts.append("causou %d de dano a %d alvos" % [total, targets.size()])
		else:
			parts.append("causou %d de dano%s" % [total, (" a " + list_names(targets)) if not targets.is_empty() else ""])
	var damaged: Dictionary = {}
	for e: Dictionary in damage:
		for id: Variant in _list(_dict(e.get("targets")).get("players")):
			damaged[int(id)] = true
	var life: Dictionary = {}
	for e: Dictionary in events:
		if Txt.of(e.get("type")) == "life-changed" and e.get("actor") != null:
			life[int(e["actor"])] = int(life.get(int(e["actor"]), 0)) + int(e.get("delta", 0))
	for actor: int in life:
		if int(life[actor]) > 0:
			parts.append("%s ganhou %d de vida" % [_player(state, actor), life[actor]])
		elif int(life[actor]) < 0 and not damaged.has(actor):
			parts.append("%s perdeu %d de vida" % [_player(state, actor), -int(life[actor])])
	return parts


## A frase da linha inteira, como no Histórico.
static func line_text(unit: Dictionary, state: Dictionary, label: Callable) -> String:
	if unit.has("parts") and (unit["parts"] as Array).size() > 1:
		return _run_text(unit["parts"], state, label)
	var head: Dictionary = unit["head"]
	if unit.has("outcome"):
		var cast: String = describe(head, state, label)
		if Txt.of(_dict(unit["outcome"]).get("type")) == "countered":
			return "%s: não resolveu." % cast
		var parts: PackedStringArray = effect_parts(unit["effects"], state, label, int(head.get("sourceId", -1)))
		return "%s: %s." % [cast, "; ".join(parts)] if not parts.is_empty() else cast + "."
	if Txt.of(head.get("type")) == "resolved" and not (unit["effects"] as Array).is_empty():
		var parts: PackedStringArray = effect_parts(unit["effects"], state, label, int(head.get("sourceId", -1)))
		var name: String = _card_name(head, label)
		return "%s (%s) resolveu: %s." % [name if name != "" else "Efeito", _player(state, head.get("actor")), "; ".join(parts)] if not parts.is_empty() else describe(head, state, label) + "."
	return describe(head, state, label) + "."


static func _run_text(parts: Array, state: Dictionary, label: Callable) -> String:
	var key: String = merge_key(parts[0])
	var heads: Array = parts.map(func(p: Dictionary) -> Dictionary: return p["head"])
	if key == "combat":
		var damage: Array = heads.filter(func(e: Dictionary) -> bool: return Txt.of(e.get("type")) == "damage")
		var said: PackedStringArray = []
		var hit: Array = []
		for e: Dictionary in damage:
			for id: Variant in _list(_dict(e.get("targets")).get("players")):
				if not hit.has(int(id)):
					hit.append(int(id))
		for id: int in hit:
			var total: int = 0
			for e: Dictionary in damage:
				if _list(_dict(e.get("targets")).get("players")).any(func(p: Variant) -> bool: return int(p) == id):
					total += absi(int(e.get("delta", 0)))
			said.append("%s sofreu %d de dano" % [_player(state, id), total])
		var died: Array = heads.filter(func(e: Dictionary) -> bool: return Txt.of(e.get("type")) == "left")
		if died.size() > 3:
			said.append("%d criaturas morreram" % died.size())
		elif not died.is_empty():
			var names: PackedStringArray = []
			for e: Dictionary in died:
				var n: String = _card_name(e, label)
				names.append(n if n != "" else "uma criatura")
			said.append("%s %s" % [list_names(names), "morreu" if died.size() == 1 else "morreram"])
		var gained: Dictionary = {}
		for e: Dictionary in heads:
			if Txt.of(e.get("type")) == "life-changed" and int(e.get("delta", 0)) > 0 and e.get("actor") != null:
				gained[int(e["actor"])] = int(gained.get(int(e["actor"]), 0)) + int(e["delta"])
		for actor: int in gained:
			said.append("%s ganhou %d de vida" % [_player(state, actor), gained[actor]])
		if said.is_empty():
			said.append("dano em criaturas")
		return "Dano de combate: %s." % "; ".join(said)
	if key.begins_with("left:"):
		var what: Dictionary = {"destroyed": "destruídas", "sacrificed": "sacrificadas", "Exile": "exiladas", "Hand": "devolvidas à mão", "Library": "postas no grimório", "Graveyard": "postas no cemitério"}
		var names: PackedStringArray = []
		for e: Dictionary in heads:
			var n: String = _card_name(e, label)
			names.append(n if n != "" else "uma carta")
		return "%d cartas %s: %s." % [heads.size(), what.get(key.substr(5), "saíram do campo"), list_names(names)]
	if key.begins_with("life:"):
		var delta: int = 0
		for e: Dictionary in heads:
			delta += int(e.get("delta", 0))
		return "%s: %s%d de vida." % [_player(state, (heads[0] as Dictionary).get("actor")), "+" if delta > 0 else "", delta]
	if key == "entered":
		return "%d permanentes entraram no campo." % heads.size()
	return describe(heads[0], state, label) + "."
