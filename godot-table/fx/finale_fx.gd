# A cena do fim da partida, em uns 3 s: na vitória, raios de luz descendo, folhas de ouro caindo, fogos dourados e as
# suas cartas acesas; na derrota, a mesa perde a cor e escurece e caem cinzas com algumas brasas.
class_name FinaleFx
extends RefCounted

const GRADE := preload("res://fx/screen_grade.gdshader")
## Quanto a tela do resultado espera antes de entrar (o começo da cena fica à vista, sem o desfoque por cima).
const LEAD := 0.8
const GOLD := Color(1.0, 0.78, 0.3)
const LEAF_COLORS: Array[Color] = [Color(1.0, 0.8, 0.32), Color(1.0, 0.68, 0.18), Color(1.0, 0.9, 0.55), Color(0.92, 0.6, 0.2), Color(1.0, 0.97, 0.85)]
const ASH_COLORS: Array[Color] = [Color(0.12, 0.11, 0.12), Color(0.2, 0.19, 0.19), Color(0.08, 0.075, 0.08), Color(0.28, 0.26, 0.25)]


## Toca a cena. `you`: o seu id (as suas cartas acendem na vitória).
static func play(parent: Node3D, table: TableView, won: bool, you: int, mood: TableMood = null) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	if won:
		_victory(parent, table, you, mood)
	else:
		_defeat(parent, table, mood)


static func _victory(parent: Node3D, table: TableView, you: int, mood: TableMood) -> void:
	var home: Vector3 = table.seat_center(you) if table else Vector3(0, 0, 1.5)
	if mood:
		mood.pulse(GOLD, 2.4)
	MomentExtras.flare(parent, Vector3(0, 2.2, 0.6), GOLD, 4.5, 0.9)
	Fx.light(parent, Vector3(0, 1.0, 0.6), GOLD, 7.0, 12.0, 1.4)
	MomentExtras.shafts(parent, Vector3(home.x, 0, lerpf(0.6, home.z, 0.5)), Color(1.0, 0.86, 0.55), 6, 3.0, 3.2, 0.32)
	MomentPieces.after(parent, 0.1, func() -> void:
		MomentExtras.leaves(parent, Vector3(0, 0, 0.4), LEAF_COLORS, 240, 2.4, Vector2(11.0, 6.5), 0.08, 1.5, 1.4))
	for i: int in 4:
		var pos := Vector3(randf_range(-4.5, 4.5), randf_range(1.6, 2.8), randf_range(-2.4, 0.6))
		MomentPieces.after(parent, 0.25 + i * 0.32, func() -> void:
			Fx.burst(parent, pos, GOLD if i % 2 == 0 else GOLD.lightened(0.4), 80, 3.2, 1.1, 0.06, -1.2)
			MomentExtras.flare(parent, pos, GOLD.lightened(0.3), 1.6, 0.5)
			Fx.light(parent, pos, GOLD, 3.5, 6.0, 0.7))
	_glow_cards(parent, table, you)
	if table:
		MomentPieces.dolly(table.camera, home, 0.08, 2.6, 0.1)


## As suas permanentes acendem uma depois da outra, do meio para as pontas: a luz corre a borda e uma faixa atravessa a face.
static func _glow_cards(parent: Node3D, table: TableView, you: int) -> void:
	if table == null:
		return
	var nodes: Array[CardNode] = []
	for key: Variant in table.card_keys():
		if not key is int or table.zone_of(key) != "battlefield":
			continue
		var node: CardNode = table.card_node(key)
		if node and int(node.data.get("controller", -1)) == you:
			nodes.append(node)
	nodes.sort_custom(func(a: CardNode, b: CardNode) -> bool: return absf(a.global_position.x) < absf(b.global_position.x))
	for i: int in nodes.size():
		var ref: WeakRef = weakref(nodes[i])
		MomentPieces.after(parent, 0.3 + minf(i * 0.06, 0.9), func() -> void:
			var node: CardNode = ref.get_ref() as CardNode
			if node:
				CardGlow.trace(node, GOLD, 0.7)
				CardGlow.sweep(node, GOLD.lightened(0.2), 0.6))


static func _defeat(parent: Node3D, table: TableView, mood: TableMood) -> void:
	if mood:
		mood.pulse(Color(0.3, 0.32, 0.45), 1.5)
	var camera: Camera3D = table.camera if table else parent.get_viewport().get_camera_3d()
	if camera:
		_grade(camera, 0.85, 0.5, Color(0.92, 0.95, 1.05), 3.4)
		Fx.shake(camera, 0.05, 0.6)
	MomentPieces.after(parent, 0.15, func() -> void:
		MomentExtras.leaves(parent, Vector3(0, 0, 0.4), ASH_COLORS, 240, 3.0, Vector2(12.0, 7.0), 0.055, 0.35, 0.05, 0.15, 3.5, 0.9))
	Fx.burst(parent, Vector3(0, 0.3, 0.6), Color(0.55, 0.3, 0.7), 60, 2.4, 1.4, 0.06, 0.6)


## A tela perde a cor (`gray`) e escurece pelas bordas (`dark`), segura e volta, em `total` segundos.
static func _grade(camera: Camera3D, gray: float, dark: float, tint: Color, total: float) -> void:
	if Fx.quality == 0:
		return
	var quad := MeshInstance3D.new()
	quad.mesh = QuadMesh.new()
	var material := ShaderMaterial.new()
	material.shader = GRADE
	material.set_shader_parameter("tint", tint)
	# Antes de todo efeito transparente: as cinzas e as faíscas ficam por cima, com a cor delas.
	material.render_priority = -100
	quad.material_override = material
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.extra_cull_margin = 16384.0
	quad.position = Vector3(0, 0, -1.0)
	camera.add_child(quad)
	var set_amount: Callable = func(k: float) -> void:
		material.set_shader_parameter("gray", gray * k)
		material.set_shader_parameter("dark", dark * k)
	var tween := quad.create_tween()
	tween.tween_method(set_amount, 0.0, 1.0, total * 0.35).set_trans(Tween.TRANS_SINE)
	tween.tween_interval(total * 0.4)
	tween.tween_method(set_amount, 1.0, 0.0, total * 0.25).set_trans(Tween.TRANS_SINE)
	tween.tween_callback(quad.queue_free)
