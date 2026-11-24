# A ondulação da arte da criatura com enjoo de invocação: a folha fina (fx/sickness_ripple.gdshader) presa sobre a caixa
# da ilustração da carta, que anda com ela (virada, girada, levantada) e some junto quando a carta sai da mesa.
class_name SicknessRipple
extends RefCounted

const SHADER := preload("res://fx/sickness_ripple.gdshader")
## A caixa da ilustração na moldura comum do Scryfall, em frações da carta (x de 8% a 92%, y de 11% a 55%). Nas cartas de
## arte cheia e nos terrenos fica a mesma: o meio da carta ondula e o texto de baixo continua parado.
const BOX := Rect2(0.08, 0.11, 0.84, 0.44)
## Quanto a folha fica acima da face (sem brigar com ela no depth, abaixo do nome e dos selos).
const LIFT := 0.0008
## Desenhada antes de tudo o que é transparente (os efeitos contínuos, os selos, o giro do enjoo), que vem por cima dela;
## abaixo da tela cinza da derrota (−100), que lê a tela antes dela e a cobre.
const PRIORITY := -120

static var _material: ShaderMaterial
static var _mesh: PlaneMesh


## Põe a folha sobre a arte de `node` (parada até ganhar força) e a devolve; null se a carta ainda não tem o desenho.
static func attach(node: CardNode, phase: float) -> MeshInstance3D:
	var body: MeshInstance3D = face_of(node)
	if body == null:
		return null
	var mesh := MeshInstance3D.new()
	mesh.mesh = _plane()
	mesh.material_override = material()
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var center: Vector2 = (BOX.get_center() - Vector2(0.5, 0.5)) * CardNode.SIZE
	mesh.position = Vector3(center.x, LIFT, center.y)
	mesh.set_instance_shader_parameter("phase", phase * 7.0)
	mesh.set_meta("badge", "sickness-ripple")
	body.add_child(mesh)
	set_strength(mesh, 0.0)
	return mesh


## A força da ondulação (0 a 1); parada, a folha nem é desenhada.
static func set_strength(mesh: MeshInstance3D, strength: float) -> void:
	mesh.set_instance_shader_parameter("strength", strength)
	mesh.visible = strength > 0.001


## A face da carta (a malha de cima com o material da carta), onde a folha fica presa.
static func face_of(node: CardNode) -> MeshInstance3D:
	var material: ShaderMaterial = CardDressing.material_of(node)
	if material == null:
		return null
	var best: MeshInstance3D = null
	for child: Node in node.find_children("*", "MeshInstance3D", true, false):
		var one: MeshInstance3D = child as MeshInstance3D
		if one.material_override == material and (best == null or one.position.y > best.position.y):
			best = one
	return best


## O material (um só para todas as cartas; cada uma muda a força e a fase dela).
static func material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = SHADER
		_material.render_priority = PRIORITY
		_material.set_shader_parameter("box", BOX.size * CardNode.SIZE)
	return _material


static func _plane() -> PlaneMesh:
	if _mesh == null:
		_mesh = PlaneMesh.new()
		_mesh.size = BOX.size * CardNode.SIZE
	return _mesh
