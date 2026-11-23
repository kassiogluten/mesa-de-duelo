# Física leve das cartas: o assentar (sem quique) volta exatamente ao lugar, não briga com outro voo, e a inclinação segue o mouse.
extends "res://tests/test_case.gd"

var _quality: int = 2


func test_card_settles_back_exactly_where_it_landed() -> void:
	done = false
	_quality = Fx.quality
	Fx.quality = 2
	var tree: SceneTree = Engine.get_main_loop()
	var card := Node3D.new()
	tree.root.add_child(card)
	card.transform = Transform3D(Basis(Vector3.UP, -PI / 2.0), Vector3(1.5, 0.0, 2.0))
	var home: Transform3D = card.transform
	var axis := Vector3(1, 0, 0)
	check(CardMotion.settle_pose(home, axis, 0.0).is_equal_approx(home), "começa no lugar")
	check(CardMotion.settle_pose(home, axis, 1.0).is_equal_approx(home), "termina no lugar")
	var mid: Transform3D = CardMotion.settle_pose(home, axis, 0.2)
	check(mid.origin.y <= home.origin.y + 0.0001, "papel não quica: não sobe acima do lugar")
	check(home.origin.y - mid.origin.y < 0.01, "afunda só um tico")
	check(not mid.basis.is_equal_approx(home.basis), "inclina no meio")
	CardMotion.settle(card)
	await tree.create_timer(CardMotion.SETTLE_TIME + 0.15).timeout
	check(card.transform.is_equal_approx(home), "o pouso não muda a posição final")
	# Um voo novo no meio do pouso: o pouso desiste e deixa a carta onde o voo pôs.
	CardMotion.settle(card)
	await tree.create_timer(0.08).timeout
	var moved := Transform3D(Basis(), Vector3(-2, 0, 0))
	card.transform = moved
	await tree.create_timer(CardMotion.SETTLE_TIME).timeout
	check(card.transform.is_equal_approx(moved), "não briga com outro movimento")
	check_eq(CardMotion.hover_goal(Vector2(0, 1)).x > 0.0, true, "mouse embaixo: a borda de baixo afunda")
	check_eq(CardMotion.hover_goal(Vector2(1, 0)).y < 0.0, true, "mouse à direita: o lado direito afunda")
	check_eq(CardMotion.hover_goal(Vector2.ZERO), Vector2.ZERO, "no centro, plana")
	card.queue_free()
	Fx.quality = _quality
	done = true


func test_hover_tilts_only_the_drawing_of_a_card_node() -> void:
	done = false
	_quality = Fx.quality
	Fx.quality = 2
	var tree: SceneTree = Engine.get_main_loop()
	var card := CardNode.new()
	tree.root.add_child(card)
	var visual: Node3D = card.get("_visual")
	CardMotion.hover_tilt(card, Vector2(1, 1))
	await tree.create_timer(CardMotion.HOVER_TIME + 0.1).timeout
	check(visual.rotation.z < -0.1 and visual.rotation.x > 0.1, "o desenho inclina para o canto do mouse (%s)" % str(visual.rotation))
	check(card.transform.is_equal_approx(Transform3D()), "a carta (e a área do clique) fica no lugar")
	CardMotion.hover_tilt(card, Vector2.ZERO)
	await tree.create_timer(CardMotion.HOVER_TIME * 1.6 + 0.1).timeout
	check(visual.rotation.is_zero_approx(), "o mouse sai: volta ao plano")
	card.queue_free()
	Fx.quality = _quality
	done = true
