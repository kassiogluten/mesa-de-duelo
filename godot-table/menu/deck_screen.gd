# Meus decks na mesa no PC: os decks do jogador por formato, com cores, cartas e a marca de válido; jogar, renomear,
# duplicar, excluir (com confirmação e Desfazer), importar por texto e o estado da sincronia com a conta.
class_name DeckScreen
extends Control

## O jogador escolheu um deck para jogar.
signal chosen(deck: Dictionary)
signal closed

## Quanto tempo o Desfazer fica à mostra depois de excluir.
const UNDO_S := 10.0

## A sincronia da conta (do menu, que vive mais que esta tela); null nos testes sem conta.
var sync: DeckSync
var catalog: CardCatalog
var checker: DeckCheck
var decks: Array = []
## O formato do filtro ("": todos).
var filter: String = ""

var _list: VBoxContainer
var _filters: HBoxContainer
var _sync_label: Label
var _notice: Label
var _undo: PanelContainer
var _undo_text: Label
var _undo_timer: Timer
var _removed: Dictionary = {}
var _rows: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	if catalog == null:
		catalog = CardCatalog.new()
		add_child(catalog)
	if checker == null:
		checker = DeckCheck.new()
		add_child(checker)
	catalog.info_ready.connect(func(_names: PackedStringArray) -> void: _paint_rows())
	checker.checked.connect(func(_key: String, _result: Dictionary) -> void: _paint_rows())
	var background := ColorRect.new()
	background.color = Color(0.04, 0.05, 0.09)
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 64)
	margin.add_theme_constant_override("margin_top", 36)
	margin.add_theme_constant_override("margin_bottom", 28)
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	margin.add_child(column)
	column.add_child(_header())
	_notice = ModalStyle.wrap(15, ModalStyle.WARN, "", 0.0, false)
	_notice.visible = false
	column.add_child(_notice)
	_filters = HBoxContainer.new()
	_filters.add_theme_constant_override("separation", 8)
	column.add_child(_filters)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 8)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_build_undo()
	if sync:
		sync.status_changed.connect(_on_sync_status)
		sync.decks_changed.connect(refresh)
		_on_sync_status(sync.kind, sync.text)
		sync.run()
	refresh()


func _header() -> HBoxContainer:
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 14)
	var title := ModalStyle.label(40, ModalStyle.GOLD, "Meus decks")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	_sync_label = ModalStyle.label(16, ModalStyle.MUTED, "")
	_sync_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_sync_label.mouse_filter = Control.MOUSE_FILTER_PASS
	header.add_child(_sync_label)
	var import := ModalStyle.button("Importar lista", ModalStyle.Kind.PRIMARY, 180, 46)
	import.name = "Import"
	import.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	import.pressed.connect(open_import)
	header.add_child(import)
	var back := ModalStyle.button("Voltar", ModalStyle.Kind.GHOST, 120, 46)
	back.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(func() -> void: closed.emit())
	header.add_child(back)
	return header


## Relê os decks guardados e redesenha a lista.
func refresh() -> void:
	decks = DeckLibrary.load_all()
	var error: String = DeckLibrary.error()
	var notice: String = sync.notice if sync else ""
	_notice.text = error if error != "" else notice
	_notice.visible = _notice.text != ""
	var names: PackedStringArray = []
	for deck: Dictionary in decks:
		for e: Dictionary in DeckList.entries(deck):
			names.append(Txt.of(e.get("name")))
		checker.check(deck)
	catalog.request(names)
	_build_filters()
	_build_list()


func _build_filters() -> void:
	for child: Node in _filters.get_children():
		_filters.remove_child(child)
		child.queue_free()
	var counts: Dictionary = {}
	for deck: Dictionary in decks:
		counts[deck.get("format")] = int(counts.get(deck.get("format"), 0)) + 1
	if filter != "" and not counts.has(filter):
		filter = ""
	var options: Array = [["", "Todos · %d" % decks.size()]]
	for format: String in DeckList.FORMATS:
		if counts.has(format):
			options.append([format, "%s · %d" % [DeckList.format_label(format), int(counts[format])]])
	if options.size() <= 2:
		return
	for option: Array in options:
		var chip := ModalStyle.button(Txt.of(option[1]), ModalStyle.Kind.PRIMARY if option[0] == filter else ModalStyle.Kind.GHOST, 0.0, 38.0)
		chip.pressed.connect(func() -> void:
			filter = Txt.of(option[0])
			_build_filters()
			_build_list())
		_filters.add_child(chip)


## A lista por formato: um título por formato e as linhas dos decks dele, na ordem guardada.
func _build_list() -> void:
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	_rows.clear()
	if decks.is_empty():
		_list.add_child(_empty_state())
		return
	for format: String in DeckList.FORMATS:
		if filter != "" and format != filter:
			continue
		var group: Array = decks.filter(func(d: Dictionary) -> bool: return d.get("format") == format)
		if group.is_empty():
			continue
		var heading := ModalStyle.label(20, ModalStyle.GOLD_LIGHT, DeckList.format_label(format))
		_list.add_child(heading)
		for deck: Dictionary in group:
			var row := DeckRow.new(deck)
			row.action.connect(_on_action)
			_list.add_child(row)
			_rows.append(row)
	_paint_rows()


func _empty_state() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.add_child(ModalStyle.wrap(20, ModalStyle.INK, "Você ainda não tem decks seus.", 0.0))
	box.add_child(ModalStyle.wrap(16, ModalStyle.MUTED, "Importe a lista de um deck do Arena, do MTGO, do Moxfield ou do Archidekt. Com a conta, os decks da mesa do navegador aparecem aqui sozinhos.", 0.0))
	return box


## Cores e marca de válido de cada linha, com o que já chegou do catálogo e do servidor.
func _paint_rows() -> void:
	for row: DeckRow in _rows:
		if not is_instance_valid(row):
			continue
		row.set_colors(deck_colors(row.deck, catalog))
		var result: Dictionary = checker.result(row.deck)
		var problems: PackedStringArray = []
		var described: Dictionary = DeckCheck.describe(result.get("issues", []), catalog.label)
		for name: String in described["unknown"]:
			problems.append("Carta não reconhecida: %s." % name)
		problems.append_array(described["problems"])
		row.set_check(result, problems)


## As cores do deck (deckColors): as das cartas dos comandantes e do deck principal, na ordem WUBRG.
static func deck_colors(deck: Dictionary, cards: CardCatalog) -> PackedStringArray:
	var seen: Dictionary = {}
	for section: String in ["commanders", "cards"]:
		for e: Variant in (deck.get(section, []) if deck.get(section) is Array else []):
			for color: Variant in cards.info(Txt.of((e as Dictionary).get("name"))).get("colors", []):
				seen[Txt.of(color)] = true
	var out: PackedStringArray = []
	for color: String in ["W", "U", "B", "R", "G"]:
		if seen.has(color):
			out.append(color)
	return out


func _on_action(kind: String, deck: Dictionary) -> void:
	match kind:
		"play":
			chosen.emit(deck)
		"rename":
			_ask_rename(deck)
		"duplicate":
			var index: int = _index_of(deck)
			decks.insert(index + 1, DeckLibrary.duplicate_deck(deck))
			_save()
		"delete":
			_ask_delete(deck)


func _index_of(deck: Dictionary) -> int:
	for i: int in decks.size():
		if (decks[i] as Dictionary).get("id") == deck.get("id"):
			return i
	return -1


## Grava e redesenha; a sincronia envia daqui a pouco.
func _save() -> void:
	if not DeckLibrary.save_all(decks):
		_notice.text = "Não foi possível salvar os decks neste computador."
		_notice.visible = true
		return
	if sync:
		sync.schedule()
	refresh()


## Acrescenta um deck novo no começo (o importado) e grava.
func add_deck(deck: Dictionary) -> void:
	decks = DeckLibrary.load_all()
	decks.push_front(DeckLibrary.normalize(deck))
	filter = ""
	_save()


func open_import() -> DeckImportDialog:
	var dialog := DeckImportDialog.new()
	dialog.catalog = catalog
	dialog.checker = checker
	dialog.initial_format = filter if filter != "" else "standard"
	dialog.saved.connect(add_deck)
	add_child(dialog)
	return dialog


func _ask_rename(deck: Dictionary) -> void:
	var modal := MenuModal.new("Renomear deck", 460.0)
	var field := LineEdit.new()
	field.text = Txt.of(deck.get("name"))
	field.max_length = 80
	field.custom_minimum_size = Vector2(0, 44)
	field.select_all_on_focus = true
	modal.body.add_child(field)
	var cancel := ModalStyle.button("Cancelar", ModalStyle.Kind.GHOST, 130, 46)
	cancel.pressed.connect(modal.close)
	var confirm := ModalStyle.button("Salvar", ModalStyle.Kind.PRIMARY, 150, 46)
	var apply := func() -> void:
		var name: String = field.text.strip_edges()
		var index: int = _index_of(deck)
		if name != "" and index >= 0 and name != Txt.of(deck.get("name")):
			(decks[index] as Dictionary)["name"] = name
			(decks[index] as Dictionary)["updatedAt"] = DeckLibrary.now_iso()
			_save()
		modal.close()
	confirm.pressed.connect(apply)
	field.text_submitted.connect(func(_t: String) -> void: apply.call())
	modal.buttons([cancel, confirm])
	add_child(modal)
	field.grab_focus.call_deferred()


## A confirmação do Excluir: "Voltar" é o destaque; na dúvida, nada acontece.
func _ask_delete(deck: Dictionary) -> MenuModal:
	var modal := MenuModal.new("Excluir “%s”?" % Txt.of(deck.get("name")), 480.0)
	var signed: bool = sync != null and bool(sync.signed_in.call())
	modal.body.add_child(ModalStyle.wrap(17, ModalStyle.INK, "O deck sai deste computador%s. Logo depois dá para desfazer." % (" e da sua conta" if signed else ""), 480.0))
	var back := ModalStyle.button("Voltar", ModalStyle.Kind.PRIMARY, 150, 46)
	back.name = "Back"
	back.pressed.connect(modal.close)
	var remove := ModalStyle.button("Excluir deck", ModalStyle.Kind.DANGER, 170, 46)
	remove.name = "Remove"
	remove.pressed.connect(func() -> void:
		var index: int = _index_of(deck)
		if index >= 0:
			_removed = {"deck": decks[index], "index": index}
			decks.remove_at(index)
			_save()
			_show_undo(Txt.of(deck.get("name")))
		modal.close())
	modal.buttons([remove, back])
	add_child(modal)
	back.focus_mode = Control.FOCUS_ALL
	back.grab_focus.call_deferred()
	return modal


func _build_undo() -> void:
	_undo = PanelContainer.new()
	_undo.add_theme_stylebox_override("panel", ModalStyle.panel_style(14))
	_undo.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_undo.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_undo.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_undo.offset_bottom = -32
	_undo.visible = false
	add_child(_undo)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	_undo.add_child(row)
	_undo_text = ModalStyle.label(17, ModalStyle.INK, "")
	_undo_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_undo_text)
	var button := ModalStyle.button("Desfazer", ModalStyle.Kind.SECONDARY, 130, 42)
	button.name = "Undo"
	button.pressed.connect(undo_delete)
	row.add_child(button)
	_undo_timer = Timer.new()
	_undo_timer.one_shot = true
	_undo_timer.wait_time = UNDO_S
	var me: WeakRef = weakref(self)
	_undo_timer.timeout.connect(func() -> void:
		var screen: DeckScreen = me.get_ref()
		if screen:
			screen._undo.visible = false
			screen._removed = {})
	add_child(_undo_timer)


func _show_undo(name: String) -> void:
	_undo_text.text = "“%s” foi excluído." % name
	_undo.visible = true
	_undo_timer.start()


## Devolve o último deck excluído ao lugar onde estava.
func undo_delete() -> void:
	if _removed.is_empty():
		return
	decks = DeckLibrary.load_all()
	decks.insert(mini(int(_removed["index"]), decks.size()), _removed["deck"])
	_removed = {}
	_undo.visible = false
	_save()


func _on_sync_status(kind: String, text: String) -> void:
	_sync_label.visible = kind != "off"
	_sync_label.text = text
	var colors: Dictionary = {"ok": ModalStyle.GOOD, "offline": ModalStyle.WARN, "error": ModalStyle.BAD}
	_sync_label.add_theme_color_override("font_color", colors.get(kind, ModalStyle.MUTED))
	_sync_label.tooltip_text = "Seus decks ficam neste computador e na sua conta." if kind == "ok" else \
		("As mudanças esperam a conexão voltar; nenhum deck se perde." if kind == "offline" else "")
	if sync and sync.notice != "":
		_notice.text = sync.notice
		_notice.visible = true
		sync.notice = ""
	# Voltou a falar com o servidor: confere de novo o que ficou sem conferir.
	if kind == "ok":
		for deck: Dictionary in decks:
			if Txt.of(checker.result(deck).get("status")) == "offline":
				checker.check(deck, true)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		closed.emit()
		get_viewport().set_input_as_handled()
