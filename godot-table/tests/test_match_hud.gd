# Testes do HUD da partida: grupo de cada etapa, paradas (marcar, mandar ao servidor, eco antigo), histórico (o que entra,
# compras juntas, terreno sem a entrada repetida, primeiro sangue) e o HUD montado com os estados gravados.
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/abertura.json"


func _state(extra: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"turn": 3, "phase": "MAIN1", "activePlayer": 1, "you": 1, "gameOver": false, "stack": [],
		"players": [{"id": 1, "name": "Ana"}, {"id": 2, "name": "Bruno"}]}
	s.merge(extra, true)
	return s


func test_every_step_falls_in_one_of_the_five_groups() -> void:
	check_eq(PhaseText.step_group("UNTAP"), "start", "desvirar")
	check_eq(PhaseText.step_group("DRAW"), "start", "compra")
	check_eq(PhaseText.step_group("MAIN1"), "main1", "principal 1")
	check_eq(PhaseText.step_group("COMBAT_FIRST_STRIKE_DAMAGE"), "combat", "dano de iniciativa")
	check_eq(PhaseText.step_group("MAIN2"), "main2", "principal 2")
	check_eq(PhaseText.step_group("CLEANUP"), "end", "limpeza")
	check_eq(PhaseText.step_group(null), "", "sem etapa")
	for step: Array in PhaseText.STOP_STEPS:
		check_eq(PhaseText.step_group(step[0]), step[2], "a parada %s fica no grupo dela" % step[0])
	check_eq(PhaseText.combat_count(_state({"combatNumber": 2, "extraCombats": 1})), 3, "×3 com um combate extra agora e outro por vir")
	check_eq(PhaseText.combat_count(_state()), 1, "sem combate extra, sem selo")
	check_eq(PhaseText.current_detail(_state({"phase": "COMBAT_DAMAGE", "combatNumber": 2})), "Dano de combate · Combate extra", "combate extra no nome da etapa")


func test_stops_toggle_in_turn_order_and_mark_their_group() -> void:
	var stops: Array = PhaseText.toggle_stop([], "END_OF_TURN")
	stops = PhaseText.toggle_stop(stops, "UPKEEP")
	check_eq(stops, ["UPKEEP", "END_OF_TURN"], "na ordem do turno")
	check_eq(PhaseText.toggle_stop(stops, "UPKEEP"), ["END_OF_TURN"], "tocar de novo desmarca")
	check_eq(PhaseText.toggle_stop(stops, "NOPE"), stops, "etapa desconhecida não entra")
	check_eq(PhaseText.stops_by_group(stops), {"start": ["Manutenção"], "end": ["Etapa final"]}, "selo por grupo")
	check(PhaseText.holding_stop(_state({"phase": "END_OF_TURN"}), stops), "para numa etapa marcada com a pilha vazia")
	check(not PhaseText.holding_stop(_state({"phase": "END_OF_TURN", "stack": [{"id": 1}]}), stops), "com algo na pilha não é a parada")
	check(PhaseText.group_tip(_state({"phase": "UPKEEP"}), "start", stops).contains("Parada marcada: Manutenção"), "a dica diz a parada")


func test_the_track_sends_the_stops_and_ignores_a_stale_echo() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var track := PhaseTrack.new()
	track.store_prefs = false
	tree.root.add_child(track)
	var sent: Array = []
	track.action.connect(func(m: Dictionary) -> void: sent.append(m))
	track.apply_state(_state())
	check(not track.supported, "sem preferences.opponentStops o servidor não conhece as paradas")
	track.apply_state(_state({"preferences": {"opponentStops": ["DRAW"]}}))
	check(track.supported, "com a lista, conhece")
	check_eq(track.stops, ["DRAW"], "sem escolha guardada, vale a do servidor")
	check_eq(sent.size(), 1, "confirma a escolha ao servidor uma vez")
	track.apply_state(_state({"preferences": {"opponentStops": ["DRAW"]}}))
	track.toggle("COMBAT_DECLARE_BLOCKERS")
	check_eq(track.stops, ["DRAW", "COMBAT_DECLARE_BLOCKERS"], "marcou bloqueadores")
	check_eq(sent[-1], {"type": "preferences", "opponentStops": ["DRAW", "COMBAT_DECLARE_BLOCKERS"]}, "mandou a lista nova")
	track.apply_state(_state({"preferences": {"opponentStops": ["DRAW"]}}))
	check_eq(track.stops, ["DRAW", "COMBAT_DECLARE_BLOCKERS"], "um eco antigo não desfaz a escolha")
	track.apply_state(_state({"preferences": {"opponentStops": ["DRAW", "COMBAT_DECLARE_BLOCKERS"]}}))
	track.apply_state(_state({"preferences": {"opponentStops": []}}))
	check_eq(track.stops, [], "depois de confirmada, uma mudança vinda do servidor vale")
	track.open_menu("combat")
	check(track._menu.visible, "o menu do grupo abre")
	track.apply_state(_state({"gameOver": true, "preferences": {"opponentStops": []}}))
	check(not track._menu.visible, "no fim do jogo o menu fecha")
	track.queue_free()


func test_history_keeps_plays_joins_draws_and_marks_first_blood() -> void:
	var panel := HistoryPanel.new()
	var events: Array = [
		{"seq": 1, "type": "turn", "turn": 1, "actor": 1},
		{"seq": 2, "type": "draw", "actor": 1},
		{"seq": 3, "type": "draw", "actor": 1},
		{"seq": 4, "type": "priority", "actor": 1},
		{"seq": 5, "type": "land-played", "actor": 1, "card": {"id": 7, "name": "Forest"}},
		{"seq": 6, "type": "entered", "actor": 1, "from": "Hand", "to": "Battlefield", "card": {"id": 7, "name": "Forest"}},
		{"seq": 7, "type": "damage", "combat": true, "delta": -2, "targets": {"players": [2]}},
		{"seq": 8, "type": "damage", "combat": true, "delta": -2, "targets": {"players": [2]}},
	]
	panel.ingest(_state({"events": events.slice(0, 5)}))
	panel.ingest(_state({"events": events}))
	var kept: Array = panel.history().map(func(e: Dictionary) -> String: return e["type"])
	check_eq(kept, ["turn", "draw", "land-played", "damage", "damage"], "sem prioridade e sem a entrada do terreno jogado")
	check_eq(int((panel.history()[1] as Dictionary)["count"]), 2, "as duas compras viram uma linha")
	check(bool((panel.history()[3] as Dictionary).get("firstBlood", false)), "o primeiro golpe de combate é o primeiro sangue")
	check(not (panel.history()[4] as Dictionary).has("firstBlood"), "só o primeiro")
	var turns: Array = HistoryLog.history_turns(panel.history(), panel.history_names())
	check_eq(turns.size(), 1, "um turno")
	var texts: Array = (turns[0]["lines"] as Array).map(func(l: Dictionary) -> String: return l["text"])
	check_eq(texts, ["Ana comprou 2 cartas.", "Ana jogou Forest.", "Dano de combate: Bruno sofreu 4 de dano."], "uma linha por jogada, em português")
	check_eq(HistoryLog.turn_summary(turns[0]), "3 jogadas", "resumo do turno")
	check_eq((turns[0]["lines"] as Array)[2]["badges"], ["Primeiro sangue"], "selo do primeiro sangue na linha")
	panel.free()


func test_concede_text_says_what_happens_in_each_kind_of_match() -> void:
	check_eq(MatchMenu.concede_text({"config": {"matchLength": "bo3"}, "players": [{}, {}]})["title"], "Conceder este jogo?", "melhor de três")
	check_eq(MatchMenu.concede_text({"players": [{}, {}, {}]})["text"], "Você sai do jogo, e os outros jogadores continuam.", "Commander com vários")
	check(MatchMenu.concede_text({"players": [{}, {}], "room": {}})["stay"].contains("Pedir revanche"), "em sala, revanche")


func test_the_hud_shows_the_recorded_match_without_errors() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var hud := Hud.new()
	hud.catalog = catalog
	tree.root.add_child(hud)
	var states: Array = JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))
	for raw: Variant in states:
		var state: Dictionary = raw
		state["match"] = {"gameNumber": 2, "wins": [1, 0], "elapsedMs": 754000}
		state["config"] = {"format": "standard", "matchLength": "bo3"}
		hud.apply_state(state)
	check(hud._clocks.visible, "os relógios aparecem com o turno")
	check_eq(hud._clocks._match_time.text, "12:34", "duração da partida pelo servidor")
	check(hud._track.visible, "a trilha aparece")
	hud._history.toggle(true)
	hud._history._render()
	check(hud._history._list.get_child_count() > 0, "o histórico tem linhas")
	hud.banner("Seu turno", Hud.GOLD)
	hud.queue_free()
	catalog.queue_free()
