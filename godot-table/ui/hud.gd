# O HUD por cima da mesa 3D: retratos com vida, fase do turno, caixa de ação com os botões e a carta ampliada.
class_name Hud
extends Control

## Um botão da caixa de ação foi apertado: a mensagem pronta para o servidor ({type:"ok", gen}…).
signal action(message: Dictionary)
signal player_clicked(player_id: int)
signal leave_pressed
## O jogador trocou o nível de passar (para guardar).
signal pass_level_changed(level: String)

## Nome das etapas (STOP_STEPS de src/ui/opponentStops.ts).
const PHASES := {
	"UNTAP": "Desvirar", "UPKEEP": "Manutenção", "DRAW": "Compra", "MAIN1": "Principal 1",
	"COMBAT_BEGIN": "Início do combate", "COMBAT_DECLARE_ATTACKERS": "Atacantes", "COMBAT_DECLARE_BLOCKERS": "Bloqueadores",
	"COMBAT_FIRST_STRIKE_DAMAGE": "Dano de primeiro golpe", "COMBAT_DAMAGE": "Dano de combate", "COMBAT_END": "Fim do combate",
	"MAIN2": "Principal 2", "END_OF_TURN": "Etapa final", "CLEANUP": "Limpeza",
}
const GOLD := Color("#f0b84a")

var catalog: CardCatalog
## Onde fica na tela o retrato de um oponente (a mesa 3D responde); (-1, -1) para usar o canto de sempre.
var portrait_slot: Callable = func(_id: int) -> Vector2: return Vector2(-1, -1)
## Quantos jogadores há (retratos menores com mais de um oponente).
var player_count: Callable = func() -> int: return 2

var _phase: Label
var _action_panel: PanelContainer
var _short: Label
var _detail: Label
var _progress: Label
var _buttons_box: VBoxContainer
var _primary: Dictionary = {}
var _preview: TextureRect
var _toast: Label
var _toast_left: float = 0.0
var _portraits: Dictionary = {}
var _end_panel: PanelContainer
var _end_label: Label
var _bar: MatchBar
var _forecast: Label
var _between: PanelContainer
var _between_label: Label
var _between_button: Button


func _ready() -> void:
	# Sob um CanvasLayer não há Control pai: as âncoras sozinhas deixariam o HUD com tamanho zero.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_phase = _label(22, Color(1, 1, 1, 0.85))
	_phase.position = Vector2(24, 18)
	add_child(_phase)
	_bar = MatchBar.new()
	_bar.alignment = BoxContainer.ALIGNMENT_BEGIN
	_bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_bar.offset_left = -640
	_bar.offset_top = 14
	_bar.offset_right = -24
	_bar.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_bar.action.connect(func(message: Dictionary) -> void: action.emit(message))
	_bar.pass_level_changed.connect(func(level: String) -> void: pass_level_changed.emit(level))
	add_child(_bar)

	_action_panel = PanelContainer.new()
	_action_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.05, 0.07, 0.12, 0.88), 14))
	_action_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_action_panel.offset_left = -400
	_action_panel.offset_top = -100
	_action_panel.offset_right = -24
	_action_panel.offset_bottom = -24
	_action_panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_action_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_action_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	_action_panel.add_child(column)
	_short = _label(20, Color(1, 0.97, 0.9))
	_short.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_short.custom_minimum_size = Vector2(340, 0)
	column.add_child(_short)
	_detail = _label(15, Color(1, 1, 1, 0.6))
	_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail.custom_minimum_size = Vector2(340, 0)
	_detail.max_lines_visible = 4
	column.add_child(_detail)
	_progress = _label(16, GOLD)
	_progress.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_progress)
	_forecast = _label(16, Color(1, 0.75, 0.6))
	_forecast.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_forecast.custom_minimum_size = Vector2(340, 0)
	column.add_child(_forecast)
	_buttons_box = VBoxContainer.new()
	_buttons_box.add_theme_constant_override("separation", 8)
	column.add_child(_buttons_box)

	_preview = TextureRect.new()
	_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_preview.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	_preview.offset_left = 24
	_preview.offset_top = -260
	_preview.offset_right = 24 + 372
	_preview.offset_bottom = 260
	_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_preview.visible = false
	add_child(_preview)

	_toast = _label(20, Color(1, 0.85, 0.8))
	_toast.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toast.offset_top = 175
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	add_child(_toast)

	_end_panel = PanelContainer.new()
	_end_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.04, 0.05, 0.09, 0.94), 18))
	_end_panel.set_anchors_preset(Control.PRESET_CENTER)
	_end_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_end_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	_end_panel.visible = false
	add_child(_end_panel)
	var end_column := VBoxContainer.new()
	end_column.add_theme_constant_override("separation", 18)
	_end_panel.add_child(end_column)
	_end_label = _label(44, GOLD)
	_end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_column.add_child(_end_label)
	var rematch := _button("Revanche", false)
	rematch.pressed.connect(func() -> void:
		action.emit({"type": "rematch"})
		_end_label.text = "Revanche pedida…")
	end_column.add_child(rematch)
	var back := _button("Voltar ao início", true)
	back.pressed.connect(func() -> void: leave_pressed.emit())
	end_column.add_child(back)

	# Entre os jogos de uma melhor de três: seguir com o mesmo deck (trocar cartas com o sideboard fica para depois).
	_between = PanelContainer.new()
	_between.add_theme_stylebox_override("panel", _panel_style(Color(0.04, 0.05, 0.09, 0.95), 18))
	_between.set_anchors_preset(Control.PRESET_CENTER)
	_between.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_between.grow_vertical = Control.GROW_DIRECTION_BOTH
	_between.visible = false
	add_child(_between)
	var between_column := VBoxContainer.new()
	between_column.add_theme_constant_override("separation", 14)
	_between.add_child(between_column)
	_between_label = _label(26, GOLD)
	_between_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	between_column.add_child(_between_label)
	_between_button = _button("Seguir com o mesmo deck", true)
	between_column.add_child(_between_button)


func _process(delta: float) -> void:
	if _toast_left > 0.0:
		_toast_left -= delta
		_toast.modulate.a = clamp(_toast_left, 0.0, 1.0)


## `blocker_name`: a criatura escolhida para bloquear, enquanto falta o atacante.
func apply_state(state: Dictionary, blocker_name: String = "") -> void:
	var input: Dictionary = state.get("input", {})
	var you: int = int(state.get("you", 0))
	var active: Variant = state.get("activePlayer")
	var whose: String = "seu turno" if active != null and int(active) == you else "turno do oponente"
	var phase: String = Txt.of(PHASES.get(Txt.of(state.get("phase", "")), ""))
	_phase.text = "Turno %d · %s%s" % [int(state.get("turn", 0)), whose, (" · " + phase) if phase != "" else ""] if int(state.get("turn", 0)) > 0 else "Começando a partida…"
	_apply_action_box(state, blocker_name)
	_bar.apply_state(state)
	_apply_between(state)
	var selectable_players: Array = input.get("selectablePlayers", [])
	for raw: Variant in state.get("players", []):
		_update_portrait(raw as Dictionary, int((raw as Dictionary)["id"]) == you, selectable_players.has(int((raw as Dictionary)["id"])), active != null and int(active) == int((raw as Dictionary)["id"]))
	if bool(state.get("gameOver", false)):
		var winner: String = Txt.of(state.get("winner", ""))
		var me: String = ""
		for raw: Variant in state.get("players", []):
			if int((raw as Dictionary)["id"]) == you:
				me = Txt.of((raw as Dictionary)["name"])
		_end_label.text = "Vitória!" if winner == me else ("Empate" if winner == "" else "Derrota")
		var series: Variant = state.get("match")
		_end_panel.visible = not (series is Dictionary and Txt.of((series as Dictionary).get("phase")) == "sideboarding")
	else:
		_end_panel.visible = false


func show_toast(text: String) -> void:
	_toast.text = text
	_toast_left = 4.0
	_toast.modulate.a = 1.0


## Mostra a carta ampliada (null esconde).
func show_preview(tex: Texture2D) -> void:
	_preview.texture = tex
	_preview.visible = tex != null


## O centro do retrato de um jogador na tela (para as setas que miram jogadores); (-1, -1) se não há.
func portrait_center(player_id: int) -> Vector2:
	var portrait: Button = _portraits.get(player_id)
	return portrait.get_global_rect().get_center() if portrait else Vector2(-1, -1)


## Entre os jogos da série: o placar e o botão de seguir (next-game) com o deck como está.
func _apply_between(state: Dictionary) -> void:
	var series: Variant = state.get("match")
	var board: Variant = state.get("sideboarding")
	var between: bool = series is Dictionary and Txt.of((series as Dictionary).get("phase")) == "sideboarding" and board is Dictionary
	_between.visible = between
	if not between:
		return
	var wins: Array = (series as Dictionary).get("wins", [])
	var score: String = " × ".join(PackedStringArray(wins.map(func(w: Variant) -> String: return str(int(w)))))
	var ready: bool = bool((board as Dictionary).get("ready", false))
	_between_label.text = "Fim do jogo %d · %s" % [int((series as Dictionary).get("gameNumber", 1)), score]
	_between_button.text = "Esperando os outros jogadores…" if ready else "Seguir com o mesmo deck"
	_between_button.disabled = ready
	for connection: Dictionary in _between_button.pressed.get_connections():
		_between_button.pressed.disconnect(connection["callable"])
	var id: int = int((board as Dictionary).get("id", 0))
	_between_button.pressed.connect(func() -> void: action.emit({"type": "next-game", "id": id}))


## Faixa que atravessa o meio da tela ("Seu turno", "Ataque!"): entra deslizando, fica um instante e some.
func banner(text: String, color: Color) -> void:
	var label := _label(64, color)
	label.text = text
	label.add_theme_constant_override("outline_size", 14)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	label.offset_left = -500
	label.offset_right = 500
	label.offset_top = -60
	label.offset_bottom = 20
	label.modulate.a = 0.0
	label.pivot_offset = Vector2(500, 40)
	label.scale = Vector2(1.3, 1.3)
	add_child(label)
	var tween := label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "modulate:a", 1.0, 0.18)
	tween.tween_property(label, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.chain().tween_interval(0.55)
	tween.chain().tween_property(label, "modulate:a", 0.0, 0.3)
	tween.parallel().tween_property(label, "position:y", label.position.y - 30, 0.3)
	tween.chain().tween_callback(label.queue_free)


## O retrato pulsa quando a vida muda: cresce e acende em verde (ganho) ou vermelho (perda).
func pulse_life(player_id: int, delta: int) -> void:
	var portrait: Button = _portraits.get(player_id)
	if portrait == null:
		return
	portrait.pivot_offset = portrait.size / 2.0
	var tint: Color = Color(0.6, 1.3, 0.7) if delta > 0 else Color(1.4, 0.55, 0.5)
	var base: Color = portrait.modulate
	var tween := portrait.create_tween()
	tween.tween_property(portrait, "scale", Vector2(1.18, 1.18), 0.1).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(portrait, "modulate", tint, 0.1)
	tween.tween_property(portrait, "scale", Vector2.ONE, 0.25)
	tween.parallel().tween_property(portrait, "modulate", base, 0.35)


## A mensagem do botão principal ativo ({} se não há), para o Espaço.
func primary_message() -> Dictionary:
	return _primary


## Texto e botões da caixa de ação, pelas mesmas regras da mesa do navegador (text/action_box.gd).
func _apply_action_box(state: Dictionary, blocker_name: String) -> void:
	var translate: Callable = func(name: String) -> String: return catalog.label(name) if catalog else name
	var info: Dictionary = ActionBox.text(state, blocker_name, translate)
	var opening: Variant = (state.get("input", {}) as Dictionary).get("opening")
	var headings: Dictionary = {"mulligan": "Manter esta mão?", "starting-player": "Quem começa a partida?", "play-draw": "Você ganhou o sorteio: jogar primeiro?"}
	var heading: String = Txt.of(headings.get(opening, "")) if opening != null else ""
	var short: String = Txt.of(info["short"]) if Txt.of(info["short"]) != "" else heading
	var tap: Variant = (state.get("input", {}) as Dictionary).get("tapToPay")
	if tap is Dictionary and short == "":
		# Convocar e afins: o título em destaque e a explicação embaixo (o nome da carta já em português).
		var lines: PackedStringArray = Txt.of(info["detail"]).split("\n", false, 1)
		short = lines[0]
		info["detail"] = lines[1] if lines.size() > 1 else ""
	_short.text = short if short != "" else Txt.of(info["detail"])
	_short.visible = _short.text != ""
	_detail.text = Txt.of(info["detail"]) if short != "" and Txt.of(info["detail"]) != short else ""
	_detail.visible = _detail.text != ""
	_progress.text = ("%s · %s" % [info["progress"], info["instruction"]]) if Txt.of(info["progress"]) != "" else ""
	_progress.visible = _progress.text != ""
	_forecast.text = Txt.of(info.get("forecast"))
	_forecast.visible = _forecast.text != ""
	for child: Node in _buttons_box.get_children():
		child.queue_free()
	_primary = {}
	var list: Array = ActionBox.buttons(state, translate)
	for entry: Variant in list:
		var spec: Dictionary = entry
		var message: Dictionary = spec.get("message", {})
		var button := _button(Txt.of(spec["label"]), bool(spec.get("primary", false)))
		button.disabled = not bool(spec.get("enabled", false)) or message.is_empty()
		if bool(spec.get("small", false)):
			button.custom_minimum_size = Vector2(0, 36)
			button.add_theme_font_size_override("font_size", 15)
		button.pressed.connect(func() -> void: action.emit(message))
		_buttons_box.add_child(button)
		if bool(spec.get("primary", false)) and not button.disabled:
			_primary = message
	_action_panel.visible = _short.visible or not list.is_empty()


func _update_portrait(player: Dictionary, mine: bool, selectable: bool, active: bool) -> void:
	var id: int = int(player["id"])
	var portrait: Button = _portraits.get(id)
	if portrait == null:
		portrait = Button.new()
		portrait.custom_minimum_size = Vector2(130, 130)
		portrait.add_theme_font_size_override("font_size", 52)
		portrait.pressed.connect(func() -> void: player_clicked.emit(id))
		var caption := _label(20, Color(1, 1, 1, 0.85))
		caption.name = "Caption"
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		caption.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
		caption.offset_left = -110
		caption.offset_right = 110
		caption.offset_top = 2
		caption.offset_bottom = 30
		portrait.add_child(caption)
		if mine:
			portrait.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
			portrait.offset_left = 34
			portrait.offset_top = -184
			portrait.offset_right = 164
			portrait.offset_bottom = -54
		else:
			portrait.set_anchors_preset(Control.PRESET_CENTER_TOP)
			portrait.offset_left = -65
			portrait.offset_top = 12
			portrait.offset_right = 65
			portrait.offset_bottom = 142
		add_child(portrait)
		_portraits[id] = portrait
	if not mine:
		var slot: Vector2 = portrait_slot.call(id)
		if slot.x >= 0:
			var side: float = 130.0 if int(player_count.call()) <= 2 else 100.0
			portrait.set_anchors_preset(Control.PRESET_TOP_LEFT)
			portrait.custom_minimum_size = Vector2(side, side)
			portrait.add_theme_font_size_override("font_size", 52 if side > 110 else 40)
			portrait.position = slot - Vector2(side, side) / 2.0
			portrait.size = Vector2(side, side)
	portrait.text = str(int(player.get("life", 0)))
	var eliminated: bool = bool(player.get("eliminated", false))
	(portrait.get_node("Caption") as Label).text = ("Você" if mine else Txt.of(player.get("name", ""))) + (" · eliminado" if eliminated else "")
	portrait.modulate = Color(1, 1, 1, 0.45) if eliminated else Color.WHITE
	var ring: Color = Color(1.0, 0.82, 0.3) if selectable else (GOLD if active else Color(1, 1, 1, 0.18))
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := _panel_style(Color(0.08, 0.1, 0.16, 0.92), 65)
		style.border_color = ring
		style.set_border_width_all(6 if selectable else 3)
		if state_name == "hover" and selectable:
			style.bg_color = Color(0.2, 0.17, 0.08, 0.95)
		portrait.add_theme_stylebox_override(state_name, style)


static func _panel_style(color: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	return style


static func _label(size: int, color: Color) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	label.add_theme_constant_override("outline_size", 6)
	return label


static func _button(text: String, primary: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 52)
	button.add_theme_font_size_override("font_size", 20)
	var fill: Color = GOLD if primary else Color(0.12, 0.15, 0.24)
	var text_color: Color = Color(0.12, 0.08, 0.02) if primary else Color(1, 1, 1)
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := _panel_style(fill.lightened(0.12) if state_name == "hover" else (fill.darkened(0.45) if state_name == "disabled" else fill), 26)
		style.border_color = Color(1, 1, 1, 0.12)
		style.set_border_width_all(1)
		button.add_theme_stylebox_override(state_name, style)
	button.add_theme_color_override("font_color", text_color)
	button.add_theme_color_override("font_hover_color", text_color)
	button.add_theme_color_override("font_pressed_color", text_color)
	button.add_theme_color_override("font_disabled_color", text_color.lerp(Color(0.5, 0.5, 0.5), 0.6))
	return button
