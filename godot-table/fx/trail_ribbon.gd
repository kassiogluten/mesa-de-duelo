# Rastro em fita para o que voa (a carta entre as zonas, a gota de mana, a carta achada): segue um nó e deixa atrás dele
# uma fita macia que some com a idade. Na carta, a fita tem a largura dela e sai da borda de trás (o borrão do movimento,
# que gira junto quando a carta vira); no cometa, é fina e de frente para a câmera. Só lê onde o nó está: não mexe no voo.
class_name TrailRibbon
extends MeshInstance3D

const SHADER := preload("res://fx/trail_ribbon.gdshader")
## Pontos a mais que isto saem pela cauda.
const MAX_POINTS := 40
## Distância mínima entre dois pontos (até lá, o ponto da cabeça anda junto com o nó).
const STEP := 0.03
## Um salto maior que isto num quadro é a carta posta no lugar, não um voo: a fita recomeça dali.
const TELEPORT := 2.5

enum Mode { CARD, COMET }

var mode: int = Mode.CARD
## Quanto tempo cada ponto vive (s): o comprimento da fita no tempo.
var life: float = 0.16
## No cometa, a meia largura (unidades da mesa, na escala do nó); na carta, a fração da largura da carta.
var width: float = 0.9
## Abaixo desta velocidade (unidades/s) a fita não cresce: a carta que freia para de deixar rastro.
var min_speed: float = 0.0
## Desligado, a fita para de crescer, termina de sumir e se apaga sozinha.
var emitting: bool = true

var _target: WeakRef
var _mesh := ImmediateMesh.new()
var _material := ShaderMaterial.new()
## Cada ponto: as duas bordas (na carta) ou o centro e a meia largura (no cometa), e quando nasceu.
var _a := PackedVector3Array()
var _b := PackedVector3Array()
var _w := PackedFloat32Array()
var _born := PackedFloat32Array()
var _last := Vector3.INF
var _clock: float = 0.0


## A fita da carta `node` (uma CardNode ou qualquer Node3D do tamanho de uma carta), na cor, com a força `strength`.
static func card(parent: Node, node: Node3D, color: Color, strength: float = 0.35, life_time: float = 0.16) -> TrailRibbon:
	var trail := TrailRibbon.new()
	trail.mode = Mode.CARD
	trail.life = life_time
	trail._setup(node, color, color.lerp(Color.WHITE, 0.15), strength, 0.0)
	parent.add_child(trail)
	return trail


## O cometa atrás de `node` (a gota de mana, a carta achada): fino, de frente para a câmera, quente na cabeça.
static func comet(parent: Node, node: Node3D, color: Color, half_width: float = 0.06, life_time: float = 0.22, strength: float = 1.0) -> TrailRibbon:
	var trail := TrailRibbon.new()
	trail.mode = Mode.COMET
	trail.life = life_time
	trail.width = half_width
	trail._setup(node, color.lerp(Color.WHITE, 0.25), color.darkened(0.15), strength, 1.0)
	parent.add_child(trail)
	return trail


func _setup(node: Node3D, color: Color, tail: Color, strength: float, core: float) -> void:
	_target = weakref(node)
	top_level = true
	mesh = _mesh
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_material.shader = SHADER
	_material.set_shader_parameter("color", color)
	_material.set_shader_parameter("tail", tail)
	_material.set_shader_parameter("intensity", strength)
	_material.set_shader_parameter("core", core)
	_material.set_shader_parameter("seed", randf() * 10.0)
	material_override = _material


## Muda a força (a fita some junto com o que ela segue).
func set_strength(strength: float) -> void:
	_material.set_shader_parameter("intensity", strength)


func _ready() -> void:
	global_transform = Transform3D.IDENTITY


func _process(delta: float) -> void:
	_clock += delta
	var node: Node3D = _target.get_ref() as Node3D if _target else null
	if node == null or not is_instance_valid(node) or not node.is_inside_tree() or node.is_queued_for_deletion():
		emitting = false
	elif emitting and node.is_visible_in_tree():
		_sample(node, delta)
	_trim()
	if _born.is_empty() and not emitting:
		queue_free()
		return
	_rebuild()


func _sample(node: Node3D, delta: float) -> void:
	var t: Transform3D = node.global_transform
	var pos: Vector3 = t.origin
	if _last == Vector3.INF or pos.distance_to(_last) > TELEPORT:
		_last = pos
		return
	var motion: Vector3 = pos - _last
	var speed: float = motion.length() / maxf(delta, 0.0001)
	_last = pos
	if speed < min_speed or motion.length() < 0.0005:
		return
	var a: Vector3
	var b: Vector3
	var w: float = 1.0
	if mode == Mode.CARD:
		var edges: Array = card_edges(t, motion, width)
		a = edges[0]
		b = edges[1]
	else:
		a = pos
		b = pos
		w = width * t.basis.get_scale().x
	if not _born.is_empty() and _mid(0).distance_to((a + b) * 0.5) < STEP:
		# Perto do último ponto: a cabeça anda junto com o nó.
		_a[0] = a
		_b[0] = b
		_w[0] = w
		_born[0] = _clock
		return
	_a.insert(0, a)
	_b.insert(0, b)
	_w.insert(0, w)
	_born.insert(0, _clock)
	if _born.size() > MAX_POINTS:
		_a.resize(MAX_POINTS)
		_b.resize(MAX_POINTS)
		_w.resize(MAX_POINTS)
		_born.resize(MAX_POINTS)


## As duas pontas da borda de trás de uma carta na pose `t` andando em `motion`: a fita sai dali, com a largura da carta
## de lado (no plano da carta, de través ao movimento), vezes `fraction`.
static func card_edges(t: Transform3D, motion: Vector3, fraction: float) -> Array:
	var x: Vector3 = t.basis.x
	var z: Vector3 = t.basis.z
	var s: float = x.length()
	x = x / maxf(s, 0.0001)
	z = z.normalized()
	var normal: Vector3 = t.basis.y.normalized()
	var flat: Vector3 = motion - normal * motion.dot(normal)
	if flat.length() < motion.length() * 0.2:
		# Andando de frente para a face (caindo deitada): a fita sai do meio, larga como a carta.
		flat = motion
	var dir: Vector3 = flat.normalized()
	var side: Vector3 = dir.cross(normal)
	side = side.normalized() if side.length() > 0.0001 else x
	var back: float = 0.5 * (absf(dir.dot(x)) * CardNode.SIZE.x + absf(dir.dot(z)) * CardNode.SIZE.y) * s
	var half: float = 0.5 * (absf(side.dot(x)) * CardNode.SIZE.x + absf(side.dot(z)) * CardNode.SIZE.y) * s * fraction
	var at: Vector3 = t.origin - dir * back * 0.92
	return [at - side * half, at + side * half]


func _mid(i: int) -> Vector3:
	return (_a[i] + _b[i]) * 0.5


func _trim() -> void:
	var n: int = _born.size()
	while n > 0 and _clock - _born[n - 1] > life:
		n -= 1
	if n != _born.size():
		_a.resize(n)
		_b.resize(n)
		_w.resize(n)
		_born.resize(n)


func _rebuild() -> void:
	_mesh.clear_surfaces()
	var count: int = _born.size()
	if count < 2:
		return
	var eye := Vector3(0, 10, 6)
	if mode == Mode.COMET:
		var camera: Camera3D = get_viewport().get_camera_3d()
		if camera:
			eye = camera.global_position
	_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for i: int in count:
		var age: float = clampf((_clock - _born[i]) / life, 0.0, 1.0)
		var a: Vector3 = _a[i]
		var b: Vector3 = _b[i]
		if mode == Mode.COMET:
			var p: Vector3 = _a[i]
			var tangent: Vector3 = _a[maxi(i - 1, 0)] - _a[mini(i + 1, count - 1)]
			if tangent.length() < 0.0001:
				tangent = Vector3.FORWARD
			var side: Vector3 = tangent.normalized().cross((eye - p).normalized()).normalized()
			var w: float = _w[i] * (1.0 - age * 0.7)
			a = p - side * w
			b = p + side * w
		_mesh.surface_set_color(Color(1, 1, 1, 1.0 - age * 0.2))
		_mesh.surface_set_uv(Vector2(age, 0.0))
		_mesh.surface_add_vertex(a)
		_mesh.surface_set_color(Color(1, 1, 1, 1.0 - age * 0.2))
		_mesh.surface_set_uv(Vector2(age, 1.0))
		_mesh.surface_add_vertex(b)
	_mesh.surface_end()
