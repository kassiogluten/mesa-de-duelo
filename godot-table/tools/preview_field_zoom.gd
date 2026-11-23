# Prévia do aumento das permanentes com o campo vazio: a mesma mesa com 1, 3, 6 e 12 permanentes por lado, um print de cada.
# Com janela: npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_field_zoom.gd -- <pasta>
extends SceneTree

const CREATURES := ["Grizzly Bears", "Wind Drake", "Llanowar Elves", "Serra Angel", "Shivan Dragon", "Giant Spider", "Hill Giant"]
const LANDS := ["Forest", "Island", "Mountain", "Plains", "Swamp"]

var _next_id: int = 100


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
	for count: int in [1, 3, 6, 12]:
		var state: Dictionary = {"type": "state", "you": 0, "turn": count, "phase": "MAIN1", "activePlayer": 0, "stack": [],
			"combat": [], "input": {"selectable": [], "actionable": []},
			"players": [_player(0, count), _player(1, count)]}
		table.apply_state(state)
		await create_timer(4.0).timeout
		table.apply_state(state)
		await create_timer(1.5).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(folder.path_join("campo-%02d.png" % count))
	print("pronto")
	quit()


## `count` permanentes: metade terrenos (atrás), metade criaturas (na frente), sempre as mesmas ids para a carta só mudar
## de tamanho entre um print e outro.
func _player(id: int, count: int) -> Dictionary:
	var field: Array = []
	for i: int in count:
		var land: bool = i % 2 == 0
		var name: String = LANDS[(i / 2) % LANDS.size()] if land else CREATURES[(i / 2) % CREATURES.size()]
		var card: Dictionary = {"id": id * 1000 + i, "name": name, "typeLine": "Basic Land" if land else "Creature", "land": land,
			"creature": not land, "controller": id, "tapped": false}
		if not land:
			card["power"] = 2
			card["toughness"] = 2
		field.append(card)
	return {"id": id, "seat": id, "name": "Jogador %d" % id, "life": 20, "library": 50, "handCount": 5, "hand": [],
		"battlefield": field, "graveyard": [], "exile": []}
