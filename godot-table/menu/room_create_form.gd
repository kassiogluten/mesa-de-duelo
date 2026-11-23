# Criar sala na tela Jogar online, com as mesmas opções da mesa do navegador: formato, jogadores, duração, pública ou privada, código e deck.
class_name RoomCreateForm
extends PanelContainer

## Criar sala pedido: a configuração (MatchConfig), se é pública, o código escolhido ("" sorteia) e o deck ({} escolhe na sala).
signal create_pressed(config: Dictionary, public: bool, code: String, choice: Dictionary)
## Recusado aqui mesmo (código incompleto).
signal invalid(text: String)

var _format: OptionButton
var _players_row: Control
var _length_row: Control
var _players: Dictionary = {}
var _lengths: Dictionary = {}
var _visibility: Dictionary = {}
var _visibility_help: Label
var _code: LineEdit
var _code_help: Label
var _deck: DeckPicker
var _create: Button

var format: String = "standard"
var player_count: int = 4
var match_length: String = "bo1"
var public: bool = true


func _ready() -> void:
	var prefs: Dictionary = Prefs.load_all()
	format = Txt.of(prefs.get("room_format", "standard"))
	if not RoomMessages.FORMATS.has(format):
		format = "standard"
	player_count = clampi(int(prefs.get("room_players", 4)), 2, 4)
	match_length = "bo3" if Txt.of(prefs.get("room_length", "bo1")) == "bo3" else "bo1"
	public = Txt.of(prefs.get("room_visibility", "public")) != "private"

	var style := ModalStyle.panel_style(16)
	style.shadow_size = 18
	style.content_margin_left = 24
	style.content_margin_right = 24
	add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	add_child(column)
	column.add_child(ModalStyle.label(24, ModalStyle.GOLD, "Criar sala"))

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 10)
	column.add_child(grid)
	_format = OptionButton.new()
	_format.name = "Format"
	_format.custom_minimum_size = Vector2(0, 42)
	_format.add_theme_font_size_override("font_size", 17)
	_format.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for i: int in RoomMessages.FORMATS.size():
		_format.add_item(RoomMessages.format_label(RoomMessages.FORMATS[i]))
		if RoomMessages.FORMATS[i] == format:
			_format.select(i)
	_format.item_selected.connect(func(i: int) -> void:
		format = RoomMessages.FORMATS[i]
		Prefs.save("room_format", format)
		_sync())
	_field(grid, "Formato", _format)
	_players_row = _segmented([["2", "2"], ["3", "3"], ["4", "4"]], str(player_count), _players, func(value: String) -> void:
		player_count = int(value)
		Prefs.save("room_players", player_count))
	_field(grid, "Jogadores", _players_row)
	_length_row = _segmented([["bo1", "Partida única"], ["bo3", "Melhor de três"]], match_length, _lengths, func(value: String) -> void:
		match_length = value
		Prefs.save("room_length", value))
	_field(grid, "Duração", _length_row)
	var visibility_row := _segmented([["public", "Pública"], ["private", "Privada"]], "public" if public else "private", _visibility, func(value: String) -> void:
		public = value == "public"
		Prefs.save("room_visibility", value)
		_sync())
	_field(grid, "Sala", visibility_row)
	_visibility_help = ModalStyle.wrap(14, ModalStyle.FAINT, "", 0.0, false)
	_field(grid, "", _visibility_help)
	_code = LineEdit.new()
	_code.name = "RoomCode"
	_code.placeholder_text = "Sortear"
	_code.max_length = RoomMessages.ROOM_CODE_LENGTH
	_code.custom_minimum_size = Vector2(140, 42)
	_code.add_theme_font_size_override("font_size", 18)
	_code.text_changed.connect(func(text: String) -> void:
		var clean: String = RoomMessages.clean_code(text)
		if clean != text:
			var caret: int = _code.caret_column
			_code.text = clean
			_code.caret_column = mini(caret, clean.length())
		_sync())
	var code_line := HBoxContainer.new()
	code_line.add_theme_constant_override("separation", 12)
	code_line.add_child(_code)
	_code_help = ModalStyle.wrap(14, ModalStyle.FAINT, "", 0.0, false)
	_code_help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	code_line.add_child(_code_help)
	_field(grid, "Código", code_line)
	_deck = DeckPicker.new()
	_deck.name = "Deck"
	_deck.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_deck.picked.connect(func(choice: Dictionary) -> void: DeckChoices.remember(format, choice))
	_field(grid, "Seu deck", _deck)

	_create = ModalStyle.button("Criar sala", ModalStyle.Kind.PRIMARY, 0, 52)
	_create.name = "Create"
	_create.pressed.connect(_on_create)
	column.add_child(_create)
	_sync()


func set_busy(on: bool) -> void:
	_create.disabled = on


## O código digitado (para a tela levar o do link de uma sala que ainda não existe).
func set_code(code: String) -> void:
	_code.text = RoomMessages.clean_code(code).left(RoomMessages.ROOM_CODE_LENGTH)
	_sync()


func _field(grid: GridContainer, caption: String, control: Control) -> void:
	var label := ModalStyle.label(16, ModalStyle.MUTED, caption)
	label.custom_minimum_size = Vector2(96, 0)
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	grid.add_child(label)
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_child(control)


## Botões lado a lado em que só um fica marcado (o marcado em dourado).
func _segmented(options: Array, current: String, buttons: Dictionary, on_change: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for option: Array in options:
		var value: String = option[0]
		var button := ModalStyle.button(option[1], ModalStyle.Kind.PRIMARY if value == current else ModalStyle.Kind.GHOST, 0, 40)
		button.name = "Option_" + value
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		buttons[value] = button
		button.pressed.connect(func() -> void:
			for key: String in buttons:
				ModalStyle.style_button(buttons[key] as Button, ModalStyle.Kind.PRIMARY if key == value else ModalStyle.Kind.GHOST)
			on_change.call(value))
		row.add_child(button)
	return row


## Mostra só as opções que valem no formato e refaz a lista de decks dele.
func _sync() -> void:
	var command: bool = RoomMessages.has_command_zone(format)
	_players_row.get_parent().get_child(_players_row.get_index() - 1).visible = command
	_players_row.visible = command
	_length_row.get_parent().get_child(_length_row.get_index() - 1).visible = not command
	_length_row.visible = not command
	_visibility_help.text = "Aparece na lista de salas públicas para qualquer pessoa entrar." if public else "Só entra quem receber o código."
	var code: String = _code.text
	_code_help.text = "Códigos fáceis podem ser adivinhados por outras pessoas." if code != "" and not public else "Deixe vazio para sortear."
	if _deck.format != format:
		# O lembrado do formato, senão o primeiro da lista (dá para trocar depois, já na sala).
		var choice: Dictionary = DeckChoices.remembered(format)
		if choice.is_empty():
			var all: Array = DeckChoices.for_format(format)
			choice = all[0] if not all.is_empty() else {}
		_deck.set_format(format, Txt.of(choice.get("id")))


func _on_create() -> void:
	var code: String = _code.text
	if code != "" and code.length() != RoomMessages.ROOM_CODE_LENGTH:
		invalid.emit("O código da sala precisa ter 4 letras ou números.")
		return
	var choice: Dictionary = _deck.selected_choice()
	DeckChoices.remember(format, choice)
	create_pressed.emit(RoomMessages.config(format, match_length, player_count), public, code, choice)
