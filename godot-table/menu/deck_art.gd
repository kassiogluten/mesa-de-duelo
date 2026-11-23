# A capa e as cores dos decks da tela inicial: qual carta é a capa (a regra de coverRow do navegador), a arte recortada
# dela pelo catálogo das cartas e as cores do deck pelos dados das cartas.
class_name DeckArt
extends Node

## Chegaram dados de cartas: capas e cores podem ter mudado.
signal info_changed
## A arte de um endereço terminou de baixar (ou veio do disco).
signal art_ready(url: String, texture: Texture2D)

## O catálogo das cartas (da tela inicial; Meus decks usa o mesmo).
var catalog: CardCatalog


func _ready() -> void:
	if catalog == null:
		catalog = CardCatalog.new()
		add_child(catalog)
	catalog.info_ready.connect(func(_names: PackedStringArray) -> void: info_changed.emit())
	catalog.texture_ready.connect(func(url: String, texture: Texture2D) -> void: art_ready.emit(url, texture))


## Pede os dados que a capa de cada deck precisa: os comandantes; nos outros formatos, as cartas do deck principal.
func request_covers(decks: Array) -> void:
	var names: PackedStringArray = []
	for deck: Dictionary in decks:
		names.append_array(cover_candidates(deck))
	catalog.request(names)


## Pede todas as cartas de um deck (as cores do deck escolhido).
func request_all(deck: Dictionary) -> void:
	var names: PackedStringArray = []
	for e: Dictionary in DeckList.entries(deck):
		names.append(Txt.of(e.get("name")))
	catalog.request(names)


## O endereço da arte da capa de um deck ("" enquanto não se sabe).
func art_url(deck: Dictionary) -> String:
	return catalog.art_url_for(cover_name(deck, catalog.info))


## A arte já carregada de um endereço, ou null (e o pedido para baixar; art_ready avisa).
func texture(url: String) -> Texture2D:
	return catalog.texture(url)


## As cores do deck em WUBRG, pelos dados que já chegaram.
func colors(deck: Dictionary) -> PackedStringArray:
	return DeckScreen.deck_colors(deck, catalog)


## As cartas que podem ser a capa: os comandantes, ou as do deck principal.
static func cover_candidates(deck: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	var commanders: Array = _list(deck.get("commanders"))
	for e: Variant in (commanders if not commanders.is_empty() else _list(deck.get("cards"))):
		if e is Dictionary:
			out.append(Txt.of((e as Dictionary).get("name")))
	return out


## A carta da capa (coverRow de src/ui/deckStats.ts): com comandante, o primeiro comandante (o primeiro com arte,
## quando os dados chegaram); senão a capa escolhida, se está no deck principal; senão a criatura de maior valor de mana,
## ou qualquer outra que não seja terreno. `info` é (nome) -> os dados da carta ({} enquanto não chegam). "" sem capa.
static func cover_name(deck: Dictionary, info: Callable) -> String:
	var commanders: Array = _list(deck.get("commanders"))
	if not commanders.is_empty():
		for e: Variant in commanders:
			var name: String = Txt.of((e as Dictionary).get("name")) if e is Dictionary else ""
			if name != "" and Txt.of((info.call(name) as Dictionary).get("art", "")) != "":
				return name
		return Txt.of((commanders[0] as Dictionary).get("name")) if commanders[0] is Dictionary else ""
	var cards: Array = _list(deck.get("cards"))
	var chosen: String = Txt.of(deck.get("cover")) if deck.get("cover") is String else ""
	if chosen != "" and not DeckList.has_command_zone(Txt.of(deck.get("format"))):
		for e: Variant in cards:
			if e is Dictionary and Txt.of((e as Dictionary).get("name")) == chosen:
				return chosen
	# Só as que têm arte, da maior para a menor no valor de mana; no empate, a ordem do deck.
	var rows: Array = []
	for i: int in cards.size():
		if not cards[i] is Dictionary:
			continue
		var name: String = Txt.of((cards[i] as Dictionary).get("name"))
		var data: Dictionary = info.call(name)
		if Txt.of(data.get("art", "")) != "":
			rows.append({"name": name, "cmc": float(data.get("cmc", 0.0)), "kind": Txt.of(data.get("kind")), "index": i})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if float(a["cmc"]) != float(b["cmc"]):
			return float(a["cmc"]) > float(b["cmc"])
		return int(a["index"]) < int(b["index"]))
	for row: Dictionary in rows:
		if row["kind"] == "creature":
			return Txt.of(row["name"])
	for row: Dictionary in rows:
		if row["kind"] != "land":
			return Txt.of(row["name"])
	return ""


static func _list(value: Variant) -> Array:
	return value if value is Array else []
