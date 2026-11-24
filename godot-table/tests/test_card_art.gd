# Testes da arte das cartas: endereços (espelho, série Nyx, Cartas da mesa, ficha pelo nome), a fila com prioridade, a
# imagem pequena e a carta desenhada (o que vai nela: nome, tipo e texto em português, P/R e a cor).
extends "res://tests/test_case.gd"


func _catalog() -> CardCatalog:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	return catalog


func test_token_names_drop_token_and_speak_portuguese() -> void:
	check_eq(TokenNames.base("Goblin Token"), "Goblin", "sem o Token")
	check_eq(TokenNames.base("Llanowar Elves"), "Llanowar Elves", "carta comum fica igual")
	check_eq(TokenNames.label("Soldier Token"), "Soldado", "nome em português")
	check_eq(TokenNames.type_line("Token Creature — Goblin Soldier", true), "Criatura Ficha — Goblin Soldado", "tipo da ficha")
	check_eq(TokenNames.type_line("Token Artifact — Treasure", true), "Artefato Ficha — Tesouro", "ficha de artefato")
	check_eq(TokenNames.colors("Token Creature — Goblin"), ["R"], "goblin é vermelho")
	check_eq(TokenNames.colors("Token Artifact — Treasure"), [], "tesouro é incolor")


func test_mirror_maps_set_and_number_images_both_ways() -> void:
	var api: String = "https://api.scryfall.com/cards/thb/250?format=image&version=normal"
	var mirrored: String = GameConfig.image_url(api)
	check_eq(mirrored, GameConfig.IMAGES_MIRROR + "cards/normal/thb/250", "série e número pelo espelho")
	check_eq(GameConfig.original_image_url(mirrored), api, "volta ao Scryfall")
	var front: String = "https://cards.scryfall.io/normal/front/a/b/ab.jpg"
	check_eq(GameConfig.original_image_url(GameConfig.image_url(front)), front, "imagem comum volta ao Scryfall")
	check_eq(GameConfig.image_url("https://api.scryfall.com/cards/named?format=image&version=normal&exact=Goblin"),
		"https://api.scryfall.com/cards/named?format=image&version=normal&exact=Goblin", "pelo nome não passa no espelho")


func test_small_image_of_each_kind_of_address() -> void:
	check_eq(ImageStore.small_url_of(GameConfig.IMAGES_MIRROR + "normal/front/a/b/ab.jpg"), GameConfig.IMAGES_MIRROR + "small/front/a/b/ab.jpg", "espelho")
	check_eq(ImageStore.small_url_of(GameConfig.IMAGES_MIRROR + "cards/normal/thb/250"), GameConfig.IMAGES_MIRROR + "cards/small/thb/250", "série e número")
	check_eq(ImageStore.small_url_of("https://api.scryfall.com/cards/named?format=image&version=normal&exact=Opt"),
		"https://api.scryfall.com/cards/named?format=image&version=small&exact=Opt", "pelo nome")
	check_eq(ImageStore.small_url_of("res://cards/own_art/sol-ring-normal.webp"), "", "a da mesa já está aqui")


func test_basic_lands_use_nyx_and_own_art_when_on() -> void:
	DefaultArt._loaded = true
	DefaultArt._enabled = false
	check_eq(DefaultArt.url_for("Forest"), GameConfig.image_url("https://api.scryfall.com/cards/thb/254?format=image&version=normal"), "Floresta na série Nyx")
	check_eq(DefaultArt.url_for("Sol Ring"), "", "staple com a imagem normal")
	DefaultArt._enabled = true
	check_eq(DefaultArt.url_for("Commander's Sphere"), "res://cards/own_art/commander-s-sphere-normal.webp", "arte da mesa")
	for name: String in DefaultArt.OWN_ART:
		check(FileAccess.file_exists(DefaultArt.url_for(name)), "a imagem de %s está no aplicativo" % name)
		check(FileAccess.file_exists(DefaultArt.url_for(name, "small")), "a pequena de %s está no aplicativo" % name)
	DefaultArt._enabled = false
	var catalog := _catalog()
	check_eq(catalog.image_url_for({"name": "Island", "print": {"set": "LEA", "cn": "288"}}), GameConfig.IMAGES_MIRROR + "cards/normal/lea/288", "a impressão do deck vale")
	check_eq(catalog.image_url_for({"name": "Island"}), DefaultArt.url_for("Island"), "sem impressão, a Nyx")
	catalog.queue_free()
	DefaultArt._loaded = false


func test_token_without_image_is_searched_without_token() -> void:
	var catalog := _catalog()
	catalog._asked["Goblin Token"] = true
	check_eq(catalog.image_url_for({"name": "Goblin Token", "token": true}), CardCatalog.NAMED_IMAGE + "Goblin", "busca Goblin")
	check_eq(catalog.label("Goblin Token"), "Goblin", "nome sem Token")
	catalog.queue_free()


func test_drawn_card_uses_portuguese_data_when_known() -> void:
	var catalog := _catalog()
	catalog._info["Llanowar Elves"] = {"label": "Elfos de Llanowar", "type_line": "Criatura — Elfo Druida", "text": "{T}: Adicione {G}.", "colors": ["G"]}
	var elves: Dictionary = CardSketch.spec({"name": "Llanowar Elves", "manaCost": "{G}", "typeLine": "Creature — Elf Druid", "creature": true,
		"power": 3, "toughness": 3, "basePower": 1, "baseToughness": 1}, catalog)
	check_eq(elves["label"], "Elfos de Llanowar", "nome")
	check_eq(elves["type"], "Criatura — Elfo Druida", "tipo")
	check_eq(elves["text"], "{T}: Adicione {G}.", "texto")
	check_eq(elves["pt"], "1/1", "P/R impresso, sem o bônus")
	check_eq(elves["tone"], "G", "verde")
	var goblin: Dictionary = CardSketch.spec({"name": "Goblin Token", "token": true, "typeLine": "Token Creature — Goblin", "creature": true,
		"power": 1, "toughness": 1, "keywords": ["HASTE"], "text": "Haste"}, catalog)
	check_eq(goblin["label"], "Goblin", "ficha sem Token")
	check_eq(goblin["type"], "Criatura Ficha — Goblin", "tipo da ficha")
	check_eq(goblin["text"], "Ímpeto", "palavra-chave em português, sem repetir em inglês")
	check_eq(goblin["tone"], "R", "na cor da ficha")
	check(CardSketch.key(elves) != CardSketch.key(goblin), "chaves diferentes")
	var card: Control = CardSketch.build(goblin)
	check_eq(card.size, Vector2(CardSketch.SIZE), "do tamanho do desenho")
	card.free()
	catalog.queue_free()


func test_table_cards_jump_the_download_queue() -> void:
	var store := ImageStore.new()
	(Engine.get_main_loop() as SceneTree).root.add_child(store)
	for i: int in ImageStore.MAX_DOWNLOADS + 4:
		store.texture("http://127.0.0.1:9/outra-%d.jpg" % i, ImageStore.OTHER)
	store.texture("http://127.0.0.1:9/mao.jpg", ImageStore.TABLE)
	var first: Dictionary = {}
	for item: Dictionary in store._queue:
		if first.is_empty() or int(item["rank"]) < int(first["rank"]):
			first = item
	check_eq(Txt.of(first.get("url")), "http://127.0.0.1:9/mao.jpg", "a carta da mão sai antes das outras na fila")
	store.prefetch("http://127.0.0.1:9/deck.jpg")
	check(store._store_only.has("http://127.0.0.1:9/deck.jpg"), "a do deck só vai para o disco")
	store.texture("http://127.0.0.1:9/deck.jpg", ImageStore.TABLE)
	check(not store._store_only.has("http://127.0.0.1:9/deck.jpg"), "pedida na mesa, vira textura")
	store.queue_free()


func test_split_url() -> void:
	check_eq(ImageFetcher.split_url("https://img.mesao.online/scryfall/x.jpg?1"),
		{"key": "https://img.mesao.online:443", "host": "img.mesao.online", "port": 443, "tls": true, "path": "/scryfall/x.jpg?1"}, "https")
	check_eq(ImageFetcher.split_url("http://127.0.0.1:7171/api"),
		{"key": "http://127.0.0.1:7171", "host": "127.0.0.1", "port": 7171, "tls": false, "path": "/api"}, "http com porta")
	check(ImageFetcher.split_url("res://x.webp").is_empty(), "não é http")


func test_home_options_have_table_cards_switch_off_by_default() -> void:
	DefaultArt._loaded = true
	DefaultArt._enabled = false
	var options := HomeOptions.new()
	(Engine.get_main_loop() as SceneTree).root.add_child(options)
	options.toggle()
	var found: Array[Node] = options.find_children("OwnArt", "CheckBox", true, false)
	check_eq(found.size(), 1, "o interruptor Cartas da mesa")
	if found.size() == 1:
		check(not (found[0] as CheckBox).button_pressed, "começa desligado")
	check_eq(options.find_children("OwnArtHint", "Label", true, false).size(), 1, "com a explicação")
	options.close()
	options.queue_free()
	DefaultArt._loaded = false
