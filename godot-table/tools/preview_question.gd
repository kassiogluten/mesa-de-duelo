# Mostra uma pergunta de exemplo sobre a mesa de uma partida gravada e salva um print, para conferir as telas das perguntas.
# npm run godot -- --resolution 1600x900 --script res://tools/preview_question.gd -- <exemplo|all> <saída.png|pasta> [teclas]
# Os exemplos estão em res://tests/fixtures/questions.json; "all" salva um print de cada um na pasta e "room" mostra a
# sala de espera. [teclas]: apertadas
# antes do print, separadas por vírgula ("1,3", "enter", "esc"); "hover" põe o mouse na primeira carta.
extends SceneTree

const SAMPLES := "res://tests/fixtures/questions.json"
const TABLE_STATE := "res://tests/fixtures/abertura.json"


## Os exemplos, com as opções completadas quando pedem muitas ("padOptions": nomes de mentira para a busca).
static func samples() -> Dictionary:
	var all: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAMPLES))
	for key: String in all.keys():
		var sample: Dictionary = all[key]
		var pad: int = int(sample.get("padOptions", 0))
		var options: Array = sample.get("options", [])
		for i: int in maxi(0, pad - options.size()):
			options.append("Carta de exemplo %d" % i)
	return all


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var all: Dictionary = samples()
	var names: Array = all.keys() if args[0] == "all" else ([] if args[0] == "room" else [args[0]])
	var steps: PackedStringArray = args[2].split(",") if args.size() > 2 else PackedStringArray()
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var wanted: PackedStringArray = []
	for key: Variant in names:
		var sample: Dictionary = all[key]
		for raw: Variant in sample.get("options", []):
			if raw is Dictionary and (raw as Dictionary).get("card") is Dictionary:
				wanted.append(Txt.of(((raw as Dictionary)["card"] as Dictionary).get("name")))
		for raw: Variant in sample.get("revealed", []):
			wanted.append(Txt.of((raw as Dictionary).get("name")))
		if sample.get("card") is Dictionary:
			wanted.append(Txt.of((sample["card"] as Dictionary)["name"]))
	catalog.request(wanted)
	# A mesa de uma partida de verdade atrás, para o fundo desfocado ter o que mostrar.
	var states: Array = JSON.parse_string(FileAccess.get_file_as_string(TABLE_STATE))
	var state: Dictionary = states[-3]
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	catalog.texture_ready.connect(table.on_texture_ready)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var hud := Hud.new()
	hud.catalog = catalog
	layer.add_child(hud)
	table.player_screen_position = hud.portrait_center
	hud.portrait_slot = table.portrait_slot
	hud.player_count = table.player_count
	table.apply_state(state)
	hud.apply_state(state)
	var dialog := QuestionDialog.new()
	dialog.catalog = catalog
	layer.add_child(dialog)
	var inspector := CardInspector.new()
	inspector.catalog = catalog
	layer.add_child(inspector)
	catalog.texture_ready.connect(inspector.on_texture_ready)
	dialog.inspector = inspector
	dialog.answered.connect(func(message: Dictionary) -> void: print("RESPOSTA ", JSON.stringify(message)))
	# Os nomes podem já estar no cache em disco (aí nada é pedido): espera um pouco em vez do sinal.
	await create_timer(1.5).timeout
	table.refresh_textures()
	if args[0] == "room":
		# A sala de espera, com dois jogadores dentro (um pronto) e dois lugares livres.
		var room := RoomPanel.new()
		layer.add_child(room)
		room.show_room({"code": "K7QX", "seat": 0, "capacity": 4, "players": [
			{"seat": 0, "name": "Bia", "ready": true, "confirmed": true}, {"seat": 1, "name": "Ana", "ready": false}]})
		await create_timer(1.0).timeout
		root.get_texture().get_image().save_png(args[1])
	for key: Variant in names:
		dialog.show_question({})
		await create_timer(0.3).timeout
		dialog.show_question(all[key])
		await create_timer(2.0 if names.size() == 1 else 1.0).timeout
		for step: String in steps:
			_press(step.strip_edges(), dialog)
			await create_timer(0.45).timeout
		var out: String = args[1] if names.size() == 1 else args[1].path_join("%s.png" % key)
		root.get_texture().get_image().save_png(out)
		print("print: ", out)
	quit()


## Uma tecla ("1", "enter", "esc") ou o mouse sobre a primeira carta ("hover").
func _press(step: String, dialog: QuestionDialog) -> void:
	if step == "hover":
		var cards: Array[Node] = dialog.find_children("*", "ChoiceCard", true, false)
		if cards.is_empty():
			return
		var target: ChoiceCard = cards[0]
		var motion := InputEventMouseMotion.new()
		motion.position = target.get_global_rect().get_center()
		motion.global_position = motion.position
		root.push_input(motion)
		target._set_hover(true)
		return
	var key := InputEventKey.new()
	key.pressed = true
	match step:
		"enter":
			key.keycode = KEY_ENTER
		"esc":
			key.keycode = KEY_ESCAPE
		_:
			key.keycode = (KEY_0 + int(step)) as Key
	root.push_input(key)
