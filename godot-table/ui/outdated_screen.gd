# Tela que segura a mesa quando o servidor fala um protocolo mais novo do que ela entende: pede a atualização, com educação.
class_name OutdatedScreen
extends Control

signal update_pressed
signal back_pressed


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	add_child(ModalBackdrop.new())
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	center.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	column.custom_minimum_size = Vector2(520, 0)
	box.add_child(column)
	column.add_child(ModalStyle.title("Atualização necessária", 28))
	column.add_child(ModalStyle.wrap(19, ModalStyle.INK, "A mesa precisa ser atualizada para conversar com o servidor.", 520))
	column.add_child(ModalStyle.wrap(16, ModalStyle.MUTED, "Ela fecha e abre de novo, já com a versão nova. Leva poucos segundos.", 520))
	var update := ModalStyle.button("Atualizar agora", ModalStyle.Kind.PRIMARY, 300)
	update.name = "Update"
	update.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	update.pressed.connect(func() -> void: update_pressed.emit())
	column.add_child(update)
	var back := ModalStyle.button("Voltar ao início", ModalStyle.Kind.GHOST, 300, 42)
	back.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(func() -> void: back_pressed.emit())
	column.add_child(back)


func open() -> void:
	visible = true
	move_to_front()
	var backdrop: ModalBackdrop = get_node("Backdrop")
	backdrop.amount = 0.0
	backdrop.fade(1.0, 0.3)


func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()
