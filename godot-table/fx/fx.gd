# Peças dos efeitos da mesa 3D: faíscas (partículas na GPU), onda de choque no tampo, projétil com rastro, número que
# sobe, coluna de luz, clarão de luz de verdade e tremor de câmera. Cada peça se apaga sozinha quando termina.
class_name Fx
extends RefCounted

## 0: leve (metade das partículas), 1: normal, 2: caprichado. O diretor baixa quando os quadros caem.
static var quality: int = 2

static var _spark_mesh: QuadMesh
static var _ring_shader: Shader


## Cor de uma carta pelo custo de mana: a cor única, dourado nas multicoloridas, cinza-azulado nas incolores.
static func card_color(card: Dictionary) -> Color:
	var cost: String = Txt.of(card.get("manaCost"))
	var colors: Array[Color] = []
	for entry: Array in [["W", Color(1.0, 0.93, 0.7)], ["U", Color(0.35, 0.65, 1.0)], ["B", Color(0.68, 0.4, 0.95)], ["R", Color(1.0, 0.38, 0.18)], ["G", Color(0.35, 0.95, 0.4)]]:
		if cost.contains("{" + Txt.of(entry[0])) or cost.contains(Txt.of(entry[0]) + "}") or cost.contains("/" + Txt.of(entry[0])):
			colors.append(entry[1])
	if colors.size() == 1:
		return colors[0]
	if colors.size() > 1:
		return Color(1.0, 0.8, 0.3)
	return Color(0.75, 0.82, 0.95)


## Faíscas que explodem em `pos`: `amount` partículas na cor, espalhadas por `spread`, durante `life` segundos.
static func burst(parent: Node3D, pos: Vector3, color: Color, amount: int = 60, spread: float = 2.6, life: float = 0.7, size: float = 0.13) -> void:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 0.95
	particles.amount = maxi(4, int(amount * (0.5 if quality == 0 else (1.0 if quality == 1 else 1.4))))
	particles.lifetime = life
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3(0, 1, 0)
	process.spread = 180.0
	process.initial_velocity_min = spread * 0.4
	process.initial_velocity_max = spread
	process.gravity = Vector3(0, -3.5, 0)
	process.damping_min = 1.5
	process.damping_max = 3.0
	process.scale_min = size * 0.6
	process.scale_max = size * 1.4
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lightened(0.5), 1.0))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = _spark()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	_free_after(particles, life + 0.3)


## Onda de choque deitada no tampo, que abre a partir de `pos`.
static func ring(parent: Node3D, pos: Vector3, color: Color, radius: float = 1.6, duration: float = 0.55, width: float = 0.12) -> void:
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(2, 2)
	mesh.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = _ring()
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("width", width)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = pos + Vector3(0, 0.03, 0)
	mesh.scale = Vector3.ONE * 0.05
	parent.add_child(mesh)
	var tween := mesh.create_tween().set_parallel(true)
	tween.tween_property(mesh, "scale", Vector3.ONE * radius, duration).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(a: float) -> void: material.set_shader_parameter("alpha", a), 1.0, 0.0, duration).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(mesh.queue_free)


## Clarão de luz de verdade (ilumina as cartas em volta), que apaga rápido.
static func light(parent: Node3D, pos: Vector3, color: Color, energy: float = 4.0, reach: float = 4.0, duration: float = 0.4) -> void:
	if quality == 0:
		return
	var lamp := OmniLight3D.new()
	lamp.light_color = color
	lamp.omni_range = reach
	lamp.light_energy = energy
	lamp.position = pos + Vector3(0, 0.6, 0)
	parent.add_child(lamp)
	var tween := lamp.create_tween()
	tween.tween_property(lamp, "light_energy", 0.0, duration).set_ease(Tween.EASE_IN)
	tween.tween_callback(lamp.queue_free)


## Projétil em arco de `from` até `to`, com rastro de faíscas; `on_hit` roda quando chega.
static func bolt(parent: Node3D, from: Vector3, to: Vector3, color: Color, duration: float = 0.35, on_hit: Callable = Callable()) -> void:
	var orb := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.09
	sphere.height = 0.18
	orb.mesh = sphere
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color.lightened(0.6)
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 6.0
	orb.material_override = material
	orb.position = from
	parent.add_child(orb)
	var trail := GPUParticles3D.new()
	trail.amount = 40 if quality > 0 else 16
	trail.lifetime = 0.35
	trail.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.spread = 180.0
	process.initial_velocity_min = 0.1
	process.initial_velocity_max = 0.4
	process.gravity = Vector3.ZERO
	process.scale_min = 0.04
	process.scale_max = 0.09
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color, 0.9))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	trail.process_material = process
	trail.draw_pass_1 = _spark()
	orb.add_child(trail)
	var lift: float = clampf(from.distance_to(to) * 0.25, 0.4, 1.8)
	var tween := orb.create_tween()
	tween.tween_method(func(t: float) -> void:
		orb.position = from.lerp(to, t) + Vector3(0, sin(t * PI) * lift, 0), 0.0, 1.0, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		trail.emitting = false
		orb.visible = false
		if on_hit.is_valid():
			on_hit.call())
	tween.tween_interval(0.4)
	tween.tween_callback(orb.queue_free)


## Texto que sobe e some (dano, vida, marcadores), sempre de frente para a câmera.
static func float_text(parent: Node3D, pos: Vector3, text: String, color: Color, size: int = 72, duration: float = 1.1) -> void:
	var label := Label3D.new()
	label.text = text
	label.font_size = size
	label.pixel_size = 0.006
	label.outline_size = 18
	label.modulate = color
	label.outline_modulate = Color(0, 0, 0, 0.85)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.render_priority = 20
	label.position = pos + Vector3(0, 0.5, 0)
	label.scale = Vector3.ONE * 0.4
	parent.add_child(label)
	var tween := label.create_tween()
	tween.tween_property(label, "scale", Vector3.ONE * 1.15, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "scale", Vector3.ONE, 0.1)
	tween.parallel().tween_property(label, "position:y", label.position.y + 0.9, duration).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(label, "modulate:a", 0.0, duration * 0.5).set_delay(duration * 0.5)
	tween.tween_callback(label.queue_free)


## Coluna de luz que desce sobre `pos` (lendária entrando, mágica grande resolvendo).
static func pillar(parent: Node3D, pos: Vector3, color: Color, height: float = 6.0, duration: float = 0.9) -> void:
	var beam := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.5
	cylinder.bottom_radius = 0.5
	cylinder.height = height
	cylinder.cap_top = false
	cylinder.cap_bottom = false
	beam.mesh = cylinder
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.albedo_color = Color(color, 0.0)
	beam.material_override = material
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam.position = pos + Vector3(0, height / 2.0, 0)
	beam.scale = Vector3(0.2, 1, 0.2)
	parent.add_child(beam)
	var tween := beam.create_tween().set_parallel(true)
	tween.tween_property(material, "albedo_color:a", 0.55, duration * 0.25)
	tween.tween_property(beam, "scale", Vector3(1, 1, 1), duration * 0.3).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.chain().tween_property(material, "albedo_color:a", 0.0, duration * 0.7).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(beam, "scale", Vector3(0.05, 1, 0.05), duration * 0.7).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(beam.queue_free)


## A câmera se aproxima um pouco do lance (momento grande) e volta: `amount` é quanto do caminho até ele.
static func focus(camera: Camera3D, target: Vector3, amount: float = 0.12, duration: float = 0.9) -> void:
	if camera == null or quality == 0:
		return
	var home: Vector3 = camera.position
	var near: Vector3 = home.lerp(target, amount)
	var tween := camera.create_tween()
	tween.tween_property(camera, "position", near, duration * 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_interval(duration * 0.25)
	tween.tween_property(camera, "position", home, duration * 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)


## Mesa viva: poeira de luz flutuando devagar sobre o tampo, sem parar (poucas partículas, quase de graça).
static func ambience(parent: Node3D) -> GPUParticles3D:
	var dust := GPUParticles3D.new()
	dust.amount = 60
	dust.lifetime = 9.0
	dust.preprocess = 9.0
	dust.local_coords = false
	dust.visibility_aabb = AABB(Vector3(-10, -1, -7), Vector3(20, 6, 14))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(8.5, 0.6, 5.0)
	process.direction = Vector3(0, 1, 0)
	process.spread = 60.0
	process.initial_velocity_min = 0.03
	process.initial_velocity_max = 0.12
	process.gravity = Vector3.ZERO
	process.turbulence_enabled = true
	process.turbulence_noise_strength = 0.4
	process.turbulence_noise_scale = 3.0
	process.scale_min = 0.025
	process.scale_max = 0.06
	var ramp := Gradient.new()
	# Bem fraca: forte, cada partícula estoura no brilho da cena e vira uma bolha.
	ramp.set_color(0, Color(1.0, 0.85, 0.6, 0.0))
	ramp.add_point(0.3, Color(0.5, 0.42, 0.3, 0.5))
	ramp.add_point(0.7, Color(0.35, 0.4, 0.5, 0.45))
	ramp.set_color(ramp.get_point_count() - 1, Color(0.7, 0.8, 1.0, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	dust.process_material = process
	dust.draw_pass_1 = _spark()
	dust.position = Vector3(0, 0.8, 0)
	parent.add_child(dust)
	return dust


## Tremor de câmera curto (golpe grande, eliminação).
static func shake(camera: Camera3D, strength: float = 0.12, duration: float = 0.35) -> void:
	if camera == null or quality == 0:
		return
	var home: Vector3 = camera.position
	var tween := camera.create_tween()
	var steps: int = 8
	for i: int in steps:
		var fade: float = 1.0 - float(i) / steps
		tween.tween_property(camera, "position", home + Vector3(randf_range(-1, 1), randf_range(-1, 1), 0) * strength * fade, duration / steps)
	tween.tween_property(camera, "position", home, 0.05)


static func _spark() -> QuadMesh:
	if _spark_mesh == null:
		_spark_mesh = QuadMesh.new()
		_spark_mesh.size = Vector2.ONE
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		# Sem isto o modo "virado para a câmera" descarta a escala de cada partícula e todas saem com 1 de tamanho.
		material.billboard_keep_scale = true
		material.vertex_color_use_as_albedo = true
		material.no_depth_test = false
		var dot := GradientTexture2D.new()
		dot.fill = GradientTexture2D.FILL_RADIAL
		dot.fill_from = Vector2(0.5, 0.5)
		dot.fill_to = Vector2(1.0, 0.5)
		var gradient := Gradient.new()
		gradient.set_color(0, Color(1, 1, 1, 1))
		gradient.set_color(1, Color(1, 1, 1, 0))
		dot.gradient = gradient
		dot.width = 64
		dot.height = 64
		material.albedo_texture = dot
		_spark_mesh.material = material
	return _spark_mesh


static func _ring() -> Shader:
	if _ring_shader == null:
		_ring_shader = Shader.new()
		_ring_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 1.0;
uniform float width = 0.12;
void fragment() {
	float r = length(UV - 0.5) * 2.0;
	float band = smoothstep(1.0, 1.0 - width, r) * smoothstep(1.0 - width * 2.5, 1.0 - width, r);
	ALBEDO = color.rgb * 2.0;
	ALPHA = band * alpha;
}
"""
	return _ring_shader


static func _free_after(node: Node, seconds: float) -> void:
	var timer: SceneTreeTimer = node.get_tree().create_timer(seconds)
	timer.timeout.connect(node.queue_free)
