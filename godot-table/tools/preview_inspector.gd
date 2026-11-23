# Prints do inspetor de carta numa mesa de exemplo: virar a dupla face, o tipo mudado, as cartas ligadas com a seta de
# voltar, o Apontar e o foil pela raridade (no inspetor e na prévia). Usa o catálogo de verdade (servidor local).
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_inspector.gd -- <cena> <pasta>
# Cenas: dfc (antes, no meio do giro e depois), tipo, ligadas (e voltar), mutada, foil (inspetor e prévia).
extends SceneTree

var _table: TableView
var _inspector: CardInspector
var _catalog: CardCatalog
var _state: Dictionary
var _dir: String


func _card(id: int, name: String, extra: Dictionary = {}) -> Dictionary:
	var card: Dictionary = {"id": id, "name": name, "tapped": false, "controller": 0, "damage": 0}
	card.merge(extra, true)
	return card


func _make_state(mine: Array, theirs: Array, their_exile: Array = []) -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		players.append({"id": pid, "name": "Você" if pid == 0 else "Ana", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": 0, "hand": [], "battlefield": mine if pid == 0 else theirs, "graveyard": [], "exile": [] if pid == 0 else their_exile})
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": {"gen": 1, "priority": true, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false},
			"selectable": [], "actionable": []}, "events": [], "gameOver": false}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var scene: String = args[0]
	_dir = args[1]
	DirAccess.make_dir_recursive_absolute(_dir)
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	_inspector = CardInspector.new()
	_inspector.catalog = _catalog
	layer.add_child(_inspector)
	_catalog.texture_ready.connect(_table.on_texture_ready)
	_catalog.texture_ready.connect(_inspector.on_texture_ready)
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	match scene:
		"dfc":
			_state = _make_state([_card(10, "Delver of Secrets", {"creature": true, "power": 1, "toughness": 1}),
				_card(11, "Insectile Aberration", {"creature": true, "power": 3, "toughness": 2, "keywords": ["FLYING"]})], [])
		"tipo":
			_state = _make_state([_card(20, "Forest", {"typeLine": "Basic Land Creature — Forest Elemental", "printedType": "Basic Land — Forest",
				"creature": true, "land": true, "power": 3, "toughness": 3, "typeChangedBy": ["Living Lands"]})], [])
		"ligadas", "mutada":
			var ring := _card(30, "Oblivion Ring", {"exiling": [301]})
			var angel := _card(31, "Serra Angel", {"creature": true, "power": 4, "toughness": 4, "keywords": ["FLYING", "VIGILANCE"]})
			var aura := _card(32, "Rancor", {"attachedTo": 31})
			var mutant := _card(33, "Gemrazer", {"creature": true, "power": 5, "toughness": 5,
				"merged": [{"id": 33, "name": "Gemrazer"}, {"id": 34, "name": "Llanowar Elves"}, {"id": 35, "faceDown": true}]})
			_state = _make_state([ring, angel, aura, mutant], [], [_card(301, "Shivan Dragon", {"controller": 1})])
		"foil":
			_state = _make_state([_card(40, "Sheoldred, the Apocalypse", {"creature": true, "power": 4, "toughness": 5}),
				_card(41, "Llanowar Elves", {"creature": true, "power": 1, "toughness": 1}),
				_card(42, "Thragtusk", {"creature": true, "power": 5, "toughness": 3})], [])
	_table.apply_state(_state)
	await create_timer(3.0).timeout
	_table.refresh_textures()
	await create_timer(1.0).timeout
	match scene:
		"dfc":
			_open(10)
			await _shot("dfc-frente", 0.9)
			_inspector.turn()
			await _shot("dfc-girando", 0.13)
			await _shot("dfc-verso", 0.9)
			_inspector.close()
			_open(11)
			await _shot("dfc-transformada", 0.9)
		"tipo":
			_open(20)
			await _shot("tipo-mudado", 0.8)
		"ligadas":
			_open(30)
			await _shot("ligadas-exilada", 0.8)
			_inspector.open_link(CardLinks.find(_state, 301))
			await _shot("ligadas-voltar", 0.8)
			_inspector.close()
			_open(32)
			await _shot("ligadas-anexada", 0.8)
		"mutada":
			_open(33)
			await create_timer(0.8).timeout
			for scroll: Node in _inspector.find_children("*", "ScrollContainer", true, false):
				(scroll as ScrollContainer).scroll_vertical = 2000
			await _shot("ligadas-mutada", 0.3)
		"foil":
			_open(40)
			_move(Vector2(640, 330))
			await _shot("foil-mitica", 1.6)
			_open(42)
			_move(Vector2(600, 420))
			await _shot("foil-rara", 1.6)
			_inspector.close()
			# A prévia que segue o mouse também tem o foil (a mesa, não).
			for id: int in [40, 42]:
				var at := Vector2(500, 450)
				_move(at)
				_inspector.show_preview(_table.card_data(id), _ctx(), _table.card_node(id).image_url)
				await _shot("foil-previa-%s" % ("mitica" if id == 40 else "rara"), 0.8)
				_inspector.hide_preview(true)
	quit()


func _open(id: int) -> void:
	var card: Dictionary = _table.card_data(id)
	var node: CardNode = _table.card_node(id)
	_inspector.open(card, _ctx(), node.image_url if node else "")


func _ctx() -> Dictionary:
	return {"lookup": _catalog.info, "you": 0, "state": _state,
		"player_name": func(id: int) -> String: return "você" if id == 0 else "Ana",
		"card_name": func(id: int) -> String: return _catalog.label(Txt.of(_table.card_data(id).get("name"))),
		"point": func(id: int) -> void: print("apontou ", id)}


func _shot(name: String, wait: float) -> void:
	await create_timer(wait).timeout
	root.get_texture().get_image().save_png("%s/%s.png" % [_dir, name])


func _move(pos: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = pos
	motion.global_position = pos
	root.push_input(motion, true)
