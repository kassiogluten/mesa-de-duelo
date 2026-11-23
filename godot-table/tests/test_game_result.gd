# Testes da tela de resultado (text/game_result.gd e text/game_recap.gd): título, motivo, virada, números, gráfico e destaque.
extends "res://tests/test_case.gd"


func _end(winner: String, my_life: int, history: Array) -> Dictionary:
	var points: Array = []
	for i: int in history.size():
		points.append({"turn": i, "life": {"10": history[i][0], "23": history[i][1]}})
	return {"you": 10, "turn": 7, "gameOver": true, "winner": winner,
		"match": {"gameNumber": 1, "wins": [1, 0], "over": true, "phase": "complete", "gameMs": 754000},
		"players": [{"id": 10, "name": "Você", "life": my_life}, {"id": 23, "name": "Ana", "life": 0, "lossReason": "LifeReachedZero"}],
		"lifeHistory": points}


func test_victory_title_and_detail() -> void:
	var r: Dictionary = GameResult.result(_end("Você", 12, [[20, 20], [12, 0]]))
	check_eq(r["tone"], "win", "tom")
	check_eq(r["title"], "Vitória", "título")
	check_eq(r["detail"], "Turno 7 · 12:34 de jogo · Você venceu", "turno, duração e quem venceu")
	check_eq(r["reason"], "", "sem motivo na vitória")


func test_defeat_says_why() -> void:
	var state := _end("Ana", 0, [[20, 20], [0, 9]])
	state["players"][0]["lossReason"] = "LifeReachedZero"
	state["players"][1]["life"] = 9
	var r: Dictionary = GameResult.result(state)
	check_eq(r["title"], "Derrota", "título")
	check_eq(r["reason"], "Eliminado: sua vida chegou a 0.", "motivo")
	state["players"][0]["lossReason"] = "CommanderDamage"
	state["players"][0]["commanderDamage"] = [{"commanderId": 77, "damage": 22}]
	state["players"][1]["commanders"] = [{"id": 77, "name": "Edgar Markov"}]
	check_eq(GameResult.result(state)["reason"], "Eliminado: 22 de dano de comandante de Edgar Markov.", "dano de comandante")
	state["players"][0]["lossReason"] = "Poisoned"
	state["players"][0]["counters"] = {"POISON": 11}
	check_eq(GameResult.loss_reason(state, state["players"][0], false), "11 marcadores de veneno", "veneno")
	state["players"][0]["lossReason"] = "OpponentWon"
	state["players"][0]["lossWinner"] = "Ana"
	state["players"][0]["lossCard"] = "Thassa's Oracle"
	check_eq(GameResult.loss_reason(state, state["players"][0], true), "Ana venceu com Thassa's Oracle", "vitória por carta")


func test_draw_and_concession() -> void:
	check_eq(GameResult.result(_end("", 5, []))["title"], "Empate", "empate")
	var state := _end("", 5, [])
	state["match"]["abandoned"] = true
	state["match"]["concededBy"] = "Ana"
	var r: Dictionary = GameResult.result(state)
	check_eq(r["title"], "Vitória", "o outro desistiu")
	check_eq(r["detail"], "Ana desistiu · Placar: 1 × 0", "quem desistiu e o placar")


func test_comeback_and_by_a_thread() -> void:
	var titles: Array = GameResult.ending_titles(_end("Você", 18, [[20, 20], [9, 18], [4, 15], [15, 6], [18, 0]]))
	check_eq(titles.size(), 1, "só a virada")
	check_eq(titles[0]["title"], "Virada!", "título da virada")
	check_eq(titles[0]["detail"], "Você chegou a 4 de vida e virou o jogo.", "a menor vida antes de voltar")
	var thread: Array = GameResult.ending_titles(_end("Você", 1, [[20, 20], [3, 10], [1, 0]]))
	check_eq(thread.map(func(t: Dictionary) -> String: return t["title"]), ["Por um fio"], "por um fio, sem virada (não voltou a 15)")
	check_eq(GameResult.ending_titles(_end("Ana", 0, [[20, 20], [3, 18]])).size(), 0, "os títulos são de quem venceu")


func test_highlights_pick_the_four_numbers() -> void:
	var state := _end("Você", 12, [])
	state["stats"] = {"10": {"damage": 23, "removals": 1, "draws": 12}, "23": {"damage": 9}}
	var tiles: Array = GameResult.highlights(state)
	check_eq(tiles.map(func(t: Dictionary) -> int: return t["value"]), [23, 1, 0, 12], "os valores")
	check_eq(tiles.map(func(t: Dictionary) -> String: return t["label"]), ["dano causado", "remoção", "anulações", "cartas compradas"], "singular e plural")
	state["watching"] = true
	check_eq(GameResult.highlights(state).size(), 0, "quem assiste não tem destaques")


func test_stats_table_marks_the_top_value() -> void:
	var state := _end("Você", 12, [])
	state["stats"] = {"10": {"damage": 23, "spells": 4}, "23": {"damage": 9, "spells": 4}}
	var table: Dictionary = GameResult.stats_table(state)
	check_eq(table["players"], ["Você", "Ana"], "você primeiro")
	var first: Dictionary = table["groups"][0]["rows"][0]
	check_eq(first["values"], [23, 9] as Array[int], "dano causado de cada um")
	check_eq(int(first["top"]), 0, "o maior marcado")
	var spells: Dictionary = table["groups"][3]["rows"][0]
	check_eq(int(spells["top"]), -1, "empate não marca")


func test_life_chart_points() -> void:
	var state := _end("Você", 12, [[20, 20], [20, 17], [14, 9], [12, 0]])
	var series: Array = GameResult.life_series(state)
	check_eq(series.size(), 2, "uma linha por jogador")
	check_eq(series[0]["name"], "Você", "você primeiro")
	check_eq(series[1]["life"], [20.0, 17.0, 9.0, 0.0] as Array[float], "vida de Ana a cada turno")
	check_eq(GameResult.life_turns(state), [0, 1, 2, 3] as Array[int], "turnos")
	check_eq(GameResult.life_range(series), Vector2i(0, 20), "escala de 0 a 20")
	check_eq(GameResult.life_ticks(0, 20), [0, 5, 10, 15, 20] as Array[int], "marcas de 5 em 5")
	check_eq(GameResult.life_series(_end("Você", 1, [[20, 20]])).size(), 0, "sem gráfico com um ponto só")
	var spread: Array[float] = GameResult.spread_labels([100.0, 104.0, 50.0] as Array[float], 14.0, 200.0)
	check_eq(spread, [100.0, 114.0, 50.0] as Array[float], "nomes afastados")


func test_time_text() -> void:
	check_eq(GameResult.time_text(7000), "0:07", "segundos")
	check_eq(GameResult.time_text(3725000), "1:02:05", "mais de uma hora")


func test_recap_picks_the_biggest_play() -> void:
	var recap := GameRecap.new()
	var label := func(n: String) -> String: return {"Lightning Bolt": "Raio"}.get(n, n)
	var bolt := {"id": 50, "name": "Lightning Bolt"}
	var frame := {"stack": [{"id": 9}]}
	var events: Array = [
		{"seq": 1, "type": "turn", "turn": 1},
		{"seq": 2, "type": "spell-cast", "actor": 23, "stackId": 9, "card": bolt, "frame": frame},
		{"seq": 3, "type": "damage", "actor": 23, "delta": -3, "card": bolt, "targets": {"players": [10]}, "frame": frame},
		{"seq": 4, "type": "resolved", "actor": 23, "stackId": 9, "card": bolt},
		{"seq": 5, "type": "damage", "combat": true, "delta": -4, "card": {"name": "Grizzly Bears"}, "targets": {"players": [23]}},
		{"seq": 6, "type": "damage", "combat": true, "delta": -3, "card": {"name": "Grizzly Bears"}, "targets": {"players": [23]}},
		{"seq": 7, "type": "left", "actor": 23, "card": {"name": "Llanowar Elves"}, "to": "Graveyard"},
	]
	var state := _end("Você", 17, [])
	recap.observe({"events": events})
	recap.observe({"events": events})
	check_eq(recap.events().size(), 7, "os eventos repetidos entram uma vez")
	var best: Dictionary = recap.highlight(state, label)
	check_eq(best["kind"], "Maior golpe", "tipo do destaque")
	check_eq(best["text"], "Dano de combate: Ana sofreu 7 de dano; Llanowar Elves morreu.", "o combate de 7 vence o raio de 3")
	var units: Array = GameRecap.merge(GameRecap.units(events))
	check_eq(GameRecap.line_text(units[1], state, label), "Ana conjurou Raio: causou 3 de dano a Você.", "a mágica com o que ela causou")
	recap.observe({"events": [{"seq": 8, "type": "turn", "turn": 1}]})
	check_eq(recap.highlight(state, label), {}, "jogo novo começa sem destaque")
