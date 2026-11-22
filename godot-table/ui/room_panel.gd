# Sala de espera de uma partida em rede (FRoom): o código para chamar os outros, quem já entrou, o Pronto de cada um,
# completar com computadores e sair. Some quando a partida começa.
class_name RoomPanel
extends PanelContainer

## Mensagem pronta para o servidor ({type:"room-ready", on}, {type:"fill-computers"}).
signal action(message: Dictionary)
signal leave_pressed

var _title: Label
var _players: VBoxContainer
var _ready_button: Button
var _fill: Button
var _ready_on: bool = false


func _ready() -> void:
	add_theme_stylebox_override("panel", Hud._panel_style(Color(0.04, 0.05, 0.09, 0.96), 18))
	set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	custom_minimum_size = Vector2(560, 0)
	visible = false
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	add_child(column)
	_title = Hud._label(30, Hud.GOLD)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_title)
	var hint := Hud._label(17, Color(1, 1, 1, 0.65))
	hint.text = "Passe o código para quem vai jogar: dá para entrar pela mesa do navegador ou pela mesa no PC."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(hint)
	_players = VBoxContainer.new()
	_players.add_theme_constant_override("separation", 6)
	column.add_child(_players)
	_fill = Hud._button("Completar com computadores", false)
	_fill.pressed.connect(func() -> void: action.emit({"type": "fill-computers"}))
	column.add_child(_fill)
	_ready_button = Hud._button("Pronto", true)
	_ready_button.pressed.connect(func() -> void: action.emit({"type": "room-ready", "on": not _ready_on}))
	column.add_child(_ready_button)
	var leave := Hud._button("Sair da sala", false)
	leave.pressed.connect(func() -> void: leave_pressed.emit())
	column.add_child(leave)


## Mostra a sala (o FRoom da mensagem `room`); começada a partida, some.
func show_room(room: Dictionary) -> void:
	visible = not room.is_empty() and not bool(room.get("started", false))
	if not visible:
		return
	var capacity: int = int(room.get("capacity", (room.get("players", []) as Array).size()))
	var players: Array = room.get("players", [])
	_title.text = "Sala %s" % Txt.of(room.get("code"))
	for child: Node in _players.get_children():
		child.queue_free()
	var my_seat: int = int(room.get("seat", -1))
	_ready_on = false
	for i: int in capacity:
		var line := Hud._label(20, Color.WHITE)
		if i < players.size():
			var p: Dictionary = players[i]
			var mine: bool = int(p.get("seat", i)) == my_seat
			# `ready` é ter deck; `confirmed`, ter tocado em Pronto (a partida começa com todos prontos).
			var confirmed: bool = bool(p.get("confirmed", false))
			if mine:
				_ready_on = confirmed
			line.text = "%s%s · %s" % [Txt.of(p.get("name")), " (você)" if mine else "", "pronto" if confirmed else ("escolhendo o deck" if p.get("ready") == false else "esperando")]
			line.add_theme_color_override("font_color", Color(0.55, 1.0, 0.6) if confirmed else Color.WHITE)
		else:
			line.text = "Lugar livre"
			line.add_theme_color_override("font_color", Color(1, 1, 1, 0.4))
		_players.add_child(line)
	_ready_button.text = "Não estou pronto" if _ready_on else "Pronto"
	_fill.visible = players.size() < capacity
