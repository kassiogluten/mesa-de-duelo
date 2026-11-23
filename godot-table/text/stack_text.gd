# Como a pilha aparece na mesa (porte de src/ui/stackPresentation.ts e de partes de stackView.ts): tipo do item, forma de
# conjurar, custo de lealdade, modos, dono, alvos, quem decide enquanto o topo resolve e os itens iguais seguidos.
class_name StackText
extends RefCounted

## Por que o item está na pilha: o rótulo do selo, a frase do dono quando é seu e quando é de outro (%s = nome).
const KINDS := {
	"spell": {"label": "Mágica", "mine": "Sua mágica", "by": "Mágica conjurada por %s"},
	"ability": {"label": "Habilidade", "mine": "Sua habilidade ativada", "by": "Habilidade ativada por %s"},
	"trigger": {"label": "Gatilho", "mine": "Seu gatilho", "by": "Gatilho de %s"},
}

## Forma de conjurar: o nome curto do selo e como a frase começa.
const CAST_MODES := {
	"flashback": ["Flashback", "Conjurada por flashback"],
	"escape": ["Fuga", "Conjurada por fuga"],
	"harmonize": ["Harmonizar", "Conjurada por harmonizar"],
	"beammeup": ["Beam me up", "Conjurada por Beam me up"],
	"retrace": ["Retraçar", "Conjurada por retraçar"],
	"jumpstart": ["Jump-start", "Conjurada por jump-start"],
	"evoke": ["Evocar", "Conjurada por evocar"],
	"dash": ["Dash", "Conjurada por dash"],
	"blitz": ["Blitz", "Conjurada por blitz"],
	"madness": ["Loucura", "Conjurada por loucura"],
	"overload": ["Sobrecarga", "Conjurada com sobrecarga"],
	"bestow": ["Agraciar", "Conjurada por agraciar"],
	"disturb": ["Perturbar", "Conjurada por perturbar"],
	"prowl": ["Rondar", "Conjurada por rondar"],
	"spectacle": ["Espetáculo", "Conjurada por espetáculo"],
	"surge": ["Surto", "Conjurada por surto"],
	"emerge": ["Emergir", "Conjurada por emergir"],
	"mutate": ["Mutação", "Conjurada por mutação"],
	"awaken": ["Despertar", "Conjurada por despertar"],
	"warp": ["Dobra", "Conjurada por dobra"],
	"adventure": ["Aventura", "Conjurada como aventura"],
	"omen": ["Presságio", "Conjurada como presságio"],
	"aftermath": ["Consequência", "Conjurada a metade de consequência"],
	"facedown": ["Virada", "Conjurada virada para baixo"],
	"plotted": ["Tramada", "Conjurada tramada, sem pagar o custo de mana"],
	"foretold": ["Prevista", "Conjurada prevista, pelo custo previsto"],
}

## Custos opcionais pagos: o nome curto do selo e o pedaço da frase.
const CAST_EXTRAS := {
	"buyback": ["Recompra", "com recompra"],
	"entwine": ["Entrelaçada", "com entrelaçar"],
	"bargain": ["Barganha", "com barganha"],
	"gift": ["Presente", "com o presente prometido"],
	"teamwork": ["Em equipe", "com trabalho em equipe"],
	"offering": ["Oferenda", "por oferenda"],
	"flash": ["Lampejo", "pagando a mais para ter lampejo"],
	"extra": ["Custo extra", "com o custo adicional pago"],
}


static func _dict(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


static func _list(value: Variant) -> Array:
	return value if value is Array else []


static func kind_of(item: Dictionary) -> String:
	return Txt.of(item.get("kind"))


## "Sua mágica", "Gatilho de Ana"... Sem o tipo (servidor antigo): só o nome do dono.
static func owner_line(item: Dictionary, you: int, owner: String) -> String:
	var kind: Dictionary = _dict(KINDS.get(kind_of(item)))
	if kind.is_empty():
		return owner if owner != "" else "Efeito"
	if item.get("controller") != null and int(item["controller"]) == you:
		return Txt.of(kind["mine"])
	return Txt.of(kind["by"]) % owner if owner != "" else Txt.of(kind["label"])


## O que mais pesa no selo pequeno: a forma de conjurar, depois o reforço, os outros opcionais e o X.
static func cast_tag(cast: Variant) -> String:
	var c: Dictionary = _dict(cast)
	if c.is_empty():
		return ""
	var mode: Array = _list(CAST_MODES.get(Txt.of(c.get("mode"))))
	if not mode.is_empty():
		return Txt.of(mode[0])
	var kicker: int = int(c.get("kicker", 0)) if c.get("kicker") != null else 0
	if kicker > 0:
		return "Reforçada ×%d" % kicker if kicker > 1 else "Reforçada"
	for extra: Variant in _list(c.get("extras")):
		var known: Array = _list(CAST_EXTRAS.get(Txt.of(extra)))
		if not known.is_empty():
			return Txt.of(known[0])
	return "X=%d" % int(c["x"]) if c.get("x") != null else ""


## O custo de lealdade como a carta o imprime ("+2", "0", "−3").
static func loyalty_cost(item: Dictionary) -> String:
	var loyalty: Dictionary = _dict(item.get("loyalty"))
	if loyalty.is_empty():
		return ""
	var cost: String = Txt.of(loyalty.get("cost")).strip_edges()
	return "−" + cost.substr(1) if cost.begins_with("-") else cost


## "up", "down" ou "zero": a cor do custo de lealdade.
static func loyalty_tone(item: Dictionary) -> String:
	var cost: String = loyalty_cost(item)
	return "down" if cost.begins_with("−") else ("up" if cost.begins_with("+") else "zero")


## A linha da habilidade com esse custo no texto da carta ("+2: Cada jogador compra um card." → "Cada jogador compra um card.").
static func loyalty_line_in(card_text: String, cost: String) -> String:
	var want: String = _minus(cost.strip_edges())
	for line: String in card_text.split("\n"):
		var m: RegExMatch = Re.find(r"^\s*\[?([+−–-]?(?:\d+|X))\]?\s*:\s*(.+)$", line)
		if m != null and _minus(m.get_string(1)) == want:
			return m.get_string(2).strip_edges()
	return ""


static func _minus(text: String) -> String:
	return "-" + text.substr(1) if text.begins_with("−") or text.begins_with("–") else text


## O texto do modo de número `index` (1 é o primeiro) no texto da carta, pelas linhas que começam com "•".
static func mode_line_in(card_text: String, index: int) -> String:
	var bullets: PackedStringArray = []
	for line: String in card_text.split("\n"):
		var m: RegExMatch = Re.find(r"^\s*[•●]\s*(.+)$", line)
		if m != null:
			bullets.append(m.get_string(1).strip_edges())
	return bullets[index - 1] if index >= 1 and index <= bullets.size() else ""


## "Habilidade de lealdade +2." (ou "Ultimate, …"); vazio fora das habilidades de lealdade.
static func loyalty_line(item: Dictionary) -> String:
	var cost: String = loyalty_cost(item)
	if cost == "":
		return ""
	return ("Ultimate, habilidade de lealdade %s." if bool(_dict(item.get("loyalty")).get("ultimate", false)) else "Habilidade de lealdade %s.") % cost


## O selo pequeno: na habilidade de lealdade, o custo dela; senão, a forma de conjurar.
static func tag(item: Dictionary) -> String:
	var cost: String = loyalty_cost(item)
	return cost if cost != "" else cast_tag(item.get("cast"))


## "Mágica · Reforçada", "Habilidade · +2": o tipo com a forma de conjurar ou o custo de lealdade.
static func badge_text(item: Dictionary) -> String:
	var kind: Dictionary = _dict(KINDS.get(kind_of(item)))
	var t: String = tag(item)
	if not kind.is_empty():
		return "%s · %s" % [kind["label"], t] if t != "" else Txt.of(kind["label"])
	return t


## "Conjurada por flashback, com reforço 2 vezes e com recompra. X = 3."; vazio no custo normal.
static func cast_line(cast: Variant) -> String:
	var c: Dictionary = _dict(cast)
	if c.is_empty():
		return ""
	var parts: PackedStringArray = []
	var kicker: int = int(c.get("kicker", 0)) if c.get("kicker") != null else 0
	if kicker > 0:
		parts.append("com reforço %d vezes" % kicker if kicker > 1 else "com reforço")
	for extra: Variant in _list(c.get("extras")):
		var known: Array = _list(CAST_EXTRAS.get(Txt.of(extra)))
		if not known.is_empty():
			parts.append(Txt.of(known[1]))
	var mode_entry: Array = _list(CAST_MODES.get(Txt.of(c.get("mode"))))
	var mode: String = Txt.of(mode_entry[1]) if not mode_entry.is_empty() else ""
	var list: String = ""
	if parts.size() > 1:
		list = "%s e %s" % [", ".join(parts.slice(0, parts.size() - 1)), parts[parts.size() - 1]]
	elif parts.size() == 1:
		list = parts[0]
	var how: String = ""
	if mode != "" and list != "":
		how = "%s, %s." % [mode, list]
	elif mode != "":
		how = mode + "."
	elif list != "":
		how = "Conjurada %s." % list
	var x: String = "X = %d." % int(c["x"]) if c.get("x") != null else ""
	return (how + " " + x).strip_edges()


## Habilidade ativada: a linha dela no texto em português, sem o custo. Só quando o texto em português tem as mesmas
## linhas do texto da carta que o servidor conhece; senão, vazio.
static func ability_line_in(pt_text: String, item: Dictionary) -> String:
	var source: Dictionary = _dict(item.get("source"))
	if kind_of(item) != "ability" or item.get("line") == null or pt_text == "" or Txt.of(source.get("text")) == "":
		return ""
	var pt: PackedStringArray = Re.lines(pt_text.replace("\r", ""))
	var en: PackedStringArray = Re.lines(Txt.of(source["text"]).replace("\r", ""))
	var index: int = int(item["line"])
	if pt.size() != en.size() or index < 0 or index >= pt.size():
		return ""
	var line: String = pt[index].strip_edges()
	var colon: int = line.find(": ")
	return (line.substr(colon + 2) if colon > 0 else line).strip_edges()


## O efeito do item, para ler: numa mágica sem modos, o texto impresso da carta em português (quando há); senão, o texto
## do servidor sem o "Nome (id) - " da frente. `pt_text`: o texto em português da carta de origem ("" sem ele).
static func effect_text(item: Dictionary, pt_text: String) -> String:
	var kind: String = kind_of(item) if kind_of(item) != "" else "spell"
	if kind == "spell" and _list(item.get("modes")).is_empty() and _dict(item.get("loyalty")).is_empty() and pt_text != "":
		return pt_text
	var line: String = ability_line_in(pt_text, item)
	if line != "":
		return line
	var text: String = Txt.of(item.get("text"))
	var trimmed: String = Re.replace_first(r"^.+? \(\d+\) - ", text, "").strip_edges()
	return trimmed if trimmed != "" else text


## A faixa do pé da carta: a habilidade de lealdade ({cost, tone, text, ultimate}) ou {} se não é uma.
static func loyalty_strip(item: Dictionary, pt_text: String) -> Dictionary:
	var cost: String = loyalty_cost(item)
	if cost == "":
		return {}
	var loyalty: Dictionary = _dict(item.get("loyalty"))
	var text: String = loyalty_line_in(pt_text, Txt.of(loyalty.get("cost")))
	return {"cost": cost, "tone": loyalty_tone(item), "text": text if text != "" else Txt.of(loyalty.get("text")), "ultimate": bool(loyalty.get("ultimate", false))}


## Os modos escolhidos, na ordem em que resolvem: [{index, text}] com o texto em português quando há.
static func mode_rows(item: Dictionary, pt_text: String) -> Array:
	var out: Array = []
	for raw: Variant in _list(item.get("modes")):
		var mode: Dictionary = _dict(raw)
		var index: int = int(mode.get("index", 0))
		var text: String = mode_line_in(pt_text, index)
		out.append({"index": index, "text": text if text != "" else Txt.of(mode.get("text"))})
	return out


## Alguém (você ou outro) tem uma decisão aberta agora (porte de awaitingDecision.ts, só o "há ou não há").
static func awaiting_decision(state: Dictionary) -> bool:
	var input: Dictionary = _dict(state.get("input"))
	if bool(state.get("gameOver", false)) or bool(state.get("spectating", false)) or state.get("sideboarding") != null \
			or state.get("question") is Dictionary or input.get("opening") != null:
		return false
	if bool(input.get("priority", false)) or input.get("attacking") != null or input.get("blocking") != null or bool(input.get("paying", false)):
		return false
	if input.get("targeting") != null or input.get("selection") != null or input.get("suspendCast") != null:
		return true
	if not _list(input.get("selectable")).is_empty() or not _list(input.get("selectablePlayers")).is_empty() or not _list(input.get("selectableStacks")).is_empty():
		return true
	return bool(_dict(input.get("ok")).get("enabled", false)) or bool(_dict(input.get("cancel")).get("enabled", false))


## O topo resolvendo parado numa escolha: {mine: true} quando é sua, {mine: false, name} quando é de outro; {} fora disso.
static func resolving_choice(state: Dictionary) -> Dictionary:
	var stack: Array = _list(state.get("stack"))
	if stack.is_empty() or not bool(_dict(stack[0]).get("resolving", false)) or bool(state.get("gameOver", false)):
		return {}
	var input: Dictionary = _dict(state.get("input"))
	if state.get("question") is Dictionary or awaiting_decision(state) or (bool(input.get("paying", false)) and not bool(input.get("priority", false))):
		return {"mine": true}
	var you: int = int(state.get("you", 0))
	for raw: Variant in _list(state.get("deciding")):
		var d: Dictionary = _dict(raw)
		if int(d.get("player", -1)) != you and Txt.of(d.get("kind")) == "choice":
			return {"mine": false, "name": player_name(state, int(d["player"]), "Oponente")}
	return {}


## A frase do selo do topo: quem decide enquanto ele resolve, ou "Resolve primeiro".
static func top_label(state: Dictionary) -> String:
	var choice: Dictionary = resolving_choice(state)
	if choice.is_empty():
		return "Resolve primeiro"
	return "Aguardando sua escolha" if bool(choice["mine"]) else "%s está escolhendo" % choice["name"]


static func player_name(state: Dictionary, id: int, fallback: String = "Jogador") -> String:
	for raw: Variant in _list(state.get("players")):
		if int(_dict(raw).get("id", -1)) == id:
			return Txt.of(_dict(raw).get("name"))
	return fallback


## Uma carta do estado pelo id, onde estiver (campo, mão, cemitério, exílio, comando ou na pilha); {} se não acha.
static func find_card(state: Dictionary, id: int) -> Dictionary:
	for raw: Variant in _list(state.get("players")):
		var p: Dictionary = _dict(raw)
		for zone: String in ["battlefield", "hand", "graveyard", "exile", "commandZone"]:
			for c: Variant in _list(p.get(zone)):
				if int(_dict(c).get("id", -1)) == id:
					return c
	for raw: Variant in _list(state.get("stack")):
		var source: Dictionary = _dict(_dict(raw).get("source"))
		if int(source.get("id", -1)) == id:
			return source
	return {}


## "Alvo: Ana" / "Alvos: Elfos de Llanowar, Ana" (cartas primeiro, como targetsDescription); `label` traduz o nome.
static func targets_text(state: Dictionary, targets: Variant, label: Callable) -> String:
	var t: Dictionary = _dict(targets)
	var names: PackedStringArray = []
	for id: Variant in _list(t.get("cards")):
		var card: Dictionary = find_card(state, int(id))
		if card.has("name"):
			names.append(Txt.of(label.call(Txt.of(card["name"]))))
	for id: Variant in _list(t.get("players")):
		var name: String = player_name(state, int(id), "")
		if name != "":
			names.append(name)
	if names.is_empty():
		return ""
	return ("Alvos: %s" if names.size() > 1 else "Alvo: %s") % ", ".join(names)


## Itens seguidos iguais (mesmo dono, carta, tipo, efeito, alvos, forma de conjurar) viram um grupo só, com a contagem:
## [{item, at, count}]. Um item que dá para escolher nunca entra num grupo.
static func group(stack: Array, selectable: Array = []) -> Array:
	var groups: Array = []
	for at: int in stack.size():
		var item: Dictionary = _dict(stack[at])
		var last: Dictionary = groups[-1] if not groups.is_empty() else {}
		if not last.is_empty() and not _has_id(selectable, item.get("id")) and not _has_id(selectable, (last["item"] as Dictionary).get("id")) \
				and _same_key(last["item"]) == _same_key(item):
			last["count"] = int(last["count"]) + 1
		else:
			groups.append({"item": item, "at": at, "count": 1})
	return groups


static func _has_id(list: Array, id: Variant) -> bool:
	if id == null:
		return false
	for value: Variant in list:
		if int(value) == int(id):
			return true
	return false


static func _same_key(item: Dictionary) -> String:
	var source: Dictionary = _dict(item.get("source"))
	return JSON.stringify([item.get("controller"), item.get("kind"), source.get("name"), item.get("text"), item.get("targets"), item.get("cast"), item.get("modes"), item.get("loyalty")])
