# Prévia do projétil das mágicas com alvo, em cada estilo de cor (fogo, arcano, sombra, radiante, natureza, energia e
# multicolorido), com quadros da carga, do voo e do impacto. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_missile.gd -- <pasta> [estilo]
extends SceneTree

const STYLES := [["fogo", "{R}"], ["arcano", "{1}{U}"], ["sombra", "{B}{B}"], ["radiante", "{W}"], ["natureza", "{G}"], ["energia", "{2}"], ["multi", "{U}{R}"]]
const MOMENTS := [0.1, 0.25, 0.38, 0.5, 0.62]


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var only: String = args[1] if args.size() > 1 else ""
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
				{"id": 1, "name": "Mountain", "typeLine": "Basic Land — Mountain", "land": true, "controller": 0}]},
			{"id": 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 3, "graveyard": [], "exile": [], "battlefield": [
				{"id": 11, "name": "Serra Angel", "manaCost": "{3}{W}{W}", "typeLine": "Creature — Angel", "creature": true, "power": 4, "toughness": 4, "controller": 1},
				{"id": 12, "name": "Grizzly Bears", "manaCost": "{1}{G}", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 1}]}],
	}
	table.apply_state(state)
	await create_timer(4.0).timeout
	table.apply_state(state)
	await create_timer(0.5).timeout
	var fx_root := Node3D.new()
	root.add_child(fx_root)
	var from: Vector3 = table.card_node(1).global_position
	var to: Vector3 = table.card_node(12).global_position
	for entry: Array in STYLES:
		if only != "" and only != entry[0]:
			continue
		var card: Dictionary = {"manaCost": entry[1]}
		SpellMissile.launch(fx_root, from, to, card, func() -> void: table.card_node(12).flash_color(SpellMissile.style_of(card)["color"], 0.4), 1.0, table.card_node(12))
		var start: float = Time.get_ticks_msec() / 1000.0
		for i: int in MOMENTS.size():
			var wait: float = float(MOMENTS[i]) - (Time.get_ticks_msec() / 1000.0 - start)
			if wait > 0.0:
				await create_timer(wait).timeout
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(folder.path_join("%s-%d.png" % [entry[0], i]))
		await create_timer(1.2).timeout
	print("pronto")
	quit()
