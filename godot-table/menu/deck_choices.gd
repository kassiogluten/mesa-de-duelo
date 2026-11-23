# Os decks que dá para levar a uma sala de um formato (Meus decks e os prontos) e o deck do lugar como o servidor espera.
class_name DeckChoices
extends RefCounted

const StarterDecks := preload("res://cards/starter_decks.gd")
const GROUP_MINE := "Meus decks"
const GROUP_READY := "Decks prontos"

## Outras fontes de decks, antes dos prontos: Callable(format: String) -> Array de escolhas
## ({id, name, group, deck}, `deck` no formato do shared/starter-decks.json). É por aqui que "Meus decks" entra.
static var _sources: Array[Callable] = []


static func add_source(source: Callable) -> void:
	if not _sources.has(source):
		_sources.append(source)


static func remove_source(source: Callable) -> void:
	_sources.erase(source)


## As escolhas de um formato: Meus decks do formato e as das outras fontes primeiro, depois os decks prontos que servem nele.
static func for_format(format: String) -> Array:
	var out: Array = []
	for deck: Dictionary in DeckLibrary.load_all():
		if Txt.of(deck.get("format")) == format:
			out.append({"id": Txt.of(deck.get("id")), "name": Txt.of(deck.get("name")), "group": GROUP_MINE, "deck": deck})
	for source: Callable in _sources:
		if source.is_valid():
			var extra: Variant = source.call(format)
			if extra is Array:
				out.append_array(extra)
	for deck: Dictionary in StarterDecks.all():
		if ready_deck_fits(deck, format):
			out.append({"id": Txt.of(deck.get("id")), "name": Txt.of(deck.get("name")), "group": GROUP_READY, "deck": deck})
	return out


## Deck pronto listado num formato (readyDeckFits de src/decks.ts): no Livre, todos os de 60 cartas; no Precon, só os
## precons; no Commander, os de Commander que não são precon; nos outros, os montados para o formato.
static func ready_deck_fits(deck: Dictionary, format: String) -> bool:
	var own: String = Txt.of(deck.get("format", "free"))
	var precon: bool = deck.get("precon") != null and bool(deck.get("builtin", false))
	match format:
		"free":
			return not RoomMessages.has_command_zone(own)
		"precon":
			return precon
		"commander":
			return own == "commander" and deck.get("precon") == null
	return own == format


## A escolha de um id na lista do formato (ou {} se não há).
static func find(format: String, id: String) -> Dictionary:
	for choice: Dictionary in for_format(format):
		if Txt.of(choice.get("id")) == id:
			return choice
	return {}


## O deck lembrado do formato (o último escolhido), se ainda está na lista; {} se não há.
static func remembered(format: String) -> Dictionary:
	return find(format, Txt.of(Prefs.load_all().get("deck_" + format, "")))


static func remember(format: String, choice: Dictionary) -> void:
	if not choice.is_empty():
		Prefs.save("deck_" + format, Txt.of(choice.get("id")))


## O deck do lugar como vai em host, join e room-deck (seatDeck de src/app/matchDecks.ts): a lista, a capa (o comandante),
## o bracket (no Commander) e, com a conta conectada, o token e o id do deck. {} sem escolha.
static func seat_deck(choice: Dictionary) -> Dictionary:
	if choice.is_empty():
		return {}
	var deck: Dictionary = choice.get("deck", {})
	var out: Dictionary = {"deck": StarterDecks.forge_deck(deck)}
	var commanders: Array = deck.get("commanders", [])
	if not commanders.is_empty():
		out["cover"] = Txt.of((commanders[0] as Dictionary).get("name"))
	elif deck.get("cover") is String:
		out["cover"] = deck["cover"]
	if Txt.of(deck.get("format")) == "commander" and deck.get("bracket") != null:
		out["bracket"] = int(deck["bracket"])
	if AccountSession.signed_in():
		out["conta"] = AccountSession.token()
		out["deckId"] = Txt.of(choice.get("id"))
	return out
