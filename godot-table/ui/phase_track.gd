# Trilha de fases em 5 grupos (Início, Principal 1, Combate, Principal 2, Final): a etapa atual acesa na cor de quem joga,
# "×N" com combates extras e as paradas marcadas (porte de src/ui/phaseHud.ts, opponentStops.ts e passMenus.ts).
# Clicar num grupo abre as etapas dele para marcar onde o jogo para, em todos os turnos.
class_name PhaseTrack
extends PanelContainer

## Mensagem pronta para o servidor ({type:"preferences", opponentStops:[...]}).
signal action(message: Dictionary)

const MINE := Color("#f2b54c")
const THEIRS := Color("#ec5a3f")
const IDLE := Color("#6e7b93")
const PASSED := Color("#4b566b")
const SLOT := 36

## As etapas marcadas (o que a mesa mostra; o servidor confirma pelo estado).
var stops: Array = []
## O servidor conhece as paradas (preferences.opponentStops veio no estado).
var supported: bool = false
## Guardar a escolha nas preferências do jogador (os testes desligam).
var store_prefs: bool = true
var _pending: Variant = null
var _applied: bool = false
var _local_choice: bool = false
var _state: Dictionary = {}
var _caption_turn: Label
var _caption_step: Label
var _slots: Array = []
var _menu: PanelContainer
var _menu_title: Label
var _menu_steps: VBoxContainer
var _catcher: Control
var _open_group: String = ""


func _ready() -> void:
	var saved: Variant = PhaseText.normalize_stops(Prefs.load_all().get("opponentStops")) if store_prefs else null
	if saved is Array:
		stops = saved
		_local_choice = true
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.06, 0.1, 0.82)
	style.set_corner_radius_all(26)
	style.border_color = Color(1, 1, 1, 0.08)
	style.set_border_width_all(1)
	style.content_margin_left = 16
	style.content_margin_right = 8
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	add_theme_stylebox_override("panel", style)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	add_child(row)
	var caption := VBoxContainer.new()
	caption.add_theme_constant_override("separation", -2)
	caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	caption.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(caption)
	_caption_turn = Hud._label(13, MINE)
	_caption_turn.add_theme_constant_override("outline_size", 0)
	_caption_turn.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_caption_turn.custom_minimum_size = Vector2(120, 0)
	caption.add_child(_caption_turn)
	_caption_step = Hud._label(16, Color(1, 1, 1, 0.92))
	_caption_step.add_theme_constant_override("outline_size", 0)
	_caption_step.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_caption_step.custom_minimum_size = Vector2(120, 0)
	caption.add_child(_caption_step)
	for entry: Array in PhaseText.GROUPS:
		row.add_child(_make_slot(entry))
	_build_menu()


func _make_slot(entry: Array) -> Control:
	var group: String = entry[0]
	var slot := Control.new()
	slot.custom_minimum_size = Vector2(SLOT, SLOT)
	slot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var disc := Panel.new()
	disc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	disc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_child(disc)
	var icon := HudIcons.rect(Txt.of(entry[2]), 20, IDLE)
	icon.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	icon.offset_left = -10
	icon.offset_top = -10
	icon.offset_right = 10
	icon.offset_bottom = 10
	slot.add_child(icon)
	var button := Button.new()
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var empty := StyleBoxEmpty.new()
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		button.add_theme_stylebox_override(state_name, empty)
	button.pressed.connect(func() -> void: open_menu("" if _open_group == group else group))
	button.mouse_entered.connect(func() -> void: _hover(slot, true))
	button.mouse_exited.connect(func() -> void: _hover(slot, false))
	slot.add_child(button)
	var badge := Label.new()
	badge.add_theme_font_size_override("font_size", 11)
	badge.add_theme_color_override("font_color", Color("#ffe2a0"))
	var badge_style := StyleBoxFlat.new()
	badge_style.bg_color = Color("#0c1222")
	badge_style.set_corner_radius_all(8)
	badge_style.border_color = Color("#ffe2a0")
	badge_style.set_border_width_all(1)
	badge_style.content_margin_left = 3
	badge_style.content_margin_right = 3
	badge.add_theme_stylebox_override("normal", badge_style)
	badge.position = Vector2(SLOT - 14, -7)
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.visible = false
	slot.add_child(badge)
	var dot := Panel.new()
	var dot_style := StyleBoxFlat.new()
	dot_style.bg_color = MINE
	dot_style.set_corner_radius_all(4)
	dot_style.border_color = Color("#0a1322")
	dot_style.set_border_width_all(1)
	dot.add_theme_stylebox_override("panel", dot_style)
	dot.size = Vector2(7, 7)
	dot.position = Vector2(SLOT / 2.0 - 3.5, SLOT - 4)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot.visible = false
	slot.add_child(dot)
	_slots.append({"group": group, "slot": slot, "disc": disc, "icon": icon, "button": button, "badge": badge, "dot": dot})
	return slot


func _hover(slot: Control, on: bool) -> void:
	for s: Dictionary in _slots:
		if s["slot"] == slot and not bool(s.get("current", false)):
			(s["disc"] as Panel).add_theme_stylebox_override("panel", _disc(Color(1, 1, 1, 0.08 if on else 0.0)))


static func _disc(color: Color, glow: Color = Color(0, 0, 0, 0), ring: Color = Color(0, 0, 0, 0)) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(SLOT)
	if ring.a > 0.0:
		style.border_color = ring
		style.set_border_width_all(2)
	if glow.a > 0.0:
		style.shadow_color = glow
		style.shadow_size = 8
	return style


func apply_state(state: Dictionary) -> void:
	_state = state
	_observe(state)
	var over: bool = bool(state.get("gameOver", false))
	visible = int(state.get("turn", 0)) > 0 or over
	var mine: bool = state.get("activePlayer") != null and int(state.get("activePlayer")) == int(state.get("you", -1))
	var tint: Color = MINE if mine else THEIRS
	var group: String = PhaseText.step_group(state.get("phase"))
	var active: int = PhaseText.group_index(group)
	var marked: Dictionary = {} if over else PhaseText.stops_by_group(stops)
	var holding: bool = not over and PhaseText.holding_stop(state, stops)
	var editable: bool = _editable()
	_caption_turn.text = PhaseText.owner_text(state) + (" · parada sua" if holding else "")
	_caption_turn.add_theme_color_override("font_color", tint if not over else Color(1, 1, 1, 0.6))
	var step_name: String = Txt.of(Hud.PHASES.get(Txt.of(state.get("phase")), ""))
	_caption_step.text = "Jogo concluído" if over else (step_name if step_name != "" else "Preparando")
	for i: int in _slots.size():
		var s: Dictionary = _slots[i]
		var key: String = s["group"]
		var current: bool = key == group and not over
		s["current"] = current
		var disc: Panel = s["disc"]
		var icon: TextureRect = s["icon"]
		if current:
			disc.add_theme_stylebox_override("panel", _disc(tint, Color(tint, 0.45), MINE if holding and not mine else Color(0, 0, 0, 0)))
			icon.modulate = Color("#1b1203") if mine else Color.WHITE
			(s["slot"] as Control).pivot_offset = Vector2(SLOT, SLOT) / 2.0
			(s["slot"] as Control).scale = Vector2(1.12, 1.12)
		else:
			disc.add_theme_stylebox_override("panel", _disc(Color(1, 1, 1, 0.12) if _open_group == key else Color(0, 0, 0, 0)))
			icon.modulate = PASSED if i < active else (Color(1, 1, 1, 0.9) if _open_group == key else IDLE)
			(s["slot"] as Control).scale = Vector2.ONE
		var combats: int = PhaseText.combat_count(state) if key == "combat" and not over else 0
		var badge: Label = s["badge"]
		badge.visible = combats > 1
		badge.text = "×%d" % combats
		badge.add_theme_color_override("font_color", Color("#ffe2a0") if mine else Color("#ffb3a3"))
		(s["dot"] as Panel).visible = marked.has(key)
		var button: Button = s["button"]
		button.disabled = not editable
		button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if editable else Control.CURSOR_ARROW
		button.tooltip_text = PhaseText.group_tip(state, key, stops) + ("\nClique para marcar onde o jogo para." if editable else "")
	if _open_group != "" and not editable:
		open_menu("")


## Dá para mudar as paradas agora: o servidor as conhece e a partida está em andamento (e não só assistindo).
func _editable() -> bool:
	return supported and not _state.is_empty() and not bool(_state.get("gameOver", false)) and not bool(_state.get("spectating", false)) and not bool(_state.get("watching", false))


## Sincroniza com o servidor como a mesa do navegador: a escolha guardada vale primeiro e um eco antigo não a desfaz.
func _observe(state: Dictionary) -> void:
	var prefs: Dictionary = state.get("preferences") if state.get("preferences") is Dictionary else {}
	var confirmed: Variant = PhaseText.normalize_stops(prefs.get("opponentStops"))
	if not confirmed is Array:
		supported = false
		return
	supported = true
	if not _applied:
		if not _local_choice:
			stops = confirmed
		_applied = true
		_dispatch()
	elif _pending != null:
		if confirmed == _pending:
			_pending = null
			if confirmed != stops:
				_dispatch()
	elif confirmed != stops:
		stops = confirmed
		_persist()


## Liga ou desliga uma etapa e manda ao servidor.
func toggle(step: String) -> void:
	if not supported:
		return
	stops = PhaseText.toggle_stop(stops, step)
	_persist()
	if _pending == null:
		_dispatch()
	_refresh_menu()
	apply_state(_state)


func _dispatch() -> void:
	_pending = stops.duplicate()
	action.emit({"type": "preferences", "opponentStops": stops.duplicate()})


func _persist() -> void:
	_local_choice = true
	if store_prefs:
		Prefs.save("opponentStops", stops)


func _build_menu() -> void:
	_catcher = Control.new()
	_catcher.top_level = true
	_catcher.mouse_filter = Control.MOUSE_FILTER_STOP
	_catcher.visible = false
	_catcher.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			open_menu(""))
	add_child(_catcher)
	_menu = PanelContainer.new()
	_menu.top_level = true
	_menu.visible = false
	_menu.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.05, 0.07, 0.12, 0.97), 14))
	add_child(_menu)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	_menu.add_child(column)
	_menu_title = Hud._label(16, MINE)
	_menu_title.add_theme_constant_override("outline_size", 0)
	column.add_child(_menu_title)
	_menu_steps = VBoxContainer.new()
	_menu_steps.add_theme_constant_override("separation", 4)
	column.add_child(_menu_steps)
	var hint := Hud._label(13, Color(1, 1, 1, 0.6))
	hint.add_theme_constant_override("outline_size", 0)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(280, 0)
	hint.text = "Nas etapas marcadas o jogo para e segura a prioridade para você em qualquer nível de passar automaticamente, mesmo sem ações e com Passar até o fim do turno. Vale em todos os turnos, o seu e os dos oponentes."
	column.add_child(hint)


## Abre o menu de paradas de um grupo da trilha ("" fecha).
func open_menu(group: String) -> void:
	if group != "" and not _editable():
		group = ""
	_open_group = group
	_menu.visible = group != ""
	_catcher.visible = group != ""
	if group != "":
		_menu_title.text = "%s · todos os turnos" % PhaseText.phase_group_label(group)
		_refresh_menu()
		_place_menu.call_deferred()
	if not _state.is_empty():
		apply_state(_state)


func _refresh_menu() -> void:
	if _open_group == "":
		return
	for child: Node in _menu_steps.get_children():
		child.queue_free()
	for entry: Array in PhaseText.stops_of_group(_open_group):
		var step: String = entry[0]
		var on: bool = stops.has(step)
		var button := Hud._button(("●  " if on else "○  ") + Txt.of(entry[1]), on)
		button.custom_minimum_size = Vector2(0, 38)
		button.add_theme_font_size_override("font_size", 16)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.focus_mode = Control.FOCUS_NONE
		button.pressed.connect(func() -> void: toggle(step))
		_menu_steps.add_child(button)


## O menu abre acima do ícone, sem sair da tela.
func _place_menu() -> void:
	var view: Rect2 = get_viewport_rect()
	_catcher.position = Vector2.ZERO
	_catcher.size = view.size
	var anchor: Rect2 = Rect2()
	for s: Dictionary in _slots:
		if s["group"] == _open_group:
			anchor = (s["slot"] as Control).get_global_rect()
	_menu.reset_size()
	var size: Vector2 = _menu.get_combined_minimum_size()
	var left: float = clampf(anchor.get_center().x - size.x / 2.0, 24.0, view.size.x - size.x - 24.0)
	var top: float = anchor.position.y - size.y - 12.0
	if top < 8.0:
		top = anchor.end.y + 12.0
	_menu.position = Vector2(left, top)
