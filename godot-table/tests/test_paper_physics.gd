# Física de papel: montes com espessura e bagunça fixa por id, voo que freia e chega nivelado sem quicar nem atravessar
# o tampo, descolar pela borda, virar no lugar, sombra de contato e o pouso da CardNode (toque, empurrãozinho, aura).
extends "res://tests/test_case.gd"

var _quality: int = 2


func test_piles_have_thickness_and_a_fixed_mess_per_card() -> void:
	var base := Vector3(-4.25, 0, 2.25)
	var a: Transform3D = PaperPhysics.pile_pose(base, 1.0, 160, 0, 3)
	check(a.is_equal_approx(PaperPhysics.pile_pose(base, 1.0, 160, 0, 3)), "a mesma carta cai sempre igual (o estado novo não mexe)")
	check(not a.basis.is_equal_approx(PaperPhysics.pile_pose(base, 1.0, 161, 0, 3).basis), "cada carta tem o seu giro")
	var flat := Vector2(a.origin.x - base.x, a.origin.z - base.z)
	check(flat.length() <= PaperPhysics.PILE_JITTER * 1.5, "a bagunça é pequena (%s)" % str(flat))
	var step: float = PaperPhysics.pile_step(3)
	for i: int in 3:
		var below: Transform3D = PaperPhysics.pile_pose(base, 0.8, 200 + i, i, 3)
		var above: Transform3D = PaperPhysics.pile_pose(base, 0.8, 201 + i, i + 1, 3)
		# A face de baixo da carta de cima (face − espessura) fica na face da de baixo: encosta, não atravessa.
		check(is_equal_approx(above.origin.y - step * 0.8, below.origin.y), "a carta %d apoia na de baixo" % (i + 1))
	var top: Vector3 = PaperPhysics.pile_top(base, 0.8, 3)
	check(is_equal_approx(top.y, PaperPhysics.pile_pose(base, 0.8, 202, 2, 3).origin.y), "o alto do monte é a face da última")
	check(PaperPhysics.pile_step(120) < PaperPhysics.pile_step(10), "monte enorme: cartas mais finas")
	check(is_equal_approx(PaperPhysics.pile_step(120) * 120, PaperPhysics.PILE_STEP * PaperPhysics.PILE_CAP), "e a altura para no teto")
	var library: Array = PaperPhysics.library_pose(base, 1.0, 40)
	var lt: Transform3D = library[0]
	check(lt.basis.y.y < -0.99, "o grimório fica de costas")
	check(is_equal_approx(lt.origin.y, PaperPhysics.PILE_BASE), "apoiado no tampo, não flutuando")
	check(is_equal_approx(lt.origin.y + float(library[1]), PaperPhysics.pile_top(base, 1.0, 40).y), "e o alto dele é o alto do monte")


func test_an_arc_flight_brakes_levels_out_and_slides_without_bouncing() -> void:
	var from := Transform3D(Basis.IDENTITY, Vector3(0.3, 0.023, 0.95))
	var to := Transform3D(Basis(Vector3.UP, 0.05), Vector3(-4.2, 0.02, 2.2))
	var f: PaperPhysics.Flight = PaperPhysics.plan(from, to, true, 105)
	check_eq(f.kind, PaperPhysics.Kind.ARC, "mudança de zona é em arco")
	check(f.pose(0.0).is_equal_approx(from), "começa onde estava")
	check(f.pose(f.total).is_equal_approx(to), "termina exatamente no lugar")
	check(f.touch_time < f.duration and f.duration < f.total, "encosta, escorrega e assenta, nessa ordem")
	var touch: Transform3D = f.pose(f.touch_time)
	check(touch.basis.y.normalized().y > 0.995, "encosta nivelada (o colchão de ar)")
	var left: float = Vector2(touch.origin.x - to.origin.x, touch.origin.z - to.origin.z).length()
	check(left > 0.01 and left < 0.06, "e ainda escorrega uns milímetros (%.3f)" % left)
	var lowest: float = INF
	var highest: float = -INF
	var dt: float = 1.0 / 120.0
	var t: float = 0.0
	while t < f.total:
		var y: float = f.pose(t).origin.y
		lowest = minf(lowest, y)
		if t > f.touch_time:
			highest = maxf(highest, y)
		t += dt
	check(lowest >= to.origin.y - PaperPhysics.SLAP_DIP - 0.0001, "nunca afunda no tampo (%.4f)" % lowest)
	check(highest <= to.origin.y + 0.0001, "depois de encostar não sobe de novo: papel não quica (%.4f)" % highest)
	var mid_speed: float = f.pose(f.duration * 0.35).origin.distance_to(f.pose(f.duration * 0.35 + dt).origin)
	var end_speed: float = f.pose(f.touch_time - dt).origin.distance_to(f.pose(f.touch_time).origin)
	check(end_speed < mid_speed * 0.4, "o ar freia a chegada")
	# Descolar: logo no começo a borda da frente (para o cemitério, à esquerda) sobe e a de trás fica no tampo.
	var early: Transform3D = f.pose(PaperPhysics.PEEL_LEAD)
	var front: Vector3 = early * Vector3(-CardNode.SIZE.x / 2.0, 0, 0)
	var back: Vector3 = early * Vector3(CardNode.SIZE.x / 2.0, 0, 0)
	check(front.y > back.y + 0.05, "descola pela borda da frente (%.3f / %.3f)" % [front.y, back.y])
	check(back.y >= from.origin.y - 0.005, "a borda de trás não entra no tampo")
	var again: PaperPhysics.Flight = PaperPhysics.plan(from, to, true, 105)
	check(again.pose(0.3).is_equal_approx(f.pose(0.3)), "o mesmo voo para a mesma carta")


func test_tapping_turns_in_place_with_a_tiny_lift() -> void:
	var from := Transform3D(Basis.IDENTITY, Vector3(1, 0.023, 1))
	var to := Transform3D(Basis(Vector3.UP, -PI / 2.0), Vector3(1, 0.023, 1))
	var f: PaperPhysics.Flight = PaperPhysics.plan(from, to, false, 104)
	check_eq(f.kind, PaperPhysics.Kind.TURN, "virar é girar no lugar")
	var top: float = -INF
	for i: int in 40:
		var p: Transform3D = f.pose(f.total * i / 40.0)
		top = maxf(top, p.origin.y)
		check(Vector2(p.origin.x - 1, p.origin.z - 1).length() < 0.001, "gira em volta do centro")
	check(top > from.origin.y and top < from.origin.y + 0.03, "sobe só um tico (%.4f)" % (top - from.origin.y))
	check(f.pose(f.total).is_equal_approx(to), "termina virada")
	var quarter: float = f.q0.angle_to(f.pose(f.duration * 0.5).basis.get_rotation_quaternion())
	check(quarter > PI / 4.0, "o atrito freia no fim: metade do tempo, mais da metade do giro")


func test_contact_shadow_tightens_near_the_table_and_softens_up_high() -> void:
	var low: Array = PaperPhysics.contact_shadow(Vector3(2, 0, 2), 0.0)
	var high: Array = PaperPhysics.contact_shadow(Vector3(2, 0, 2), 0.5)
	check(is_equal_approx(float(low[0]), 1.0) and is_equal_approx(float(low[1]), 1.0), "rente: do tamanho da carta e escura")
	check(float(high[0]) > 1.3 and float(high[1]) < 0.5, "no alto: maior e mais clara")
	check(float(PaperPhysics.contact_shadow(Vector3.ZERO, 2.0)[1]) == 0.0, "bem alto, some")
	check((high[2] as Vector3).x > 0.0, "e se afasta da luz")


func test_card_lands_once_nudges_the_pile_and_tucks_under_its_host() -> void:
	done = false
	_quality = Fx.quality
	Fx.quality = 2
	var tree: SceneTree = Engine.get_main_loop()
	var holder := Node3D.new()
	tree.root.add_child(holder)
	var under := CardNode.new()
	holder.add_child(under)
	under.card_id = 1
	under.move_to(PaperPhysics.pile_pose(Vector3.ZERO, 1.0, 1, 0, 2))
	var card := CardNode.new()
	holder.add_child(card)
	card.card_id = 2
	card.move_to(Transform3D(Basis.IDENTITY, Vector3(3, 0.023, 1)))
	var landed: Array = []
	card.landed.connect(func(c: CardNode) -> void: landed.append(c))
	var target: Transform3D = PaperPhysics.pile_pose(Vector3.ZERO, 1.0, 2, 1, 2)
	card.move_to(target, true, under)
	check(not card.is_landed(), "voando, ainda não pousou")
	check(card.target_transform().is_equal_approx(target), "sabe para onde vai")
	var before: Transform3D = under.transform
	await tree.create_timer(1.0).timeout
	check_eq(landed.size(), 1, "avisa o toque uma vez")
	check(card.is_landed() and card.transform.is_equal_approx(target), "pousou no lugar")
	check(not under.transform.is_equal_approx(before), "a de baixo levou o empurrãozinho")
	check(under.transform.origin.distance_to(before.origin) < 0.03, "um tico só")
	# A aura: o caminho passa por trás da criatura e chega de lá.
	var host := CardNode.new()
	holder.add_child(host)
	host.move_to(Transform3D(Basis.IDENTITY, Vector3(0, 0.023, 0)))
	var aura := CardNode.new()
	holder.add_child(aura)
	aura.move_to(Transform3D(Basis.IDENTITY, Vector3(0, 3.2, 4.4)))
	aura.move_to(Transform3D(Basis.IDENTITY, Vector3(0.14, 0.02, -0.1)), true)
	aura.tuck_under(host)
	await tree.create_timer(0.3).timeout
	check(aura.transform.origin.z < -0.1 or aura.transform.origin.y > 0.1, "passa por cima e por trás, não pela frente da criatura")
	await tree.create_timer(0.7).timeout
	check(aura.transform.origin.is_equal_approx(Vector3(0.14, 0.02, -0.1)), "e termina presa atrás dela")
	holder.queue_free()
	Fx.quality = _quality
	done = true
