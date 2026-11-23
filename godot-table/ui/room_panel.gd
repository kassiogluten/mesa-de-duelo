# Sala de espera de uma partida em rede (FRoom): o código grande para chamar os outros (com copiar), quem já entrou e o Pronto
# de cada um, completar com computadores e sair, numa janela sobre a mesa desfocada. Some quando a partida começa.
class_name RoomPanel
extends Control

## Mensagem pronta para o servidor ({type:"room-ready", on}, {type:"fill-computers"}).
signal action(message: Dictionary)
signal leave_pressed

var _backdrop: ModalBackdrop
var _panel: PanelContainer
var _code: Label
var _copy: Button
var _count: Label
var _players: VBoxContainer
var _ready_button: Button
var _fill: Button
var _ready_on: bool = false
var _code_text: String = ""


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_backdrop = ModalBackdrop.new()
	add_child(_backdrop)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_panel.custom_minimum_size = Vector2(600, 0)
	_panel.resized.connect(func() -> void: _panel.pivot_offset = _panel.size / 2.0)
	center.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	_panel.add_child(column)
	column.add_child(ModalStyle.title("Sala de espera", 26))
	var code_row := HBoxContainer.new()
	code_row.alignment = BoxContainer.ALIGNMENT_CENTER
	code_row.add_theme_constant_override("separation", 16)
	column.add_child(code_row)
	var code_box := PanelContainer.new()
	var code_style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.9), 14, Color(ModalStyle.GOLD, 0.45), 1)
	code_style.content_margin_left = 26
	code_style.content_margin_right = 26
	code_style.content_margin_top = 4
	code_style.content_margin_bottom = 6
	code_box.add_theme_stylebox_override("panel", code_style)
	code_row.add_child(code_box)
	_code = ModalStyle.label(44, ModalStyle.GOLD_LIGHT)
	_code.name = "Code"
	code_box.add_child(_code)
	_copy = ModalStyle.button("Copiar código", ModalStyle.Kind.GHOST, 150, 40)
	_copy.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_copy.pressed.connect(_copy_code)
	code_row.add_child(_copy)
	column.add_child(ModalStyle.wrap(16, ModalStyle.MUTED, "Passe o código para quem vai jogar: dá para entrar pela mesa do navegador ou pela mesa no PC.", 520))
	_count = ModalStyle.label(14, ModalStyle.GOLD)
	column.add_child(_count)
	_players = VBoxContainer.new()
	_players.add_theme_constant_override("separation", 8)
	column.add_child(_players)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	column.add_child(actions)
	var leave := ModalStyle.button("Sair da sala", ModalStyle.Kind.GHOST, 150)
	leave.pressed.connect(func() -> void: leave_pressed.emit())
	actions.add_child(leave)
	_fill = ModalStyle.button("Completar com computadores", ModalStyle.Kind.SECONDARY, 0)
	_fill.pressed.connect(func() -> void: action.emit({"type": "fill-computers"}))
	actions.add_child(_fill)
	_ready_button = ModalStyle.button("Pronto", ModalStyle.Kind.PRIMARY, 200)
	_ready_button.name = "Ready"
	_ready_button.pressed.connect(func() -> void: action.emit({"type": "room-ready", "on": not _ready_on}))
	actions.add_child(_ready_button)


## Mostra a sala (o FRoom da mensagem `room`); começada a partida, some.
func show_room(room: Dictionary) -> void:
	var was_visible: bool = visible
	visible = not room.is_empty() and not bool(room.get("started", false))
	if not visible:
		return
	var capacity: int = int(room.get("capacity", (room.get("players", []) as Array).size()))
	var players: Array = room.get("players", [])
	_code_text = Txt.of(room.get("code"))
	_code.text = _code_text
	for child: Node in _players.get_children():
		child.queue_free()
	var my_seat: int = int(room.get("seat", -1))
	_ready_on = false
	var confirmed_count: int = 0
	for i: int in capacity:
		if i < players.size():
			var p: Dictionary = players[i]
			var mine: bool = int(p.get("seat", i)) == my_seat
			# `ready` é ter deck; `confirmed`, ter tocado em Pronto (a partida começa com todos prontos).
			var confirmed: bool = bool(p.get("confirmed", false))
			if mine:
				_ready_on = confirmed
			if confirmed:
				confirmed_count += 1
			var status: String = "pronto" if confirmed else ("escolhendo o deck" if p.get("ready") == false else "esperando")
			_players.add_child(_player_row("%s%s" % [Txt.of(p.get("name")), " (você)" if mine else ""], status, confirmed, mine))
		else:
			_players.add_child(_player_row("Lugar livre", "", false, false))
	_count.text = "%d de %d prontos" % [confirmed_count, capacity]
	_ready_button.text = "Não estou pronto" if _ready_on else "Pronto"
	ModalStyle.style_button(_ready_button, ModalStyle.Kind.SECONDARY if _ready_on else ModalStyle.Kind.PRIMARY)
	_fill.visible = players.size() < capacity
	if not was_visible:
		_backdrop.amount = 0.0
		_backdrop.fade(1.0, 0.24)
		_panel.modulate.a = 0.0
		_panel.scale = Vector2(0.96, 0.96)
		var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(_panel, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
		tween.tween_property(_panel, "scale", Vector2.ONE, ModalStyle.ENTER_TIME)


## Uma linha de jogador: a bolinha da situação, o nome e o selo (pronto em verde); o lugar livre fica apagado.
func _player_row(name: String, status: String, confirmed: bool, mine: bool) -> PanelContainer:
	var row := PanelContainer.new()
	var free: bool = status == ""
	var style := ModalStyle.box(Color(0.085, 0.125, 0.21, 0.35 if free else 0.9), 12, Color(ModalStyle.GOLD, 0.5) if mine else Color(1, 1, 1, 0.08 if free else 0.14), 1)
	style.content_margin_left = 16
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	row.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	row.add_child(line)
	var dot := Panel.new()
	dot.custom_minimum_size = Vector2(12, 12)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var dot_color: Color = ModalStyle.GOOD if confirmed else (Color(1, 1, 1, 0.18) if free else ModalStyle.WARN)
	var dot_style := ModalStyle.box(dot_color, 6)
	if confirmed:
		dot_style.shadow_color = Color(ModalStyle.GOOD, 0.5)
		dot_style.shadow_size = 6
	dot.add_theme_stylebox_override("panel", dot_style)
	line.add_child(dot)
	var name_label := ModalStyle.label(19, Color(1, 1, 1, 0.4) if free else ModalStyle.INK, name)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(name_label)
	if not free:
		var chip := PanelContainer.new()
		var color: Color = ModalStyle.GOOD if confirmed else ModalStyle.MUTED
		var chip_style := ModalStyle.box(Color(color, 0.12), 99, Color(color, 0.5), 1)
		chip_style.content_margin_left = 12
		chip_style.content_margin_right = 12
		chip_style.content_margin_top = 2
		chip_style.content_margin_bottom = 3
		chip.add_theme_stylebox_override("panel", chip_style)
		chip.add_child(ModalStyle.label(14, color, status))
		line.add_child(chip)
	return row


func _copy_code() -> void:
	if _code_text == "":
		return
	DisplayServer.clipboard_set(_code_text)
	_copy.text = "Copiado!"
	var button: WeakRef = weakref(_copy)
	get_tree().create_timer(1.6).timeout.connect(func() -> void:
		var copy: Button = button.get_ref() as Button
		if copy:
			copy.text = "Copiar código")
