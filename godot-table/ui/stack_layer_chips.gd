# Os números das camadas de baixo da pilha (2, 3, 4) na quina de cada carta que aparece por trás do topo, na cor do tipo de
# cada item, e o "+N" dos itens escondidos atrás da última: deixa claro que há mais itens debaixo do topo.
class_name StackLayerChips
extends Control

const SIZE := 24.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Refaz os números para a pilha (`max_peek`: quantas camadas aparecem por trás do topo).
func fill(stack: Array, max_peek: int) -> void:
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	for depth: int in range(1, mini(stack.size(), max_peek + 1)):
		add_child(_chip(str(depth + 1), StackStyle.kind_color(stack[depth]), depth))
	var hidden: int = stack.size() - (max_peek + 1)
	if hidden > 0:
		add_child(_chip("+%d" % hidden, Color(0.62, 0.68, 0.8), max_peek + 1))


## Põe cada número na quina de cima à esquerda da camada dele (`layer_rect`: StackPanel.layer_rect); o "+N", um passo
## (`peek`) além da última camada.
func place(layer_rect: Callable, max_peek: int, peek: Vector2) -> void:
	for chip: Control in get_children():
		var depth: int = int(chip.get_meta("depth"))
		var corner: Vector2 = (layer_rect.call(mini(depth, max_peek)) as Rect2).position
		if depth > max_peek:
			corner += peek
		chip.reset_size()
		chip.position = corner + Vector2(-chip.size.x / 2.0 + 3.0, 3.0)


## Os textos, de cima para baixo (para os testes).
func texts() -> PackedStringArray:
	var out: PackedStringArray = []
	for chip: Node in get_children():
		out.append(((chip as Control).get_child(0) as Label).text)
	return out


func _chip(text: String, color: Color, depth: int) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.name = "Layer%d" % depth
	var style := ModalStyle.box(Color(0.04, 0.05, 0.09, 0.96), int(SIZE / 2.0), color.lightened(0.15), 2)
	style.content_margin_left = 5
	style.content_margin_right = 5
	style.shadow_color = Color(color, 0.5)
	style.shadow_size = 7
	chip.add_theme_stylebox_override("panel", style)
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.custom_minimum_size = Vector2(SIZE, SIZE)
	var label := Hud._label(14, color.lightened(0.55))
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	chip.add_child(label)
	chip.set_meta("depth", depth)
	return chip
