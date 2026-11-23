# Tipo ganho ou perdido por um efeito (March of the Machines, Kormus Bell, Urborg…), com o texto da mesa do navegador
# ("agora também Criatura 3/3", "agora é Terreno; não é mais Criatura"); porta de typeChange em src/ui/permanentEffects.ts.
class_name TypeChange
extends RefCounted

const CARD_TYPES: PackedStringArray = ["Creature", "Artifact", "Enchantment", "Land", "Planeswalker", "Battle", "Instant", "Sorcery", "Kindred", "Tribal", "Dungeon"]
const SUPERTYPES: PackedStringArray = ["Legendary", "Basic", "Snow", "World", "Ongoing", "Elite", "Host"]
const TYPE_LABEL := {
	"Creature": "Criatura", "Artifact": "Artefato", "Enchantment": "Encantamento", "Land": "Terreno", "Planeswalker": "Planeswalker",
	"Battle": "Batalha", "Instant": "Mágica Instantânea", "Sorcery": "Feitiço", "Kindred": "Tribal", "Tribal": "Tribal", "Dungeon": "Masmorra",
	"Legendary": "Lendária", "Basic": "Básica", "Snow": "da Neve", "World": "Mundial", "Ongoing": "Contínua", "Elite": "Elite", "Host": "Anfitriã",
}


## O que mudou no tipo da permanente, por extenso, depois da linha impressa ("agora também Criatura 3/3"); "" sem
## mudança. Fica sem o que já tem marca própria: o changeling (todos os tipos impressos) e o deus sem devoção.
static func permanent_text(card: Dictionary) -> String:
	var change: Dictionary = permanent_change(card)
	return text(change, card) if not change.is_empty() else ""


## A mudança de tipo da permanente ({} sem mudança), como permanentTypeChange do navegador.
static func permanent_change(card: Dictionary) -> Dictionary:
	if bool(card.get("faceDown", false)):
		return {}
	var change: Dictionary = between(Txt.of(card.get("printedType")), Txt.of(card.get("typeLine")))
	if change.is_empty():
		return {}
	if (card.get("keywords", []) as Array).has("CHANGELING"):
		change["all_types"] = false
	for count: Variant in card.get("counts", []) if card.get("counts") is Array else []:
		for use: Variant in (count as Dictionary).get("uses", []) if count is Dictionary else []:
			if use is Dictionary and Txt.of((use as Dictionary).get("use")) == "creature":
				(change["lost"] as PackedStringArray).erase("Creature")
	return change if _size(change) > 0 else {}


## O que mudou entre a linha de tipo impressa e a atual ({} sem mudança). Numa carta de duas faces ("A // B"), vale a
## face mais parecida com a atual, para a face transformada nunca parecer um tipo ganho.
static func between(printed: String, current: String) -> Dictionary:
	if printed == "" or current == "":
		return {}
	var now: Dictionary = parse(current)
	var now_core: PackedStringArray = _only(now["types"], CARD_TYPES)
	var best: Dictionary = {}
	for face_line: String in RegEx.create_from_string("\\s+//\\s+").sub(printed, "\n", true).split("\n"):
		var face: Dictionary = parse(face_line)
		var all_types: bool = bool(now["all"]) and not bool(face["all"])
		var gained: PackedStringArray = _minus(now["types"], face["types"])
		var replaced: bool = not now_core.is_empty()
		for t: String in now_core:
			if not gained.has(t):
				replaced = false
		var change: Dictionary = {
			"gained": gained, "lost": _minus(face["types"], now["types"]),
			"gained_sub": PackedStringArray() if all_types else _minus(now["subtypes"], face["subtypes"]),
			"lost_sub": PackedStringArray() if bool(now["all"]) else _minus(face["subtypes"], now["subtypes"]),
			"all_types": all_types, "replaced": replaced, "printed": _only(face["types"], CARD_TYPES),
		}
		if best.is_empty() or _size(change) < _size(best):
			best = change
	return best if not best.is_empty() and _size(best) > 0 else {}


## "Legendary Artifact Creature - Golem" (Forge) ou "Artifact Creature — Golem" (Scryfall): tipos, subtipos e o "(All)"
## dos changelings.
static func parse(line: String) -> Dictionary:
	var all_re := RegEx.create_from_string("\\(All\\b[^)]*\\)")
	var all: bool = all_re.search(line) != null
	var clean: String = all_re.sub(line, " ", true)
	var parts: PackedStringArray = RegEx.create_from_string("\\s+[—–-]\\s+").sub(clean, "\n", true).split("\n")
	var types: PackedStringArray = []
	for word: String in _words(parts[0]):
		if word != "Token":
			types.append(word)
	var subtypes: PackedStringArray = _words(" ".join(parts.slice(1)))
	return {"types": types, "subtypes": subtypes, "all": all}


## O que a carta ganhou ou perdeu: "agora também Criatura 3/3", "agora é Terreno; não é mais Criatura".
static func text(change: Dictionary, card: Dictionary = {}) -> String:
	var gained_types: PackedStringArray = change["gained"]
	var pt: String = ""
	if gained_types.has("Creature") and bool(card.get("creature", false)) and card.has("power") and card.has("toughness"):
		pt = " %d/%d" % [int(card["power"]), int(card["toughness"])]
	var subs: PackedStringArray = (change["gained_sub"] as PackedStringArray).duplicate()
	if bool(change["all_types"]):
		subs.append("todos os tipos de criatura")
	var sub: String = " ".join(subs)
	var types: String = types_text(gained_types)
	var gained: String = "%s — %s" % [types, sub] if types != "" and sub != "" else (types if types != "" else sub)
	# Quem perde o tipo de carta perde junto os subtipos dele: basta dizer o tipo.
	var lost_types: PackedStringArray = change["lost"]
	var lost: String = types_text(lost_types) if not lost_types.is_empty() else " ".join(change["lost_sub"] as PackedStringArray)
	var out: PackedStringArray = []
	if gained != "":
		out.append("agora %s %s%s" % ["é" if bool(change["replaced"]) else "também", gained, pt])
	if lost != "":
		out.append("não é mais " + lost)
	return "; ".join(out)


## Criatura primeiro, como nas cartas em português ("Criatura Artefato"), e os supertipos depois dos tipos.
static func types_text(types: PackedStringArray) -> String:
	var creature: PackedStringArray = []
	var core: PackedStringArray = []
	var supers: PackedStringArray = []
	for t: String in types:
		if SUPERTYPES.has(t):
			supers.append(t)
		elif t == "Creature":
			creature.append(t)
		else:
			core.append(t)
	var words: PackedStringArray = []
	for t: String in creature + core + supers:
		words.append(Txt.of(TYPE_LABEL.get(t, t)))
	return " ".join(words)


static func _size(change: Dictionary) -> int:
	return (change["gained"] as PackedStringArray).size() + (change["lost"] as PackedStringArray).size() \
		+ (change["gained_sub"] as PackedStringArray).size() + (change["lost_sub"] as PackedStringArray).size() + (1 if bool(change["all_types"]) else 0)


static func _words(text: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for word: String in text.split(" ", false):
		var trimmed: String = word.strip_edges()
		if trimmed != "":
			out.append(trimmed)
	return out


static func _minus(a: PackedStringArray, b: PackedStringArray) -> PackedStringArray:
	var out: PackedStringArray = []
	for item: String in a:
		if not b.has(item):
			out.append(item)
	return out


static func _only(a: PackedStringArray, allowed: PackedStringArray) -> PackedStringArray:
	var out: PackedStringArray = []
	for item: String in a:
		if allowed.has(item):
			out.append(item)
	return out
