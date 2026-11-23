# Monta uma mesa sem servidor e dispara as cartas voando (cascata, moer, vidência, busca), salvando prints no meio de cada uma.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_card_flights.gd -- <caminho base>
# Grava <caminho base>-cascata-1.png, -cascata-2.png, …, -moer-1.png, -videncia.png, -busca.png.
extends SceneTree

const NAMES: PackedStringArray = ["Island", "Forest", "Shivan Dragon", "Counterspell", "Llanowar Elves", "Lightning Bolt", "Serra Angel", "Grizzly Bears", "Mountain"]

var _base: String = "user://voo"


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if not args.is_empty():
		_base = args[0]
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	table.apply_state(_state())
	catalog.request(NAMES)
	# Os dados e as imagens podem já estar no cache em disco: espera um pouco e pede as imagens antes dos voos.
	await create_timer(2.0).timeout
	for name: String in NAMES:
		catalog.texture(catalog.image_url_for({"name": name}))
	await create_timer(2.5).timeout

	var mine: Dictionary = SeatLayout.mine()
	var theirs: Dictionary = SeatLayout.opponent(0, 1)
	var library: Vector3 = table.library_position(0)
	var revealed: Array = []
	for i: int in 6:
		revealed.append({"id": 700 + i, "name": NAMES[i]})
	var length: float = CardFlights.cascade(table, catalog, library, mine["exile"], revealed, 705)
	print("cascata: %.2f s" % length)
	await _shot(0.5, "cascata-1")
	await _shot(0.55, "cascata-2")
	await _shot(0.35, "cascata-3")
	await _shot(0.38, "cascata-4")
	await create_timer(1.2).timeout

	var milled: Array = []
	for i: int in 5:
		milled.append({"id": 800 + i, "name": NAMES[(i + 3) % NAMES.size()]})
	length = CardFlights.mill(table, catalog, library, mine["graveyard"], milled)
	print("moer: %.2f s" % length)
	await _shot(0.42, "moer-1")
	await _shot(0.3, "moer-2")
	await create_timer(1.0).timeout

	length = CardFlights.mill(table, catalog, table.library_position(1), theirs["graveyard"], [], true, TableView.SLEEVES[2])
	await _shot(0.3, "moer-oponente")
	await create_timer(1.0).timeout

	length = CardFlights.scry(table, library, 2, 1)
	print("vidência: %.2f s" % length)
	await _shot(0.45, "videncia")
	await _shot(0.33, "videncia-2")
	await create_timer(1.0).timeout

	length = CardFlights.tutor(table, library, TableView.HAND_CENTER)
	print("busca: %.2f s" % length)
	await _shot(0.3, "busca")
	await create_timer(1.0).timeout

	var discover: Array = []
	for i: int in 12:
		discover.append({"id": 900 + i, "name": NAMES[i % NAMES.size()]})
	length = CardFlights.cascade(table, catalog, table.library_position(1), theirs["exile"], discover, 911, true, TableView.SLEEVES[2])
	await _shot(1.15, "descobrir")
	await create_timer(2.0).timeout
	quit()


func _shot(after: float, tag: String) -> void:
	await create_timer(after).timeout
	root.get_texture().get_image().save_png("%s-%s.png" % [_base, tag])


## Uma mesa pequena: algumas cartas no campo de cada lado, grimórios, mãos e um cemitério.
func _state() -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var field: Array = []
		var base: int = 100 + pid * 100
		for entry: Array in [["Forest", false, true], ["Forest", false, true], ["Llanowar Elves", true, false], ["Grizzly Bears", true, false]] if pid == 0 else [["Mountain", false, true], ["Shivan Dragon", true, false]]:
			base += 1
			field.append({"id": base, "name": entry[0], "creature": entry[1], "land": entry[2], "power": 2, "toughness": 2, "tapped": false, "controller": pid})
		var hand: Array = []
		if pid == 0:
			hand = [{"id": 150, "name": "Counterspell", "controller": 0}, {"id": 151, "name": "Serra Angel", "controller": 0}]
		players.append({"id": pid, "name": "Você" if pid == 0 else "Oponente", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": hand.size() if pid == 0 else 4, "hand": hand, "battlefield": field, "graveyard": [{"id": 160 + pid, "name": "Island"}], "exile": []})
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [], "events": [], "gameOver": false}
