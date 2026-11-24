# Janela das perguntas do servidor (FQuestion) no estilo das escolhas da mesa do navegador: a mesa desfocada atrás, o painel
# com o título dourado, as telas pela finalidade (question_screens.gd e question_purposes.gd), as animações e o teclado.
class_name QuestionDialog
extends Control

## Resposta pronta para mandar: {type:"answer", id, ...}.
signal answered(message: Dictionary)

const MAX_CARD_WIDTH := 250.0
const MIN_CARD_WIDTH := 128.0
const CARD_GAP := 22.0
## Respondida e o servidor mandou a mesma pergunta de novo: espera isto antes de reabrir (pode ser um estado de antes da resposta).
const RESTORE_AFTER := 1.5

var catalog: CardCatalog
## Inspetor da mesa (opcional): o mouse por cima de uma carta mostra a prévia grande; o clique direito abre a carta de perto.
var inspector: CardInspector
## Contexto do inspetor (nomes em português, jogadores), o mesmo da mesa; sem ele, {}.
var inspect_context: Callable
## A pergunta aberta ({} sem pergunta).
var question: Dictionary = {}
## Onde as telas põem as peças (split_with_source() troca pelo lado direito da carta).
var column: VBoxContainer
## O botão que o Enter aperta (se estiver ligado).
var primary: Button
## O que as teclas 1 a 9 fazem, na ordem.
var hotkeys: Array[Callable] = []

var _backdrop: ModalBackdrop
var _slide: Control
var _panel: PanelContainer
var _frame: VBoxContainer
var _body: VBoxContainer
var _title: VBoxContainer
var _footer: HBoxContainer
var _status: Label
var _pill: Button
var _pill_tween: Tween
var _tween: Tween
## url da imagem → [ChoiceCard, nome] que esperam por ela
var _waiting: Dictionary = {}
var _answered: bool = false
var _closing: bool = false
var _minimized: bool = false
var _restore_pending: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_backdrop = ModalBackdrop.new()
	add_child(_backdrop)
	_slide = Control.new()
	_slide.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_slide.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_slide)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_slide.add_child(center)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_panel.resized.connect(func() -> void: _panel.pivot_offset = _panel.size / 2.0)
	center.add_child(_panel)
	_frame = VBoxContainer.new()
	_frame.add_theme_constant_override("separation", 18)
	_panel.add_child(_frame)
	_build_header()
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 16)
	_body.custom_minimum_size = Vector2(760, 0)
	_frame.add_child(_body)
	column = _body
	_footer = HBoxContainer.new()
	_footer.alignment = BoxContainer.ALIGNMENT_CENTER
	_footer.add_theme_constant_override("separation", 6)
	_footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_footer)
	_pill = ModalStyle.button("Voltar à escolha  ·  Esc", ModalStyle.Kind.PRIMARY, 300, 48)
	_pill.name = "Restore"
	_pill.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	# Acima da mão, para não cobrir as cartas dela.
	_pill.offset_top = -350
	_pill.offset_bottom = -302
	_pill.offset_left = -160
	_pill.offset_right = 160
	_pill.visible = false
	_pill.pressed.connect(func() -> void: set_minimized(false))
	add_child(_pill)
	if catalog:
		catalog.texture_ready.connect(_on_texture)


func _build_header() -> void:
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	_frame.add_child(head)
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(124, 0)
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(spacer)
	_title = VBoxContainer.new()
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(_title)
	var peek := ModalStyle.button("Ver a mesa", ModalStyle.Kind.GHOST, 124, 36)
	peek.name = "Peek"
	peek.tooltip_text = "Esconde a escolha sem respondê-la (Esc)"
	peek.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	peek.pressed.connect(func() -> void: set_minimized(true))
	head.add_child(peek)


## Mostra a pergunta (ou fecha, com {}); a mesma pergunta de novo não refaz a tela.
func show_question(next: Dictionary) -> void:
	if next.is_empty():
		question = {}
		_answered = false
		_hide_pill()
		if visible and not _closing:
			_close()
		return
	if not question.is_empty() and int(next.get("id", -1)) == int(question.get("id", -2)):
		if _answered:
			_schedule_restore()
		return
	var was_open: bool = visible and not _closing and not _answered
	question = next
	_answered = false
	rebuild()
	if was_open and _minimized:
		return
	if was_open:
		# Uma pergunta emendada na outra: só o conteúdo troca, num esmaecer curto.
		_frame.modulate.a = 0.0
		create_tween().tween_property(_frame, "modulate:a", 1.0, 0.14)
	else:
		_open()


## Monta a tela da pergunta aberta (as telas especiais chamam de novo quando mudam).
func rebuild() -> void:
	for child: Node in _body.get_children():
		child.queue_free()
	for child: Node in _title.get_children():
		child.queue_free()
	column = _body
	primary = null
	hotkeys.clear()
	_status = null
	_waiting.clear()
	if question.is_empty():
		return
	_body.custom_minimum_size = Vector2(760, 0)
	_title.add_child(ModalStyle.title(ForgeRequest.pt_title(_title_text())))
	if not QuestionScreens.build(self):
		match Txt.of(question.get("kind")):
			"order":
				QuestionScreens.order(self)
			"confirm":
				_confirm()
			"number":
				QuestionScreens.number(self)
			"amount":
				QuestionScreens.amounts(self, false)
			"text":
				_text()
			"reveal":
				_reveal()
			_:
				if not QuestionPurposes.colors(self):
					_choose()
	_build_footer()


func _title_text() -> String:
	match Txt.of(question.get("purpose")):
		"triggers":
			return "Ordene seus gatilhos"
		"modes":
			return "Escolha %s" % ("o modo" if int(question.get("max", 1)) <= 1 else "os modos") if Txt.of(question.get("title")) == "" else Txt.of(question["title"])
	return Txt.of(question.get("title")) if Txt.of(question.get("title")) != "" else "Escolha"


## As teclas que valem nesta tela, embaixo de tudo.
func _build_footer() -> void:
	for child: Node in _footer.get_children():
		child.queue_free()
	var hints: Array = []
	if primary:
		hints.append(["Enter", "confirma"])
	if not hotkeys.is_empty():
		hints.append(["1" if hotkeys.size() == 1 else "1–%d" % mini(hotkeys.size(), 9), "escolhe"])
	hints.append(["Esc", "vê a mesa"])
	if inspector:
		hints.append(["Clique direito", "lê a carta"])
	for i: int in hints.size():
		if i > 0:
			_footer.add_child(ModalStyle.label(13, ModalStyle.FAINT, "   "))
		_footer.add_child(ModalStyle.keycap(Txt.of(hints[i][0])))
		_footer.add_child(ModalStyle.label(13, ModalStyle.FAINT, Txt.of(hints[i][1])))


func options() -> Array:
	return question.get("options", []) if question.get("options") is Array else []


## A carta de uma opção, ou null.
func option_card(index: int) -> Variant:
	var raw: Variant = options()[index]
	return (raw as Dictionary).get("card") if raw is Dictionary and (raw as Dictionary).get("card") is Dictionary else null


## O texto de uma opção, com o nome da carta em português e sem os números de carta do Forge.
func option_label(index: int) -> String:
	var raw: Variant = options()[index]
	if raw is String:
		return ActionBox.without_card_ids(raw)
	var option: Dictionary = raw
	var text: String = Txt.of(option.get("label"))
	var card: Variant = option.get("card")
	if card is Dictionary and (card as Dictionary).has("name"):
		var name: String = Txt.of((card as Dictionary)["name"])
		text = text.replace(name, catalog.label(name)) if text != "" else catalog.label(name)
	if Txt.of(option.get("ability")) != "":
		text = Txt.of(option["ability"])
	return ActionBox.without_card_ids(text)


# — Telas genéricas —

## choose: cartas lado a lado quando todas as opções são cartas; senão, uma lista. Um toque responde quando é uma só.
func _choose() -> void:
	var all_cards: bool = not options().is_empty() and range(options().size()).all(func(i: int) -> bool: return option_card(i) != null)
	var revealed: Array = question.get("revealed", []) if question.get("revealed") is Array else []
	if not revealed.is_empty():
		hint("%s As cartas apagadas não podem ser escolhidas." % Txt.of(question.get("revealedNote")))
	if all_cards or not revealed.is_empty():
		QuestionScreens.pick_cards(self, range(options().size()), revealed, func(picked: Array) -> void: send({"indices": picked}))
	else:
		QuestionScreens.pick_list(self, func(picked: Array) -> void: send({"indices": picked}))


func _confirm() -> void:
	split_with_source()
	button_row([["Não", {"value": false}, false], ["Sim", {"value": true}, true]])


func _reveal() -> void:
	var cards: Array = question.get("revealed", []) if question.get("revealed") is Array else []
	var row := card_row()
	var width: float = card_width(cards.size())
	for raw: Variant in cards:
		var tile := card(raw, width)
		tile.interactive = false
		tile.mouse_default_cursor_shape = Control.CURSOR_ARROW
		row.add_child(tile)
	button_row([["Continuar", {"indices": []}, true]])


func _text() -> void:
	split_with_source()
	var field := LineEdit.new()
	field.text = Txt.of(question.get("initial"))
	field.custom_minimum_size = Vector2(440, 50)
	field.add_theme_font_size_override("font_size", 20)
	field.add_theme_stylebox_override("normal", _field_style(false))
	field.add_theme_stylebox_override("focus", _field_style(true))
	field.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(field)
	var ok := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 220)
	ok.pressed.connect(func() -> void: send({"text": field.text}))
	field.text_submitted.connect(func(_t: String) -> void: send({"text": field.text}))
	actions([ok])
	primary = ok
	field.grab_focus.call_deferred()


static func _field_style(focused: bool) -> StyleBoxFlat:
	var style := ModalStyle.box(Color(0.04, 0.06, 0.11, 0.95), 12, ModalStyle.GOLD if focused else Color(1, 1, 1, 0.18), 2 if focused else 1)
	style.content_margin_left = 16
	style.content_margin_right = 16
	return style


# — Peças —

## Largura das cartas para `count` lado a lado caberem na tela (e `rows` fileiras na altura), entre o mínimo e o máximo.
func card_width(count: int, max_width: float = MAX_CARD_WIDTH, rows: int = 1) -> float:
	var screen: Vector2 = get_viewport_rect().size if is_inside_tree() else Vector2(1600, 900)
	var n: int = maxi(count, 1)
	var by_width: float = (screen.x * 0.84 - 80.0 - CARD_GAP * (n - 1)) / n
	var by_height: float = (screen.y * 0.5 / rows - ChoiceCard.LIFT_ROOM) / ChoiceCard.ASPECT
	return floorf(clampf(minf(by_width, by_height), MIN_CARD_WIDTH, max_width))


## Uma fileira centrada para cartas.
func card_row(parent: Control = null) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", int(CARD_GAP))
	(parent if parent else column).add_child(row)
	return row


## Uma carta da escolha (a imagem chega depois, se ainda não está no cache), com a prévia e o inspetor da mesa.
func card(data: Variant, width: float, text: String = "", caption: String = "") -> ChoiceCard:
	var tile := ChoiceCard.new().setup(data, width, text, caption)
	if data is Dictionary:
		var info: Dictionary = data
		var face_down: bool = bool(info.get("faceDown", false)) or not info.has("name")
		var url: String = "" if face_down or catalog == null else catalog.image_url_for(info)
		var tex: Texture2D = catalog.texture(url) if catalog and url != "" else null
		var name: String = "Virada para baixo" if face_down else (catalog.label(Txt.of(info.get("name"))) if catalog else Txt.of(info.get("name")))
		tile.set_texture(tex, name)
		if tex == null and url != "":
			if not _waiting.has(url):
				_waiting[url] = []
			(_waiting[url] as Array).append([tile, name])
		if not face_down:
			tile.hovered.connect(func(on: bool) -> void:
				if inspector == null:
					return
				if on:
					inspector.show_preview(info, _context(), url)
				else:
					inspector.hide_preview())
			tile.inspect.connect(func() -> void:
				if inspector:
					inspector.open(info, _context(), url))
	return tile


func _context() -> Dictionary:
	return inspect_context.call() if inspect_context.is_valid() else {}


## Põe a carta da pergunta (quando há) à esquerda e passa a montar o resto à direita dela.
func split_with_source(width: float = 220.0, data: Variant = null) -> void:
	if data == null:
		data = question.get("card")
	if not (data is Dictionary) or not (data as Dictionary).has("name"):
		return
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 30)
	column.add_child(row)
	var tile := card(data, width)
	tile.interactive = false
	tile.mouse_default_cursor_shape = Control.CURSOR_ARROW
	tile.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(tile)
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 14)
	right.alignment = BoxContainer.ALIGNMENT_CENTER
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.custom_minimum_size = Vector2(460, 0)
	row.add_child(right)
	column = right
	_body.custom_minimum_size = Vector2(760, 0)


## A carta que pergunta, grande, quando há uma (no meio, sem dividir a tela).
func source_card() -> void:
	var data: Variant = question.get("card")
	if data is Dictionary and (data as Dictionary).has("name"):
		var row := card_row()
		var tile := card(data, 200.0)
		tile.interactive = false
		tile.mouse_default_cursor_shape = Control.CURSOR_ARROW
		row.add_child(tile)


## Uma fileira de botões centrada.
func actions(buttons: Array, parent: Control = null) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	for button: Variant in buttons:
		row.add_child(button)
	(parent if parent else column).add_child(row)
	return row


## Uma fileira de botões que respondem: [[rótulo, resposta, principal]]; o principal é o do Enter.
func button_row(list: Array, parent: Control = null) -> HBoxContainer:
	var buttons: Array = []
	for entry: Array in list:
		var main: bool = bool(entry[2])
		var button := ModalStyle.button(Txt.of(entry[0]), ModalStyle.Kind.PRIMARY if main else ModalStyle.Kind.SECONDARY, 190)
		var payload: Dictionary = entry[1]
		button.pressed.connect(func() -> void: send(payload))
		if main:
			primary = button
		buttons.append(button)
	return actions(buttons, parent)


## Uma linha de explicação, centrada (com os símbolos de mana).
func hint(text: String) -> RichTextLabel:
	var label := ModalStyle.rich(text, 17, ModalStyle.MUTED, true)
	if column == _body:
		label.custom_minimum_size = Vector2(minf(_body.custom_minimum_size.x, 760.0), 0)
	column.add_child(label)
	return label


## A linha de situação (quantas escolhidas, o que falta); set_status() troca o texto.
func add_status() -> Label:
	_status = ModalStyle.wrap(16, ModalStyle.MUTED, "", 0.0)
	_status.name = "Status"
	column.add_child(_status)
	return _status


## O texto da situação: `ok` em verde (dá para confirmar), senão no tom de aviso (o porquê de não dar).
func set_status(text: String, ok: bool) -> void:
	if _status == null:
		return
	var changed: bool = _status.text != text
	_status.text = text
	_status.add_theme_color_override("font_color", ModalStyle.GOOD if ok else ModalStyle.WARN)
	if changed and _status.is_inside_tree():
		_status.modulate.a = 0.4
		_status.create_tween().tween_property(_status, "modulate:a", 1.0, 0.14)


## "2 de 3 escolhidas" e o que falta para confirmar, para escolhas de min a max.
static func count_text(count: int, min_pick: int, max_pick: int) -> Array:
	if count == 0 and min_pick == 0:
		return ["Nenhuma escolhida.", true]
	if count < min_pick:
		return ["Escolha mais %d para confirmar." % (min_pick - count) if count > 0 else "Escolha %d para confirmar." % min_pick, false]
	if max_pick > 1:
		return ["%d de %d escolhidas." % [count, max_pick], true]
	return ["Pronto para confirmar.", true]


## Marca ou desmarca a carta (compatível com as telas antigas).
static func set_marked(tile: Control, on: bool) -> void:
	if tile is ChoiceCard:
		(tile as ChoiceCard).set_selected(on)


func _on_texture(url: String, tex: Texture2D) -> void:
	for pair: Variant in _waiting.get(url, []):
		var tile: Variant = (pair as Array)[0]
		if is_instance_valid(tile):
			(tile as ChoiceCard).set_texture(tex, Txt.of((pair as Array)[1]))
	_waiting.erase(url)


static func clicked(event: InputEvent) -> bool:
	return event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT


# — Entrada, saída e "Ver a mesa" —

func _open() -> void:
	UiSounds.play("open")
	visible = true
	_closing = false
	_minimized = false
	_hide_pill()
	_slide.visible = true
	_backdrop.visible = true
	_backdrop.fade(1.0, 0.24)
	_panel.modulate.a = 0.0
	_panel.scale = Vector2(0.96, 0.96)
	_slide.position.y = 16.0
	_animate(1.0, Vector2.ONE, 0.0, ModalStyle.ENTER_TIME)


func _close() -> void:
	_closing = true
	_hide_pill()
	_backdrop.fade(0.0, ModalStyle.EXIT_TIME + 0.04)
	_animate(0.0, Vector2(0.97, 0.97), 12.0, ModalStyle.EXIT_TIME).tween_callback(_after_close).set_delay(0.04)


func _after_close() -> void:
	if _closing:
		visible = false
		_closing = false


func _animate(alpha: float, scale_to: Vector2, slide: float, time: float) -> Tween:
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.tween_property(_panel, "modulate:a", alpha, time)
	_tween.tween_property(_panel, "scale", scale_to, time)
	_tween.tween_property(_slide, "position:y", slide, time)
	_tween.chain()
	return _tween


## "Ver a mesa": esconde a escolha sem respondê-la e deixa a pílula para voltar (Esc também alterna).
func set_minimized(on: bool) -> void:
	if question.is_empty() or on == _minimized:
		return
	_minimized = on
	if inspector:
		inspector.hide_preview(true)
	if on:
		_backdrop.fade(0.0, ModalStyle.EXIT_TIME)
		_animate(0.0, Vector2(0.97, 0.97), 24.0, ModalStyle.EXIT_TIME).tween_callback(func() -> void:
			if _minimized:
				_slide.visible = false
				_backdrop.visible = false)
		_pill.visible = true
		_pill.modulate.a = 1.0
		ModalStyle.pop(_pill, 0.7)
		if _pill_tween and _pill_tween.is_valid():
			_pill_tween.kill()
		_pill_tween = _pill.create_tween().set_loops()
		_pill_tween.tween_property(_pill, "modulate:a", 0.78, 0.9).set_trans(Tween.TRANS_SINE)
		_pill_tween.tween_property(_pill, "modulate:a", 1.0, 0.9).set_trans(Tween.TRANS_SINE)
	else:
		_open()


func is_minimized() -> bool:
	return _minimized


func _hide_pill() -> void:
	if _pill_tween and _pill_tween.is_valid():
		_pill_tween.kill()
	if _pill:
		_pill.visible = false


func _schedule_restore() -> void:
	if _restore_pending:
		return
	_restore_pending = true
	var me: WeakRef = weakref(self)
	var id: int = int(question.get("id", -1))
	get_tree().create_timer(RESTORE_AFTER).timeout.connect(func() -> void:
		var dialog: QuestionDialog = me.get_ref() as QuestionDialog
		if dialog == null:
			return
		dialog._restore_pending = false
		if dialog._answered and int(dialog.question.get("id", -2)) == id:
			dialog._answered = false
			dialog.rebuild()
			dialog._open())


# — Teclado —

## Enter confirma (quando dá), Esc alterna "Ver a mesa", 1 a 9 escolhem; o espaço não passa a prioridade com a escolha aberta.
func _unhandled_key_input(event: InputEvent) -> void:
	if not visible or question.is_empty() or _answered or _closing:
		return
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	if inspector and inspector.is_open():
		return
	var code: Key = key.keycode
	if code == KEY_ESCAPE:
		set_minimized(not _minimized)
		get_viewport().set_input_as_handled()
		return
	if _minimized:
		return
	if code == KEY_ENTER or code == KEY_KP_ENTER:
		if primary and is_instance_valid(primary) and not primary.disabled and primary.is_visible_in_tree():
			primary.pressed.emit()
		get_viewport().set_input_as_handled()
	elif code == KEY_SPACE:
		get_viewport().set_input_as_handled()
	else:
		var n: int = -1
		if code >= KEY_1 and code <= KEY_9:
			n = code - KEY_1
		elif code >= KEY_KP_1 and code <= KEY_KP_9:
			n = code - KEY_KP_1
		if n >= 0 and n < hotkeys.size():
			hotkeys[n].call()
			get_viewport().set_input_as_handled()


func send(payload: Dictionary) -> void:
	if _answered or question.is_empty():
		return
	_answered = true
	var message: Dictionary = {"type": "answer", "id": int(question["id"])}
	message.merge(payload)
	if inspector:
		inspector.hide_preview(true)
	UiSounds.play("confirm")
	_close()
	answered.emit(message)
