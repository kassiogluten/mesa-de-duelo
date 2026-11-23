# Momentos grandes: o primeiro sangue uma vez por jogo, a eliminação de vários de uma vez, o golpe de comandante com o total, o ultimate e o recomeço numa partida nova.
extends "res://tests/test_case.gd"


func _state(events: Array, eliminated: Array = [], match_id: String = "m1", game: int = 1, stack: Array = []) -> Dictionary:
	var players: Array = []
	for id: int in 4:
		players.append({"id": id, "name": "J%d" % id, "life": 20, "eliminated": eliminated.has(id)})
	return {"type": "state", "matchId": match_id, "match": {"gameNumber": game, "wins": [0, 0], "draws": 0, "over": false},
		"you": 0, "players": players, "stack": stack, "events": events}


func _hit(seq: int, player: int, extra: Dictionary = {}) -> Dictionary:
	var event: Dictionary = {"seq": seq, "type": "damage", "combat": true, "sourceId": 50, "targets": {"players": [player]}, "delta": -3}
	event.merge(extra, true)
	return event


func _kinds(moments: Array) -> Array:
	return moments.map(func(m: Dictionary) -> String: return Txt.of(m["kind"]))


func test_first_blood_only_once_per_game() -> void:
	var moments := Moments.new()
	var first: Array = moments.observe(_state([_hit(1, 1)]))
	check_eq(_kinds(first), ["first-blood"], "o primeiro golpe de combate num jogador")
	check_eq(first[0]["player"], 1, "no jogador atingido")
	check_eq(first[0]["source"], 50, "vindo do atacante")
	check_eq(moments.observe(_state([_hit(1, 1), _hit(2, 2)])), [], "o segundo golpe não repete (e o evento visto não conta de novo)")
	check_eq(_kinds(moments.observe(_state([_hit(3, 1)], [], "m1", 2))), ["first-blood"], "o jogo seguinte da série tem o seu")


func test_first_blood_ignores_creatures_spells_and_prevented() -> void:
	var moments := Moments.new()
	var events: Array = [
		{"seq": 1, "type": "damage", "combat": true, "sourceId": 50, "targets": {"cards": [9]}, "delta": -2},
		{"seq": 2, "type": "damage", "sourceId": 51, "targets": {"players": [1]}, "delta": -3},
		_hit(3, 1, {"prevented": true}),
	]
	check_eq(moments.observe(_state(events)), [], "golpe em criatura, mágica no jogador e golpe prevenido não contam")
	check_eq(_kinds(moments.observe(_state([_hit(4, 1)]))), ["first-blood"], "o golpe de combate que chega conta")


func test_turn_one_starts_another_game() -> void:
	var moments := Moments.new()
	moments.observe(_state([_hit(1, 1)]))
	var again: Array = moments.observe(_state([{"seq": 2, "type": "turn", "turn": 1, "actor": 0}, _hit(3, 0)]))
	check_eq(_kinds(again), ["first-blood"], "o turno 1 recomeça o primeiro sangue")


func test_two_eliminated_in_the_same_state_is_a_double_kill() -> void:
	var moments := Moments.new()
	moments.observe(_state([]))
	var out: Array = moments.observe(_state([_hit(1, 1, {"lethal": true}), _hit(2, 2, {"lethal": true})], [1, 2]))
	check_eq(_kinds(out), ["first-blood", "multi-kill"], "primeiro sangue e a eliminação")
	check_eq(out[1]["count"], 2, "dois jogadores")
	check_eq(out[1]["players"], [1, 2], "os dois derrubados")
	check_eq(out[1]["seq"], 2, "no último golpe letal")
	check_eq(Moments.multi_kill_title(2), "Eliminação dupla", "o nome")
	check_eq(moments.observe(_state([], [1, 2])), [], "os mesmos eliminados no estado seguinte não repetem")


func test_eliminations_in_separate_states_are_not_a_multi_kill() -> void:
	var moments := Moments.new()
	moments.observe(_state([]))
	check_eq(moments.observe(_state([], [1])), [], "um eliminado só")
	var out: Array = moments.observe(_state([], [1, 2, 3]))
	check_eq(_kinds(out), ["multi-kill"], "os dois seguintes de uma vez")
	check_eq(out[0]["count"], 2, "contam só os novos")
	check_eq(Moments.multi_kill_title(3), "Eliminação tripla", "três")


func test_lethal_events_count_before_the_state_marks_them() -> void:
	var moments := Moments.new()
	moments.observe(_state([]))
	var events: Array = [{"seq": 1, "type": "damage", "sourceId": 70, "targets": {"players": [1, 2, 3]}, "delta": -5, "lethal": true}]
	var out: Array = moments.observe(_state(events))
	check_eq(out.size(), 1, "uma eliminação")
	check_eq(out[0]["count"], 3, "a mágica que derruba três")
	check_eq(moments.observe(_state([], [1, 2, 3])), [], "o estado que os marca depois não repete")


func test_already_eliminated_on_arrival_is_not_a_moment() -> void:
	var moments := Moments.new()
	check_eq(moments.observe(_state([], [1, 2])), [], "quem já estava fora quando a mesa chegou")


func test_commander_hit_brings_the_total() -> void:
	var moments := Moments.new()
	moments.observe(_state([_hit(1, 3)]))
	var out: Array = moments.observe(_state([_hit(2, 1, {"commander": true, "commanderId": 77, "commanderTotal": 16, "delta": -6})]))
	check_eq(_kinds(out), ["commander-hit"], "o golpe de comandante")
	check_eq(out[0]["player"], 1, "no jogador")
	check_eq(out[0]["commander"], 77, "do comandante que conta")
	check_eq(out[0]["total"], 16, "com o total")
	check_eq(out[0]["hit"], 6, "e o golpe")
	check_eq(out[0]["lethal"], false, "ainda não mata")
	var lethal: Array = moments.observe(_state([_hit(3, 1, {"commander": true, "commanderId": 77, "commanderTotal": 22, "delta": -6})]))
	check_eq(lethal[0]["lethal"], true, "21 ou mais mata")


func test_commander_total_falls_back_to_the_state() -> void:
	var moments := Moments.new()
	var state: Dictionary = _state([_hit(1, 1, {"commander": true, "sourceId": 77, "delta": -4})])
	(state["players"][1] as Dictionary)["commanderDamage"] = [{"commanderId": 77, "damage": 12}]
	var out: Array = moments.observe(state)
	check_eq(_kinds(out), ["first-blood", "commander-hit"], "primeiro sangue e o golpe de comandante")
	check_eq(out[1]["total"], 12, "o total vem do estado")
	check_eq(out[1]["commander"], 77, "o comandante é a fonte")


func test_ultimate() -> void:
	var moments := Moments.new()
	var plain: Dictionary = {"seq": 1, "type": "ability-activated", "sourceId": 40, "actor": 0, "loyalty": true, "cost": "+1"}
	check_eq(moments.observe(_state([plain])), [], "+1 não é ultimate")
	var out: Array = moments.observe(_state([{"seq": 2, "type": "ability-activated", "sourceId": 40, "actor": 0, "loyalty": true, "ultimate": true}]))
	check_eq(_kinds(out), ["ultimate"], "o ultimate do evento")
	check_eq(out[0]["source"], 40, "da carta")
	var stack: Array = [{"id": 900, "text": "", "kind": "ability", "loyalty": {"cost": "-8", "ultimate": true}}]
	var from_stack: Array = moments.observe(_state([{"seq": 3, "type": "ability-activated", "card": {"id": 41}, "stackId": 900, "actor": 1}], [], "m1", 1, stack))
	check_eq(_kinds(from_stack), ["ultimate"], "o ultimate dito no item da pilha")
	check_eq(from_stack[0]["source"], 41, "da carta do evento")


func test_new_match_starts_over() -> void:
	var moments := Moments.new()
	moments.observe(_state([_hit(5, 1)]))
	check_eq(moments.observe(_state([_hit(6, 2)])), [], "na mesma partida não repete")
	var out: Array = moments.observe(_state([_hit(1, 1)], [], "m2"))
	check_eq(_kinds(out), ["first-blood"], "partida nova: primeiro sangue de novo, com a numeração recomeçando")


func test_play_cleans_up_after_itself() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	var catalog := CardCatalog.new()
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(catalog)
	tree.root.add_child(table)
	var parent := Node3D.new()
	tree.root.add_child(parent)
	for moment: Dictionary in [{"kind": "first-blood", "player": 1}, {"kind": "multi-kill", "count": 2, "players": [1, 2]},
		{"kind": "commander-hit", "player": 1, "total": 21, "hit": 5}, {"kind": "ultimate", "source": 999}]:
		Moments.play(moment, parent, table)
	await tree.create_timer(0.6).timeout
	check(parent.get_child_count() > 0, "as cenas põem peças na mesa")
	await tree.create_timer(4.0).timeout
	check_eq(parent.get_child_count(), 0, "e todas se apagam sozinhas")
	check_eq(table.camera.position, TableView.CAMERA_POS, "a câmera volta para o lugar")
	check_eq(table.camera.h_offset, 0.0, "sem tremor sobrando")
	parent.queue_free()
	table.queue_free()
	catalog.queue_free()
	done = true
