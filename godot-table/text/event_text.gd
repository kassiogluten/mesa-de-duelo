# A frase de cada evento da partida, para o histórico (porte de src/ui/eventText.ts, conferido pelos fixtures dourados).
# A "vista" é um Dictionary com Callables: state() → estado, label(carta) → nome, findCard(id) → carta, ptName(nome) → nome em português.
class_name EventText
extends RefCounted

const SWAP := {"ninjutsu": "Ninjutsu", "sneak": "Sneak"}
const ZONE_FROM := {"Graveyard": "do cemitério", "Exile": "do exílio", "Command": "da zona de comando", "Library": "do grimório"}


## Verdadeiro como no JavaScript: null, false, 0 e "" são falsos.
static func truthy(value: Variant) -> bool:
	if value == null:
		return false
	if value is bool:
		return value
	if value is int or value is float:
		return value != 0
	if value is String:
		return value != ""
	return true


## O número do campo, ou o padrão quando falta (o `??` do JavaScript).
static func num(d: Dictionary, key: String, fallback: float = 0.0) -> float:
	return float(d[key]) if d.get(key) != null else fallback


static func _state(v: Dictionary) -> Dictionary:
	var s: Variant = (v["state"] as Callable).call()
	return s if s is Dictionary else {}


static func _label(v: Dictionary, card: Variant) -> String:
	return Txt.of((v["label"] as Callable).call(card))


static func _find(v: Dictionary, id: Variant) -> Variant:
	var c: Variant = (v["findCard"] as Callable).call(id)
	return c if c is Dictionary else null


static func _pt(v: Dictionary, name: String) -> String:
	var pt: Variant = (v["ptName"] as Callable).call(name)
	return Txt.of(pt) if truthy(pt) else name


## O nome do jogador pelo id, ou null.
static func player_name(state: Dictionary, id: Variant) -> Variant:
	if id == null:
		return null
	for p: Variant in state.get("players", []):
		if (p as Dictionary).get("id") != null and float((p as Dictionary)["id"]) == float(id):
			return (p as Dictionary).get("name")
	return null


static func _card(event: Dictionary) -> Dictionary:
	return event["card"] if event.get("card") is Dictionary else {}


static func _targets(event: Dictionary, kind: String) -> Array:
	var t: Variant = event.get("targets")
	if not t is Dictionary or not (t as Dictionary).get(kind) is Array:
		return []
	return (t as Dictionary)[kind]


static func _same_id(a: Variant, b: Variant) -> bool:
	return a != null and b != null and float(a) == float(b)


## Junta "a", "b" e "c" como "a, b e c"; com muitas, corta e diz quantas faltam (listNames de historyLog.ts).
static func list_names(names: Array, max_shown: Variant = 4) -> String:
	var limit: int = 4 if max_shown == null else int(max_shown)
	var shown: Array = names.slice(0, limit)
	if names.size() > limit:
		shown.append("mais %d" % (names.size() - limit))
	if shown.size() > 1:
		return "%s e %s" % [", ".join(PackedStringArray(shown.slice(0, -1).map(func(n: Variant) -> String: return Txt.of(n)))), Txt.of(shown[-1])]
	return Txt.of(shown[0]) if not shown.is_empty() else ""


## Tira os ids das cartas do texto do Forge ("Raio (12)" → "Raio").
static func without_card_ids(text: String) -> String:
	var re := RegEx.create_from_string(" \\(\\d+\\)")
	return re.sub(text, "", true)


## A frase de um evento. `detailed` (no histórico) acrescenta alvos, de quem era a carta e de onde ela veio.
static func describe(v: Dictionary, event: Dictionary, detailed: bool = false) -> String:
	if event.get("sweep") is Dictionary:
		return _sweep_description(v, event)
	var s: Dictionary = _state(v)
	var actor: Variant = event.get("actor")
	var who_v: Variant = player_name(s, actor)
	var who: String = Txt.of(who_v) if who_v != null else "Jogador"
	var card: Dictionary = _card(event)
	var has_name: bool = truthy(card.get("name"))
	var name: String = _label(v, card) if has_name else "uma carta"
	var on: String = history_targets(v, event) if detailed else ""
	var from_zone: String = Txt.of(event.get("from"))
	var from: String = (" " + Txt.of(ZONE_FROM[from_zone])) if detailed and ZONE_FROM.has(from_zone) else ""
	var owner: String = ""
	if detailed and actor != null:
		owner = " (%s)" % ("sua" if _same_id(actor, s.get("you")) else "de %s" % who)
	var type: String = Txt.of(event.get("type"))
	match type:
		"land-played":
			return "%s jogou %s%s." % [who, name, from]
		"spell-cast":
			if truthy(event.get("copy")):
				var copies: int = int(num(event, "copies", 1))
				return "%s criou %d cópias de %s." % [who, copies, name] if copies > 1 else "%s copiou %s%s." % [who, name, on]
			var extras: PackedStringArray = []
			if truthy(event.get("kicked")):
				extras.append("com reforço")
			if event.get("x") != null:
				extras.append("com X = %d" % int(event["x"]))
			var extra: String = " e ".join(extras)
			return "%s conjurou %s%s%s%s." % [who, name, from, (" " + extra) if extra != "" else "", on]
		"survived":
			return "%s se regenerou%s." % [name, owner] if event.get("survived") == "regenerated" else "%s é indestrutível e ficou no campo%s." % [name, owner]
		"cascade":
			return _cascade_description(v, event, who)
		"ability-activated":
			if truthy(event.get("ward")):
				return "Proteção contra alvos de %s%s." % [name, on]
			if truthy(event.get("loyalty")) and not truthy(event.get("trigger")):
				return loyalty_description(event, who, name, on)
			var of: String = (" de " + name) if has_name else ""
			if truthy(event.get("trigger")):
				return "Gatilho%s%s." % [of, on]
			return "%s ativou uma habilidade%s%s." % [who, of, on]
		"draw":
			var n: int = int(num(event, "count", 1))
			var what: String = "uma carta" if n == 1 else "%d cartas" % n
			return "%s buscou %s no grimório." % [who, what] if truthy(event.get("searched")) else "%s comprou %s." % [who, what]
		"scry":
			var top: int = int(num(event, "top"))
			var bottom: int = int(num(event, "bottom"))
			var total: int = top + bottom
			var where: String
			if top > 0 and bottom > 0:
				where = "%d no topo e %d no fundo" % [top, bottom]
			elif top > 0:
				where = ("a carta ficou" if total == 1 else "todas ficaram") + " no topo"
			else:
				where = ("a carta foi" if total == 1 else "todas foram") + " para o fundo"
			return "%s fez vidência %d: %s." % [who, total, where]
		"coin":
			if truthy(event.get("startingToss")):
				return "Moeda para ver quem começa: %s começa." % who
			return "%s jogou uma moeda: %s." % [who, "cara" if truthy(event.get("heads")) else "coroa"]
		"starting-roll":
			return starting_roll_text(event, func(id: Variant) -> String:
				if _same_id(id, s.get("you")):
					return "Você"
				var pn: Variant = player_name(s, id)
				return Txt.of(pn) if pn != null else "Jogador")
		"die":
			var source: String = Txt.of(event.get("sourceName"))
			var result: String = str(int(event["result"])) if event.get("result") != null else "?"
			return "%s rolou um d%d: %s%s." % [who, int(num(event, "sides", 6)), result, (" (%s)" % _pt(v, source)) if source != "" else ""]
		"attached":
			var cards: Array = _targets(event, "cards")
			var players: Array = _targets(event, "players")
			var host_id: Variant = cards[0] if not cards.is_empty() else null
			var host_card: Variant = null
			if host_id != null:
				host_card = _find(v, host_id)
				if host_card == null:
					host_card = frame_card(host_id, event)
			var host: String
			if host_card != null:
				host = _label(v, host_card)
			else:
				var pn: Variant = player_name(s, players[0] if not players.is_empty() else null)
				host = Txt.of(pn) if pn != null else "outra permanente"
			var type_line: String = Txt.of(card.get("typeLine"))
			var kind: String = "Equipar" if type_line.contains("Equipment") else ("Encantar" if type_line.contains("Aura") else "Anexar")
			return "%s: %s passou para %s." % [kind, name, host] if truthy(event.get("moved")) else "%s: %s em %s." % [kind, name, host]
		"control-changed":
			var was: String = ""
			if detailed and event.get("previous") != null:
				var pn: Variant = player_name(s, event["previous"])
				was = " (era de %s)" % (Txt.of(pn) if pn != null else "outro jogador")
			return "%s ganhou o controle de %s%s." % [who, name, was]
		"resolved":
			if truthy(event.get("ward")) and event.get("held") != null:
				return "Proteção contra alvos de %s: %s." % [name, "anulou o efeito" if truthy(event["held"]) else "custo pago"]
			return "Resolução: %s." % (name if has_name else "efeito")
		"countered":
			return "Anulado: %s." % (name if has_name else "efeito")
		"left":
			var reason: String = Txt.of(event.get("reason"))
			var to: String = Txt.of(event.get("to"))
			if reason == "ninjutsu" or reason == "sneak":
				return "%s: %s volta para a mão%s." % [SWAP[reason], name, owner]
			if reason == "destroyed":
				return "Carta destruída: %s%s." % [name, owner]
			if reason == "sacrificed":
				return "Carta sacrificada: %s%s." % [name, owner]
			if to == "Exile":
				return "Carta exilada: %s%s." % [name, owner]
			if to == "Hand":
				return "Volta para a mão: %s%s." % [name, owner]
			if to == "Library":
				return "Volta para o grimório: %s%s." % [name, owner]
			if detailed and to == "Graveyard":
				return "Para o cemitério: %s%s." % [name, owner]
			return "%s%s saiu do campo." % [name, owner]
		"discard":
			return "%s descartou %s." % [who, name]
		"mill":
			return mill_description(v, event, who)
		"entered":
			var entries: Array = event.get("entries", []) if event.get("entries") is Array else []
			if entries.size() > 1:
				return entries_description(v, entries, event.get("from"))
			var reason: String = Txt.of(event.get("reason"))
			if reason == "ninjutsu" or reason == "sneak":
				var swap: String = Txt.of(event.get("swapName"))
				return "%s: %s entra atacando%s%s." % [SWAP[reason], name, (" no lugar de " + _pt(v, swap)) if swap != "" else "", owner]
			if from_zone == "Exile":
				return "Volta ao campo: %s%s." % [name, owner]
			if detailed and from_zone == "Graveyard":
				return "Volta do cemitério ao campo: %s%s." % [name, owner]
			if detailed and truthy(card.get("token")) and not truthy(event.get("from")):
				return "Ficha criada: %s%s." % [name, owner]
			return "%s entrou no campo%s." % [name, owner]
		"attackers":
			return attack_description(v, event)
		"blockers":
			var n: int = (event.get("cards") as Array).size() if event.get("cards") is Array else 0
			if detailed and n > 0:
				return "%s bloqueou com %d %s." % [who, n, "criatura" if n == 1 else "criaturas"]
			return "%s declarou bloqueadores." % who
		"turn":
			return ("Turno extra de %s." if truthy(event.get("extra")) else "Turno de %s.") % who
		"damage":
			return _damage_description(v, event, s, card)
		"life-changed":
			var delta: float = num(event, "delta")
			return "%s: %s%d de vida." % [who, "+" if delta > 0 else "", int(delta)]
	return without_card_ids(Txt.of(event["text"])) if truthy(event.get("text")) else "O jogo avançou."


static func _damage_description(v: Dictionary, event: Dictionary, s: Dictionary, card: Dictionary) -> String:
	var n: int = absi(int(num(event, "delta")))
	var names: PackedStringArray = []
	for id: Variant in _targets(event, "players"):
		var pn: Variant = player_name(s, id)
		if truthy(pn):
			names.append(Txt.of(pn))
	for id: Variant in _targets(event, "cards"):
		var c: Variant = _find(v, id)
		if c == null:
			c = frame_card(id, event)
		if c != null:
			var label: String = _label(v, c)
			if label != "":
				names.append(label)
	var target: String = ", ".join(names)
	var from: String = (" de " + _label(v, card)) if truthy(card.get("name")) and not truthy(card.get("faceDown")) else ""
	var what: String
	if truthy(event.get("infect")) and not _targets(event, "players").is_empty():
		what = "%d de veneno" % n
	elif truthy(event.get("wither")):
		what = "%d marcador%s −1/−1" % [n, "" if n == 1 else "es"]
	else:
		what = "%d de dano" % n
	if truthy(event.get("protection")):
		return "A proteção%s segurou %d de dano%s." % [(" de " + target) if target != "" else "", n, from]
	if truthy(event.get("prevented")):
		return "Escudo preveniu %d de dano%s%s." % [n, (" a " + target) if target != "" else "", from]
	return "%s%s%s." % ["%s sofreu %s" % [target, what] if target != "" else "%s causado" % what, from, damage_detail(event)]


## O que muda o golpe, entre parênteses (damageDetail de damageEffects.ts).
static func damage_detail(event: Dictionary) -> String:
	var parts: PackedStringArray = []
	var to_player: bool = not _targets(event, "players").is_empty()
	if truthy(event.get("protection")):
		parts.append("Proteção")
	elif truthy(event.get("prevented")):
		parts.append("Prevenido")
	if num(event, "divided") > 1:
		parts.append("Dividido")
	var combat: bool = truthy(event.get("combat"))
	if combat and event.get("step") == "first-strike":
		parts.append("1º golpe" if truthy(event.get("doubleStrike")) else "Iniciativa")
	elif combat and truthy(event.get("doubleStrike")):
		parts.append("2º golpe")
	if truthy(event.get("trample")):
		parts.append("Atropelar")
	if truthy(event.get("commander")):
		parts.append("Comandante")
	if truthy(event.get("lifelink")):
		parts.append("Vínculo com a vida")
	if truthy(event.get("fight")):
		parts.append("Luta")
	if truthy(event.get("deathtouch")) and not to_player:
		parts.append("Toque mortífero")
	var tone_wither: bool = not truthy(event.get("protection")) and not truthy(event.get("prevented")) and not (truthy(event.get("infect")) and to_player) and truthy(event.get("wither"))
	if tone_wither:
		parts.append("marcadores −1/−1")
	return " (%s)" % ", ".join(parts) if not parts.is_empty() else ""


## "Cascata de Bloodbraid Elf: 3 cartas reveladas; Ana conjurou Lightning Bolt."
static func _cascade_description(v: Dictionary, event: Dictionary, who: String) -> String:
	var revealed: Array = event.get("revealed", []) if event.get("revealed") is Array else []
	var n: int = revealed.size()
	var card: Dictionary = _card(event)
	var what: String = ("Descobrir" if event.get("dig") == "discover" else "Cascata") + ((" de " + _label(v, card)) if truthy(card.get("name")) else "")
	var hit: Variant = null
	for c: Variant in revealed:
		if hit == null and _same_id((c as Dictionary).get("id"), event.get("hit")):
			hit = c
	var found: String = "; nenhuma carta serviu"
	if hit != null:
		found = "; %s %s %s" % [who, "conjurou" if truthy(event.get("cast")) else "encontrou", _label(v, hit)]
	return "%s: %d %s%s." % [what, n, "carta revelada" if n == 1 else "cartas reveladas", found]


## "Ana usou +2 de Jace Beleren." ou "Ana usou o ultimate de Jace Beleren (−10)."
static func loyalty_description(event: Dictionary, who: String, name: String, on: String) -> String:
	var cost: String = ""
	if Txt.of(event.get("type")) == "ability-activated" and truthy(event.get("loyalty")):
		var raw: String = Txt.of(event.get("cost")).strip_edges()
		cost = ("−" + raw.substr(1)) if raw.begins_with("-") else raw
	if truthy(event.get("ultimate")):
		return "%s usou o ultimate de %s%s%s." % [who, name, (" (%s)" % cost) if cost != "" else "", on]
	return "%s usou %s de %s%s." % [who, cost, name, on] if cost != "" else "%s usou uma habilidade de lealdade de %s%s." % [who, name, on]


## Limpa campo: "Wrath of God: 9 permanentes destruídas." ou "Pyroclasm: 2 de dano em 7 criaturas."
static func _sweep_description(v: Dictionary, event: Dictionary) -> String:
	var sweep: Dictionary = event["sweep"]
	var events: Array = sweep.get("events", [])
	var cause: String = "Limpa campo"
	if sweep.get("cause") is Dictionary and truthy((sweep["cause"] as Dictionary).get("name")):
		cause = _label(v, sweep["cause"])
	elif truthy(sweep.get("name")):
		cause = _pt(v, Txt.of(sweep["name"]))
	if Txt.of(event.get("type")) != "damage":
		return "%s: %s." % [cause, sweep_outcome(events)]
	var amounts: Dictionary = {}
	for e: Variant in events:
		amounts[absi(int(num(e, "delta")))] = true
	var single: Variant = amounts.keys()[0] if amounts.size() == 1 else null
	var what: String
	if truthy(event.get("wither")):
		what = "marcadores −1/−1" if single == null else "%d marcador%s −1/−1" % [single, "" if single == 1 else "es"]
	else:
		what = "dano" if single == null else "%d de dano" % single
	var cards: Array = []
	var players: Dictionary = {}
	for e: Variant in events:
		for id: Variant in _targets(e, "cards"):
			if not cards.has(id):
				cards.append(id)
		for id: Variant in _targets(e, "players"):
			players[id] = true
	var creatures: bool = true
	for id: Variant in cards:
		var c: Variant = _find(v, id)
		if c == null:
			for e: Variant in events:
				if c == null:
					c = frame_card(id, e)
		if c != null and not truthy((c as Dictionary).get("creature")):
			creatures = false
	var who: String = ""
	if players.size() > 0:
		who = " e %d %s" % [players.size(), "jogador" if players.size() == 1 else "jogadores"]
	return "%s: %s em %d %s%s." % [cause, what, cards.size(), "criaturas" if creatures else "permanentes", who]


## O que aconteceu com as permanentes, quando foi o mesmo para todas ("destruídas"); senão, "saíram do campo".
static func sweep_outcome(events: Array) -> String:
	var tests: Array = [["reason", "destroyed", "destruídas"], ["reason", "sacrificed", "sacrificadas"], ["to", "Exile", "exiladas"], ["to", "Hand", "devolvidas à mão"], ["to", "Library", "postas no grimório"]]
	for t: Array in tests:
		if events.all(func(e: Dictionary) -> bool: return e.get(t[0]) == t[1]):
			return "%d permanentes %s" % [events.size(), t[2]]
	return "%d permanentes saíram do campo" % events.size()


## Uma carta que já saiu do campo, como estava na mesa no momento do evento.
static func frame_card(id: Variant, event: Dictionary) -> Variant:
	var frame: Variant = event.get("frame")
	if not frame is Dictionary:
		return null
	for p: Variant in (frame as Dictionary).get("players", []):
		for c: Variant in (p as Dictionary).get("battlefield", []):
			if _same_id((c as Dictionary).get("id"), id):
				return c
	for si: Variant in (frame as Dictionary).get("stack", []):
		var source: Variant = (si as Dictionary).get("source")
		if source is Dictionary and _same_id((source as Dictionary).get("id"), id):
			return source
	return null


## " em Bruno e Llanowar Elves": os alvos da mágica ou da habilidade, para o histórico.
static func history_targets(v: Dictionary, event: Dictionary) -> String:
	var type: String = Txt.of(event.get("type"))
	if type != "spell-cast" and type != "ability-activated":
		return ""
	var s: Dictionary = _state(v)
	var names: Array = []
	for id: Variant in _targets(event, "players"):
		var n: Variant = "você" if _same_id(id, s.get("you")) else player_name(s, id)
		if truthy(n):
			names.append(Txt.of(n))
	for id: Variant in _targets(event, "cards"):
		var c: Variant = _find(v, id)
		if c == null:
			c = frame_card(id, event)
		if c != null:
			var label: String = _label(v, c)
			if label != "":
				names.append(label)
	return " em " + list_names(names) if not names.is_empty() else ""


## "Oponente moeu 3 cartas com Thought Scour: Forest, Llanowar Elves e Giant Growth."
static func mill_description(v: Dictionary, event: Dictionary, who: String) -> String:
	var cards: Array = event["milled"] if event.get("milled") is Array else ([event["card"]] if event.get("card") is Dictionary else [])
	var names: Array = cards.slice(0, 5).map(func(c: Variant) -> String: return _label(v, c))
	if cards.size() > 5:
		names.append("mais %d" % (cards.size() - 5))
	var list: String = ("%s e %s" % [", ".join(PackedStringArray(names.slice(0, -1))), names[-1]]) if names.size() > 1 else (Txt.of(names[0]) if not names.is_empty() else "")
	var n: int = cards.size()
	var what: String = "uma carta" if n == 1 else "%d cartas" % n
	var source: String = Txt.of(event.get("sourceName"))
	var by: String = (" com " + _pt(v, source)) if source != "" else ""
	if truthy(event.get("surveil")):
		return "%s pôs %s do grimório no cemitério%s%s." % [who, what, by, (": " + list) if list != "" else ""]
	if n == 1 and list != "":
		return "%s moeu %s%s." % [who, list, by]
	return "%s moeu %s%s%s." % [who, what, by, (": " + list) if list != "" else ""]


## "8 fichas de Rabbit entraram no campo." — as permanentes que a mesma resolução pôs no campo de uma vez.
static func entries_description(v: Dictionary, cards: Array, from: Variant) -> String:
	if cards.is_empty():
		return ""
	var first: Dictionary = cards[0]
	var n: int = cards.size()
	var same: bool = cards.all(func(c: Dictionary) -> bool: return c.get("name") == first.get("name"))
	var name: String = _label(v, first)
	var shown: Array = cards.slice(0, 5).map(func(c: Variant) -> String: return _label(v, c))
	if n > 5:
		shown.append("mais %d" % (n - 5))
	var list: String = list_names(shown)
	if Txt.of(from) == "Exile":
		return "%d × %s voltam ao campo." % [n, name] if same else "%d permanentes voltam ao campo: %s." % [n, list]
	if cards.all(func(c: Dictionary) -> bool: return truthy(c.get("token"))) and not truthy(from):
		return "%d fichas de %s entraram no campo." % [n, name] if same else "%d fichas entraram no campo." % n
	return "%d × %s entraram no campo." % [n, name] if same else "%d permanentes entraram no campo: %s." % [n, list]


## "Ana ataca você com 2 criaturas." — quem ataca, quem é atacado e com quantas.
static func attack_description(v: Dictionary, event: Dictionary) -> String:
	var s: Dictionary = _state(v)
	var you: Variant = s.get("you")
	var name_of: Callable = func(id: Variant) -> String:
		if _same_id(id, you):
			return "você"
		var pn: Variant = player_name(s, id)
		return Txt.of(pn) if pn != null else "Jogador"
	var actor: Variant = event.get("actor")
	var who: String = "Você" if _same_id(actor, you) else ("Jogador" if actor == null else name_of.call(actor))
	var defenders: Array = _targets(event, "players").map(func(id: Variant) -> String: return name_of.call(id))
	for id: Variant in _targets(event, "cards"):
		var c: Variant = _find(v, id)
		if c != null:
			defenders.append(_label(v, c))
	var list: String = ""
	if defenders.size() > 1:
		list = "%s e %s" % [", ".join(PackedStringArray(defenders.slice(0, -1))), defenders[-1]]
	elif defenders.size() == 1:
		list = defenders[0]
	var n: int = (event.get("cards") as Array).size() if event.get("cards") is Array else 0
	var count: String = " com %d %s" % [n, "criatura" if n == 1 else "criaturas"] if n > 0 else ""
	return "%s ataca%s%s." % [who, (" " + list) if list != "" else "", count]


## "Dados para ver quem começa: Ana 5, Bruno 3. Ana escolhe quem começa." (startingRoll.ts).
static func starting_roll_text(event: Dictionary, name: Callable) -> String:
	var rounds: PackedStringArray = []
	var rolls: Array = event.get("rolls", []) if event.get("rolls") is Array else []
	for i: int in rolls.size():
		var parts: PackedStringArray = []
		for r: Variant in rolls[i]:
			parts.append("%s %d" % [name.call((r as Dictionary).get("player")), int((r as Dictionary).get("roll", 0))])
		rounds.append(("desempate: " if i > 0 else "") + ", ".join(parts))
	var winner: String = "O vencedor" if event.get("actor") == null else Txt.of(name.call(event["actor"]))
	return "Dados para ver quem começa: %s. %s escolhe quem começa." % ["; ".join(rounds), winner]
