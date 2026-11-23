# O toque das cartas na mesa: espera a carta que ainda voa pousar antes do efeito dela, a poeira de luz que se espalha
# rente ao feltro quando um terreno ou uma permanente pousa, e o grimório que cede um pouco quando alguém compra.
class_name TouchFx
extends RefCounted

## Mais que isto, o efeito toca mesmo com a carta ainda no ar (ela pode ter ido para outro lugar).
const MAX_WAIT := 0.75


## Roda `play` quando a carta pousar no lugar dela (já pousada: agora). A carta que sumiu no meio não toca.
static func when_landed(parent: Node, node: CardNode, play: Callable, max_wait: float = MAX_WAIT) -> void:
	if node == null or not is_instance_valid(node) or landed(node):
		play.call()
		return
	var waiter := _Waiter.new()
	waiter.card = weakref(node)
	waiter.play = play
	waiter.left = max_wait
	parent.add_child(waiter)


## A carta já encostou no lugar que a mesa deu a ela (CardNode.is_landed: o toque, antes do escorregão final).
static func landed(node: CardNode) -> bool:
	return node.is_landed()


## Poeira de luz que se espalha rente ao feltro a partir de `pos` (o pouso de um terreno, de uma permanente).
static func dust(parent: Node3D, pos: Vector3, color: Color, strength: float = 1.0) -> void:
	if Fx.quality == 0 and strength < 1.0:
		return
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 1.0
	particles.amount = maxi(6, int(22 * strength * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = 0.55
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(CardNode.SIZE.x * 0.5, 0.0, CardNode.SIZE.y * 0.5)
	process.direction = Vector3(1, 0.15, 0)
	process.spread = 180.0
	# Achatado: a poeira corre no plano do tampo, não sobe em bola.
	process.flatness = 0.85
	process.initial_velocity_min = 0.5 * strength
	process.initial_velocity_max = 1.3 * strength
	process.gravity = Vector3(0, -0.4, 0)
	process.damping_min = 2.5
	process.damping_max = 4.0
	process.scale_min = 0.04
	process.scale_max = 0.09
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lerp(Color.WHITE, 0.5), 0.55))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = Fx._spark()
	particles.position = Vector3(pos.x, 0.04, pos.z)
	parent.add_child(particles)
	particles.emitting = true
	parent.get_tree().create_timer(0.9).timeout.connect(particles.queue_free)


## Comprou: o grimório cede um pouco (a carta de cima saiu) e uma luz fraca pisca nele. Na sua compra, um pouco mais.
static func draw(parent: Node3D, pile: CardNode, at: Vector3, mine: bool) -> void:
	if pile and is_instance_valid(pile):
		pile.jolt(0.02 if mine else 0.012)
	if mine:
		Fx.burst(parent, at + Vector3(0, 0.25, 0), Color(0.8, 0.9, 1.0), 8, 0.6, 0.35, 0.06)
		Fx.light(parent, at, Color(0.75, 0.85, 1.0), 1.2, 2.0, 0.25)


## Espera a carta pousar e roda o efeito (ou desiste quando ela some, ou roda mesmo assim depois de `left` segundos).
class _Waiter:
	extends Node
	var card: WeakRef
	var play: Callable
	var left: float = MAX_WAIT

	func _process(delta: float) -> void:
		var node: CardNode = card.get_ref() as CardNode
		if node == null or node.is_queued_for_deletion():
			queue_free()
			return
		left -= delta
		if left <= 0.0 or TouchFx.landed(node):
			queue_free()
			play.call()
