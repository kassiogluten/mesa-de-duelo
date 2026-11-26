# Prévia da vista da mesa (table/table_camera.gd): monta a mesa com o HUD sem servidor (um duelo, ou o Commander com 4)
# e salva um print de algumas vistas (sem giro, girada 45° e 90°, de cima), do zoom de perto (puxando para o campo do
# oponente) e de longe, com uma mágica na pilha mirando a criatura do oponente, para conferir a mão, a pilha, as setas,
# os selos e os retratos em cada vista.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_view.gd -- <duelo|commander> <pasta>
extends SceneTree

var _table: TableView
var _hud: Hud
var _stack: StackPanel
var _catalog: CardCatalog
var _folder: String
var _last: Dictionary = {}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0] if args.size() > 0 else "duelo"
	_folder = args[1] if args.size() > 1 else OS.get_user_data_dir()
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	_stack = StackPanel.new()
	_stack.catalog = _catalog
	layer.add_child(_stack)
	_hud = Hud.new()
	_hud.catalog = _catalog
	layer.add_child(_hud)
	_table.stack_slot = _stack.layer_rect
	_stack.table = _table
	_stack.avoid_rect = _hud.action_rect
	_stack.layout_changed.connect(func() -> void:
		if not _last.is_empty():
			_table.apply_state(_last))
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	_hud.hand_rect = _table.hand_rect
	_table.hand_area = _hud.hand_area
	# Sem as preferências de quem roda: começa na vista padrão.
	_table.view_rig.load_prefs({})
	_hud.set_view_rig(_table.view_rig)
	_table.view_rig.moved.connect(func(_done: bool) -> void: _hud.follow_view())
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	_catalog.texture_ready.connect(_table.on_texture_ready)
	var state: Dictionary = _commander() if mode == "commander" else _duel()
	_apply(state)
	await create_timer(5.0).timeout
	_apply(state)
	_table.set_arrows([{"from": 60, "to": 11, "color": Color(1.0, 0.8, 0.3)}])
	_table.set_target_marks([{"key": 11, "text": "1", "color": Color(1.0, 0.8, 0.3)}])
	await create_timer(1.5).timeout
	var rig: TableCamera = _table.view_rig
	for view: Array in [["padrao", 0.0, 0.0], ["giro-45", 45.0, 0.0], ["giro-90", -90.0, 0.0], ["cima", 0.0, 89.0]]:
		rig.reset()
		rig.orbit_by(deg_to_rad(float(view[1])), deg_to_rad(float(view[2])))
		await create_timer(1.2).timeout
		await _shot("%s-%s" % [mode, Txt.of(view[0])])
	rig.reset()
	# Zoom todo puxando para o campo do oponente (o ponto sob o mouse fica parado).
	var size: Vector2 = root.get_visible_rect().size
	for _step: int in 10:
		rig.zoom_by(1.0, Vector2(size.x * 0.62, size.y * 0.3))
	await create_timer(1.2).timeout
	await _shot("%s-perto" % mode)
	rig.reset()
	for _step: int in 4:
		rig.zoom_by(-1.0)
	await create_timer(1.2).timeout
	await _shot("%s-longe" % mode)
	# A vista de cima com um pouco de zoom.
	rig.orbit_by(0.0, deg_to_rad(89.0))
	rig.zoom_by(2.0)
	await create_timer(1.2).timeout
	await _shot("%s-cima-zoom" % mode)
	# O botão da vista aberto, recortado em volta do painel.
	rig.orbit_by(deg_to_rad(30.0), 0.0)
	await create_timer(1.0).timeout
	var picker: ViewPicker = _hud._bar.view_picker
	picker.set_open(true)
	await create_timer(0.5).timeout
	var panel: Rect2 = (picker.get_child(1) as Control).get_global_rect().merge(picker.get_global_rect()).grow(16)
	await _shot("%s-vista-menu" % mode, panel)
	picker.set_open(false)
	# A lista dos atalhos de teclado (o "?" e o menu da partida), com os da câmera.
	var help := ShortcutsHelp.new()
	_hud.get_parent().add_child(help)
	help.visible = true
	await create_timer(0.5).timeout
	await _shot("%s-atalhos" % mode, (help.get_child(1).get_child(0) as Control).get_global_rect().grow(8))
	print("pronto")
	quit()


func _apply(state: Dictionary) -> void:
	_last = state
	_table.apply_state(state)
	_stack.apply_state(state)
	_hud.apply_state(state)


func _shot(name: String, crop: Rect2 = Rect2()) -> void:
	await RenderingServer.frame_post_draw
	var path: String = _folder.path_join("%s.png" % name)
	var image: Image = root.get_texture().get_image()
	if crop.has_area():
		# O retângulo vem em pixels da interface; a imagem tem os pixels da janela.
		var scale: Vector2 = Vector2(image.get_size()) / root.get_visible_rect().size
		var box := Rect2i(Vector2i(crop.position * scale), Vector2i(crop.size * scale)).intersection(Rect2i(Vector2i.ZERO, image.get_size()))
		image = image.get_region(box)
	image.save_png(path)
	print(path)


static func _hand() -> Array:
	var hand: Array = []
	for entry: Array in [[50, "Lightning Bolt", "{R}"], [51, "Llanowar Elves", "{G}"], [52, "Counterspell", "{U}{U}"], [53, "Serra Angel", "{3}{W}{W}"], [54, "Swords to Plowshares", "{W}"]]:
		hand.append({"id": entry[0], "name": entry[1], "manaCost": entry[2], "controller": 0})
	return hand


static func _my_field() -> Array:
	return [
		{"id": 1, "name": "Mountain", "typeLine": "Basic Land — Mountain", "land": true, "controller": 0},
		{"id": 2, "name": "Forest", "typeLine": "Basic Land — Forest", "land": true, "controller": 0},
		{"id": 4, "name": "Plains", "typeLine": "Basic Land — Plains", "land": true, "controller": 0, "tapped": true},
		{"id": 3, "name": "Grizzly Bears", "manaCost": "{1}{G}", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 0, "counters": {"P1P1": 1}},
		{"id": 5, "name": "Serra Angel", "manaCost": "{3}{W}{W}", "typeLine": "Creature — Angel", "creature": true, "power": 4, "toughness": 4, "controller": 0, "keywords": ["FLYING", "VIGILANCE"]},
		{"id": 6, "name": "Sol Ring", "manaCost": "{1}", "typeLine": "Artifact", "controller": 0}]


static func _base(players: Array, format: String) -> Dictionary:
	var bolt: Dictionary = {"id": 60, "name": "Lightning Bolt", "manaCost": "{R}", "typeLine": "Instant", "controller": 0}
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "combat": [], "config": {"format": format},
		"stack": [{"id": 90, "kind": "spell", "controller": 0, "text": "Lightning Bolt causa 3 de dano ao Shivan Dragon.", "source": bolt, "targets": [{"card": 11}]}],
		"input": {"gen": 1, "selectable": [], "actionable": [], "priority": true}, "events": [], "gameOver": false, "players": players}


static func _duel() -> Dictionary:
	return _base([
		{"id": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 30, "hand": _hand(), "handCount": 5, "graveyard": [], "exile": [], "battlefield": _my_field()},
		{"id": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 30, "handCount": 4, "graveyard": [], "exile": [], "battlefield": [
			{"id": 11, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1},
			{"id": 12, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "controller": 1},
			{"id": 13, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "controller": 1}]}], "standard")


static func _commander() -> Dictionary:
	var players: Array = [{"id": 0, "seat": 0, "name": "Você", "life": 40, "sleeve": 1, "library": 80, "hand": _hand(), "handCount": 5, "graveyard": [], "exile": [],
		"battlefield": _my_field(), "commandZone": [{"id": 70, "name": "Atraxa, Praetors' Voice", "manaCost": "{G}{W}{U}{B}", "typeLine": "Legendary Creature — Phyrexian Angel Horror", "commander": true, "controller": 0}]}]
	var names: Array = ["Kenrith, the Returned King", "Edgar Markov", "The Ur-Dragon"]
	for i: int in 3:
		var id: int = i + 1
		var field: Array = [
			{"id": 10 * id + 2, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "controller": id},
			{"id": 10 * id + 3, "name": "Swamp", "typeLine": "Basic Land — Swamp", "land": true, "controller": id},
			{"id": 10 * id + 4, "name": "Llanowar Elves", "manaCost": "{G}", "typeLine": "Creature — Elf Druid", "creature": true, "power": 1, "toughness": 1, "controller": id}]
		if id == 1:
			field.append({"id": 11, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1})
		players.append({"id": id, "seat": id, "name": "Oponente %d" % id, "life": 40, "sleeve": id + 1, "library": 80, "handCount": 6, "graveyard": [], "exile": [],
			"battlefield": field, "commandZone": [{"id": 70 + id, "name": names[i], "typeLine": "Legendary Creature", "commander": true, "controller": id}]})
	return _base(players, "commander")
