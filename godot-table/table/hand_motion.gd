# Movimentos da mão: a carta comprada voando do grimório até o lugar dela no leque (virando no ar) e a pose da carta
# arrastada (deita ao chegar no campo e inclina para o lado em que vai, como se tivesse peso).
class_name HandMotion
extends RefCounted

const ARRIVE_TIME := 0.62
## Entre uma carta e a seguinte quando várias chegam juntas (a mão inicial).
const ARRIVE_STAGGER := 0.075
## Quanto a carta sobe no meio do voo.
const ARRIVE_LIFT := 1.5
## Arrasto: inclinação máxima (radianos), por px/s do mouse, e o quanto ela encolhe ao deitar no campo.
const DRAG_TILT_MAX := 0.32
const DRAG_TILT_PER_PX := 0.00032


## A carta voa de `from` (o grimório; `flip` = sai de costas e vira no ar) até `to`, depois de `delay` segundos.
## Termina exatamente em `to`; se outra coisa mexer na carta no meio (um estado novo), o voo desiste e não briga.
static func fly_in(node: Node3D, from: Transform3D, to: Transform3D, flip: bool, delay: float) -> void:
	if node == null or not node.is_inside_tree():
		return
	var q0: Quaternion = from.basis.get_rotation_quaternion()
	var q1: Quaternion = to.basis.get_rotation_quaternion()
	var s0: float = from.basis.get_scale().x
	var s1: float = to.basis.get_scale().x
	var p0: Vector3 = from.origin
	var p2: Vector3 = to.origin
	var p1: Vector3 = p0.lerp(p2, 0.5) + Vector3(0, ARRIVE_LIFT, 0)
	var start: Transform3D = arrive_pose(q0, q1, s0, s1, p0, p1, p2, flip, 0.0)
	node.transform = start
	var written: Array[Transform3D] = [start]
	var tween: Tween = node.create_tween()
	if delay > 0.0:
		tween.tween_interval(delay)
	tween.tween_method(func(t: float) -> void:
		if not node.transform.is_equal_approx(written[0]):
			tween.kill()
			return
		var current: Transform3D = arrive_pose(q0, q1, s0, s1, p0, p1, p2, flip, t)
		node.transform = current
		written[0] = current, 0.0, 1.0, ARRIVE_TIME)
	tween.tween_callback(func() -> void:
		if node.transform.is_equal_approx(written[0]):
			node.transform = to
			CardMotion.settle(node, 0.35))


## A pose do voo no instante `t` (0 a 1): curva pelo alto, girando de `q0` para `q1`; com `flip`, sai de costas e
## termina de virar antes de chegar (para dar tempo de ver a carta).
static func arrive_pose(q0: Quaternion, q1: Quaternion, s0: float, s1: float, p0: Vector3, p1: Vector3, p2: Vector3, flip: bool, t: float) -> Transform3D:
	var e: float = ease(clampf(t, 0.0, 1.0), -1.8)
	var pos: Vector3 = p0.lerp(p1, e).lerp(p1.lerp(p2, e), e)
	var basis := Basis(q0.slerp(q1, e))
	if flip:
		var turned: float = clampf(e / 0.7, 0.0, 1.0)
		basis = basis * Basis(Vector3.FORWARD, PI * (1.0 - ease(turned, -2.0)))
	return Transform3D(basis.scaled(Vector3.ONE * lerpf(s0, s1, e)), pos)


## Inclinação da carta arrastada pela velocidade do mouse (px/s): x gira em volta do eixo de lado (para cima, a borda
## de cima afunda), z em volta do eixo do comprimento (para a direita, a borda direita afunda). `rise` (0 na mão, 1 no
## campo) dá o tamanho: um pouco maior na mão, o da mesa ao deitar.
static func drag_tilt(velocity: Vector2, rise: float) -> Vector3:
	var x: float = clampf(velocity.y * DRAG_TILT_PER_PX, -DRAG_TILT_MAX, DRAG_TILT_MAX)
	var z: float = clampf(-velocity.x * DRAG_TILT_PER_PX, -DRAG_TILT_MAX, DRAG_TILT_MAX)
	return Vector3(x, z, lerpf(1.3, 1.22, clampf(rise, 0.0, 1.0)))
