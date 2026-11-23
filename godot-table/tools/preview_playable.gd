# Prévia do destaque "pode jogar" (cartas da mão e do campo que dá para usar agora), com um alvo ao lado para comparar,
# em quadros fixos. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_playable.gd -- <pasta>
extends SceneTree

const MOMENTS := [0.0, 0.6, 1.2, 1.8]
## Com MESA_SEQUENCIA=1, grava 30 quadros a cada 0,1 s (para montar uma animação).
const SEQUENCE_STEP := 0.1


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	var dressing := CardDressing.new()
	dressing.table = table
	root.add_child(dressing)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	var hand: Array = []
	for entry: Array in [[50, "Lightning Bolt", "{R}"], [51, "Llanowar Elves", "{G}"], [52, "Counterspell", "{U}{U}"], [53, "Serra Angel", "{3}{W}{W}"]]:
		hand.append({"id": entry[0], "name": entry[1], "manaCost": entry[2], "controller": 0})
	var field: Array = [
		{"id": 1, "name": "Mountain", "typeLine": "Basic Land — Mountain", "land": true, "controller": 0},
		{"id": 2, "name": "Forest", "typeLine": "Basic Land — Forest", "land": true, "controller": 0},
		{"id": 3, "name": "Grizzly Bears", "manaCost": "{1}{G}", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 0}]
	var state: Dictionary = {"type": "state", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "stack": [],
		"players": [
			{"id": 0, "name": "Você", "life": 20, "library": 30, "hand": hand, "handCount": hand.size(), "graveyard": [], "exile": [], "battlefield": field},
			{"id": 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 3, "graveyard": [], "exile": [], "battlefield": [
				{"id": 11, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1}]}]}
	table.apply_state(state)
	await create_timer(4.0).timeout
	table.apply_state(state)
	# Pode jogar: três da mão e dois terrenos; a Serra Angel não (para comparar); o dragão do oponente como alvo.
	table.highlight_roles({"actionable": [50, 51, 52, 1, 2], "selectable": [11]}, false)
	await create_timer(1.0).timeout
	var moments: Array = MOMENTS
	if OS.get_environment("MESA_SEQUENCIA") == "1":
		moments = []
		for k: int in 30:
			moments.append(k * SEQUENCE_STEP)
	var start: float = Time.get_ticks_msec() / 1000.0
	for i: int in moments.size():
		var wait: float = float(moments[i]) - (Time.get_ticks_msec() / 1000.0 - start)
		if wait > 0.0:
			await create_timer(wait).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(folder.path_join("jogavel-%d.png" % i))
	print("pronto")
	quit()
