# Testes do ambiente da mesa (TableEnvironment): a poça de luz do tampo segue quem joga o turno e o clima acha as luzes.
extends "res://tests/test_case.gd"


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func _state(active: Variant) -> Dictionary:
	return {"type": "state", "you": 0, "activePlayer": active, "stack": [], "players": [
		{"id": 0, "name": "Você", "life": 20, "library": 30, "hand": [], "handCount": 0, "graveyard": [], "exile": [], "battlefield": []},
		{"id": 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 0, "graveyard": [], "exile": [], "battlefield": []}]}


func test_pool_follows_the_active_player() -> void:
	var table := _table()
	table.apply_state(_state(0))
	var mine: Vector4 = TableEnvironment.pool_for(table.current_state(), table)
	check(mine.y > 0.0 and mine.z > 0.0, "no seu turno, a poça fica do seu lado (z positivo)")
	table.apply_state(_state(1))
	var theirs: Vector4 = TableEnvironment.pool_for(table.current_state(), table)
	check(theirs.y < 0.0 and theirs.z > 0.0, "no turno do oponente, do lado dele")
	table.apply_state(_state(null))
	check_eq(TableEnvironment.pool_for(table.current_state(), table), Vector4.ZERO, "sem ninguém na vez, apagada")
	check_eq(TableEnvironment.pool_for({}, table), Vector4.ZERO, "sem partida, apagada")
	table.catalog.queue_free()
	table.queue_free()


func test_mood_still_finds_sun_lamp_and_environment() -> void:
	done = false
	var table := _table()
	var mood := TableMood.new()
	table.add_child(mood)
	await mood.attach(table)
	var keeper: TableEnvironment = table.get_node("Ambiente") as TableEnvironment
	check(mood._sun == keeper.sun, "o sol do clima é a luz principal (quente) da mesa")
	check(mood._lamp != null and mood._env == keeper.env, "e ele acha a lâmpada e o ambiente")
	table.catalog.queue_free()
	table.queue_free()
	done = true
