# Prévia da fileira lotada de cartas viradas (terrenos e artefatos virados nos dois lados), para conferir o espaço na mesa.
# Com janela: npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_wide_row.gd -- <arquivo.png>
extends SceneTree

const LANDS := ["Plains", "Island", "Swamp", "Mountain", "Forest", "Command Tower", "Evolving Wilds", "Sol Ring", "Arcane Signet",
	"Mind Stone", "Fabled Passage", "Temple of Malice"]


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("fileira.png")
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	var state: Dictionary = {"type": "state", "you": 0, "turn": 9, "phase": "MAIN1", "activePlayer": 0, "stack": [], "combat": [],
		"input": {"selectable": [], "actionable": []}, "players": [_player(0), _player(1)]}
	table.apply_state(state)
	await create_timer(5.0).timeout
	table.apply_state(state)
	await create_timer(1.5).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out)
	print("pronto")
	quit()


func _player(id: int) -> Dictionary:
	var field: Array = []
	for i: int in LANDS.size():
		var name: String = LANDS[i]
		var land: bool = i < 7 or name.contains("Passage") or name.contains("Temple")
		field.append({"id": id * 100 + i, "name": name, "typeLine": "Land" if land else "Artifact", "land": land,
			"controller": id, "tapped": i % 3 != 2})
	for i: int in 6:
		field.append({"id": id * 100 + 50 + i, "name": ["Grizzly Bears", "Serra Angel", "Wind Drake", "Hill Giant", "Llanowar Elves", "Giant Spider"][i],
			"typeLine": "Creature", "creature": true, "power": 2, "toughness": 2, "controller": id, "tapped": i % 2 == 0})
	return {"id": id, "seat": id, "name": "Jogador %d" % id, "life": 20, "library": 60, "handCount": 4, "hand": [],
		"battlefield": field, "graveyard": [], "exile": []}
