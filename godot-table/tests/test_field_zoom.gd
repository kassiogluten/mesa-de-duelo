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
