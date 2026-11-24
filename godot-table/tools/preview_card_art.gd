# Prints da arte das cartas na mesa: a carta desenhada enquanto a imagem não chega, a ficha sem arte, a ficha achada pelo
# nome e os terrenos básicos (série Nyx ou "Cartas da mesa"). Precisa do servidor local (os dados em português).
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_card_art.gd -- <cena> <saída.png>
# Cenas: desenhada (mesa sem nenhuma imagem), cartas (as cartas desenhadas lado a lado, no tamanho do desenho),
# ficha (fichas sem arte), ficha-arte (a ficha "Goblin Token" achada pelo nome), terrenos (Nyx), terrenos-mesa (arte da mesa).
extends SceneTree

const HAND := ["Llanowar Elves", "Lightning Bolt", "Counterspell", "Serra Angel", "Wrath of God"]
const FIELD := ["Grizzly Bears", "Forest", "Prodigal Sorcerer"]
const THEIRS := ["Shivan Dragon", "Mountain"]
const BASICS := ["Plains", "Island", "Swamp", "Mountain", "Forest"]

var _table: TableView
var _catalog: CardCatalog
var _next: int = 100


func _card(name: String, controller: int, extra: Dictionary = {}) -> Dictionary:
	_next += 1
	var card: Dictionary = {"id": _next, "name": name, "controller": controller, "tapped": false, "token": false}
	card.merge(extra, true)
	return card


func _creature(line: String, power: int, toughness: int) -> Dictionary:
	return {"typeLine": line, "creature": true, "power": power, "toughness": toughness, "basePower": power, "baseToughness": toughness}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var scene: String = args[0]
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	_catalog.images.offline = scene in ["desenhada", "cartas", "ficha"]
	if scene == "terrenos-mesa":
		DefaultArt._loaded = true
		DefaultArt._enabled = true
	elif scene == "terrenos":
		DefaultArt._loaded = true
		DefaultArt._enabled = false
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	_catalog.texture_ready.connect(_table.on_texture_ready)
	var state: Dictionary = _state(scene)
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void:
		_table.refresh_textures()
		_table.apply_state(state))
	_table.apply_state(state)
	await create_timer(4.0).timeout
	_table.refresh_textures()
	await create_timer(1.0).timeout
	if scene == "cartas":
		await _sheet(state)
	root.get_texture().get_image().save_png(args[1])
	quit()


func _state(scene: String) -> Dictionary:
	var hand: Array = []
	var mine: Array = []
	var theirs: Array = []
	match scene:
		"desenhada", "cartas":
			hand = [_card("Llanowar Elves", 0, _creature("Creature — Elf Druid", 1, 1)).merged({"manaCost": "{G}"}),
				_card("Lightning Bolt", 0, {"manaCost": "{R}", "typeLine": "Instant"}),
				_card("Counterspell", 0, {"manaCost": "{U}{U}", "typeLine": "Instant"}),
				_card("Serra Angel", 0, _creature("Creature — Angel", 4, 4)).merged({"manaCost": "{3}{W}{W}", "keywords": ["FLYING", "VIGILANCE"]}),
				_card("Wrath of God", 0, {"manaCost": "{2}{W}{W}", "typeLine": "Sorcery"})]
			mine = [_card("Grizzly Bears", 0, _creature("Creature — Bear", 2, 2)).merged({"manaCost": "{1}{G}"}),
				_card("Forest", 0, {"typeLine": "Basic Land — Forest", "land": true}),
				_card("Prodigal Sorcerer", 0, _creature("Creature — Human Wizard", 1, 1)).merged({"manaCost": "{2}{U}"})]
			theirs = [_card("Shivan Dragon", 1, _creature("Creature — Dragon", 5, 5)).merged({"manaCost": "{4}{R}{R}", "keywords": ["FLYING"]})]
		"ficha", "ficha-arte":
			var goblin: Dictionary = _creature("Token Creature — Goblin", 1, 1)
			goblin.merge({"token": true, "keywords": ["HASTE"], "text": "Haste"}, true)
			mine = [_card("Goblin Token", 0, goblin), _card("Goblin Token", 0, goblin)]
			if scene == "ficha":
				var soldier: Dictionary = _creature("Token Creature — Soldier", 1, 1)
				soldier.merge({"token": true}, true)
				mine.append(_card("Soldier Token", 0, soldier))
				var spirit: Dictionary = _creature("Token Creature — Spirit", 1, 1)
				spirit.merge({"token": true, "keywords": ["FLYING"], "text": "Flying"}, true)
				mine.append(_card("Spirit Token", 0, spirit))
			mine.append(_card("Mountain", 0, {"typeLine": "Basic Land — Mountain", "land": true}))
		_:
			for name: String in BASICS:
				mine.append(_card(name, 0, {"typeLine": "Basic Land — " + name, "land": true}))
	var players: Array = [
		{"id": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": hand.size(), "hand": hand, "battlefield": mine, "graveyard": [], "exile": []},
		{"id": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 40, "handCount": 3, "hand": [], "battlefield": theirs, "graveyard": [], "exile": []},
	]
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": {"gen": 1, "priority": true, "selectable": [], "actionable": []}, "events": [], "gameOver": false}


## As cartas desenhadas da mão e da ficha lado a lado, no tamanho do desenho, sobre a mesa escurecida.
func _sheet(state: Dictionary) -> void:
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var shade := ColorRect.new()
	shade.color = Color(0.05, 0.06, 0.09, 1)
	shade.size = Vector2(1600, 900)
	layer.add_child(shade)
	var goblin: Dictionary = _creature("Token Creature — Goblin", 1, 1)
	goblin.merge({"name": "Goblin Token", "token": true, "keywords": ["HASTE"], "text": "Haste"}, true)
	var cards: Array = [(state["players"][0]["hand"] as Array)[0], (state["players"][0]["hand"] as Array)[3], (state["players"][0]["hand"] as Array)[1], goblin]
	_catalog.images.offline = true
	for i: int in cards.size():
		var tex: Texture2D = null
		for _try: int in 30:
			tex = _catalog.sketch(cards[i])
			if tex != null:
				break
			await process_frame
		var rect := TextureRect.new()
		rect.texture = tex
		rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
		rect.size = Vector2(CardSketch.SIZE) * 0.9
		rect.position = Vector2(30 + i * 390, 160)
		layer.add_child(rect)
	await create_timer(0.3).timeout
