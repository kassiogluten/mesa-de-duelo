# Testes do aumento das permanentes com o campo vazio: maiores com poucas, voltando ao normal conforme o campo enche.
extends "res://tests/test_case.gd"

var _id: int = 0


func _bears(count: int) -> Array:
	var out: Array = []
	for i: int in count:
		_id += 1
		# Nomes diferentes: cada uma num monte próprio.
		out.append({"id": _id, "name": "Bear %d" % _id, "typeLine": "Creature — Bear", "creature": true, "controller": 0,
			"tapped": false, "power": 2, "toughness": 2})
	return out


func _zoom_of(count: int, width: float = 7.4) -> float:
	var player: Dictionary = {"id": 0, "battlefield": _bears(count)}
	var ctx: Dictionary = FieldLayout.context({"you": 0, "players": [player], "stack": [], "combat": [], "input": {}})
	return FieldLayout.zoom(FieldLayout.rows(player, ctx, width), width)


func test_few_permanents_are_bigger_and_shrink_as_the_field_fills() -> void:
	check_eq(_zoom_of(1), FieldLayout.ZOOM_MAX, "uma permanente: o maior tamanho")
	check_eq(_zoom_of(2), FieldLayout.ZOOM_MAX, "duas permanentes: ainda o maior")
	var last: float = FieldLayout.ZOOM_MAX
	for count: int in range(3, 10):
		var zoom: float = _zoom_of(count)
		check(zoom < last, "%d permanentes menores que %d" % [count, count - 1])
		last = zoom
	check_eq(_zoom_of(9), 1.0, "campo cheio: o tamanho normal")
	check_eq(_zoom_of(14), 1.0, "mais que cheio: nunca menor que o normal")


func test_zoom_never_squeezes_a_row_that_would_fit() -> void:
	# Coluna estreita (Commander): seis cartas quase enchem 4,5 de largura; o aumento para no que ainda cabe.
	var zoom: float = _zoom_of(6, 4.5)
	var row_width: float = 6.0 * FieldLayout.CARD.x + 5.0 * FieldLayout.ITEM_GAP
	check(row_width * zoom <= 4.5 + 0.0001, "a fileira aumentada ainda cabe")
	check(zoom >= 1.0, "nunca menor que o normal")


func test_table_places_a_lone_permanent_bigger() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	var lone: Array = _bears(1)
	table.apply_state({"you": 0, "players": [{"id": 0, "battlefield": lone, "exile": [], "hand": []},
		{"id": 1, "battlefield": [], "exile": [], "hand": []}], "stack": [], "combat": [], "input": {"selectable": [], "actionable": []}})
	var node: CardNode = table.card_node(int((lone[0] as Dictionary)["id"]))
	check(node != null, "a carta está na mesa")
	if node:
		check(is_equal_approx(node.target_transform().basis.get_scale().x, FieldLayout.ZOOM_MAX), "sozinha, ela fica no maior tamanho")
	catalog.queue_free()
	table.queue_free()


func test_crowded_row_stretches_to_the_free_side() -> void:
	check_eq(FieldPlacement.stretch_shift(7.0, 7.4, 9.3, 0.95), 0.0, "cabe na largura normal: não anda")
	check(is_equal_approx(FieldPlacement.stretch_shift(8.4, 7.4, 9.3, 0.95), 0.5), "anda metade do que esticou, para a ponta das pilhas ficar no lugar")
	check(is_equal_approx(FieldPlacement.stretch_shift(20.0, 7.4, 9.3, 0.95), 0.95), "no máximo até a largura esticada")
	check(is_equal_approx(FieldPlacement.stretch_shift(20.0, 7.4, 9.3, -0.95), -0.95), "o oponente estica para o outro lado")
	var player: Dictionary = {"id": 0, "battlefield": _bears(16)}
	var ctx: Dictionary = FieldLayout.context({"you": 0, "players": [player], "stack": [], "combat": [], "input": {}})
	check(FieldLayout.squeezed(FieldLayout.rows(player, ctx, 7.4)["front"]), "16 criaturas apertam a fileira normal")
	check(not FieldLayout.squeezed(FieldLayout.rows(_player_with(2), ctx, 7.4)["front"]), "duas não")


func _player_with(count: int) -> Dictionary:
	return {"id": 0, "battlefield": _bears(count)}



func test_squeezed_row_keeps_the_left_card_on_top_without_a_ramp() -> void:
	var player: Dictionary = _player_with(16)
	var ctx: Dictionary = FieldLayout.context({"you": 0, "players": [player], "stack": [], "combat": [], "input": {}})
	var items: Array = FieldLayout.rows(player, ctx, 7.4)["front"]
	var pose: Dictionary = FieldPlacement.row_pose(items, ctx)
	var slope: float = pose["slope"]
	check(slope > 0.0 and slope <= tan(FieldPlacement.MAX_TILT) + 0.0001, "as apertadas inclinam de leve")
	check(not bool((pose["tilted"] as Array)[items.size() - 1]), "a última da direita fica reta")
	for i: int in items.size():
		check_eq(float((pose["lifts"] as Array)[i]), 0.0, "cartas soltas: a %dª não sobe, a borda fica no feltro" % (i + 1))
	# A borda de cada uma passa acima da borda esquerda da vizinha.
	for i: int in range(items.size() - 1):
		var gap: float = FieldPlacement._item_left(items[i + 1]) - FieldPlacement._item_left(items[i])
		check(slope * gap >= FieldPlacement.OVERLAP_CLEAR - 0.0001, "a %dª passa por cima da vizinha" % (i + 1))
	var loose: Dictionary = _player_with(3)
	var loose_ctx: Dictionary = FieldLayout.context({"you": 0, "players": [loose], "stack": [], "combat": [], "input": {}})
	var flat: Dictionary = FieldPlacement.row_pose(FieldLayout.rows(loose, loose_ctx, 7.4)["front"], loose_ctx)
	check_eq(float(flat["slope"]), 0.0, "fileira com folga: ninguém inclina")


func _tokens(name: String, count: int) -> Array:
	var out: Array = []
	for i: int in count:
		_id += 1
		out.append({"id": _id, "name": name, "typeLine": "Token Artifact — " + name, "token": true, "artifact": true, "controller": 0, "tapped": false})
	return out


func test_a_big_token_pile_is_low_and_does_not_lift_the_row() -> void:
	# Pista ×5, Comida ×12 e Tesouro ×40 apertados ao lado de 20 terrenos.
	var field: Array = _tokens("Clue", 5) + _tokens("Food", 12) + _tokens("Treasure", 40)
	for i: int in 20:
		_id += 1
		field.append({"id": _id, "name": "Land %d" % i, "typeLine": "Land", "land": true, "controller": 0, "tapped": false})
	var player: Dictionary = {"id": 0, "battlefield": field}
	var ctx: Dictionary = FieldLayout.context({"you": 0, "players": [player], "stack": [], "combat": [], "input": {}})
	var items: Array = FieldLayout.rows(player, ctx, 7.4)["back"]
	check(FieldLayout.squeezed(items), "a fileira está apertada")
	check(FieldPlacement.copy_rise(40) * 39 <= FieldPlacement.PILE_HEIGHT + 0.0001, "40 Tesouros: um monte baixo, não uma torre")
	check_eq(FieldPlacement.copy_rise(3), PaperPhysics.PILE_STEP, "monte pequeno: a espessura de uma carta por cópia")
	var pose: Dictionary = FieldPlacement.row_pose(items, ctx)
	for i: int in items.size():
		check(float((pose["lifts"] as Array)[i]) <= 3.0 * (FieldPlacement.PILE_HEIGHT + FieldPlacement.OVERLAP_CLEAR),
			"o monte %d sobe no máximo um tico, só pelos montes à direita (%.3f)" % [i + 1, float((pose["lifts"] as Array)[i])])
