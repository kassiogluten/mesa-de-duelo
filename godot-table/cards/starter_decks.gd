# Decks prontos (shared/starter-decks.json, copiado para res://data/ pelo npm run godot) e o formato que o servidor espera.
extends RefCounted

const PATH := "res://data/starter-decks.json"

static var _cache: Array = []


static func all() -> Array:
	if _cache.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		_cache = parsed if parsed is Array else []
	return _cache


## Os decks prontos de um formato ("standard", "commander"…), na ordem do arquivo.
static func of_format(format: String) -> Array:
	return all().filter(func(d: Dictionary) -> bool: return d.get("format", "") == format)


## O deck no formato do `start`/`host`/`join` (forgeDeck de src/app/matchDecks.ts).
static func forge_deck(deck: Dictionary) -> Dictionary:
	var out: Dictionary = {
		"name": deck.get("name", ""),
		"cards": deck.get("cards", []),
		"sideboard": deck.get("sideboard", []),
		"commanders": deck.get("commanders", []),
	}
	if not (deck.get("tokens", []) as Array).is_empty():
		out["tokens"] = deck["tokens"]
	return out
