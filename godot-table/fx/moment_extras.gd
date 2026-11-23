# Peças a mais dos momentos grandes: raios de luz do alto, folhas de ouro e cinzas caindo, poeira correndo pelo tampo,
# clarão em estrela, cintilas, cacos voando e a sombra de contato dos objetos no ar. Cada peça some sozinha.
class_name MomentExtras
extends RefCounted

const SHAFT := preload("res://fx/light_shaft.gdshader")
const LEAF := preload("res://fx/gold_leaf.gdshader")
const STAR := preload("res://fx/star_flare.gdshader")

static var _star_quad: QuadMesh
static var _beam_quad: QuadMesh
static var _dust_quad: QuadMesh
static var _shadow_quad: QuadMesh
static var _shard_mesh: ArrayMesh


## Raios de luz que descem do alto, inclinados como luz de janela, com o pé espalhado em volta de `pos`. Acendem, ficam
## e se apagam em `duration`.
static func shafts(parent: Node3D, pos: Vector3, color: Color, count: int = 5, duration: float = 2.0, spread: float = 1.6, strength: float = 0.5, height: float = 7.5) -> void:
	if Fx.quality == 0:
		count = mini(count, 2)
	for i: int in count:
		var shaft := MeshInstance3D.new()
		shaft.mesh = _shaft_quad()
		var material := ShaderMaterial.new()
		material.shader = SHAFT
		material.set_shader_parameter("color", color)
		material.set_shader_parameter("seed", randf() * 10.0)
		material.set_shader_parameter("taper", randf_range(0.15, 0.35))
		material.set_shader_parameter("alpha", 0.0)
		shaft.material_override = material
		shaft.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# A faixa gira para a câmera no shader: a caixa de corte precisa cobrir todas as voltas.
		shaft.extra_cull_margin = 2.0
		var foot := pos + Vector3(randf_range(-spread, spread), 0, randf_range(-spread, spread) * 0.6)
		shaft.rotation = Vector3(randf_range(-0.22, 0.05), 0, randf_range(0.1, 0.38))
		shaft.scale = Vector3(randf_range(0.7, 1.3), height, 1.0)
		# O pé fica um pouco acima do tampo: a luz esfuma antes de tocar a mesa.
		shaft.position = foot + Vector3(0, 0.4, 0) + shaft.basis.orthonormalized() * Vector3.UP * height * 0.5
		parent.add_child(shaft)
		var peak: float = strength * randf_range(0.7, 1.1)
		var set_alpha: Callable = func(a: float) -> void: material.set_shader_parameter("alpha", a)
		var tween := shaft.create_tween()
		tween.tween_interval(i * 0.07)
		tween.tween_method(set_alpha, 0.0, peak, duration * 0.25).set_trans(Tween.TRANS_SINE)
		tween.tween_interval(duration * 0.3)
		tween.tween_method(set_alpha, peak, 0.0, duration * 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tween.tween_callback(shaft.queue_free)
		# Balança devagar, como luz passando por folhas.
		shaft.create_tween().tween_property(shaft, "rotation:z", shaft.rotation.z + randf_range(-0.06, 0.06), duration).set_trans(Tween.TRANS_SINE)


## Folhas caindo e girando sobre a mesa (ouro na vitória, cinzas na derrota): nascem numa faixa a `height` acima de
## `center`, espalhadas por `area` (largura e fundo), e caem balançando ao vento.
static func leaves(parent: Node3D, center: Vector3, colors: Array[Color], amount: int, life: float, area: Vector2, size: float = 0.09,
		fall: float = 1.4, shine: float = 1.0, embers: float = 0.0, height: float = 4.0, alpha: float = 1.0) -> GPUParticles3D:
	var particles := GPUParticles3D.new()
	particles.amount = maxi(8, int(amount * (0.4 if Fx.quality == 0 else (0.75 if Fx.quality == 1 else 1.0))))
	particles.lifetime = life
	particles.one_shot = true
	particles.explosiveness = 0.35
	particles.randomness = 0.5
	particles.local_coords = false
	particles.visibility_aabb = AABB(Vector3(-area.x, -height - 1.0, -area.y), Vector3(area.x * 2.0, height + 3.0, area.y * 2.0))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(area.x * 0.5, 0.3, area.y * 0.5)
	process.direction = Vector3(0, -1, 0)
	process.spread = 35.0
	process.initial_velocity_min = 0.2
	process.initial_velocity_max = 0.8
	process.gravity = Vector3(0, -fall, 0)
	process.damping_min = 0.6
	process.damping_max = 1.4
	process.scale_min = size * 0.7
	process.scale_max = size * 1.3
	process.turbulence_enabled = Fx.quality > 0
	process.turbulence_noise_strength = 2.0
	process.turbulence_noise_scale = 2.5
	process.turbulence_influence_min = 0.05
	process.turbulence_influence_max = 0.18
	var pick := Gradient.new()
	pick.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT
	pick.offsets = PackedFloat32Array()
	pick.colors = PackedColorArray()
	for i: int in colors.size():
		pick.add_point(float(i) / colors.size(), colors[i])
	process.color_initial_ramp = _texture(pick)
	var fade := Gradient.new()
	fade.offsets = PackedFloat32Array([0.0, 0.08, 0.75, 1.0])
	fade.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, alpha), Color(1, 1, 1, alpha), Color(1, 1, 1, 0)])
	process.color_ramp = _texture(fade)
	particles.process_material = process
	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 0.62)
	var material := ShaderMaterial.new()
	material.shader = LEAF
	material.set_shader_parameter("shine", shine)
	material.set_shader_parameter("embers", embers)
	material.set_shader_parameter("glow", 1.0 if embers > 0.0 else 0.0)
	material.set_shader_parameter("spin", 4.0)
	quad.material = material
	particles.draw_pass_1 = quad
	particles.position = center + Vector3(0, height, 0)
	parent.add_child(particles)
	particles.emitting = true
	_free_after(particles, life * 2.2 + 0.3)
	return particles


## Poeira correndo pelo tampo a partir de `pos` (o comandante batendo na mesa, o dado quicando): uma nuvem baixa que se
## espalha em roda até `reach` e assenta.
static func dust_ring(parent: Node3D, pos: Vector3, color: Color, reach: float = 3.0, amount: int = 90, life: float = 1.1, size: float = 0.35) -> void:
	var particles := GPUParticles3D.new()
	particles.amount = maxi(6, int(amount * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = life
	particles.one_shot = true
	particles.explosiveness = 0.92
	particles.local_coords = false
	particles.visibility_aabb = AABB(Vector3(-reach - 1.0, -0.5, -reach - 1.0), Vector3(reach * 2.0 + 2.0, 2.0, reach * 2.0 + 2.0))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	process.emission_ring_axis = Vector3.UP
	process.emission_ring_height = 0.02
	process.emission_ring_radius = maxf(size * 0.8, 0.1)
	process.emission_ring_inner_radius = maxf(size * 0.4, 0.05)
	process.direction = Vector3(0, 1, 0)
	process.spread = 20.0
	process.initial_velocity_min = 0.05
	process.initial_velocity_max = 0.35
	process.radial_velocity_min = reach * 1.6
	process.radial_velocity_max = reach * 2.8
	process.damping_min = reach * 2.2
	process.damping_max = reach * 3.4
	process.gravity = Vector3(0, -0.2, 0)
	process.scale_min = size * 0.7
	process.scale_max = size * 1.3
	var grow := Curve.new()
	grow.add_point(Vector2(0.0, 0.45))
	grow.add_point(Vector2(1.0, 1.6))
	var grow_tex := CurveTexture.new()
	grow_tex.curve = grow
	process.scale_curve = grow_tex
	var fade := Gradient.new()
	fade.offsets = PackedFloat32Array([0.0, 0.15, 1.0])
	fade.colors = PackedColorArray([Color(color, 0.0), Color(color, 0.5 * color.a), Color(color, 0.0)])
	process.color_ramp = _texture(fade)
	particles.process_material = process
	particles.draw_pass_1 = _dust()
	particles.position = pos + Vector3(0, 0.06, 0)
	parent.add_child(particles)
	particles.emitting = true
	_free_after(particles, life + 0.3)


## Uma baforada de poeira pequena (o quique do dado, a comida batendo na carta).
static func puff(parent: Node3D, pos: Vector3, strength: float = 1.0) -> void:
	dust_ring(parent, pos, Color(0.62, 0.57, 0.5, 0.55), 0.6 * strength, int(14 * strength) + 4, 0.6, 0.2 * strength + 0.06)


## Clarão em estrela em `pos`, de frente para a câmera: abre rápido e some (impacto, reflexo de metal).
static func flare(parent: Node3D, pos: Vector3, color: Color, size: float = 1.4, duration: float = 0.45, rays: float = 1.0) -> MeshInstance3D:
	var near: float = Fx.depth_scale(parent, parent.global_transform * pos) if parent.is_inside_tree() else 1.0
	var shine: MeshInstance3D = star(parent, pos, color, size * 0.3 * near, rays)
	var material: ShaderMaterial = shine.material_override
	var tween := shine.create_tween().set_parallel(true)
	tween.tween_property(shine, "scale", Vector3.ONE * size * near, duration * 0.3).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(a: float) -> void: material.set_shader_parameter("alpha", a), 1.0, 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(shine.queue_free)
	return shine


## Uma estrela parada em `pos` (local de `parent`), de frente para a câmera; quem a cria anima o "alpha".
static func star(parent: Node3D, pos: Vector3, color: Color, size: float, rays: float = 1.0) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = _star()
	var material := ShaderMaterial.new()
	material.shader = STAR
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("rays", rays)
	material.render_priority = 25
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.position = pos
	node.scale = Vector3.ONE * size
	parent.add_child(node)
	return node


## Cintilas em estrela piscando em volta de `pos` (dentro de `radius`) por `duration` segundos.
static func sparkles(parent: Node3D, pos: Vector3, color: Color, radius: float = 0.6, duration: float = 1.0, amount: int = 14, size: float = 0.22) -> void:
	var particles := GPUParticles3D.new()
	particles.amount = maxi(4, int(amount * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = 0.45
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = radius
	process.gravity = Vector3(0, 0.3, 0)
	process.initial_velocity_min = 0.0
	process.initial_velocity_max = 0.1
	process.scale_min = size * 0.6
	process.scale_max = size * 1.2
	var twinkle := Curve.new()
	twinkle.add_point(Vector2(0.0, 0.0))
	twinkle.add_point(Vector2(0.3, 1.0))
	twinkle.add_point(Vector2(1.0, 0.0))
	var twinkle_tex := CurveTexture.new()
	twinkle_tex.curve = twinkle
	process.scale_curve = twinkle_tex
	process.color = color
	particles.process_material = process
	particles.draw_pass_1 = _star_particle()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	var ref: WeakRef = weakref(particles)
	parent.get_tree().create_timer(duration).timeout.connect(func() -> void:
		var alive: GPUParticles3D = ref.get_ref() as GPUParticles3D
		if alive:
			alive.emitting = false)
	_free_after(particles, duration + 0.6)


## Cacos que voam de `pos` girando e caem (a cúpula do ward partindo, o sangue respingando).
static func shards(parent: Node3D, pos: Vector3, color: Color, amount: int = 26, speed: float = 2.4, life: float = 0.8, size: float = 0.12, radius: float = 0.3, flat: bool = false) -> void:
	var particles := GPUParticles3D.new()
	particles.amount = maxi(6, int(amount * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = life
	particles.one_shot = true
	particles.explosiveness = 0.95
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE
	process.emission_sphere_radius = radius
	process.direction = Vector3(0, 1, 0)
	process.spread = 75.0 if not flat else 180.0
	process.initial_velocity_min = speed * 0.4
	process.initial_velocity_max = speed
	process.radial_velocity_min = speed * 0.3
	process.radial_velocity_max = speed * 0.8
	process.gravity = Vector3(0, -7.0, 0)
	process.damping_min = 0.5
	process.damping_max = 1.5
	process.scale_min = size * 0.6
	process.scale_max = size * 1.4
	var fade := Gradient.new()
	fade.offsets = PackedFloat32Array([0.0, 0.7, 1.0])
	fade.colors = PackedColorArray([color, color, Color(color, 0.0)])
	process.color_ramp = _texture(fade)
	particles.process_material = process
	particles.draw_pass_1 = _shard()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	_free_after(particles, life + 0.3)


## Sombra de contato: uma mancha escura macia no tampo, embaixo de um objeto no ar. Quem a cria move e ajusta com shadow_at().
static func contact_shadow(parent: Node3D, size: float) -> MeshInstance3D:
	var blob := MeshInstance3D.new()
	blob.mesh = _shadow()
	blob.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	blob.scale = Vector3.ONE * size
	blob.set_meta("size", size)
	parent.add_child(blob)
	return blob


## Põe a sombra embaixo de `at` (no tampo em `floor_y`): quanto mais alto o objeto, maior e mais clara.
static func shadow_at(blob: MeshInstance3D, at: Vector3, floor_y: float, fade: float = 1.0) -> void:
	if blob == null or not is_instance_valid(blob):
		return
	var height: float = maxf(at.y - floor_y, 0.0)
	var size: float = float(blob.get_meta("size", 1.0))
	blob.position = Vector3(at.x, floor_y + 0.006, at.z)
	blob.scale = Vector3.ONE * size * (1.0 + height * 0.35)
	blob.transparency = 1.0 - clampf(0.75 / (1.0 + height * 1.4), 0.0, 1.0) * fade


## O ponto em estrela das cintilas (virado para a câmera, a cor vem da partícula).
static func _star_particle() -> QuadMesh:
	var quad := QuadMesh.new()
	var material := ShaderMaterial.new()
	material.shader = STAR
	material.set_shader_parameter("rays", 0.8)
	quad.material = material
	return quad


static func _shaft_quad() -> QuadMesh:
	if _beam_quad == null:
		_beam_quad = QuadMesh.new()
	return _beam_quad


static func _star() -> QuadMesh:
	if _star_quad == null:
		_star_quad = QuadMesh.new()
	return _star_quad


## A baforada de poeira: um borrão macio que tampa um pouco (não soma luz), virado para a câmera.
static func _dust() -> QuadMesh:
	if _dust_quad == null:
		_dust_quad = QuadMesh.new()
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		material.billboard_keep_scale = true
		material.vertex_color_use_as_albedo = true
		material.albedo_texture = (Fx._spark().material as StandardMaterial3D).albedo_texture
		_dust_quad.material = material
	return _dust_quad


static func _shadow() -> QuadMesh:
	if _shadow_quad == null:
		_shadow_quad = QuadMesh.new()
		_shadow_quad.size = Vector2.ONE
		_shadow_quad.orientation = PlaneMesh.FACE_Y
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.albedo_color = Color(0.0, 0.0, 0.02, 1.0)
		material.albedo_texture = (Fx._spark().material as StandardMaterial3D).albedo_texture
		material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
		_shadow_quad.material = material
	return _shadow_quad


## Um caco: triângulo torto (a folha que gira, com o mesmo brilho de quando vira para a câmera).
static func _shard() -> ArrayMesh:
	if _shard_mesh == null:
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-0.5, -0.35, 0), Vector3(0.55, -0.2, 0), Vector3(-0.05, 0.6, 0)])
		arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.BACK, Vector3.BACK, Vector3.BACK])
		_shard_mesh = ArrayMesh.new()
		_shard_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var material := ShaderMaterial.new()
		material.shader = LEAF
		material.set_shader_parameter("shine", 2.0)
		material.set_shader_parameter("spin", 9.0)
		_shard_mesh.surface_set_material(0, material)
	return _shard_mesh


static func _texture(gradient: Gradient) -> GradientTexture1D:
	var texture := GradientTexture1D.new()
	texture.gradient = gradient
	return texture


static func _free_after(node: Node, seconds: float) -> void:
	var ref: WeakRef = weakref(node)
	node.get_tree().create_timer(seconds).timeout.connect(func() -> void:
		var alive: Node = ref.get_ref() as Node
		if alive:
			alive.queue_free())
