# A vista da mesa que o jogador escolhe: o zoom (roda do mouse, puxando para o ponto sob o mouse, e as teclas + e −) e
# o giro livre em volta do meio da mesa (arrastando com o botão do meio do mouse, e Q e E): girar até 90° para cada lado
# e inclinar da vista de sempre até olhar de cima, com transição suave. É o suporte da câmera: ela fica dentro dele no
# lugar de sempre (TableView.CAMERA_POS), então os efeitos que a mexem partem da vista escolhida e voltam para ela, e a
# mão, que acompanha a câmera, fica no mesmo lugar da tela em qualquer vista.
class_name TableCamera
extends Node3D

## A vista andou (a cada quadro da transição): o que acompanha a câmera (a mão, a pilha, o seu comandante, os retratos)
## vai junto. `done`: chegou na vista escolhida.
signal moved(done: bool)
## O jogador girou, inclinou ou mudou o zoom (o botão da vista mostra o de agora).
signal changed

## O ponto em volta do qual a mesa gira, a distância e a inclinação da vista de sempre (da câmera de TableView).
const PIVOT := TableView.CAMERA_LOOK
static var DISTANCE: float = (TableView.CAMERA_POS - TableView.CAMERA_LOOK).length()
static var DEFAULT_PITCH: float = atan2(TableView.CAMERA_POS.y - TableView.CAMERA_LOOK.y, TableView.CAMERA_POS.z - TableView.CAMERA_LOOK.z)
## O giro (para cada lado) e a inclinação até olhar de cima (quase 90°: reto para baixo a câmera perderia o "para cima").
const MAX_YAW := deg_to_rad(90.0)
const MAX_PITCH := deg_to_rad(89.0)
## Quanto gira cada pixel arrastado com o botão do meio, e cada toque de Q ou E (segurar continua girando).
const DRAG_SPEED := deg_to_rad(0.3)
const KEY_STEP := deg_to_rad(10.0)
## O zoom é quanto a distância da câmera ao meio da mesa encolhe (1 é a de sempre): de perto e de longe, e o passo de
## cada clique da roda ou tecla.
const ZOOM_NEAR := 0.35
const ZOOM_FAR := 1.5
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
## A vista escolhida: o giro (radianos; positivo leva a câmera para a direita), a inclinação (radianos acima do tampo),
## o zoom e quanto o ponto olhado andou atrás do mouse (no tampo).
var yaw: float = 0.0
var pitch: float = DEFAULT_PITCH
var zoom: float = 1.0
var pan := Vector3.ZERO
## Onde a vista está agora na transição (os mesmos quatro valores, andando para os escolhidos).
var _yaw: float = 0.0
var _pitch: float = DEFAULT_PITCH
var _zoom: float = 1.0
var _pan := Vector3.ZERO
var _eye: Vector3 = TableView.CAMERA_POS
var _look: Vector3 = TableView.CAMERA_LOOK
var _moving: bool = false


func _ready() -> void:
	set_process(false)


## O giro, a inclinação e o zoom guardados (game/prefs.gd), já no lugar, sem transição; a vista volta ao meio.
func load_prefs(prefs: Dictionary = Prefs.load_all()) -> void:
	yaw = clampf(deg_to_rad(float(prefs.get("camera_yaw", 0.0))), -MAX_YAW, MAX_YAW)
	pitch = clampf(deg_to_rad(float(prefs.get("camera_pitch", rad_to_deg(DEFAULT_PITCH)))), DEFAULT_PITCH, MAX_PITCH)
	zoom = clampf(float(prefs.get("camera_zoom", 1.0)), ZOOM_NEAR, ZOOM_FAR)
	pan = Vector3.ZERO
	snap()


## O nome da vista de agora: "Padrão" sem giro nem inclinação (o zoom não conta), "Girada" com eles.
func angle_name() -> String:
	return "Padrão" if is_straight() else "Girada"


## Sem giro e na inclinação de sempre?
func is_straight() -> bool:
	return absf(yaw) < 0.001 and absf(pitch - DEFAULT_PITCH) < 0.001


## Está na vista padrão (sem zoom, sem giro)?
func is_default() -> bool:
	return is_straight() and is_equal_approx(zoom, 1.0) and pan.is_zero_approx()


## Gira (`yaw_delta`, radianos; positivo leva a câmera para a direita) e inclina (`pitch_delta`; positivo olha mais de
## cima), dentro dos limites, mantendo o zoom.
func orbit_by(yaw_delta: float, pitch_delta: float = 0.0) -> void:
	var next_yaw: float = clampf(yaw + yaw_delta, -MAX_YAW, MAX_YAW)
	var next_pitch: float = clampf(pitch + pitch_delta, DEFAULT_PITCH, MAX_PITCH)
	if is_equal_approx(next_yaw, yaw) and is_equal_approx(next_pitch, pitch):
		return
	yaw = next_yaw
	pitch = next_pitch
	_retarget()


## Arrastou o mouse `pixels` com o botão do meio: a mesa vai atrás do mouse (para a direita gira para a direita, para
## baixo inclina para olhar mais de cima).
func drag(pixels: Vector2) -> void:
	orbit_by(-pixels.x * DRAG_SPEED, pixels.y * DRAG_SPEED)


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
		pan = Vector3(look.x, 0, look.z) - PIVOT
	zoom = next
	pan = clamp_pan(pan, zoom)
	_retarget()


## Volta para a vista padrão.
func reset() -> void:
	yaw = 0.0
	pitch = DEFAULT_PITCH
	zoom = 1.0
	pan = Vector3.ZERO
	_retarget()


## Quanto a vista pode andar com esse zoom: nada sem zoom, até PAN_X/PAN_FAR/PAN_NEAR com ele todo.
static func clamp_pan(offset: Vector3, amount: float) -> Vector3:
	var room: float = clampf((1.0 - amount) / (1.0 - ZOOM_NEAR), 0.0, 1.0)
	return Vector3(clampf(offset.x, -PAN_X * room, PAN_X * room), 0, clampf(offset.z, -PAN_FAR * room, PAN_NEAR * room))


## A vista escolhida (para onde a câmera vai): {eye, look}.
func goal() -> Dictionary:
	return view_of(yaw, pitch, zoom, pan)


## A vista com um giro, uma inclinação, um zoom e um deslocamento: o ponto olhado anda, e o olho fica na distância de
## sempre (encolhida pelo zoom), na inclinação e no giro pedidos em volta dele.
static func view_of(turn: float, tilt: float, amount: float, offset: Vector3) -> Dictionary:
	var look: Vector3 = PIVOT + offset
	var arm := Vector3(0, sin(tilt), cos(tilt)) * DISTANCE * amount
	return {"eye": look + arm.rotated(Vector3.UP, turn), "look": look}


## O suporte que leva a câmera do lugar de sempre até a vista {eye, look}.
static func rig_for(eye: Vector3, look: Vector3) -> Transform3D:
	return Transform3D(Basis.looking_at(look - eye), eye) * HOME.affine_inverse()


## Vai direto para a vista escolhida, sem transição.
func snap() -> void:
	_yaw = yaw
	_pitch = pitch
	_zoom = zoom
	_pan = pan
	_apply()
	_moving = false
	set_process(false)
	moved.emit(true)


func _retarget() -> void:
	changed.emit()
	if not is_inside_tree():
		snap()
		return
	_moving = true
	set_process(true)


func _process(delta: float) -> void:
	# Anda no giro, na inclinação e no zoom (não em linha reta entre os olhos): girando muito, a câmera faz a curva em
	# volta da mesa, sem chegar mais perto no meio do caminho.
	var follow: float = 1.0 - exp(-SPEED * delta)
	_yaw = lerpf(_yaw, yaw, follow)
	_pitch = lerpf(_pitch, pitch, follow)
	_zoom = lerpf(_zoom, zoom, follow)
	_pan = _pan.lerp(pan, follow)
	var done: bool = absf(_yaw - yaw) < 0.0005 and absf(_pitch - pitch) < 0.0005 and absf(_zoom - zoom) < 0.0005 and _pan.distance_to(pan) < 0.002
	if done:
		_yaw = yaw
		_pitch = pitch
		_zoom = zoom
		_pan = pan
		_moving = false
		set_process(false)
		Prefs.save("camera_yaw", snappedf(rad_to_deg(yaw), 0.1))
		Prefs.save("camera_pitch", snappedf(rad_to_deg(pitch), 0.1))
		Prefs.save("camera_zoom", snappedf(zoom, 0.001))
	_apply()
	moved.emit(done)


## Quanto o que acompanha a câmera (a mão, a pilha no painel) chega mais perto dela, encolhendo na mesma proporção:
## com o zoom, a câmera desce para perto do tampo, e a mão e a pilha, que ficam a uma distância fixa dela, entrariam na
## mesa. Encolhidas em direção ao olho, aparecem iguais na tela e ficam sempre entre a câmera e o tampo. 1 sem zoom.
func near_scale() -> float:
	return minf(1.0, _eye.distance_to(_look) / DISTANCE)


## A vista está mudando agora (transição em curso)?
func moving() -> bool:
	return _moving


func _apply() -> void:
	var view: Dictionary = view_of(_yaw, _pitch, _zoom, _pan)
	_eye = view["eye"]
	_look = view["look"]
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
