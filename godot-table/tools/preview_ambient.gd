# Prévia dos efeitos contínuos das permanentes (AmbientFx): uma carta por efeito, em sequências de quadros, de perto e de
# longe; e a medição de FPS com o campo cheio, com os efeitos desligados e ligados alternando na mesma execução. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --disable-vsync --script res://tools/preview_ambient.gd -- <pasta> [galeria|medir-duelo|medir-commander]
extends SceneTree

## Cada carta da galeria: [nome, tipo, palavras-chave, extra].
const GALLERY := [
	["Wind Drake", "Creature — Drake", ["FLYING"], {}],
	["Child of Night", "Creature — Vampire", ["LIFELINK"], {}],
	["Darksteel Myr", "Artifact Creature — Myr", ["INDESTRUCTIBLE"], {}],
	["Typhoid Rats", "Creature — Rat", ["DEATHTOUCH"], {}],
	["Slippery Bogle", "Creature — Beast", ["HEXPROOF"], {}],
	["Argothian Enchantress", "Creature — Human Druid", ["SHROUD"], {}],
	["Kappa Cannoneer", "Artifact Creature — Turtle Warrior", ["WARD"], {}],
	["Boggart Brute", "Creature — Goblin Warrior", ["MENACE"], {}],
	["Raging Goblin", "Creature — Goblin Berserker", ["HASTE"], {"sick": true}],
	["White Knight", "Creature — Human Knight", ["FIRST_STRIKE"], {}],
	["Fencing Ace", "Creature — Human Soldier", ["DOUBLE_STRIKE"], {}],
	["Steadfast Sentry", "Creature — Human Soldier", ["VIGILANCE"], {}],
	["Colossal Dreadmaw", "Creature — Dinosaur", ["TRAMPLE"], {}],
	["Giant Spider", "Creature — Spider", ["REACH"], {}],
	["Wall of Omens", "Creature — Wall", ["DEFENDER"], {}],
	["Isamaru, Hound of Konda", "Legendary Creature — Dog", [], {}],
	["Krenko, Mob Boss", "Legendary Creature — Goblin Warrior", [], {"commander": true}],
	["Soldier", "Token Creature — Soldier", [], {"token": true}],
	["Grizzly Bears", "Creature — Bear", [], {"counters": {"P1P1": 2}}],
	["Vampire Nighthawk", "Creature — Vampire Shaman", ["FLYING", "DEATHTOUCH", "LIFELINK"], {}],
]

var _next_id: int = 100
var _table: TableView


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var mode: String = args[1] if args.size() > 1 else "galeria"
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	AmbientFx.enabled = true
	AmbientFx._pref_loaded = true
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)
	if mode.begins_with("medir"):
		await _measure(mode == "medir-commander")
	else:
		await _gallery(folder)
	print("pronto")
	quit()


func _card(name: String, type_line: String, owner: int, keywords: Array, extra: Dictionary = {}) -> Dictionary:
	_next_id += 1
	var card: Dictionary = {"id": _next_id, "name": name, "typeLine": type_line, "controller": owner, "tapped": false, "token": false,
		"creature": type_line.contains("Creature"), "land": type_line.contains("Land"), "damage": 0, "keywords": keywords}
	if card["creature"]:
		card["power"] = 2
		card["toughness"] = 2
	card.merge(extra, true)
	return card


func _player(id: int, field: Array) -> Dictionary:
	return {"id": id, "seat": id, "name": "Jogador %d" % id, "life": 40, "sleeve": id + 1, "library": 60, "handCount": 0,
		"hand": [], "battlefield": field, "graveyard": [], "exile": []}


func _state(players: Array, stack: Array = []) -> Dictionary:
	return {"type": "state", "you": 0, "turn": 9, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": stack,
		"combat": [], "input": {"gen": 1, "selectable": [], "actionable": []}, "events": [], "gameOver": false}


# — Galeria —

func _gallery(folder: String) -> void:
	var mine: Array = []
	var theirs: Array = []
	for i: int in GALLERY.size():
		var g: Array = GALLERY[i]
		var card: Dictionary = _card(g[0], g[1], 0 if i < 10 else 1, g[2], g[3])
		(mine if i < 10 else theirs).append(card)
	var walker: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", 1, [], {"planeswalker": true, "counters": {"LOYALTY": 5}})
	theirs.append(walker)
	var elves: Dictionary = _card("Llanowar Elves", "Creature — Elf Druid", 0, [])
	var rancor: Dictionary = _card("Rancor", "Enchantment — Aura", 0, [], {"attachedTo": elves["id"]})
	mine.append_array([elves, rancor])
	for i: int in 4:
		mine.append(_card("Forest", "Basic Land — Forest", 0, []))
		theirs.append(_card("Plains", "Basic Land — Plains", 1, []))
	var state: Dictionary = _state([_player(0, mine), _player(1, theirs)])
	state["players"][1]["sleeve"] = 2
	_table.apply_state(state)
	await create_timer(5.0).timeout
	_table.apply_state(state)
	# O efeito de cada carta acende depois da entrada (AmbientFx.FADE_DELAY + FADE_TIME).
	await create_timer(3.0).timeout
	await _shots(folder, "mesa", 6, 0.5)
	# De perto: as suas cartas (fileira de baixo) e as do oponente, em sequência.
	var cam: Camera3D = _table.camera
	var home: Transform3D = cam.global_transform
	# Três cartas por quadro: a do meio é a do efeito, em 10 quadros a cada 0,4 s (as luzes de vez em quando aparecem).
	var only: String = OS.get_environment("AMBIENTE_SO")
	for i: int in GALLERY.size() + 3:
		var id: int = 101 + i
		var node: CardNode = _table.card_node(id)
		if node == null or (only != "" and not only.split(",").has(str(i))):
			continue
		var at: Vector3 = node.global_position
		cam.look_at_from_position(at + Vector3(0, 2.1, 1.25), at)
		await _shots(folder, "carta%02d" % i, 10, 0.4)
	cam.global_transform = home
	# O mouse em cima acende um pouco mais; um momento grande (pilha com algo) baixa tudo.
	var spell: Dictionary = {"id": 900, "text": "Lightning Bolt", "kind": "spell", "controller": 1, "source": _card("Lightning Bolt", "Instant", 1, [])}
	_table.apply_state(_state(state["players"], [spell]))
	await create_timer(1.2).timeout
	await _shots(folder, "momento", 1, 0.1)
	_table.apply_state(state)
	await create_timer(2.5).timeout
	await _shots(folder, "depois", 1, 0.1)


func _shots(folder: String, name: String, count: int, gap: float) -> void:
	for i: int in count:
		await process_frame
		var path: String = folder.path_join("%s-%d.png" % [name, i])
		root.get_texture().get_image().save_png(path)
		print(path)
		await create_timer(gap).timeout


# — Medição —

## Campo cheio (Commander com 4: ~18 permanentes por jogador, mais de 70 na mesa; duelo: ~24 por jogador), com palavras-
## chave variadas. Mede FPS em janelas alternadas desligado/ligado e mostra a mediana de cada um.
func _measure(commander: bool) -> void:
	var kinds: Array = [["FLYING"], ["LIFELINK"], ["INDESTRUCTIBLE"], ["DEATHTOUCH", "FLYING"], ["HEXPROOF"], ["MENACE"],
		["TRAMPLE"], ["VIGILANCE"], ["FIRST_STRIKE"], ["REACH"], ["WARD"], []]
	var names: Array = ["Serra Angel", "Grizzly Bears", "Llanowar Elves", "Shivan Dragon", "Wind Drake", "Giant Spider",
		"Colossal Dreadmaw", "Vampire Nighthawk", "Darksteel Myr", "Boggart Brute", "White Knight", "Typhoid Rats"]
	var players: Array = []
	var count: int = 4 if commander else 2
	var creatures: int = 9 if commander else 13
	for pid: int in count:
		var field: Array = []
		for i: int in creatures:
			var k: int = (i + pid * 3) % kinds.size()
			field.append(_card("%s" % names[k], "Creature — Beast", pid, kinds[k], {"counters": {"P1P1": 1} if i % 4 == 0 else {}, "commander": commander and i == 0}))
		field.append(_card("Sol Ring", "Artifact", pid, []))
		field.append(_card("Darksteel Relic", "Artifact", pid, ["INDESTRUCTIBLE"]))
		for i: int in (7 if commander else 9):
			field.append(_card("Forest %d" % i if i % 2 == 0 else "Island %d" % i, "Basic Land", pid, []))
		players.append(_player(pid, field))
	var state: Dictionary = _state(players)
	_table.apply_state(state)
	await create_timer(4.0).timeout
	_table.apply_state(state)
	await create_timer(3.0).timeout
	var total: int = 0
	for p: Variant in players:
		total += ((p as Dictionary)["battlefield"] as Array).size()
	var off: Array = []
	var on: Array = []
	for _pass: int in 4:
		for enabled: bool in [false, true]:
			AmbientFx.enabled = enabled
			# A carta acende devagar depois de ligar: espera ela chegar na força toda antes de medir.
			await create_timer(3.0 if enabled else 1.0).timeout
			var fps: float = await _window(4.0)
			(on if enabled else off).append(fps)
	var ambient: AmbientFx = _table.get_node_or_null("AmbientFx") as AmbientFx
	off.sort()
	on.sort()
	print("%s, %d permanentes na mesa, %s" % ["Commander com 4" if commander else "Duelo", total, str(ambient.stats() if ambient else {})])
	print("FPS desligado: %s (mediana %.0f)" % [str(off), _median(off)])
	print("FPS ligado:    %s (mediana %.0f)" % [str(on), _median(on)])


func _window(seconds: float) -> float:
	var frames: int = 0
	var start: float = Time.get_ticks_usec() / 1000000.0
	while Time.get_ticks_usec() / 1000000.0 - start < seconds:
		await process_frame
		frames += 1
	return roundf(frames / (Time.get_ticks_usec() / 1000000.0 - start))


func _median(values: Array) -> float:
	return (float(values[values.size() / 2 - 1]) + float(values[values.size() / 2])) / 2.0 if values.size() % 2 == 0 else float(values[values.size() / 2])
