# Setas em arco na mesa 3D (alvo, ataque, bloqueio): um feixe de energia curvo com ponta, refeito a cada quadro para seguir
# as cartas; a seta que segue o mouse (mirando um alvo, arrastando um atacante, escolhendo quem bloquear) leva pulsos
# em chevron correndo para a ponta. O desenho (núcleo, brilho, pulsos, ponta) fica no arrows.gdshader.
class_name Arrows
extends MeshInstance3D

const SHADER := preload("res://table/arrows.gdshader")
const SEGMENTS := 32
## Largura do feixe com o brilho (o núcleo claro é bem mais fino, no shader).
const WIDTH := 0.24
## A saída da carta é mais fina que o resto.
const START_WIDTH := 0.45
const HEAD := 0.27
const HEAD_LENGTH := 0.36

## [{from: Vector3, to: Vector3, color: Color, live: bool}] — as pontas já em coordenadas da mesa, atualizadas por quem desenha.
var arrows: Array = []
var _mesh := ImmediateMesh.new()
var _material := ShaderMaterial.new()
var _time: float = 0.0


func _ready() -> void:
	mesh = _mesh
	_material.shader = SHADER
	_material.render_priority = 10
	material_override = _material
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _process(delta: float) -> void:
	_time += delta
	_material.set_shader_parameter("time", _time)
	_mesh.clear_surfaces()
	if arrows.is_empty():
		return
	_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for raw: Variant in arrows:
		var arrow: Dictionary = raw
		_draw(arrow["from"], arrow["to"], arrow["color"], bool(arrow.get("live", false)))
	_mesh.surface_end()


## Os pontos do arco de `a` até `b` (sobe no meio), parando antes do alvo para a ponta caber.
static func arc(a: Vector3, b: Vector3, segments: int = SEGMENTS) -> Array[Vector3]:
	var lift: float = clamp(a.distance_to(b) * 0.28, 0.4, 2.2)
	var mid: Vector3 = (a + b) * 0.5 + Vector3(0, lift, 0)
	var points: Array[Vector3] = []
	var stop: float = 1.0 - clampf(HEAD_LENGTH / maxf(a.distance_to(b), 0.01), 0.05, 0.35)
	for i: int in segments + 1:
		var t: float = float(i) / segments * stop
		points.append(a.lerp(mid, t).lerp(mid.lerp(b, t), t))
	return points


## A largura do feixe em `t` (0 na origem, 1 no fim do corpo): fina ao sair da carta, cheia do primeiro terço em diante.
static func width_at(t: float) -> float:
	return WIDTH * lerpf(START_WIDTH, 1.0, smoothstep(0.0, 0.3, t))


func _draw(a: Vector3, b: Vector3, color: Color, live: bool = false) -> void:
	var points: Array[Vector3] = arc(a, b)
	var flag: float = 1.0 if live else 0.0
	var alpha: float = 1.0 if live else 0.85
	for i: int in SEGMENTS:
		var p0: Vector3 = points[i]
		var p1: Vector3 = points[i + 1]
		var t0: float = float(i) / SEGMENTS
		var t1: float = float(i + 1) / SEGMENTS
		var along: Vector3 = (p1 - p0).normalized()
		var side0: Vector3 = along.cross(Vector3.UP).normalized() * width_at(t0) * 0.5
		var side1: Vector3 = along.cross(Vector3.UP).normalized() * width_at(t1) * 0.5
		var c := Color(color, alpha)
		_vertex(p0 - side0, c, Vector2(t0, 0.0), flag, 0.0)
		_vertex(p0 + side0, c, Vector2(t0, 1.0), flag, 0.0)
		_vertex(p1 + side1, c, Vector2(t1, 1.0), flag, 0.0)
		_vertex(p0 - side0, c, Vector2(t0, 0.0), flag, 0.0)
		_vertex(p1 + side1, c, Vector2(t1, 1.0), flag, 0.0)
		_vertex(p1 - side1, c, Vector2(t1, 0.0), flag, 0.0)
	# Ponta: um quadro deitado do fim do feixe até o alvo, um pouco recuado para cobrir a emenda; o shader desenha a forma.
	var tail: Vector3 = points[SEGMENTS]
	var dir: Vector3 = (b - tail).normalized()
	var back: Vector3 = tail - dir * HEAD_LENGTH * 0.25
	var across: Vector3 = dir.cross(Vector3.UP).normalized() * HEAD * (1.0 if live else 0.85)
	var tip := Color(color, alpha)
	_vertex(back - across, tip, Vector2(0.0, 0.0), flag, 1.0)
	_vertex(back + across, tip, Vector2(0.0, 1.0), flag, 1.0)
	_vertex(b + across, tip, Vector2(1.0, 1.0), flag, 1.0)
	_vertex(back - across, tip, Vector2(0.0, 0.0), flag, 1.0)
	_vertex(b + across, tip, Vector2(1.0, 1.0), flag, 1.0)
	_vertex(b - across, tip, Vector2(1.0, 0.0), flag, 1.0)


func _vertex(p: Vector3, color: Color, uv: Vector2, live: float, head: float) -> void:
	_mesh.surface_set_color(color)
	_mesh.surface_set_uv(uv)
	_mesh.surface_set_uv2(Vector2(head, live))
	_mesh.surface_add_vertex(p)
