# Clima da mesa: a luz da sala puxa para a cor de cada mágica conjurada (a lâmpada, a luz ambiente, um pouco do sol e do
# fundo) e volta devagar ao normal; mágicas seguidas acumulam até um teto, sem estourar. É clima, não efeito: sutil.
class_name TableMood
extends Node

## Quanto cada mágica sobe o clima (com força 1) e o teto da soma.
const PULSE := 0.6
const CAP := 1.0
## Subida até o pico (por segundo, aproximação exponencial) e o tempo de meia-vida da volta ao normal.
const RISE := 9.0
const HALF_LIFE := 0.55
## Quanto de cada luz vai para a cor da mágica com o clima no máximo.
const LAMP_MIX := 0.8
const SUN_MIX := 0.35
const AMBIENT_MIX := 0.65
const BACKGROUND_MIX := 0.7
## A lâmpada fica um pouco mais forte no pico, para a cor aparecer sem escurecer a mesa.
const LAMP_BOOST := 0.25

var _sun: DirectionalLight3D
var _lamp: OmniLight3D
var _env: Environment
var _base_sun: Color
var _base_lamp: Color
var _base_lamp_energy: float
var _base_ambient: Color
var _base_ambient_energy: float
var _base_background: Color
## Para onde o clima vai (sobe a cada mágica, cai sozinho) e onde ele está agora.
var _target: float = 0.0
var _level: float = 0.0
## A cor do clima: mistura das últimas mágicas, pesada por quanto cada uma subiu.
var _tint: Color = Color.WHITE

# — Clima de combate (fx/combat_stage.gd liga e desliga) —
## A mesa escurece um pouco, a contraluz esquenta em vermelho e a vinheta aperta, tingida de vinho.
const COMBAT_DARKEN := 0.2
const COMBAT_AMBIENT := 0.28
const COMBAT_RIM := Color(1.0, 0.36, 0.2)
const COMBAT_RIM_BOOST := 2.2
const COMBAT_VIGNETTE := 0.22
const COMBAT_VIGNETTE_TINT := Color(0.09, 0.0, 0.01)
var _rim: DirectionalLight3D
var _base_rim: Color
var _base_rim_energy: float
var _vignette: ShaderMaterial
var _base_vignette: float = 0.55
var _base_vignette_tint: Color = Color(0.0, 0.01, 0.04)
var _combat_goal: float = 0.0
var _combat: float = 0.0


## Acha as luzes e o ambiente que a mesa montou e guarda os valores normais deles.
func attach(table: TableView) -> void:
	if not table.is_node_ready():
		await table.ready
	for child: Node in table.get_children():
		if child is DirectionalLight3D and _sun == null:
			_sun = child
		elif child is DirectionalLight3D and _rim == null:
			_rim = child
		elif child is CanvasLayer and child.name == "Vinheta" and _vignette == null and child.get_child_count() > 0:
			_vignette = (child.get_child(0) as CanvasItem).material as ShaderMaterial
		elif child is OmniLight3D and _lamp == null:
			_lamp = child
		elif child is WorldEnvironment and _env == null:
			_env = (child as WorldEnvironment).environment
	if _sun:
		_base_sun = _sun.light_color
	if _lamp:
		_base_lamp = _lamp.light_color
		_base_lamp_energy = _lamp.light_energy
	if _env:
		_base_ambient = _env.ambient_light_color
		_base_ambient_energy = _env.ambient_light_energy
		_base_background = _env.background_color
	if _rim:
		_base_rim = _rim.light_color
		_base_rim_energy = _rim.light_energy
	if _vignette:
		# Os valores que o shader ainda não recebeu voltam null (fica o padrão do shader, o mesmo daqui).
		var strength: Variant = _vignette.get_shader_parameter("strength")
		if strength is float:
			_base_vignette = strength
		var tint: Variant = _vignette.get_shader_parameter("tint")
		if tint is Color:
			_base_vignette_tint = tint
		elif tint is Vector3:
			_base_vignette_tint = Color((tint as Vector3).x, (tint as Vector3).y, (tint as Vector3).z)


## O combate começou (true) ou acabou: a luz vai para o clima de combate em ~0,4 s e volta devagar.
func set_combat(on: bool) -> void:
	_combat_goal = 1.0 if on else 0.0


## Quanto o clima de combate está aceso agora (0 a 1).
func combat_level() -> float:
	return _combat


## Puxa o clima para `color` (a cor da mágica, Fx.card_color); `strength` 1 é uma mágica comum.
func pulse(color: Color, strength: float = 1.0) -> void:
	if Fx.quality == 0 or strength <= 0.0:
		return
	var add: float = PULSE * strength
	# A cor nova pesa pelo quanto ela sobe frente ao que já está aceso: mágicas seguidas de cores diferentes se misturam.
	var share: float = add / maxf(_target + add, 0.001)
	_tint = _tint.lerp(_light_color(color), share) if _target > 0.01 else _light_color(color)
	_target = minf(CAP, _target + add)


## Quanto o clima está aceso agora (0 é a mesa normal).
func level() -> float:
	return _level


func _process(delta: float) -> void:
	advance(delta)


## Anda o clima `delta` segundos (o _process chama; os testes chamam direto).
func advance(delta: float) -> void:
	if _target <= 0.0 and _level <= 0.0 and _combat == _combat_goal:
		return
	# O combate entra rápido e sai devagar (o fim do combate é uma respiração, não um corte).
	_combat = move_toward(_combat, _combat_goal, delta * (2.6 if _combat_goal > _combat else 1.1))
	# No "leve" (ou se o regulador baixou até ele), o clima apaga logo.
	var half_life: float = HALF_LIFE if Fx.quality > 0 else 0.08
	_target *= pow(0.5, delta / half_life)
	_level = lerpf(_level, _target, 1.0 - exp(-RISE * delta))
	if _target < 0.005 and _level < 0.005:
		_target = 0.0
		_level = 0.0
	_apply()


func _apply() -> void:
	# Uma mágica sozinha já se nota; as seguintes somam cada vez menos (o teto chega devagar).
	var k: float = 1.0 - (1.0 - _level) * (1.0 - _level)
	if _sun:
		_sun.light_color = _base_sun.lerp(_base_sun * _tint, k * SUN_MIX)
	if _lamp:
		_lamp.light_color = _base_lamp.lerp(_tint, k * LAMP_MIX)
		_lamp.light_energy = _base_lamp_energy * (1.0 + k * LAMP_BOOST)
	if _env:
		_env.ambient_light_color = _base_ambient.lerp(_tint * 0.7, k * AMBIENT_MIX)
		_env.ambient_light_energy = _base_ambient_energy * (1.0 + k * 0.15)
		_env.background_color = _base_background.lerp(_tint * 0.09, k * BACKGROUND_MIX)
	_apply_combat()


func _apply_combat() -> void:
	var c: float = smoothstep(0.0, 1.0, _combat)
	if _lamp:
		_lamp.light_energy *= 1.0 - COMBAT_DARKEN * c
	if _env:
		_env.ambient_light_energy *= 1.0 - COMBAT_AMBIENT * c
	if _rim:
		_rim.light_color = _base_rim.lerp(COMBAT_RIM, c)
		_rim.light_energy = _base_rim_energy * (1.0 + COMBAT_RIM_BOOST * c)
	if _vignette:
		_vignette.set_shader_parameter("strength", _base_vignette + COMBAT_VIGNETTE * c)
		_vignette.set_shader_parameter("tint", _base_vignette_tint.lerp(COMBAT_VIGNETTE_TINT, c))


## A cor como luz: mesmo matiz, com o canal mais forte em 1 (a lâmpada colorida não escurece a mesa).
static func _light_color(color: Color) -> Color:
	var top: float = maxf(color.r, maxf(color.g, color.b))
	if top <= 0.001:
		return Color.WHITE
	return Color(color.r / top, color.g / top, color.b / top)
