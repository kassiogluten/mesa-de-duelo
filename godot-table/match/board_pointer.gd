# O mouse sobre o campo: onde ele está (para a seta que o segue) e o arrasto de uma permanente (o atacante até quem
# ele ataca, o bloqueador até o atacante). Apertar e soltar sem andar é um clique; andar o bastante vira arrasto.
class_name BoardPointer
extends Node

## Clique numa permanente sem arrastar.
signal tapped(node: CardNode)
## Começou a arrastar a permanente.
signal drag_started(node: CardNode)
## Soltou a permanente arrastada em `at` (pixels da mesa).
signal dropped(node: CardNode, at: Vector2)

## Quanto o mouse anda (pixels da mesa) antes de virar arrasto.
const THRESHOLD := 10.0

## Onde o mouse está (pixels da mesa), pelos eventos: assim os testes e os prints conseguem movê-lo.
var mouse: Vector2 = Vector2(-1, -1)
## Quanto o mouse andou desde a última vez que alguém zerou (o Tab marca um alvo; mexer o mouse devolve a mira a ele).
var travel: float = 0.0

var _button_down: bool = false
var _pending: CardNode
var _start: Vector2
var _dragging: CardNode


## Apertou uma permanente que dá para arrastar: espera para ver se é clique ou arrasto (se já soltou, é clique).
func press(node: CardNode) -> void:
	if not _button_down or _dragging != null:
		tapped.emit(node)
		return
	_pending = node
	_start = mouse


## A permanente sendo arrastada (null sem arrasto).
func dragging() -> CardNode:
	return _dragging if is_instance_valid(_dragging) else null


## Esc ou clique direito: larga o arrasto sem soltar em lugar nenhum. Devolve true se havia um.
func cancel() -> bool:
	var had: bool = _dragging != null or _pending != null
	_dragging = null
	_pending = null
	return had


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var button := event as InputEventMouseButton
		_button_down = button.pressed
		mouse = button.position
		if not button.pressed:
			_release(button.position)
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		travel += motion.position.distance_to(mouse) if mouse.x >= 0.0 else 0.0
		mouse = motion.position
		if _pending and _dragging == null and mouse.distance_to(_start) >= THRESHOLD:
			_dragging = _pending
			_pending = null
			if is_instance_valid(_dragging):
				drag_started.emit(_dragging)
			else:
				_dragging = null


func _release(at: Vector2) -> void:
	if _dragging != null:
		var node: CardNode = _dragging
		_dragging = null
		if is_instance_valid(node):
			dropped.emit(node, at)
		return
	if _pending != null:
		var node: CardNode = _pending
		_pending = null
		if is_instance_valid(node):
			tapped.emit(node)
