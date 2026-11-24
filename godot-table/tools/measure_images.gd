# Mede quanto a mesa leva para mostrar as imagens de cartas nunca vistas: monta uma mesa de exemplo, apaga do disco as
# imagens (e esquece os dados) dessas cartas e conta o tempo até a mão e o campo e até a mesa inteira terem imagem.
# npm run godot -- --headless --max-fps 60 --script res://tools/measure_images.gd -- <a|b|c|d> [antes-s]
# `antes-s`: o deck começa a baixar esse tanto de segundos antes da partida (a sala e o mulligan); sem ele (ou -1), nada
# antes. Apaga só os arquivos dessas cartas em user://cards/img (o resto do cache fica).
extends SceneTree

const SETS := {
	"a": {
		"hand": ["Counterspell", "Llanowar Elves", "Doom Blade", "Giant Growth", "Opt", "Shock", "Divination"],
		"mine": ["Grizzly Bears", "Serra Angel", "Elvish Mystic", "Island", "Forest", "Prodigal Sorcerer", "Hill Giant", "Air Elemental", "Wall of Wood", "Wild Growth"],
		"theirs": ["Goblin Guide", "Mountain", "Swamp", "Shivan Dragon", "Gravedigger", "Sengir Vampire", "Raging Goblin", "Bog Imp", "Vampire Bats", "Goblin Piker"],
		"graveyard": ["Lightning Bolt", "Duress", "Terror", "Disfigure", "Raise Dead"],
		"exile": ["Brainstorm", "Ponder", "Preordain", "Negate"],
		"library": ["Mahamoti Djinn", "Wrath of God", "Mind Rot", "Unsummon", "Fog", "Naturalize", "Disenchant", "Healing Salve", "Holy Strength", "Unholy Strength"],
	},
	"b": {
		"hand": ["Mana Leak", "Fyndhorn Elves", "Murder", "Titanic Growth", "Consider", "Lightning Strike", "Think Twice"],
		"mine": ["Centaur Courser", "Baneslayer Angel", "Birds of Paradise", "Plains", "Island", "Merfolk Looter", "Craw Wurm", "Mahamoti Djinn", "Wall of Roots", "Utopia Sprawl"],
		"theirs": ["Monastery Swiftspear", "Mountain", "Forest", "Thundermaw Hellkite", "Fleshbag Marauder", "Vampire Nighthawk", "Goblin Bushwhacker", "Typhoid Rats", "Dread Wanderer", "Keldon Raider"],
		"graveyard": ["Chain Lightning", "Thoughtseize", "Go for the Throat", "Dismember", "Unearth"],
		"exile": ["Impulse", "Serum Visions", "Sleight of Hand", "Essence Scatter"],
		"library": ["Phantasmal Image", "Day of Judgment", "Hymn to Tourach", "Vapor Snag", "Moment's Peace", "Nature's Claim", "Revoke Existence", "Healing Hands", "Rancor", "Bonesplitter"],
	},
	# c e d: cartas pouco jogadas, para o espelho de imagens também não as ter guardadas (a primeira vez de verdade).
	"c": {
		"hand": ["Sage's Dousing", "Wildheart Invoker", "Grasp of Darkness", "Ranger's Guile", "Peek", "Fiery Temper", "Jace's Erasure"],
		"mine": ["Kraul Harpooner", "Linvala, Keeper of Silence", "Gyre Sage", "Plains", "Swamp", "Coral Merfolk", "Krosan Tusker", "Cloudkin Seer", "Overgrown Battlement", "Fertile Ground"],
		"theirs": ["Akroan Crusader", "Mountain", "Forest", "Bogardan Hellkite", "Cadaver Imp", "Child of Night", "Gempalm Incinerator", "Highborn Ghoul", "Pestilence Demon", "Ember Hauler"],
		"graveyard": ["Fireblast", "Inquisition of Kozilek", "Hero's Downfall", "Snuff Out", "Exhume"],
		"exile": ["Anticipate", "Telling Time", "Halimar Depths", "Remand"],
		"library": ["Rite of Replication", "Rout", "Mind Twist", "Repulse", "Holy Day", "Thrashing Brontodon", "Ray of Revelation", "Rest for the Weary", "Ancestral Mask", "Behemoth Sledge"],
	},
	"d": {
		"hand": ["Arcane Denial", "Sylvan Ranger", "Hideous End", "Vines of Vastwood", "Quicken", "Searing Spear", "Frantic Search"],
		"mine": ["Somberwald Stag", "Sublime Archangel", "Wood Elves", "Island", "Mountain", "Man-o'-War", "Yavimaya Wurm", "Sower of Temptation", "Steward of Valeron", "Overgrowth"],
		"theirs": ["Bloodghast", "Swamp", "Plains", "Stormbreath Dragon", "Carrion Feeder", "Vampire Lacerator", "Mogg Fanatic", "Gutless Ghoul", "Abyssal Specter", "Lava Spike"],
		"graveyard": ["Rift Bolt", "Despise", "Victim of Night", "Diabolic Edict", "Animate Dead"],
		"exile": ["Careful Study", "Faithless Looting", "Mental Note", "Daze"],
		"library": ["Clone", "Austere Command", "Sinkhole", "Repeal", "Holy Light", "Krosan Grip", "Dismantling Blow", "Kor Skyfisher", "Rampant Growth", "Loxodon Warhammer"],
	},
}

var _table: TableView
var _catalog: CardCatalog


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var cards: Dictionary = SETS[args[0] if args.size() > 0 else "a"]
	var lead: float = float(args[1]) if args.size() > 1 else -1.0
	var names: PackedStringArray = []
	for zone: String in cards:
		for name: String in cards[zone]:
			if not names.has(name):
				names.append(name)
	await _forget(names)
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	for name: String in names:
		_catalog._info.erase(name)
		_catalog._asked.erase(name)
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	var state: Dictionary = _state(cards)
	_catalog.texture_ready.connect(_table.on_texture_ready)
	var t0: int = Time.get_ticks_msec()
	var marks: Dictionary = {}
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void:
		if not marks.has("dados"):
			marks["dados"] = (Time.get_ticks_msec() - t0) / 1000.0
		_table.refresh_textures()
		_table.apply_state(state))
	_catalog.texture_ready.connect(func(_u: String, _t: Texture2D) -> void:
		if not marks.has("primeira imagem"):
			marks["primeira imagem"] = (Time.get_ticks_msec() - t0) / 1000.0)
	if lead >= 0.0 and _catalog.has_method("prefetch"):
		var deck: Array = []
		for zone: String in ["hand", "mine", "graveyard", "exile", "library"]:
			for name: String in cards[zone]:
				deck.append({"name": name, "count": 1})
		var theirs: Array = []
		for name: String in cards["theirs"]:
			theirs.append({"name": name, "count": 1})
		_catalog.call("prefetch", deck)
		_catalog.call("prefetch", theirs)
		await create_timer(lead).timeout
	var start: int = Time.get_ticks_msec()
	_table.apply_state(state)
	var seen_front: float = -1.0
	var seen_main: float = -1.0
	var seen_all: float = -1.0
	while Time.get_ticks_msec() - start < 60000:
		await process_frame
		var main: Dictionary = _count(["hand", "battlefield"])
		var every: Dictionary = _count([])
		var t: float = (Time.get_ticks_msec() - start) / 1000.0
		if seen_front < 0.0 and int(every["any"]) == int(every["total"]):
			seen_front = t
		if seen_main < 0.0 and int(main["normal"]) == int(main["total"]):
			seen_main = t
		if int(every["normal"]) == int(every["total"]):
			seen_all = t
			break
	var fetcher: ImageFetcher = _catalog.images.fetcher
	print("conjunto %s, deck antes: %s s, cartas à mostra: %d" % [args[0] if args.size() > 0 else "a", str(lead) if lead >= 0.0 else "não", int(_count([])["total"])])
	print("  tudo com alguma imagem do Scryfall (a pequena vale; a desenhada não): %.2f s" % seen_front)
	print("  mão e campo com a imagem nítida: %.2f s" % seen_main)
	print("  mesa inteira com a imagem nítida: %.2f s (total desde o começo, com o deck antes: %.2f s)" % [seen_all, (Time.get_ticks_msec() - t0) / 1000.0])
	print("  conexões abertas: %d, pedidos: %d; chegaram (s desde o começo): %s" % [fetcher.opened, fetcher.requests, str(marks)])
	quit()


## Quantas cartas à mostra (nas zonas dadas; [] = todas) têm a imagem nítida, alguma imagem do Scryfall, e no total.
func _count(zones: Array) -> Dictionary:
	var out: Dictionary = {"normal": 0, "any": 0, "total": 0}
	for key: Variant in _table.card_keys():
		var node: CardNode = _table.card_node(key)
		if not key is int or node == null or node.data.is_empty():
			continue
		if not zones.is_empty() and not zones.has(_table.zone_of(key)):
			continue
		out["total"] += 1
		var url: String = node.image_url
		if url != "" and _catalog.has_texture(url):
			out["normal"] += 1
			out["any"] += 1
		elif url != "" and _catalog.has_texture(ImageStore.small_url_of(url)):
			out["any"] += 1
	return out


## Apaga do disco as imagens das cartas (nítida e pequena) para medir como se fossem novas.
func _forget(names: PackedStringArray) -> void:
	var probe := CardCatalog.new()
	root.add_child(probe)
	probe.request(names)
	var waited: float = 0.0
	while waited < 20.0:
		var ready: bool = true
		for name: String in names:
			if probe.image_url_for({"name": name}) == "":
				ready = false
		if ready:
			break
		await create_timer(0.2).timeout
		waited += 0.2
	var removed: int = 0
	for name: String in names:
		var info: Dictionary = probe.info(name)
		var urls: Array = [probe.image_url_for({"name": name}), Txt.of(info.get("image")), Txt.of(info.get("small"))]
		for url: String in urls.duplicate():
			urls.append(url.replace("/normal/", "/small/").replace("version=normal", "version=small"))
		for url: String in urls:
			if url != "" and FileAccess.file_exists(ImageStore.cache_path(url)):
				DirAccess.remove_absolute(ImageStore.cache_path(url))
				removed += 1
	print("imagens apagadas do disco: %d" % removed)
	probe.queue_free()
	await process_frame


func _state(cards: Dictionary) -> Dictionary:
	var next: Array = [100]
	var make: Callable = func(name: String, controller: int) -> Dictionary:
		next[0] += 1
		return {"id": next[0], "name": name, "controller": controller, "tapped": false, "token": false}
	var mine: Dictionary = {"id": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": 7,
		"hand": (cards["hand"] as Array).map(func(n: String) -> Dictionary: return make.call(n, 0)),
		"battlefield": (cards["mine"] as Array).map(func(n: String) -> Dictionary: return make.call(n, 0)),
		"graveyard": (cards["graveyard"] as Array).map(func(n: String) -> Dictionary: return make.call(n, 0)),
		"exile": (cards["exile"] as Array).map(func(n: String) -> Dictionary: return make.call(n, 0))}
	var theirs: Dictionary = {"id": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 40, "handCount": 5, "hand": [],
		"battlefield": (cards["theirs"] as Array).map(func(n: String) -> Dictionary: return make.call(n, 1)), "graveyard": [], "exile": []}
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": [mine, theirs], "stack": [],
		"combat": [], "input": {"gen": 1, "priority": true, "selectable": [], "actionable": []}, "events": [], "gameOver": false}
