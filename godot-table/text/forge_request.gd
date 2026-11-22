# Pedidos do Forge nas escolhas de cartas e títulos que chegam em inglês (porte de src/ui/forgeRequest.ts):
# "Escolha 1 creature(s) a sacrifice." vira "Sacrifique 1 criatura." com o botão "Sacrificar".
class_name ForgeRequest
extends RefCounted

const VERBS := {
	"sacrifice": ["Sacrifique", "Sacrificar"], "sacrificar": ["Sacrifique", "Sacrificar"],
	"destroy": ["Destrua", "Destruir"], "exile": ["Exile", "Exilar"], "exilar": ["Exile", "Exilar"],
	"discard": ["Descarte", "Descartar"], "descartar": ["Descarte", "Descartar"],
	"tap": ["Vire", "Virar"], "virar": ["Vire", "Virar"], "untap": ["Desvire", "Desvirar"], "desvirar": ["Desvire", "Desvirar"],
	"return": ["Devolva", "Devolver"], "reveal": ["Revele", "Revelar"], "revelar": ["Revele", "Revelar"],
	"exaurir": ["Exaura", "Exaurir"], "enlist": ["Recrute com", "Recrutar"],
}
const TITLES := [
	[r"(?i)^Select a card to put onto the battlefield$", "Escolha a carta que vai para o campo de batalha"],
]
const NAME_KINDS := {
	"land": "terreno", "creature": "criatura", "artifact": "artefato", "enchantment": "encantamento", "planeswalker": "planeswalker",
	"battle": "batalha", "instant": "mágica instantânea", "sorcery": "feitiço", "permanent": "permanente",
}


static func _plural(en: String) -> String:
	return Re.replace_all(r"\b(creature|player|planeswalker|permanent|artifact|enchantment|land|spell|card|battle|opponent)\b", en, "$1s")


## "creature", "a creature", "artifact or creature" → "criatura", "artefato ou criatura"; null se não souber traduzir.
static func _kind_of(en: String, n: int) -> Variant:
	var bare: String = Re.replace_first(r"(?i)^(?:an?|one|um\(n\)|um|uma)\s+", en.strip_edges(), "")
	if bare == "":
		return "carta" if n == 1 else "cartas"
	return ShortInstruction.target_kind(bare if n == 1 else _plural(bare.to_lower()))


## O pedido de uma escolha de cartas em português, com o botão que confirma ({text, ok}); null se não é conhecido.
static func selection_request(message: Variant) -> Variant:
	var all: PackedStringArray = Re.lines(Txt.of(message))
	var line: String = all[all.size() - 1] if not all.is_empty() else ""
	var m: RegExMatch = Re.find(r"(?i)^Escolha (até )?(\d+) (.+?)\(s\) a (\w+)\.?$", line)
	if m != null:
		var n: int = int(m.get_string(2))
		var verb: Variant = VERBS.get(m.get_string(4).to_lower())
		var kind: Variant = _kind_of(m.get_string(3), n)
		if verb == null or kind == null:
			return null
		return {"text": "%s %s%d %s." % [verb[0], "até " if Re.has(m, 1) else "", n, kind], "ok": verb[1]}
	m = Re.find(r"(?i)^Selecione (.+?) para sacrificar \((\d+) restantes?\)$", line)
	if m != null:
		var n: int = int(m.get_string(2))
		var kind: Variant = _kind_of(m.get_string(1), n)
		return {"text": "Para pagar o custo, sacrifique %d %s." % [n, kind], "ok": "Sacrificar"} if kind != null else null
	m = Re.find(r"(?i)^Escolha (?:um\(n\)|um|uma) (.+?) para (virar|desvirar|exaurir) \((\d+) restantes?\)$", line)
	if m == null:
		m = Re.find(r"(?i)^Select an? (.+?) to (enlist) \((\d+) left\)$", line)
	if m != null:
		var n: int = int(m.get_string(3))
		var verb: Array = VERBS[m.get_string(2).to_lower()]
		var kind: Variant = _kind_of(m.get_string(1), n)
		return {"text": "Para pagar o custo, %s %d %s." % [Txt.of(verb[0]).to_lower(), n, kind], "ok": verb[1]} if kind != null else null
	m = Re.find(r"(?i)^Select (.+?) to remove (\d+)\s*(.*?) counter\(s\) from$", line)
	if m != null:
		var n: int = int(m.get_string(2))
		var kind: Variant = _kind_of(m.get_string(1), 1)
		return {
			"text": "Para pagar o custo, escolha %s de onde sai%s %d %s." % ["a %s" % kind if kind != null else "a carta", "" if n == 1 else "em", n, "marcador" if n == 1 else "marcadores"],
			"ok": "Tirar o marcador" if n == 1 else "Tirar os marcadores",
		}
	m = Re.find(r"(?i)^Descartar (\d+) carta\(s\)$", line)
	if m != null:
		var n: int = int(m.get_string(1))
		return {"text": "Descarte %d %s." % [n, "carta" if n == 1 else "cartas"], "ok": "Descartar"}
	m = Re.find(r"(?i)^Escolha (\d+) carta\(s\) para descartar para levar sua mão ao máximo de (\d+) cartas\.?$", line)
	if m != null:
		var n: int = int(m.get_string(1))
		return {"text": "Descarte %d %s: o máximo na mão é %s." % [n, "carta" if n == 1 else "cartas", m.get_string(2)], "ok": "Descartar"}
	if Re.test(r"(?i)^Select any number to exile$", line):
		return {"text": "Escolha quantas cartas quiser para exilar.", "ok": "Exilar"}
	return null


## Título de escolha em português (os que o Forge manda em inglês).
static func pt_title(title: Variant) -> String:
	var text: String = Txt.of(title)
	for entry: Array in TITLES:
		if Re.test(entry[0], text.strip_edges()):
			return entry[1]
	var named: Variant = _card_name_title(text)
	return named if named != null else text


static func _listed(words: PackedStringArray, last: String) -> String:
	if words.size() > 1:
		return "%s %s %s" % [", ".join(words.slice(0, -1)), last, words[words.size() - 1]]
	return words[0] if not words.is_empty() else ""


## Nomear uma carta com restrição: "Escolha o nome da carta noncreature, nonland." em português.
static func _card_name_title(title: String) -> Variant:
	var m: RegExMatch = Re.find(r"^Escolha o nome da carta (.+?)\.?$", title.strip_edges())
	if m == null:
		return null
	var desc: String = m.get_string(1).strip_edges()
	var value: String = ""
	var mv: RegExMatch = Re.find(r"(?i)^(.*?)\s*with mana value (\w+) or (less|greater)$", desc)
	if mv != null:
		desc = Re.group(mv, 1)
		value = " com valor de mana %s ou %s" % [mv.get_string(2), "menos" if mv.get_string(3).to_lower() == "less" else "mais"]
	desc = Re.replace_first(r"(?i)\s*\bcard$", desc, "").strip_edges()
	if Re.test(r"(?i)^nonbasic land$", desc):
		return "Escolha o nome de uma carta de terreno não básico%s." % value
	var parts: PackedStringArray = Re.split(r"(?i)\s*,\s*(?:or\s+)?|\s+or\s+", desc) if desc != "" else PackedStringArray()
	var no: PackedStringArray = []
	var yes: PackedStringArray = []
	for p: String in parts:
		if Re.test(r"(?i)^non", p):
			no.append(p.substr(3).to_lower())
		else:
			yes.append(p.to_lower())
	if (not no.is_empty() and not yes.is_empty()) or Array(yes).any(func(w: String) -> bool: return not NAME_KINDS.has(w)) \
			or Array(no).any(func(w: String) -> bool: return not NAME_KINDS.has(w) and w != "legendary"):
		return null
	var phrase: String = ""
	if not no.is_empty():
		var kinds: PackedStringArray = []
		for w: String in no:
			kinds.append("lendária" if w == "legendary" else "de %s" % NAME_KINDS[w])
		phrase = " que não seja %s" % " nem ".join(kinds)
	elif not yes.is_empty():
		var names: PackedStringArray = []
		for w: String in yes:
			names.append(NAME_KINDS[w])
		phrase = " de %s" % _listed(names, "ou")
	return "Escolha o nome de uma carta%s%s." % [phrase, value]
