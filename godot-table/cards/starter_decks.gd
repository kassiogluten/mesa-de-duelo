# Decks prontos (shared/starter-decks.json, copiado para res://data/ pelo npm run godot) e o formato que o servidor espera.
extends RefCounted

const PATH := "res://data/starter-decks.json"

static var _cache: Array = []


static func all() -> Array:
	if _cache.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		_cache = parsed if parsed is Array else []
	return _cache


## Os decks prontos de um formato ("standard", "commander"…), na ordem do arquivo; no Livre, todos os sem zona de
## comando (readyDeckFits).
static func of_format(format: String) -> Array:
	if format == "free":
		return all().filter(func(d: Dictionary) -> bool: return not DeckList.has_command_zone(Txt.of(d.get("format", "free"))))
	return all().filter(func(d: Dictionary) -> bool: return d.get("format", "") == format)


## O deck no formato do `start`/`host`/`join` (forgeDeck de src/app/matchDecks.ts).
static func forge_deck(deck: Dictionary) -> Dictionary:
	return DeckList.forge_deck(deck)
