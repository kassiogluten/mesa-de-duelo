# Fundo das janelas da mesa: a partida continua visível atrás, desfocada e escurecida, e segura os cliques (a mesa não reage).
class_name ModalBackdrop
extends ColorRect

const SHADER := preload("res://ui/modal_backdrop.gdshader")

## 0 a 1: quanto o fundo já desfocou (anima na entrada e na saída).
var amount: float = 0.0:
	set(value):
		amount = value
		if material:
			(material as ShaderMaterial).set_shader_parameter("amount", value)

var _tween: Tween


func _init() -> void:
	name = "Backdrop"
	color = Color.WHITE
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shader_material := ShaderMaterial.new()
	shader_material.shader = SHADER
	material = shader_material
	amount = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


## Anima até `to` (1 aparece, 0 some) em `time` segundos.
func fade(to: float, time: float) -> Tween:
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.tween_property(self, "amount", to, time)
	return _tween
