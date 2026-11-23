# Setas em arco na mesa 3D (alvo, ataque, bloqueio): uma fita curva com ponta, refeita a cada quadro para seguir as cartas;
# a seta que segue o mouse (mirando um alvo, arrastando um atacante, escolhendo quem bloquear) é tracejada e anda.
class_name Arrows
extends MeshInstance3D

const SEGMENTS := 28
const WIDTH := 0.09
const HEAD := 0.26

## [{from: Vector3, to: Vector3, color: Color, live: bool}] — as pontas já em coordenadas da mesa, atualizadas por quem desenha.
var arrows: Array = []
var _mesh := ImmediateMesh.new()
var _material := StandardMaterial3D.new()
var _time: float = 0.0


func _ready() -> void:
	mesh = _mesh
	_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_material.vertex_color_use_as_albedo = true
	_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_material.no_depth_test = true
	_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_material.render_priority = 10
	material_override = _material
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _process(delta: float) -> void:
	_time += delta
	_mesh.clear_surfaces()
	if arrows.is_empty():
		return
	_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for raw: Variant in arrows:
		var arrow: Dictionary = raw
		_draw(arrow["from"], arrow["to"], arrow["color"], bool(arrow.get("live", false)))
	_mesh.surface_end()


## Um arco de `a` até `b` que sobe no meio, com a ponta deitada na direção do alvo; a cor pulsa de leve. A seta viva
## (`live`) é tracejada, com os traços correndo para a ponta, e a ponta maior.
func _draw(a: Vector3, b: Vector3, color: Color, live: bool = false) -> void:
	var lift: float = clamp(a.distance_to(b) * 0.28, 0.4, 2.2)
	var mid: Vector3 = (a + b) * 0.5 + Vector3(0, lift, 0)
	var points: Array[Vector3] = []
	for i: int in SEGMENTS + 1:
		var t: float = float(i) / SEGMENTS * 0.92
		points.append(a.lerp(mid, t).lerp(mid.lerp(b, t), t))
	var pulse: float = 0.75 + 0.25 * sin(_time * 5.0)
	for i: int in SEGMENTS:
		var p0: Vector3 = points[i]
		var p1: Vector3 = points[i + 1]
		var side: Vector3 = (p1 - p0).cross(Vector3.UP).normalized() * WIDTH * 0.5
		var fade0: float = float(i) / SEGMENTS
		var fade1: float = float(i + 1) / SEGMENTS
		if live and dash_gap(float(i) / SEGMENTS, _time):
			continue
		var c0 := Color(color, (0.25 + 0.75 * fade0) * pulse)
		var c1 := Color(color, (0.25 + 0.75 * fade1) * pulse)
		_quad(p0 - side, p0 + side, p1 + side, p1 - side, c0, c1)
	# Ponta: um triângulo do fim da fita até o alvo.
	var tail: Vector3 = points[SEGMENTS]
	var dir: Vector3 = (b - tail).normalized()
	var across: Vector3 = dir.cross(Vector3.UP).normalized() * HEAD * (0.8 if live else 0.6)
	var tip_color := Color(color.lightened(0.15) if live else color, 1.0 if live else pulse)
	_vertex(tail - across, tip_color)
	_vertex(tail + across, tip_color)
	_vertex(b, tip_color)


## Na seta viva, se o pedaço em `t` (0 na origem, 1 na ponta) cai num vão do tracejado; os traços andam com o tempo.
static func dash_gap(t: float, time: float) -> bool:
	return fposmod(t * 7.0 - time * 2.2, 1.0) > 0.62


func _quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, c0: Color, c1: Color) -> void:
	_vertex(a, c0)
	_vertex(b, c0)
	_vertex(c, c1)
	_vertex(a, c0)
	_vertex(c, c1)
	_vertex(d, c1)


func _vertex(p: Vector3, color: Color) -> void:
	_mesh.surface_set_color(color)
	_mesh.surface_add_vertex(p)
