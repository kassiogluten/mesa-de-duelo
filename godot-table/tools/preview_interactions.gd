# Monta a partida sem servidor em cada momento de interação (alvo, ataque com o painel "Atacar quem?", retirar do
# combate, ataque no Commander, bloqueio, mão cheia, ajuda dos atalhos), mexe o mouse pelo caminho real do motor e salva
# um print de cada um. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_interactions.gd -- <caminho base>
extends SceneTree

var _next_id: int = 1000
var _screen: MatchScreen


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var base: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("interacoes")
	_screen = MatchScreen.new()
	_screen.offline = true
	root.add_child(_screen)
	await process_frame
	# MESA_CENAS=ataque,retirar só tira esses.
	var only: PackedStringArray = OS.get_environment("MESA_CENAS").split(",", false)
	for scene: String in ["alvo", "ataque", "retirar", "multi", "bloqueio", "mao", "ajuda"]:
		if not only.is_empty() and not only.has(scene):
			continue
		match scene:
			"alvo": await _scene_alvo()
			"ataque": await _scene_ataque()
			"retirar": await _scene_retirar()
			"multi": await _scene_multi()
			"bloqueio": await _scene_bloqueio()
			"mao": await _scene_mao()
			"ajuda": await _scene_ajuda()
		root.get_texture().get_image().save_png("%s-%s.png" % [base, scene])
		print("%s-%s.png" % [base, scene])
	quit()


## Aplica o estado duas vezes (a segunda com os nomes e as imagens que chegaram) e espera as cartas pousarem.
func _show(state: Dictionary, wait: float = 4.0) -> void:
	_screen.call("_on_message", state)
	await create_timer(wait).timeout
	_screen.call("_on_message", state)
	await create_timer(0.8).timeout


func _table() -> TableView:
	return _screen.get("_table")


func _interaction() -> TableInteraction:
	return _screen.get("_interaction")


## Move o mouse até um ponto da mesa (pixels na resolução da mesa) pelo caminho real dos eventos.
func _mouse_to(point: Vector2) -> void:
	var window: Vector2 = root.get_final_transform() * point
	var move := InputEventMouseMotion.new()
	move.position = window
	move.global_position = window
	Input.parse_input_event(move)
	await create_timer(0.5).timeout


func _card_screen(id: int) -> Vector2:
	return _table().camera.unproject_position(_table().card_node(id).global_position)


func _scene_alvo() -> void:
	var s: Dictionary = _duel()
	var bolt: Dictionary = _card("Lightning Bolt", "Instant", 0)
	var players: Array = s["players"]
	var theirs: Array = (players[1] as Dictionary)["battlefield"]
	var dragon: int = int((theirs[0] as Dictionary)["id"])
	var bear: int = int((theirs[1] as Dictionary)["id"])
	s["stack"] = [{"id": 900, "text": "Lightning Bolt", "kind": "spell", "controller": 0, "source": bolt}]
	s["phase"] = "MAIN1"
	s["input"] = _input({"selectable": [dragon, bear], "selectablePlayers": [1],
		"message": "Select targets for Lightning Bolt", "targeting": {"source": bolt["id"], "card": bolt, "kind": "spell", "cards": [], "players": []},
		"cancel": {"label": "Cancel", "enabled": true}})
	await _show(s)
	await _mouse_to(_card_screen(dragon) + Vector2(60, 40))


func _scene_ataque() -> void:
	var s: Dictionary = _duel()
	var players: Array = s["players"]
	var mine: Array = (players[0] as Dictionary)["battlefield"]
	var theirs: Array = (players[1] as Dictionary)["battlefield"]
	var walker: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", 1, {"planeswalker": true, "counters": {"LOYALTY": 3}})
	theirs.append(walker)
	var ids: Array = []
	for c: Variant in mine:
		if bool((c as Dictionary).get("creature", false)):
			ids.append(int((c as Dictionary)["id"]))
	var defenders: Array = [{"id": 1, "kind": "player"}, {"id": int(walker["id"]), "kind": "card"}]
	var legal: Array = ids.map(func(id: int) -> Dictionary: return {"attacker": id, "defenders": defenders})
	s["phase"] = "COMBAT_DECLARE_ATTACKERS"
	s["combat"] = [{"attacker": ids[0], "defender": 1, "defenderKind": "player", "blockers": []}, {"attacker": ids[1], "defender": 1, "defenderKind": "player", "blockers": []}]
	s["input"] = _input({"actionable": ids, "attacking": {"attackers": ids, "defenders": defenders, "legalAssignments": legal},
		"ok": {"label": "OK", "enabled": true}, "cancel": {"label": "Alpha Strike", "enabled": true}})
	await _show(s)
	# A terceira criatura marcada (dois defensores): já avança e inclina de leve, o painel "Atacar quem?" aparece e a
	# seta vermelha segue o mouse até o planeswalker.
	_interaction().click_card(_table().card_node(ids[2]))
	await create_timer(0.6).timeout
	await _mouse_to(_card_screen(int(walker["id"])) + Vector2(30, 50))


## Clicou numa criatura que já ataca, com dois defensores possíveis: ela fica marcada e o painel oferece trocar o
## defensor ou "Retirar do combate"; o mouse sobre o planeswalker no painel faz a seta mirar nele.
func _scene_retirar() -> void:
	var s: Dictionary = await _attack_scene_state()
	var ids: Array = s["ids"]
	_interaction().click_card(_table().card_node(ids[0]))
	await create_timer(0.6).timeout
	var panel: AttackPanel = _interaction().attack_panel
	var rows: Array = panel.find_children("*", "Button", true, false)
	if rows.size() > 1:
		await _mouse_to((rows[1] as Button).get_global_rect().get_center())


## Commander com 4: dois atacantes já declarados contra dois oponentes (setas na cor de cada um) e uma criatura marcada
## com o painel mostrando os três oponentes e o planeswalker, com quantos atacantes já vão em cada um.
func _scene_multi() -> void:
	var s: Dictionary = _duel()
	var players: Array = s["players"]
	var mine: Array = (players[0] as Dictionary)["battlefield"]
	mine.append(_card("Craw Wurm", "Creature — Wurm", 0, {"power": 6, "toughness": 4}))
	for i: int in [2, 3]:
		var theirs: Array = [_card("Wall of Omens", "Creature — Wall", i, {"power": 0, "toughness": 4}), _card("Island", "Basic Land — Island", i)]
		players.append({"id": i, "seat": i, "name": "Oponente %d" % i, "life": 40 - i * 3, "sleeve": i + 1, "library": 60, "handCount": 4, "hand": [],
			"battlefield": theirs, "graveyard": [], "exile": []})
	(players[1] as Dictionary)["name"] = "Oponente 1"
	(players[1] as Dictionary)["life"] = 40
	(players[0] as Dictionary)["life"] = 40
	var walker: Dictionary = _card("Jace Beleren", "Legendary Planeswalker — Jace", 3, {"planeswalker": true, "counters": {"LOYALTY": 4}})
	((players[3] as Dictionary)["battlefield"] as Array).append(walker)
	var ids: Array = []
	for c: Variant in mine:
		if bool((c as Dictionary).get("creature", false)):
			ids.append(int((c as Dictionary)["id"]))
	var defenders: Array = [{"id": 1, "kind": "player"}, {"id": 2, "kind": "player"}, {"id": 3, "kind": "player"}, {"id": int(walker["id"]), "kind": "card"}]
	s["phase"] = "COMBAT_DECLARE_ATTACKERS"
	s["combat"] = [{"attacker": ids[0], "defender": 1, "defenderKind": "player", "blockers": []}, {"attacker": ids[1], "defender": 3, "defenderKind": "player", "blockers": []}]
	s["input"] = _input({"actionable": ids, "attacking": {"attackers": ids, "defenders": defenders,
		"legalAssignments": ids.map(func(id: int) -> Dictionary: return {"attacker": id, "defenders": defenders})},
		"ok": {"label": "OK", "enabled": true}, "cancel": {"label": "Alpha Strike", "enabled": true}})
	await _show(s)
	_interaction().click_card(_table().card_node(ids[3]))
	await create_timer(0.6).timeout
	var rows: Array = _interaction().attack_panel.find_children("*", "Button", true, false)
	if rows.size() > 2:
		await _mouse_to((rows[2] as Button).get_global_rect().get_center())


## Duelo na declaração de ataque com um planeswalker do oponente e dois atacantes já declarados; devolve o estado com
## "ids" (as suas criaturas).
func _attack_scene_state() -> Dictionary:
	var s: Dictionary = _duel()
	var players: Array = s["players"]
	var mine: Array = (players[0] as Dictionary)["battlefield"]
	var walker: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", 1, {"planeswalker": true, "counters": {"LOYALTY": 3}})
	((players[1] as Dictionary)["battlefield"] as Array).append(walker)
	var ids: Array = []
	for c: Variant in mine:
		if bool((c as Dictionary).get("creature", false)):
			ids.append(int((c as Dictionary)["id"]))
	var defenders: Array = [{"id": 1, "kind": "player"}, {"id": int(walker["id"]), "kind": "card"}]
	s["phase"] = "COMBAT_DECLARE_ATTACKERS"
	s["combat"] = [{"attacker": ids[0], "defender": 1, "defenderKind": "player", "blockers": []}, {"attacker": ids[1], "defender": int(walker["id"]), "defenderKind": "card", "blockers": []}]
	s["input"] = _input({"actionable": ids, "attacking": {"attackers": ids, "defenders": defenders,
		"legalAssignments": ids.map(func(id: int) -> Dictionary: return {"attacker": id, "defenders": defenders})},
		"ok": {"label": "OK", "enabled": true}, "cancel": {"label": "Alpha Strike", "enabled": true}})
	await _show(s)
	s["ids"] = ids
	return s


func _scene_bloqueio() -> void:
	var s: Dictionary = _duel()
	var players: Array = s["players"]
	var mine: Array = (players[0] as Dictionary)["battlefield"]
	var theirs: Array = (players[1] as Dictionary)["battlefield"]
	var attackers: Array = [int((theirs[0] as Dictionary)["id"]), int((theirs[1] as Dictionary)["id"])]
	var blockers: Array = [int((mine[0] as Dictionary)["id"]), int((mine[1] as Dictionary)["id"]), int((mine[2] as Dictionary)["id"])]
	for c: Variant in theirs:
		if attackers.has(int((c as Dictionary)["id"])):
			(c as Dictionary)["attacking"] = true
	s["phase"] = "COMBAT_DECLARE_BLOCKERS"
	s["activePlayer"] = 1
	s["combat"] = [{"attacker": attackers[0], "defender": 0, "defenderKind": "player", "blockers": [blockers[0]]}, {"attacker": attackers[1], "defender": 0, "defenderKind": "player", "blockers": []}]
	s["input"] = _input({"actionable": blockers, "blocking": {"selectedAttacker": null, "attackers": attackers, "blockers": blockers,
		"legalAssignments": blockers.map(func(b: int) -> Dictionary: return {"blocker": b, "attackers": attackers})}, "ok": {"label": "OK", "enabled": true}})
	await _show(s)
	# O segundo bloqueador escolhido: a linha azul segue o mouse até o atacante.
	_interaction().click_card(_table().card_node(blockers[1]))
	await _mouse_to(_card_screen(attackers[1]) + Vector2(-40, 70))


func _scene_mao() -> void:
	var s: Dictionary = _duel()
	var hand: Array = []
	for name: String in ["Giant Growth", "Swords to Plowshares", "Counterspell", "Fireball", "Llanowar Elves", "Grizzly Bears", "Shivan Dragon", "Serra Angel", "Wrath of God", "Opt"]:
		hand.append(_card(name, "Instant", 0))
	((s["players"] as Array)[0] as Dictionary)["hand"] = hand
	s["phase"] = "MAIN1"
	s["input"] = _input({"priority": true, "actionable": [int((hand[0] as Dictionary)["id"]), int((hand[3] as Dictionary)["id"])], "ok": {"label": "OK", "enabled": true}})
	await _show(s)
	await _mouse_to(Vector2(960, 300))


func _scene_ajuda() -> void:
	var key := InputEventKey.new()
	key.keycode = KEY_SLASH
	key.unicode = 63
	key.shift_pressed = true
	key.pressed = true
	Input.parse_input_event(key)
	await create_timer(0.6).timeout


func _card(name: String, type_line: String, owner: int, extra: Dictionary = {}) -> Dictionary:
	_next_id += 1
	var card: Dictionary = {"id": _next_id, "name": name, "typeLine": type_line, "controller": owner, "owner": owner, "tapped": false,
		"token": false, "creature": type_line.contains("Creature"), "land": type_line.contains("Land"), "damage": 0}
	card.merge(extra, true)
	return card


func _input(extra: Dictionary) -> Dictionary:
	var input: Dictionary = {"gen": _next_id, "message": "", "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": [], "actionable": []}
	input.merge(extra, true)
	return input


func _duel() -> Dictionary:
	var mine: Array = [_card("Serra Angel", "Creature — Angel", 0, {"power": 4, "toughness": 4, "keywords": ["FLYING", "VIGILANCE"]}),
		_card("Grizzly Bears", "Creature — Bear", 0, {"power": 2, "toughness": 2}),
		_card("Llanowar Elves", "Creature — Elf Druid", 0, {"power": 1, "toughness": 1})]
	for i: int in 4:
		mine.append(_card("Forest", "Basic Land — Forest", 0, {"tapped": i > 1}))
	var theirs: Array = [_card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5, "keywords": ["FLYING"]}),
		_card("Goblin Guide", "Creature — Goblin Scout", 1, {"power": 2, "toughness": 2, "keywords": ["HASTE"]})]
	for i: int in 4:
		theirs.append(_card("Mountain", "Basic Land — Mountain", 1))
	var hand: Array = [_card("Giant Growth", "Instant", 0), _card("Counterspell", "Instant", 0), _card("Fireball", "Sorcery", 0)]
	var players: Array = [
		{"id": 0, "seat": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": hand.size(), "hand": hand, "battlefield": mine, "graveyard": [], "exile": []},
		{"id": 1, "seat": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 40, "handCount": 5, "hand": [], "battlefield": theirs, "graveyard": [], "exile": []},
	]
	return {"type": "state", "you": 0, "turn": 6, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": _input({}), "events": [], "gameOver": false, "log": []}
