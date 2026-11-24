# Monta as telas das salas sem servidor (a Jogar online com uma lista de exemplo e a sala de espera) e salva um print.
# npm run godot -- --resolution 1600x900 --script res://tools/preview_rooms.gd -- <online|room|room-host|room-choosing> <saída.png>
extends SceneTree

const ROOMS := [
	{"code": "K7QM", "host": "Ana", "config": {"format": "commander", "matchLength": "bo1", "playerCount": 4}, "capacity": 4, "players": 3, "started": false, "brackets": [3, 3]},
	{"code": "B2XR", "host": "Bruno", "config": {"format": "standard", "matchLength": "bo3", "playerCount": 2}, "capacity": 2, "players": 1, "started": false},
	{"code": "PQ4T", "host": "Carla", "config": {"format": "pauper", "matchLength": "bo1", "playerCount": 2}, "capacity": 2, "players": 1, "started": false},
	{"code": "M9VW", "host": "Davi", "config": {"format": "commander", "matchLength": "bo1", "playerCount": 4}, "capacity": 4, "players": 4, "started": true, "spectators": 2, "brackets": [2, 3, 3, 4]},
	{"code": "ZX81QW34", "host": "Elisa", "computer": true, "config": {"format": "standard", "matchLength": "bo1", "playerCount": 2}, "capacity": 2, "players": 2, "started": true},
]


## A sala do fixture da mesa do navegador (tests/fixtures/room-lobby.ts): Commander de 4, três sentados, você no lugar 2.
static func sample_room(seat: int, ready: Array, confirmed: Array) -> Dictionary:
	var names: Array = ["Ana", "Você", "Caio", "Dora"]
	var players: Array = []
	for i: int in 3:
		var p: Dictionary = {"seat": i, "name": names[i], "connected": true, "rematch": false, "ready": ready[i], "confirmed": ready[i] and confirmed[i]}
		if i == 0:
			p.merge({"commander": "Atarka, World Render", "cover": "Atarka, World Render", "bracket": 3})
		players.append(p)
	return {"code": "K7QM", "seat": seat, "token": "t", "started": false, "public": true, "capacity": 4,
		"config": {"format": "commander", "matchLength": "bo1", "playerCount": 4}, "players": players, "spectators": ["Edu"]}


func _initialize() -> void:
	# O tema da mesa (main.gd o liga; aqui não há main).
	UiTheme.install()
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0]
	if mode == "online":
		var screen := OnlineScreen.new()
		screen.offline = true
		root.add_child(screen)
		await process_frame
		# Um nome de exemplo no campo (o guardado é o de quem roda o print).
		(screen.find_child("PlayerName", true, false) as LineEdit).text = "Ana"
		screen.show_rooms(ROOMS)
	else:
		var bg := ColorRect.new()
		bg.color = Color(0.1, 0.13, 0.25)
		bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		root.add_child(bg)
		var layer := CanvasLayer.new()
		root.add_child(layer)
		var panel := RoomPanel.new()
		layer.add_child(panel)
		await process_frame
		match mode:
			"room-host":
				panel.show_room(sample_room(0, [true, true, false], [true, true, false]))
			"room-choosing":
				panel.show_room(sample_room(1, [true, false, true], [true, false, false]))
			_:
				panel.show_room(sample_room(1, [true, true, false], [true, false, false]))
		await create_timer(0.4).timeout
		panel.say(0, "hello")
	await create_timer(1.2).timeout
	root.get_texture().get_image().save_png(args[1])
	quit()
