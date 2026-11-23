# Ritmo e toque dos efeitos: a fila entre estados que chegam juntos, o número do dano (cor e texto), a carta que espera
# pousar e o laboratório tocando os efeitos principais sem erro e sem deixar nó para trás.
extends "res://tests/test_case.gd"


func test_effects_of_a_burst_of_states_wait_but_never_lag_far() -> void:
	check_eq(FxDirector.queue_lag(0.0, 5.0), 0.0, "sem fila, começa já")
	check(is_equal_approx(FxDirector.queue_lag(5.3, 5.0), 0.3), "espera o efeito anterior terminar")
	check_eq(FxDirector.queue_lag(9.0, 5.0), FxDirector.MAX_LAG, "nunca mais que o atraso máximo")
	check(is_equal_approx(FxDirector.queue_lag(9.0, 5.0, 0.25), FxDirector.MAX_LAG * 4.0), "em câmera lenta, na mesma proporção")


func test_damage_number_color_and_text_follow_the_kind() -> void:
	check_eq(DamageNumber.color_for({"combat": true}, Color.BLUE), DamageNumber.COMBAT, "combate em laranja-vermelho")
	check_eq(DamageNumber.color_for({"infect": true, "combat": true}, Color.BLUE), DamageNumber.POISON, "veneno em verde")
	var spell: Color = DamageNumber.color_for({}, Color(0.35, 0.65, 1.0))
	check(spell.b > 0.6 and spell.r > 0.5, "mágica azul puxa para a cor dela, ainda quente")
	check_eq(DamageNumber.text_for({}, 3), "-3", "o dano")
	check_eq(DamageNumber.text_for({"infect": true}, 2), "2 veneno", "o veneno")


func test_a_flying_card_is_not_landed_until_it_arrives() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var holder := Node3D.new()
	tree.root.add_child(holder)
	var card := CardNode.new()
	holder.add_child(card)
	card.move_to(Transform3D.IDENTITY)
	check(TouchFx.landed(card), "a carta posta no lugar já pousou")
	card.move_to(Transform3D(Basis.IDENTITY, Vector3(3, 0, 0)), true)
	check(not TouchFx.landed(card), "voando, ainda não")
	var played: Array = []
	TouchFx.when_landed(holder, card, func() -> void: played.append(true))
	check(played.is_empty(), "o efeito espera o pouso")
	await tree.create_timer(0.8).timeout
	check(TouchFx.landed(card), "chegou")
	check_eq(played.size(), 1, "e o efeito tocou uma vez")
	holder.queue_free()
	done = true


## Os botões principais do laboratório (dano, golpe, entrada, morte, anulada…) tocam sem erro e os efeitos se apagam.
func test_the_lab_plays_the_main_effects() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var lab := EffectsLab.new()
	tree.root.add_child(lab)
	await tree.process_frame
	var before: int = lab.fx.get_child_count()
	for name: String in ["Dano de mágica", "Golpe de combate", "Golpe enorme (12)", "Ganho de vida", "Mágica conjurada", "Habilidade",
			"Entrada", "Entrada lendária", "Destruída", "Exilada", "Ataque", "Bloqueio", "Anulada"]:
		lab.reset()
		lab.press(name)
		for i: int in 8:
			await tree.process_frame
	await tree.create_timer(4.5).timeout
	check(lab.fx.get_child_count() <= before + 2, "os efeitos se apagam sozinhos (%d → %d nós)" % [before, lab.fx.get_child_count()])
	check(is_equal_approx(lab.table.camera.h_offset, 0.0) and is_equal_approx(lab.table.camera.v_offset, 0.0), "a câmera volta ao centro")
	check_eq(lab.table.camera.position, TableView.CAMERA_POS, "e ao lugar")
	lab.queue_free()
	done = true
