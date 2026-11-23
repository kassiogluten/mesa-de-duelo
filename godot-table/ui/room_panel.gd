# Sala de espera de uma partida em rede (FRoom), no mesmo passo da mesa do navegador (src/ui/roomLobby.ts): o código e o link
# para chamar os outros, os lugares em ordem, o seu deck, as mensagens prontas, o Pronto, completar com computadores e sair,
# numa janela sobre a mesa desfocada. Some quando a partida começa.
class_name RoomPanel
extends Control

## Mensagem pronta para o servidor ({type:"room-ready", on}, {type:"fill-computers"}, {type:"room-say", key}; sem `client`,
## também o {type:"room-deck"}).
signal action(message: Dictionary)
signal leave_pressed

const ForgeClient := preload("res://net/forge_client.gd")
## Igual ao intervalo mínimo do servidor entre mensagens prontas: antes disso, outro clique seria ignorado lá.
const SAY_EVERY_S := 1.5

## A conexão da partida, para escolher o deck esperando a resposta (room-deck com requestId, como o navegador).
var client: ForgeClient

var _backdrop: ModalBackdrop
var _panel: PanelContainer
var _kicker: Label
var _code: Label
var _copy: Button
var _copy_link: Button
var _help: Label
var _progress: Label
var _seats: RoomSeats
var _spectators: Label
var _deck_row: Control
var _deck: DeckPicker
var _sayings: Array[Button] = []
var _status: Label
var _ready_button: Button
var _fill: Button
var _room: Dictionary = {}
var _ready_on: bool = false
var _code_text: String = ""
var _picker_key: String = ""
var _choosing: bool = false
## O deck escolhido aqui na sala (antes mesmo da resposta: a sala nova chega antes dela).
var _deck_id: String = ""


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
	_panel.custom_minimum_size = Vector2(820, 0)
	_panel.resized.connect(func() -> void: _panel.pivot_offset = _panel.size / 2.0)
	center.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	_panel.add_child(column)
	column.add_child(ModalStyle.title("Sala de espera", 26))
	_kicker = ModalStyle.label(15, ModalStyle.MUTED)
	_kicker.name = "Kicker"
	_kicker.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_kicker)
	column.add_child(_code_row())
	_help = ModalStyle.wrap(15, ModalStyle.MUTED, "", 720)
	column.add_child(_help)
	_progress = ModalStyle.wrap(16, ModalStyle.GOLD, "", 720)
	_progress.name = "Progress"
	column.add_child(_progress)
	_seats = RoomSeats.new()
	_seats.name = "Seats"
	column.add_child(_seats)
	_spectators = ModalStyle.label(14, ModalStyle.FAINT)
	column.add_child(_spectators)
	column.add_child(_deck_line())
	column.add_child(_sayings_line())
	_status = ModalStyle.wrap(15, ModalStyle.MUTED, "", 720)
	_status.name = "Status"
	column.add_child(_status)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	column.add_child(actions)
	var leave := ModalStyle.button("Sair da sala", ModalStyle.Kind.GHOST, 150)
	leave.name = "Leave"
	leave.pressed.connect(func() -> void: leave_pressed.emit())
	actions.add_child(leave)
	_fill = ModalStyle.button("Completar com computadores", ModalStyle.Kind.SECONDARY, 0)
	_fill.name = "Fill"
	_fill.pressed.connect(_on_fill)
	actions.add_child(_fill)
	_ready_button = ModalStyle.button("Pronto", ModalStyle.Kind.PRIMARY, 200)
	_ready_button.name = "Ready"
	_ready_button.pressed.connect(func() -> void: action.emit({"type": "room-ready", "on": not _ready_on}))
	actions.add_child(_ready_button)


func _code_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	var code_box := PanelContainer.new()
	var code_style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.9), 14, Color(ModalStyle.GOLD, 0.45), 1)
	code_style.content_margin_left = 26
	code_style.content_margin_right = 26
	code_style.content_margin_top = 2
	code_style.content_margin_bottom = 4
	code_box.add_theme_stylebox_override("panel", code_style)
	row.add_child(code_box)
	_code = ModalStyle.label(44, ModalStyle.GOLD_LIGHT)
	_code.name = "Code"
	code_box.add_child(_code)
	_copy = ModalStyle.button("Copiar código", ModalStyle.Kind.SECONDARY, 150, 42)
	_copy.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_copy.pressed.connect(func() -> void: _copy_text(_code_text, _copy, "Copiar código", "Código copiado"))
	row.add_child(_copy)
	_copy_link = ModalStyle.button("Copiar link", ModalStyle.Kind.GHOST, 140, 42)
	_copy_link.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_copy_link.tooltip_text = "O link abre a sala na mesa do navegador"
	_copy_link.pressed.connect(func() -> void: _copy_text(RoomMessages.invite_link(_code_text), _copy_link, "Copiar link", "Link copiado"))
	row.add_child(_copy_link)
	return row


func _deck_line() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.name = "DeckRow"
	row.add_theme_constant_override("separation", 12)
	_deck_row = row
	var label := ModalStyle.label(16, ModalStyle.MUTED, "Seu deck")
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(label)
	_deck = DeckPicker.new()
	_deck.name = "Deck"
	_deck.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_deck.picked.connect(_choose_deck)
	row.add_child(_deck)
	return row


func _sayings_line() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	var label := ModalStyle.label(14, ModalStyle.FAINT, "Mandar para a sala")
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(label)
	for saying: Array in RoomSeats.SAYINGS:
		var key: String = saying[0]
		var button := ModalStyle.button(saying[1], ModalStyle.Kind.GHOST, 0, 34)
		button.name = "Say_" + key
		button.pressed.connect(func() -> void: _say(key))
		_sayings.append(button)
		row.add_child(button)
	return row


## Mostra a sala (o FRoom da mensagem `room`); começada a partida, some.
func show_room(room: Dictionary) -> void:
	var was_visible: bool = visible
	visible = not room.is_empty() and not bool(room.get("started", false))
	if not visible:
		_room = {}
		_picker_key = ""
		_deck_id = ""
		return
	_room = room
	var config: Dictionary = room.get("config", {}) if room.get("config") is Dictionary else {}
	var format: String = Txt.of(config.get("format"))
	var capacity: int = int(room.get("capacity", config.get("playerCount", 2)))
	var players: Array = room.get("players", [])
	var lab: bool = bool(room.get("lab", false))
	var full: bool = players.size() >= capacity
	var mine: Dictionary = RoomSeats.player_at(room, int(room.get("seat", -1)))
	var choosing: int = players.filter(func(p: Dictionary) -> bool: return p.get("ready") == false).size()
	# Servidores antigos não mandam confirmed: lá a partida começava sozinha, sem Pronto.
	var uses_ready: bool = not lab and players.any(func(p: Dictionary) -> bool: return p.get("confirmed") != null)
	var waiting: int = players.filter(func(p: Dictionary) -> bool: return p.get("ready") != false and p.get("confirmed") != true).size() if uses_ready else 0
	_code_text = Txt.of(room.get("code"))
	_code.text = _code_text
	var length: String = "Melhor de três" if Txt.of(config.get("matchLength")) == "bo3" else "Partida única"
	_kicker.text = "Sala de teste · Laboratório" if lab else "%s · %s · %s" % ["Sala pública" if bool(room.get("public", false)) else "Sala privada", RoomMessages.format_label(format), length]
	_help.text = "Quem abrir o link na mesa do navegador vai direto para a sala. Ou passe o código %s, para digitar em Entrar com código, aqui ou no navegador.%s" % [_code_text, " A sala também aparece na lista de salas públicas." if bool(room.get("public", false)) else ""]
	_progress.text = _progress_text(players.size(), capacity, full, choosing, waiting, uses_ready)
	_seats.render(room)
	var watchers: Array = room.get("spectators", []) if room.get("spectators") is Array else []
	_spectators.visible = not watchers.is_empty()
	_spectators.text = "Assistindo: %s" % ", ".join(PackedStringArray(watchers.map(func(n: Variant) -> String: return Txt.of(n))))
	_sync_deck(format, mine, lab)
	_ready_on = mine.get("confirmed") == true
	_ready_button.visible = uses_ready and not mine.is_empty()
	_ready_button.disabled = mine.get("ready") == false
	_ready_button.tooltip_text = "Escolha seu deck antes." if mine.get("ready") == false else ("Toque de novo se ainda não quiser começar." if _ready_on else "")
	_ready_button.text = "✓ Pronto" if _ready_on else "Pronto"
	ModalStyle.style_button(_ready_button, ModalStyle.Kind.SECONDARY if _ready_on else ModalStyle.Kind.PRIMARY)
	# Só o anfitrião: os lugares vazios viram computadores com decks prontos do formato, com todos já prontos.
	var free_seats: int = capacity - players.size()
	var others_waiting: int = players.filter(func(p: Dictionary) -> bool: return p != mine and p.get("ready") != false and uses_ready and p.get("confirmed") != true).size()
	_fill.visible = not full and int(room.get("seat", -1)) == 0 and not lab
	_fill.disabled = choosing > 0 or others_waiting > 0
	_fill.tooltip_text = "Espere todos escolherem o deck." if choosing > 0 else ("Espere todos tocarem em Pronto." if others_waiting > 0 else "")
	_fill.text = "Completar com um computador e começar" if free_seats == 1 else "Completar com %d computadores e começar" % free_seats
	if not was_visible:
		set_status("")
		_backdrop.amount = 0.0
		_backdrop.fade(1.0, 0.24)
		_panel.modulate.a = 0.0
		_panel.scale = Vector2(0.96, 0.96)
		var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(_panel, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
		tween.tween_property(_panel, "scale", Vector2.ONE, ModalStyle.ENTER_TIME)


## O que falta para a partida começar (#roomProgress da mesa do navegador).
static func _progress_text(count: int, capacity: int, full: bool, choosing: int, waiting: int, uses_ready: bool) -> String:
	if not full:
		return "%d de %d jogadores. A partida começa quando a mesa encher e todos %s." % [count, capacity, "tocarem em Pronto" if uses_ready else "tiverem deck"]
	if choosing > 0:
		return "Mesa completa. A partida começa quando %s%s." % ["o último jogador escolher o deck" if choosing == 1 else "todos escolherem o deck", " e tocar em Pronto" if uses_ready else ""]
	if waiting > 0:
		return "Mesa completa. A partida começa quando %s em Pronto." % ("o último jogador tocar" if waiting == 1 else "todos tocarem")
	return "Mesa completa. A partida vai começar."


## Balão de mensagem pronta sobre o lugar de quem mandou ({type:"room-say", seat, key}).
func say(seat: int, key: String) -> void:
	if visible:
		_seats.say(seat, key)


func set_status(text: String, error: bool = false) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", ModalStyle.BAD if error else ModalStyle.MUTED)


## A lista de decks do formato da sala, refeita só quando o formato ou o "tem deck" do seu lugar mudam (senão fecharia
## a lista aberta a cada atualização da sala).
func _sync_deck(format: String, mine: Dictionary, lab: bool) -> void:
	_deck_row.visible = not lab and not mine.is_empty()
	var has_deck: bool = mine.get("ready") != false
	var key: String = "%s|%s" % [format, has_deck]
	if key == _picker_key or not _deck_row.visible:
		return
	_picker_key = key
	# Com deck, é o que entrou na sala (o lembrado do formato: o escolhido ao criar ou o usado ao entrar).
	var choice: Dictionary = (DeckChoices.find(format, _deck_id) if _deck_id != "" else DeckChoices.remembered(format)) if has_deck else {}
	_deck.set_format(format, Txt.of(choice.get("id")), "O deck com que você entrou (toque para trocar)" if has_deck else "Escolha um deck")


## Senta com o deck escolhido (ou troca o de antes): room-deck com requestId, e a resposta diz se valeu.
func _choose_deck(choice: Dictionary) -> void:
	if _choosing or _room.is_empty():
		return
	var format: String = Txt.of((_room.get("config", {}) as Dictionary).get("format"))
	var message: Dictionary = RoomMessages.room_deck(DeckChoices.seat_deck(choice))
	if client == null:
		DeckChoices.remember(format, choice)
		action.emit(message)
		return
	_choosing = true
	var previous: String = _deck_id
	_deck_id = Txt.of(choice.get("id"))
	_deck.disabled = true
	set_status("Escolhendo %s…" % Txt.of(choice.get("name")))
	var panel: WeakRef = weakref(self)
	var reply: Dictionary = await client.request(message).done
	var me: RoomPanel = panel.get_ref() as RoomPanel
	if me == null:
		return
	me._choosing = false
	me._deck.disabled = false
	if Txt.of(reply.get("type")) == "room-deck":
		DeckChoices.remember(format, choice)
		me.set_status("")
		return
	me._deck_id = previous
	me.set_status(_refusal_text(reply), true)
	# O deck recusado não fica marcado: a lista volta ao que o servidor tem.
	me._picker_key = ""
	me._sync_deck(format, RoomSeats.player_at(me._room, int(me._room.get("seat", -1))), bool(me._room.get("lab", false)))


## O motivo de uma recusa: os problemas do deck (validation-error) ou o texto do servidor.
static func _refusal_text(reply: Dictionary) -> String:
	var validation: Variant = reply.get("validation")
	if validation is Dictionary:
		var issues: PackedStringArray = []
		for issue: Dictionary in (validation as Dictionary).get("issues", []):
			issues.append(("%s: " % Txt.of(issue["card"]) if Txt.of(issue.get("card")) != "" else "") + Txt.of(issue.get("message")))
		if not issues.is_empty():
			return " ".join(issues)
	for key: String in ["text", "message"]:
		if Txt.of(reply.get(key)) != "":
			return Txt.of(reply.get(key))
	return "Não foi possível escolher este deck."


func _on_fill() -> void:
	_fill.disabled = true
	set_status("Completando a mesa com computadores…")
	action.emit({"type": "fill-computers"})


## Manda a mensagem pronta e segura os botões pelo intervalo do servidor.
func _say(key: String) -> void:
	action.emit({"type": "room-say", "key": key})
	for button: Button in _sayings:
		button.disabled = true
	var panel: WeakRef = weakref(self)
	get_tree().create_timer(SAY_EVERY_S).timeout.connect(func() -> void:
		var me: RoomPanel = panel.get_ref() as RoomPanel
		if me:
			for button: Button in me._sayings:
				button.disabled = false)


func _copy_text(text: String, button: Button, label: String, done: String) -> void:
	if _code_text == "":
		return
	DisplayServer.clipboard_set(text)
	button.text = done
	var holder: WeakRef = weakref(button)
	get_tree().create_timer(1.6).timeout.connect(func() -> void:
		var copy: Button = holder.get_ref() as Button
		if copy:
			copy.text = label)
