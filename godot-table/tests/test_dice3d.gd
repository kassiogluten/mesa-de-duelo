# Dados e moeda 3D: a rotação final deixa cada resultado em cima, as faces opostas somam certo e o lance para no resultado.
extends "res://tests/test_case.gd"


func test_final_basis_puts_each_result_on_top() -> void:
	for sides: int in [4, 6, 8, 10, 12, 20]:
		for result: int in range(1, sides + 1):
			var basis: Basis = Dice3D.final_basis(sides, result)
			check_eq(Dice3D.top_value(sides, basis), result, "d%d com %d em cima" % [sides, result])
			if sides != 4:
				# A face do resultado fica deitada (normal para cima), não só a mais alta.
				var up: Vector3 = Vector3.ZERO
				for reading: Dictionary in DiceShapes.shape(sides)["readings"]:
					if int(reading["value"]) == result:
						up = basis * (reading["n"] as Vector3)
				check(up.distance_to(Vector3.UP) < 0.001, "d%d com %d: face deitada" % [sides, result])


func test_every_shape_has_each_number_once() -> void:
	for sides: int in [4, 6, 8, 10, 12, 20]:
		var values: Array[int] = []
		for reading: Dictionary in DiceShapes.shape(sides)["readings"]:
			values.append(int(reading["value"]))
		values.sort()
		var expected: Array[int] = []
		for i: int in range(1, sides + 1):
			expected.append(i)
		check_eq(values, expected, "números do d%d" % sides)


func test_opposite_faces_add_up() -> void:
	for sides: int in [6, 8, 10, 12, 20]:
		var readings: Array = DiceShapes.shape(sides)["readings"]
		for a: Dictionary in readings:
			for b: Dictionary in readings:
				if (a["n"] as Vector3).dot(b["n"]) < -0.999:
					check_eq(int(a["value"]) + int(b["value"]), sides + 1, "faces opostas do d%d" % sides)


func test_odd_dice_use_the_nearest_shape() -> void:
	check_eq(Dice3D.shape_for(6), 6, "d6 é cubo")
	check_eq(Dice3D.shape_for(3), 4, "d3 usa o d4")
	check_eq(Dice3D.shape_for(100), 20, "d100 usa o d20")
	check_eq(Dice3D.face_value(100, 57), 17, "o 57 cai na face 17")
	check_eq(Dice3D.top_value(100, Dice3D.final_basis(100, 57)), 17, "e ela fica em cima")


func test_roll_stops_with_the_result_on_top() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var d6: Node3D = Dice3D.roll(parent, Vector3.ZERO, 6, 4, 0.4)
	var d20: Node3D = Dice3D.roll(parent, Vector3(1.5, 0, 0), 20, 17, 0.4)
	check(d6 != null and d6.get_parent() == parent, "o d6 entra na mesa")
	check(d20 != null and d20.get_parent() == parent, "o d20 entra na mesa")
	await tree.create_timer(0.7).timeout
	check_eq(Dice3D.top_value(6, (d6.get_node("Spin") as Node3D).basis), 4, "o d6 para no 4")
	check_eq(Dice3D.top_value(20, (d20.get_node("Spin") as Node3D).basis), 17, "o d20 para no 17")
	check(d6.position.distance_to(Vector3(0, DiceShapes.CUBE_HALF, 0)) < 0.01, "o d6 para deitado no ponto pedido")
	var labels: Array = d20.get_meta("result_labels", [])
	check_eq(labels.size(), 1, "o d20 tem uma face com o resultado")
	parent.queue_free()
	done = true


func test_coin_lands_on_the_right_face() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var heads: Node3D = Dice3D.coin(parent, Vector3.ZERO, true, 0.4)
	var tails: Node3D = Dice3D.coin(parent, Vector3(1, 0, 0), false, 0.4)
	check(heads != null and heads.get_parent() == parent, "a moeda entra na mesa")
	await tree.create_timer(0.7).timeout
	check((heads.get_node("Spin") as Node3D).basis.y.y > 0.999, "cara para cima")
	check((tails.get_node("Spin") as Node3D).basis.y.y < -0.999, "coroa para cima")
	parent.queue_free()
	done = true


func test_starting_roll_throws_one_die_per_player() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	Dice3D.starting_roll(parent, {0: Vector3(0, 0, 1), 1: Vector3(0, 0, -1)}, [[{"player": 0, "roll": 3}, {"player": 1.0, "roll": 3}], [{"player": 0, "roll": 5}, {"player": 1, "roll": 2}]])
	await tree.create_timer(0.2).timeout
	var dice: int = 0
	for child: Node in parent.get_children():
		if child.has_meta("sides"):
			dice += 1
	check_eq(dice, 2, "um dado por jogador na primeira rodada")
	parent.queue_free()
	done = true
