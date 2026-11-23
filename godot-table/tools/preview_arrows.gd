# Prévia das setas da mesa (Arrows): a viva mirando um alvo, uma de ataque e uma de bloqueio sobre a mesa, em quadros fixos.
# Com janela: npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_arrows.gd -- <pasta>
extends SceneTree


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
	var mine: Array = [
		{"id": 1, "name": "Serra Angel", "typeLine": "Creature — Angel", "creature": true, "power": 4, "toughness": 4, "controller": 0},
		{"id": 2, "name": "Grizzly Bears", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 0},
		{"id": 3, "name": "Plains", "typeLine": "Basic Land — Plains", "land": true, "controller": 0}]
	var theirs: Array = [
		{"id": 11, "name": "Shivan Dragon", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1},
		{"id": 12, "name": "Llanowar Elves", "typeLine": "Creature — Elf", "creature": true, "power": 1, "toughness": 1, "controller": 1},
		{"id": 13, "name": "Mountain", "typeLine": "Basic Land — Mountain", "land": true, "controller": 1}]
	var state: Dictionary = {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "stack": [], "combat": [],
		"input": {"selectable": [], "actionable": []},
		"players": [
			{"id": 0, "name": "Você", "life": 20, "library": 40, "hand": [], "handCount": 0, "graveyard": [], "exile": [], "battlefield": mine},
			{"id": 1, "name": "Oponente", "life": 20, "library": 40, "handCount": 3, "graveyard": [], "exile": [], "battlefield": theirs}]}
	table.apply_state(state)
	await create_timer(4.0).timeout
	table.apply_state(state)
	await create_timer(1.0).timeout
	var arrows := Arrows.new()
	table.add_child(arrows)
	var at := func(id: int) -> Vector3: return table.card_node(id).global_position + Vector3(0, 0.05, 0)
	# Viva: da sua carta até um ponto no ar perto do alvo (o mouse); ataque: do dragão até você; bloqueio: do urso ao elfo.
	arrows.arrows = [
		{"from": at.call(2), "to": at.call(12) + Vector3(-0.9, 0, 0.2), "color": Color(1.0, 0.8, 0.35), "live": true},
		{"from": at.call(11), "to": at.call(1), "color": Color(1.0, 0.38, 0.3), "live": false},
		{"from": at.call(1), "to": at.call(11) + Vector3(1.6, 0, 0.5), "color": Color(0.45, 0.7, 1.0), "live": false}]
	for i: int in 6:
		await create_timer(0.25).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(folder.path_join("setas-%d.png" % i))
	print("pronto")
	quit()
