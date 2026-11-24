# Resolução da mesa 3D no Automático: numa placa que não dá conta (os quadros caindo mesmo com os efeitos no Leve), a
# mesa passa a ser desenhada em menos pixels e ampliada com FSR, que mantém as bordas nítidas; a interface 2D continua
# na resolução cheia. Nos modos fixos e a cada partida, volta à resolução cheia.
class_name RenderScale
extends RefCounted

## Os degraus, do cheio ao mais baixo.
const STEPS: Array[float] = [1.0, 0.85, 0.7, 0.6]

## O viewport da mesa (o da janela).
var viewport: Viewport
var step: int = 0


## Desce um degrau; false quando já está no mais baixo.
func lower() -> bool:
	if step >= STEPS.size() - 1:
		return false
	step += 1
	_apply()
	return true


## Volta à resolução cheia.
func reset() -> void:
	step = 0
	_apply()


func scale() -> float:
	return STEPS[step]


func _apply() -> void:
	if viewport == null:
		return
	var value: float = STEPS[step]
	viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if value < 1.0 else Viewport.SCALING_3D_MODE_BILINEAR
	viewport.scaling_3d_scale = value
