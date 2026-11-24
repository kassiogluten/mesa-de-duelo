# Monta o HUD da partida sem servidor, com uma partida de exemplo, e salva um print para conferir o visual.
# npm run godot -- --resolution 1600x900 --script res://tools/preview_hud.gd -- <exemplo> <saída.png>
# Exemplos: base, history, stops, menu, concede, banner, theirs.
extends SceneTree

const FIXTURE := "res://tests/fixtures/abertura.json"


static func _events() -> Array:
	var frame: Dictionary = {"players": [], "stack": [{"id": 90}], "turn": 3, "phase": "MAIN1", "activePlayer": 1}
	return [
		{"seq": 1001, "type": "turn", "turn": 3, "actor": 1},
		{"seq": 1002, "type": "draw", "actor": 1},
		{"seq": 1003, "type": "land-played", "actor": 1, "card": {"id": 501, "name": "Mountain"}},
		{"seq": 1004, "type": "spell-cast", "actor": 1, "stackId": 90, "card": {"id": 502, "name": "Lightning Bolt"}, "targets": {"players": [0]}, "frame": frame},
		{"seq": 1005, "type": "damage", "actor": 1, "delta": -3, "card": {"id": 502, "name": "Lightning Bolt"}, "targets": {"players": [0]}, "frame": frame},
		{"seq": 1006, "type": "life-changed", "actor": 0, "delta": -3, "frame": frame},
		{"seq": 1007, "type": "resolved", "actor": 1, "stackId": 90, "card": {"id": 502, "name": "Lightning Bolt"}, "frame": frame},
		{"seq": 1008, "type": "attackers", "actor": 1, "cards": [503, 504], "targets": {"players": [0]}},
		{"seq": 1009, "type": "damage", "combat": true, "delta": -2, "card": {"id": 503, "name": "Grizzly Bears"}, "targets": {"players": [0]}},
		{"seq": 1010, "type": "damage", "combat": true, "delta": -3, "card": {"id": 504, "name": "Serra Angel"}, "targets": {"players": [0]}},
		{"seq": 1011, "type": "turn", "turn": 4, "actor": 0},
		{"seq": 1012, "type": "draw", "actor": 0},
		{"seq": 1013, "type": "spell-cast", "actor": 0, "stackId": 91, "card": {"id": 505, "name": "Wrath of God"}},
		{"seq": 1014, "type": "left", "actor": 1, "reason": "destroyed", "card": {"id": 503, "name": "Grizzly Bears"}, "frame": {"players": [], "stack": [{"id": 91}]}},
		{"seq": 1015, "type": "left", "actor": 1, "reason": "destroyed", "card": {"id": 504, "name": "Serra Angel"}, "frame": {"players": [], "stack": [{"id": 91}]}},
		{"seq": 1016, "type": "resolved", "actor": 0, "stackId": 91, "card": {"id": 505, "name": "Wrath of God"}},
	]


func _initialize() -> void:
	# O tema da mesa (main.gd o liga; aqui não há main).
	UiTheme.install()
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0]
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	catalog.request(PackedStringArray(["Mountain", "Lightning Bolt", "Grizzly Bears", "Serra Angel", "Wrath of God"]))
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var bg := ColorRect.new()
	bg.color = Color(0.1, 0.13, 0.25)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(bg)
	var hud := Hud.new()
	hud.catalog = catalog
	layer.add_child(hud)
	var states: Array = JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))
	var state: Dictionary = states[-3]
	state["events"] = (state.get("events", []) as Array) + _events()
	state["match"] = {"gameNumber": 2, "wins": [1, 0], "elapsedMs": 754000}
	state["config"] = {"format": "standard", "matchLength": "bo3"}
	state["preferences"] = {"passLevel": "acoes", "opponentStops": ["COMBAT_DECLARE_BLOCKERS", "END_OF_TURN"]}
	state["phase"] = "COMBAT_DECLARE_ATTACKERS"
	state["combatNumber"] = 2
	state["extraCombats"] = 1
	state["turnElapsedMs"] = 42000
	state["dayTime"] = "day"
	state["activeSpells"] = 1
	if mode == "theirs":
		state["activePlayer"] = 1
		state["extraTurn"] = true
		state["extraTurns"] = [1]
		state["phase"] = "END_OF_TURN"
		state["dayTime"] = "night"
		state["waiting"] = [{"player": 0, "ms": 95000}]
	await create_timer(1.5).timeout
	hud.apply_state(state)
	await create_timer(0.5).timeout
	match mode:
		"history":
			hud._history.toggle(true)
		"stops":
			hud._track.open_menu("combat")
		"menu":
			hud._menu.set_open(true)
		"concede":
			hud._menu._ask_concede()
		"banner":
			hud.banner("Seu turno", Hud.GOLD)
			await create_timer(0.45).timeout
	await create_timer(2.5 if mode != "banner" else 0.0).timeout
	root.get_texture().get_image().save_png(args[1])
	quit()
