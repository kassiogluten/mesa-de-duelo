# Importar deck por texto: colar a lista (Arena, MTGO, Moxfield ou só "4 Lightning Bolt"), escolher o formato, conferir
# no servidor e salvar em Meus decks, com as cartas desconhecidas e os problemas do formato em português.
class_name DeckImportDialog
extends MenuModal

## O deck novo, pronto para entrar em Meus decks.
signal saved(deck: Dictionary)

const PLACEHOLDER := "Deck\n4 Lightning Bolt (M10) 146\n20 Mountain\n\nSideboard\n2 Duress"

var catalog: CardCatalog
var checker: DeckCheck
## O formato já escolhido ao abrir (o do filtro de Meus decks, por exemplo).
var initial_format: String = "standard"

var _name: LineEdit
var _format: OptionButton
var _text: TextEdit
var _error: Label
var _form: VBoxContainer
var _review: VBoxContainer
var _review_body: VBoxContainer
var _deck: Dictionary = {}
var _parsed: Dictionary = {}


func _init() -> void:
	super._init("Importar deck", 640.0)
	_form = VBoxContainer.new()
	_form.add_theme_constant_override("separation", 10)
	body.add_child(_form)
	var fields := HBoxContainer.new()
	fields.add_theme_constant_override("separation", 12)
	_form.add_child(fields)
	_name = LineEdit.new()
	_name.placeholder_text = "Nome do deck"
	_name.max_length = 80
	_name.custom_minimum_size = Vector2(0, 42)
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fields.add_child(_name)
	_format = OptionButton.new()
	_format.custom_minimum_size = Vector2(200, 42)
	for format: String in DeckList.FORMATS:
		_format.add_item(DeckList.format_label(format))
	fields.add_child(_format)
	_text = TextEdit.new()
	_text.placeholder_text = PLACEHOLDER
	_text.custom_minimum_size = Vector2(0, 320)
	_text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_text.add_theme_font_size_override("font_size", 16)
	_form.add_child(_text)
	_form.add_child(ModalStyle.wrap(14, ModalStyle.MUTED, "Cole a lista exportada do Arena, do MTGO, do Moxfield ou do Archidekt. Uma carta por linha, com a quantidade na frente e o nome em inglês. A seção Commander guarda os comandantes; Maybeboard e fichas ficam de fora.", 640.0, false))
	_error = ModalStyle.wrap(15, ModalStyle.BAD, "", 640.0, false)
	_error.visible = false
	_form.add_child(_error)
	var cancel := ModalStyle.button("Cancelar", ModalStyle.Kind.GHOST, 140, 46)
	cancel.pressed.connect(close)
	var go := ModalStyle.button("Conferir lista", ModalStyle.Kind.PRIMARY, 200, 46)
	go.pressed.connect(_on_review)
	var row: HBoxContainer = buttons([cancel, go])
	body.remove_child(row)
	_form.add_child(row)

	_review = VBoxContainer.new()
	_review.add_theme_constant_override("separation", 12)
	_review.visible = false
	body.add_child(_review)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 420)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_review.add_child(scroll)
	_review_body = VBoxContainer.new()
	_review_body.add_theme_constant_override("separation", 10)
	_review_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_review_body)
	var back := ModalStyle.button("Voltar à lista", ModalStyle.Kind.GHOST, 160, 46)
	back.pressed.connect(func() -> void:
		_review.visible = false
		_form.visible = true)
	var save := ModalStyle.button("Salvar deck", ModalStyle.Kind.PRIMARY, 200, 46)
	save.pressed.connect(_on_save)
	var review_row: HBoxContainer = buttons([back, save])
	body.remove_child(review_row)
	_review.add_child(review_row)


func _ready() -> void:
	super._ready()
	var index: int = DeckList.FORMATS.find(initial_format)
	_format.select(maxi(0, index))
	if checker:
		checker.checked.connect(func(_key: String, _result: Dictionary) -> void: _render_review())
	if catalog:
		catalog.info_ready.connect(func(_names: PackedStringArray) -> void: _render_review())
	_text.grab_focus.call_deferred()


## Põe um texto na caixa (para os prints e os testes).
func set_list(text: String, deck_name: String = "", format: String = "") -> void:
	_text.text = text
	_name.text = deck_name
	if format != "":
		_format.select(maxi(0, DeckList.FORMATS.find(format)))


## Lê a lista e passa à revisão; sem nenhuma carta no deck principal, avisa e fica na lista.
func _on_review() -> void:
	_parsed = DeckList.parse(_text.text)
	if (_parsed["main"] as Array).is_empty() and (_parsed["commanders"] as Array).is_empty():
		_error.text = "Nenhuma carta reconhecida no deck principal. Confira a lista."
		_error.visible = true
		return
	_error.visible = false
	var format: String = DeckList.FORMATS[_format.selected]
	_deck = {
		"id": DeckLibrary.new_id(), "name": _name.text.strip_edges() if _name.text.strip_edges() != "" else "Deck importado",
		"format": format, "cards": _parsed["main"], "sideboard": _parsed["sideboard"], "commanders": _parsed["commanders"],
		"importSource": _text.text, "updatedAt": DeckLibrary.now_iso(),
	}
	if catalog:
		var names: PackedStringArray = []
		for e: Dictionary in DeckList.entries(_deck):
			names.append(Txt.of(e.get("name")))
		catalog.request(names)
	if checker:
		checker.check(_deck)
	_form.visible = false
	_review.visible = true
	_render_review()


func _label(name: String) -> String:
	return catalog.label(name) if catalog else name


## Redesenha a revisão: contagens, comandante, a conferência do servidor e as linhas que ficaram de fora.
func _render_review() -> void:
	if not _review.visible or _deck.is_empty():
		return
	for child: Node in _review_body.get_children():
		_review_body.remove_child(child)
		child.queue_free()
	var format: String = Txt.of(_deck["format"])
	_review_body.add_child(ModalStyle.wrap(22, ModalStyle.INK, "%s · %s" % [Txt.of(_deck["name"]), DeckList.format_label(format)], 600.0, false))
	_review_body.add_child(ModalStyle.wrap(16, ModalStyle.MUTED, DeckImportDialog.counts_text(_deck), 600.0, false))
	if DeckList.has_command_zone(format):
		_review_body.add_child(_commander_row())
	var result: Dictionary = checker.result(_deck) if checker else {}
	var status: String = Txt.of(result.get("status"))
	var text: String = "Conferindo no servidor…"
	var color: Color = ModalStyle.MUTED
	if status == "valid":
		text = "Deck válido no %s." % DeckList.format_label(format)
		color = ModalStyle.GOOD
	elif status == "invalid":
		text = "O deck precisa de ajustes antes de jogar no %s." % DeckList.format_label(format)
		color = ModalStyle.WARN
	elif status == "offline":
		text = "Sem conexão com o servidor: a lista foi lida, mas a legalidade ainda não foi conferida. Dá para salvar e conferir depois."
		color = ModalStyle.WARN
	_review_body.add_child(ModalStyle.wrap(17, color, text, 600.0, false))
	var described: Dictionary = DeckCheck.describe(result.get("issues", []), _label)
	if not (described["unknown"] as PackedStringArray).is_empty():
		_section("Cartas não reconhecidas", "Confira a grafia em inglês. Elas ficam guardadas no deck, mas ele só começa uma partida depois de corrigidas.", described["unknown"], ModalStyle.BAD)
	if not (described["problems"] as PackedStringArray).is_empty():
		_section("Problemas no formato", "", described["problems"], ModalStyle.WARN)
	var left_out: PackedStringArray = []
	for line: Variant in (_parsed.get("skipped", []) as Array) + (_parsed.get("ignored", []) as Array):
		left_out.append(Txt.of(line))
	if not left_out.is_empty():
		_section("Linhas que ficaram de fora", "Não viraram cartas do deck (maybeboard, fichas ou quantidade inválida).", left_out, ModalStyle.MUTED)


## "Deck principal: 60 · Sideboard: 15 · Comandante: 1".
static func counts_text(deck: Dictionary) -> String:
	var parts: PackedStringArray = ["Deck principal: %d" % DeckList.count_entries(deck.get("cards"))]
	if DeckList.count_entries(deck.get("sideboard")) > 0:
		parts.append("Sideboard: %d" % DeckList.count_entries(deck.get("sideboard")))
	var commanders: int = DeckList.count_entries(deck.get("commanders"))
	if commanders > 0:
		parts.append("%s: %d" % ["Comandantes" if commanders > 1 else "Comandante", commanders])
	return " · ".join(parts)


## O comandante: o da lista, ou a escolha entre as cartas avulsas do deck quando a lista não trouxe a seção Commander.
func _commander_row() -> Control:
	var commanders: Array = _deck.get("commanders", [])
	if not commanders.is_empty():
		var names: PackedStringArray = []
		for e: Dictionary in commanders:
			names.append(_label(Txt.of(e.get("name"))))
		return ModalStyle.wrap(17, ModalStyle.GOLD_LIGHT, "Zona de comando: %s" % ", ".join(names), 600.0, false)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.add_child(ModalStyle.label(17, ModalStyle.GOLD_LIGHT, "A lista não tem a seção Commander. Comandante:"))
	var picker := OptionButton.new()
	picker.custom_minimum_size = Vector2(240, 40)
	picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker.add_item("Escolha uma carta")
	var keys: PackedStringArray = [""]
	for e: Dictionary in _deck.get("cards", []):
		if int(e.get("count", 0)) == 1:
			picker.add_item(_label(Txt.of(e.get("name"))))
			keys.append(DeckList.entry_key(e))
	picker.item_selected.connect(func(i: int) -> void:
		if i > 0:
			var next: Dictionary = _deck.duplicate(true)
			DeckList.promote_to_commander(next, keys[i])
			_deck = next
			if checker:
				checker.check(_deck)
			_render_review.call_deferred())
	row.add_child(picker)
	return row


func _section(title: String, hint: String, lines: PackedStringArray, color: Color) -> void:
	_review_body.add_child(ModalStyle.label(17, color, title))
	if hint != "":
		_review_body.add_child(ModalStyle.wrap(14, ModalStyle.MUTED, hint, 600.0, false))
	for line: String in lines:
		_review_body.add_child(ModalStyle.wrap(15, ModalStyle.INK, "•  " + line, 600.0, false))


func _on_save() -> void:
	var deck: Dictionary = _deck.duplicate(true)
	var result: Dictionary = checker.result(_deck) if checker else {}
	var unknown: PackedStringArray = DeckCheck.describe(result.get("issues", []), _label)["unknown"]
	if not unknown.is_empty():
		deck["unresolved"] = Array(unknown)
	saved.emit(deck)
	close()
