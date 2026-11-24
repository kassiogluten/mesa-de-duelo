# A vista da mesa que o jogador escolhe: o zoom (roda do mouse, puxando para o ponto sob o mouse, e as teclas + e −) e
# o ângulo pronto (padrão, pela esquerda, pela direita, de cima), com transição suave. É o suporte da câmera: ela fica
# dentro dele no lugar de sempre (TableView.CAMERA_POS), então os efeitos que a mexem partem da vista escolhida e voltam
# para ela, e a mão, que acompanha a câmera, fica no mesmo lugar da tela em qualquer vista.
class_name TableCamera
extends Node3D

## A vista andou (a cada quadro da transição): o que acompanha a câmera (a mão, a pilha, o seu comandante, os retratos)
## vai junto. `done`: chegou na vista escolhida.
signal moved(done: bool)
## O jogador trocou o ângulo ou o zoom (o botão da vista mostra o de agora).
signal changed

## Os ângulos prontos: [chave, nome, olho, ponto olhado]. O padrão é o da mesa de sempre; os dos lados giram em volta
## do meio da mesa (15°) e se afastam um pouco; o de cima sobe e se afasta para o campo dos oponentes caber inteiro.
const ANGLES: Array = [
	["padrao", "Padrão", Vector3(0, 8.4, 6.3), Vector3(0, 0, 0.6)],
	["esquerda", "Pela esquerda", Vector3(-1.56, 8.9, 6.44), Vector3(0, 0, 0.6)],
	["direita", "Pela direita", Vector3(1.56, 8.9, 6.44), Vector3(0, 0, 0.6)],
	["cima", "De cima", Vector3(0, 10.8, 4.23), Vector3(0, 0, 0.3)],
]
## O zoom é quanto a distância da câmera ao meio da mesa encolhe (1 é a de sempre): de perto e de longe, e o passo de
## cada clique da roda ou tecla.
const ZOOM_NEAR := 0.6
const ZOOM_FAR := 1.15
const ZOOM_STEP := 0.9
## Com o zoom todo, quanto a vista pode andar para o lado e para a frente e para trás (unidades da mesa) indo atrás do
## mouse: o bastante para chegar nas bordas do campo, sem sair da mesa; sem zoom, a vista fica no meio.
const PAN_X := 4.6
const PAN_FAR := 3.2
const PAN_NEAR := 1.4
## A transição: aproximação exponencial por segundo.
const SPEED := 9.0
## O plano das cartas no tampo (onde o mouse "aponta" para o zoom).
const POINT_Y := 0.05

## O lugar da câmera dentro do suporte (o de sempre): a vista é o suporte levando esse lugar até o da vista escolhida.
static var HOME := Transform3D(Basis.looking_at(TableView.CAMERA_LOOK - TableView.CAMERA_POS), TableView.CAMERA_POS)

var camera: Camera3D
## O ângulo escolhido (índice de ANGLES), o zoom e quanto o ponto olhado andou atrás do mouse (no tampo).
var angle: int = 0
var zoom: float = 1.0
var pan := Vector3.ZERO
## Onde a câmera está agora na transição (olho e ponto olhado).
var _eye: Vector3 = TableView.CAMERA_POS
var _look: Vector3 = TableView.CAMERA_LOOK
var _moving: bool = false


func _ready() -> void:
	set_process(false)


## O ângulo e o zoom guardados (game/prefs.gd), já no lugar, sem transição; a vista volta ao meio.
func load_prefs(prefs: Dictionary = Prefs.load_all()) -> void:
	angle = index_of(Txt.of(prefs.get("camera_angle", "padrao")))
	zoom = clampf(float(prefs.get("camera_zoom", 1.0)), ZOOM_NEAR, ZOOM_FAR)
	pan = Vector3.ZERO
	snap()


## O índice do ângulo com essa chave (0, o padrão, se não há).
static func index_of(key: String) -> int:
	for i: int in ANGLES.size():
		if (ANGLES[i] as Array)[0] == key:
			return i
	return 0


## O nome do ângulo de agora ("Padrão", "De cima"…).
func angle_name() -> String:
	return Txt.of((ANGLES[angle] as Array)[1])


## Está na vista padrão (sem zoom, ângulo padrão)?
func is_default() -> bool:
	return angle == 0 and is_equal_approx(zoom, 1.0) and pan.is_zero_approx()


## Troca para o ângulo `index`, mantendo o zoom.
func set_angle(index: int) -> void:
	angle = posmod(index, ANGLES.size())
	pan = clamp_pan(pan, zoom)
	_retarget()


## O próximo ângulo (`step` -1 volta).
func cycle_angle(step: int = 1) -> void:
	set_angle(angle + step)


## Aproxima (`steps` > 0) ou afasta, com o ponto `screen` (pixels da tela; (-1, -1) para o meio) parado na tela.
func zoom_by(steps: float, screen: Vector2 = Vector2(-1, -1)) -> void:
	var next: float = clampf(zoom * pow(ZOOM_STEP, steps), ZOOM_NEAR, ZOOM_FAR)
	if is_equal_approx(next, zoom):
		return
	var view: Dictionary = goal()
	var point: Variant = _table_point(view["eye"], view["look"], screen)
	if point is Vector3:
		# O olho e o ponto olhado encolhem em volta do ponto sob o mouse: ele fica parado na tela.
		var ratio: float = next / zoom
		var look: Vector3 = (point as Vector3) + ((view["look"] as Vector3) - (point as Vector3)) * ratio
		pan = Vector3(look.x, 0, look.z) - _base_look()
	zoom = next
	pan = clamp_pan(pan, zoom)
	_retarget()


## Volta para a vista padrão.
func reset() -> void:
	angle = 0
	zoom = 1.0
	pan = Vector3.ZERO
	_retarget()


## Quanto a vista pode andar com esse zoom: nada sem zoom, até PAN_X/PAN_FAR/PAN_NEAR com ele todo.
static func clamp_pan(offset: Vector3, amount: float) -> Vector3:
	var room: float = clampf((1.0 - amount) / (1.0 - ZOOM_NEAR), 0.0, 1.0)
	return Vector3(clampf(offset.x, -PAN_X * room, PAN_X * room), 0, clampf(offset.z, -PAN_FAR * room, PAN_NEAR * room))


## A vista escolhida (para onde a câmera vai): {eye, look}.
func goal() -> Dictionary:
	return view_of(angle, zoom, pan)


## A vista de um ângulo com um zoom e um deslocamento: o ponto olhado anda, e o olho chega mais perto dele.
static func view_of(index: int, amount: float, offset: Vector3) -> Dictionary:
	var entry: Array = ANGLES[posmod(index, ANGLES.size())]
	var look: Vector3 = (entry[3] as Vector3) + offset
	return {"eye": look + ((entry[2] as Vector3) - (entry[3] as Vector3)) * amount, "look": look}


## O suporte que leva a câmera do lugar de sempre até a vista {eye, look}.
static func rig_for(eye: Vector3, look: Vector3) -> Transform3D:
	return Transform3D(Basis.looking_at(look - eye), eye) * HOME.affine_inverse()


## Vai direto para a vista escolhida, sem transição.
func snap() -> void:
	var view: Dictionary = goal()
	_eye = view["eye"]
	_look = view["look"]
	_apply()
	_moving = false
	set_process(false)
	moved.emit(true)


func _base_look() -> Vector3:
	return (ANGLES[angle] as Array)[3]


func _retarget() -> void:
	changed.emit()
	if not is_inside_tree():
		snap()
		return
	_moving = true
	set_process(true)


func _process(delta: float) -> void:
	var view: Dictionary = goal()
	var follow: float = 1.0 - exp(-SPEED * delta)
	_eye = _eye.lerp(view["eye"], follow)
	_look = _look.lerp(view["look"], follow)
	var done: bool = _eye.distance_to(view["eye"]) < 0.002 and _look.distance_to(view["look"]) < 0.002
	if done:
		_eye = view["eye"]
		_look = view["look"]
		_moving = false
		set_process(false)
		Prefs.save("camera_angle", (ANGLES[angle] as Array)[0])
		Prefs.save("camera_zoom", snappedf(zoom, 0.001))
	_apply()
	moved.emit(done)


## Quanto o que acompanha a câmera (a mão, a pilha no painel) chega mais perto dela, encolhendo na mesma proporção:
## com o zoom, a câmera desce para perto do tampo, e a mão e a pilha, que ficam a uma distância fixa dela, entrariam na
## mesa. Encolhidas em direção ao olho, aparecem iguais na tela e ficam sempre entre a câmera e o tampo. 1 sem zoom.
func near_scale() -> float:
	var entry: Array = ANGLES[0]
	return minf(1.0, _eye.distance_to(_look) / (entry[2] as Vector3).distance_to(entry[3]))


## A vista está mudando agora (transição em curso)?
func moving() -> bool:
	return _moving


func _apply() -> void:
	transform = rig_for(_eye, _look)


## O ponto do tampo sob `screen` visto de {eye, look} (com o campo de visão e a tela da câmera); null fora da mesa.
## (-1, -1) é o meio da tela.
func _table_point(eye: Vector3, look: Vector3, screen: Vector2) -> Variant:
	if camera == null or not camera.is_inside_tree():
		return null
	var size: Vector2 = camera.get_viewport().get_visible_rect().size
	if size.x <= 0.0 or size.y <= 0.0:
		return null
	var at: Vector2 = screen if screen.x >= 0.0 else size / 2.0
	var ndc: Vector2 = at / size * 2.0 - Vector2.ONE
	var half: float = tan(deg_to_rad(camera.fov) / 2.0)
	var basis := Basis.looking_at(look - eye)
	var direction: Vector3 = basis * Vector3(ndc.x * half * size.x / size.y, -ndc.y * half, -1.0)
	return Plane(Vector3.UP, POINT_Y).intersects_ray(eye, direction.normalized())


## O ponto da câmera (em coordenadas do pai dela) que corresponde ao ponto `world` da mesa: os efeitos que levam a
## câmera até um lance usam isto para chegar nele de qualquer vista.
static func local_point(cam: Camera3D, world: Vector3) -> Vector3:
	var parent: Node3D = cam.get_parent() as Node3D
	return parent.to_local(world) if parent and parent.is_inside_tree() else world
