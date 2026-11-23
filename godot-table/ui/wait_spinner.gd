# Indicador de espera da caixa de ação: um arco que gira devagar sobre um anel apagado (desenhado, sem textura).
class_name WaitSpinner
extends Control

var color: Color = HudStyle.GOLD
var _angle: float = 0.0


func _init() -> void:
	custom_minimum_size = Vector2(20, 20)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_vertical = Control.SIZE_SHRINK_CENTER


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_angle = fposmod(_angle + delta * TAU * 0.9, TAU)
	queue_redraw()


func _draw() -> void:
	var center: Vector2 = size / 2.0
	var radius: float = minf(size.x, size.y) / 2.0 - 2.0
	draw_arc(center, radius, 0.0, TAU, 32, Color(color, 0.18), 2.5, true)
	# O arco cresce e encolhe enquanto gira, como os indicadores de carregamento.
	var span: float = lerpf(0.9, 2.4, 0.5 + 0.5 * sin(_angle * 2.0))
	draw_arc(center, radius, _angle, _angle + span, 24, color, 2.5, true)
