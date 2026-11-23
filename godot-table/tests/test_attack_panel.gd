# Testes do painel "Atacar quem?" e do "Retirar do combate": o clique na criatura que já ataca, as mensagens iguais às
# da mesa do navegador, o que cada linha do painel mostra, a cor de cada defensor nas setas e a pose da marcada.
extends "res://tests/test_case.gd"


## Você (0) com as criaturas 20 e 21; no Commander, Ana (1) com o planeswalker 90, Beto (2) e Caio (3).
func _state(defenders: Array, combat: Array = [], gen: int = 3, four: bool = true) -> Dictionary:
	var players: Array = [{"id": 0, "name": "Você", "life": 40, "battlefield": [{"id": 20, "name": "Grizzly Bears"}, {"id": 21, "name": "Llanowar Elves"}]},
		{"id": 1, "name": "Ana", "life": 33, "battlefield": [{"id": 90, "name": "Jace Beleren", "planeswalker": true, "controller": 1, "counters": {"LOYALTY": 4}}]}]
	if four:
		players.append({"id": 2, "name": "Beto", "life": 40, "battlefield": []})
		players.append({"id": 3, "name": "Caio", "life": 12, "battlefield": []})
	return {"you": 0, "players": players, "combat": combat, "input": {"gen": gen, "attacking": {"attackers": [20, 21], "defenders": defenders,
		"legalAssignments": [{"attacker": 20, "defenders": defenders}, {"attacker": 21, "defenders": defenders}]}}}


const ALL := [{"id": 1, "kind": "player"}, {"id": 2, "kind": "player"}, {"id": 3, "kind": "player"}, {"id": 90, "kind": "card"}]


func test_clicking_an_attacker_marks_it_for_change_or_removal() -> void:
	var flow := AttackFlow.new()
	var s: Dictionary = _state(ALL, [{"attacker": 20, "defender": 2, "defenderKind": "player", "blockers": []}])
	check_eq(flow.click_attacker(s, 20), {"changed": true}, "com vários defensores, clicar na que já ataca a marca (não tira do combate)")
	check(flow.removable(s), "a marcada já ataca: cabe Retirar do combate")
	check_eq(flow.choose(s, {"id": 3, "kind": "player"}), {"send": {"type": "attack-group", "attackers": [20], "defender": 3, "defenderKind": "player", "gen": 3}},
		"escolher outro defensor troca, com a mensagem do navegador")
	flow.click_attacker(s, 20)
	flow.click_attacker(s, 21)
	check_eq(flow.remove_selected(s), {"send": {"type": "attack-group", "attackers": [20], "defender": null, "gen": 3}},
		"Retirar do combate tira só as marcadas que já atacavam")
	check(not flow.pending(), "e solta a seleção")
	check_eq(flow.remove_selected(s), {}, "sem marcadas, nada a retirar")


func test_pinned_defender_marks_an_attacker_that_already_attacks() -> void:
	var flow := AttackFlow.new()
	var s: Dictionary = _state(ALL.slice(0, 1), [{"attacker": 20, "defender": 1, "defenderKind": "player", "blockers": []}])
	flow.choose(s, {"id": 1, "kind": "player"})
	check_eq(flow.click_attacker(s, 20), {"changed": true}, "com um defensor escolhido antes, a que já ataca fica marcada (como no navegador)")
	check_eq(flow.click_attacker(s, 21), {"send": {"type": "attack-group", "attackers": [21], "defender": 1, "defenderKind": "player", "gen": 3}},
		"e a que ainda não ataca vai no escolhido")


func test_panel_model_lists_each_defender() -> void:
	var flow := AttackFlow.new()
	var s: Dictionary = _state(ALL, [{"attacker": 21, "defender": 3, "defenderKind": "player", "blockers": []}])
	check(AttackPanelModel.build(s, flow).is_empty(), "nada marcado: sem painel")
	flow.click_attacker(s, 20)
	var names: Callable = func(id: int) -> String: return {20: "Ursos-pardos", 90: "Jace Beleren"}.get(id, "")
	var model: Dictionary = AttackPanelModel.build(s, flow, names)
	check_eq(model["title"], "Atacar quem?", "título")
	check_eq(model["caption"], "Ursos-pardos marcada.", "quem está marcada")
	var rows: Array = model["targets"]
	check_eq(rows.size(), 4, "um botão por defensor")
	check_eq([rows[0]["name"], rows[0]["detail"], rows[0]["mark"], rows[0]["permanent"]], ["Ana", "33 de vida", "33", false], "jogador: nome e vida")
	check_eq([rows[3]["name"], rows[3]["detail"], rows[3]["mark"], rows[3]["permanent"]], ["Jace Beleren", "Planeswalker de Ana", "4", true], "planeswalker: lealdade e de quem é")
	check_eq(rows[2]["coming"], 1, "quantos atacantes já vão nele")
	check(not bool(model["removable"]), "a marcada não ataca: sem Retirar do combate")
	flow.clear()
	flow.choose(s, {"id": 2, "kind": "player"})
	model = AttackPanelModel.build(s, flow, names)
	check(bool((model["targets"] as Array)[1]["pinned"]) and not bool((model["targets"] as Array)[0]["pinned"]), "o defensor escolhido antes fica aceso")
	check_eq(model["caption"], "As criaturas que você tocar vão atacar Beto.", "e o painel diz para onde vão as próximas")


func test_panel_caption_for_an_attacker_that_already_attacks() -> void:
	var flow := AttackFlow.new()
	var s: Dictionary = _state(ALL, [{"attacker": 20, "defender": 90, "defenderKind": "card", "blockers": []}])
	flow.click_attacker(s, 20)
	var model: Dictionary = AttackPanelModel.build(s, flow, func(id: int) -> String: return {20: "Ursos-pardos"}.get(id, ""))
	check_eq(model["caption"], "Ursos-pardos ataca Jace Beleren. Escolha outro defensor ou retire do combate.", "diz quem ela ataca agora")
	check(bool(model["removable"]), "e oferece Retirar do combate")


func test_defender_colors_follow_the_table_order() -> void:
	var four: Dictionary = _state(ALL)
	check_eq(AttackPanelModel.defender_color(four, {"id": 1, "kind": "player"}), AttackPanelModel.PALETTE[1], "segundo da mesa")
	check_eq(AttackPanelModel.defender_color(four, {"id": 3, "kind": "player"}), AttackPanelModel.PALETTE[3], "quarto da mesa")
	check_eq(AttackPanelModel.defender_color(four, {"id": 90, "kind": "card"}), AttackPanelModel.PALETTE[1], "o planeswalker tem a cor de quem o controla")
	var duel: Dictionary = _state(ALL.slice(0, 1), [], 3, false)
	check_eq(AttackPanelModel.defender_color(duel, {"id": 1, "kind": "player"}), AttackPanelModel.RED, "no duelo, vermelho")
	four["combat"] = [{"attacker": 20, "defender": 3, "defenderKind": "player", "blockers": []}, {"attacker": 21, "defender": 90, "defenderKind": "card", "blockers": []}]
	var arrows: Array = DecisionRoles.fixed_arrows(four)
	check_eq(arrows.map(func(a: Dictionary) -> Color: return a["color"]), [AttackPanelModel.PALETTE[3], AttackPanelModel.PALETTE[1]], "as setas de ataque na cor de cada defensor")


func test_marked_pose_leans_a_little() -> void:
	var full: float = FieldPlacement.attack_tilt(2.0, -3.0, 1)
	var marked: float = FieldPlacement.marked_tilt(2.0, -3.0, 1)
	check(signf(marked) == signf(full) and absf(marked) < absf(full), "a marcada inclina para o mesmo lado, menos que a declarada")
	check_eq(FieldPlacement.marked_tilt(0.0, -3.0, 1, 1.5), -FieldPlacement.MARK_MIN_TILT, "de frente, inclina o mínimo para o meio da mesa")
	check_eq(FieldPlacement.marked_tilt(0.0, -3.0, 1), 0.0, "bem no meio, de frente: sem inclinar")


func test_panel_buttons_send_the_choice() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var panel := AttackPanel.new()
	tree.root.add_child(panel)
	var flow := AttackFlow.new()
	var s: Dictionary = _state(ALL, [{"attacker": 20, "defender": 1, "defenderKind": "player", "blockers": []}])
	flow.click_attacker(s, 20)
	panel.show_model(AttackPanelModel.build(s, flow))
	var got: Array = []
	panel.chosen.connect(func(d: Dictionary) -> void: got.append(d))
	panel.remove_pressed.connect(func() -> void: got.append("retirar"))
	var buttons: Array = panel.find_children("*", "Button", true, false)
	check(panel.showing() and panel.visible, "o painel aparece")
	check_eq(buttons.size(), 6, "quatro defensores, Retirar do combate e Limpar seleção")
	(buttons[3] as Button).pressed.emit()
	(buttons[4] as Button).pressed.emit()
	check_eq(got, [{"id": 90, "kind": "card"}, "retirar"], "cada botão avisa o que foi escolhido")
	check_eq((buttons[4] as Button).text, "Retirar do combate", "o texto do navegador")
	panel.show_model({})
	check(not panel.showing(), "sem nada marcado, some")
	panel.queue_free()
