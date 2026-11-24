# Menu da partida, no canto (porte de src/ui/matchMenu.ts, tableShell.ts e concedeDialog.ts): formato, sala e placar,
# as opções (efeitos, som, nível de passar), Conceder com confirmação, Sair da partida e a versão.
class_name MatchMenu
extends Button

const UpdateState := preload("res://boot/update_state.gd")
const EFFECTS := [["auto", "Automático"], ["alto", "Alto"], ["medio", "Médio"], ["leve", "Leve"]]

## Mensagem pronta para o servidor.
signal action(message: Dictionary)
## Sair da partida (conceder, se ela está em andamento, e voltar ao início).
signal leave_pressed
## Relatar um problema (a janela do relato abre por cima de tudo, em main.gd).
signal report_pressed
## Mostrar a lista dos atalhos de teclado (a mesma do "?").
signal shortcuts_pressed
signal effects_changed(level: String)
signal volume_changed(volume: float)
signal pass_level_changed(level: String)

var _state: Dictionary = {}
var _panel: PanelContainer
var _catcher: Control
var _meta: Label
var _audience: Label
var _effects: OptionButton
var _volume: HSlider
var _pass: OptionButton
var _concede: Button
var _exit: Button
var _update: Label
var _confirm: Control
var _confirm_box: PanelContainer
var _confirm_title: RichTextLabel
var _confirm_text: Label
var _confirm_hint: Label


func _ready() -> void:
	text = "Menu"
	icon = HudIcons.texture(HudIcons.MENU, 40)
	expand_icon = false
	add_theme_constant_override("icon_max_width", 20)
	add_theme_constant_override("h_separation", 10)
	_style(self)
	custom_minimum_size = Vector2(0, 40)
	focus_mode = Control.FOCUS_NONE
	pressed.connect(func() -> void: set_open(not _panel.visible))
	_build_panel()
	_build_confirm()


static func _style(button: Button) -> void:
	button.add_theme_font_size_override("font_size", 16)
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.04, 0.06, 0.1, 0.82) if state_name != "hover" else Color(0.1, 0.13, 0.2, 0.92)
		style.set_corner_radius_all(20)
		style.border_color = Color(1, 1, 1, 0.1)
		style.set_border_width_all(1)
		style.content_margin_left = 14
		style.content_margin_right = 16
		button.add_theme_stylebox_override(state_name, style)
	button.add_theme_color_override("font_color", Color(1, 1, 1, 0.92))
	button.add_theme_color_override("font_hover_color", Color.WHITE)


func _build_panel() -> void:
	_catcher = Control.new()
	_catcher.top_level = true
	_catcher.mouse_filter = Control.MOUSE_FILTER_STOP
	_catcher.visible = false
	_catcher.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			set_open(false))
	add_child(_catcher)
	_panel = PanelContainer.new()
	_panel.top_level = true
	_panel.visible = false
	_panel.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.04, 0.055, 0.09, 0.97), 14))
	add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	column.custom_minimum_size = Vector2(320, 0)
	_panel.add_child(column)
	_meta = _text(15, Hud.GOLD, "", 320)
	column.add_child(_meta)
	_audience = _text(14, Color(1, 1, 1, 0.65), "", 320)
	column.add_child(_audience)
	column.add_child(_divider())
	column.add_child(_text(14, Color(1, 1, 1, 0.55), "Opções"))
	var prefs: Dictionary = Prefs.load_all()
	_effects = OptionButton.new()
	for i: int in EFFECTS.size():
		_effects.add_item("Efeitos: %s" % (EFFECTS[i] as Array)[1])
		if (EFFECTS[i] as Array)[0] == Txt.of(prefs.get("effects", "auto")):
			_effects.select(i)
	_effects.tooltip_text = "No automático, os efeitos ficam mais leves sozinhos quando os quadros caem."
	_effects.custom_minimum_size = Vector2(0, 38)
	_effects.item_selected.connect(func(i: int) -> void:
		var level: String = (EFFECTS[i] as Array)[0]
		Prefs.save("effects", level)
		effects_changed.emit(level))
	column.add_child(_effects)
	# Efeitos contínuos nas permanentes (fx/ambient_fx.gd): valem na hora.
	AmbientFx.load_pref()
	var ambient: CheckBox = ModalStyle.checkbox("Efeitos contínuos nas permanentes", AmbientFx.enabled)
	ambient.size_flags_horizontal = Control.SIZE_FILL
	ambient.tooltip_text = "Voar, vínculo com a vida, indestrutível e outras qualidades aparecem de leve nas cartas com a mesa parada."
	ambient.toggled.connect(func(on: bool) -> void: AmbientFx.set_enabled(on))
	column.add_child(ambient)
	var sound := HBoxContainer.new()
	sound.add_theme_constant_override("separation", 12)
	sound.add_child(_text(15, Color(1, 1, 1, 0.8), "Som"))
	_volume = HSlider.new()
	_volume.min_value = 0.0
	_volume.max_value = 1.0
	_volume.step = 0.05
	_volume.value = float(prefs.get("volume", 0.8))
	_volume.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_volume.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_volume.value_changed.connect(func(v: float) -> void:
		Prefs.save("volume", v)
		volume_changed.emit(v))
	sound.add_child(_volume)
	column.add_child(sound)
	_pass = OptionButton.new()
	for entry: Array in MatchBar.LEVELS:
		_pass.add_item("Passar: %s" % entry[1])
		_pass.set_item_tooltip(_pass.item_count - 1, Txt.of(entry[2]))
	_pass.custom_minimum_size = Vector2(0, 38)
	_pass.item_selected.connect(func(i: int) -> void:
		var level: String = Txt.of((MatchBar.LEVELS[i] as Array)[0])
		action.emit({"type": "preferences", "passLevel": level})
		pass_level_changed.emit(level))
	column.add_child(_pass)
	column.add_child(_divider())
	# Os atalhos de teclado (a câmera, passar, desfazer…): a mesma lista do "?".
	var keys := _item("Atalhos de teclado  ·  ?", HudIcons.KEYBOARD, Color(1, 1, 1, 0.9))
	keys.name = "Shortcuts"
	keys.pressed.connect(func() -> void:
		set_open(false)
		shortcuts_pressed.emit())
	column.add_child(keys)
	_concede = _item("Conceder", HudIcons.FLAG, Color("#ff8a70"))
	_concede.pressed.connect(func() -> void:
		set_open(false)
		_ask_concede())
	column.add_child(_concede)
	_exit = _item("Sair da partida", HudIcons.HOME, Color(1, 1, 1, 0.9))
	_exit.pressed.connect(func() -> void:
		set_open(false)
		leave_pressed.emit())
	column.add_child(_exit)
	var report := _item("Relatar um problema", HudIcons.REPORT, Color(1, 1, 1, 0.9))
	report.name = "Report"
	report.pressed.connect(func() -> void:
		set_open(false)
		report_pressed.emit())
	column.add_child(report)
	# Versão nova saiu com a mesa aberta: só uma linha aqui, nunca uma interrupção da partida.
	_update = _text(13, ModalStyle.GOLD_LIGHT, "", 320)
	_update.visible = false
	column.add_child(_update)
	var version: String = UpdateState.current_version()
	column.add_child(_text(13, Color(1, 1, 1, 0.4), "Mesa de Duelo · %s" % ("versão %s" % UpdateState.display_version(version) if version != "" else "versão de desenvolvimento")))


## Um texto do menu; com `width`, quebra as linhas nessa largura.
static func _text(size: int, color: Color, content: String = "", width: float = 0.0) -> Label:
	var label := Hud._label(size, color)
	label.add_theme_constant_override("outline_size", 0)
	if width > 0.0:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.custom_minimum_size = Vector2(width, 0)
	label.text = content
	return label


static func _divider() -> HSeparator:
	var line := HSeparator.new()
	line.add_theme_constant_override("separation", 4)
	return line


static func _item(label: String, svg: String, color: Color) -> Button:
	var button := Button.new()
	button.text = label
	button.icon = HudIcons.texture(svg, 40)
	button.add_theme_constant_override("icon_max_width", 20)
	button.add_theme_constant_override("h_separation", 12)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.custom_minimum_size = Vector2(0, 42)
	button.focus_mode = Control.FOCUS_NONE
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_color_override("font_color", color)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("icon_normal_color", color)
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(1, 1, 1, 0.07 if state_name == "hover" else 0.0)
		style.set_corner_radius_all(10)
		style.content_margin_left = 10
		button.add_theme_stylebox_override(state_name, style)
	return button


func set_open(open: bool) -> void:
	_panel.visible = open
	_catcher.visible = open
	if open:
		apply_state(_state)
		_update.text = "Nova versão disponível. Ela entra na próxima vez que você abrir a mesa." if not UpdateCheck.pending.is_empty() else ""
		_update.visible = _update.text != ""
		_catcher.position = Vector2.ZERO
		_catcher.size = get_viewport_rect().size
		_panel.position = get_global_rect().position + Vector2(0, size.y + 8)
		_panel.reset_size.call_deferred()


func apply_state(state: Dictionary) -> void:
	_state = state
	if state.is_empty():
		return
	var room: Dictionary = state.get("room") if state.get("room") is Dictionary else {}
	var parts: PackedStringArray = []
	var format: String = MatchText.match_format_name(state)
	if format != "":
		parts.append(format)
	if not room.is_empty() and not bool(room.get("computer", false)):
		parts.append("Sala %s" % Txt.of(room.get("code")))
	var series: String = MatchText.series_text(state)
	if series != "":
		parts.append(series)
	_meta.text = " · ".join(parts)
	_meta.visible = _meta.text != ""
	var audience: Array = room.get("spectators", []) if room.get("spectators") is Array else []
	if audience.is_empty() and state.get("audience") is Dictionary:
		audience = ((state["audience"] as Dictionary).get("spectators", []) as Array)
	_audience.text = "Assistindo: %s" % ", ".join(PackedStringArray(audience.map(func(n: Variant) -> String: return Txt.of(n)))) if not audience.is_empty() else ""
	_audience.visible = _audience.text != ""
	var me: Dictionary = {}
	for p: Variant in state.get("players", []):
		if (p as Dictionary).get("id") == state.get("you"):
			me = p
	var watching: bool = bool(state.get("watching", false))
	var playing: bool = not watching and not bool(state.get("gameOver", false)) and not me.is_empty() and not bool(me.get("eliminated", false))
	_concede.visible = playing
	_exit.visible = not playing and (watching or not state.get("sideboarding") is Dictionary)
	_exit.text = "Parar de assistir" if watching else "Sair da partida"
	_pass.visible = not watching and not bool(state.get("spectating", false))
	var prefs: Dictionary = state.get("preferences") if state.get("preferences") is Dictionary else {}
	for i: int in MatchBar.LEVELS.size():
		if (MatchBar.LEVELS[i] as Array)[0] == Txt.of(prefs.get("passLevel")) and _pass.selected != i:
			_pass.select(i)


## O que conceder significa nesta partida e para onde vai quem continua na mesa (concedeDialog.ts).
static func concede_text(state: Dictionary) -> Dictionary:
	var config: Dictionary = state.get("config") if state.get("config") is Dictionary else {}
	if Txt.of(config.get("matchLength")) == "bo3":
		return {"title": "Conceder este jogo?", "text": "O oponente vence este jogo da melhor de três.",
			"stay": "Continuando na mesa, você vai para a troca de cartas do próximo jogo (ou para o resultado, se a série acabar)."}
	if (state.get("players", []) as Array).size() > 2:
		return {"title": "Conceder a partida?", "text": "Você sai do jogo, e os outros jogadores continuam.", "stay": "Continuando na mesa, você assiste ao resto do jogo."}
	return {"title": "Conceder a partida?", "text": "O oponente vence a partida.",
		"stay": "Continuando na mesa, você vai para o resultado, com %s." % ("Pedir revanche" if state.get("room") is Dictionary else "Jogar de novo")}


func _build_confirm() -> void:
	# A mesa desfocada atrás e o painel das janelas da mesa (ModalStyle), como nas perguntas.
	_confirm = Control.new()
	_confirm.top_level = true
	_confirm.mouse_filter = Control.MOUSE_FILTER_STOP
	_confirm.visible = false
	add_child(_confirm)
	_confirm.add_child(ModalBackdrop.new())
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_confirm.add_child(center)
	_confirm_box = PanelContainer.new()
	_confirm_box.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_confirm_box.resized.connect(func() -> void: _confirm_box.pivot_offset = _confirm_box.size / 2.0)
	center.add_child(_confirm_box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.custom_minimum_size = Vector2(500, 0)
	_confirm_box.add_child(column)
	var flag := TextureRect.new()
	flag.texture = HudIcons.texture(HudIcons.FLAG, 72)
	flag.modulate = Color("#ff8a70")
	flag.custom_minimum_size = Vector2(36, 36)
	flag.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	flag.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	flag.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(flag)
	var heading := ModalStyle.title("", 28)
	_confirm_title = heading.get_node("Title")
	column.add_child(heading)
	_confirm_text = ModalStyle.wrap(18, ModalStyle.INK, "", 500)
	column.add_child(_confirm_text)
	_confirm_hint = ModalStyle.wrap(15, ModalStyle.MUTED, "", 500)
	column.add_child(_confirm_hint)
	var buttons := VBoxContainer.new()
	buttons.add_theme_constant_override("separation", 10)
	column.add_child(buttons)
	var back := ModalStyle.button("Voltar ao jogo", ModalStyle.Kind.PRIMARY, 320)
	back.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(_close_confirm)
	buttons.add_child(back)
	var stay := ModalStyle.button("Conceder e continuar na mesa", ModalStyle.Kind.SECONDARY, 320)
	stay.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	stay.pressed.connect(func() -> void:
		_confirm.visible = false
		action.emit({"type": "concede"}))
	buttons.add_child(stay)
	var leave := ModalStyle.button("Conceder e sair", ModalStyle.Kind.DANGER, 320)
	leave.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	leave.pressed.connect(func() -> void:
		_confirm.visible = false
		leave_pressed.emit())
	buttons.add_child(leave)


## A pergunta do Conceder; "Voltar ao jogo" é o destaque: na dúvida, nada acontece.
func _ask_concede() -> void:
	var t: Dictionary = concede_text(_state)
	ModalStyle.set_rich(_confirm_title, t["title"], 28, true)
	_confirm_text.text = t["text"]
	_confirm_hint.text = t["stay"]
	_confirm.position = Vector2.ZERO
	_confirm.size = get_viewport_rect().size
	_confirm.visible = true
	var backdrop: ModalBackdrop = _confirm.get_node("Backdrop")
	backdrop.amount = 0.0
	backdrop.fade(1.0, 0.24)
	_confirm_box.modulate.a = 0.0
	_confirm_box.scale = Vector2(0.96, 0.96)
	var tween := _confirm_box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_confirm_box, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
	tween.tween_property(_confirm_box, "scale", Vector2.ONE, ModalStyle.ENTER_TIME)


## Fecha a confirmação com a mesma saída curta das janelas.
func _close_confirm() -> void:
	var backdrop: ModalBackdrop = _confirm.get_node("Backdrop")
	backdrop.fade(0.0, ModalStyle.EXIT_TIME)
	var tween := _confirm_box.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_confirm_box, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	tween.tween_property(_confirm_box, "scale", Vector2(0.97, 0.97), ModalStyle.EXIT_TIME)
	tween.chain().tween_callback(func() -> void: _confirm.visible = false)


## Esc fecha a confirmação ou o menu.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		if _confirm.visible:
			_close_confirm()
			get_viewport().set_input_as_handled()
		elif _panel.visible:
			set_open(false)
			get_viewport().set_input_as_handled()
