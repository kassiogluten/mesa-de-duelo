# O assento de um jogador no HUD: retrato com a vida e o anel de turno, nome, selos (marcadores, monarca, terrenos…), dano de comandante, reserva de mana, montes que abrem a janela de zona e a previsão do combate.
class_name SeatPanel
extends Control

## Tocou no retrato (escolher o jogador como alvo, quando dá).
signal portrait_pressed(player_id: int)
## Tocou num monte ou no dano de comandante: "graveyard", "exile", "command", "damage" ou "hand".
signal zone_pressed(player_id: int, zone: String)
## Pagando: tocou num pip da reserva ({type:"mana", color, gen}).
signal mana_pressed(message: Dictionary)

const GOLD := Color("#f0b84a")
const DANGER := Color("#ff5a4e")
const CHIP_BG := Color(0.06, 0.08, 0.13, 0.9)

var player_id: int = -1
var mine: bool = false
## O botão redondo com a vida (o HUD o usa para o pulso da vida e as setas que miram jogadores).
var portrait: Button

var _side: float = 0.0
var _column_width: float = 420.0
var _placed_at: Vector2 = Vector2(-1, -1)
var _name: Label
var _status: Label
var _column: VBoxContainer
var _badges: VBoxContainer
var _chips: HBoxContainer
var _pool: HBoxContainer
var _forecast: PanelContainer
var _forecast_label: Label
var _damage_chip: Control
var _damage_level: int = 0
var _turn_label: Label
## Quanto o turno já durava quando o estado chegou e quando ele chegou (ms do relógio do motor), para o relógio andar.
var _turn_base_ms: float = -1.0
var _turn_at_ms: int = 0
var _signature: String = ""
var _selectable: bool = false
var _active: bool = false
var _time: float = 0.0


## Cria as peças; `is_mine`: o seu retrato (canto de baixo, selos acima dele).
func setup(id: int, is_mine: bool) -> void:
	player_id = id
	mine = is_mine
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait = Button.new()
	portrait.focus_mode = Control.FOCUS_NONE
	portrait.pressed.connect(func() -> void: portrait_pressed.emit(player_id))
	add_child(portrait)
	_name = Hud._label(20, Color(1, 1, 1, 0.88))
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_name)
	_status = Hud._label(15, Color("#ff8f84"))
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_status)
	_column = VBoxContainer.new()
	_column.add_theme_constant_override("separation", 6)
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_column)
	_badges = VBoxContainer.new()
	_badges.add_theme_constant_override("separation", 5)
	_badges.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chips = HBoxContainer.new()
	_chips.add_theme_constant_override("separation", 5)
	_chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pool = HBoxContainer.new()
	_pool.add_theme_constant_override("separation", 6)
	_pool.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# O seu: a reserva mais perto do retrato (embaixo), os selos em cima; o do oponente: os selos primeiro.
	for row: Control in ([_badges, _chips, _pool] if not mine else [_badges, _pool, _chips]):
		_column.add_child(row)
	_forecast = PanelContainer.new()
	_forecast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_forecast.visible = false
	_forecast_label = Hud._label(19, Color.WHITE)
	_forecast.add_child(_forecast_label)
	add_child(_forecast)


## Põe o retrato com o centro em `center` (no seu, medido do canto de baixo à esquerda) e lado `side`; os selos
## ocupam até `column_width` ao lado dele (quebrando a linha quando não cabem).
func place(center: Vector2, side: float, column_width: float = 420.0) -> void:
	if is_equal_approx(side, _side) and is_equal_approx(column_width, _column_width) and _placed_at == center:
		return
	_side = side
	_column_width = column_width
	_placed_at = center
	if mine:
		set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		offset_left = center.x - side / 2.0
		offset_top = center.y - side / 2.0
		offset_right = offset_left + side
		offset_bottom = offset_top + side
	else:
		set_anchors_preset(Control.PRESET_TOP_LEFT)
		position = center - Vector2(side, side) / 2.0
		size = Vector2(side, side)
	portrait.position = Vector2.ZERO
	portrait.size = Vector2(side, side)
	portrait.custom_minimum_size = Vector2(side, side)
	portrait.add_theme_font_size_override("font_size", 52 if side > 110 else 40)
	_name.position = Vector2(side / 2.0 - 120, side + 2)
	_name.size = Vector2(240, 28)
	_status.position = Vector2(side / 2.0 - 120, side + 28)
	_status.size = Vector2(240, 22)
	_layout_column.call_deferred()


## Mostra o jogador como o estado diz. `name_of`: nome de carta em português (para o motivo da derrota).
func apply(player: Dictionary, state: Dictionary, selectable: bool, active: bool, name_of: Callable) -> void:
	_selectable = selectable
	_active = active
	var eliminated: bool = bool(player.get("eliminated", false))
	portrait.text = str(int(player.get("life", 0)))
	portrait.modulate = Color(1, 1, 1, 0.45) if eliminated else Color.WHITE
	portrait.tooltip_text = _portrait_hint(player, state)
	_style_portrait()
	_name.text = "Você" if mine else Txt.of(player.get("name", ""))
	var status: String = ""
	if eliminated:
		var reason: String = SeatInfo.loss_reason_text(state, player, mine, name_of)
		status = "Eliminado" + (": " + reason if reason != "" else "")
	elif SeatInfo.offline(state, player):
		status = "desconectado"
	_status.text = status
	_status.visible = status != ""
	_apply_forecast(state)
	# O relógio do turno: conta a partir de quanto o servidor disse que o turno já durava.
	_turn_base_ms = float(state["turnElapsedMs"]) if state.get("turnElapsedMs") != null and state.has("turnElapsedMs") else -1.0
	_turn_at_ms = Time.get_ticks_msec()
	var badges: Array = SeatInfo.badges(player, state, _turn_base_ms)
	var damage: Dictionary = SeatInfo.commander_damage(player)
	var pips: Array = SeatInfo.pool_pips(player, state)
	var zones: Dictionary = {
		"hand": int(player.get("handCount", 0)), "revealed": (player.get("revealedHand", []) as Array).size() if player.get("revealedHand") is Array else 0,
		"graveyard": (player.get("graveyard", []) as Array).size() if player.get("graveyard") is Array else 0,
		"exile": (player.get("exile", []) as Array).size() if player.get("exile") is Array else 0,
		"command": (player.get("commandZone", []) as Array).size() if player.get("commandZone") is Array else 0,
	}
	# Só redesenha os selos quando algo mudou (o relógio do turno anda sozinho em _process).
	var without_clock: Array = badges.filter(func(b: Dictionary) -> bool: return b["key"] != "TURN")
	var signature: String = var_to_str([without_clock, badges.size(), damage, pips, zones])
	if signature == _signature:
		return
	_signature = signature
	_build_badges(badges)
	_build_chips(zones, damage)
	_build_pool(pips)
	_layout_column.call_deferred()


func _process(delta: float) -> void:
	_time += delta
	if _damage_chip and is_instance_valid(_damage_chip) and _damage_level > 0:
		# De 15 em diante o contador pulsa; de 18 em diante, treme também.
		var pulse: float = 0.5 + 0.5 * sin(_time * (7.0 if _damage_level > 1 else 4.0))
		_damage_chip.modulate = Color(1, 1, 1).lerp(Color(1.5, 0.75, 0.7), pulse)
		_damage_chip.pivot_offset = _damage_chip.size / 2.0
		_damage_chip.rotation = sin(_time * 38.0) * 0.035 if _damage_level > 1 else 0.0
	if _selectable:
		portrait.self_modulate = Color(1, 1, 1).lerp(Color(1.25, 1.15, 0.85), 0.5 + 0.5 * sin(_time * 5.0))
	else:
		portrait.self_modulate = Color.WHITE
	if _turn_label and is_instance_valid(_turn_label) and _turn_base_ms >= 0.0:
		_turn_label.text = SeatInfo.turn_time_text(_turn_base_ms + Time.get_ticks_msec() - _turn_at_ms)


## O texto do balão do retrato: nome, vida, mão e o dano de comandante recebido.
func _portrait_hint(player: Dictionary, state: Dictionary) -> String:
	var lines: PackedStringArray = ["%s · %d de vida" % ["Você" if mine else Txt.of(player.get("name")), int(player.get("life", 0))]]
	var hand: int = int(player.get("handCount", 0))
	lines.append("1 carta na mão" if hand == 1 else "%d cartas na mão" % hand)
	lines.append("%d no grimório" % int(player.get("library", 0)))
	for line: Variant in SeatInfo.commander_lines(state, player, func(n: String) -> String: return n):
		var entry: Dictionary = line
		if int(entry["damage"]) > 0:
			lines.append("Dano de %s%s: %s" % [entry["name"], " (de %s)" % entry["owner"] if Txt.of(entry["owner"]) != "" else "", entry["text"]])
	return "\n".join(lines)


func _style_portrait() -> void:
	var ring: Color = Color(1.0, 0.82, 0.3) if _selectable else (GOLD if _active else Color(1, 1, 1, 0.18))
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := Hud._panel_style(Color(0.08, 0.1, 0.16, 0.94), int(_side / 2.0))
		style.border_color = ring
		style.set_border_width_all(6 if _selectable else (4 if _active else 3))
		if _active or _selectable:
			# O anel de turno: um halo dourado em volta do retrato de quem joga o turno.
			style.shadow_color = Color(ring.r, ring.g, ring.b, 0.55)
			style.shadow_size = 14 if _selectable else 10
		if state_name == "hover" and _selectable:
			style.bg_color = Color(0.2, 0.17, 0.08, 0.95)
		portrait.add_theme_stylebox_override(state_name, style)


func _apply_forecast(state: Dictionary) -> void:
	var f: Dictionary = SeatInfo.forecast_of(state, player_id)
	_forecast.visible = not f.is_empty()
	if f.is_empty():
		return
	var badge: Dictionary = SeatInfo.forecast_badge(f, mine)
	var level: String = Txt.of(badge["level"])
	var tint: Color = DANGER if level == "lethal" else (Color("#ff9a3d") if level == "low" else (Color("#6fbf73") if level == "safe" else Color("#e8d6b0")))
	_forecast_label.text = Txt.of(badge["text"])
	_forecast_label.add_theme_color_override("font_color", Color.WHITE if level == "lethal" else tint.lightened(0.35))
	var style := _chip_style(Color(tint.r * 0.35, tint.g * 0.25, tint.b * 0.25, 0.92) if level == "lethal" else CHIP_BG, tint, 12)
	style.content_margin_left = 12
	style.content_margin_right = 12
	_forecast.add_theme_stylebox_override("panel", style)
	_layout_column.call_deferred()


## Tira os filhos já (queue_free sozinho os deixaria contando no tamanho até o fim do quadro).
static func _clear(node: Node) -> void:
	for child: Node in node.get_children():
		node.remove_child(child)
		child.queue_free()


## Os selos em linhas que quebram pela largura da coluna (o HFlowContainer mede a altura pela largura de antes).
func _build_badges(badges: Array) -> void:
	_clear(_badges)
	_turn_label = null
	var line: HBoxContainer = null
	for raw: Variant in badges:
		var b: Dictionary = raw
		var tone: Color = Color(Txt.of(b["tone"]))
		var danger: bool = bool(b["danger"])
		var chip := PanelContainer.new()
		chip.tooltip_text = Txt.of(b["hint"])
		chip.mouse_filter = Control.MOUSE_FILTER_PASS
		chip.add_theme_stylebox_override("panel", _chip_style(Color(0.35, 0.06, 0.05, 0.92) if danger else CHIP_BG, DANGER if danger else Color(tone.r, tone.g, tone.b, 0.55), 13))
		if bool(b["done"]):
			chip.modulate = Color(1, 1, 1, 0.5)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		chip.add_child(row)
		row.add_child(_icon(SeatIcons.icon(Txt.of(b["icon"]), DANGER.lightened(0.3) if danger else tone, 18)))
		if Txt.of(b["text"]) != "":
			var value := Hud._label(17, Color.WHITE)
			value.text = Txt.of(b["text"])
			value.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.add_child(value)
			if b["key"] == "TURN":
				_turn_label = value
		if Txt.of(b["sub"]) != "":
			var sub := Hud._label(13, Color(1, 1, 1, 0.6))
			sub.text = Txt.of(b["sub"])
			sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.add_child(sub)
		if line == null or line.get_combined_minimum_size().x + 5.0 + chip.get_combined_minimum_size().x > _column_width:
			line = HBoxContainer.new()
			line.add_theme_constant_override("separation", 5)
			line.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_badges.add_child(line)
		line.add_child(chip)
	_badges.visible = not badges.is_empty()


func _build_chips(zones: Dictionary, damage: Dictionary) -> void:
	_clear(_chips)
	_damage_chip = null
	_damage_level = 0
	if not mine:
		var revealed: int = int(zones["revealed"])
		var hand := _chip_button("eye" if revealed > 0 else "hand", str(int(zones["hand"])), Color("#cfd8e8"),
			("Mão revelada: %d de %d à vista. Ver" % [revealed, int(zones["hand"])]) if revealed > 0 else "%d cartas na mão" % int(zones["hand"]))
		if revealed > 0:
			hand.pressed.connect(func() -> void: zone_pressed.emit(player_id, "hand"))
		else:
			hand.mouse_default_cursor_shape = Control.CURSOR_ARROW
		_chips.add_child(hand)
	var graveyard := _chip_button("graveyard", str(int(zones["graveyard"])), Color("#c9c3b5"), "Ver o cemitério (%d)" % int(zones["graveyard"]))
	graveyard.pressed.connect(func() -> void: zone_pressed.emit(player_id, "graveyard"))
	_chips.add_child(graveyard)
	if int(zones["exile"]) > 0:
		var exile := _chip_button("exile", str(int(zones["exile"])), Color("#b9a4ff"), "Ver o exílio (%d)" % int(zones["exile"]))
		exile.pressed.connect(func() -> void: zone_pressed.emit(player_id, "exile"))
		_chips.add_child(exile)
	if int(zones["command"]) > 0:
		var command := _chip_button("command", str(int(zones["command"])), GOLD, "Ver a zona de comando")
		command.pressed.connect(func() -> void: zone_pressed.emit(player_id, "command"))
		_chips.add_child(command)
	if int(damage["highest"]) > 0:
		_damage_level = int(damage["level"])
		var tint: Color = DANGER if _damage_level > 0 else Color("#e8a79a")
		var hit := _chip_button("sword", Txt.of(damage["text"]), tint, "Ver o dano de comandante recebido")
		if _damage_level > 0:
			hit.add_theme_stylebox_override("normal", _chip_style(Color(0.35, 0.06, 0.05, 0.92), DANGER, 13))
		hit.pressed.connect(func() -> void: zone_pressed.emit(player_id, "damage"))
		_chips.add_child(hit)
		_damage_chip = hit


func _build_pool(pips: Array) -> void:
	_clear(_pool)
	_pool.visible = not pips.is_empty()
	for raw: Variant in pips:
		var pip: Dictionary = raw
		var message: Dictionary = pip["message"]
		var item: Control
		if message.is_empty():
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 2)
			row.tooltip_text = Txt.of(pip["hint"])
			row.mouse_filter = Control.MOUSE_FILTER_PASS
			row.add_child(_icon(SeatIcons.mana(Txt.of(pip["color"]), 28)))
			if Txt.of(pip["label"]) != "":
				var count := Hud._label(17, Color.WHITE)
				count.text = Txt.of(pip["label"])
				count.mouse_filter = Control.MOUSE_FILTER_IGNORE
				row.add_child(count)
			item = row
		else:
			# Pagando: cada símbolo vira um botão que gasta uma mana daquela cor.
			var button := Button.new()
			button.icon = SeatIcons.mana(Txt.of(pip["color"]), 30)
			button.text = Txt.of(pip["label"])
			button.tooltip_text = Txt.of(pip["hint"])
			button.focus_mode = Control.FOCUS_NONE
			button.add_theme_font_size_override("font_size", 17)
			for state_name: String in ["normal", "hover", "pressed", "focus"]:
				var style := _chip_style(Color(0.25, 0.2, 0.08, 0.95) if state_name == "hover" else CHIP_BG, GOLD, 17)
				style.set_border_width_all(2)
				button.add_theme_stylebox_override(state_name, style)
			button.pressed.connect(func() -> void: mana_pressed.emit(message))
			item = button
		_pool.add_child(item)


## A coluna ao lado do retrato, centrada na altura dele, e a previsão do combate junto da vida (acima do seu retrato,
## que fica no canto de baixo; abaixo do nome no oponente).
func _layout_column() -> void:
	# O HFlowContainer quebra a linha pela largura que tem: a coluna ganha a largura toda e o fluxo se ajeita nela.
	_column.custom_minimum_size = Vector2(_column_width, 0)
	_column.size = Vector2(_column_width, 0)
	_column.reset_size()
	var column_size: Vector2 = _column.get_combined_minimum_size()
	_column.position = Vector2(_side + 14, (_side - column_size.y) / 2.0)
	_forecast.reset_size()
	var fsize: Vector2 = _forecast.get_combined_minimum_size()
	if mine:
		_forecast.position = Vector2(maxf(-offset_left + 12.0, _side / 2.0 - fsize.x / 2.0), -fsize.y - 10)
	else:
		_forecast.position = Vector2(_side / 2.0 - fsize.x / 2.0, _side + (52 if _status.visible else 32))


func _chip_button(icon_name: String, text: String, tone: Color, hint: String) -> Button:
	var button := Button.new()
	button.icon = SeatIcons.icon(icon_name, tone, 18)
	button.text = text
	button.tooltip_text = hint
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_color_override("font_color", Color(1, 1, 1, 0.92))
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_constant_override("h_separation", 5)
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		button.add_theme_stylebox_override(state_name, _chip_style(Color(0.13, 0.16, 0.25, 0.95) if state_name == "hover" else CHIP_BG, Color(tone.r, tone.g, tone.b, 0.45), 13))
	return button


static func _chip_style(fill: Color, border: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 8
	style.content_margin_right = 9
	style.content_margin_top = 3
	style.content_margin_bottom = 3
	return style


static func _icon(tex: Texture2D) -> TextureRect:
	var rect := TextureRect.new()
	rect.texture = tex
	rect.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return rect
