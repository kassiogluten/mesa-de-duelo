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
var _confirm: Control
var _confirm_title: Label
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
	var version: String = UpdateState.current_version()
	column.add_child(_text(13, Color(1, 1, 1, 0.4), "Mesa de Duelo · %s" % ("versão %s" % version if version != "" else "versão de desenvolvimento")))


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
	_confirm = ColorRect.new()
	(_confirm as ColorRect).color = Color(0.01, 0.02, 0.04, 0.72)
	_confirm.top_level = true
	_confirm.mouse_filter = Control.MOUSE_FILTER_STOP
	_confirm.visible = false
	add_child(_confirm)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_confirm.add_child(center)
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.05, 0.065, 0.11, 0.98), 18))
	center.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	column.custom_minimum_size = Vector2(520, 0)
	box.add_child(column)
	_confirm_title = _text(28, Hud.GOLD, "", 520)
	column.add_child(_confirm_title)
	_confirm_text = _text(18, Color(1, 1, 1, 0.92), "", 520)
	column.add_child(_confirm_text)
	_confirm_hint = _text(15, Color(1, 1, 1, 0.6), "", 520)
	column.add_child(_confirm_hint)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.alignment = BoxContainer.ALIGNMENT_END
	column.add_child(row)
	var leave := MatchBar._small("Conceder e sair")
	leave.pressed.connect(func() -> void:
		_confirm.visible = false
		leave_pressed.emit())
	row.add_child(leave)
	var stay := MatchBar._small("Conceder e continuar na mesa")
	stay.pressed.connect(func() -> void:
		_confirm.visible = false
		action.emit({"type": "concede"}))
	row.add_child(stay)
	var back := Hud._button("Voltar ao jogo", true)
	back.custom_minimum_size = Vector2(0, 38)
	back.add_theme_font_size_override("font_size", 15)
	back.pressed.connect(func() -> void: _confirm.visible = false)
	row.add_child(back)


## A pergunta do Conceder; "Voltar ao jogo" é o destaque: na dúvida, nada acontece.
func _ask_concede() -> void:
	var t: Dictionary = concede_text(_state)
	_confirm_title.text = t["title"]
	_confirm_text.text = t["text"]
	_confirm_hint.text = t["stay"]
	_confirm.position = Vector2.ZERO
	_confirm.size = get_viewport_rect().size
	_confirm.visible = true


## Esc fecha a confirmação ou o menu.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		if _confirm.visible:
			_confirm.visible = false
			get_viewport().set_input_as_handled()
		elif _panel.visible:
			set_open(false)
			get_viewport().set_input_as_handled()
