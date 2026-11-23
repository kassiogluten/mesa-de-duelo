# Exílio como portal: abre um redemoinho no tampo sob a carta, a carta sobe um pouco, gira em espiral para o centro e afunda
# na mesa (o tampo esconde o que já entrou), partículas são sugadas pela espiral e o portal se fecha com uma implosão.
class_name ExilePortal
extends RefCounted

const SHADER := preload("res://fx/exile_portal.gdshader")
const COLOR := Color(0.55, 0.78, 1.0)
const DEEP := Color(0.4, 0.18, 0.75)
## Raio do portal aberto (um pouco maior que a carta).
const RADIUS := 0.62


## Leva `node` para dentro de um portal aberto no tampo embaixo dele e o apaga no fim.
static func swallow(parent: Node3D, node: CardNode, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	speed = maxf(speed, 0.1)
	# P/T, nome e selos saem já: girando dentro do redemoinho eles ficariam soltos no ar.
	for child: Node in node.find_children("*", "Label3D", true, false):
		(child as Label3D).visible = false
	for child: Node in node.find_children("*", "Sprite3D", true, false):
		(child as Sprite3D).visible = false
	var start: Transform3D = node.global_transform
	var center := Vector3(start.origin.x, 0.012, start.origin.z)
	var portal: ShaderMaterial = _portal(parent, center)
	var open_time: float = 0.22 / speed
	var lift_time: float = 0.14 / speed
	var dive_time: float = 0.62 / speed
	var close_time: float = 0.28 / speed
	var weak_portal: WeakRef = weakref(portal.get_meta("mesh"))
	# O portal abre.
	var opening := (portal.get_meta("mesh") as Node).create_tween()
	opening.tween_method(func(v: float) -> void: portal.set_shader_parameter("open", v), 0.0, 1.0, open_time).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_inward_motes(parent, center, open_time + lift_time + dive_time)
	Fx.light(parent, center + Vector3(0, 0.3, 0), COLOR, 3.0, 3.0, open_time + lift_time + dive_time)
	# A carta: sobe um pouco, depois gira em espiral até o centro e afunda abaixo do tampo, encolhendo.
	var basis0: Basis = start.basis
	var offset := Vector3(start.origin.x - center.x, 0.0, start.origin.z - center.z)
	var spin_dir: float = 1.0 if (node.card_id % 2) == 0 else -1.0
	var motion := node.create_tween()
	motion.tween_method(func(t: float) -> void:
		node.global_transform = Transform3D(basis0, start.origin + Vector3(0, sin(t * PI * 0.5) * 0.18, 0)), 0.0, 1.0, lift_time).set_delay(open_time * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	motion.tween_method(func(t: float) -> void:
		var e: float = t * t
		var angle: float = spin_dir * (e * TAU * 1.6)
		var radius: float = 1.0 - e
		var around: Vector3 = offset.rotated(Vector3.UP, angle) * radius
		# Desce devagar no começo e mergulha no fim (passa de -0.6: o tampo esconde a carta inteira).
		var y: float = lerpf(start.origin.y + 0.18, -0.65, ease(t, 2.4))
		var shrink: float = lerpf(1.0, 0.55, e)
		# Inclina para dentro do redemoinho enquanto gira.
		var tilt := Basis(Vector3.RIGHT.rotated(Vector3.UP, angle), deg_to_rad(18.0) * sin(t * PI))
		var spun: Basis = Basis(Vector3.UP, angle * 1.4) * tilt * basis0
		node.global_transform = Transform3D(spun.scaled(Vector3.ONE * shrink), center + around + Vector3(0, y, 0)), 0.0, 1.0, dive_time).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	motion.tween_callback(node.queue_free)
	# O portal fecha com um clarão para dentro.
	var closing := (portal.get_meta("mesh") as Node).create_tween()
	closing.tween_interval(open_time + lift_time + dive_time * 0.92)
	closing.tween_callback(func() -> void:
		var mesh: Node3D = weak_portal.get_ref() as Node3D
		if mesh:
			Fx.burst(mesh.get_parent() as Node3D, center + Vector3(0, 0.05, 0), COLOR.lerp(Color.WHITE, 0.4), 24, 0.6, 0.35, 0.05))
	closing.tween_method(func(v: float) -> void: portal.set_shader_parameter("flash", v), 1.0, 0.0, close_time)
	closing.parallel().tween_method(func(v: float) -> void: portal.set_shader_parameter("open", v), 1.0, 0.0, close_time).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	closing.tween_callback((portal.get_meta("mesh") as Node).queue_free)


## O disco do portal deitado no tampo (devolve o material; a malha fica em get_meta("mesh")).
static func _portal(parent: Node3D, center: Vector3) -> ShaderMaterial:
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE * RADIUS * 2.0
	mesh.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("color", COLOR)
	material.set_shader_parameter("deep", DEEP)
	material.set_shader_parameter("seed", randf() * 20.0)
	material.set_shader_parameter("open", 0.0)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = center
	parent.add_child(mesh)
	material.set_meta("mesh", mesh)
	return material


## Partículas que entram girando no redemoinho: nascem num anel em volta e são puxadas para o centro.
static func _inward_motes(parent: Node3D, center: Vector3, seconds: float) -> void:
	if Fx.quality == 0:
		return
	var motes := GPUParticles3D.new()
	motes.amount = 60 if Fx.quality > 1 else 26
	motes.lifetime = 0.55
	motes.local_coords = true
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	process.emission_ring_axis = Vector3.UP
	process.emission_ring_radius = RADIUS * 1.05
	process.emission_ring_inner_radius = RADIUS * 0.8
	process.emission_ring_height = 0.02
	process.gravity = Vector3.ZERO
	process.radial_accel_min = -5.0
	process.radial_accel_max = -3.5
	process.tangential_accel_min = 4.0
	process.tangential_accel_max = 6.0
	process.scale_min = 0.03
	process.scale_max = 0.06
	var ramp := Gradient.new()
	ramp.set_color(0, Color(COLOR.lerp(Color.WHITE, 0.5), 0.0))
	ramp.add_point(0.2, Color(COLOR.lerp(Color.WHITE, 0.4), 1.0))
	ramp.set_color(ramp.get_point_count() - 1, Color(DEEP, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	motes.process_material = process
	motes.draw_pass_1 = Fx._spark()
	motes.position = center + Vector3(0, 0.03, 0)
	parent.add_child(motes)
	motes.emitting = true
	var weak: WeakRef = weakref(motes)
	motes.get_tree().create_timer(seconds).timeout.connect(func() -> void:
		var node: GPUParticles3D = weak.get_ref() as GPUParticles3D
		if node:
			node.emitting = false
			node.get_tree().create_timer(0.7).timeout.connect(node.queue_free))
