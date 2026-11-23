# Peças dos efeitos da mesa 3D: faíscas (partículas na GPU), onda de choque no tampo, gota de luz com rastro, número que
# sobe, coluna de luz, clarão de luz de verdade e tremor de câmera. Cada peça se apaga sozinha quando termina.
class_name Fx
extends RefCounted

## 0: leve (metade das partículas), 1: normal, 2: caprichado. O diretor baixa quando os quadros caem.
static var quality: int = 2

## Distância da câmera ao meio da mesa: o tamanho dos efeitos é pensado para lá.
const TABLE_DISTANCE := 10.2

static var _spark_mesh: QuadMesh
static var _ring_shader: Shader
static var _pillar_shader: Shader


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
## `gravity` puxa para baixo (negativo) ou faz subir (positivo, as brasas).
static func burst(parent: Node3D, pos: Vector3, color: Color, amount: int = 60, spread: float = 2.6, life: float = 0.7, size: float = 0.13, gravity: float = -3.5) -> void:
	# Perto da câmera (a pilha no painel, o cemitério na beirada de baixo) as faíscas encolhem junto: o mesmo tamanho na
	# tela que no meio da mesa, em vez de bolhas enormes.
	var near: float = depth_scale(parent, pos)
	size *= near
	spread *= near
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
	process.gravity = Vector3(0, gravity, 0)
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


## Quanto encolher um efeito em `pos` para ele ter na tela o tamanho que teria no meio da mesa (1 lá, menos perto da câmera).
static func depth_scale(parent: Node3D, pos: Vector3) -> float:
	var camera: Camera3D = parent.get_viewport().get_camera_3d() if parent.is_inside_tree() else null
	if camera == null:
		return 1.0
	return clampf(camera.global_position.distance_to(pos) / TABLE_DISTANCE, 0.3, 1.15)


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


## Projétil em arco de `from` até `to`: a gota de luz (ManaOrb: o núcleo do projétil das mágicas em pequeno, com um
## cometa atrás e faíscas) que se funde no destino com um clarão pequeno; `on_hit` roda quando chega. `size` escala a
## gota. Para o golpe de uma mágica com alvo, SpellMissile.
static func bolt(parent: Node3D, from: Vector3, to: Vector3, color: Color, duration: float = 0.35, on_hit: Callable = Callable(), size: float = 1.0) -> void:
	var orb: ManaOrb = ManaOrb.launch(parent, from, to, color, duration, on_hit)
	orb.size = size * 1.6


## Texto que sobe e some (marcadores, avisos), sempre de frente para a câmera e sem sair da tela pelos lados. `rise`: quanto sobe.
static func float_text(parent: Node3D, pos: Vector3, text: String, color: Color, size: int = 72, duration: float = 1.1, rise: float = 0.9) -> void:
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
	label.position = inside_screen(parent, pos + Vector3(0, 0.5, 0), text.length() * size * 0.006 * 0.55)
	label.scale = Vector3.ONE * 0.4
	parent.add_child(label)
	var tween := label.create_tween()
	tween.tween_property(label, "scale", Vector3.ONE * 1.15, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "scale", Vector3.ONE, 0.1)
	tween.parallel().tween_property(label, "position:y", label.position.y + rise, duration).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(label, "modulate:a", 0.0, duration * 0.5).set_delay(duration * 0.5)
	tween.tween_callback(label.queue_free)


## O ponto `pos` puxado para dentro da tela na horizontal, para um texto de `width` (unidades da mesa) caber inteiro
## (a pilha fica na beirada direita: "Anulada" saía cortado).
static func inside_screen(parent: Node3D, pos: Vector3, width: float, margin: float = 16.0) -> Vector3:
	var camera: Camera3D = parent.get_viewport().get_camera_3d() if parent.is_inside_tree() else null
	if camera == null or camera.is_position_behind(pos):
		return pos
	var screen: Vector2 = camera.unproject_position(pos)
	var right: Vector3 = camera.global_basis.x
	var half: float = absf(camera.unproject_position(pos + right * width * 0.5).x - screen.x)
	var view: float = camera.get_viewport().get_visible_rect().size.x
	var x: float = clampf(screen.x, margin + half, view - margin - half) if view > 2.0 * (margin + half) else view * 0.5
	if is_equal_approx(x, screen.x):
		return pos
	var depth: float = -(camera.global_transform.affine_inverse() * pos).z
	return camera.project_position(Vector2(x, screen.y), depth)


## Coluna de luz que desce sobre `pos` (lendária entrando, mágica grande resolvendo): núcleo claro e bordas que se
## esfumam, mais forte embaixo, com faixas que correm para cima.
static func pillar(parent: Node3D, pos: Vector3, color: Color, height: float = 6.0, duration: float = 0.9) -> void:
	var beam := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.42
	cylinder.bottom_radius = 0.42
	cylinder.height = height
	cylinder.radial_segments = 32
	cylinder.cap_top = false
	cylinder.cap_bottom = false
	beam.mesh = cylinder
	var material := ShaderMaterial.new()
	material.shader = _pillar()
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("alpha", 0.0)
	beam.material_override = material
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam.position = pos + Vector3(0, height / 2.0, 0)
	beam.scale = Vector3(0.2, 1, 0.2)
	parent.add_child(beam)
	var set_alpha: Callable = func(a: float) -> void: material.set_shader_parameter("alpha", a)
	var tween := beam.create_tween().set_parallel(true)
	tween.tween_method(set_alpha, 0.0, 1.0, duration * 0.2)
	tween.tween_property(beam, "scale", Vector3(1, 1, 1), duration * 0.3).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.chain().tween_method(set_alpha, 1.0, 0.0, duration * 0.7).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(beam, "scale", Vector3(0.1, 1, 0.1), duration * 0.7).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(beam.queue_free)


## A câmera se aproxima um pouco do lance (momento grande) e volta: `amount` é quanto do caminho até ele.
static func focus(camera: Camera3D, target: Vector3, amount: float = 0.12, duration: float = 0.9) -> void:
	if camera == null or quality == 0:
		return
	# Volta para o lugar de sempre da câmera, não para onde ela estava: dois focos seguidos não a deixam torta.
	var home: Vector3 = TableView.CAMERA_POS
	var near: Vector3 = home.lerp(target, amount)
	var tween := camera.create_tween()
	tween.tween_property(camera, "position", near, duration * 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_interval(duration * 0.25)
	tween.tween_property(camera, "position", home, duration * 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)


## Tremor de câmera curto (golpe grande, eliminação), pelo deslocamento da lente: não mexe na posição, que o foco anima.
static func shake(camera: Camera3D, strength: float = 0.12, duration: float = 0.35) -> void:
	MomentPieces.shake(camera, strength, duration)


## Empurrão da câmera na direção do golpe (só nos golpes grandes): a lente vai um pouco para o lado em que o golpe
## corre e volta com uma mola. `direction` é a direção do golpe na mesa.
static func nudge(camera: Camera3D, direction: Vector3, strength: float = 0.08, duration: float = 0.32) -> void:
	if camera == null or quality == 0 or direction.length() < 0.001:
		return
	var side: Vector2 = Vector2(direction.dot(camera.global_basis.x), direction.dot(camera.global_basis.y) - direction.dot(camera.global_basis.z) * 0.5)
	side = side.normalized() * strength if side.length() > 0.001 else Vector2(0, -strength)
	var tween := camera.create_tween()
	tween.tween_method(func(t: float) -> void:
		# Chega rápido e volta oscilando (mola amortecida).
		var k: float = sin(minf(t * 3.2, 1.0) * PI * 0.5) if t < 0.3 else exp(-6.0 * (t - 0.3)) * cos((t - 0.3) * 18.0)
		camera.h_offset = side.x * k
		camera.v_offset = side.y * k, 0.0, 1.0, duration)
	tween.tween_callback(func() -> void:
		camera.h_offset = 0.0
		camera.v_offset = 0.0)


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


## Material de luz macia de frente para a câmera (a bola do projétil): um ponto radial somando luz, na cor.
static func _glow_material(color: Color) -> StandardMaterial3D:
	var base: StandardMaterial3D = _spark().material as StandardMaterial3D
	var material: StandardMaterial3D = base.duplicate() as StandardMaterial3D
	material.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	material.vertex_color_use_as_albedo = false
	material.albedo_color = color
	return material


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


static func _pillar() -> Shader:
	if _pillar_shader == null:
		_pillar_shader = Shader.new()
		_pillar_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 1.0;
void fragment() {
	// De frente para quem olha (o meio da coluna), forte; nas bordas, some: um feixe macio, não um tubo chapado.
	float core = pow(abs(dot(NORMAL, VIEW)), 2.5);
	// UV.y 0 no alto: some em cima, forte embaixo, com faixas que sobem.
	float fall = pow(UV.y, 1.6);
	float bands = 0.75 + 0.25 * sin(UV.y * 40.0 + TIME * 14.0);
	ALBEDO = mix(color.rgb, vec3(1.0), core * 0.5) * 1.6;
	ALPHA = core * fall * bands * alpha * 0.85;
}
"""
	return _pillar_shader


static func _free_after(node: Node, seconds: float) -> void:
	var timer: SceneTreeTimer = node.get_tree().create_timer(seconds)
	timer.timeout.connect(node.queue_free)
