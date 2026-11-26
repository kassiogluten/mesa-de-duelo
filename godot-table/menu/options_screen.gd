# As Opções da mesa no PC como as de um jogo (roadmap 150): janela grande por cima da tela inicial, com abas laterais
# (Imagem, Som, Mesa, Teclado, Conta e relatos) e, em cada aba, uma linha por opção com o nome, a explicação e o valor
# com setas, deslizante ou caixa de marcar. Vale na hora e fica guardado (game/prefs.gd). Esc ou fora da janela fecham.
class_name OptionsScreen
extends Control

signal report
signal my_reports
## O nível de efeitos mudou (a capa liga ou desliga a deriva da arte).
signal effects_changed(level: String)
signal closed

const TABS: Array = [["imagem", "Imagem"], ["som", "Som"], ["mesa", "Mesa"], ["teclado", "Teclado"], ["conta", "Conta e relatos"]]
const EFFECTS: Array = [["auto", "Automático"], ["alto", "Alto"], ["medio", "Médio"], ["leve", "Leve"]]
const SIZE := Vector2(980, 600)
## A explicação de "Cartas da mesa" (a do navegador em src/ui/tableShell.ts, com o padrão desligado daqui).
const OWN_ART_HINT := "Ligado, os terrenos básicos e as staples (Sol Ring, Command Tower e outras) usam a arte feita para a mesa. Desligado, os terrenos usam a série Nyx e as staples, a imagem normal da carta. A arte escolhida no deck continua valendo."
const EFFECT_HINTS := {
	"auto": "Começa no alto e fica mais leve sozinho quando os quadros caem.",
	"alto": "Todos os efeitos: luz, partículas, câmera e tremores.",
	"medio": "Menos partículas e sem os efeitos de tela cheia.",
	"leve": "Só o essencial, para placas de vídeo mais fracas.",
}

var tab: String = "imagem"
var _panel: PanelContainer
var _body: VBoxContainer
var _shade: ColorRect


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	top_level = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	_shade = ColorRect.new()
	_shade.color = Color(0.01, 0.015, 0.03, 0.72)
	_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shade.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close())
	add_child(_shade)
	_panel = PanelContainer.new()
	_panel.name = "OptionsPanel"
	_panel.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	_panel.custom_minimum_size = SIZE
	add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 18)
	_panel.add_child(column)
	var head := HBoxContainer.new()
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_child(ModalStyle.eyebrow("Mesa de Duelo", false))
	var title := ModalStyle.label(30, Color.WHITE, "Opções")
	title.add_theme_font_override("font", HudStyle.bold_font())
	title.add_theme_constant_override("outline_size", 0)
	titles.add_child(title)
	head.add_child(titles)
	var done: Button = ModalStyle.button("Fechar", ModalStyle.Kind.GHOST, 110.0, 42.0)
	done.name = "Close"
	done.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	done.pressed.connect(close)
	head.add_child(done)
	column.add_child(head)
	var split := HBoxContainer.new()
	split.add_theme_constant_override("separation", 28)
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(split)
	split.add_child(UiKit.side_tabs(TABS, tab, show_tab))
	var line := VSeparator.new()
	var line_style := StyleBoxLine.new()
	line_style.color = Color(1, 1, 1, 0.08)
	line_style.vertical = true
	line.add_theme_stylebox_override("separator", line_style)
	split.add_child(line)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	split.add_child(scroll)
	_body = VBoxContainer.new()
	_body.name = "Body"
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 22)
	scroll.add_child(_body)
	show_tab(tab)
	_place()
	get_viewport().size_changed.connect(_place)
	UiKit.open_modal.call_deferred(_panel)


func _place() -> void:
	var view: Vector2 = get_viewport_rect().size
	var box := Vector2(minf(SIZE.x, view.x - 48.0), minf(SIZE.y, view.y - 48.0))
	_panel.size = box
	_panel.position = ((view - box) / 2.0).round()


## Mostra uma aba ("imagem", "som", "mesa", "teclado", "conta").
func show_tab(key: String) -> void:
	tab = key
	for child: Node in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	match key:
		"som":
			_sound()
		"mesa":
			_table()
		"teclado":
			_keys()
		"conta":
			_account()
		_:
			_picture()


func close() -> void:
	if is_queued_for_deletion():
		return
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	create_tween().tween_property(_shade, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	UiKit.close_modal(_panel, func() -> void:
		closed.emit()
		queue_free())


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()


func _group(text: String) -> void:
	_body.add_child(UiKit.caption(text, ModalStyle.GOLD))


func _picture() -> void:
	var prefs: Dictionary = Prefs.load_all()
	var level: String = Txt.of(prefs.get("effects", "auto"))
	_group("Efeitos")
	var hint: Array[Label] = []
	var effects: HBoxContainer = UiKit.stepper(EFFECTS, level, func(value: String) -> void:
		Prefs.save("effects", value)
		hint[0].text = Txt.of(EFFECT_HINTS.get(value, ""))
		effects_changed.emit(value))
	effects.name = "Effects"
	var row: HBoxContainer = UiKit.option_row("Qualidade dos efeitos", effects, Txt.of(EFFECT_HINTS.get(level, "")))
	hint.append(row.find_child("Hint", true, false) as Label)
	_body.add_child(row)
	AmbientFx.load_pref()
	var ambient: CheckBox = _switch("Ambient", AmbientFx.enabled, func(on: bool) -> void: AmbientFx.set_enabled(on))
	_body.add_child(UiKit.option_row("Efeitos contínuos nas permanentes", ambient, "Voar, vínculo com a vida, indestrutível e outras qualidades aparecem de leve nas cartas com a mesa parada."))
	var motion: CheckBox = _switch("ReduceMotion", UiKit.reduce_motion, func(on: bool) -> void:
		UiKit.reduce_motion = on
		Prefs.save("reduce_motion", on))
	_body.add_child(UiKit.option_row("Menos movimento nas telas", motion, "As telas e as janelas só aparecem, sem subir nem crescer."))
	_body.add_child(UiKit.divider())
	_group("Aparência")
	var own: CheckBox = _switch("OwnArt", DefaultArt.own_art_enabled(), func(on: bool) -> void: DefaultArt.set_own_art_enabled(on))
	var own_row: HBoxContainer = UiKit.option_row("Cartas da mesa", own, OWN_ART_HINT)
	(own_row.find_child("Hint", true, false) as Label).name = "OwnArtHint"
	_body.add_child(own_row)


func _sound() -> void:
	var prefs: Dictionary = Prefs.load_all()
	_group("Volume")
	var percent: Callable = func(v: float) -> String: return "%d%%" % roundi(v * 100.0)
	var volume: HBoxContainer = UiKit.slider(float(prefs.get("volume", 0.8)), 0.0, 1.0, 0.05, func(v: float) -> void:
		Prefs.save("volume", v)
		UiSounds.set_volume(v), percent)
	volume.name = "Volume"
	_body.add_child(UiKit.option_row("Efeitos e interface", volume, "Os sons da mesa (cartas, golpes, mana) e os da interface."))
	var ui: CheckBox = _switch("UiSounds", UiSounds.enabled, func(on: bool) -> void:
		UiSounds.set_enabled(on)
		if on:
			UiSounds.play("confirm"))
	_body.add_child(UiKit.option_row("Sons da interface", ui, "Um toque baixo ao passar o mouse nos botões, ao clicar e ao abrir e fechar as janelas."))


func _table() -> void:
	var prefs: Dictionary = Prefs.load_all()
	_group("Câmera da partida")
	var turn: HBoxContainer = UiKit.slider(float(prefs.get("camera_yaw", 0.0)), -rad_to_deg(TableCamera.MAX_YAW), rad_to_deg(TableCamera.MAX_YAW), 1.0,
		func(v: float) -> void: Prefs.save("camera_yaw", v),
		func(v: float) -> String: return "%d°" % roundi(v))
	turn.name = "CameraYaw"
	_body.add_child(UiKit.option_row("Giro", turn, "Quanto a mesa começa girada. Na partida, arraste com o botão do meio do mouse para girar e inclinar, ou use Q e E."))
	var zoom: HBoxContainer = UiKit.slider(100.0 / float(prefs.get("camera_zoom", 1.0)), roundf(100.0 / TableCamera.ZOOM_FAR), roundf(100.0 / TableCamera.ZOOM_NEAR), 1.0,
		func(v: float) -> void: Prefs.save("camera_zoom", clampf(100.0 / v, TableCamera.ZOOM_NEAR, TableCamera.ZOOM_FAR)),
		func(v: float) -> String: return "%d%%" % roundi(v))
	zoom.name = "CameraZoom"
	_body.add_child(UiKit.option_row("Zoom", zoom, "Na partida, a roda do mouse aproxima e afasta, e o 0 volta à vista padrão."))


func _keys() -> void:
	_group("Atalhos da partida")
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 10)
	for raw: Variant in KeyMap.SHORTCUTS:
		var entry: Array = raw
		var cap: PanelContainer = ModalStyle.keycap(Txt.of(entry[0]))
		cap.size_flags_horizontal = Control.SIZE_SHRINK_END
		cap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		(cap.get_child(0) as Label).add_theme_font_size_override("font_size", 15)
		grid.add_child(cap)
		var text: Label = ModalStyle.wrap(16, Color(ModalStyle.INK, 0.88), Txt.of(entry[2]), 0.0, false)
		text.add_theme_constant_override("outline_size", 0)
		text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(text)
	_body.add_child(grid)
	var tip: Label = ModalStyle.wrap(14, ModalStyle.FAINT, "Na partida, o ? mostra esta lista, e o clique direito numa carta a abre de perto.", 0.0, false)
	tip.add_theme_constant_override("outline_size", 0)
	_body.add_child(tip)


func _account() -> void:
	_group("Conta")
	var who: String = "Conectada como %s." % AccountSession.display_name() if AccountSession.signed_in() else "Nenhuma conta conectada."
	var line: Label = ModalStyle.wrap(17, ModalStyle.INK, who, 0.0, false)
	line.name = "AccountName"
	_body.add_child(line)
	var hint: Label = ModalStyle.wrap(14, Color(ModalStyle.INK, 0.58), "Entre ou saia pelo quadro da conta, no canto de cima da tela inicial. Com a conta, os seus decks vão junto para o site e para outros computadores.", 0.0, false)
	hint.add_theme_constant_override("outline_size", 0)
	_body.add_child(hint)
	_body.add_child(UiKit.divider())
	_group("Relatos")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var send: Button = ModalStyle.button("Relatar um problema", ModalStyle.Kind.SECONDARY, 0.0, 46.0)
	send.name = "Report"
	send.pressed.connect(func() -> void:
		close()
		report.emit())
	row.add_child(send)
	var mine: Button = ModalStyle.button("Meus relatos", ModalStyle.Kind.GHOST, 0.0, 46.0)
	mine.name = "MyReports"
	mine.pressed.connect(func() -> void:
		close()
		my_reports.emit())
	row.add_child(mine)
	_body.add_child(row)


func _switch(node_name: String, on: bool, changed: Callable) -> CheckBox:
	var box := CheckBox.new()
	box.name = node_name
	box.button_pressed = on
	box.focus_mode = Control.FOCUS_NONE
	box.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	box.text = "Ligado" if on else "Desligado"
	box.custom_minimum_size = Vector2(150, 0)
	box.toggled.connect(func(value: bool) -> void:
		box.text = "Ligado" if value else "Desligado"
		changed.call(value))
	return box
