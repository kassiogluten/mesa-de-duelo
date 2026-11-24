# Monta uma mesa de exemplo com a mão e o inspetor ligados e salva um print, para conferir a mão e a carta de perto.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_hand.gd -- <cena> <saída.png>
# Cenas: mao (cartas jogáveis acesas), previa (mouse sobre uma carta do campo), inspetor (clique direito numa criatura),
# arrasto (carta da mão a caminho do campo), compra (carta comprada voando do grimório), mao-previa (mouse na mão),
# mao-mouse (o mouse na mão: ela sobe e a carta debaixo dele cresce, sem a prévia), mao-escolha (descartar: a mão inteira),
# mao-inteira (a mão de sempre, inteira na tela).
extends SceneTree

const CARDS := {
	101: ["Serra Angel", "{3}{W}{W}", "Creature — Angel", true, false, 4, 4, 0],
	102: ["Llanowar Elves", "{G}", "Creature — Elf Druid", true, false, 1, 1, 0],
	104: ["Plains", "", "Basic Land — Plains", false, true, 0, 0, 0],
	105: ["Forest", "", "Basic Land — Forest", false, true, 0, 0, 0],
	106: ["Forest", "", "Basic Land — Forest", false, true, 0, 0, 0],
	201: ["Shivan Dragon", "{4}{R}{R}", "Creature — Dragon", true, false, 5, 5, 1],
	203: ["Mountain", "", "Basic Land — Mountain", false, true, 0, 0, 1],
	111: ["Giant Growth", "{G}", "Instant", false, false, 0, 0, 0],
	112: ["Isamaru, Hound of Konda", "{W}", "Legendary Creature — Dog", true, false, 2, 2, 0],
	113: ["Swords to Plowshares", "{W}", "Instant", false, false, 0, 0, 0],
	114: ["Forest", "", "Basic Land — Forest", false, true, 0, 0, 0],
	115: ["Craw Wurm", "{4}{G}{G}", "Creature — Wurm", true, false, 6, 4, 0],
	116: ["Lightning Bolt", "{R}", "Instant", false, false, 0, 0, 0],
}
const FIELD := [101, 102, 104, 105, 106, 201, 203]

var _table: TableView
var _inspector: CardInspector
var _drag: HandDrag
var _hand: Array = [111, 112, 113, 114, 115]
var _gen: int = 1


func _card(id: int) -> Dictionary:
	var c: Array = CARDS[id]
	var card: Dictionary = {"id": id, "name": c[0], "manaCost": c[1], "typeLine": c[2], "creature": c[3], "land": c[4], "power": c[5],
		"toughness": c[6], "basePower": c[5], "baseToughness": c[6], "tapped": false, "controller": c[7], "damage": 0}
	if id == 101:
		card.merge({"power": 6, "toughness": 6, "damage": 2, "keywords": ["FLYING", "VIGILANCE"], "counters": {"P1P1": 2}, "owner": 1, "controller": 0}, true)
	if id == 201:
		card.merge({"keywords": ["FLYING"], "owner": 1, "controller": 1}, true)
	if id == 102:
		card.merge({"sick": true}, true)
	return card


func _state() -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var field: Array = FIELD.filter(func(id: int) -> bool: return int((CARDS[id] as Array)[7]) == pid).map(_card)
		var hand: Array = _hand.map(_card) if pid == 0 else []
		players.append({"id": pid, "name": "Você" if pid == 0 else "Oponente", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": hand.size() if pid == 0 else 4, "hand": hand, "battlefield": field, "graveyard": [], "exile": []})
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": {"gen": _gen, "priority": true, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false},
			"selectable": [], "actionable": [111, 112, 114, 102]}, "events": [], "gameOver": false}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var scene: String = args[0]
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var hud := Hud.new()
	hud.catalog = catalog
	layer.add_child(hud)
	_inspector = CardInspector.new()
	_inspector.catalog = catalog
	layer.add_child(_inspector)
	_drag = HandDrag.new()
	_drag.table = _table
	var state: Dictionary = _state()
	_drag.state = func() -> Dictionary: return state
	root.add_child(_drag)
	catalog.texture_ready.connect(_table.on_texture_ready)
	catalog.texture_ready.connect(_inspector.on_texture_ready)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	_table.player_screen_position = hud.portrait_center
	hud.portrait_slot = _table.portrait_slot
	hud.player_count = _table.player_count
	_table.apply_state(state)
	hud.apply_state(state)
	_table.highlight(state["input"]["actionable"], [], [], false)
	_table.apply_hand_layout(state["input"]["actionable"], true)
	await create_timer(2.5).timeout
	_table.refresh_textures()
	await create_timer(0.5).timeout
	match scene:
		"previa", "mao-previa":
			# O mouse vai até a carta (a prévia segue os eventos); o passar por cima do motor depende do mouse de verdade
			# estar na janela, então aqui a prévia é pedida direto (e a carta da mão, levantada à mão).
			var id: int = 101 if scene == "previa" else 112
			_move(_screen_of(id))
			if scene == "mao-previa":
				_table.card_node(id).set_lifted(true)
			if OS.get_environment("SEM_PREVIA") != "1":
				_inspector.show_preview(_table.card_data(id), _ctx(catalog), _table.card_node(id).image_url)
			await create_timer(0.6).timeout
		"inspetor":
			_inspector.open(_table.card_data(101), _ctx(catalog), _table.card_node(101).image_url)
			await create_timer(0.6).timeout
		"inspetor-mao":
			_inspector.open(_table.card_data(112), _ctx(catalog), _table.card_node(112).image_url)
			await create_timer(0.6).timeout
		"arrasto":
			var from: Vector2 = _screen_of(112)
			_move(from)
			await create_timer(0.3).timeout
			_button(from, true)
			_drag.press(_table.card_node(112))
			var reach: float = float(args[2]) if args.size() > 2 else 1.0
			var to := Vector2(from.x + 160 * reach, from.y - 330 * reach)
			for i: int in 20:
				_move(from.lerp(to, (i + 1) / 20.0))
				await process_frame
			await create_timer(0.05).timeout
		"mao-mouse":
			_move(_screen_of(112))
			await create_timer(0.5).timeout
			_table.card_node(112).set_lifted(true)
			await create_timer(0.6).timeout
		"mao-escolha":
			# Descartar: as cartas da mão são as escolhíveis (âmbar), sem a prioridade.
			_table.highlight([], _hand, [], true)
			_table.apply_hand_layout([], false, true)
			await create_timer(0.6).timeout
		"mao-inteira":
			# A mão de sempre (jogáveis acesas), mas inteira na tela: para comparar com a de antes.
			_table.apply_hand_layout(state["input"]["actionable"], true, true)
			await create_timer(0.6).timeout
		"compra":
			_hand.append(116)
			_gen += 1
			state = _state()
			_table.apply_state(state)
			_table.apply_hand_layout(state["input"]["actionable"], true)
			await create_timer(float(args[2]) if args.size() > 2 else 0.3).timeout
		_:
			await create_timer(0.2).timeout
	root.get_texture().get_image().save_png(args[1])
	quit()


func _ctx(catalog: CardCatalog) -> Dictionary:
	return {"lookup": catalog.info, "you": 0, "player_name": func(id: int) -> String: return "você" if id == 0 else "Oponente",
		"card_name": func(id: int) -> String: return catalog.label(Txt.of(_table.card_data(id).get("name")))}


func _screen_of(id: int) -> Vector2:
	return _table.camera.unproject_position(_table.card_node(id).global_position)


func _move(pos: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = pos
	motion.global_position = pos
	root.push_input(motion, true)


func _button(pos: Vector2, pressed: bool) -> void:
	var button := InputEventMouseButton.new()
	button.button_index = MOUSE_BUTTON_LEFT
	button.pressed = pressed
	button.position = pos
	button.global_position = pos
	root.push_input(button, true)
