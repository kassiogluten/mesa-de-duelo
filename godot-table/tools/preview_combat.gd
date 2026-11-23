# Prévia das peças do combate com a câmera perto, em quadros fixos: a carta se despedaçando, o escudo, o golpe e a onda.
# Com janela: npm run godot -- --resolution 1200x800 --position 0,0 --script res://tools/preview_combat.gd -- <pasta>
extends SceneTree

const MOMENTS := [0.05, 0.2, 0.45, 0.9, 1.5]


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
				{"id": 2, "name": "Grizzly Bears", "manaCost": "{1}{G}", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 0},
				{"id": 3, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 0}]},
			{"id": 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 0, "graveyard": [], "exile": [], "battlefield": []}],
	}
	table.apply_state(state)
	await create_timer(4.0).timeout
	table.apply_state(state)
	var focus: Vector3 = table.card_node(2).global_position
	var angel: Vector3 = table.card_node(1).global_position
	table.camera.look_at_from_position(focus + Vector3(0, 2.6, 1.7), focus)
	await create_timer(1.0).timeout
	var fx := Node3D.new()
	root.add_child(fx)
	var plays: Array = [
		["cacos", func() -> void:
			var node: CardNode = table.detach(1)
			CombatShatter.break_card(fx, node, angel + Vector3(0.2, 0, 1.0), Color(1.0, 0.4, 0.15))],
		["golpe", func() -> void:
			var at: Vector3 = table.card_node(3).global_position
			CombatFx.impact(fx, at, at + Vector3(0, 0, 1.2), Color(1.0, 0.36, 0.14), 6, table.camera)
			CombatPieces.streaks(fx, at + Vector3(0, 0.2, 0), Vector3(0, 0.35, -1), Color(1.0, 0.36, 0.14), 30, 6.0)
			CombatPieces.shockwave(fx, at + Vector3(0, 0.25, 0), 1.6, 0.05)
			MomentPieces.slash(fx, at + Vector3(0, 0.3, 0), Color(1.0, 0.7, 0.5), 0.5, 1.6, 0.22, 0.0)],
		["necrotico", func() -> void: CombatPieces.necrotic(fx, table.card_node(2).global_position)],
		["toxico", func() -> void: CombatPieces.toxic(fx, table.card_node(2).global_position)],
		["marca", func() -> void: CombatPieces.scorch(fx, table.card_node(2).global_position, Color(1.0, 0.4, 0.15), 2.4)],
	]
	for play: Array in plays:
		(play[1] as Callable).call()
		var start: float = Time.get_ticks_msec() / 1000.0
		for i: int in MOMENTS.size():
			var wait: float = float(MOMENTS[i]) - (Time.get_ticks_msec() / 1000.0 - start)
			if wait > 0.0:
				await create_timer(wait).timeout
			await process_frame
			root.get_texture().get_image().save_png(folder.path_join("%s-%d.png" % [play[0], i]))
		await create_timer(1.5).timeout
	print("pronto")
	quit()
