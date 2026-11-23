# Decks do jogador no formato da mesa do navegador (DeckData de src/decks.ts): ler uma lista colada, contar, exportar e montar o deck da partida.
class_name DeckList
extends RefCounted

## Os formatos de deck guardado, na ordem da mesa do navegador (o Precon é só de partida).
const FORMATS: PackedStringArray = ["standard", "pauper", "sacola50", "free", "commander", "oathbreaker"]
const FORMAT_LABEL := {
	"free": "Livre", "standard": "Standard", "pauper": "Pauper", "sacola50": "Sacola 50", "commander": "Commander",
	"oathbreaker": "Oathbreaker", "precon": "Commander Precon",
}
## O maior inteiro que o JavaScript guarda sem perder precisão (Number.MAX_SAFE_INTEGER).
const MAX_SAFE := 9007199254740991
const SECTION := r"(?i)^(deck|main ?deck|mainboard|commanders?|companions?|sideboard|maybeboard|considering|tokens?)$"
const COMMANDER_MARKER := r"(?i)\[[^\]]*\bcommander\b[^\]]*\]|\*CMDR\*"


## Commander e Oathbreaker: zona de comando e sem sideboard (hasCommandZone).
static func has_command_zone(format: String) -> bool:
	return format in ["commander", "oathbreaker", "precon"]


static func format_label(format: String) -> String:
	return Txt.of(FORMAT_LABEL.get(format, FORMAT_LABEL["free"]))


## A mesma carta na mesma impressão (entryKey).
static func entry_key(entry: Dictionary) -> String:
	var name: String = Txt.of(entry.get("name"))
	var set_code: String = Txt.of(entry.get("set"))
	return "%s|%s|%s" % [name, set_code, Txt.of(entry.get("cn"))] if set_code != "" else name


static func count_entries(entries: Variant) -> int:
	var total: int = 0
	if entries is Array:
		for entry: Variant in entries:
			if entry is Dictionary:
				total += int((entry as Dictionary).get("count", 0))
	return total


## Cartas do deck principal mais os comandantes (totalDeckSize).
static func total_size(deck: Dictionary) -> int:
	return count_entries(deck.get("cards", [])) + count_entries(deck.get("commanders", []))


## Todas as linhas do deck: principal, sideboard e comandantes (deckEntries).
static func entries(deck: Dictionary) -> Array:
	var out: Array = []
	for section: String in ["cards", "sideboard", "commanders"]:
		if deck.get(section) is Array:
			out.append_array(deck[section])
	return out


## Lê uma lista colada (Arena, MTGO, Moxfield, Archidekt ou só "4 Lightning Bolt"): porte de parseDeckList.
## {main, sideboard, commanders, skipped, ignored}; as linhas que não viram carta ficam em skipped/ignored.
static func parse(text: String) -> Dictionary:
	var lines: PackedStringArray = []
	for line: String in text.replace("\r", "").split("\n"):
		lines.append(line.strip_edges())
	var has_headers: bool = false
	var has_commander_tags: bool = false
	for line: String in lines:
		has_headers = has_headers or _section_of(line) != ""
		has_commander_tags = has_commander_tags or Re.test(COMMANDER_MARKER, line)
	var pools: Dictionary = {"main": {}, "sideboard": {}, "commanders": {}}
	var skipped: Array = []
	var ignored: Array = []
	var section: String = "main"
	var seen_card: bool = false
	for raw: String in lines:
		if raw == "":
			if not has_headers and not has_commander_tags and seen_card:
				section = "sideboard"
			continue
		var header: String = _section_of(raw)
		if header != "":
			if Re.test(r"^(deck|main)", header):
				section = "main"
			elif header == "sideboard" or header.begins_with("companion"):
				section = "sideboard"
			elif header.begins_with("commander"):
				section = "commanders"
			else:
				section = "ignored"
			continue
		if Re.test(r"^(//|#)", raw) or Re.test(r"(?i)^(about|name)\s", raw):
			continue
		var sb: bool = Re.test(r"(?i)^SB:\s*", raw)
		var line: String = Re.replace_first(r"(?i)^SB:\s*", raw, "")
		var m: RegExMatch = Re.find(r"(?i)^(?:(\d+)\s*x?\s+)?(.+)$", line)
		if m == null or (not Re.has(m, 1) and Re.test(r"^[+\-\d]", line) and Re.test(r"(?i)^[+\-]?\d*(?:[.,]\d+|\s*x?\s)", line)):
			skipped.append(raw)
			continue
		var count: int = _safe_int(Re.group(m, 1)) if Re.has(m, 1) else 1
		var rest: String = Re.group(m, 2)
		var tag: RegExMatch = Re.find(r"(?i)\[[^\]]*\b(sideboard|commander|maybeboard|considering|tokens?)\b[^\]]*\]", rest)
		var tag_kind: String = Re.group(tag, 1).to_lower() if tag != null else ""
		var is_commander: bool = Re.test(COMMANDER_MARKER, rest)
		var bare: String = Re.replace_all(r"\s*\^[^^]*\^", rest, "")
		bare = Re.replace_all(r"\s*\[[^\]]*\]", bare, "")
		bare = Re.replace_all(r"\s*\*[A-Z]+\*", bare, "")
		var printing: RegExMatch = Re.find(r"\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9_★-]+))?\s*$", bare)
		var name: String = bare.substr(0, printing.get_start() if printing != null else bare.length())
		name = Re.replace_all(r"\s*//\s*", name, " // ").strip_edges()
		var print_info: Dictionary = {}
		if printing != null:
			print_info["set"] = Re.group(printing, 1).to_lower()
			if Re.has(printing, 2):
				print_info["cn"] = Re.group(printing, 2)
		if name == "" or count <= 0:
			skipped.append(raw)
			continue
		seen_card = true
		if (not sb and section == "ignored") or (tag_kind != "" and not tag_kind in ["sideboard", "commander"]):
			ignored.append(raw)
			continue
		var pool: Dictionary = pools["main"]
		if sb or section == "sideboard" or tag_kind == "sideboard":
			pool = pools["sideboard"]
		elif section == "commanders" or is_commander:
			pool = pools["commanders"]
		var entry: Dictionary = {"name": name}
		entry.merge(print_info)
		var key: String = entry_key(entry).to_lower()
		if pool.has(key):
			var previous: Dictionary = pool[key]
			if int(previous["count"]) > MAX_SAFE - count:
				skipped.append(raw)
				continue
			previous["count"] = int(previous["count"]) + count
		else:
			var fresh: Dictionary = {"name": name, "count": count}
			fresh.merge(print_info)
			pool[key] = fresh
	return {
		"main": (pools["main"] as Dictionary).values(), "sideboard": (pools["sideboard"] as Dictionary).values(),
		"commanders": (pools["commanders"] as Dictionary).values(), "skipped": skipped, "ignored": ignored,
	}


## O título de uma seção ("Sideboard", "// Commander (1)", "Deck:"), em minúsculas, ou "".
static func _section_of(line: String) -> String:
	var h: String = Re.replace_first(r"^//\s*", line, "")
	h = Re.replace_first(r"\s*\(\d+\)\s*$", h, "")
	h = Re.replace_first(r":\s*$", h, "").strip_edges()
	return h.to_lower() if Re.test(SECTION, h) else ""


## A quantidade escrita, ou 0 quando passa do que o JavaScript guarda sem perder precisão (a linha é recusada).
static func _safe_int(digits: String) -> int:
	var trimmed: String = digits.lstrip("0")
	if trimmed.length() > 16 or (trimmed.length() == 16 and trimmed > str(MAX_SAFE)):
		return 0
	return trimmed.to_int() if trimmed != "" else 0


## "(DMU) 277": a impressão como as listas a escrevem (printLabel).
static func print_label(entry: Dictionary) -> String:
	var set_code: String = Txt.of(entry.get("set"))
	if set_code == "":
		return ""
	var cn: String = Txt.of(entry.get("cn"))
	return "(%s)%s" % [set_code.to_upper(), " " + cn if cn != "" else ""]


## A lista de texto do deck, no formato que parse() lê de volta (exportDeckList).
static func export_list(deck: Dictionary) -> String:
	var lines := func(list: Variant) -> String:
		var out: PackedStringArray = []
		for e: Dictionary in (list if list is Array else []):
			var label: String = print_label(e)
			out.append("%d %s%s" % [int(e.get("count", 0)), Txt.of(e.get("name")), " " + label if label != "" else ""])
		return "\n".join(out)
	var commanders: Array = deck.get("commanders", []) if deck.get("commanders") is Array else []
	var sideboard: Array = deck.get("sideboard", []) if deck.get("sideboard") is Array else []
	var text: String = "Commander\n%s\n\n" % lines.call(commanders) if not commanders.is_empty() else ""
	text += "Deck\n%s" % lines.call(deck.get("cards", []))
	if not sideboard.is_empty():
		text += "\n\n%s\n%s" % ["Companion" if Txt.of(deck.get("format")) == "commander" else "Sideboard", lines.call(sideboard)]
	return text + "\n"


## Passa uma cópia da linha `key` do deck principal a comandante; o comandante que estava em primeiro volta ao deck
## (promoteToCommander). Muda o deck dado.
static func promote_to_commander(deck: Dictionary, key: String) -> bool:
	var cards: Array = deck.get("cards", [])
	var index: int = -1
	for i: int in cards.size():
		if entry_key(cards[i]) == key:
			index = i
			break
	if index < 0:
		return false
	var entry: Dictionary = cards[index]
	if int(entry["count"]) > 1:
		entry["count"] = int(entry["count"]) - 1
	else:
		cards.remove_at(index)
	if not deck.get("commanders") is Array:
		deck["commanders"] = []
	var commanders: Array = deck["commanders"]
	var previous: Variant = commanders[0] if not commanders.is_empty() else null
	var chosen: Dictionary = entry.duplicate()
	chosen["count"] = 1
	if commanders.is_empty():
		commanders.append(chosen)
	else:
		commanders[0] = chosen
	if previous is Dictionary:
		var same: Variant = null
		for e: Dictionary in cards:
			if entry_key(e) == entry_key(previous):
				same = e
		if same is Dictionary:
			(same as Dictionary)["count"] = int((same as Dictionary)["count"]) + int((previous as Dictionary)["count"])
		else:
			cards.append((previous as Dictionary).duplicate())
	return true


## O deck no formato do `start`/`host`/`join` (forgeDeck de src/app/matchDecks.ts).
static func forge_deck(deck: Dictionary) -> Dictionary:
	var out: Dictionary = {
		"name": deck.get("name", ""),
		"cards": deck.get("cards", []),
		"sideboard": deck.get("sideboard", []),
		"commanders": deck.get("commanders", []),
	}
	if deck.get("tokens") is Array and not (deck["tokens"] as Array).is_empty():
		out["tokens"] = deck["tokens"]
	return out
