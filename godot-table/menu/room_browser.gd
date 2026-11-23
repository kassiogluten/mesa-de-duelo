# A lista de salas públicas da tela Jogar online: as que esperam jogadores (Entrar) e as em andamento (Assistir), com o resumo e o Atualizar.
class_name RoomBrowser
extends PanelContainer

signal join_pressed(code: String)
signal watch_pressed(code: String)
signal refresh_pressed

var _status: Label
var _list: VBoxContainer
var _refresh: Button
var _rooms: Array = []
## null: procurando pela primeira vez; "error": o servidor não respondeu; Array: a lista.
var _state: Variant = null
var _disabled: bool = false
var _drawn: String = ""


func _ready() -> void:
	var style := ModalStyle.panel_style(16)
	style.shadow_size = 18
	style.content_margin_left = 24
	style.content_margin_right = 24
	add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	add_child(column)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	column.add_child(head)
	var title := ModalStyle.label(24, ModalStyle.GOLD, "Salas públicas")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	_refresh = ModalStyle.button("Atualizar", ModalStyle.Kind.GHOST, 120, 38)
	_refresh.name = "Refresh"
	_refresh.pressed.connect(func() -> void: refresh_pressed.emit())
	head.add_child(_refresh)
	_status = ModalStyle.label(16, ModalStyle.MUTED, "Procurando salas…")
	column.add_child(_status)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	_list = VBoxContainer.new()
	_list.name = "Rooms"
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	scroll.add_child(_list)
	_render()


## A lista chegou (Array) ou falhou ("error").
func show_rooms(state: Variant) -> void:
	# A lista se atualiza sozinha: igual à de antes, nada se redesenha (o mouse continua sobre o mesmo botão).
	var drawn: String = JSON.stringify(state) if state != null else ""
	if drawn == _drawn and _state != null:
		return
	_drawn = drawn
	_state = state
	_rooms = state if state is Array else []
	_render()


func set_loading(on: bool) -> void:
	_refresh.disabled = on
	_refresh.text = "Procurando…" if on else "Atualizar"


## Pedido em andamento: os botões da lista ficam desligados.
func set_disabled(on: bool) -> void:
	_disabled = on
	for button: Button in _list.find_children("*", "Button", true, false):
		button.disabled = on


func rooms() -> Array:
	return _rooms


func _render() -> void:
	if _list == null:
		return
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	if _state == null:
		_status.text = "Procurando salas…"
		return
	if _state is String:
		_status.text = "Não foi possível ver as salas agora. Tente atualizar."
		return
	_status.text = PublicRooms.status_text(_rooms)
	for room: Dictionary in PublicRooms.joinable(_rooms):
		_list.add_child(_row(room, false))
	for room: Dictionary in PublicRooms.watchable(_rooms):
		_list.add_child(_row(room, true))
	if _list.get_child_count() == 0:
		_list.add_child(ModalStyle.wrap(17, ModalStyle.FAINT, "Crie uma sala pública e ela aparece aqui para qualquer pessoa entrar, aqui ou na mesa do navegador.", 0.0, false))


## Uma linha: o título ("Sala de Ana"), os detalhes e o botão; a em andamento leva o selo vermelho.
func _row(room: Dictionary, live: bool) -> PanelContainer:
	var row := PanelContainer.new()
	var style := ModalStyle.box(Color(0.085, 0.125, 0.21, 0.9), 12, Color(1, 1, 1, 0.12), 1)
	style.content_margin_left = 18
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	row.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 14)
	row.add_child(line)
	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_theme_constant_override("separation", 2)
	line.add_child(text)
	var name_label := ModalStyle.label(19, ModalStyle.INK, PublicRooms.title(room))
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text.add_child(name_label)
	var info := HBoxContainer.new()
	info.add_theme_constant_override("separation", 8)
	text.add_child(info)
	if live:
		var chip := PanelContainer.new()
		var chip_style := ModalStyle.box(Color(ModalStyle.BAD, 0.16), 99, Color(ModalStyle.BAD, 0.6), 1)
		chip_style.content_margin_left = 8
		chip_style.content_margin_right = 8
		chip.add_theme_stylebox_override("panel", chip_style)
		chip.add_child(ModalStyle.label(13, ModalStyle.BAD, "Em andamento"))
		info.add_child(chip)
	else:
		var chip := PanelContainer.new()
		var chip_style := ModalStyle.box(Color(ModalStyle.GOOD, 0.12), 99, Color(ModalStyle.GOOD, 0.5), 1)
		chip_style.content_margin_left = 8
		chip_style.content_margin_right = 8
		chip.add_theme_stylebox_override("panel", chip_style)
		chip.add_child(ModalStyle.label(13, ModalStyle.GOOD, "Esperando"))
		info.add_child(chip)
	info.add_child(ModalStyle.label(15, ModalStyle.MUTED, PublicRooms.details(room)))
	var code: String = Txt.of(room.get("code"))
	var button := ModalStyle.button("Assistir" if live else "Entrar", ModalStyle.Kind.SECONDARY if live else ModalStyle.Kind.PRIMARY, 130, 42)
	button.name = ("Watch_" if live else "Join_") + code
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.disabled = _disabled
	button.tooltip_text = "Assistir sem jogar" if live else "Entrar nesta sala"
	button.pressed.connect(func() -> void:
		if live:
			watch_pressed.emit(code)
		else:
			join_pressed.emit(code))
	line.add_child(button)
	return row
