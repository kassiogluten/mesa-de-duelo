# Janela "Relatar um problema" (porte de src/ui/feedbackForm.ts): tipo, descrição, partida e print anexados, quem envia, e o envio.
class_name ReportDialog
extends Control

## O relato saiu; o código é o que o jogador vê em Meus relatos.
signal sent(code: String)
signal my_reports_requested

const WIDTH := 560.0

## Quem manda (main.gd põe o da mesa; os testes, um com servidor falso).
var client: ReportClient

var _box: PanelContainer
var _form: VBoxContainer
var _done: VBoxContainer
var _done_title: Label
var _kind_buttons: Dictionary = {}
var _text: TextEdit
var _error: Label
var _count: Label
var _attach: CheckBox
var _attach_detail: Label
var _shot: CheckBox
var _author: Label
var _anon: CheckBox
var _what: Label
var _status: Label
var _submit: Button
var _kind: String = "erro"
var _from: String = "inicio"
var _recorder: MatchRecorder
var _session: Dictionary = {}
var _image: Image
var _sending: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	add_child(ModalBackdrop.new())
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	_box = PanelContainer.new()
	_box.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_box.resized.connect(func() -> void: _box.pivot_offset = _box.size / 2.0)
	center.add_child(_box)
	var holder := VBoxContainer.new()
	holder.add_theme_constant_override("separation", 14)
	holder.custom_minimum_size = Vector2(WIDTH, 0)
	_box.add_child(holder)
	holder.add_child(ModalStyle.title("Relatar um problema", 28))
	_form = VBoxContainer.new()
	_form.add_theme_constant_override("separation", 10)
	holder.add_child(_form)
	_build_form()
	_done = VBoxContainer.new()
	_done.add_theme_constant_override("separation", 14)
	_done.visible = false
	holder.add_child(_done)
	_build_done()


func _build_form() -> void:
	var kinds := HBoxContainer.new()
	kinds.alignment = BoxContainer.ALIGNMENT_CENTER
	kinds.add_theme_constant_override("separation", 10)
	for entry: Array in [["erro", "Algo deu errado"], ["sugestao", "Sugestão"]]:
		var button := ModalStyle.button(Txt.of(entry[1]), ModalStyle.Kind.GHOST, 200, 42)
		var kind: String = entry[0]
		button.pressed.connect(func() -> void: _set_kind(kind))
		_kind_buttons[kind] = button
		kinds.add_child(button)
	_form.add_child(kinds)
	_form.add_child(ModalStyle.label(15, ModalStyle.MUTED, "Descrição"))
	_text = TextEdit.new()
	_text.custom_minimum_size = Vector2(WIDTH, 150)
	_text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_text.add_theme_font_size_override("font_size", 17)
	_text.add_theme_color_override("font_color", ModalStyle.INK)
	_text.add_theme_color_override("font_placeholder_color", ModalStyle.FAINT)
	_text.add_theme_color_override("caret_color", ModalStyle.GOLD_LIGHT)
	var field := ModalStyle.box(Color(0.03, 0.05, 0.09, 0.9), ModalStyle.RADIUS, Color(0.62, 0.76, 1.0, 0.24), 1)
	field.content_margin_left = 12
	field.content_margin_right = 12
	field.content_margin_top = 10
	field.content_margin_bottom = 10
	_text.add_theme_stylebox_override("normal", field)
	var focused: StyleBoxFlat = field.duplicate()
	focused.border_color = Color(ModalStyle.GOLD, 0.7)
	_text.add_theme_stylebox_override("focus", focused)
	_text.text_changed.connect(_on_text_changed)
	_form.add_child(_text)
	var under := HBoxContainer.new()
	_error = ModalStyle.label(15, ModalStyle.BAD)
	_error.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	under.add_child(_error)
	_count = ModalStyle.label(14, ModalStyle.FAINT)
	under.add_child(_count)
	_form.add_child(under)
	_attach = _check("Anexar a partida")
	_form.add_child(_attach)
	_attach_detail = ModalStyle.label(14, ModalStyle.FAINT)
	_form.add_child(_attach_detail)
	_shot = _check("Incluir um print da mesa")
	_form.add_child(_shot)
	_author = ModalStyle.label(15, ModalStyle.MUTED)
	_form.add_child(_author)
	_anon = _check("Enviar sem meu nome")
	_form.add_child(_anon)
	_what = ModalStyle.wrap(14, ModalStyle.MUTED, "", WIDTH, false)
	_form.add_child(_what)
	_status = ModalStyle.label(15, ModalStyle.GOLD_LIGHT)
	_form.add_child(_status)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 10)
	var mine := ModalStyle.button("Meus relatos", ModalStyle.Kind.GHOST, 0, 46)
	mine.pressed.connect(func() -> void:
		if not _sending:
			close()
			my_reports_requested.emit())
	buttons.add_child(mine)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(spacer)
	var cancel := ModalStyle.button("Cancelar", ModalStyle.Kind.SECONDARY, 130, 46)
	cancel.pressed.connect(func() -> void:
		if not _sending:
			close())
	buttons.add_child(cancel)
	_submit = ModalStyle.button("Enviar", ModalStyle.Kind.PRIMARY, 150, 46)
	_submit.pressed.connect(submit)
	buttons.add_child(_submit)
	_form.add_child(buttons)


func _build_done() -> void:
	_done_title = ModalStyle.wrap(22, ModalStyle.INK, "", WIDTH)
	_done.add_child(_done_title)
	_done.add_child(ModalStyle.wrap(17, ModalStyle.MUTED, "A resposta aparece em Meus relatos, na tela inicial.", WIDTH))
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	buttons.add_theme_constant_override("separation", 12)
	var mine := ModalStyle.button("Meus relatos", ModalStyle.Kind.SECONDARY, 180, 46)
	mine.pressed.connect(func() -> void:
		close()
		my_reports_requested.emit())
	buttons.add_child(mine)
	var close_button := ModalStyle.button("Fechar", ModalStyle.Kind.PRIMARY, 150, 46)
	close_button.pressed.connect(close)
	buttons.add_child(close_button)
	_done.add_child(buttons)


func _check(text: String) -> CheckBox:
	var box: CheckBox = ModalStyle.checkbox(text)
	box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	box.toggled.connect(func(_on: bool) -> void: _sync())
	return box


## Abre o formulário. `context`: from ("partida" | "inicio"), recorder (a partida para anexar, ou null), session
## ({code, token} do assento), kind ("erro" por padrão). O print é tirado antes da janela aparecer.
func open(context: Dictionary) -> void:
	_from = "partida" if Txt.of(context.get("from")) == "partida" else "inicio"
	_recorder = context.get("recorder") if context.get("recorder") is MatchRecorder else null
	_session = context.get("session") if context.get("session") is Dictionary else {}
	_kind = "sugestao" if Txt.of(context.get("kind")) == "sugestao" else "erro"
	_image = null
	if context.has("image") or DisplayServer.get_name() == "headless":
		_show(context.get("image") if context.get("image") is Image else null)
		return
	# Espera o próximo quadro desenhado: ele já não tem o menu que abriu a janela (fechado neste clique), e a janela
	# ainda não está à vista.
	var me: WeakRef = weakref(self)
	RenderingServer.frame_post_draw.connect(func() -> void:
		var dialog: ReportDialog = me.get_ref()
		if dialog:
			dialog._show(dialog.get_viewport().get_texture().get_image()),
		CONNECT_ONE_SHOT)


func _show(image: Image) -> void:
	_image = image if image != null and not image.is_empty() else null
	_sending = false
	_form.visible = true
	_done.visible = false
	_text.text = ""
	_error.text = ""
	_status.text = ""
	_submit.disabled = false
	_submit.text = "Enviar"
	var has_match: bool = _recorder != null and not _recorder.is_empty()
	_attach.visible = has_match
	_attach.button_pressed = has_match
	_attach_detail.visible = has_match
	_attach_detail.text = _match_label() if has_match else ""
	_shot.visible = _image != null
	_shot.button_pressed = _image != null
	var signed: bool = AccountSession.signed_in()
	_author.visible = signed
	_anon.visible = signed
	_anon.button_pressed = false
	_set_kind(_kind)
	visible = true
	move_to_front()
	var backdrop: ModalBackdrop = get_node("Backdrop")
	backdrop.amount = 0.0
	backdrop.fade(1.0, 0.24)
	_box.modulate.a = 0.0
	_box.scale = Vector2(0.96, 0.96)
	var tween := _box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_box, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
	tween.tween_property(_box, "scale", Vector2.ONE, ModalStyle.ENTER_TIME)
	_text.grab_focus.call_deferred()


func close() -> void:
	if not visible:
		return
	(get_node("Backdrop") as ModalBackdrop).fade(0.0, ModalStyle.EXIT_TIME)
	var tween := _box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_box, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	tween.tween_property(_box, "scale", Vector2(0.97, 0.97), ModalStyle.EXIT_TIME)
	var me: WeakRef = weakref(self)
	tween.chain().tween_callback(func() -> void:
		var dialog: ReportDialog = me.get_ref()
		if dialog:
			dialog.visible = false)


## O texto da descrição (para os testes e as ferramentas de print).
func set_description(text: String) -> void:
	_text.text = text
	_on_text_changed()


func _set_kind(kind: String) -> void:
	_kind = kind
	for key: String in _kind_buttons:
		ModalStyle.style_button(_kind_buttons[key], ModalStyle.Kind.PRIMARY if key == kind else ModalStyle.Kind.GHOST)
	_text.placeholder_text = "O que você fez e o que aconteceu?" if kind == "erro" else "Qual é a sua ideia?"
	_sync()


func _on_text_changed() -> void:
	if _text.text.length() > ReportPayload.DESCRIPTION_LIMIT:
		_text.text = _text.text.substr(0, ReportPayload.DESCRIPTION_LIMIT)
		_text.set_caret_column(_text.get_line(_text.get_line_count() - 1).length())
		_text.set_caret_line(_text.get_line_count() - 1)
	if _text.text.strip_edges() != "":
		_error.text = ""
	_sync()


func _sync() -> void:
	_count.text = "%s de 2.000" % _thousands(_text.text.length())
	var account: Dictionary = AccountSession.account()
	var nick: String = Txt.of(account.get("apelido", account.get("nome", "")))
	var named: bool = _author.visible and not _anon.button_pressed
	_author.text = "Enviando sem nome" if _anon.button_pressed else ("Enviando como %s" % nick if nick != "" else "Enviando pela sua conta")
	var parts: PackedStringArray = []
	if named:
		parts.append("o apelido da sua conta")
	parts.append("o texto que você escreveu, a versão da mesa e o computador (sistema, placa de vídeo e tamanho da janela)")
	parts.append("as últimas linhas do registro da mesa")
	if _shot.visible and _shot.button_pressed:
		parts.append("um print da mesa como está agora")
	var text: String = "O que vai junto: %s" % ", ".join(parts)
	if _attach.visible and _attach.button_pressed:
		text += ". Com a partida, também o seu deck, os apelidos dos jogadores e as jogadas que você viu, para conseguirmos repetir o que aconteceu na mesa"
	_what.text = text + ". Nada de e-mail nem IP."


func _match_label() -> String:
	var format: String = Txt.of(_recorder.meta.get("format"))
	var name: String = Txt.of(MatchText.FORMATS.get(format, format))
	var started: int = _recorder.started_at / 1000 + int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var clock: Dictionary = Time.get_datetime_dict_from_unix_time(started)
	return "Partida%s, começou às %02d:%02d · %d momentos guardados" % [" de %s" % name if name != "" else "", int(clock["hour"]), int(clock["minute"]), _recorder.frame_count()]


static func _thousands(n: int) -> String:
	return "%d.%03d" % [n / 1000, n % 1000] if n >= 1000 else str(n)


## Envia (o botão Enviar e o Ctrl+Enter).
func submit() -> void:
	if _sending or not visible:
		return
	var description: String = _text.text.strip_edges()
	if description == "":
		_error.text = "Escreva o que aconteceu ou a sua ideia."
		_text.grab_focus()
		return
	_sending = true
	_submit.disabled = true
	_submit.text = "Enviando…"
	_status.text = "Enviando o relato…"
	var attached: bool = _attach.visible and _attach.button_pressed and _recorder != null
	var named: bool = AccountSession.signed_in() and not _anon.button_pressed
	var account: Dictionary = AccountSession.account()
	var report: Dictionary = ReportPayload.build({
		"kind": _kind, "description": description, "from": _from,
		"recording": _recorder.recording(ReportPayload.RECORDING_LIMIT, {"device": ReportPayload.device_info()}) if attached else null,
		"name": Txt.of(account.get("apelido", account.get("nome", ""))) if named else "",
		"screenshot": ReportPayload.screenshot(_image) if _shot.visible and _shot.button_pressed else "",
		"log": ClientLog.text(),
	})
	var body: PackedByteArray = ReportPayload.encode(report, _recorder if attached else null)
	var result: Dictionary = await client.send_report(report, body, _session if attached else {}, AccountSession.token() if named else "")
	if not is_inside_tree():
		return
	_sending = false
	if Txt.of(result.get("status")) != "sent":
		_submit.disabled = false
		_submit.text = "Enviar"
		_status.text = ""
		_error.text = Txt.of(result.get("text"))
		return
	var code: String = Txt.of(result.get("code"))
	_done_title.text = "Relato %s enviado. Obrigado!" % code
	_form.visible = false
	_done.visible = true
	sent.emit(code)


## Esc fecha; Ctrl+Enter envia. A janela segura o teclado enquanto está aberta (a mesa atrás não reage).
func _input(event: InputEvent) -> void:
	if not visible or not event is InputEventKey or not (event as InputEventKey).pressed:
		return
	var key: InputEventKey = event
	if key.keycode == KEY_ESCAPE and not _sending:
		close()
		get_viewport().set_input_as_handled()
	elif key.keycode in [KEY_ENTER, KEY_KP_ENTER] and key.ctrl_pressed and _form.visible:
		submit()
		get_viewport().set_input_as_handled()


## As teclas que o campo de texto não usou não chegam aos atalhos da mesa (a camada desta janela vem por último).
func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()
