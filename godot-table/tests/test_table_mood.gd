# Clima da mesa: a luz puxa para a cor da mágica, volta ao normal em poucos segundos, acumula sem estourar e some no "leve".
extends "res://tests/test_case.gd"

var _quality: int = 2


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func _mood(table: TableView) -> TableMood:
	var mood := TableMood.new()
	# Fora da árvore: o _process não corre, o teste anda o tempo com advance().
	mood.attach(table)
	return mood


func _lamp(table: TableView) -> OmniLight3D:
	for child: Node in table.get_children():
		if child is OmniLight3D:
			return child
	return null


func _env(table: TableView) -> Environment:
	for child: Node in table.get_children():
		if child is WorldEnvironment:
			return (child as WorldEnvironment).environment
	return null


func _cleanup(table: TableView, mood: TableMood) -> void:
	Fx.quality = _quality
	mood.free()
	table.catalog.queue_free()
	table.queue_free()


func _steps(mood: TableMood, seconds: float) -> void:
	for i: int in int(seconds * 60.0):
		mood.advance(1.0 / 60.0)


func test_light_leans_to_the_spell_color_and_comes_back() -> void:
	_quality = Fx.quality
	Fx.quality = 2
	var table := _table()
	var mood := _mood(table)
	var lamp: OmniLight3D = _lamp(table)
	var base_lamp: Color = lamp.light_color
	var base_ambient: Color = _env(table).ambient_light_color
	mood.pulse(Color(1.0, 0.38, 0.18))
	_steps(mood, 0.35)
	check(mood.level() > 0.3, "acende logo (%.2f)" % mood.level())
	check(lamp.light_color.r - lamp.light_color.b > base_lamp.r - base_lamp.b + 0.2, "a lâmpada puxa para o vermelho")
	check(_env(table).ambient_light_color.r - _env(table).ambient_light_color.b > base_ambient.r - base_ambient.b + 0.1, "o ambiente também")
	_steps(mood, 3.0)
	check(mood.level() < 0.02, "volta ao normal em ~3 s (%.3f)" % mood.level())
	_steps(mood, 1.0)
	check_eq(lamp.light_color, base_lamp, "a lâmpada volta à cor de antes")
	check_eq(_env(table).ambient_light_color, base_ambient, "o ambiente volta ao de antes")
	_cleanup(table, mood)


func test_many_spells_build_up_without_blowing_out() -> void:
	_quality = Fx.quality
	Fx.quality = 2
	var table := _table()
	var mood := _mood(table)
	var lamp: OmniLight3D = _lamp(table)
	var base_energy: float = lamp.light_energy
	mood.pulse(Color(0.35, 0.65, 1.0))
	_steps(mood, 0.3)
	var one: float = mood.level()
	for i: int in 8:
		mood.pulse(Color(0.35, 0.65, 1.0), 1.5)
		_steps(mood, 0.1)
	check(mood.level() > one, "acumula (%.2f > %.2f)" % [mood.level(), one])
	check(mood.level() <= TableMood.CAP + 0.001, "não passa do teto (%.2f)" % mood.level())
	check(lamp.light_energy <= base_energy * (1.0 + TableMood.LAMP_BOOST) + 0.001, "a lâmpada não estoura")
	check(lamp.light_color.b > lamp.light_color.r, "azul")
	_cleanup(table, mood)


func test_colors_in_a_row_mix() -> void:
	_quality = Fx.quality
	Fx.quality = 2
	var table := _table()
	var mood := _mood(table)
	var lamp: OmniLight3D = _lamp(table)
	mood.pulse(Color(1.0, 0.38, 0.18))
	_steps(mood, 0.2)
	mood.pulse(Color(0.35, 0.95, 0.4))
	_steps(mood, 0.3)
	check(lamp.light_color.g > lamp.light_color.b, "o verde entrou")
	check(lamp.light_color.r > 0.6, "o vermelho ainda está lá")
	_cleanup(table, mood)


func test_light_quality_does_nothing() -> void:
	_quality = Fx.quality
	Fx.quality = 0
	var table := _table()
	var mood := _mood(table)
	var lamp: OmniLight3D = _lamp(table)
	var base_lamp: Color = lamp.light_color
	mood.pulse(Color(1.0, 0.38, 0.18), 2.0)
	_steps(mood, 0.5)
	check_eq(mood.level(), 0.0, "no leve não acende")
	check_eq(lamp.light_color, base_lamp, "a lâmpada fica como está")
	_cleanup(table, mood)

