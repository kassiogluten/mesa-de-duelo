# Janela da tela inicial no estilo das da mesa (ModalStyle): fundo desfocado, painel no centro, entrada e saída curtas, Esc fecha.
class_name MenuModal
extends Control

## A janela fechou (por um botão, pelo Esc ou por um clique fora).
signal closed

## Onde a tela põe o conteúdo.
var body: VBoxContainer
var _box: PanelContainer
var _backdrop: ModalBackdrop
var _closing: bool = false


## `width`: a largura do conteúdo; `title`: o título dourado (vazio: sem título).
func _init(title: String = "", width: float = 560.0) -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_backdrop = ModalBackdrop.new()
	add_child(_backdrop)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_box = PanelContainer.new()
	_box.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_box.resized.connect(func() -> void: _box.pivot_offset = _box.size / 2.0)
	center.add_child(_box)
	body = VBoxContainer.new()
	body.add_theme_constant_override("separation", 14)
	body.custom_minimum_size = Vector2(width, 0)
	_box.add_child(body)
	if title != "":
		body.add_child(ModalStyle.title(title, 28))


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	UiSounds.play("open")
	_backdrop.amount = 0.0
	_backdrop.fade(1.0, 0.24)
	_box.modulate.a = 0.0
	_box.scale = Vector2(0.96, 0.96)
	var tween := _box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_box, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
	tween.tween_property(_box, "scale", Vector2.ONE, ModalStyle.ENTER_TIME)


## Fecha com a saída curta das janelas e se apaga.
func close() -> void:
	if _closing:
		return
	_closing = true
	UiSounds.play("close")
	_backdrop.fade(0.0, ModalStyle.EXIT_TIME)
	var tween := _box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_box, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	tween.tween_property(_box, "scale", Vector2(0.97, 0.97), ModalStyle.EXIT_TIME)
	var me: WeakRef = weakref(self)
	tween.chain().tween_callback(func() -> void:
		var modal: MenuModal = me.get_ref()
		if modal:
			modal.closed.emit()
			modal.queue_free())


## Uma fileira de botões no pé da janela, alinhados à direita.
func buttons(list: Array) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 12)
	for button: Variant in list:
		row.add_child(button)
	body.add_child(row)
	return row


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()
