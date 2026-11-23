# O assento de cada jogador: quais selos aparecem, o dano de comandante, os pips da reserva, a previsão do combate, o motivo da derrota e as cartas da janela de zona.
extends "res://tests/test_case.gd"


func _same(name: String) -> String:
	return name


func _keys(badges: Array) -> PackedStringArray:
	var out: PackedStringArray = []
	for b: Variant in badges:
		out.append(Txt.of((b as Dictionary)["key"]))
	return out


func _state(players: Array, extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"you": 0, "activePlayer": 0, "players": players, "input": {"gen": 7}, "gameOver": false}
	state.merge(extra, true)
	return state


func test_badges_follow_the_browser_order() -> void:
	var p: Dictionary = {"id": 1, "counters": {"ENERGY": 3, "SHIELD": 1, "POISON": 7, "RAD": 2, "EXPERIENCE": 0}, "ringTempted": 2, "monarch": true,
		"initiative": true, "blessing": true, "speed": 4, "lastTurnMs": 83000}
	var badges: Array = SeatInfo.badges(p, _state([p]))
	check_eq(_keys(badges), PackedStringArray(["POISON", "RAD", "ENERGY", "SHIELD", "RING", "MONARCH", "INITIATIVE", "BLESSING", "SPEED", "LASTTURN"]), "ordem dos selos")
	var poison: Dictionary = badges[0]
	check_eq(poison["text"], "7", "veneno mostra o número")
	check_eq(poison["sub"], "/10", "veneno mostra o limite")
	check(bool(poison["danger"]), "veneno 7 já é alerta")
	check(Txt.of(poison["hint"]).contains("Faltam 3"), "o balão do veneno diz quanto falta")
	check_eq((badges[3] as Dictionary)["text"], "1", "marcador desconhecido aparece com o número")
	check_eq((badges[8] as Dictionary)["sub"], "/4", "velocidade de 4")
	check_eq((badges[9] as Dictionary)["text"], "1:23", "o último turno com minutos e segundos")


func test_poison_below_seven_is_not_danger() -> void:
	var p: Dictionary = {"id": 1, "counters": {"POISON": 6}}
	check(not bool((SeatInfo.badges(p, _state([p]))[0] as Dictionary)["danger"]), "veneno 6 ainda não é alerta")


func test_lands_and_turn_clock_only_in_the_players_turn() -> void:
	var me: Dictionary = {"id": 0, "landsPlayed": 1, "maxLands": 1, "lastTurnMs": 5000}
	var opp: Dictionary = {"id": 1, "landsPlayed": 0, "maxLands": 1}
	var state: Dictionary = _state([me, opp])
	var mine: Array = SeatInfo.badges(me, state, 64000.0)
	check_eq(_keys(mine), PackedStringArray(["LANDS", "TURN"]), "no seu turno: terrenos e o relógio do turno (sem o último turno)")
	check(bool((mine[0] as Dictionary)["done"]), "1 de 1 terreno: o selo fica apagado")
	check_eq((mine[0] as Dictionary)["sub"], "/1", "terrenos de 1")
	check_eq((mine[1] as Dictionary)["text"], "1:04", "relógio do turno")
	check_eq(_keys(SeatInfo.badges(opp, state, 64000.0)), PackedStringArray(), "fora do turno dele, nem terrenos nem relógio")
	var unlimited: Dictionary = {"id": 0, "landsPlayed": 2, "maxLands": -1}
	var lands: Dictionary = SeatInfo.badges(unlimited, _state([unlimited]))[0]
	check_eq(lands["sub"], "/∞", "sem limite de terrenos")
	check(not bool(lands["done"]), "sem limite nunca acaba")


func test_spells_only_when_a_card_counts_them() -> void:
	var me: Dictionary = {"id": 0, "spellsCast": 2, "battlefield": []}
	var opp: Dictionary = {"id": 1, "spellsCast": 1, "battlefield": []}
	check(not _keys(SeatInfo.badges(me, _state([me, opp]))).has("SPELLS"), "sem carta que conte mágicas, o selo não aparece")
	opp["battlefield"] = [{"id": 9, "countsSpells": true}]
	var badges: Array = SeatInfo.badges(me, _state([me, opp]))
	check_eq(_keys(badges), PackedStringArray(["SPELLS"]), "com a carta na mesa, aparece")
	check(Txt.of((badges[0] as Dictionary)["hint"]).contains("3 no total"), "o balão traz a conta da Tempestade")


func test_commander_damage_text_and_alert() -> void:
	check_eq(SeatInfo.commander_damage({"commanderDamage": []})["text"], "", "sem dano, sem contador")
	var low: Dictionary = SeatInfo.commander_damage({"commanderDamage": [{"commanderId": 5, "damage": 8}, {"commanderId": 6, "damage": 12}]})
	check_eq(low["text"], "Dano 12/21", "mostra o maior dano")
	check_eq(low["level"], 0, "12 não pulsa")
	check_eq(SeatInfo.commander_damage({"commanderDamage": [{"commanderId": 5, "damage": 15}]})["level"], 1, "15 pulsa")
	check_eq(SeatInfo.commander_damage({"commanderDamage": [{"commanderId": 5, "damage": 18}]})["level"], 2, "18 treme")


func test_commander_lines_name_the_owner() -> void:
	var me: Dictionary = {"id": 0, "name": "Kassio", "commanders": [{"id": 50, "name": "Edgar Markov", "casts": 1, "tax": 2}]}
	var opp: Dictionary = {"id": 1, "name": "Ana", "commanderDamage": [{"commanderId": 50, "damage": 16}]}
	var lines: Array = SeatInfo.commander_lines(_state([me, opp]), opp, _same)
	check_eq(lines.size(), 1, "uma linha por comandante")
	check_eq((lines[0] as Dictionary)["name"], "Edgar Markov", "nome do comandante")
	check_eq((lines[0] as Dictionary)["owner"], "você", "o comandante é seu")
	check_eq((lines[0] as Dictionary)["text"], "16 / 21", "dano contra o limite")


func test_pool_pips_in_color_order_and_spend_only_while_paying() -> void:
	var me: Dictionary = {"id": 0, "pool": {"C": 1, "G": 0, "R": 2, "W": 1}}
	var pips: Array = SeatInfo.pool_pips(me, _state([me]))
	var colors: PackedStringArray = []
	for pip: Variant in pips:
		colors.append(Txt.of((pip as Dictionary)["color"]))
	check_eq(colors, PackedStringArray(["W", "R", "C"]), "cores com mana, na ordem WUBRG e incolor por último")
	check_eq((pips[1] as Dictionary)["label"], "×2", "mais de uma mana da mesma cor: ×N")
	check_eq((pips[0] as Dictionary)["label"], "", "uma só, sem número")
	check((pips[0] as Dictionary)["message"].is_empty(), "sem pagamento, o pip não é botão")
	var paying: Dictionary = _state([me], {"input": {"gen": 7, "paying": true}})
	check_eq((SeatInfo.pool_pips(me, paying)[1] as Dictionary)["message"], {"type": "mana", "color": "R", "gen": 7}, "pagando, o pip gasta a mana com o gen")
	var opp: Dictionary = {"id": 1, "pool": {"U": 1}}
	check((SeatInfo.pool_pips(opp, _state([me, opp], {"input": {"gen": 7, "paying": true}}))[0] as Dictionary)["message"].is_empty(), "a reserva do oponente nunca é botão")


func test_forecast_badge() -> void:
	check_eq(SeatInfo.forecast_badge({"player": 0, "life": 20, "lifeAfter": 20}), {"text": "Sem dano", "level": "safe"}, "sem dano")
	check_eq(SeatInfo.forecast_badge({"player": 0, "life": 20, "lifeAfter": 13}), {"text": "→ 13", "level": ""}, "perde vida")
	check_eq(SeatInfo.forecast_badge({"player": 0, "life": 8, "lifeAfter": 4})["level"], "low", "vida 5 ou menos é perigo")
	var lethal: Dictionary = {"player": 0, "life": 34, "lifeAfter": 29, "commander": [{"commanderId": 5, "damage": 19, "after": 24}], "lethal": "commander"}
	check_eq(SeatInfo.forecast_badge(lethal), {"text": "→ 29  Comandante 24/21  Letal!", "level": "lethal"}, "letal por comandante")
	check_eq(SeatInfo.forecast_badge(lethal, true)["text"], "Comandante 24/21  Letal!", "compacto: só o que pesa mais")
	var state: Dictionary = {"forecast": [{"player": 2, "life": 3, "lifeAfter": 1}]}
	check_eq(SeatInfo.forecast_of(state, 2)["lifeAfter"], 1, "a previsão do jogador")
	check(SeatInfo.forecast_of(state, 1).is_empty(), "quem não está no combate não tem previsão")


func test_loss_reason() -> void:
	var me: Dictionary = {"id": 0, "name": "Kassio", "commanders": [{"id": 50, "name": "Edgar Markov"}]}
	var dead: Dictionary = {"id": 1, "name": "Ana", "lossReason": "CommanderDamage", "commanderDamage": [{"commanderId": 50, "damage": 22}]}
	var state: Dictionary = _state([me, dead])
	check_eq(SeatInfo.loss_reason_text(state, dead, false, _same), "22 de dano de comandante de Edgar Markov", "dano de comandante")
	check_eq(SeatInfo.loss_reason_text(state, {"lossReason": "LifeReachedZero"}, true, _same), "sua vida chegou a 0", "vida, na sua pessoa")
	check_eq(SeatInfo.loss_reason_text(state, {"lossReason": "Poisoned", "counters": {"POISON": 11}}, false, _same), "11 marcadores de veneno", "veneno")
	check_eq(SeatInfo.loss_reason_text(state, {"lossReason": "OpponentWon", "lossWinner": "Bruno", "lossCard": "Thassa's Oracle"}, false, _same), "Bruno venceu com Thassa's Oracle", "vitória do outro com carta")
	check_eq(SeatInfo.loss_reason_text(state, {}, false, _same), "", "sem motivo")


func test_offline_from_the_room() -> void:
	var state: Dictionary = {"room": {"players": [{"name": "Ana", "connected": false, "playerId": 1}, {"name": "Bruno", "connected": true, "playerId": 2}]}}
	check(SeatInfo.offline(state, {"id": 1, "name": "Ana"}), "Ana caiu")
	check(not SeatInfo.offline(state, {"id": 2, "name": "Bruno"}), "Bruno está conectado")
	check(not SeatInfo.offline({}, {"id": 1}), "sem sala, ninguém desconectado")


func test_zone_cards() -> void:
	var p: Dictionary = {"id": 0, "graveyard": [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}],
		"exile": [{"id": 3, "name": "C", "counters": {"TIME": 2}}, {"id": 4, "name": "D", "plotted": true}, {"id": 5, "name": "E"}],
		"commandZone": [{"id": 6, "name": "Edgar Markov"}], "commanders": [{"id": 6, "name": "Edgar Markov", "casts": 2, "tax": 4}],
		"emblems": [{"id": 7, "name": "Emblem — Jace", "emblem": true}]}
	var state: Dictionary = _state([p], {"suspendedExile": [3], "playableExile": [5], "input": {"gen": 1, "actionable": [2, 5]}})
	var grave: Array = SeatInfo.zone_cards(state, p, "graveyard")
	check_eq(int(((grave[0] as Dictionary)["card"] as Dictionary)["id"]), 2, "a de cima primeiro")
	check(bool((grave[0] as Dictionary)["usable"]), "carta usável do cemitério (flashback) fica acesa")
	var exile: Array = SeatInfo.zone_cards(state, p, "exile")
	var tags: PackedStringArray = []
	for e: Variant in exile:
		tags.append(Txt.of((e as Dictionary)["tag"]))
	check_eq(tags, PackedStringArray(["Jogar", "Tramada", "Suspensa · 2"]), "etiquetas do exílio")
	var command: Array = SeatInfo.zone_cards(state, p, "command")
	check_eq((command[0] as Dictionary)["tag"], "Taxa +4", "taxa do comandante")
	check_eq((command[0] as Dictionary)["note"], "Conjurado 2 vezes", "conjurações do comandante")
	check_eq((command[1] as Dictionary)["tag"], "Emblema", "emblema na zona de comando")
	check_eq(SeatInfo.owner_zone(state, 4), {"player": 0, "zone": "exile"}, "de quem e de que zona é a carta")
	check_eq(SeatInfo.owner_zone(state, 6), {"player": 0, "zone": "command"}, "zona de comando")
	check(SeatInfo.owner_zone(state, 99).is_empty(), "carta fora dos montes")


func test_turn_time_text() -> void:
	check_eq(SeatInfo.turn_time_text(0), "0:00", "zero")
	check_eq(SeatInfo.turn_time_text(65400), "1:05", "minutos")
	check_eq(SeatInfo.turn_time_text(3723000), "1:02:03", "horas")


func test_panel_mana_pip_sends_the_message() -> void:
	var panel := SeatPanel.new()
	panel.setup(0, true)
	var sent: Array = []
	panel.mana_pressed.connect(func(message: Dictionary) -> void: sent.append(message))
	var zones: Array = []
	panel.zone_pressed.connect(func(pid: int, zone: String) -> void: zones.append([pid, zone]))
	var me: Dictionary = {"id": 0, "name": "Kassio", "life": 20, "pool": {"G": 2}, "graveyard": [], "commanderDamage": [{"commanderId": 9, "damage": 3}]}
	panel.apply(me, _state([me], {"input": {"gen": 3, "paying": true}}), false, true, _same)
	var buttons: Array = panel.find_children("*", "Button", true, false)
	var pip: ManaPoolPip = panel.mana_pool().pip_of("G")
	check(pip != null and not pip.disabled and pip.count == 2, "o pip da reserva vira botão no pagamento")
	if pip:
		pip.pressed.emit()
	check_eq(sent, [{"type": "mana", "color": "G", "gen": 3}], "o pip manda a mana com o gen")
	for b: Variant in buttons:
		if (b as Button).text == "Dano 3/21":
			(b as Button).pressed.emit()
	check_eq(zones, [[0, "damage"]], "o contador de dano abre a janela do dano de comandante")
	check_eq(panel.portrait.text, "20", "a vida no retrato")
	panel.free()
