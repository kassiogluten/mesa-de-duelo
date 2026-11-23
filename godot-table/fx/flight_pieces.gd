# Peças das cartas voando (CardFlights): a pose no voo, a carta temporária, o movimento entre duas poses, o rastro da
# carta, a luz que atravessa a face ao revelar, o halo macio do leque, os fiapos de luz que saem do monte, o título e a
# carta de verdade escondida até a temporária pousar exatamente no lugar dela.
class_name FlightPieces
extends RefCounted

const CARD_SIZE := Vector2(0.63, 0.88)
const GOLD := Color(1.0, 0.78, 0.32)

static var _flutter_quad: QuadMesh


## Uma pose da carta no voo: posição, giro, tamanho e o quanto está virada (1 de costas, 0 de face para cima).
class Pose:
	var pos: Vector3
	var rot: Quaternion
	var size: float
	var flip: float

	func _init(at: Vector3, basis: Basis, scale: float, turned: float) -> void:
		pos = at
		rot = basis.orthonormalized().get_rotation_quaternion()
		size = scale
		flip = turned

	## A pose de uma carta deitada de face na mesa em `t` (o lugar que a mesa deu à carta de verdade).
	static func resting(t: Transform3D, turned: float = 0.0) -> Pose:
		return Pose.new(t.origin, t.basis, t.basis.get_scale().x, turned)


## Esconde a carta de verdade da mesa enquanto a temporária voa até o lugar dela; devolve-a no pouso (`reveal`), ou
## quando o voo acaba de qualquer jeito (o nó sai da árvore).
class Concealer:
	extends Node
	var card: WeakRef
	var was_visible: bool = true
	var done: bool = false

	func _process(_delta: float) -> void:
		var node: Node3D = card.get_ref() as Node3D if card else null
		if node == null or done:
			return
		node.visible = false

	func reveal() -> void:
		if done:
			return
		done = true
		var node: Node3D = card.get_ref() as Node3D if card else null
		if node and is_instance_valid(node) and was_visible:
			node.visible = true

	func _exit_tree() -> void:
		reveal()


## O nó que guarda as cartas de um efeito; ele (e o que sobrar nele) se apaga `tail` depois do fim.
static func holder(parent: Node3D, total: float, tail: float) -> Node3D:
	var node := Node3D.new()
	node.name = "CardFlights"
	parent.add_child(node)
	var tween: Tween = node.create_tween()
	tween.tween_interval(total + tail)
	tween.tween_callback(node.queue_free)
	return node


## Esconde `real` (a carta da mesa) até `reveal()` do que volta; null se não há carta de verdade.
static func conceal(holder_node: Node3D, real: CardNode) -> Concealer:
	if real == null or not is_instance_valid(real):
		return null
	var keeper := Concealer.new()
	keeper.card = weakref(real)
	keeper.was_visible = real.visible
	real.visible = false
	holder_node.add_child(keeper)
	return keeper


## Uma carta temporária, escondida e parada em `at` até o voo dela começar; sem área de clique.
static func new_card(holder_node: Node3D, catalog: CardCatalog, card: Dictionary, sleeve: Color, at: Pose) -> CardNode:
	var node := CardNode.new()
	for child: Node in node.get_children():
		if child is Area3D:
			(child as Area3D).input_ray_pickable = false
	node.visible = false
	holder_node.add_child(node)
	node.transform = blend(at, at, 0.0, 0.0, 0.0)
	var name: String = Txt.of(card.get("name", ""))
	node.set_data(card, sleeve, catalog.label(name) if catalog and name != "" else name, false)
	if catalog and name != "":
		_bind_texture(node, catalog, card)
	return node


## Põe a imagem da carta e a troca quando os dados ou a imagem chegarem; solta os sinais quando a carta sai.
static func _bind_texture(node: CardNode, catalog: CardCatalog, card: Dictionary) -> void:
	node.image_url = catalog.image_url_for(card)
	node.set_texture(catalog.texture(node.image_url))
	var on_texture: Callable = func(url: String, tex: Texture2D) -> void:
		if is_instance_valid(node) and url != "" and url == node.image_url:
			node.set_texture(tex)
	var on_info: Callable = func(_names: PackedStringArray) -> void:
		if not is_instance_valid(node):
			return
		var url: String = catalog.image_url_for(card)
		if url != node.image_url:
			node.image_url = url
			node.set_texture(catalog.texture(url))
	catalog.texture_ready.connect(on_texture)
	catalog.info_ready.connect(on_info)
	node.tree_exiting.connect(func() -> void:
		if is_instance_valid(catalog):
			if catalog.texture_ready.is_connected(on_texture):
				catalog.texture_ready.disconnect(on_texture)
			if catalog.info_ready.is_connected(on_info):
				catalog.info_ready.disconnect(on_info))


## Leva a carta de `a` até `b` em `duration` (com arco `lift` e crescendo `bulge` no meio); o rastro de faíscas, se
## houver, vai junto.
static func move(tween: Tween, node: Node3D, a: Pose, b: Pose, duration: float, lift: float = 0.0, bulge: float = 0.0, sparks: GPUParticles3D = null) -> MethodTweener:
	return tween.tween_method(func(t: float) -> void:
		node.transform = blend(a, b, t, lift, bulge)
		if sparks:
			sparks.position = node.position, 0.0, 1.0, duration)


static func blend(a: Pose, b: Pose, t: float, lift: float, bulge: float) -> Transform3D:
	var arc: float = sin(clampf(t, 0.0, 1.0) * PI)
	var pos: Vector3 = a.pos.lerp(b.pos, t) + Vector3.UP * arc * lift
	var rot: Quaternion = a.rot.slerp(b.rot, t)
	var flip: float = lerpf(a.flip, b.flip, smoothstep(0.1, 0.8, t))
	var size: float = lerpf(a.size, b.size, t) + arc * bulge
	return Transform3D((Basis(rot) * Basis(Vector3.BACK, PI * flip)).scaled(Vector3.ONE * size), pos)


## O rastro da carta (o borrão do movimento, que gira junto quando ela vira no ar), na cor; nada no modo leve.
static func smear(holder_node: Node3D, node: CardNode, color: Color, strength: float = 0.4, life: float = 0.17) -> TrailRibbon:
	if Fx.quality == 0:
		return null
	var trail: TrailRibbon = TrailRibbon.card(holder_node, node, color, strength, life)
	trail.min_speed = 1.2
	return trail


## A luz que atravessa a face na diagonal (a carta acabou de ser revelada), com a borda acendendo de leve.
static func sheen(node: CardNode, color: Color, duration: float = 0.38, strength: float = 1.0) -> void:
	if node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var layer: ShaderMaterial = CardGlow._layer(node, color, 0.005, duration + 0.05)
	layer.set_shader_parameter("sweep_alpha", 1.7 * strength)
	var tween: Tween = CardGlow._tween_of(layer)
	tween.tween_method(func(v: float) -> void: layer.set_shader_parameter("sweep", v), -0.2, 1.2, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_method(func(v: float) -> void: layer.set_shader_parameter("outline_alpha", v), 0.7 * strength, 0.0, duration).set_ease(Tween.EASE_IN)
	tween.tween_method(func(v: float) -> void: layer.set_shader_parameter("outline", v), 0.0, 0.025, duration).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)


## O halo macio atrás da carta no ar (o foco do leque da vidência): acende em `fade_in`, fica e apaga em `fade_out`.
static func halo(node: CardNode, color: Color, strength: float, hold: float, fade_in: float = 0.2, fade_out: float = 0.25) -> void:
	if node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var layer: ShaderMaterial = CardGlow._layer(node, color, -CardNode.THICKNESS - 0.006, fade_in + hold + fade_out + 0.05)
	var mesh: MeshInstance3D = (layer.get_meta("mesh") as WeakRef).get_ref() as MeshInstance3D
	var tween: Tween = mesh.create_tween()
	tween.tween_method(func(v: float) -> void: layer.set_shader_parameter("under", v), 0.0, strength, fade_in).set_ease(Tween.EASE_OUT)
	tween.tween_interval(hold)
	tween.tween_method(func(v: float) -> void: layer.set_shader_parameter("under", v), strength, 0.0, fade_out).set_ease(Tween.EASE_IN)


## Fiapos de luz que saem rodando da borda do monte quando uma carta sai dele (o papel raspando), poucos e rápidos.
static func flutter(parent: Node3D, pos: Vector3, color: Color, amount: int = 7, push: Vector3 = Vector3.UP) -> void:
	if Fx.quality == 0:
		return
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 0.85
	particles.amount = maxi(3, int(amount * (1.0 if Fx.quality > 1 else 0.6)))
	particles.lifetime = 0.55
	particles.local_coords = false
	particles.process_material = _flutter_process(push)
	(particles.process_material as ParticleProcessMaterial).color_ramp = _flutter_ramp(color)
	particles.draw_pass_1 = flutter_mesh()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	parent.get_tree().create_timer(0.85).timeout.connect(particles.queue_free)


## Um fiapo: um risco fino de luz que gira no plano da tela (o reflexo da borda de uma carta passando).
static func flutter_mesh() -> QuadMesh:
	if _flutter_quad == null:
		_flutter_quad = QuadMesh.new()
		_flutter_quad.size = Vector2(1.0, 0.22)
		_flutter_quad.material = Fx._spark().material
	return _flutter_quad


static func _flutter_process(push: Vector3) -> ParticleProcessMaterial:
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(CARD_SIZE.x * 0.45, 0.01, CARD_SIZE.y * 0.45)
	process.direction = push.normalized() if push.length() > 0.01 else Vector3.UP
	process.spread = 55.0
	process.initial_velocity_min = 0.4
	process.initial_velocity_max = 1.1
	process.gravity = Vector3(0, -0.9, 0)
	process.damping_min = 1.0
	process.damping_max = 2.5
	process.angle_min = -180.0
	process.angle_max = 180.0
	process.angular_velocity_min = -540.0
	process.angular_velocity_max = 540.0
	process.scale_min = 0.05
	process.scale_max = 0.1
	var shrink := Curve.new()
	shrink.add_point(Vector2(0, 1))
	shrink.add_point(Vector2(1, 0.3))
	var shrink_tex := CurveTexture.new()
	shrink_tex.curve = shrink
	process.scale_curve = shrink_tex
	return process


static func _flutter_ramp(color: Color) -> GradientTexture1D:
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lerp(Color.WHITE, 0.6), 0.75))
	ramp.set_color(1, Color(color, 0.0))
	var texture := GradientTexture1D.new()
	texture.gradient = ramp
	return texture


## Título que aparece sobre o leque e some (Cascata · 5 cartas).
static func title(holder_node: Node3D, pos: Vector3, text: String, show_for: float) -> void:
	var label := Label3D.new()
	label.text = text
	label.font_size = 64
	label.pixel_size = 0.0045
	label.outline_size = 16
	label.modulate = Color(GOLD.lightened(0.2), 0.0)
	label.outline_modulate = Color(0, 0, 0, 0.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.render_priority = 20
	label.position = pos
	holder_node.add_child(label)
	var tween: Tween = label.create_tween()
	tween.tween_property(label, "modulate:a", 1.0, 0.18)
	tween.parallel().tween_property(label, "outline_modulate:a", 0.85, 0.18)
	tween.tween_interval(maxf(0.1, show_for - 0.4))
	tween.tween_property(label, "modulate:a", 0.0, 0.22)
	tween.parallel().tween_property(label, "outline_modulate:a", 0.0, 0.22)
	tween.tween_callback(label.queue_free)


## A câmera da cena (ou a posição padrão da mesa, sem câmera).
static func view(parent: Node3D) -> Transform3D:
	var camera: Camera3D = parent.get_viewport().get_camera_3d() if parent.is_inside_tree() else null
	if camera:
		return camera.global_transform
	return Transform3D(Basis.looking_at(TableView.CAMERA_LOOK - TableView.CAMERA_POS), TableView.CAMERA_POS)


## Um ponto a `depth` da câmera no meio da tela, `raise` acima.
static func in_view(camera: Transform3D, depth: float, raise: float) -> Vector3:
	return camera.origin - camera.basis.z * depth + camera.basis.y * raise


## A carta em pé de frente para a câmera em `pos`: a face (+Y) olha para ela e o alto (-Z) aponta para cima na tela.
static func facing(camera: Transform3D, pos: Vector3) -> Basis:
	var y: Vector3 = (camera.origin - pos).normalized()
	var up: Vector3 = camera.basis.y
	var z: Vector3 = -(up - y * up.dot(y)).normalized()
	return Basis(y.cross(z), y, z)


## Do monte para o meio da mesa, no tampo (o grimório e o cemitério ficam nos cantos).
static func inward(from: Vector3) -> Vector3:
	var flat := Vector3(-from.x, 0, -from.z)
	return flat.normalized() if flat.length() > 0.01 else Vector3.ZERO


static func cards_of(cards: Array) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for raw: Variant in cards:
		out.append(raw as Dictionary if raw is Dictionary else {})
	return out


static func request(catalog: CardCatalog, cards: Array[Dictionary]) -> void:
	if catalog == null:
		return
	var names: PackedStringArray = []
	for card: Dictionary in cards:
		var name: String = Txt.of(card.get("name", ""))
		if name != "":
			names.append(name)
	catalog.request(names)
