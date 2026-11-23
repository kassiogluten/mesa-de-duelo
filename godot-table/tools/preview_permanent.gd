# Monta a mesa com permanentes de todo tipo (marcadores, palavras-chave, combate, enjoo, ficha, cópia, comandante, anexos,
# cópias empilhadas, exiladas por baixo, mira, planeswalker e batalha, Portador do Anel, Game Changer, mutada, preparada,
# atacantes empilhados, previsão de lealdade, "Selecionada" e os selos acompanhando a carta que vira) e salva prints. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_permanent.gd -- <caminho base> [duelo|commander|combate|declarar]
extends SceneTree

var _next_id: int = 1000


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var base: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("permanente")
	var scene: String = args[1] if args.size() > 1 else "duelo"
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	root.add_child(table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	var state: Dictionary
	match scene:
		"commander": state = _commander()
		"combate": state = _blockers()
		"declarar": state = _declare()
		_: state = _duel()
	table.apply_state(state)
	await create_timer(5.0).timeout
	# De novo: os nomes em português e as imagens que chegaram.
	table.apply_state(state)
	if scene == "declarar":
		# Duas criaturas marcadas para atacar (a escolha é local: a mesa as acende como selecionadas).
		var chosen: Array = ((state["input"] as Dictionary)["attacking"] as Dictionary)["attackers"].slice(0, 2)
		table.highlight_roles({"selected": chosen}, true)
	await create_timer(1.0).timeout
	var path: String = "%s-%s.png" % [base, scene]
	root.get_texture().get_image().save_png(path)
	print(path)
	if scene == "declarar":
		await _capture_flip(table, state, base)
		quit()
		return
	# A sua mão com o selo de custo (jogável, mais barata, mais cara).
	var hand: Array = []
	for node: Node in table.get_children():
		if node is CardNode and table.zone_of((node as CardNode).card_id) == "hand":
			hand.append(node)
	var costs: Array = [["{2}{G}{G}", true, 0], ["{W}", true, -1], ["{3}{U/B}{U/B}", false, 1], ["{X}{R}", true, 0]]
	for i: int in hand.size():
		var c: Array = costs[i % costs.size()]
		(hand[i] as CardNode).set_hand_info(Txt.of(c[0]), bool(c[1]), int(c[2]))
	await create_timer(0.5).timeout
	root.get_texture().get_image().save_png("%s-%s-mao.png" % [base, scene])
	quit()


func _card(name: String, type_line: String, owner: int, extra: Dictionary = {}) -> Dictionary:
	_next_id += 1
	var card: Dictionary = {"id": _next_id, "name": name, "typeLine": type_line, "controller": owner, "owner": owner, "tapped": false,
		"token": false, "creature": type_line.contains("Creature"), "land": type_line.contains("Land"), "damage": 0}
	card.merge(extra, true)
	if card.has("power") and not card.has("basePower"):
		card["basePower"] = card["power"]
		card["baseToughness"] = card["toughness"]
	return card


func _copies(n: int, name: String, type_line: String, owner: int, extra: Dictionary = {}) -> Array:
	var out: Array = []
	for i: int in n:
		out.append(_card(name, type_line, owner, extra))
	return out


func _player(id: int, name: String, sleeve: int, field: Array, hand: Array = [], extra: Dictionary = {}) -> Dictionary:
	var player: Dictionary = {"id": id, "seat": id, "name": name, "life": 20, "sleeve": sleeve, "library": 40, "handCount": hand.size() if id == 0 else 5,
		"hand": hand, "battlefield": field, "graveyard": [], "exile": []}
	player.merge(extra, true)
	return player


func _state(players: Array, combat: Array, stack: Array, input: Dictionary = {}) -> Dictionary:
	var full_input: Dictionary = {"gen": 1, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": [], "actionable": []}
	full_input.merge(input, true)
	return {"type": "state", "you": 0, "turn": 6, "phase": "COMBAT_DECLARE_BLOCKERS", "activePlayer": 0, "players": players, "stack": stack,
		"combat": combat, "input": full_input, "events": [], "gameOver": false}


func _duel() -> Dictionary:
	var angel: Dictionary = _card("Serra Angel", "Creature — Angel", 0, {"power": 6, "toughness": 6, "basePower": 4, "baseToughness": 4, "keywords": ["FLYING", "VIGILANCE"], "counters": {"P1P1": 2}, "ringBearer": true})
	var rancor: Dictionary = _card("Rancor", "Enchantment — Aura", 0, {"attachedTo": angel["id"]})
	var greaves: Dictionary = _card("Lightning Greaves", "Artifact — Equipment", 0, {"attachedTo": angel["id"]})
	var elves: Dictionary = _card("Llanowar Elves", "Creature — Elf Druid", 0, {"power": 1, "toughness": 1, "sick": true, "prepared": true, "preparedSpell": "Giant Growth"})
	var hawk: Dictionary = _card("Vampire Nighthawk", "Creature — Vampire Shaman", 0, {"power": 2, "toughness": 3, "damage": 1, "keywords": ["FLYING", "DEATHTOUCH", "LIFELINK"], "attacking": true})
	var isamaru: Dictionary = _card("Isamaru, Hound of Konda", "Legendary Creature — Dog", 0, {"power": 2, "toughness": 2, "commander": true})
	var liliana: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", 0, {"planeswalker": true, "counters": {"LOYALTY": 3}})
	var exiled: Dictionary = _card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5})
	var exiled2: Dictionary = _card("Sol Ring", "Artifact", 1)
	var ring: Dictionary = _card("Oblivion Ring", "Enchantment", 0, {"exiling": [exiled["id"]]})
	var priest: Dictionary = _card("Banisher Priest", "Creature — Human Cleric", 0, {"power": 2, "toughness": 2, "exiling": [exiled2["id"]]})
	var mutant: Dictionary = _card("Gemrazer", "Creature — Beast", 0, {"power": 4, "toughness": 4, "keywords": ["REACH", "TRAMPLE"],
		"merged": [{"id": 1, "name": "Gemrazer"}, {"id": 2, "name": "Grizzly Bears"}]})
	var mine: Array = [angel, rancor, greaves, elves, hawk, isamaru, priest, mutant]
	mine.append_array(_copies(3, "Grizzly Bears", "Creature — Bear", 0, {"power": 2, "toughness": 2}))
	mine.append_array(_copies(2, "Goblin", "Token Creature — Goblin", 0, {"power": 1, "toughness": 1, "token": true, "keywords": ["HASTE"]}))
	mine.append(liliana)
	mine.append(_card("Sol Ring", "Artifact", 0))
	mine.append(ring)
	var forests: Array = _copies(4, "Forest", "Basic Land — Forest", 0)
	(forests[2] as Dictionary)["tapped"] = true
	(forests[3] as Dictionary)["tapped"] = true
	mine.append_array(forests)
	mine.append_array(_copies(2, "Plains", "Basic Land — Plains", 0, {"tapped": true}))
	var swamp: Dictionary = _card("Swamp", "Basic Land — Swamp", 0, {"tapped": true})
	mine.append(swamp)
	var hand: Array = [_card("Giant Growth", "Instant", 0), _card("Swords to Plowshares", "Instant", 0), _card("Counterspell", "Instant", 0), _card("Fireball", "Sorcery", 0)]

	var dragon: Dictionary = _card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5, "keywords": ["FLYING"]})
	var wall: Dictionary = _card("Wall of Omens", "Creature — Wall", 1, {"power": 0, "toughness": 4, "keywords": ["DEFENDER"], "blocking": true})
	var guide: Dictionary = _card("Goblin Guide", "Creature — Goblin Scout", 1, {"power": 1, "toughness": 1, "basePower": 2, "baseToughness": 2, "keywords": ["HASTE"], "counters": {"M1M1": 1, "STUN": 1}})
	var clone: Dictionary = _card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5, "keywords": ["FLYING"], "copyOf": "Clone", "tapped": true})
	var myr: Dictionary = _card("Darksteel Myr", "Artifact Creature — Myr", 1, {"power": 0, "toughness": 1, "keywords": ["INDESTRUCTIBLE"]})
	var bogle: Dictionary = _card("Slippery Bogle", "Creature — Beast", 1, {"power": 1, "toughness": 1, "keywords": ["HEXPROOF"]})
	var battle: Dictionary = _card("Invasion of Zendikar", "Battle — Siege", 1, {"counters": {"DEFENSE": 3}})
	var morph: Dictionary = _card("", "Creature", 1, {"power": 2, "toughness": 2, "faceDown": true, "counters": {"P1P1": 1}})
	morph.erase("name")
	var theirs: Array = [dragon, wall, guide, clone, myr, bogle, morph, battle]
	theirs.append_array(_copies(3, "Mountain", "Basic Land — Mountain", 1))
	theirs.append_array(_copies(2, "Island", "Basic Land — Island", 1, {"tapped": true}))
	var combat: Array = [{"attacker": hawk["id"], "defender": 1, "defenderKind": "player", "blockers": [wall["id"]]}]
	var stack: Array = [{"id": 900, "text": "Lightning Bolt", "kind": "spell", "controller": 0, "source": _card("Lightning Bolt", "Instant", 0), "targets": {"cards": [dragon["id"]]}}]
	return _state([_player(0, "Você", 1, mine, hand), _player(1, "Oponente", 2, theirs, [], {"exile": [exiled, exiled2]})], combat, stack,
		{"untappable": [swamp["id"]]})


func _commander() -> Dictionary:
	var players: Array = []
	var cmd: Dictionary = _card("Isamaru, Hound of Konda", "Legendary Creature — Dog", 0, {"power": 2, "toughness": 2, "commander": true, "counters": {"P1P1": 1}})
	var mine: Array = [cmd, _card("Llanowar Elves", "Creature — Elf Druid", 0, {"power": 1, "toughness": 1, "sick": true}), _card("Sol Ring", "Artifact", 0),
		_card("Smothering Tithe", "Enchantment", 0), _card("The One Ring", "Legendary Artifact", 0, {"counters": {"BURDEN": 2}})]
	mine.append_array(_copies(5, "Forest", "Basic Land — Forest", 0))
	mine.append_array(_copies(3, "Plains", "Basic Land — Plains", 0, {"tapped": true}))
	players.append(_player(0, "Você", 1, mine, [_card("Cultivate", "Sorcery", 0), _card("Rampant Growth", "Sorcery", 0)]))
	for pid: int in [1, 2, 3]:
		var field: Array = [_card("Shivan Dragon", "Creature — Dragon", pid, {"power": 5, "toughness": 5, "keywords": ["FLYING"], "commander": pid == 2}),
			_card("Orcish Bowmasters", "Creature — Orc Archer", pid, {"power": 1, "toughness": 1}),
			_card("Grizzly Bears", "Creature — Bear", pid, {"power": 3, "toughness": 3, "basePower": 2, "baseToughness": 2, "counters": {"P1P1": 1}})]
		field.append_array(_copies(4, "Mountain", "Basic Land — Mountain", pid))
		field.append_array(_copies(2, "Island", "Basic Land — Island", pid, {"tapped": true}))
		players.append(_player(pid, "Jogador %d" % pid, pid + 1, field))
	var state: Dictionary = _state(players, [], [])
	state["config"] = {"format": "commander"}
	return state


## Declaração de bloqueadores no seu lado: três fichas iguais atacam juntas (um monte com o dano somado), e dois
## planeswalkers seus atacados mostram a lealdade prevista ("3 → 1" e o letal "4 → 0").
func _blockers() -> Dictionary:
	var liliana: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", 0, {"planeswalker": true, "counters": {"LOYALTY": 3}})
	var jace: Dictionary = _card("Jace Beleren", "Legendary Planeswalker — Jace", 0, {"planeswalker": true, "counters": {"LOYALTY": 4}})
	var bears: Array = _copies(2, "Grizzly Bears", "Creature — Bear", 0, {"power": 2, "toughness": 2})
	var mine: Array = bears + [liliana, jace]
	mine.append_array(_copies(4, "Forest", "Basic Land — Forest", 0, {"tapped": true}))
	var goblins: Array = _copies(3, "Goblin", "Token Creature — Goblin", 1, {"power": 1, "toughness": 1, "token": true, "tapped": true, "attacking": true, "keywords": ["HASTE"]})
	var aces: Array = _copies(2, "Fencing Ace", "Creature — Human Soldier", 1, {"power": 1, "toughness": 1, "tapped": true, "attacking": true, "keywords": ["DOUBLE_STRIKE"]})
	var hawk: Dictionary = _card("Vampire Nighthawk", "Creature — Vampire Shaman", 1, {"power": 2, "toughness": 3, "tapped": true, "attacking": true, "keywords": ["FLYING", "DEATHTOUCH", "LIFELINK"]})
	var dragon: Dictionary = _card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5, "tapped": true, "attacking": true, "keywords": ["FLYING"]})
	var theirs: Array = goblins + aces + [hawk, dragon]
	theirs.append_array(_copies(5, "Mountain", "Basic Land — Mountain", 1, {"tapped": true}))
	var combat: Array = []
	for c: Variant in goblins + aces:
		combat.append({"attacker": (c as Dictionary)["id"], "defender": 0, "defenderKind": "player", "blockers": []})
	combat.append({"attacker": hawk["id"], "defender": liliana["id"], "defenderKind": "card", "blockers": []})
	combat.append({"attacker": dragon["id"], "defender": jace["id"], "defenderKind": "card", "blockers": []})
	var blockers: Array = bears.map(func(c: Dictionary) -> int: return int(c["id"]))
	var state: Dictionary = _state([_player(0, "Você", 1, mine, []), _player(1, "Oponente", 2, theirs)], combat, [],
		{"blocking": {"blockers": blockers, "legalAssignments": []}})
	state["activePlayer"] = 1
	state["forecast"] = [{"player": 0, "life": 20, "lifeAfter": 13, "planeswalkers": [
		{"id": liliana["id"], "loyalty": 3, "after": 1}, {"id": jace["id"], "loyalty": 4, "after": 0}]}]
	return state


## Sua declaração de ataque: quatro criaturas que podem atacar (duas ficam selecionadas na hora do print).
func _declare() -> Dictionary:
	var angel: Dictionary = _card("Serra Angel", "Creature — Angel", 0, {"power": 6, "toughness": 6, "basePower": 4, "baseToughness": 4, "keywords": ["FLYING", "VIGILANCE"], "counters": {"P1P1": 2}})
	var mine: Array = [_card("Grizzly Bears", "Creature — Bear", 0, {"power": 2, "toughness": 2}), _card("Goblin Guide", "Creature — Goblin Scout", 0, {"power": 2, "toughness": 2, "keywords": ["HASTE"]}),
		_card("Vampire Nighthawk", "Creature — Vampire Shaman", 0, {"power": 2, "toughness": 3, "keywords": ["FLYING", "DEATHTOUCH", "LIFELINK"]}), angel]
	var attackers: Array = mine.map(func(c: Dictionary) -> int: return int(c["id"]))
	mine.append_array(_copies(4, "Plains", "Basic Land — Plains", 0))
	var theirs: Array = [_card("Wall of Omens", "Creature — Wall", 1, {"power": 0, "toughness": 4, "keywords": ["DEFENDER"]})]
	theirs.append_array(_copies(3, "Mountain", "Basic Land — Mountain", 1))
	var state: Dictionary = _state([_player(0, "Você", 1, mine, []), _player(1, "Oponente", 2, theirs)], [], [], {"attacking": {"attackers": attackers}})
	state["phase"] = "COMBAT_DECLARE_ATTACKERS"
	return state


## A última criatura vira no meio do print: os selos acompanham o giro (prints no meio da animação e um no fim).
func _capture_flip(table: TableView, state: Dictionary, base: String) -> void:
	var next: Dictionary = state.duplicate(true)
	var field: Array = ((next["players"] as Array)[0] as Dictionary)["battlefield"]
	(field[3] as Dictionary)["tapped"] = true
	next["input"] = {"gen": 2, "selectable": [], "actionable": []}
	table.apply_state(next)
	table.highlight_roles({}, false)
	for i: int in 3:
		await create_timer(0.07).timeout
		root.get_texture().get_image().save_png("%s-declarar-virando-%d.png" % [base, i + 1])
	await create_timer(0.8).timeout
	root.get_texture().get_image().save_png("%s-declarar-virada.png" % base)
	# Transformar: a carta gira de lado e os selos se apertam junto, somem de perfil e voltam.
	var hawk: CardNode = table.card_node(int((field[2] as Dictionary)["id"]))
	PermanentFx.flip(table, hawk, null, false)
	for i: int in 3:
		await create_timer(0.09).timeout
		root.get_texture().get_image().save_png("%s-declarar-transformando-%d.png" % [base, i + 1])
