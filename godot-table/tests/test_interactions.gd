# Testes da interação com a mesa: atalhos, a escolha de bloqueio e de ataque, a ponta da seta grudando no alvo, os
# papéis de destaque, a pose do combate e o leque da mão cabendo na faixa do HUD.
extends "res://tests/test_case.gd"


func _block_state(gen: int = 7) -> Dictionary:
	# Atacantes 50 e 51 do oponente; o seu 10 só pode bloquear o 50, o 11 pode bloquear os dois.
	return {"you": 0, "players": [], "combat": [], "input": {"gen": gen, "blocking": {"selectedAttacker": null, "attackers": [50, 51], "blockers": [10, 11],
		"legalAssignments": [{"blocker": 10, "attackers": [50]}, {"blocker": 11, "attackers": [50, 51]}]}}}


func _attack_state(defenders: Array, gen: int = 3, combat: Array = []) -> Dictionary:
	var players: Array = [{"id": 0, "battlefield": [{"id": 20}, {"id": 21}]}, {"id": 1, "name": "Ana", "battlefield": [{"id": 90}]}, {"id": 2, "name": "Beto", "battlefield": []}]
	return {"you": 0, "players": players, "combat": combat, "input": {"gen": gen, "attacking": {"attackers": [20, 21], "defenders": defenders,
		"legalAssignments": [{"attacker": 20, "defenders": defenders}, {"attacker": 21, "defenders": defenders.slice(0, 1)}]}}}


# — Teclado —

func test_key_map() -> void:
	check_eq(KeyMap.action_for(KEY_SPACE, 32, false, false), "primary", "Espaço")
	check_eq(KeyMap.action_for(KEY_ENTER, 0, false, false), "confirm", "Enter")
	check_eq(KeyMap.action_for(KEY_KP_ENTER, 0, false, false), "confirm", "Enter do teclado numérico")
	check_eq(KeyMap.action_for(KEY_ESCAPE, 0, false, false), "cancel", "Esc")
	check_eq(KeyMap.action_for(KEY_TAB, 0, false, false), "cycle", "Tab")
	check_eq(KeyMap.action_for(KEY_TAB, 0, true, false), "cycle_back", "Shift+Tab")
	check_eq(KeyMap.action_for(KEY_Z, 122, false, false), "undo", "Z")
	check_eq(KeyMap.action_for(KEY_F, 102, false, false), "control", "F")
	check_eq(KeyMap.action_for(KEY_I, 105, false, false), "inspect", "I")
	check_eq(KeyMap.action_for(KEY_SLASH, 63, true, false), "help", "? (Shift+/)")
	check_eq(KeyMap.action_for(KEY_F1, 0, false, false), "help", "F1")
	check_eq(KeyMap.action_for(KEY_Z, 122, false, true), "", "Ctrl+Z fica para o sistema")
	check_eq(KeyMap.action_for(KEY_SPACE, 32, false, false, true), "", "Espaço segurado não repete")
	check_eq(KeyMap.action_for(KEY_Q, 113, false, false), "", "tecla sem atalho")
	for raw: Variant in KeyMap.SHORTCUTS:
		check((raw as Array).size() == 3, "cada atalho da ajuda tem tecla, ação e texto")


# — Bloqueio —

func test_block_flow_picks_blocker_then_attacker() -> void:
	var flow := BlockFlow.new()
	var s: Dictionary = _block_state()
	check_eq(flow.selectable(s), [10, 11], "sem escolha, acendem as suas criaturas que bloqueiam")
	check_eq(flow.click(s, 50), {"notice": "Selecione primeiro uma criatura sua para bloquear."}, "atacante antes do bloqueador avisa")
	check_eq(flow.click(s, 11), {"changed": true}, "a criatura que pode bloquear dois fica escolhida")
	check(flow.pending(), "esperando o atacante")
	check_eq(flow.selectable(s), [50, 51], "com ela escolhida, acendem os atacantes que ela pode bloquear")
	check_eq(flow.click(s, 51), {"send": {"type": "block", "blocker": 11, "attacker": 51, "gen": 7}}, "clicar no atacante bloqueia")
	check(not flow.pending(), "depois de mandar, nada escolhido")


func test_block_flow_direct_toggle_cancel_and_sync() -> void:
	var flow := BlockFlow.new()
	var s: Dictionary = _block_state()
	check_eq(flow.click(s, 10), {"send": {"type": "block", "blocker": 10, "attacker": 50, "gen": 7}}, "só um atacante possível: vai direto")
	flow.click(s, 11)
	check_eq(flow.click(s, 11), {"changed": true}, "clicar de novo na escolhida solta")
	check(not flow.pending(), "solta")
	flow.click(s, 11)
	check(flow.cancel(), "Esc solta a escolhida")
	check(not flow.cancel(), "sem escolha, o Esc não faz nada aqui")
	flow.click(s, 11)
	flow.sync({"input": {"gen": 8}})
	check(not flow.pending(), "fim da declaração de bloqueadores solta a escolha")
	check_eq(flow.click({"input": {"gen": 9}}, 11), {}, "fora do bloqueio, o clique não é dele")


func test_block_flow_drop_on_wrong_attacker_warns() -> void:
	var flow := BlockFlow.new()
	var s: Dictionary = _block_state()
	check_eq(flow.drop(s, 10, 51), {"notice": "Essa criatura não pode bloquear esse atacante."}, "soltar no atacante que ela não pode bloquear avisa")
	check_eq(flow.drop(s, 11, 50), {"send": {"type": "block", "blocker": 11, "attacker": 50, "gen": 7}}, "soltar no atacante bloqueia")


# — Ataque —

func test_attack_single_defender_goes_straight() -> void:
	var flow := AttackFlow.new()
	var defenders: Array = [{"id": 1, "kind": "player"}]
	var s: Dictionary = _attack_state(defenders)
	check_eq(flow.click_attacker(s, 20), {"send": {"type": "attack-group", "attackers": [20], "defender": 1, "defenderKind": "player", "gen": 3}}, "um defensor: ataca direto, como o navegador")
	var attacking: Dictionary = _attack_state(defenders, 4, [{"attacker": 20, "defender": 1, "defenderKind": "player", "blockers": []}])
	check_eq(flow.click_attacker(attacking, 20), {"send": {"type": "attack-group", "attackers": [20], "defender": null, "gen": 4}}, "clicar no atacante declarado tira do combate")
	check_eq(flow.click_attacker(s, 99), {}, "criatura que não pode atacar")


func test_attack_several_defenders_mark_then_choose() -> void:
	var flow := AttackFlow.new()
	var defenders: Array = [{"id": 1, "kind": "player"}, {"id": 2, "kind": "player"}, {"id": 90, "kind": "card"}]
	var s: Dictionary = _attack_state(defenders)
	check_eq(flow.click_attacker(s, 20), {"changed": true}, "com vários defensores, a criatura fica marcada")
	check_eq(flow.selected, [20] as Array[int], "marcada")
	check_eq(flow.choose(s, {"id": 90, "kind": "card"}), {"send": {"type": "attack-group", "attackers": [20], "defender": 90, "defenderKind": "card", "gen": 3}}, "escolher o planeswalker manda o ataque")
	check(not flow.pending(), "depois de mandar, nada marcado")
	flow.click_attacker(s, 20)
	flow.click_attacker(s, 21)
	var refused: Dictionary = flow.choose(s, {"id": 2, "kind": "player"}, func(id: int) -> String: return {21: "Urso", 20: "Elfo"}.get(id, ""))
	check_eq(refused, {"notice": "Urso não pode atacar Beto neste combate."}, "defensor que uma das marcadas não pode atacar avisa com o nome")
	check(flow.cancel(), "Esc solta as marcadas")
	check_eq(flow.selected.size(), 0, "nada marcado")


func test_attack_pinned_defender_and_drop() -> void:
	var flow := AttackFlow.new()
	var defenders: Array = [{"id": 1, "kind": "player"}, {"id": 2, "kind": "player"}]
	var s: Dictionary = _attack_state(defenders)
	check_eq(flow.choose(s, {"id": 2, "kind": "player"}), {"changed": true}, "defensor primeiro fica escolhido")
	check_eq(flow.click_attacker(s, 20), {"send": {"type": "attack-group", "attackers": [20], "defender": 2, "defenderKind": "player", "gen": 3}}, "e a criatura clicada vai nele")
	check(flow.click_attacker(s, 21).has("notice"), "a que não pode atacar o escolhido avisa")
	flow.clear()
	check_eq(flow.drop(s, 21, {"id": 1, "kind": "player"}), {"send": {"type": "attack-group", "attackers": [21], "defender": 1, "defenderKind": "player", "gen": 3}}, "arrastar até o defensor ataca")
	check(flow.drop(s, 21, {"id": 2, "kind": "player"}).has("notice"), "arrastar até quem ela não pode atacar avisa")
	flow.click_attacker(s, 20)
	flow.sync(_attack_state(defenders, 5))
	check_eq(flow.selected.size(), 0, "prompt novo solta as marcadas, como no navegador")
	flow.choose(s, {"id": 1, "kind": "player"})
	flow.sync({"input": {"gen": 6}})
	check(not flow.pending(), "fim da declaração de ataque limpa tudo")


# — Mira —

func test_target_snap() -> void:
	var candidates: Array = [{"key": 5, "screen": Vector2(100, 100)}, {"key": "player:1", "screen": Vector2(400, 80)}, {"key": 7, "screen": Vector2(160, 300)}]
	check_eq(TargetSnap.pick(Vector2(120, 110), candidates), 5, "gruda no mais perto dentro do raio")
	check_eq(TargetSnap.pick(Vector2(380, 90), candidates), "player:1", "gruda no retrato")
	check_eq(TargetSnap.pick(Vector2(900, 900), candidates), null, "longe de tudo, a ponta fica no mouse")
	check_eq(TargetSnap.pick(Vector2(120, 110), candidates, 7), 7, "o que está sob o mouse vence o mais perto")
	check_eq(TargetSnap.pick(Vector2(120, 110), candidates, 99), 5, "sob o mouse, mas não é alvo: vale o mais perto")
	var order: Array = TargetSnap.order(candidates)
	check_eq(order, [5, 7, "player:1"], "Tab da esquerda para a direita")
	check_eq(TargetSnap.cycle(order, null, 1), 5, "primeiro Tab")
	check_eq(TargetSnap.cycle(order, "player:1", 1), 5, "dá a volta")
	check_eq(TargetSnap.cycle(order, 5, -1), "player:1", "Shift+Tab volta")
	check_eq(TargetSnap.cycle([], null, 1), null, "sem alvos")


# — Destaques e setas —

func test_roles_and_arrows_of_a_targeting_prompt() -> void:
	var s: Dictionary = {"you": 0, "combat": [{"attacker": 30, "defender": 0, "defenderKind": "player", "blockers": [31]}], "stack": [],
		"input": {"gen": 1, "selectable": [40, 41], "actionable": [], "untappable": [60], "manaOnly": [61], "selection": {"cards": [41], "min": 1, "max": 2},
			"targeting": {"source": 12, "cards": [40], "players": [1]}}}
	var roles: Dictionary = DecisionRoles.build(s, BlockFlow.new(), AttackFlow.new())
	check_eq(TableHighlights.role_of(41, -1, roles), "selected", "selecionada vence escolhível")
	check_eq(TableHighlights.role_of(40, -1, roles), "target", "escolhível é alvo")
	check_eq(TableHighlights.role_of(12, -1, roles), "selected", "a carta que mira fica selecionada")
	check_eq(TableHighlights.role_of(30, -1, roles), "attacking", "atacante")
	check_eq(TableHighlights.role_of(31, -1, roles), "blocking", "bloqueador")
	check_eq(TableHighlights.role_of(60, -1, roles), "untappable", "terreno virado para mana")
	check_eq(TableHighlights.role_of(61, -1, roles), "mana", "terreno que só dá mana")
	check_eq(TableHighlights.role_of(-1, -1, roles), "", "carta escondida")
	check(TableHighlights.clickable("target") and not TableHighlights.clickable("blocking"), "o que responde ao clique")
	var marks: Array = DecisionRoles.target_marks(s)
	check_eq(marks.map(func(m: Dictionary) -> String: return "%s=%s" % [str(m["key"]), m["text"]]), ["40=1", "player:1=2"], "números dos alvos escolhidos, cartas e depois jogadores")
	var arrows: Array = DecisionRoles.fixed_arrows(s)
	check_eq(arrows.map(func(a: Dictionary) -> String: return "%s>%s" % [str(a["from"]), str(a["to"])]), ["30>player:0", "31>30", "12>40", "12>player:1"], "setas do combate e dos alvos")


func test_roles_during_block_and_attack() -> void:
	var blocks := BlockFlow.new()
	var s: Dictionary = _block_state()
	blocks.click(s, 11)
	var roles: Dictionary = DecisionRoles.build(s, blocks, AttackFlow.new())
	check_eq(roles["selected"], [11], "o bloqueador escolhido fica selecionado")
	check_eq(roles["selectable"], [50, 51], "e os atacantes acendem")
	var attacks := AttackFlow.new()
	var a: Dictionary = _attack_state([{"id": 1, "kind": "player"}, {"id": 90, "kind": "card"}])
	attacks.click_attacker(a, 20)
	roles = DecisionRoles.build(a, BlockFlow.new(), attacks)
	check_eq(roles["selected"], [20], "a criatura marcada fica selecionada")
	check(roles["selectable"].has(90), "o planeswalker que dá para atacar acende")


func test_combat_pose_rules() -> void:
	check_eq(FieldPlacement.attack_tilt(0.0, -3.0, 1), 0.0, "defensor bem à frente: sem inclinar")
	check(FieldPlacement.attack_tilt(2.0, -3.0, 1) < 0.0, "o seu atacante com o defensor à direita gira no sentido horário")
	check(FieldPlacement.attack_tilt(2.0, 3.0, -1) > 0.0, "o atacante do oponente descendo gira ao contrário")
	check(absf(FieldPlacement.attack_tilt(50.0, -0.1, 1)) <= FieldPlacement.ATTACK_MAX_TILT + 0.0001, "inclinação tem limite")
	var near: Vector3 = FieldPlacement.block_offset(Vector3(0, 0, -1.0))
	check(is_equal_approx(near.z, -FieldPlacement.BLOCK_REACH), "bloqueador perto anda uma parte do caminho")
	var far: Vector3 = FieldPlacement.block_offset(Vector3(10.0, 0.5, 0))
	check(is_equal_approx(far.length(), FieldPlacement.BLOCK_MAX) and far.y == 0.0, "longe, anda no máximo BLOCK_MAX, no plano do tampo")
	check_eq(FieldPlacement.block_offset(Vector3.ZERO), Vector3.ZERO, "em cima do atacante, fica")


func test_hand_fan_fits_the_hud_strip() -> void:
	# Faixa de 4 a 10 unidades: 5 cartas cabem como sempre; 12 apertam.
	var few: Vector2 = HandPlacement.fit_fan(0.6, 5, 4.0, 10.0, 6.0, 0.7)
	check_eq(few, Vector2(0.6, 0.0), "cabem com o espaço de sempre, no lugar de sempre")
	var left: Vector2 = HandPlacement.fit_fan(0.6, 5, 4.0, 10.0, 4.5, 0.7)
	check(is_equal_approx(left.y, 1.05), "com o centro perto da borda, o leque anda para dentro da faixa")
	var many: Vector2 = HandPlacement.fit_fan(0.53, 12, 4.0, 10.0, 7.0, 0.7)
	check(is_equal_approx(many.x, (6.0 - 0.7) / 11.0), "muitas cartas: o espaço encolhe até caber")
	check(is_equal_approx(many.y, 0.0), "o leque inteiro na faixa, sem mexer no centro já dentro")
	var crowded: Vector2 = HandPlacement.fit_fan(0.6, 40, 4.0, 6.0, 5.0, 0.7)
	check(is_equal_approx(crowded.x, 0.1), "nunca menos que o mínimo")


func test_arrow_arc_leaves_room_for_the_head_and_thins_at_the_card() -> void:
	var a := Vector3(0, 0, 2)
	var b := Vector3(0, 0, -2)
	var points: Array[Vector3] = Arrows.arc(a, b)
	check(points[0].is_equal_approx(a), "o feixe sai da carta")
	check(points[points.size() - 1].distance_to(b) > 0.2, "o feixe para antes do alvo, onde entra a ponta")
	check(points[points.size() / 2].y > 0.4, "o arco sobe no meio")
	check(Arrows.width_at(0.0) < Arrows.width_at(0.5), "mais fino ao sair da carta")
	check(is_equal_approx(Arrows.width_at(1.0), Arrows.WIDTH), "cheio no resto")


func test_mulligan_bottom_makes_the_hand_clickable_and_marks_the_chosen() -> void:
	var s: Dictionary = {"you": 0, "input": {"gen": 4, "opening": "mulligan-bottom", "openingReturnCount": 2, "openingSelected": [12],
		"selectable": [], "actionable": []},
		"players": [{"id": 0, "hand": [{"id": 11}, {"id": 12}, {"id": 13}]}, {"id": 1, "hand": [{"id": 21}]}]}
	check_eq(DecisionRoles.opening_hand(s), [11, 12, 13], "as cartas da sua mão, mesmo fora de selectable")
	var roles: Dictionary = DecisionRoles.build(s, BlockFlow.new(), AttackFlow.new())
	check_eq(roles["selected"], [12], "a já escolhida para o fundo fica marcada")
	check_eq(roles["selectable"], [11, 13], "as outras acendem para escolher")
	(s["input"] as Dictionary)["opening"] = "mulligan"
	check_eq(DecisionRoles.opening_hand(s), [], "fora da escolha do fundo, nada muda")

