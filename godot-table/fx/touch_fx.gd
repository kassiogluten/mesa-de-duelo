# O toque das cartas na mesa: espera a carta que ainda voa pousar antes do efeito dela, a poeira de luz que se espalha
# rente ao feltro quando uma carta pousa, o grimório que cede e acende a borda quando alguém compra, e o grimório
# remexido e aceso da busca.
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


## Comprou: o grimório cede um pouco (a carta de cima saiu), a borda dele acende num fio de luz que se abre e some, e
## uns fiapos de luz saem da borda. Na sua compra, um pouco mais (e um clarão fraco).
static func draw(parent: Node3D, pile: CardNode, at: Vector3, mine: bool) -> void:
	var top: Vector3 = pile_top(pile, at)
	if pile and is_instance_valid(pile):
		pile.jolt(0.02 if mine else 0.012)
		var edge: ShaderMaterial = _pile_glow(parent, pile, top, Color(0.8, 0.9, 1.0), 0.45)
		var tween: Tween = _glow_tween(edge)
		if tween:
			tween.tween_method(func(v: float) -> void: edge.set_shader_parameter("outline", v), 0.0, 0.022, 0.34).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
			tween.tween_method(func(v: float) -> void: edge.set_shader_parameter("outline_alpha", v), 0.95 if mine else 0.55, 0.0, 0.38).set_ease(Tween.EASE_IN)
	FlightPieces.flutter(parent, top, Color(0.82, 0.9, 1.0), 4 if mine else 2)
	if mine:
		Fx.light(parent, at, Color(0.75, 0.85, 1.0), 1.0, 2.0, 0.25)


## Remexendo no grimório (a busca): a borda do monte acende, duas luzes dão a volta nele, o monte treme e solta fiapos
## de luz, durante `duration`. Sem `pile`, só a luz e os fiapos em `top`.
static func rummage(parent: Node3D, pile: CardNode, top: Vector3, color: Color, duration: float) -> void:
	var glow: ShaderMaterial = _pile_glow(parent, pile, top, color, duration + 0.4)
	var tween: Tween = _glow_tween(glow)
	if tween:
		tween.tween_method(func(v: float) -> void: glow.set_shader_parameter("trace", v), 0.0, 1.5, duration + 0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tween.tween_method(func(v: float) -> void: glow.set_shader_parameter("trace_alpha", v), 1.3, 0.0, duration + 0.35).set_ease(Tween.EASE_IN)
		tween.tween_method(func(v: float) -> void: glow.set_shader_parameter("outline_alpha", v), 0.8, 0.0, duration + 0.3).set_ease(Tween.EASE_IN)
		tween.tween_method(func(v: float) -> void: glow.set_shader_parameter("under", v), 0.7, 0.0, duration + 0.35).set_ease(Tween.EASE_IN)
		glow.set_shader_parameter("outline", 0.012)
	if pile and is_instance_valid(pile):
		pile.jolt(0.018)
		var ref: WeakRef = weakref(pile)
		MomentPieces.after(parent, duration * 0.5, func() -> void:
			var again: CardNode = ref.get_ref() as CardNode
			if again:
				again.jolt(0.024))
	for i: int in 2:
		MomentPieces.after(parent, i * duration * 0.45, func() -> void: FlightPieces.flutter(parent, top, color, 4))
	Fx.light(parent, top, color, 1.6, 2.8, duration + 0.2)


## O alto do grimório `pile` (a face de cima do monte, pela espessura dele); sem o monte, um pouco acima de `fallback`.
static func pile_top(pile: CardNode, fallback: Vector3) -> Vector3:
	if pile == null or not is_instance_valid(pile) or not pile.is_inside_tree():
		return fallback + Vector3(0, 0.2, 0)
	var depth: Variant = pile.get("_depth")
	var scale: float = pile.global_basis.get_scale().x
	return pile.global_position + Vector3(0, (float(depth) if depth != null else 0.1) * scale, 0)


## Uma camada de luz no formato da carta deitada sobre o alto do monte (o mesmo brilho do CardGlow), que se apaga
## sozinha depois de `life`; null sem o monte.
static func _pile_glow(parent: Node3D, pile: CardNode, top: Vector3, color: Color, life: float) -> ShaderMaterial:
	if pile == null or not is_instance_valid(pile) or not pile.is_inside_tree():
		return null
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = CardNode.SIZE + Vector2(CardGlow.PAD, CardGlow.PAD) * 2.0
	mesh.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = CardGlow.SHADER
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("card", CardNode.SIZE)
	material.set_shader_parameter("pad", CardGlow.PAD)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mesh)
	mesh.global_transform = Transform3D(Basis.from_scale(Vector3.ONE * pile.global_basis.get_scale().x), top + Vector3(0, 0.003, 0))
	mesh.get_tree().create_timer(life).timeout.connect(mesh.queue_free)
	material.set_meta("mesh", weakref(mesh))
	return material


static func _glow_tween(material: ShaderMaterial) -> Tween:
	if material == null:
		return null
	var mesh: MeshInstance3D = (material.get_meta("mesh") as WeakRef).get_ref() as MeshInstance3D
	return mesh.create_tween().set_parallel(true) if mesh else null


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
