# Feixe de energia entre dois pontos, desenhado num shader: o raio que corre do lugar antigo da carta até o novo
# (mudança de controle), a corrente de elos de luz da aura até quem a recebe (anexar) e a coluna de luz fina de onde a
# carta achada sobe (busca no grimório). Uma malha só, montada uma vez ao longo da curva e de frente para a câmera; o
# shader anima a cabeça, a cauda e o fluxo, e o nó se apaga sozinho no fim.
class_name EnergyBeam
extends MeshInstance3D

const SHADER := preload("res://fx/energy_beam.gdshader")
const SEGMENTS := 40

enum Style { BOLT, CHAIN, PILLAR }

var _material := ShaderMaterial.new()
var _points := PackedVector3Array()


## Raio de `from` até `to` em arco: a cabeça corre em `grow` s, segura e se recolhe para o destino. Devolve o feixe.
static func bolt(parent: Node3D, from: Vector3, to: Vector3, color: Color, grow: float = 0.3, hold: float = 0.15) -> EnergyBeam:
	var lift: float = clampf(from.distance_to(to) * 0.22, 0.35, 1.4)
	var beam := _make(parent, Style.BOLT, _arc(from, to, lift), color, 0.22)
	var tween: Tween = beam._tween()
	tween.tween_method(beam._param.bind("head"), 0.0, 1.0, grow).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_interval(hold)
	tween.tween_method(beam._param.bind("tail"), 0.0, 1.0, grow * 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(beam._param.bind("alpha"), 1.0, 0.0, grow * 0.8).set_ease(Tween.EASE_IN)
	tween.tween_callback(beam.queue_free)
	return beam


## Corrente de luz de `from` (a aura) até `to` (quem a recebe): estende-se em `grow` s, um pulso corre por ela, ela se
## estica e some. `on_reach` toca quando a ponta chega.
static func chain(parent: Node3D, from: Vector3, to: Vector3, color: Color, grow: float = 0.28, on_reach: Callable = Callable()) -> EnergyBeam:
	var dist: float = from.distance_to(to)
	var lift: float = clampf(dist * 0.3, 0.3, 1.2)
	var beam := _make(parent, Style.CHAIN, _arc(from, to, lift), color, 0.085)
	beam._material.set_shader_parameter("links", maxf(4.0, round(beam._length() / 0.16)))
	beam._material.set_shader_parameter("hot", Color(1.0, 0.93, 0.72))
	var tween: Tween = beam._tween()
	tween.tween_method(beam._param.bind("head"), 0.0, 1.0, grow).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	if on_reach.is_valid():
		tween.tween_callback(on_reach)
	tween.tween_method(beam._param.bind("pulse"), -0.1, 1.1, grow * 1.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_method(beam._param.bind("alpha"), 1.0, 0.0, 0.3).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(beam._param.bind("tail"), 0.0, 0.6, 0.3).set_ease(Tween.EASE_IN)
	tween.tween_callback(beam.queue_free)
	return beam


## Coluna de luz fina de `base` subindo `height`, que cresce, fica `hold` s e se apaga.
static func pillar(parent: Node3D, base: Vector3, height: float, color: Color, hold: float = 0.4, half_width: float = 0.32) -> EnergyBeam:
	var line := PackedVector3Array()
	for i: int in SEGMENTS + 1:
		line.append(base + Vector3(0, height * i / float(SEGMENTS), 0))
	var beam := _make(parent, Style.PILLAR, line, color, half_width)
	beam._material.set_shader_parameter("alpha", 0.0)
	var tween: Tween = beam._tween()
	tween.tween_method(beam._param.bind("head"), 0.0, 1.0, 0.22).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_method(beam._param.bind("alpha"), 0.0, 1.0, 0.12)
	tween.tween_interval(hold)
	tween.tween_method(beam._param.bind("alpha"), 1.0, 0.0, 0.3).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(beam._param.bind("tail"), 0.0, 0.5, 0.3).set_ease(Tween.EASE_IN)
	tween.tween_callback(beam.queue_free)
	return beam


## Um ponto da curva (0 a 1) do feixe: para pôr faíscas ou luz na cabeça dele.
func point_at(t: float) -> Vector3:
	if _points.is_empty():
		return global_position
	var f: float = clampf(t, 0.0, 1.0) * (_points.size() - 1)
	var i: int = mini(int(f), _points.size() - 2)
	return _points[i].lerp(_points[i + 1], f - i)


static func _make(parent: Node3D, style: int, points: PackedVector3Array, color: Color, half_width: float) -> EnergyBeam:
	var beam := EnergyBeam.new()
	beam._points = points
	beam.top_level = true
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam._material.shader = SHADER
	beam._material.set_shader_parameter("style", style)
	beam._material.set_shader_parameter("color", color)
	beam._material.set_shader_parameter("hot", color.lerp(Color.WHITE, 0.7))
	beam._material.set_shader_parameter("head", 0.0)
	beam._material.set_shader_parameter("seed", randf() * 50.0)
	beam.material_override = beam._material
	parent.add_child(beam)
	beam.global_transform = Transform3D.IDENTITY
	beam.mesh = beam._ribbon(half_width)
	return beam


## A curva de `from` até `to` subindo `lift` no meio (e um pouco de lado, para não ser uma reta perfeita).
static func _arc(from: Vector3, to: Vector3, lift: float) -> PackedVector3Array:
	var flat := Vector3(to.x - from.x, 0, to.z - from.z)
	var side: Vector3 = flat.cross(Vector3.UP).normalized() * flat.length() * 0.08 if flat.length() > 0.01 else Vector3.ZERO
	var c1: Vector3 = from + Vector3(0, lift, 0) + (to - from) * 0.2 + side
	var c2: Vector3 = to + Vector3(0, lift * 0.75, 0) - (to - from) * 0.2 + side * 0.5
	var out := PackedVector3Array()
	for i: int in SEGMENTS + 1:
		var t: float = i / float(SEGMENTS)
		var u: float = 1.0 - t
		out.append(from * (u * u * u) + c1 * (3.0 * u * u * t) + c2 * (3.0 * u * t * t) + to * (t * t * t))
	return out


## A fita ao longo dos pontos, de frente para a câmera (a câmera da mesa não anda enquanto o feixe dura).
func _ribbon(half_width: float) -> ImmediateMesh:
	var camera: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null
	var eye: Vector3 = camera.global_position if camera else TableView.CAMERA_POS
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	var count: int = _points.size()
	for i: int in count:
		var p: Vector3 = _points[i]
		var tangent: Vector3 = _points[mini(i + 1, count - 1)] - _points[maxi(i - 1, 0)]
		var side: Vector3 = tangent.normalized().cross((eye - p).normalized()).normalized()
		# Perto da câmera (a pilha no painel) o feixe afina junto: o mesmo tamanho na tela.
		var w: float = half_width * Fx.depth_scale(self, p)
		mesh.surface_set_uv(Vector2(i / float(count - 1), 0.0))
		mesh.surface_add_vertex(p - side * w)
		mesh.surface_set_uv(Vector2(i / float(count - 1), 1.0))
		mesh.surface_add_vertex(p + side * w)
	mesh.surface_end()
	return mesh


func _length() -> float:
	var total: float = 0.0
	for i: int in range(1, _points.size()):
		total += _points[i].distance_to(_points[i - 1])
	return total


func _param(value: float, key: String) -> void:
	_material.set_shader_parameter(key, value)


func _tween() -> Tween:
	return create_tween()
