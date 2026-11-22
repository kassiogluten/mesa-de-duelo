# Frase curta da caixa de ação (porte de src/ui/shortInstruction.ts): alvo, pagamento, voto e contra-feitiço em português,
# no lugar do texto do Forge. Conferido contra a mesa do navegador pelos fixtures dourados (tests/golden/).
class_name ShortInstruction
extends RefCounted

const COUNTER_UNLESS := r"(?i)anul\w*\s+a\s+mágica[^.]*?alvo,?\s+a menos que|counter target[^.]*?spell unless"
const POOL_ORDER: PackedStringArray = ["W", "U", "B", "R", "G", "C"]
const WORDS := {
	"creature": "criatura", "creatures": "criaturas", "player": "jogador", "players": "jogadores",
	"planeswalker": "planeswalker", "planeswalkers": "planeswalkers", "permanent": "permanente", "permanents": "permanentes",
	"artifact": "artefato", "artifacts": "artefatos", "enchantment": "encantamento", "enchantments": "encantamentos",
	"land": "terreno", "lands": "terrenos", "spell": "mágica", "spells": "mágicas", "card": "carta", "cards": "cartas",
	"battle": "batalha", "battles": "batalhas", "opponent": "oponente", "opponents": "oponentes", "or": "ou", "and": "e",
	"nonland": "não terreno", "noncreature": "não criatura", "other": "outra", "another": "outra",
}
const PHRASES := [
	[r"\byou control\b", "que você controla"],
	[r"\ban opponent controls\b", "de um oponente"],
	[r"\byou don't control\b", "que você não controla"],
]
const COUNTS := {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
const UPKEEP := {"cumulative": "Manutenção cumulativa", "echo": "Eco"}
const STACK_TARGETS := [
	[r"(?i)^Select target spell or ability\b", "o alvo"],
	[r"(?i)^Select target (?:\w+ )?spell\b", "a mágica alvo"],
	[r"(?i)^Select target (?:activated or triggered )?ability\b", "a habilidade alvo"],
]
const VALID := {
	"creature": "criatura", "player": "jogador", "opponent": "oponente", "planeswalker": "planeswalker", "permanent": "permanente",
	"artifact": "artefato", "enchantment": "encantamento", "land": "terreno", "battle": "batalha", "card": "carta",
	"instant": "mágica instantânea", "sorcery": "feitiço", "spell": "mágica",
}
const OWNERS := {"oppctrl": "de um oponente", "youctrl": "que você controla", "youdontctrl": "que você não controla"}
const ZONE_NAMES := {"Graveyard": "num cemitério", "Exile": "no exílio", "Hand": "na mão", "Library": "no grimório", "Stack": "na pilha"}


## Um campo aninhado de dicionários ({"a": {"b": 1}}, "a", "b" → 1); null se algum passo falta.
static func dig(value: Variant, a: String, b: String = "", c: String = "") -> Variant:
	for key: String in [a, b, c]:
		if key == "":
			break
		if not value is Dictionary:
			return null
		value = (value as Dictionary).get(key)
	return value


static func _identity(name: String) -> String:
	return name


static func _translator(translate: Variant) -> Callable:
	return translate if translate is Callable else Callable(ShortInstruction, "_identity")


static func _truthy(value: Variant) -> bool:
	if value == null:
		return false
	if value is bool:
		return value
	if value is String:
		return value != ""
	if value is int or value is float:
		return value != 0
	return true


## Mana Leak e parecidos: o nome da mágica alvo, anulada sem o pagamento; null em qualquer outro pagamento.
static func countered_unless_paid(input: Variant, stack: Variant, you: Variant = null, translate: Variant = null) -> Variant:
	var data: Dictionary = input if input is Dictionary else {}
	if not _truthy(data.get("paying")) or data.get("payingFor") != "effect" or not Re.test(COUNTER_UNLESS, Txt.of(data.get("message"))):
		return null
	var items: Array = stack if stack is Array else []
	var at: int = 0
	for i: int in items.size():
		if dig(items[i], "source", "id") == dig(data, "card", "id"):
			at = i
			break
	var counter: Variant = items[at] if at < items.size() else null
	var below: Array = items.slice(at + 1)
	var targets: Variant = dig(counter, "targets", "cards")
	var targeted: Variant = null
	for item: Variant in below:
		if dig(item, "source") != null and targets is Array and (targets as Array).has(dig(item, "source", "id")):
			targeted = item
			break
	var mine: Array = below.filter(func(item: Variant) -> bool: return dig(item, "controller") == you and Txt.of(dig(item, "kind") if dig(item, "kind") != null else "spell") == "spell")
	var chosen: Variant = targeted if targeted != null else (mine[0] if mine.size() == 1 else null)
	var target: Variant = dig(chosen, "source", "name")
	return _translator(translate).call(Txt.of(target)) if _truthy(target) else "a sua mágica"


static func _paid(cost: String) -> bool:
	return Re.test(r"^(\{0\}|0)?$", cost.strip_edges())


## "Pague {2}{R} para Jiboia", "Falta {R} de {2}{R} para Jiboia", com o X escolhido e a vida já separada.
static func _payment_sentence(cost: Dictionary, name: Variant, effect: bool, phyrexian_pending: bool) -> String:
	var has_name: bool = _truthy(name)
	var target: String = " para %s" % name if has_name else ""
	var x: String = " (X = %s)" % _num(cost["x"]) if cost.get("x") != null else ""
	var life: String = " Mais %s de vida no fim do pagamento." % _num(cost["life"]) if not phyrexian_pending and _truthy(cost.get("life")) else ""
	var remaining: String = Txt.of(cost.get("remaining"))
	if _paid(remaining):
		return "Custo%s pago%s.%s" % [" de %s" % name if has_name else "", x, life]
	var total: Variant = cost.get("total")
	if _truthy(total) and total != remaining:
		return "Falta %s de %s%s%s.%s" % [remaining, total, target, x, life]
	if effect:
		return "%s pede %s%s.%s" % [name if has_name else "O efeito", remaining, x, life]
	return "Pague %s%s%s.%s" % [remaining, target, x, life]


## Número do JSON como o JavaScript escreve (2, não 2.0).
static func _num(value: Variant) -> String:
	if value is float and is_equal_approx(value, round(value)):
		return str(int(value))
	return str(value)


## Reserva de mana ({W: 0, G: 2}) como símbolos: "{G}{G}". Vazia, "".
static func pool_cost(pool: Variant) -> String:
	if not pool is Dictionary:
		return ""
	var data: Dictionary = pool
	var keys: Array = []
	for k: String in POOL_ORDER:
		if data.has(k):
			keys.append(k)
	for k: Variant in data.keys():
		if not POOL_ORDER.has(Txt.of(k)) and Re.test(r"^[A-Z]$", Txt.of(k)):
			keys.append(k)
	var out: String = ""
	for k: Variant in keys:
		var n: int = clampi(int(data[k]) if _truthy(data[k]) else 0, 0, 99)
		out += ("{%s}" % k).repeat(n)
	return out


## Traduz o tipo do alvo ("creature or player"); null se sobrar alguma palavra desconhecida.
static func target_kind(text: Variant) -> Variant:
	var out: String = Txt.of(text).to_lower().strip_edges()
	for phrase: Array in PHRASES:
		out = Re.replace_all(phrase[0], out, "§%s§" % phrase[1])
	var parts: Array = []
	var pieces: PackedStringArray = out.split("§")
	for i: int in pieces.size():
		if i % 2 == 1:
			parts.append(pieces[i])
			continue
		for m: RegExMatch in Re.compile(r"\S+").search_all(pieces[i]):
			parts.append(WORDS.get(m.get_string(), null))
	if parts.has(null):
		return null
	return " ".join(PackedStringArray(parts))


## "Select up to two target creatures" → {count: 2, upTo: true, kind: "criaturas"}.
static func _parse_target_request(message: String) -> Variant:
	var line: String = ""
	for l: String in message.split("\n"):
		if Re.test(r"(?i)^select\b", l.strip_edges()):
			line = l.strip_edges()
	if line == "":
		return null
	var m: RegExMatch = Re.find(r"(?i)^select\s+(up to\s+)?(?:(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(any\s+target|targets?)\s*(.*?)[.:]?$", line)
	if m == null:
		return null
	var raw: String = Re.group(m, 2).to_lower()
	var count: int = 1 if raw == "a" or raw == "an" or raw == "" else int(COUNTS.get(raw, int(raw)))
	var kind: Variant = "" if Re.test(r"(?i)^any", m.get_string(3)) or Re.group(m, 4) == "" else target_kind(Re.group(m, 4))
	return {"count": count, "upTo": Re.has(m, 1), "kind": kind}


static func _source_name(input: Dictionary, translate: Callable) -> Variant:
	var engine: Variant = dig(input, "targeting", "card", "name")
	if engine == null:
		engine = dig(input, "card", "name")
	if _truthy(engine):
		return translate.call(Txt.of(engine))
	var m: RegExMatch = Re.find(r"^(.+?) \(\d+\)(?: -|\n|\z)", Txt.of(input.get("message")))
	return Re.group(m, 1).strip_edges() if m != null else null


static func _upkeep_kind(message: String) -> String:
	var first: String = message.strip_edges()
	if Re.test(r"(?i)^Cumulative upkeep for\b", first):
		return "cumulative"
	if Re.test(r"(?i)^(?:Pagar Eco|Pay Echo)\b", first):
		return "echo"
	return ""


static func _stack_target_request(message: String, name: Variant) -> Variant:
	var all: PackedStringArray = Re.lines(message)
	var line: String = all[all.size() - 1] if not all.is_empty() else ""
	for entry: Array in STACK_TARGETS:
		if Re.test(entry[0], line):
			return "Escolha na pilha %s%s." % [entry[1], " de %s" % name if _truthy(name) else ""]
	return null


## A frase curta, ou null para a mesa mostrar o texto do Forge. `translate`: nome da carta no idioma da mesa.
static func short_instruction(input: Variant, translate: Variant = null) -> Variant:
	var data: Dictionary = input if input is Dictionary else {}
	var translator: Callable = _translator(translate)
	var name: Variant = _source_name(data, translator)
	var message: String = Txt.of(data.get("message"))
	if data.get("vote") != null:
		var voter: Variant = dig(data, "vote", "card", "name")
		return vote_request(translator.call(Txt.of(voter)) if _truthy(voter) else null)
	if Re.test(r"(?i)^(?:Seletor|Chooser)\s*:?$", message.strip_edges()):
		return "%s: escolha o oponente que vai decidir." % name if _truthy(name) else "Escolha o oponente que vai decidir."
	var stacks: Variant = data.get("selectableStacks")
	if data.get("targeting") == null and stacks is Array and not (stacks as Array).is_empty():
		var stack_text: Variant = _stack_target_request(message, name)
		if stack_text != null:
			return stack_text
	if data.get("targeting") != null:
		var targeting: Dictionary = data["targeting"] if data["targeting"] is Dictionary else {}
		var request: Variant = _parse_target_request(message)
		var fallback: Variant = valid_target_kind(targeting.get("valid"), targeting.get("zones"))
		if request == null:
			return "Escolha o alvo de %s%s." % [name, " (%s)" % fallback if _truthy(fallback) else ""] if _truthy(name) else null
		var req: Dictionary = request
		var max_targets: Variant = targeting.get("max")
		if int(req["count"]) == 1 and not bool(req["upTo"]) and max_targets != null and float(max_targets) > 1:
			req["count"] = int(max_targets)
			req["upTo"] = float(targeting.get("min", 0) if targeting.get("min") != null else 0) < float(max_targets)
		var n: int = req["count"]
		var how: String = ("até %d %s" % [n, "alvo" if n == 1 else "alvos"]) if bool(req["upTo"]) else ("um alvo" if n == 1 else "%d alvos" % n)
		var kind: Variant = req["kind"] if _truthy(req["kind"]) else fallback
		return "Escolha %s%s%s." % [how, " para %s" % name if _truthy(name) else "", " (%s)" % kind if _truthy(kind) else ""]
	var paying: bool = _truthy(data.get("paying"))
	var phyrexian: Variant = data.get("phyrexianLife")
	if paying and data.get("manaCost") is Dictionary:
		var cost: Dictionary = data["manaCost"]
		var effect: bool = data.get("payingFor") == "effect"
		var pending: bool = phyrexian != null
		var reserve: String = " Na reserva: %s." % data["reserve"] if _truthy(data.get("reserve")) else ""
		var ask: String = _payment_sentence(cost, name, effect, pending) + reserve
		if pending:
			return "%s %s" % [ask, _phyrexian_hint(phyrexian, data.get("phyrexianLifeBlack"))]
		if not effect:
			return ask
		var upkeep: String = _upkeep_kind(message)
		var cannot: String = " A sua mana não dá para pagar." if data.get("canAutoPay") == false else ""
		if upkeep != "":
			var remaining: String = Txt.of(cost.get("remaining"))
			var what: String = Txt.of(name) if _truthy(name) else "a permanente"
			if _paid(remaining):
				return "%s de %s paga.%s" % [UPKEEP[upkeep], what, reserve]
			var total: Variant = cost.get("total")
			var due: String = "falta %s de %s" % [remaining, total] if _truthy(total) and total != remaining else "pague %s" % remaining
			return "%s: %s para manter %s no campo. Sem pagar, ela é sacrificada.%s%s" % [UPKEEP[upkeep], due, what, reserve, cannot]
		if _truthy(data.get("counters")):
			return "%s Sem pagar, %s é anulada.%s" % [ask, data["counters"], cannot]
		return "%s A sua mana não dá para pagar." % ask if data.get("canAutoPay") == false else "%s Pague ou recuse." % ask
	if paying and data.get("payingFor") == "effect":
		var m: RegExMatch = Re.find(r"(?i)(?:Custo de Mana|Mana Cost):\s*((?:\{[A-Z0-9/]+\})+)", message)
		var asks: String = "%s pede %s" % [name if _truthy(name) else "O efeito", m.get_string(1) if m != null else "um pagamento de mana"]
		if phyrexian != null:
			return "%s. %s" % [asks, _phyrexian_hint(phyrexian, data.get("phyrexianLifeBlack"))]
		if data.get("canAutoPay") == false:
			return "%s, e a sua mana não dá para pagar." % asks
		return "%s. Pague ou recuse." % asks if _truthy(name) else "Pague o custo pedido ou recuse."
	if paying:
		var ask_mana: String = "Pague o custo de mana de %s." % name if _truthy(name) else "Pague o custo de mana."
		return ask_mana if phyrexian == null else "%s %s" % [ask_mana, _phyrexian_hint(phyrexian, data.get("phyrexianLifeBlack"))]
	return null


## O que serve como alvo pelas restrições do motor ("Creature.OppCtrl", "Player"); null se não souber ou servir qualquer alvo.
static func valid_target_kind(valid: Variant, zones: Variant = null) -> Variant:
	if not valid is Array or (valid as Array).is_empty():
		return null
	for v: Variant in valid:
		if Txt.of(v).to_lower() == "any":
			return null
	var kinds: PackedStringArray = []
	for entry: Variant in valid:
		var pieces: PackedStringArray = Txt.of(entry).split(".")
		var base: String = pieces[0]
		var props: PackedStringArray = []
		for p: String in ".".join(pieces.slice(1)).split("+"):
			props.append(p.to_lower())
		var typed: String = ""
		if base.to_lower() == "card":
			for p: String in props:
				if VALID.has(p) and p != "card":
					typed = p
					break
		var word: Variant = VALID.get(typed if typed != "" else base.to_lower())
		if word == null:
			return null
		var owner: String = ""
		for p: String in props:
			if OWNERS.has(p):
				owner = OWNERS[p]
				break
		var text: String = "%s %s" % [word, owner] if owner != "" else Txt.of(word)
		if not kinds.has(text):
			kinds.append(text)
	var where: PackedStringArray = []
	if zones is Array:
		for z: Variant in zones:
			if ZONE_NAMES.has(Txt.of(z)):
				where.append(ZONE_NAMES[Txt.of(z)])
	var list: String = "%s ou %s" % [", ".join(kinds.slice(0, -1)), kinds[kinds.size() - 1]] if kinds.size() > 1 else kinds[0]
	return "%s %s" % [list, " ou ".join(where)] if not where.is_empty() else list


## Quantos alvos faltam neste passo: "Falta 1 alvo", "Pode marcar mais 2", "Todos os alvos marcados".
static func target_progress(t: Variant) -> Variant:
	var data: Dictionary = t if t is Dictionary else {}
	if data.get("min") == null or data.get("max") == null or data.get("count") == null or float(data["max"]) <= 0:
		return null
	var low: int = int(data["min"])
	var high: int = int(data["max"])
	var count: int = int(data["count"])
	var alvos: Callable = func(n: int) -> String: return "%d %s" % [n, "alvo" if n == 1 else "alvos"]
	if count < low:
		return "%s %s" % ["Falta" if low - count == 1 else "Faltam", alvos.call(low - count)]
	if count >= high:
		return "Alvo marcado" if high == 1 else "Todos os alvos marcados"
	return "Até %s" % alvos.call(high) if count == 0 else "Pode marcar mais %s" % alvos.call(high - count)


static func ability_kind_label(kind: Variant) -> Variant:
	return "Gatilho" if kind == "trigger" else ("Habilidade" if kind == "ability" else null)


## Voto numa permanente (Council's Judgment): a escolha é tocando no campo.
static func vote_request(name: Variant) -> String:
	return "Votação%s: toque na permanente em que você vota." % (" de %s" % name if _truthy(name) else "")


static func _phyrexian_hint(pending: Variant, black: Variant) -> String:
	var hint: String = "Toque no seu retrato para pagar 2 de vida por %s." % ("um {B}" if _truthy(black) else "um símbolo phyrexiano")
	return "%s Já são %s de vida." % [hint, _num(pending)] if float(pending) > 0 else hint


## Rótulos dos botões do pagamento de mana (o Forge só manda "Automático" e "Cancelar").
static func payment_button_labels(input: Variant) -> Dictionary:
	var data: Dictionary = input if input is Dictionary else {}
	var can: bool = _truthy(data["canAutoPay"]) if data.get("canAutoPay") != null else _truthy(dig(data, "ok", "enabled"))
	if _truthy(data.get("counters")):
		return {"ok": "Pagar e salvar" if can else "Mana insuficiente", "cancel": "Deixar anular"}
	var paying_for: Variant = data.get("payingFor")
	var cancel: String
	if paying_for == "effect" and _upkeep_kind(Txt.of(data.get("message"))) != "":
		cancel = "Não pagar e sacrificar"
	elif paying_for == "spell":
		cancel = "Desistir da mágica"
	elif paying_for == "ability":
		cancel = "Desistir da habilidade"
	elif paying_for == "effect":
		cancel = "Não pagar"
	else:
		cancel = "Desistir"
	return {"ok": "Pagar automaticamente" if can else "Mana insuficiente", "cancel": cancel}
