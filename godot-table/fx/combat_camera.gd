# A câmera no combate: a aproximação suave na direção de quem é atacado e o tremor dos golpes (por "trauma", que cai
# sozinho), só pela rotação (pitch e yaw) e pelo campo de visão, que nenhum outro efeito usa; e a pausa curta no impacto
# (hit-stop) pelo Engine.time_scale, sempre devolvido.
class_name CombatCamera
extends Node

## Quanto a câmera gira, no máximo, para o lado do defensor, e quanto fecha o campo de visão (graus).
const PUSH_MAX_DEG := 2.2
const PUSH_FOV := 2.4
## O tremor no trauma 1 (graus) e quanto o trauma cai por segundo.
const SHAKE_DEG := 0.9
const TRAUMA_DECAY := 1.7

var camera: Camera3D
## O que o combate somou agora à câmera (pitch, yaw em radianos; fov em graus): cada quadro troca só a diferença, e o
## descanso tira tudo. Assim a câmera volta exata, mesmo que outro efeito mexa nela ao mesmo tempo.
var _applied := Vector3.ZERO
var _trauma: float = 0.0
## A aproximação de agora e o alvo dela (yaw, pitch em radianos; fov em graus) e até quando o alvo vale.
var _push := Vector3.ZERO
var _push_goal := Vector3.ZERO
var _push_until: float = 0.0
var _clock: float = 0.0

## Hit-stop: a escala de tempo de antes (a do laboratório pode ser ¼×) e quantas pausas estão abertas.
static var _base_scale: float = 1.0
static var _stops: int = 0


func _ready() -> void:
	set_process(false)


## Aproxima a câmera de `target` por `hold` segundos (e volta devagar); `amount` de 0 a 1.
func push(target: Vector3, amount: float = 1.0, hold: float = 1.0) -> void:
	if camera == null or Fx.quality == 0 or not camera.is_inside_tree():
		return
	var to_target: Vector3 = target - camera.global_position
	var view: Basis = camera.global_basis
	var side: float = to_target.normalized().dot(view.x)
	var up: float = to_target.normalized().dot(view.y)
	var limit: float = deg_to_rad(PUSH_MAX_DEG) * clampf(amount, 0.0, 1.0)
	_push_goal = Vector3(clampf(-side * 0.6, -1.0, 1.0) * limit, clampf(up * 0.6, -1.0, 1.0) * limit, -PUSH_FOV * clampf(amount, 0.0, 1.0))
	_push_until = _clock + hold
	set_process(true)


## Soma um tremor: `amount` de 0 a 1 (o golpe de 12 chega perto de 1).
func shake(amount: float) -> void:
	if camera == null or Fx.quality == 0 or not camera.is_inside_tree():
		return
	_trauma = clampf(_trauma + amount, 0.0, 1.0)
	set_process(true)


## Volta a câmera para o lugar de sempre na hora (fim de partida, saída da tela).
func rest() -> void:
	_trauma = 0.0
	_push = Vector3.ZERO
	_push_goal = Vector3.ZERO
	_apply(Vector3.ZERO)
	set_process(false)


func _exit_tree() -> void:
	rest()


## Põe na câmera o que o combate soma agora (tirando o que somou antes).
func _apply(offset: Vector3) -> void:
	if camera and is_instance_valid(camera):
		camera.rotation.x += offset.x - _applied.x
		camera.rotation.y += offset.y - _applied.y
		camera.fov += offset.z - _applied.z
	_applied = offset


func _process(delta: float) -> void:
	if camera == null or not is_instance_valid(camera):
		set_process(false)
		return
	_clock += delta
	if _clock > _push_until:
		_push_goal = Vector3.ZERO
	# Chega em ~0,35 s e volta em ~0,8 s (sem tranco).
	var rate: float = 7.0 if _push_goal.length() > _push.length() else 3.2
	_push = _push.lerp(_push_goal, 1.0 - exp(-rate * delta))
	_trauma = maxf(0.0, _trauma - TRAUMA_DECAY * delta)
	var power: float = _trauma * _trauma
	var t: float = _clock * 34.0
	# Ruído suave (somas de senos fora de fase): treme sem parecer um vaivém regular.
	var yaw: float = (sin(t * 1.0) * 0.6 + sin(t * 2.31 + 1.7) * 0.4) * power * deg_to_rad(SHAKE_DEG)
	var pitch: float = (sin(t * 1.13 + 0.4) * 0.6 + sin(t * 2.67 + 2.9) * 0.4) * power * deg_to_rad(SHAKE_DEG) * 0.8
	_apply(Vector3(_push.y + pitch, _push.x + yaw, _push.z))
	if _trauma <= 0.0 and _push_goal == Vector3.ZERO and _push.length() < 0.0005:
		rest()


## Pausa curta no impacto: o tempo do jogo quase para por `seconds` (de relógio) e volta à escala de antes. Nunca no
## "leve"; as pausas que se sobrepõem devolvem a escala uma vez só, no fim da última.
static func hit_stop(tree: SceneTree, seconds: float, scale: float = 0.06) -> void:
	if tree == null or Fx.quality == 0 or seconds <= 0.0:
		return
	if _stops == 0:
		_base_scale = Engine.time_scale
	_stops += 1
	Engine.time_scale = _base_scale * scale
	# O temporizador anda no relógio de verdade (ignora a escala de tempo) e também com a árvore pausada.
	tree.create_timer(seconds, true, false, true).timeout.connect(func() -> void: release())


## Fecha uma pausa (a última devolve a escala de tempo de antes).
static func release() -> void:
	if _stops <= 0:
		return
	_stops -= 1
	if _stops == 0:
		Engine.time_scale = _base_scale


## Fecha todas as pausas na hora (a tela da partida saindo).
static func release_all() -> void:
	if _stops > 0:
		_stops = 0
		Engine.time_scale = _base_scale


## Há uma pausa aberta agora (os testes conferem que ela fecha).
static func stopped() -> bool:
	return _stops > 0
