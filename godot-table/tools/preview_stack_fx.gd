# Prévia do destaque da pilha na mesa 3D (chamas de luz, ar tremendo, borda correndo, partículas, a onda de chegar e a de
# resolver, e o pode-responder), sem servidor, em quadros fixos. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_stack_fx.gd -- <pasta>
extends SceneTree

var _folder: String
var _table: TableView
var _stack: StackPanel
var _hud: Hud
var _fx: FxDirector


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_folder = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	_fx = FxDirector.new()
	_fx.table = _table
	root.add_child(_fx)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	_stack = StackPanel.new()
	_stack.catalog = catalog
	layer.add_child(_stack)
	_hud = Hud.new()
	_hud.catalog = catalog
	layer.add_child(_hud)
	_fx.hud = _hud
	_table.stack_slot = _stack.layer_rect
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)
	catalog.request(PackedStringArray(["Lightning Bolt", "Counterspell", "Soul Warden", "Llanowar Elves", "Island", "Forest"]))
	var state: Dictionary = _board()
	_apply(state)
	await create_timer(3.0).timeout
	var bolt := {"id": 9001, "kind": "spell", "controller": 0, "source": {"id": 150, "name": "Lightning Bolt", "manaCost": "{R}", "controller": 0},
		"text": "Lightning Bolt deals 3 damage to any target.", "targets": {"players": [1]}}
	state["players"][0]["hand"] = []
	state["stack"] = [bolt]
	state["events"] = [{"seq": 1, "type": "spell-cast", "actor": 0, "stackId": 9001, "card": bolt["source"]}]
	_apply(state)
	await _shot(0.62, "1-chegada")
	await _shot(1.2, "2-topo")
	var counter := {"id": 9003, "kind": "spell", "controller": 1, "source": {"id": 300, "name": "Counterspell", "manaCost": "{U}{U}", "controller": 1},
		"text": "Counter target spell.", "targets": {"cards": [150]}}
	var warden := {"id": 9002, "kind": "trigger", "controller": 1, "source": {"id": 202, "name": "Soul Warden", "manaCost": "{W}", "controller": 1},
		"text": "You gain 1 life."}
	state["stack"] = [warden, bolt]
	state["events"] = []
	_apply(state)
	await _shot(1.3, "3-gatilho")
	state["stack"] = [counter, warden, bolt]
	state["input"] = {"gen": 4, "priority": true, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false}}
	_apply(state)
	await _shot(1.5, "4-responder")
	state["stack"] = [warden, bolt]
	state["input"] = {"gen": 5, "priority": false}
	_apply(state)
	await _shot(0.12, "5-resolveu")
	await _shot(1.0, "6-depois")
	print("pronto")
	quit()


func _apply(state: Dictionary) -> void:
	_fx.before_state(state)
	_table.apply_state(state)
	_stack.apply_state(state)
	_hud.apply_state(state)


func _shot(after: float, tag: String) -> void:
	await create_timer(after).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(_folder.path_join("%s.png" % tag))


func _board() -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var field: Array = []
		var names: Array = [["Forest", false, true], ["Llanowar Elves", true, false]] if pid == 0 else [["Island", false, true], ["Soul Warden", true, false]]
		for i: int in names.size():
			field.append({"id": 101 + pid * 100 + i, "name": names[i][0], "creature": names[i][1], "land": names[i][2], "power": 1, "toughness": 1, "controller": pid})
		var hand: Array = [{"id": 150, "name": "Lightning Bolt", "manaCost": "{R}", "controller": 0}] if pid == 0 else []
		players.append({"id": pid, "name": "Você" if pid == 0 else "Ana", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": hand.size() if pid == 0 else 3, "hand": hand, "battlefield": field, "graveyard": [], "exile": []})
	players[1]["battlefield"][1]["id"] = 202
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"events": [], "gameOver": false, "input": {"gen": 1, "priority": true}}
