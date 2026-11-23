# A tela do fim do jogo: o título grande (Vitória, Derrota, Empate) com a virada e o "por um fio", o turno e a duração, o
# motivo da derrota, os quatro números e a tabela com todos, o gráfico de vida, o destaque do jogo e os botões (Jogar de
# novo ou Pedir revanche, Ver campo de batalha, Início). Entra animada por cima da mesa, que fica desfocada atrás.
class_name ResultScreen
extends Control

## Mensagem pronta para o servidor ({type:"rematch"}).
signal action(message: Dictionary)
signal leave_pressed

const GOLD := Color("#f0b84a")
const TONES := {"win": Color("#f4c04e"), "lose": Color("#ec6a5e"), "draw": Color("#c9d2e3")}
const BLUR_SHADER := """
shader_type canvas_item;
uniform sampler2D screen: hint_screen_texture, filter_linear_mipmap;
uniform float amount: hint_range(0.0, 1.0) = 1.0;
uniform vec4 tint: source_color = vec4(0.02, 0.03, 0.06, 1.0);
void fragment() {
	vec3 blurred = textureLod(screen, SCREEN_UV, 3.2 * amount).rgb;
	float edge = distance(SCREEN_UV, vec2(0.5)) * 1.3;
	vec3 color = mix(blurred, tint.rgb, (0.55 + edge * 0.35) * amount);
	COLOR = vec4(color, 1.0);
}
"""

var catalog: CardCatalog
## A sala da partida em rede (FRoom), para o botão de revanche; {} contra o computador.
var room: Dictionary = {}:
	set(value):
		room = value
		if _shown_key != "":
			_refresh_buttons()

var _recap := GameRecap.new()
var _state: Dictionary = {}
## O jogo cuja tela já entrou (não repete a entrada a cada estado igual).
var _shown_key: String = ""
var _rematch_sent: bool = false
var _showing_table: bool = false
var _glow: Tween
var _backdrop: ColorRect
var _backdrop_material: ShaderMaterial
var _column: VBoxContainer
var _title: Label
var _ribbons: HBoxContainer
var _detail: Label
var _reason: Label
var _tiles: HBoxContainer
var _toggle: Button
var _chart: LifeChart
var _table: GridContainer
var _table_box: ScrollContainer
var _highlight: PanelContainer
var _highlight_art: TextureRect
var _highlight_kind: Label
var _highlight_text: Label
var _note: Label
var _rematch: Button
var _observe: Button
var _home: Button
var _back: Button


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false

	_backdrop = ColorRect.new()
	_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := Shader.new()
	shader.code = BLUR_SHADER
	_backdrop_material = ShaderMaterial.new()
	_backdrop_material.shader = shader
	_backdrop.material = _backdrop_material
	add_child(_backdrop)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_column = VBoxContainer.new()
	_column.custom_minimum_size = Vector2(860, 0)
	_column.add_theme_constant_override("separation", 14)
	_column.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(_column)

	_title = Hud._label(118, GOLD)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_constant_override("outline_size", 22)
	_title.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.55))
	_title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5))
	_title.add_theme_constant_override("shadow_offset_y", 6)
	_column.add_child(_title)
	_ribbons = HBoxContainer.new()
	_ribbons.alignment = BoxContainer.ALIGNMENT_CENTER
	_ribbons.add_theme_constant_override("separation", 16)
	_column.add_child(_ribbons)
	_detail = Hud._label(21, Color(1, 1, 1, 0.78))
	_detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_column.add_child(_detail)
	_reason = Hud._label(19, Color(1.0, 0.68, 0.62))
	_reason.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_column.add_child(_reason)
	_tiles = HBoxContainer.new()
	_tiles.alignment = BoxContainer.ALIGNMENT_CENTER
	_tiles.add_theme_constant_override("separation", 12)
	_column.add_child(_tiles)

	_toggle = Button.new()
	_toggle.flat = true
	_toggle.add_theme_font_size_override("font_size", 17)
	_toggle.add_theme_color_override("font_color", GOLD)
	_toggle.add_theme_color_override("font_hover_color", GOLD.lightened(0.3))
	_toggle.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_toggle.pressed.connect(_toggle_numbers)
	_column.add_child(_toggle)
	_chart = LifeChart.new()
	_column.add_child(_chart)
	_table_box = ScrollContainer.new()
	_table_box.custom_minimum_size = Vector2(760, 250)
	_table_box.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_table_box.visible = false
	_column.add_child(_table_box)
	_table = GridContainer.new()
	_table.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_table.add_theme_constant_override("h_separation", 24)
	_table.add_theme_constant_override("v_separation", 4)
	_table_box.add_child(_table)

	_highlight = PanelContainer.new()
	_highlight.add_theme_stylebox_override("panel", _box(Color(0.07, 0.09, 0.15, 0.92), GOLD.darkened(0.35)))
	_highlight.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_highlight.custom_minimum_size = Vector2(620, 0)
	_column.add_child(_highlight)
	var hl := HBoxContainer.new()
	hl.add_theme_constant_override("separation", 14)
	_highlight.add_child(hl)
	_highlight_art = TextureRect.new()
	_highlight_art.custom_minimum_size = Vector2(54, 75)
	_highlight_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_highlight_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hl.add_child(_highlight_art)
	var hl_text := VBoxContainer.new()
	hl_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hl_text.alignment = BoxContainer.ALIGNMENT_CENTER
	hl.add_child(hl_text)
	_highlight_kind = Hud._label(15, GOLD)
	hl_text.add_child(_highlight_kind)
	_highlight_text = Hud._label(17, Color(1, 1, 1, 0.9))
	_highlight_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_highlight_text.custom_minimum_size = Vector2(520, 0)
	hl_text.add_child(_highlight_text)

	_note = Hud._label(17, Color(1, 1, 1, 0.7))
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_column.add_child(_note)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	buttons.add_theme_constant_override("separation", 14)
	_column.add_child(buttons)
	_rematch = _wide(Hud._button("Jogar de novo", true))
	_rematch.pressed.connect(func() -> void:
		_rematch_sent = true
		action.emit({"type": "rematch"})
		_refresh_buttons())
	buttons.add_child(_rematch)
	_observe = _wide(Hud._button("Ver campo de batalha", false))
	_observe.pressed.connect(func() -> void: _show_table(true))
	buttons.add_child(_observe)
	_home = _wide(Hud._button("Início", false))
	_home.pressed.connect(func() -> void: leave_pressed.emit())
	buttons.add_child(_home)

	# Vendo o campo: só o botão para voltar ao resultado, embaixo no meio (o resto da tela fica livre).
	_back = Hud._button("Voltar ao resultado", true)
	_back.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_back.offset_left = -150
	_back.offset_right = 150
	_back.offset_top = -86
	_back.offset_bottom = -30
	_back.visible = false
	_back.pressed.connect(func() -> void: _show_table(false))
	add_child(_back)


## A cada estado: guarda os eventos (para o destaque) e mostra a tela no fim do jogo (fora do sideboard da melhor de três).
func apply_state(state: Dictionary) -> void:
	_recap.observe(state)
	if state.get("room") is Dictionary:
		room = state["room"]
	var series: Dictionary = state.get("match", {}) if state.get("match") is Dictionary else {}
	var over: bool = bool(state.get("gameOver", false)) and Txt.of(series.get("phase")) != "sideboarding"
	if not over:
		visible = false
		_shown_key = ""
		_rematch_sent = false
		if _glow:
			_glow.kill()
		return
	_state = state
	var key: String = "%s:%s" % [Txt.of(series.get("gameNumber", 1)), Txt.of(state.get("matchId"))]
	if key != _shown_key:
		_shown_key = key
		_set_table_view(false)
		_fill()
		_enter()
	else:
		_refresh_buttons()
	visible = true
	move_to_front()


func _fill() -> void:
	var r: Dictionary = GameResult.result(_state)
	_title.text = Txt.of(r["title"])
	var tone: Color = TONES.get(r["tone"], GOLD)
	_title.add_theme_color_override("font_color", tone)
	_backdrop_material.set_shader_parameter("tint", Color(0.05, 0.04, 0.02) if r["tone"] == "win" else (Color(0.06, 0.02, 0.04) if r["tone"] == "lose" else Color(0.02, 0.03, 0.06)))
	_detail.text = Txt.of(r["detail"])
	_reason.text = Txt.of(r["reason"])
	_reason.visible = _reason.text != ""

	for child: Node in _ribbons.get_children():
		child.queue_free()
		_ribbons.remove_child(child)
	for t: Dictionary in GameResult.ending_titles(_state):
		_ribbons.add_child(_ribbon(t))
	_ribbons.visible = _ribbons.get_child_count() > 0

	for child: Node in _tiles.get_children():
		child.queue_free()
		_tiles.remove_child(child)
	for h: Dictionary in GameResult.highlights(_state):
		_tiles.add_child(_tile(int(h["value"]), Txt.of(h["label"])))
	_tiles.visible = _tiles.get_child_count() > 0

	var has_chart: bool = _chart.set_state(_state)
	_fill_table()
	var has_table: bool = _table.get_child_count() > 0
	_chart.visible = has_chart
	_table_box.visible = not has_chart and has_table
	_toggle.visible = has_table
	_toggle.text = "Ver todos os números" if _chart.visible or not has_table else "Ver gráfico de vida"
	if not has_chart:
		_toggle.visible = false

	var label: Callable = func(n: String) -> String: return catalog.label(n) if catalog else n
	var best: Dictionary = _recap.highlight(_state, label)
	_highlight.visible = not best.is_empty()
	if not best.is_empty():
		_highlight_kind.text = "Destaque do jogo · %s" % best["kind"]
		_highlight_text.text = Txt.of(best["text"])
		var card: Dictionary = best["card"]
		var tex: Texture2D = catalog.texture(catalog.image_url_for(card)) if catalog and not card.is_empty() else null
		_highlight_art.texture = tex
		_highlight_art.visible = tex != null
	_refresh_buttons()


## Botão da revanche como na mesa do navegador: "Jogar de novo" contra o computador; em rede, pedir, aceitar ou esperar.
func _refresh_buttons() -> void:
	var watching: bool = bool(_state.get("watching", false))
	var notes: PackedStringArray = []
	_rematch.visible = not watching
	_rematch.disabled = false
	if room.is_empty():
		_rematch.text = "Recomeçando…" if _rematch_sent else "Jogar de novo"
		_rematch.disabled = _rematch_sent
	else:
		var players: Array = room.get("players", []) if room.get("players") is Array else []
		var seat: int = int(room.get("seat", 0))
		var others: Array = []
		var mine: Dictionary = {}
		for i: int in players.size():
			if i == seat:
				mine = players[i]
			else:
				others.append(players[i])
		for other: Variant in others:
			var o: Dictionary = other
			if not bool(o.get("connected", false)):
				notes.append("%s saiu da sala." % Txt.of(o.get("name")))
			elif bool(o.get("rematch", false)):
				notes.append("%s quer jogar de novo." % Txt.of(o.get("name")))
		var gone: bool = others.is_empty() or others.any(func(o: Variant) -> bool: return not bool((o as Dictionary).get("connected", false)))
		_rematch.visible = not watching and not gone
		if bool(mine.get("rematch", false)) or _rematch_sent:
			_rematch.text = "Aguardando os jogadores…" if others.size() > 1 else "Aguardando o oponente…"
			_rematch.disabled = true
		else:
			_rematch.text = "Aceitar revanche" if others.any(func(o: Variant) -> bool: return bool((o as Dictionary).get("rematch", false))) else "Pedir revanche"
	_note.text = "\n".join(notes)
	_note.visible = _note.text != ""


## A tabela com todos os números: uma coluna por jogador, o maior de cada linha em dourado.
func _fill_table() -> void:
	for child: Node in _table.get_children():
		child.queue_free()
		_table.remove_child(child)
	var data: Dictionary = GameResult.stats_table(_state)
	if data.is_empty():
		return
	var players: Array = data["players"]
	_table.columns = players.size() + 1
	_table.add_child(Hud._label(14, Color.TRANSPARENT))
	for name: Variant in players:
		var head := Hud._label(15, Color(1, 1, 1, 0.85))
		head.text = Txt.of(name)
		head.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		head.custom_minimum_size = Vector2(110, 0)
		_table.add_child(head)
	for g: Dictionary in data["groups"]:
		var title := Hud._label(14, GOLD)
		title.text = Txt.of(g["title"]).to_upper()
		_table.add_child(title)
		for i: int in players.size():
			_table.add_child(Control.new())
		for row: Dictionary in g["rows"]:
			var name := Hud._label(15, Color(1, 1, 1, 0.55 if bool(row["sub"]) else 0.8))
			name.text = ("    " if bool(row["sub"]) else "") + Txt.of(row["label"])
			name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			_table.add_child(name)
			var values: Array = row["values"]
			for i: int in values.size():
				var cell := Hud._label(16, GOLD if i == int(row["top"]) else Color(1, 1, 1, 0.85))
				cell.text = "–" if int(values[i]) < 0 else str(int(values[i]))
				cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
				_table.add_child(cell)


func _toggle_numbers() -> void:
	var to_table: bool = _chart.visible
	_chart.visible = not to_table
	_table_box.visible = to_table
	_toggle.text = "Ver gráfico de vida" if to_table else "Ver todos os números"
	if not to_table:
		_chart.play(0.6)


## Esconde a tela para ver a mesa (com o botão para voltar) ou volta a ela, entrando de novo.
func _show_table(on: bool) -> void:
	_set_table_view(on)
	if not on:
		_enter(0.6)


func _set_table_view(on: bool) -> void:
	_showing_table = on
	_back.visible = on
	_backdrop.visible = not on
	_column.get_parent().visible = not on
	mouse_filter = Control.MOUSE_FILTER_IGNORE if on else Control.MOUSE_FILTER_STOP


## A entrada: o fundo desfoca, o título cai grande e encolhe até o lugar, e o resto sobe em sequência.
func _enter(speed: float = 1.0) -> void:
	_backdrop_material.set_shader_parameter("amount", 0.0)
	var fade := create_tween()
	fade.tween_method(func(v: float) -> void: _backdrop_material.set_shader_parameter("amount", v), 0.0, 1.0, 0.5 * speed)
	_title.pivot_offset = Vector2(_column.custom_minimum_size.x / 2.0, 70)
	_title.scale = Vector2(1.7, 1.7)
	_title.modulate.a = 0.0
	var title := create_tween().set_parallel(true)
	title.tween_property(_title, "modulate:a", 1.0, 0.25 * speed).set_delay(0.15 * speed)
	title.tween_property(_title, "scale", Vector2.ONE, 0.55 * speed).set_delay(0.15 * speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var delay: float = 0.55 * speed
	for node: Control in [_ribbons, _detail, _reason, _tiles, _toggle, _chart, _table_box, _highlight, _note, _rematch.get_parent()]:
		if not node.visible:
			continue
		node.modulate.a = 0.0
		var tween := create_tween()
		tween.tween_interval(delay)
		tween.tween_property(node, "modulate:a", 1.0, 0.3 * speed)
		delay += 0.09 * speed
		if node is HBoxContainer and node == _tiles:
			_pop_tiles(delay)
	if _chart.visible:
		_chart.play(0.9 * speed, delay - 0.3 * speed)
	# O título respira devagar depois de entrar.
	if _glow:
		_glow.kill()
	_glow = create_tween().set_loops()
	_glow.tween_interval(0.8)
	_glow.tween_property(_title, "self_modulate", Color(1.15, 1.12, 1.05), 1.2).set_trans(Tween.TRANS_SINE)
	_glow.tween_property(_title, "self_modulate", Color.WHITE, 1.2).set_trans(Tween.TRANS_SINE)


## Os números sobem contando, um depois do outro.
func _pop_tiles(delay: float) -> void:
	var i: int = 0
	for tile: Node in _tiles.get_children():
		var value: Label = tile.find_child("Value", true, false)
		var target: int = int(value.get_meta("value", 0))
		# O tween é do próprio número: some junto com ele quando a tela é refeita.
		var tween := value.create_tween()
		tween.tween_interval(delay + i * 0.08)
		tween.tween_method(func(v: float) -> void: value.text = str(roundi(v)), 0.0, float(target), 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		i += 1


func _tile(value: int, label: String) -> PanelContainer:
	var tile := PanelContainer.new()
	tile.add_theme_stylebox_override("panel", _box(Color(0.06, 0.08, 0.14, 0.92), Color(1, 1, 1, 0.12)))
	tile.custom_minimum_size = Vector2(170, 0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	tile.add_child(column)
	var number := Hud._label(40, GOLD)
	number.name = "Value"
	number.text = str(value)
	number.set_meta("value", value)
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(number)
	var caption := Hud._label(15, Color(1, 1, 1, 0.7))
	caption.text = label
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(caption)
	return tile


## A faixa da virada (dourada) ou do "por um fio" (rosa, com o coração).
func _ribbon(t: Dictionary) -> PanelContainer:
	var thread: bool = Txt.of(t["kind"]) == "thread"
	var color: Color = Color("#ff7a8a") if thread else GOLD
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _box(Color(color.r * 0.18, color.g * 0.14, color.b * 0.12, 0.92), color))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	panel.add_child(column)
	var title := Hud._label(28, color)
	title.text = ("♥ " if thread else "") + Txt.of(t["title"])
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	var detail := Hud._label(15, Color(1, 1, 1, 0.8))
	detail.text = Txt.of(t["detail"])
	detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(detail)
	if thread:
		# O coração bate devagar.
		title.pivot_offset = Vector2(60, 18)
		var beat := title.create_tween().set_loops()
		beat.tween_property(title, "scale", Vector2(1.06, 1.06), 0.18)
		beat.tween_property(title, "scale", Vector2.ONE, 0.32)
		beat.tween_interval(0.7)
	return panel


static func _box(color: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(14)
	style.border_color = border
	style.set_border_width_all(1)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


static func _wide(button: Button) -> Button:
	button.custom_minimum_size = Vector2(220, 54)
	return button
