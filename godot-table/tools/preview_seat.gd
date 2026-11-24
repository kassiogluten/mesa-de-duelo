# Monta mesas sem servidor com assentos cheios (veneno, energia, dano de comandante, reserva, monarca, zona de comando, cemitério cheio) e salva um print de cada uma.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_seat.gd -- <pasta>/assento [cena] [LxA]
# (LxA, como 1600x900 ou 1100x900, tira a janela do maximizado e a deixa desse tamanho: telas 16:9 e janelas estreitas.)
# Grava <base>-<cena>.png: duelo, pagando, commander, bloqueio, dupla-comando (Commander de dois, com parceiros) e as
# janelas de zona.
extends SceneTree

## Cartas: id → [nome, tipo, dono, criatura, terreno].
const CARDS := {
	101: ["Atraxa, Praetors' Voice", "Legendary Creature — Phyrexian Angel Horror", 0, true, false],
	102: ["Llanowar Elves", "Creature — Elf Druid", 0, true, false],
	103: ["Forest", "Basic Land — Forest", 0, false, true],
	104: ["Island", "Basic Land — Island", 0, false, true],
	105: ["Aetherflux Reservoir", "Artifact", 0, false, false],
	201: ["Shivan Dragon", "Creature — Dragon", 1, true, false],
	202: ["Mountain", "Basic Land — Mountain", 1, false, true],
	203: ["Mountain", "Basic Land — Mountain", 1, false, true],
	301: ["Grizzly Bears", "Creature — Bear", 2, true, false],
	302: ["Forest", "Basic Land — Forest", 2, false, true],
	401: ["Serra Angel", "Creature — Angel", 3, true, false],
	402: ["Plains", "Basic Land — Plains", 3, false, true],
}
const GRAVE := ["Lightning Bolt", "Counterspell", "Giant Growth", "Swords to Plowshares", "Dark Ritual", "Llanowar Elves", "Wrath of God", "Brainstorm"]

var _table: TableView
var _hud: Hud
var _zones: ZoneViewer
var _seq: int = 1000


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var base: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("assento")
	var only: String = args[1] if args.size() > 1 else ""
	if args.size() > 2 and args[2].contains("x"):
		var dims: PackedStringArray = args[2].split("x")
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(int(dims[0]), int(dims[1])))
		await create_timer(0.3).timeout
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var scenes: Array = [
		["duelo", _duel(false), ""], ["pagando", _duel(true), ""],
		["zona-cemiterio", _duel(false), "1:graveyard"], ["zona-exilio", _duel(false), "1:exile"],
		["commander", _commander(false), ""], ["bloqueio", _commander(true), ""],
		["zona-comando", _commander(false), "0:command"], ["zona-dano", _commander(false), "3:damage"],
		["dupla-comando", _commander_duel(), ""],
	]
	for scene: Array in scenes:
		if only != "" and not Txt.of(scene[0]).contains(only):
			continue
		_mount(catalog)
		var state: Dictionary = scene[1]
		_table.apply_state(state)
		_hud.apply_state(state)
		_zones.apply_state(state)
		if Txt.of(scene[2]) != "":
			var parts: PackedStringArray = Txt.of(scene[2]).split(":")
			_zones.open_zone(int(parts[0]), parts[1])
		# Espera as cartas pousarem e as imagens chegarem (do disco ou da rede).
		await create_timer(3.0).timeout
		_hud.apply_state(state)
		await create_timer(0.3).timeout
		await RenderingServer.frame_post_draw
		var path: String = "%s-%s.png" % [base, Txt.of(scene[0])]
		root.get_texture().get_image().save_png(path)
		print("print: ", path)
	quit()


func _mount(catalog: CardCatalog) -> void:
	for child: Node in root.get_children():
		if child != catalog:
			child.queue_free()
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	_hud = Hud.new()
	_hud.catalog = catalog
	layer.add_child(_hud)
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)
	_zones = ZoneViewer.new()
	_zones.catalog = catalog
	layer.add_child(_zones)
	_hud.zone_requested.connect(_zones.open_zone)


func _card(id: int) -> Dictionary:
	var c: Array = CARDS[id]
	return {"id": id, "name": c[0], "typeLine": c[1], "controller": c[2], "creature": c[3], "land": c[4], "tapped": false, "power": 3, "toughness": 3}


func _loose(name: String, extra: Dictionary = {}) -> Dictionary:
	_seq += 1
	var card: Dictionary = {"id": _seq, "name": name, "tapped": false}
	card.merge(extra, true)
	return card


func _field(owner: int) -> Array:
	var out: Array = []
	for id: Variant in CARDS:
		if int((CARDS[id] as Array)[2]) == owner:
			out.append(_card(int(id)))
	return out


func _grave(count: int) -> Array:
	var out: Array = []
	for i: int in count:
		out.append(_loose(GRAVE[i % GRAVE.size()]))
	return out


func _base(players: Array, extra: Dictionary) -> Dictionary:
	var state: Dictionary = {"type": "state", "you": 0, "turn": 7, "phase": "MAIN1", "activePlayer": 0, "turnElapsedMs": 64000, "players": players,
		"stack": [], "combat": [], "gameOver": false, "events": [],
		"input": {"gen": 4, "priority": true, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": []}}
	state.merge(extra, true)
	return state


func _duel(paying: bool) -> Dictionary:
	var field: Array = _field(0)
	(field[4] as Dictionary)["countsSpells"] = true
	var me: Dictionary = {"id": 0, "seat": 0, "name": "Kassio", "life": 20, "sleeve": 1, "library": 52, "handCount": 3, "hand": [_loose("Giant Growth"), _loose("Brainstorm"), _loose("Forest")],
		"battlefield": field, "graveyard": _grave(4), "exile": [], "pool": {"R": 2, "G": 1, "C": 1, "W": 0}, "counters": {"RAD": 2},
		"initiative": true, "ringTempted": 2, "landsPlayed": 1, "maxLands": 1, "spellsCast": 2}
	var suspended: Dictionary = _loose("Rift Bolt", {"counters": {"TIME": 2}})
	var opp: Dictionary = {"id": 1, "seat": 1, "name": "Ana", "life": 16, "sleeve": 2, "library": 47, "handCount": 5, "hand": [],
		"battlefield": _field(1), "graveyard": _grave(8), "exile": [suspended, _loose("Ancestral Vision", {"plotted": true}), _loose("Lightning Bolt")], "pool": {},
		"counters": {"ENERGY": 3, "POISON": 7, "EXPERIENCE": 2}, "monarch": true, "speed": 3, "lastTurnMs": 83000, "spellsCast": 1}
	var extra: Dictionary = {"suspendedExile": [int(suspended["id"])]}
	if paying:
		extra["input"] = {"gen": 4, "paying": true, "payingFor": "spell", "message": "Pague {2}{G}", "manaCost": {"remaining": "{2}{G}"},
			"ok": {"label": "", "enabled": false}, "cancel": {"label": "Cancelar", "enabled": true}, "selectable": []}
	return _base([me, opp], extra)


func _commander(blocking: bool) -> Dictionary:
	var players: Array = []
	var names: Array = ["Kassio", "Diego", "Ana", "Bruno"]
	var commanders: Array = [[101, "Atraxa, Praetors' Voice"], [201, "Shivan Dragon"], [301, "Grizzly Bears"], [401, "Serra Angel"]]
	for pid: int in 4:
		var cmd_card: Dictionary = {"id": 500 + pid, "name": "Edgar Markov" if pid == 0 else "Krenko, Mob Boss", "commander": true, "tapped": false}
		var p: Dictionary = {"id": pid, "seat": pid, "name": names[pid], "life": [34, 31, 40, 0][pid], "sleeve": pid + 1, "library": 80, "handCount": [7, 6, 4, 0][pid], "hand": [],
			"battlefield": _field(pid), "graveyard": _grave([3, 9, 2, 5][pid]), "exile": [], "pool": {"B": 1} if pid == 0 else {},
			"commandZone": [cmd_card] if pid != 3 else [], "commanders": [{"id": 500 + pid, "name": cmd_card["name"], "casts": [2, 1, 0, 3][pid], "tax": [4, 2, 0, 6][pid]}]}
		players.append(p)
	(players[0] as Dictionary)["counters"] = {"EXPERIENCE": 3}
	(players[0] as Dictionary)["blessing"] = true
	(players[1] as Dictionary)["commanderDamage"] = [{"commanderId": 500, "damage": 8}]
	(players[1] as Dictionary)["counters"] = {"POISON": 3}
	(players[1] as Dictionary)["lastTurnMs"] = 95000
	(players[2] as Dictionary)["commanderDamage"] = [{"commanderId": 500, "damage": 16}, {"commanderId": 501, "damage": 5}]
	(players[2] as Dictionary)["monarch"] = true
	(players[2] as Dictionary)["lastTurnMs"] = 41000
	(players[3] as Dictionary)["commanderDamage"] = [{"commanderId": 500, "damage": 21}]
	(players[3] as Dictionary)["eliminated"] = true
	(players[3] as Dictionary)["lossReason"] = "CommanderDamage"
	(players[0] as Dictionary)["commanderDamage"] = [{"commanderId": 501, "damage": 19}]
	var extra: Dictionary = {"room": {"players": [{"name": "Kassio", "connected": true, "playerId": 0}, {"name": "Diego", "connected": false, "playerId": 1},
		{"name": "Ana", "connected": true, "playerId": 2}, {"name": "Bruno", "connected": true, "playerId": 3}]}}
	if blocking:
		extra["activePlayer"] = 1
		extra["phase"] = "COMBAT_DECLARE_BLOCKERS"
		extra["combat"] = [{"attacker": 201, "defender": 0, "defenderKind": "player", "blockers": []}]
		extra["forecast"] = [{"player": 0, "life": 34, "lifeAfter": 29, "commander": [{"commanderId": 501, "damage": 19, "after": 24}], "lethal": "commander"}]
		extra["input"] = {"gen": 4, "blocking": {"legalAssignments": []}, "ok": {"label": "Confirmar bloqueios", "enabled": true}, "cancel": {"label": "", "enabled": false}, "selectable": []}
	else:
		extra["input"] = {"gen": 4, "priority": true, "selectablePlayers": [1, 2], "targeting": {"source": 101}, "message": "Escolha um jogador", "ok": {"label": "", "enabled": false}, "cancel": {"label": "Cancelar", "enabled": true}, "selectable": []}
	return _base(players, extra)


## Commander de dois: você com um comandante (taxa +2) e o oponente com uma dupla de parceiros (uma com taxa, outra sem)
## e a mão cheia, para conferir a zona de comando junto dos retratos.
func _commander_duel() -> Dictionary:
	var state: Dictionary = _duel(false)
	var me: Dictionary = (state["players"] as Array)[0]
	var opp: Dictionary = (state["players"] as Array)[1]
	me["life"] = 40
	me["commandZone"] = [{"id": 600, "name": "Edgar Markov", "commander": true, "tapped": false}]
	me["commanders"] = [{"id": 600, "name": "Edgar Markov", "casts": 1, "tax": 2}]
	opp["life"] = 37
	opp["handCount"] = 7
	opp["commandZone"] = [{"id": 610, "name": "Thrasios, Triton Hero", "commander": true, "tapped": false},
		{"id": 611, "name": "Tymna the Weaver", "commander": true, "tapped": false}]
	opp["commanders"] = [{"id": 610, "name": "Thrasios, Triton Hero", "casts": 2, "tax": 4}, {"id": 611, "name": "Tymna the Weaver", "casts": 0, "tax": 0}]
	return state
