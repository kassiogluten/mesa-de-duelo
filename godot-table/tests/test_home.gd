# Testes da tela inicial: a carta da capa de cada deck (a regra do navegador), o tipo das cartas e a fileira de decks.
extends "res://tests/test_case.gd"

const INFO := {
	"Llanowar Elves": {"art": "a/elves", "cmc": 1.0, "kind": "creature"},
	"Shivan Dragon": {"art": "a/dragon", "cmc": 6.0, "kind": "creature"},
	"Serra Angel": {"art": "a/angel", "cmc": 5.0, "kind": "creature"},
	"Baneslayer Angel": {"art": "a/bane", "cmc": 5.0, "kind": "creature"},
	"Wrath of God": {"art": "a/wrath", "cmc": 4.0, "kind": "sorcery"},
	"Plains": {"art": "a/plains", "cmc": 0.0, "kind": "land"},
	"Sol Ring": {"art": "a/ring", "cmc": 1.0, "kind": "artifact"},
	"Krenko, Mob Boss": {"art": "a/krenko", "cmc": 4.0, "kind": "creature"},
}


func _info(name: String) -> Dictionary:
	return INFO.get(name, {})


static func _deck(names: Array, extra: Dictionary = {}) -> Dictionary:
	var cards: Array = []
	for name: String in names:
		cards.append({"name": name, "count": 1})
	var deck: Dictionary = {"format": "standard", "cards": cards}
	deck.merge(extra, true)
	return deck


func test_cover_is_the_highest_mana_value_creature() -> void:
	check_eq(DeckArt.cover_name(_deck(["Plains", "Llanowar Elves", "Wrath of God", "Shivan Dragon"]), _info), "Shivan Dragon", "a criatura de maior valor de mana")
	check_eq(DeckArt.cover_name(_deck(["Serra Angel", "Baneslayer Angel"]), _info), "Serra Angel", "no empate, a primeira do deck")
	check_eq(DeckArt.cover_name(_deck(["Plains", "Wrath of God", "Sol Ring"]), _info), "Wrath of God", "sem criatura, a de maior valor que não é terreno")
	check_eq(DeckArt.cover_name(_deck(["Plains"]), _info), "", "só terrenos: sem capa")
	check_eq(DeckArt.cover_name(_deck(["Unknown Card", "Llanowar Elves"]), _info), "Llanowar Elves", "as que não têm dados ficam de fora")


func test_cover_prefers_the_chosen_card_and_the_commander() -> void:
	var chosen: Dictionary = _deck(["Shivan Dragon", "Llanowar Elves"], {"cover": "Llanowar Elves"})
	check_eq(DeckArt.cover_name(chosen, _info), "Llanowar Elves", "a capa escolhida, se está no deck")
	chosen["cover"] = "Serra Angel"
	check_eq(DeckArt.cover_name(chosen, _info), "Shivan Dragon", "a escolhida fora do deck não vale")
	var commander: Dictionary = _deck(["Shivan Dragon", "Sol Ring"], {"format": "commander", "commanders": [{"name": "Krenko, Mob Boss", "count": 1}]})
	check_eq(DeckArt.cover_name(commander, _info), "Krenko, Mob Boss", "com comandante, a capa é a dele")
	commander["commanders"] = [{"name": "Unknown Commander", "count": 1}]
	check_eq(DeckArt.cover_name(commander, _info), "Unknown Commander", "o comandante mesmo sem dados (a arte vem pelo nome)")
	check_eq(DeckArt.cover_candidates(commander), PackedStringArray(["Unknown Commander"]), "com comandante, só ele é pedido")


func test_card_kind_by_the_english_type_line() -> void:
	check_eq(CardCatalog.kind_of("Legendary Creature — Goblin Warrior"), "creature", "criatura")
	check_eq(CardCatalog.kind_of("Land Creature — Forest Dryad"), "land", "terreno vem antes de criatura")
	check_eq(CardCatalog.kind_of("Artifact Creature — Golem"), "creature", "criatura artefato")
	check_eq(CardCatalog.kind_of("Instant // Sorcery"), "instant", "a primeira das duas faces")
	check_eq(CardCatalog.kind_of("Tribal Kindred"), "other", "sem tipo conhecido")
	var entry: Dictionary = CardCatalog._entry({"name": "Shivan Dragon", "cmc": 6, "type_line": "Creature — Dragon",
		"image_uris": {"normal": "https://cards.scryfall.io/normal/x.jpg", "art_crop": "https://cards.scryfall.io/art_crop/x.jpg"}})
	check(Txt.of(entry.get("art")).ends_with("art_crop/x.jpg"), "a arte recortada nos dados da carta")
	check_eq(entry.get("cmc"), 6.0, "o valor de mana")
	check_eq(entry.get("kind"), "creature", "o tipo")


func test_strip_marks_the_chosen_deck() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var strip := DeckStrip.new()
	strip.size = Vector2(900, 160)
	tree.root.add_child(strip)
	strip.set_decks([{"name": "A"}, {"name": "B"}, {"name": "C"}], 1)
	check_eq(strip.tile_count(), 3, "um ladrilho por deck")
	check(strip.tile(1).selected and not strip.tile(0).selected, "o escolhido marcado")
	var picked: Array = []
	strip.picked.connect(func(index: int) -> void: picked.append(index))
	strip.tile(2).pressed.emit()
	check_eq(picked, [2], "tocar num ladrilho escolhe o deck")
	strip.select(2)
	check(strip.tile(2).selected and not strip.tile(1).selected, "a marca passa para o novo")
	var more: Array = []
	strip.more_pressed.connect(func() -> void: more.append(true))
	(strip.find_child("MoreDecks", true, false) as Button).pressed.emit()
	check_eq(more.size(), 1, "o ladrilho + Meus decks abre Meus decks")
	strip.queue_free()


func test_menu_switches_decks_with_the_arrows() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var previous: String = DeckLibrary.path
	DeckLibrary.path = "user://teste-home-decks.json"
	# A escolha fica lembrada nas preferências: devolve a de antes no fim.
	var remembered: Variant = Prefs.load_all().get("deck_standard")
	var menu := MenuScreen.new()
	tree.root.add_child(menu)
	var strip: DeckStrip = menu.find_child("Decks", true, false)
	var first: Dictionary = menu._your_deck()
	check(not first.is_empty() and strip.selected >= 0, "começa com um deck escolhido")
	# Do primeiro, para a seta da esquerda ter para onde voltar.
	menu.pick(0)
	var start: int = strip.selected
	var key := InputEventKey.new()
	key.pressed = true
	key.keycode = KEY_RIGHT
	menu._unhandled_input(key)
	check_eq(strip.selected, start + 1, "a seta para a direita escolhe o próximo")
	check(menu._your_deck() != first, "e ele vira o seu deck")
	key.keycode = KEY_LEFT
	menu._unhandled_input(key)
	check_eq(strip.selected, start, "a seta para a esquerda volta")
	var sent: Array = []
	menu.play.connect(func(message: Dictionary) -> void: sent.append(message))
	key.keycode = KEY_ENTER
	menu._unhandled_input(key)
	check(sent.size() == 1 and Txt.of((sent[0] as Dictionary).get("type")) == "start", "Enter começa a partida")
	menu.queue_free()
	DeckLibrary.path = previous
	Prefs.save("deck_standard", remembered)
