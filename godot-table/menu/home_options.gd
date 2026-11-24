# O pé da coluna da tela inicial: Opções (efeitos, som, os efeitos contínuos e a aparência das cartas numa janelinha), Relatar um problema e
# Meus relatos, como links discretos.
class_name HomeOptions
extends HBoxContainer

signal report
signal my_reports
## O nível de efeitos mudou (a capa liga ou desliga a deriva da arte).
signal effects_changed(level: String)

const LEVELS: Array = [["auto", "Efeitos: automático"], ["alto", "Efeitos: alto"], ["medio", "Efeitos: médio"], ["leve", "Efeitos: leve"]]
const POPOVER_W := 360.0
## A explicação de "Cartas da mesa" (a do navegador em src/ui/tableShell.ts, com o padrão desligado daqui).
const OWN_ART_HINT := "Ligado, os terrenos básicos e as staples (Sol Ring, Command Tower e outras) usam a arte feita para a mesa. Desligado, os terrenos usam a série Nyx e as staples, a imagem normal da carta. A arte escolhida no deck continua valendo."

var _toggle: Button
var _popover: PanelContainer
var _catcher: Control


func _ready() -> void:
	add_theme_constant_override("separation", 4)
	alignment = BoxContainer.ALIGNMENT_CENTER
	_toggle = HomeStyle.link("Opções")
	_toggle.name = "Options"
	_toggle.icon = HudIcons.texture(HudIcons.GEAR, 32)
	_toggle.add_theme_constant_override("icon_max_width", 16)
	_toggle.add_theme_constant_override("h_separation", 7)
	_toggle.add_theme_color_override("icon_normal_color", HomeStyle.DIM)
	_toggle.add_theme_color_override("icon_hover_color", HudStyle.GOLD_SOFT)
	_toggle.add_theme_color_override("icon_pressed_color", HudStyle.GOLD)
	_toggle.tooltip_text = "Efeitos, som, os efeitos contínuos nas permanentes e as cartas da mesa."
	_toggle.pressed.connect(toggle)
	add_child(_toggle)
	add_child(_dot())
	var report_link := HomeStyle.link("Relatar um problema")
	report_link.name = "Report"
	report_link.pressed.connect(func() -> void: report.emit())
	add_child(report_link)
	add_child(_dot())
	var mine := HomeStyle.link("Meus relatos")
	mine.name = "MyReports"
	mine.pressed.connect(func() -> void: my_reports.emit())
	add_child(mine)


func _dot() -> Label:
	var dot := ModalStyle.label(15, Color(HomeStyle.DIM, 0.5), "·")
	dot.add_theme_constant_override("outline_size", 0)
	return dot


func is_open() -> bool:
	return _popover != null and is_instance_valid(_popover)


## Abre ou fecha a janelinha das opções, logo acima do link.
func toggle() -> void:
	if is_open():
		close()
		return
	_catcher = Control.new()
	_catcher.top_level = true
	_catcher.mouse_filter = Control.MOUSE_FILTER_STOP
	_catcher.position = Vector2.ZERO
	_catcher.size = get_viewport_rect().size
	_catcher.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close())
	add_child(_catcher)
	_popover = PanelContainer.new()
	_popover.name = "OptionsPanel"
	_popover.top_level = true
	var style := ModalStyle.panel_style(14)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 18
	style.shadow_size = 24
	_popover.add_theme_stylebox_override("panel", style)
	_popover.custom_minimum_size = Vector2(POPOVER_W, 0)
	add_child(_popover)
	_popover.add_child(_options_body())
	_place_popover.call_deferred()


func close() -> void:
	for node: Node in [_popover, _catcher]:
		if node and is_instance_valid(node):
			node.queue_free()
	_popover = null
	_catcher = null


func _place_popover() -> void:
	if not is_open():
		return
	var anchor: Rect2 = _toggle.get_global_rect()
	var box: Vector2 = _popover.get_combined_minimum_size()
	var view: Vector2 = get_viewport_rect().size
	_popover.size = box
	_popover.position = Vector2(clampf(anchor.position.x, 16.0, view.x - box.x - 16.0), anchor.position.y - box.y - 10.0)
	ModalStyle.pop(_popover, 0.92)


func _options_body() -> VBoxContainer:
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 14)
	body.add_child(ModalStyle.label(19, HudStyle.GOLD_SOFT, "Opções"))
	var prefs: Dictionary = Prefs.load_all()
	var effects := OptionButton.new()
	effects.name = "Effects"
	HomeStyle.style_field(effects)
	for i: int in LEVELS.size():
		effects.add_item(Txt.of((LEVELS[i] as Array)[1]))
		if (LEVELS[i] as Array)[0] == Txt.of(prefs.get("effects", "auto")):
			effects.select(i)
	effects.tooltip_text = "No automático, os efeitos ficam mais leves sozinhos quando os quadros caem."
	effects.item_selected.connect(func(i: int) -> void:
		var level: String = Txt.of((LEVELS[i] as Array)[0])
		Prefs.save("effects", level)
		effects_changed.emit(level))
	body.add_child(effects)
	var sound := HBoxContainer.new()
	sound.add_theme_constant_override("separation", 12)
	sound.add_child(ModalStyle.label(16, ModalStyle.INK, "Som"))
	var volume := HSlider.new()
	volume.name = "Volume"
	volume.min_value = 0.0
	volume.max_value = 1.0
	volume.step = 0.05
	volume.value = float(prefs.get("volume", 0.8))
	volume.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	volume.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	volume.focus_mode = Control.FOCUS_NONE
	volume.value_changed.connect(func(v: float) -> void: Prefs.save("volume", v))
	sound.add_child(volume)
	body.add_child(sound)
	AmbientFx.load_pref()
	var ambient: CheckBox = ModalStyle.checkbox("Efeitos contínuos nas permanentes", AmbientFx.enabled)
	ambient.name = "Ambient"
	ambient.size_flags_horizontal = Control.SIZE_FILL
	ambient.tooltip_text = "Voar, vínculo com a vida, indestrutível e outras qualidades aparecem de leve nas cartas com a mesa parada."
	ambient.toggled.connect(func(on: bool) -> void: AmbientFx.set_enabled(on))
	body.add_child(ambient)
	body.add_child(_appearance())
	return body


## Aparência: "Cartas da mesa" (cards/default_art.gd), desligada de começo, com a explicação embaixo.
func _appearance() -> VBoxContainer:
	var group := VBoxContainer.new()
	group.name = "Appearance"
	group.add_theme_constant_override("separation", 6)
	group.add_child(ModalStyle.label(14, HomeStyle.DIM, "Aparência"))
	var own: CheckBox = ModalStyle.checkbox("Cartas da mesa", DefaultArt.own_art_enabled())
	own.name = "OwnArt"
	own.size_flags_horizontal = Control.SIZE_FILL
	own.toggled.connect(func(on: bool) -> void: DefaultArt.set_own_art_enabled(on))
	group.add_child(own)
	var hint: Label = ModalStyle.wrap(13, Color(ModalStyle.INK, 0.62), OWN_ART_HINT, POPOVER_W - 40.0, false)
	hint.name = "OwnArtHint"
	group.add_child(hint)
	return group


func _unhandled_input(event: InputEvent) -> void:
	if is_open() and event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()
