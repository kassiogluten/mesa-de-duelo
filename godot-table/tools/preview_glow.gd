# Prévia dos brilhos no formato da carta (entrada, entrada lendária, luz na borda, pulso), com a câmera perto, em quadros
# fixos. Com janela: npm run godot -- --resolution 1200x800 --position 0,0 --script res://tools/preview_glow.gd -- <pasta>
extends SceneTree

const MOMENTS := [0.06, 0.16, 0.3, 0.48]


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	var state: Dictionary = {
		"type": "state", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "priorityPlayer": 0, "stack": [],
		"players": [
			{"id": 0, "name": "Você", "life": 20, "library": 30, "hand": [], "graveyard": [], "exile": [], "battlefield": [
				{"id": 1, "name": "Serra Angel", "manaCost": "{3}{W}{W}", "typeLine": "Creature — Angel", "creature": true, "power": 4, "toughness": 4, "controller": 0},
				{"id": 2, "name": "Llanowar Elves", "manaCost": "{G}", "typeLine": "Creature — Elf Druid", "creature": true, "power": 1, "toughness": 1, "controller": 0},
				{"id": 3, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 0}]},
			{"id": 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 0, "graveyard": [], "exile": [], "battlefield": []}],
	}
	table.apply_state(state)
	await create_timer(4.0).timeout
	table.apply_state(state)
	var focus: Vector3 = table.card_node(2).global_position
	table.camera.look_at_from_position(focus + Vector3(0, 2.0, 1.3), focus)
	await create_timer(1.0).timeout
	var plays: Array = [
		["entrada", func() -> void:
			CardGlow.entered(table.card_node(1), Color(0.95, 0.9, 0.7))
			CardGlow.entered(table.card_node(2), Color(0.45, 0.85, 0.4))
			CardGlow.entered(table.card_node(3), Color(1.0, 0.45, 0.3))],
		["lendaria", func() -> void: CardGlow.entered(table.card_node(2), Color(0.45, 0.85, 0.4), true)],
		["borda", func() -> void:
			CardGlow.trace(table.card_node(1), Hud.GOLD)
			CardGlow.trace(table.card_node(3), Color(1.0, 0.45, 0.3))],
		["pulso", func() -> void:
			CardGlow.pulse(table.card_node(2), Color(0.4, 0.7, 1.0))
			CardGlow.pulse(table.card_node(3), Color(1.0, 0.4, 0.2), 0.07)],
	]
	for play: Array in plays:
		(play[1] as Callable).call()
		var start: float = Time.get_ticks_msec() / 1000.0
		for i: int in MOMENTS.size():
			var wait: float = float(MOMENTS[i]) - (Time.get_ticks_msec() / 1000.0 - start)
			if wait > 0.0:
				await create_timer(wait).timeout
			await process_frame
			var path: String = folder.path_join("%s-%d.png" % [play[0], i])
			root.get_texture().get_image().save_png(path)
		await create_timer(1.0).timeout
	print("pronto")
	quit()
