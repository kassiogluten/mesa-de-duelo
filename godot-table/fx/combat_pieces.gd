# Peças do combate: a onda que entorta a tela, a marca do golpe no tampo, a poeira e a fumaça (que escurecem em vez de
# somar luz), as faíscas esticadas pela velocidade, as imagens fantasmas do avanço, o rastro de calor, o golpe que
# atropela, o estouro necrótico (toque mortífero), o tóxico (infectar) e as luzes verdes do vínculo com a vida.
class_name CombatPieces
extends RefCounted

const SHOCKWAVE := preload("res://fx/combat_shockwave.gdshader")
const SCORCH := preload("res://fx/combat_scorch.gdshader")
const GHOST := preload("res://fx/combat_ghost.gdshader")
const RIBBON := preload("res://fx/combat_ribbon.gdshader")
const NECROTIC := Color(0.55, 0.2, 0.9)
const TOXIC := Color(0.45, 1.0, 0.25)
const LIFELINK := Color(0.45, 1.0, 0.55)

static var _smoke_quad: QuadMesh
## Um material de partícula de cada tipo, guardado para sempre: o Godot apaga o shader de um tipo de partícula quando o
## último material dele some e o recompila no próximo (~6 ms a cada primeira poeira ou faísca depois de uma pausa).
static var _kept: Array[Material] = []
static var _streak_mesh: ArrayMesh
static var _mote_material: StandardMaterial3D


## A onda de choque de frente para a câmera em `pos`, que abre até `radius` entortando a mesa atrás dela.
static func shockwave(parent: Node3D, pos: Vector3, radius: float, strength: float = 0.035, tint: Color = Color(1.0, 0.6, 0.35), duration: float = 0.42) -> void:
	if Fx.quality == 0:
		return
	var quad := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = Vector2.ONE
	quad.mesh = mesh
	var material := ShaderMaterial.new()
	material.shader = SHOCKWAVE
	material.set_shader_parameter("strength", strength)
	material.set_shader_parameter("tint", tint)
	quad.material_override = material
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.position = pos
	quad.scale = Vector3.ONE * radius * 2.0
	parent.add_child(quad)
	var tween := quad.create_tween()
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("progress", v), 0.0, 1.0, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_callback(quad.queue_free)


## A marca do golpe pesado deitada no tampo: rachaduras em brasa que esfriam em `duration`.
static func scorch(parent: Node3D, pos: Vector3, color: Color, size: float, duration: float = 1.3) -> void:
	var mark := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE * size
	mark.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = SCORCH
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("seed", randf() * 20.0)
	mark.material_override = material
	mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mark.position = Vector3(pos.x, 0.012, pos.z)
	mark.rotation.y = randf() * TAU
	parent.add_child(mark)
	var tween := mark.create_tween()
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("heat", v), 1.0, 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(mark.queue_free)


## Fumaça ou poeira que escurece (não soma luz): `rise` > 0 sobe, < 0 cai; `spread` abre para os lados.
static func smoke(parent: Node3D, pos: Vector3, color: Color, amount: int, spread: float = 0.9, rise: float = 0.6, life: float = 0.9, size: float = 0.22) -> void:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 0.85
	particles.amount = maxi(4, int(amount * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = life
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = 0.12
	process.direction = Vector3(0, 1, 0)
	process.spread = 80.0
	process.initial_velocity_min = spread * 0.3
	process.initial_velocity_max = spread
	process.gravity = Vector3(0, rise, 0)
	process.damping_min = 2.0
	process.damping_max = 3.5
	process.scale_min = size * 0.6
	process.scale_max = size * 1.3
	var grow := Curve.new()
	grow.add_point(Vector2(0.0, 0.45))
	grow.add_point(Vector2(1.0, 1.0))
	var grow_tex := CurveTexture.new()
	grow_tex.curve = grow
	process.scale_curve = grow_tex
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color, 0.0))
	ramp.add_point(0.15, Color(color, color.a))
	ramp.set_color(ramp.get_point_count() - 1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = _smoke()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	parent.get_tree().create_timer(life + 0.3).timeout.connect(particles.queue_free)


## Faíscas esticadas na direção em que voam (o risco de metal do golpe), num cone em volta de `direction`.
static func streaks(parent: Node3D, pos: Vector3, direction: Vector3, color: Color, amount: int, speed: float = 5.0, cone: float = 40.0) -> void:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 1.0
	particles.amount = maxi(4, int(amount * (0.4 if Fx.quality == 0 else (0.8 if Fx.quality == 1 else 1.0))))
	particles.lifetime = 0.38
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.direction = direction.normalized() if direction.length() > 0.001 else Vector3.UP
	process.spread = cone
	process.initial_velocity_min = speed * 0.5
	process.initial_velocity_max = speed
	process.gravity = Vector3(0, -9.0, 0)
	process.damping_min = 3.0
	process.damping_max = 6.0
	process.particle_flag_align_y = true
	process.scale_min = 0.12
	process.scale_max = 0.3
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.98, 0.9, 1.0))
	ramp.add_point(0.35, Color(color.lightened(0.3), 1.0))
	ramp.set_color(ramp.get_point_count() - 1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = _streak()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	parent.get_tree().create_timer(0.7).timeout.connect(particles.queue_free)


## Uma imagem fantasma da carta onde ela está agora (no avanço do golpe), que some em `life`.
static func ghost(parent: Node3D, node: CardNode, tint: Color, alpha: float = 0.45, life: float = 0.2) -> void:
	if Fx.quality == 0 or node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var card: ShaderMaterial = CardDressing.material_of(node)
	var echo := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = CardNode.SIZE
	echo.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = GHOST
	var has_front: bool = card != null and bool(card.get_shader_parameter("has_front"))
	material.set_shader_parameter("has_front", has_front)
	if has_front:
		material.set_shader_parameter("front_tex", card.get_shader_parameter("front_tex"))
	material.set_shader_parameter("tint", tint)
	material.set_shader_parameter("alpha", alpha)
	echo.material_override = material
	echo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(echo)
	echo.global_transform = visual.global_transform.translated(Vector3(0, 0.003, 0))
	var tween := echo.create_tween()
	tween.tween_method(func(a: float) -> void: material.set_shader_parameter("alpha", a), alpha, 0.0, life).set_ease(Tween.EASE_IN)
	tween.tween_callback(echo.queue_free)


## O rastro de calor que segue a carta por `duration` (o desenho dela, que avança no ataque e no golpe), deitado
## logo acima do tampo, largo junto da carta e fino na ponta.
static func heat_trail(parent: Node3D, node: CardNode, color: Color, duration: float = 0.6, width: float = 0.5, memory: float = 0.3) -> void:
	if node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var ribbon := MeshInstance3D.new()
	var mesh := ImmediateMesh.new()
	ribbon.mesh = mesh
	ribbon.top_level = true
	ribbon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader = RIBBON
	material.set_shader_parameter("color", color)
	ribbon.extra_cull_margin = 8.0
	parent.add_child(ribbon)
	ribbon.global_transform = Transform3D.IDENTITY
	var samples: Array = []
	var ref: WeakRef = weakref(visual)
	var fade: Array = [1.0]
	var tween := ribbon.create_tween()
	tween.tween_method(func(now: float) -> void:
		var v: Node3D = ref.get_ref() as Node3D
		if v and v.is_inside_tree():
			var at: Vector3 = v.global_position
			if samples.is_empty() or (samples[0]["p"] as Vector3).distance_to(at) > 0.03:
				samples.push_front({"p": at, "t": now})
		while samples.size() > 1 and now - float(samples[samples.size() - 1]["t"]) > memory:
			samples.pop_back()
		material.set_shader_parameter("alpha", float(fade[0]) * clampf((duration - now) / 0.2, 0.0, 1.0))
		_ribbon(mesh, material, samples, width, Vector3.UP), 0.0, duration, duration)
	tween.tween_callback(ribbon.queue_free)


## O excesso do atropelar: um risco de fogo que corre de `from` até `to` em `duration` e chama `on_hit` ao chegar.
static func trample(parent: Node3D, from: Vector3, to: Vector3, color: Color, duration: float, on_hit: Callable) -> void:
	var ribbon := MeshInstance3D.new()
	var mesh := ImmediateMesh.new()
	ribbon.mesh = mesh
	ribbon.top_level = true
	ribbon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ribbon.extra_cull_margin = 8.0
	var material := ShaderMaterial.new()
	material.shader = RIBBON
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("energy", 3.2)
	parent.add_child(ribbon)
	ribbon.global_transform = Transform3D.IDENTITY
	var lift: float = clampf(from.distance_to(to) * 0.12, 0.2, 0.8)
	var path: Callable = func(t: float) -> Vector3: return from.lerp(to, t) + Vector3(0, sin(t * PI) * lift + 0.15, 0)
	var tween := ribbon.create_tween()
	# A cabeça corre até o alvo (fita do tamanho do caminho andado); depois a cauda alcança e some.
	tween.tween_method(func(head: float) -> void:
		var samples: Array = []
		for i: int in 12:
			var k: float = head * (1.0 - i / 11.0)
			samples.append({"p": path.call(k)})
		_ribbon(mesh, material, samples, 0.32, Vector3.ZERO), 0.0, 1.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(on_hit)
	tween.tween_method(func(a: float) -> void: material.set_shader_parameter("alpha", a), 1.0, 0.0, 0.18)
	tween.tween_callback(ribbon.queue_free)


## Toque mortífero: a carta suga a luz (um clarão escuro), sobe fumaça preta-violeta em fiapos, faíscas violeta e um
## anel apertado.
static func necrotic(parent: Node3D, pos: Vector3) -> void:
	smoke(parent, pos + Vector3(0, 0.08, 0), Color(0.16, 0.02, 0.24, 0.95), 30, 0.7, 1.4, 1.3, 0.4)
	smoke(parent, pos + Vector3(0, 0.2, 0), Color(0.25, 0.05, 0.4, 0.8), 14, 1.6, 0.6, 0.8, 0.22)
	Fx.burst(parent, pos + Vector3(0, 0.2, 0), NECROTIC, 26, 1.4, 0.7, 0.06)
	Fx.ring(parent, pos, NECROTIC.darkened(0.2), 0.75, 0.45, 0.1)
	Fx.light(parent, pos, NECROTIC, 2.2, 3.0, 0.5)


## Infectar e murchar: bolhas verde-ácido, gotas que caem e o anel tóxico.
static func toxic(parent: Node3D, pos: Vector3) -> void:
	Fx.burst(parent, pos + Vector3(0, 0.2, 0), TOXIC, 30, 1.3, 0.8, 0.07)
	smoke(parent, pos + Vector3(0, 0.25, 0), Color(0.18, 0.5, 0.05, 0.85), 22, 1.2, -4.0, 0.8, 0.1)
	smoke(parent, pos + Vector3(0, 0.1, 0), Color(0.12, 0.3, 0.04, 0.6), 10, 0.5, 0.5, 1.0, 0.35)
	Fx.ring(parent, pos, TOXIC, 0.7, 0.45, 0.1)
	Fx.light(parent, pos, TOXIC, 2.0, 3.0, 0.45)


## Vínculo com a vida: luzes verdes que saem do golpe e voam em curva até o retrato de quem controla a fonte; `on_arrive`
## roda quando a primeira chega.
static func motes(parent: Node3D, from: Vector3, to: Vector3, count: int, speed: float, on_arrive: Callable) -> void:
	var total: int = clampi(count, 3, 9) if Fx.quality > 0 else 3
	var arrived: Array = [false]
	for i: int in total:
		var mote := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2.ONE * 0.16
		mote.mesh = quad
		mote.material_override = _mote()
		mote.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		parent.add_child(mote)
		mote.global_position = from
		var trail := GPUParticles3D.new()
		trail.amount = 14 if Fx.quality > 0 else 6
		trail.lifetime = 0.3
		trail.local_coords = false
		var process := ParticleProcessMaterial.new()
		process.spread = 180.0
		process.initial_velocity_min = 0.05
		process.initial_velocity_max = 0.2
		process.gravity = Vector3.ZERO
		process.scale_min = 0.04
		process.scale_max = 0.08
		var ramp := Gradient.new()
		ramp.set_color(0, Color(LIFELINK.lightened(0.4), 0.9))
		ramp.set_color(1, Color(LIFELINK, 0.0))
		var ramp_tex := GradientTexture1D.new()
		ramp_tex.gradient = ramp
		process.color_ramp = ramp_tex
		trail.process_material = process
		trail.draw_pass_1 = Fx._spark()
		mote.add_child(trail)
		# Cada uma faz a sua curva (sai para um lado, sobe e desce no retrato).
		var bend := Vector3(randf_range(-1.2, 1.2), randf_range(0.8, 1.6), randf_range(-0.6, 0.6))
		var mid: Vector3 = from.lerp(to, 0.45) + bend
		var delay: float = (0.05 + i * 0.045) / speed
		var time: float = randf_range(0.5, 0.65) / speed
		var tween := mote.create_tween()
		mote.scale = Vector3.ONE * 0.01
		tween.tween_interval(delay)
		tween.tween_property(mote, "scale", Vector3.ONE, 0.08 / speed)
		tween.tween_method(func(t: float) -> void:
			var a: Vector3 = from.lerp(mid, t)
			var b: Vector3 = mid.lerp(to, t)
			mote.global_position = a.lerp(b, t), 0.0, 1.0, time).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tween.tween_callback(func() -> void:
			trail.emitting = false
			mote.transparency = 1.0
			if not bool(arrived[0]):
				arrived[0] = true
				on_arrive.call())
		tween.tween_interval(0.35)
		tween.tween_callback(mote.queue_free)


## A criatura atacando arde: fagulhas que sobem das bordas dela, rodopiando no ar quente, enquanto o ataque dura (o
## palco liga, segue a carta e apaga). Nenhuma no "leve".
static func embers(parent: Node3D, at: Vector3) -> GPUParticles3D:
	var particles := GPUParticles3D.new()
	particles.amount = 12 if Fx.quality >= 2 else 6
	particles.lifetime = 1.1
	particles.local_coords = false
	particles.visibility_aabb = AABB(Vector3(-1.0, -0.2, -1.0), Vector3(2.0, 2.2, 2.0))
	var process := ParticleProcessMaterial.new()
	# Da borda da carta (um anel em volta dela), não do meio da face.
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	process.emission_ring_axis = Vector3.UP
	process.emission_ring_radius = 0.42
	process.emission_ring_inner_radius = 0.3
	process.emission_ring_height = 0.02
	process.direction = Vector3.UP
	process.spread = 20.0
	process.initial_velocity_min = 0.35
	process.initial_velocity_max = 0.7
	process.gravity = Vector3(0, 0.25, 0)
	process.damping_min = 0.3
	process.damping_max = 0.6
	process.turbulence_enabled = true
	process.turbulence_noise_strength = 0.8
	process.turbulence_noise_scale = 2.2
	process.turbulence_influence_min = 0.08
	process.turbulence_influence_max = 0.2
	process.scale_min = 0.035
	process.scale_max = 0.07
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.55, 0.2, 0.0))
	ramp.add_point(0.15, Color(1.0, 0.7, 0.35, 0.9))
	ramp.add_point(0.6, Color(1.0, 0.35, 0.12, 0.6))
	ramp.set_color(ramp.get_point_count() - 1, Color(0.6, 0.1, 0.05, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = Fx._spark()
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(particles)
	particles.global_position = at
	particles.emitting = true
	return particles


## Monta a fita de `samples` (o primeiro é a cabeça): deitada no plano de `normal`, ou de frente para a câmera com
## `normal` zero; UV.x vai de 0 na cabeça a 1 na ponta.
static func _ribbon(mesh: ImmediateMesh, material: Material, samples: Array, width: float, normal: Vector3) -> void:
	mesh.clear_surfaces()
	if samples.size() < 2:
		return
	var camera: Camera3D = null
	if normal == Vector3.ZERO:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		camera = tree.root.get_viewport().get_camera_3d() if tree else null
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP, material)
	var count: int = samples.size()
	for i: int in count:
		var p: Vector3 = samples[i]["p"]
		var next: Vector3 = samples[mini(i + 1, count - 1)]["p"]
		var prev: Vector3 = samples[maxi(i - 1, 0)]["p"]
		var along: Vector3 = (prev - next)
		if along.length() < 0.0001:
			along = Vector3.FORWARD
		var facing: Vector3 = normal
		if camera:
			facing = (camera.global_position - p).normalized()
		var side: Vector3 = along.cross(facing).normalized() * width * 0.5 * lerpf(1.0, 0.35, float(i) / (count - 1))
		var u: float = float(i) / (count - 1)
		# Deitada: logo acima do tampo, por baixo da carta (que cobre a cabeça da fita).
		if normal != Vector3.ZERO:
			p.y = maxf(p.y - 0.012, 0.008)
		mesh.surface_set_uv(Vector2(u, 0.0))
		mesh.surface_add_vertex(p + side)
		mesh.surface_set_uv(Vector2(u, 1.0))
		mesh.surface_add_vertex(p - side)
	mesh.surface_end()


## O quadrado da fumaça: borda macia, mistura normal (escurece), virado para a câmera.
static func _smoke() -> QuadMesh:
	if _smoke_quad == null:
		_smoke_quad = QuadMesh.new()
		_smoke_quad.size = Vector2.ONE
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		material.billboard_keep_scale = true
		material.vertex_color_use_as_albedo = true
		material.albedo_texture = _soft_dot(0.0)
		_smoke_quad.material = material
	return _smoke_quad


## A faísca esticada: dois quadrados cruzados, compridos no eixo Y (que a partícula alinha com a velocidade).
static func _streak() -> ArrayMesh:
	if _streak_mesh == null:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for axis: Vector3 in [Vector3(0.035, 0, 0), Vector3(0, 0, 0.035)]:
			var top := Vector3(0, 0.5, 0)
			var low := Vector3(0, -0.5, 0)
			for v: Array in [[low - axis, Vector2(0, 1)], [top - axis, Vector2(0, 0)], [top + axis, Vector2(1, 0)],
					[low - axis, Vector2(0, 1)], [top + axis, Vector2(1, 0)], [low + axis, Vector2(1, 1)]]:
				st.set_uv(v[1])
				st.add_vertex(v[0])
		_streak_mesh = st.commit()
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
		material.vertex_color_use_as_albedo = true
		material.albedo_texture = _soft_dot(0.6)
		_streak_mesh.surface_set_material(0, material)
	return _streak_mesh


## A luz verde do vínculo: um ponto macio que soma luz, de frente para a câmera.
static func _mote() -> StandardMaterial3D:
	if _mote_material == null:
		_mote_material = StandardMaterial3D.new()
		_mote_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_mote_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_mote_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_mote_material.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		_mote_material.albedo_color = Color(LIFELINK.lightened(0.3), 1.0) * 2.0
		_mote_material.albedo_texture = _soft_dot(0.0)
	return _mote_material


## Um ponto redondo de borda macia (`core` deixa o meio mais firme).
static func _soft_dot(core: float) -> GradientTexture2D:
	var dot := GradientTexture2D.new()
	dot.fill = GradientTexture2D.FILL_RADIAL
	dot.fill_from = Vector2(0.5, 0.5)
	dot.fill_to = Vector2(1.0, 0.5)
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 1))
	if core > 0.0:
		gradient.add_point(core * 0.5, Color(1, 1, 1, 0.9))
	gradient.set_color(gradient.get_point_count() - 1, Color(1, 1, 1, 0))
	dot.gradient = gradient
	dot.width = 64
	dot.height = 64
	return dot


## Guarda os materiais das partículas e os materiais padrão (StandardMaterial3D) que estão em `node` e nos filhos: o
## shader de cada tipo fica vivo (os dois tipos apagam o shader quando o último material some).
static func keep_materials(node: Node) -> void:
	for found: Node in node.find_children("*", "GPUParticles3D", true, false):
		_keep((found as GPUParticles3D).process_material)
	for found: Node in node.find_children("*", "MeshInstance3D", true, false):
		var material: Material = (found as MeshInstance3D).material_override
		if material is BaseMaterial3D:
			_keep(material)


static func _keep(material: Material) -> void:
	if material and not _kept.has(material):
		_kept.append(material)


## Desenha cada peça uma vez (invisível) para a placa compilar tudo na abertura da mesa.
static func warm(parent: Node3D, spot: Vector3) -> void:
	var clear := Color(0, 0, 0, 0)
	smoke(parent, spot, clear, 4, 0.01, 0.0, 0.2, 0.001)
	streaks(parent, spot, Vector3.UP, clear, 4, 0.01)
	motes(parent, spot, spot, 1, 20.0, func() -> void: pass)
	var sparks_on: GPUParticles3D = embers(parent, spot)
	sparks_on.scale = Vector3.ONE * 0.001
	parent.get_tree().create_timer(0.3).timeout.connect(sparks_on.queue_free)
	var holder := Node3D.new()
	holder.scale = Vector3.ONE * 0.001
	parent.add_child(holder)
	holder.global_position = spot
	for shader: Shader in [SHOCKWAVE, SCORCH, GHOST, RIBBON, CombatLinks.SHIELD, CombatLinks.LINE]:
		var mesh := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2.ONE * 0.001
		mesh.mesh = quad
		var material := ShaderMaterial.new()
		material.shader = shader
		mesh.material_override = material
		holder.add_child(mesh)
	# A esfera sem luz das espirais de vida (MomentPieces.spiral), que o vínculo com a vida faz subir no retrato.
	var plain := StandardMaterial3D.new()
	plain.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var orb := MeshInstance3D.new()
	var orb_quad := QuadMesh.new()
	orb_quad.size = Vector2.ONE * 0.001
	orb.mesh = orb_quad
	orb.material_override = plain
	holder.add_child(orb)
	var mote := MeshInstance3D.new()
	var mote_quad := QuadMesh.new()
	mote_quad.size = Vector2.ONE * 0.001
	mote.mesh = mote_quad
	mote.material_override = _mote()
	holder.add_child(mote)
	var shards: MeshInstance3D = CombatShatter.spawn(parent, Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * 0.001), spot), null, Color.BLACK, null, clear, 20.0)
	shards.scale = Vector3.ONE * 0.001
	parent.get_tree().create_timer(0.3).timeout.connect(holder.queue_free)
