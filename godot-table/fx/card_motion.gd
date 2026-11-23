# Física leve das cartas fora do voo: o assentar de papel (um tapa rente, sem quique), o empurrãozinho na carta de baixo
# do monte e a inclinação 3D para o lado do mouse na carta sob ele. O voo e o pouso ficam em table/paper_physics.gd.
class_name CardMotion
extends RefCounted

## Assentar: duração, quanto a carta afunda (o ar saindo de baixo) e o balanço máximo (com força 1).
const SETTLE_TIME := 0.3
const SETTLE_DIP := 0.004
const SETTLE_TILT := 0.022
## Empurrãozinho: quanto a carta de baixo escorrega (unidades da carta) e gira no máximo, e em quanto tempo.
const NUDGE := 0.014
const NUDGE_TWIST := 0.035
const NUDGE_TIME := 0.2
## Mouse: inclinação máxima em cada eixo (radianos) e o tempo para chegar nela.
const HOVER_TILT := 0.16
const HOVER_TIME := 0.12


## A carta acabou de encostar: afunda um tico e balança pouco em volta de um eixo fixo pelo id (papel não quica).
## Termina exatamente no transform que ela tinha ao chamar; se outra coisa mexer na carta no meio (um voo novo), o
## assentar desiste e não briga.
static func settle(node: Node3D, strength: float = 1.0) -> void:
	if node == null or not node.is_inside_tree() or strength <= 0.0 or Fx.quality == 0:
		return
	var old: Tween = node.get_meta("card_motion_settle") as Tween if node.has_meta("card_motion_settle") else null
	if old and old.is_valid():
		old.kill()
	var home: Transform3D = node.transform
	var id: int = (node as CardNode).card_id if node is CardNode else node.get_instance_id()
	var angle: float = PaperPhysics.hash01(id, 11) * TAU
	var axis := Vector3(cos(angle), 0.0, sin(angle))
	var written: Array[Transform3D] = [home]
	var tween: Tween = node.create_tween()
	node.set_meta("card_motion_settle", tween)
	tween.tween_method(func(t: float) -> void:
		if not node.transform.is_equal_approx(written[0]):
			tween.kill()
			return
		var current: Transform3D = settle_pose(home, axis, t, strength)
		node.transform = current
		written[0] = current, 0.0, 1.0, SETTLE_TIME)
	tween.tween_callback(func() -> void:
		if node.transform.is_equal_approx(written[0]):
			node.transform = home)


## A pose do assentar no instante `t` (0 a 1): afunda e volta (nunca sobe acima de `home`) e balança cada vez menos em
## volta de `axis` (deitado no tampo). Em t = 0 e t = 1 é exatamente `home`.
static func settle_pose(home: Transform3D, axis: Vector3, t: float, strength: float = 1.0) -> Transform3D:
	if t <= 0.0 or t >= 1.0:
		return home
	var scale: float = home.basis.get_scale().x
	var dip: float = -SETTLE_DIP * strength * scale * sin(PI * clampf(t / 0.35, 0.0, 1.0))
	var tilt: float = SETTLE_TILT * strength * exp(-5.0 * t) * (1.0 - t) * sin(t * PI * 4.0)
	var basis: Basis = Basis(axis.normalized(), tilt) * home.basis
	return Transform3D(basis, home.origin + Vector3(0.0, dip, 0.0))


## Quem pousou em cima empurra a carta de baixo: escorrega um tico na direção `dir` (no tampo), gira um nada e o atrito
## segura ali (não volta: o monte fica do jeito que ficou). `id` fixa o giro; desiste se outra coisa mexer na carta.
static func nudge(node: Node3D, dir: Vector3, strength: float = 1.0, id: int = 0) -> void:
	if node == null or not node.is_inside_tree() or Fx.quality == 0 or strength <= 0.0:
		return
	var home: Transform3D = node.transform
	var flat := Vector3(dir.x, 0, dir.z)
	if flat.length() < 0.01:
		var angle: float = PaperPhysics.hash01(id, 6) * TAU
		flat = Vector3(cos(angle), 0, sin(angle))
	var push: Vector3 = nudge_offset(flat, strength, home.basis.get_scale().x)
	var twist: float = PaperPhysics.signed(id, 9) * NUDGE_TWIST * strength
	var written: Array[Transform3D] = [home]
	var tween: Tween = node.create_tween()
	tween.tween_method(func(t: float) -> void:
		if not node.transform.is_equal_approx(written[0]):
			tween.kill()
			return
		var k: float = PaperPhysics.travel(t)
		var current := Transform3D(Basis(Vector3.UP, twist * k) * home.basis, home.origin + push * k)
		node.transform = current
		written[0] = current, 0.0, 1.0, NUDGE_TIME)


## Quanto o empurrãozinho leva a carta (no tampo, na direção de `dir`).
static func nudge_offset(dir: Vector3, strength: float, scale: float) -> Vector3:
	var flat := Vector3(dir.x, 0, dir.z)
	return flat.normalized() * NUDGE * scale * strength if flat.length() > 0.0001 else Vector3.ZERO


## Inclina a carta para o lado do mouse: `local_point` é onde o mouse está na carta, de (-1, -1) no canto de cima à
## esquerda a (1, 1) no de baixo à direita; o lado sob o mouse afunda, como apertar a carta com o dedo. Vector2.ZERO
## volta a carta ao plano (chame ao sair o mouse). Numa CardNode inclina só o desenho, não a área do clique nem o lugar.
static func hover_tilt(node: Node3D, local_point: Vector2) -> void:
	var target: Node3D = _visual_of(node)
	if target == null or not target.is_inside_tree():
		return
	var point: Vector2 = local_point.clamp(Vector2(-1, -1), Vector2(1, 1))
	if Fx.quality == 0:
		point = Vector2.ZERO
	# Plano da carta é XZ (cima da carta em -Z): girar em X afunda a borda de cima ou de baixo, girar em Z a de um lado.
	var goal := Vector3(point.y * HOVER_TILT, target.rotation.y, -point.x * HOVER_TILT)
	var old: Tween = target.get_meta("card_motion_hover") as Tween if target.has_meta("card_motion_hover") else null
	if old and old.is_valid():
		old.kill()
	var tween: Tween = target.create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	target.set_meta("card_motion_hover", tween)
	tween.tween_property(target, "rotation", goal, HOVER_TIME * (1.6 if point == Vector2.ZERO else 1.0))


## A inclinação que hover_tilt busca para um ponto (para conferir sem esperar o tween).
static func hover_goal(local_point: Vector2) -> Vector2:
	var point: Vector2 = local_point.clamp(Vector2(-1, -1), Vector2(1, 1))
	return Vector2(point.y * HOVER_TILT, -point.x * HOVER_TILT)


## O nó que inclina: o desenho da CardNode (o primeiro filho Node3D, que sobe na mão) ou o próprio nó.
static func _visual_of(node: Node3D) -> Node3D:
	if node == null:
		return null
	if node is CardNode:
		var visual: Variant = node.get("_visual")
		if visual is Node3D:
			return visual
	return node
