# Rastros e feixes (fx/trail_ribbon.gd, fx/card_trails.gd, fx/energy_beam.gd, fx/mana_orb.gd): a fita sai da borda de
# trás da carta e some sozinha, só as mudanças de zona deixam rastro, o feixe e a gota terminam e se apagam, e a carta
# moída pousa no lugar da de verdade, que fica escondida até o pouso.
extends "res://tests/test_case.gd"


func test_card_ribbon_leaves_from_the_back_edge_with_the_card_width() -> void:
	var edges: Array = TrailRibbon.card_edges(Transform3D.IDENTITY, Vector3(1, 0, 0), 1.0)
	var a: Vector3 = edges[0]
	var b: Vector3 = edges[1]
	check(a.x < -0.25 and b.x < -0.25, "a fita sai da borda de trás (atrás do movimento)")
	check(is_equal_approx(absf(a.z - b.z), CardNode.SIZE.y), "na largura da carta de través ao movimento (%.3f)" % absf(a.z - b.z))
	var turned: Array = TrailRibbon.card_edges(Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * 0.5), Vector3.ZERO), Vector3(0, 0, 1), 1.0)
	check(is_equal_approx(((turned[0] as Vector3) - (turned[1] as Vector3)).length(), CardNode.SIZE.x * 0.5), "a escala da carta encolhe a fita")


func test_ribbon_follows_and_frees_itself() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var card := Node3D.new()
	parent.add_child(card)
	var trail: TrailRibbon = TrailRibbon.card(parent, card, Color.WHITE, 0.4, 0.1)
	for i: int in 8:
		card.position.x += 0.12
		await tree.process_frame
	check((trail.mesh as ImmediateMesh).get_surface_count() == 1, "voando, a fita aparece")
	trail.emitting = false
	await tree.create_timer(0.3).timeout
	check(not is_instance_valid(trail), "parou de emitir: a fita some e se apaga")
	parent.queue_free()
	done = true


func test_only_zone_changes_leave_a_trail() -> void:
	var node := CardNode.new()
	check(CardTrails.travelling(node), "parada ou chegando à mão (sem voo de papel) conta")
	node.set("_flight", PaperPhysics.plan(Transform3D.IDENTITY, Transform3D(Basis.IDENTITY, Vector3(3, 0.03, 0)), true, 1))
	check(CardTrails.travelling(node), "o voo em arco (mudou de zona) deixa rastro")
	node.set("_flight", PaperPhysics.plan(Transform3D.IDENTITY, Transform3D(Basis.IDENTITY, Vector3(0.6, 0.03, 0)), false, 1))
	check(not CardTrails.travelling(node), "o escorregão no tampo (arrumação do campo) não")
	node.set("_flight", null)
	node.data = {"name": "Shock", "manaCost": "{R}"}
	check(CardTrails.tint(node).r > 0.9 and CardTrails.tint(node).b < 0.4, "de face, o rastro tem a cor da carta")
	node.data = {"name": "Shock", "manaCost": "{R}", "faceDown": true}
	check(CardTrails.tint(node).b > CardTrails.tint(node).r, "de costas, a cor do verso (azul por padrão)")
	node.free()


func test_beam_and_orb_finish_and_free_themselves() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var reached: Array = []
	var chain: EnergyBeam = EnergyBeam.chain(parent, Vector3(-1, 0.1, 0), Vector3(1, 0.1, 0), Color.GOLD, 0.1, func() -> void: reached.append("corrente"))
	var bolt: EnergyBeam = EnergyBeam.bolt(parent, Vector3(-1, 0.1, 0), Vector3(1, 0.1, 1), Color.PURPLE, 0.1, 0.05)
	var pillar: EnergyBeam = EnergyBeam.pillar(parent, Vector3.ZERO, 2.0, Color.GOLD, 0.1)
	check(chain.point_at(0.0).distance_to(Vector3(-1, 0.1, 0)) < 0.001 and chain.point_at(1.0).distance_to(Vector3(1, 0.1, 0)) < 0.001, "a corrente vai de um ponto ao outro")
	ManaOrb.launch(parent, Vector3(-2, 0.1, 0), Vector3(0, 1, 2), Color.GREEN, 0.15, func() -> void: reached.append("mana"))
	await tree.create_timer(0.9).timeout
	check(reached.has("corrente"), "a corrente avisa quando a ponta chega")
	check(reached.has("mana"), "a gota avisa quando se funde na carta")
	check(not is_instance_valid(chain) and not is_instance_valid(bolt) and not is_instance_valid(pillar), "os feixes se apagam sozinhos")
	await tree.create_timer(0.6).timeout
	check_eq(parent.get_child_count(), 0, "nada sobra das gotas e dos clarões")
	parent.queue_free()
	done = true


func test_milled_card_hands_over_to_the_real_one_on_the_pile() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var parent := Node3D.new()
	tree.root.add_child(parent)
	var real := CardNode.new()
	parent.add_child(real)
	var spot := Transform3D(Basis.IDENTITY, Vector3(-4.25, 0.01, 2.25))
	real.transform = spot
	var piles_info: Dictionary = {"scale": 1.0, "library_top": Vector3(-5.05, 0.17, 2.25), "base": Vector3(-4.25, 0, 2.25), "count": 1,
		"real": {77: {"node": real, "pose": spot}}}
	var length: float = CardFlights.mill(parent, null, Vector3(-5.05, 0, 2.25), Vector3(-4.25, 0, 2.25), [{"id": 77, "name": ""}], false, CardFlights.DEFAULT_SLEEVE, piles_info)
	await tree.process_frame
	check(not real.visible, "a carta de verdade fica escondida enquanto a temporária voa")
	await tree.create_timer(length + 0.1).timeout
	check(real.visible, "no pouso, a de verdade aparece no lugar")
	var temporary: int = 0
	for node: Node in parent.find_children("*", "CardNode", true, false):
		if node != real and not node.is_queued_for_deletion():
			temporary += 1
	check_eq(temporary, 0, "e a temporária sai")
	parent.queue_free()
	done = true


func test_pile_landing_sits_on_top_of_the_pile() -> void:
	var piles_info: Dictionary = {"scale": 1.0, "base": Vector3(2, 0, 1), "count": 10, "real": {}}
	var landing: Array = CardFlights._landing({"id": 5}, 0, 2, Vector3.ZERO, piles_info, true)
	var pose: FlightPieces.Pose = landing[0]
	var expected: Transform3D = PaperPhysics.pile_pose(Vector3(2, 0, 1), 1.0, 5, 10, 12)
	check(pose.pos.is_equal_approx(expected.origin), "pousa no alto do monte de 10, com a bagunça fixa do id")
	check(landing[1] == null, "sem carta de verdade, ninguém para esconder")
