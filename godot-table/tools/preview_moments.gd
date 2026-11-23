# Monta uma mesa de Commander de quatro sem servidor e toca cada momento grande em sequência, salvando prints de cada um.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_moments.gd -- <pasta>/momento
# Grava <base>-<momento>-<n>.png (dois instantes de cada cena).
extends SceneTree

## Cartas da mesa: id → [nome, custo, tipo, dono].
const CARDS := {
	101: ["Atraxa, Praetors' Voice", "{G}{W}{U}{B}", "Legendary Creature — Phyrexian Angel Horror", 0],
	102: ["Jace, the Mind Sculptor", "{2}{U}{U}", "Legendary Planeswalker — Jace", 0],
	103: ["Llanowar Elves", "{G}", "Creature — Elf Druid", 0],
	104: ["Forest", "", "Basic Land — Forest", 0],
	105: ["Island", "", "Basic Land — Island", 0],
	106: ["Plains", "", "Basic Land — Plains", 0],
	201: ["Shivan Dragon", "{4}{R}{R}", "Creature — Dragon", 1],
	202: ["Mountain", "", "Basic Land — Mountain", 1],
	301: ["Grizzly Bears", "{1}{G}", "Creature — Bear", 2],
	302: ["Forest", "", "Basic Land — Forest", 2],
	401: ["Serra Angel", "{3}{W}{W}", "Creature — Angel", 3],
	402: ["Plains", "", "Basic Land — Plains", 3],
}

## Cada cena: [nome do arquivo, momento, quando tirar os dois prints (s)].
const SCENES := [
	["primeiro-sangue", {"kind": "first-blood", "player": 1, "source": 101}, [0.32, 0.9]],
	["primeiro-sangue-voce", {"kind": "first-blood", "player": 0, "source": 201}, [0.32, 0.9]],
	["eliminacao-dupla", {"kind": "multi-kill", "count": 2, "players": [2, 3]}, [0.55, 1.3]],
	["eliminacao-tripla", {"kind": "multi-kill", "count": 3, "players": [1, 2, 3]}, [0.7, 1.6]],
	["comandante-9", {"kind": "commander-hit", "player": 1, "commander": 101, "total": 9, "hit": 4}, [0.3, 0.75]],
	["comandante-16", {"kind": "commander-hit", "player": 2, "commander": 101, "total": 16, "hit": 4}, [0.3, 0.9]],
	["comandante-19", {"kind": "commander-hit", "player": 3, "commander": 101, "total": 19, "hit": 4}, [0.3, 0.9]],
	["comandante-21", {"kind": "commander-hit", "player": 1, "commander": 101, "total": 21, "hit": 4}, [0.3, 0.62]],
	["comandante-voce-18", {"kind": "commander-hit", "player": 0, "commander": 201, "total": 18, "hit": 6}, [0.3, 0.9]],
	["ultimate", {"kind": "ultimate", "source": 102, "player": 0}, [0.5, 1.1]],
]

var _table: TableView
var _fx: Node3D


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var base: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("momento")
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	_fx = Node3D.new()
	root.add_child(_fx)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var hud := Hud.new()
	hud.catalog = catalog
	layer.add_child(hud)
	_table.player_screen_position = hud.portrait_center
	hud.portrait_slot = _table.portrait_slot
	hud.player_count = _table.player_count
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)
	var state: Dictionary = _state()
	_table.apply_state(state)
	hud.apply_state(state)
	# Espera as cartas pousarem e as imagens chegarem (do disco ou da rede).
	await create_timer(3.0).timeout
	hud.apply_state(state)
	for scene: Array in SCENES:
		Moments.play(scene[1], _fx, _table)
		var at: float = 0.0
		var shots: Array = scene[2]
		for i: int in shots.size():
			await create_timer(float(shots[i]) - at).timeout
			at = float(shots[i])
			await RenderingServer.frame_post_draw
			var path: String = "%s-%s-%d.png" % [base, Txt.of(scene[0]), i + 1]
			root.get_texture().get_image().save_png(path)
			print("print: ", path)
		await create_timer(3.2 - at).timeout
	quit()


func _state() -> Dictionary:
	var players: Array = []
	for pid: int in 4:
		var field: Array = []
		for id: int in CARDS:
			var c: Array = CARDS[id]
			if int(c[3]) != pid:
				continue
			var type_line: String = c[2]
			var creature: bool = type_line.contains("Creature")
			field.append({"id": id, "name": c[0], "manaCost": c[1], "typeLine": type_line, "creature": creature, "land": type_line.contains("Land"),
				"power": 4 if creature else 0, "toughness": 4 if creature else 0, "tapped": false, "controller": pid, "damage": 0,
				"counters": {"LOYALTY": 5} if type_line.contains("Planeswalker") else {}})
		players.append({"id": pid, "seat": pid, "name": ["Você", "Ana", "Bruno", "Carla"][pid], "life": [32, 14, 9, 3][pid], "sleeve": pid + 1,
			"library": 60, "handCount": 4, "hand": [], "battlefield": field, "graveyard": [], "exile": [], "commandZone": []})
	return {"type": "state", "you": 0, "turn": 9, "phase": "COMBAT_DAMAGE", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": {"gen": 1, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": []}, "events": [], "gameOver": false}
