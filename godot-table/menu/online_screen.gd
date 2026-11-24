# Tela Jogar online: as salas públicas ao vivo, entrar pelo código ou pelo link de convite e criar sala, com as mesmas mensagens da mesa do navegador.
class_name OnlineScreen
extends Control

## Pedido pronto para a partida (host, join ou watch): a tela da partida o manda ao conectar.
signal play(start_message: Dictionary)
## Voltar à tela inicial.
signal back

const ForgeClient := preload("res://net/forge_client.gd")
const UpdateState := preload("res://boot/update_state.gd")
## De quanto em quanto tempo a lista de salas públicas se atualiza sozinha (ROOMS_EVERY_MS de src/ui/lobbyRooms.ts).
const ROOMS_EVERY_S := 10.0

## Sem servidor (prints e testes): a lista vem de show_rooms().
var offline: bool = false
var _client: ForgeClient = ForgeClient.new()
var _browser: RoomBrowser
var _form: RoomCreateForm
var _name: LineEdit
var _code: LineEdit
var _join: Button
var _watch: Button
var _status: Label
var _busy: bool = false
var _loading: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# O fundo de cena dos menus (luz, poeira dourada e vinheta), no lugar da cor chapada.
	add_child(MenuBackdrop.new())
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 72)
	margin.add_theme_constant_override("margin_top", 40)
	margin.add_theme_constant_override("margin_bottom", 36)
	add_child(margin)
	var page := VBoxContainer.new()
	page.add_theme_constant_override("separation", 18)
	margin.add_child(page)

	# O cabeçalho comum das telas (ui/ui_kit.gd): Voltar, a etiqueta dourada, o título e a explicação.
	var head: HBoxContainer = UiKit.screen_header("Jogar online", "Salas com outras pessoas, na mesa do navegador ou em outra mesa no PC.", "Mesa de Duelo")
	page.add_child(head)
	(head.get_node("Back") as Button).pressed.connect(func() -> void: back.emit())
	var name_box := VBoxContainer.new()
	name_box.add_theme_constant_override("separation", 4)
	name_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(name_box)
	name_box.add_child(UiKit.caption("Seu nome na mesa"))
	_name = _line_edit("Jogador", 280)
	_name.name = "PlayerName"
	_name.max_length = 24
	_name.text = _default_name()
	_name.text_changed.connect(func(text: String) -> void: Prefs.save("name", text.strip_edges()))
	name_box.add_child(_name)

	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 24)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(columns)
	_browser = RoomBrowser.new()
	_browser.name = "RoomBrowser"
	_browser.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_browser.size_flags_stretch_ratio = 1.35
	_browser.join_pressed.connect(func(code: String) -> void: _find_room(code, true, false))
	_browser.watch_pressed.connect(func(code: String) -> void: _watch_room(code, true))
	_browser.refresh_pressed.connect(_load_rooms)
	columns.add_child(_browser)
	var side := VBoxContainer.new()
	side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side.add_theme_constant_override("separation", 18)
	columns.add_child(side)
	side.add_child(_code_card())
	_form = RoomCreateForm.new()
	_form.name = "CreateForm"
	_form.create_pressed.connect(_on_create)
	_form.invalid.connect(func(text: String) -> void: set_status(text, true))
	side.add_child(_form)

	_status = ModalStyle.label(17, ModalStyle.MUTED, "")
	_status.name = "Status"
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	page.add_child(_status)

	if offline:
		return
	var timer := Timer.new()
	timer.wait_time = ROOMS_EVERY_S
	timer.autostart = true
	timer.timeout.connect(_on_tick)
	add_child(timer)
	_client.client_version = UpdateState.current_version()
	_client.connected.connect(_load_rooms)
	_client.connect_to(GameConfig.forge_url())


func _process(_delta: float) -> void:
	if not offline:
		_client.poll()


func _exit_tree() -> void:
	_client.close()


## Mostra a lista (Array de PublicRoom, ou "error"); para os prints sem servidor.
func show_rooms(rooms: Variant) -> void:
	_browser.show_rooms(rooms)


func set_status(text: String, error: bool = false) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", ModalStyle.BAD if error else ModalStyle.MUTED)


## Abre já buscando a sala de um código ou link (o "Entrar" da tela inicial, ou um link colado lá).
func open_code(text: String) -> void:
	_code.text = text
	_on_join_code()


## O cartão "Entrar com código": o campo (aceita o link de convite colado), Colar, Entrar e Assistir.
func _code_card() -> PanelContainer:
	var card := PanelContainer.new()
	var style := ModalStyle.panel_style(16)
	style.shadow_size = 18
	style.content_margin_left = 24
	style.content_margin_right = 24
	card.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	card.add_child(column)
	column.add_child(_card_title("Entrar com código"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)
	_code = _line_edit("Código ou link de convite", 0)
	_code.name = "JoinCode"
	_code.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_code.text_submitted.connect(func(_t: String) -> void: _on_join_code())
	row.add_child(_code)
	var paste := ModalStyle.button("Colar", ModalStyle.Kind.GHOST, 90, 44)
	paste.name = "Paste"
	paste.tooltip_text = "Colar o código ou o link que mandaram para você"
	paste.pressed.connect(func() -> void:
		_code.text = DisplayServer.clipboard_get().strip_edges()
		_code.caret_column = _code.text.length())
	row.add_child(paste)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	column.add_child(actions)
	_join = ModalStyle.button("Entrar", ModalStyle.Kind.PRIMARY, 0, 46)
	_join.name = "Join"
	_join.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_join.pressed.connect(_on_join_code)
	actions.add_child(_join)
	_watch = ModalStyle.button("Assistir", ModalStyle.Kind.SECONDARY, 0, 46)
	_watch.name = "Watch"
	_watch.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_watch.pressed.connect(func() -> void:
		var code: String = _typed_code()
		if code != "":
			_watch_room(code, false))
	actions.add_child(_watch)
	column.add_child(ModalStyle.wrap(14, ModalStyle.FAINT, "O código tem 4 letras ou números. Também dá para colar o link de convite da mesa do navegador.", 0.0, false))
	return card


## O título de um dos quadros da tela: branco, na letra encorpada (a direção Nítido).
static func _card_title(text: String) -> Label:
	var out := ModalStyle.label(23, Color.WHITE, text)
	out.add_theme_font_override("font", HudStyle.bold_font())
	out.add_theme_constant_override("outline_size", 0)
	return out


func _line_edit(placeholder: String, width: float) -> LineEdit:
	var edit := LineEdit.new()
	edit.placeholder_text = placeholder
	edit.custom_minimum_size = Vector2(width, 44)
	edit.add_theme_font_size_override("font_size", 18)
	return edit


## O nome guardado, senão o da variável MESA_NOME, senão o apelido da conta.
func _default_name() -> String:
	var saved: String = Txt.of(Prefs.load_all().get("name", ""))
	if saved != "":
		return saved
	if OS.get_environment("MESA_NOME") != "":
		return OS.get_environment("MESA_NOME")
	var account: Dictionary = AccountSession.account()
	return Txt.of(account.get("apelido", account.get("nome", "")))


func _player_name() -> String:
	var typed: String = _name.text.strip_edges()
	return typed if typed != "" else "Jogador"


func _typed_code() -> String:
	var code: String = RoomMessages.code_from_text(_code.text)
	if code == "":
		set_status("Use o código de 4 caracteres da sala, ou cole o link de convite.", true)
	return code


func _set_busy(on: bool) -> void:
	_busy = on
	_join.disabled = on
	_watch.disabled = on
	_form.set_busy(on)
	_browser.set_disabled(on)


func _on_tick() -> void:
	if not _busy and is_visible_in_tree():
		_load_rooms()


## Pede a lista de salas públicas; sem conexão, tenta abrir de novo e mostra o erro.
func _load_rooms() -> void:
	if offline or _loading:
		return
	if not _client.is_open():
		_browser.show_rooms("error")
		_client.connect_to(GameConfig.forge_url())
		return
	_loading = true
	_browser.set_loading(true)
	var screen: WeakRef = weakref(self)
	var reply: Dictionary = await _client.request({"type": "list-rooms"}).done
	var me: OnlineScreen = screen.get_ref() as OnlineScreen
	if me == null:
		return
	me._loading = false
	me._browser.set_loading(false)
	me._browser.show_rooms(reply.get("rooms", []) if Txt.of(reply.get("type")) == "room-list" else "error")


func _on_join_code() -> void:
	var code: String = _typed_code()
	if code != "" and not _busy:
		_find_room(code, false, _code.text.contains("sala="))


## Busca a sala pelo código e entra (findRoom de src/ui/lobby.ts): começada, assiste; cheia, avisa; da lista, atualiza
## a lista se ela mudou; pelo link, a sala que não existe pode ser criada com aquele código.
func _find_room(code: String, from_list: bool, from_link: bool) -> void:
	if _busy:
		return
	_set_busy(true)
	set_status("Buscando sala…")
	var screen: WeakRef = weakref(self)
	var reply: Dictionary = await _client.request({"type": "lookup-room", "code": code}).done
	var me: OnlineScreen = screen.get_ref() as OnlineScreen
	if me == null:
		return
	me._set_busy(false)
	me._on_lookup(code, reply, from_list, from_link)


func _on_lookup(code: String, reply: Dictionary, from_list: bool, from_link: bool) -> void:
	if Txt.of(reply.get("type")) != "room-info":
		if from_link and code.length() == RoomMessages.ROOM_CODE_LENGTH and Txt.of(reply.get("reason")) == "room-not-found":
			_form.set_code(code)
			set_status("A sala %s ainda não existe. Confira as opções e toque em Criar sala para abri-la com esse código." % code)
			return
		set_status(_reply_text(reply, "Não foi possível encontrar a sala."), true)
		if from_list:
			_load_rooms()
		return
	var info: Dictionary = reply.get("room", {})
	if not bool(info.get("available", false)):
		if bool(info.get("started", false)):
			_watch_room(code, from_list)
			return
		var capacity: int = int(info.get("capacity", (info.get("config", {}) as Dictionary).get("playerCount", 2)))
		set_status("A sala %s já está completa." % code if (info.get("players", []) as Array).size() >= capacity else "A partida da sala %s já começou." % code, true)
		if from_list:
			_load_rooms()
		return
	if bool(info.get("lab", false)):
		set_status("A sala %s é uma sala de teste do Laboratório: entre nela pela mesa do navegador." % code, true)
		return
	# Entra com o deck lembrado do formato; sem ele, entra sem deck e escolhe na sala.
	var format: String = Txt.of((info.get("config", {}) as Dictionary).get("format"))
	set_status("Entrando na sala %s…" % code)
	play.emit(RoomMessages.join(code, _player_name(), DeckChoices.seat_deck(DeckChoices.remembered(format))))


func _watch_room(code: String, _from_list: bool) -> void:
	if _busy:
		return
	set_status("Entrando para assistir à sala %s…" % code)
	play.emit(RoomMessages.watch(code, _name.text.strip_edges()))


func _on_create(config: Dictionary, public: bool, code: String, choice: Dictionary) -> void:
	if _busy:
		return
	set_status("Criando a sala…")
	play.emit(RoomMessages.host(_player_name(), DeckChoices.seat_deck(choice), config, public, code))


## O texto de uma resposta recusada (do servidor ou do próprio cliente, sem conexão).
static func _reply_text(reply: Dictionary, fallback: String) -> String:
	for key: String in ["text", "message"]:
		if Txt.of(reply.get(key)) != "":
			return Txt.of(reply.get(key))
	return fallback
