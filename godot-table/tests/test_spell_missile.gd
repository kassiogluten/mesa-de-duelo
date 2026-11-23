# Projétil das mágicas com alvo: o estilo sai da cor da carta, o tempo de voo cresce com a distância e ele chega ao alvo.
extends "res://tests/test_case.gd"


func test_style_follows_the_card_color() -> void:
	check_eq(SpellMissile.style_of({"manaCost": "{R}"}), SpellMissile.STYLES["fire"], "vermelha é fogo")
	check_eq(SpellMissile.style_of({"manaCost": "{1}{U}"}), SpellMissile.STYLES["arcane"], "azul é arcano")
	check_eq(SpellMissile.style_of({"manaCost": "{B}{B}"}), SpellMissile.STYLES["shadow"], "preta é sombra")
	check_eq(SpellMissile.style_of({"manaCost": "{W}"}), SpellMissile.STYLES["radiant"], "branca é radiante")
	check_eq(SpellMissile.style_of({"manaCost": "{G}"}), SpellMissile.STYLES["nature"], "verde é natureza")
	check_eq(SpellMissile.style_of({"manaCost": "{3}"}), SpellMissile.STYLES["energy"], "incolor é energia")
	check_eq(SpellMissile.style_of({}), SpellMissile.STYLES["energy"], "sem custo é energia")
	var mixed: Dictionary = SpellMissile.style_of({"manaCost": "{U}{R}"})
	check_eq(mixed["tail"], SpellMissile.STYLES["fire"]["color"], "multicolorida: a cauda na segunda cor")
	check_eq(mixed["rough"], SpellMissile.STYLES["arcane"]["rough"], "multicolorida: o jeito da primeira cor")


func test_travel_time_grows_with_distance() -> void:
	var near: float = SpellMissile.travel_time(Vector3.ZERO, Vector3(0, 0, 1))
	var far: float = SpellMissile.travel_time(Vector3.ZERO, Vector3(0, 0, 6))
	check(far > near, "mais longe leva mais tempo")
	check(far < 0.8, "nunca demora demais")
	check(SpellMissile.travel_time(Vector3.ZERO, Vector3(0, 0, 6), 2.0) < far, "mais rápido com a velocidade dos efeitos")


func test_missile_hits_and_calls_back() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var hits: Array = [0]
	var missile: SpellMissile = SpellMissile.launch(parent, Vector3.ZERO, Vector3(0, 0, -3), {"manaCost": "{R}"}, func() -> void: hits[0] += 1, 2.0)
	await tree.create_timer(SpellMissile.travel_time(Vector3.ZERO, Vector3(0, 0, -3), 2.0) + 0.2).timeout
	check_eq(hits[0], 1, "o impacto chama de volta uma vez")
	check(is_instance_valid(missile), "o projétil espera o rastro se apagar")
	await tree.create_timer(1.0).timeout
	check(not is_instance_valid(missile), "e depois some")
	parent.queue_free()
	done = true
