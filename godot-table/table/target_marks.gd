# Os números nos alvos já escolhidos (1, 2, 3…): uma moeda acesa sobre a carta ou o retrato, que segue o alvo quando ele se mexe.
class_name TargetMarks
extends Node3D

## [{key, text, color}]: a carta (id) ou "player:<id>", o número e a cor.
var marks: Array = []:
	set(value):
		marks = value
		_rebuild()

var _labels: Array[Label3D] = []


func _rebuild() -> void:
	while _labels.size() < marks.size():
		var label := Label3D.new()
		label.pixel_size = 0.0035
		label.font_size = 64
		label.outline_size = 18
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.render_priority = 12
		label.outline_render_priority = 11
		add_child(label)
		_labels.append(label)
	for i: int in _labels.size():
		var label: Label3D = _labels[i]
		label.visible = i < marks.size()
		if i < marks.size():
			var mark: Dictionary = marks[i]
			label.text = Txt.of(mark.get("text"))
			label.modulate = Color(0.12, 0.08, 0.02)
			label.outline_modulate = mark.get("color", TableHighlights.TARGET)


## Põe cada número sobre o alvo; `anchor` é TableView._anchor (a posição da carta ou do retrato na mesa, ou null).
func update_positions(anchor: Callable) -> void:
	for i: int in mini(marks.size(), _labels.size()):
		var at: Variant = anchor.call((marks[i] as Dictionary)["key"])
		_labels[i].visible = at is Vector3
		if at is Vector3:
			# Um pouco acima e para o alto da carta, para não tapar o nome nem o P/T.
			_labels[i].position = (at as Vector3) + Vector3(0.22, 0.3, -0.28)
