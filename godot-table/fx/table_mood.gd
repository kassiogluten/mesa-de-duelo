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


## Acha as luzes e o ambiente que a mesa montou e guarda os valores normais deles.
func attach(table: TableView) -> void:
	if not table.is_node_ready():
		await table.ready
	for child: Node in table.get_children():
		if child is DirectionalLight3D and _sun == null:
			_sun = child
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
	if _target <= 0.0 and _level <= 0.0:
		return
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


## A cor como luz: mesmo matiz, com o canal mais forte em 1 (a lâmpada colorida não escurece a mesa).
static func _light_color(color: Color) -> Color:
	var top: float = maxf(color.r, maxf(color.g, color.b))
	if top <= 0.001:
		return Color.WHITE
	return Color(color.r / top, color.g / top, color.b / top)
