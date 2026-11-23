# Cartas voando (fx/card_flights.gd): a duração segue o número de cartas com teto, e as cartas temporárias se apagam no fim.
extends "res://tests/test_case.gd"


func _revealed(count: int) -> Array:
	var out: Array = []
	for i: int in count:
		out.append({"id": 500 + i, "name": ""})
	return out


func _flight_cards(parent: Node3D) -> int:
	var count: int = 0
	for node: Node in parent.find_children("*", "CardNode", true, false):
		if not node.is_queued_for_deletion():
			count += 1
	return count


func test_cascade_duration_grows_with_the_cards_and_has_a_ceiling() -> void:
	check(CardFlights.cascade_duration(3, true) > CardFlights.cascade_duration(1, true), "3 cartas demoram mais que 1")
	check(CardFlights.cascade_duration(7, true) > CardFlights.cascade_duration(3, true), "7 demoram mais que 3")
	check_eq(CardFlights.cascade_duration(30, true), CardFlights.cascade_duration(7, true), "30 cartas: só 7 no leque")
	check(CardFlights.cascade_duration(30, true) <= 2.6, "a cascata longa não segura a partida (%.2f s)" % CardFlights.cascade_duration(30, true))
	check(CardFlights.cascade_duration(4, false) > 0.5, "sem achada também tem duração")


func test_mill_and_scry_durations_follow_the_count() -> void:
	check(CardFlights.mill_duration(3) > CardFlights.mill_duration(1), "moer 3 demora mais que 1")
	check(CardFlights.mill_duration(30) <= CardFlights.mill_duration(8) + 0.001, "moer 30 não demora mais que 8 (o resto chega junto)")
	check(CardFlights.mill_duration(30) < 1.6, "moer 30 cabe em 1,6 s")
	check_eq(CardFlights.mill_duration(0), CardFlights.mill_duration(1), "moer sem cartas conhecidas voa um verso")
	check(CardFlights.scry_duration(2, 1) > CardFlights.scry_duration(1, 0), "vidência 3 demora mais que 1")
	check_eq(CardFlights.scry_duration(9, 9), CardFlights.scry_duration(5, 0), "no máximo 5 no leque")
	check_eq(CardFlights.scry_duration(0, 0), 0.0, "vidência de nada não tem voo")
	check_eq(CardFlights.scry_label(2, 1), "2 no topo · 1 no fundo", "rótulo da vidência")
	check_eq(CardFlights.scry_label(0, 3), "3 no fundo", "rótulo só do fundo")


func test_the_returned_duration_matches_the_timing() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	check_eq(CardFlights.cascade(parent, null, Vector3(-5, 0, 2.25), Vector3(-5, 0, 1.1), _revealed(12), 511), CardFlights.cascade_duration(7, true), "cascata devolve a duração dela")
	check_eq(CardFlights.mill(parent, null, Vector3(-5, 0, 2.25), Vector3(-4.25, 0, 2.25), _revealed(4)), CardFlights.mill_duration(4), "moer devolve a duração dele")
	check_eq(CardFlights.scry(parent, Vector3(-5, 0, 2.25), 1, 2), CardFlights.scry_duration(1, 2), "vidência devolve a duração dela")
	check_eq(CardFlights.tutor(parent, Vector3(-5, 0, 2.25), Vector3(0, 3.2, 4.45)), CardFlights.TUTOR_TIME, "busca devolve a duração dela")
	check_eq(CardFlights.cascade(parent, null, Vector3.ZERO, Vector3.ONE, [], -1), 0.0, "cascata sem cartas não faz nada")
	parent.queue_free()


func test_flight_cards_are_bounded_and_removed_at_the_end() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var baseline: int = catalog.texture_ready.get_connections().size()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var lib := Vector3(-5.05, 0, 2.25)
	# Cascata de 20 cartas: 7 no leque e no máximo 4 das primeiras voando juntas.
	var revealed: Array = _revealed(20)
	# Imagem com endereço que falha na hora: o teste não baixa imagens de verdade.
	revealed[19] = {"id": 519, "name": "Lightning Bolt", "image": "nada://raio"}
	var longest: float = CardFlights.cascade(parent, catalog, lib, Vector3(-5.05, 0, 1.1), revealed, 519)
	longest = maxf(longest, CardFlights.mill(parent, catalog, lib, Vector3(-4.25, 0, 2.25), [{"id": 1, "name": "Forest", "image": "nada://floresta"}, {}, {}], true))
	longest = maxf(longest, CardFlights.scry(parent, lib, 2, 1))
	longest = maxf(longest, CardFlights.tutor(parent, lib, Vector3(0, 3.2, 4.45)))
	var flying: int = _flight_cards(parent)
	check_eq(flying, 7 + 4 + 3 + 3 + 1, "cartas temporárias: leque, as que voam juntas, moer, vidência e busca")
	check(catalog.texture_ready.get_connections().size() > baseline, "as cartas com nome esperam a imagem")
	await tree.create_timer(longest + 0.1).timeout
	check_eq(_flight_cards(parent), 0, "nenhuma carta temporária depois da duração")
	check_eq(catalog.texture_ready.get_connections().size(), baseline, "os sinais do catálogo foram soltos")
	await tree.create_timer(CardFlights.TAIL + 0.2).timeout
	check_eq(parent.get_children().filter(func(n: Node) -> bool: return n.name.begins_with("CardFlights")).size(), 0, "os nós dos voos se apagaram")
	parent.queue_free()
	catalog.queue_free()
	done = true
