# Relógios do topo da partida (porte de src/ui/tableClocks.ts e turnInfoHTML de phaseHud.ts): duração da partida, o
# número do turno na cor de quem joga (com "+" no turno extra), o tempo do turno, o relógio de espera e o dia/noite.
class_name TurnClocks
extends HBoxContainer

var _match_chip: PanelContainer
var _match_time: Label
var _turn_chip: PanelContainer
var _badge: Label
var _turn_time: Label
var _wait_chip: PanelContainer
var _wait_name: Label
var _wait_time: Label
var _day_night: TextureRect
var _state: Dictionary = {}
## Quando (Time.get_ticks_msec) começaram o turno e o jogo, no relógio local.
var _turn_key: String = ""
var _turn_since: float = 0.0
var _game_since: float = 0.0
## O servidor manda a duração do jogo (servidor antigo não manda: o relógio da partida some).
var _has_game: bool = false
var _game_number: int = 0
## Jogador → quando começou a espera dele (relógio local).
var _wait_since: Dictionary = {}
var _tick: float = 0.0


func _ready() -> void:
	add_theme_constant_override("separation", 8)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_match_chip = chip()
	var match_row: HBoxContainer = _match_chip.get_child(0)
	match_row.add_child(HudIcons.rect(HudIcons.CLOCK, 18, Color(1, 1, 1, 0.7)))
	_match_time = _time_label()
	match_row.add_child(_match_time)
	add_child(_match_chip)

	_turn_chip = chip()
	var turn_row: HBoxContainer = _turn_chip.get_child(0)
	_badge = Label.new()
	_badge.add_theme_font_size_override("font_size", 16)
	_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_badge.custom_minimum_size = Vector2(28, 28)
	_badge.mouse_filter = Control.MOUSE_FILTER_PASS
	turn_row.add_child(_badge)
	_turn_time = _time_label()
	_turn_time.tooltip_text = "Tempo deste turno"
	_turn_time.mouse_filter = Control.MOUSE_FILTER_PASS
	turn_row.add_child(_turn_time)
	add_child(_turn_chip)

	_wait_chip = chip()
	var wait_row: HBoxContainer = _wait_chip.get_child(0)
	wait_row.add_child(HudIcons.rect(HudIcons.HOURGLASS, 18, Color.WHITE))
	_wait_name = _time_label()
	wait_row.add_child(_wait_name)
	_wait_time = _time_label()
	wait_row.add_child(_wait_time)
	_wait_chip.visible = false
	add_child(_wait_chip)

	_day_night = HudIcons.rect(HudIcons.SUN, 24, Color("#ffd27a"))
	_day_night.mouse_filter = Control.MOUSE_FILTER_PASS
	_day_night.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_day_night.visible = false
	add_child(_day_night)
	visible = false


## Um selo escuro arredondado com uma fileira dentro (o mesmo das pílulas do topo da mesa do navegador).
static func chip() -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.06, 0.1, 0.82)
	style.set_corner_radius_all(20)
	style.border_color = Color(1, 1, 1, 0.08)
	style.set_border_width_all(1)
	style.content_margin_left = 10
	style.content_margin_right = 14
	style.content_margin_top = 5
	style.content_margin_bottom = 5
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_PASS
	panel.custom_minimum_size = Vector2(0, 40)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(row)
	return panel


static func _time_label() -> Label:
	var label := Hud._label(16, Color(1, 1, 1, 0.9))
	label.add_theme_constant_override("outline_size", 0)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return label


func apply_state(state: Dictionary) -> void:
	# Só um estado novo reajusta os relógios: redesenhar com o mesmo (escolher um bloqueador) faria o tempo voltar.
	var fresh: bool = not is_same(state, _state)
	_state = state
	var now: float = Time.get_ticks_msec()
	var turn: int = int(state.get("turn", 0))
	var over: bool = bool(state.get("gameOver", false))
	visible = turn > 0
	if not visible:
		return
	var key: String = "%d:%s" % [turn, Txt.of(state.get("activePlayer"))]
	if key != _turn_key:
		_turn_key = key
		_turn_since = now
	if fresh and state.get("turnElapsedMs") != null:
		var since: float = now - float(state["turnElapsedMs"])
		if absf(since - _turn_since) > 2000.0:
			_turn_since = since
	var series: Dictionary = state.get("match") if state.get("match") is Dictionary else {}
	if series.get("elapsedMs") == null:
		_has_game = false
	elif fresh:
		var game_since: float = now - float(series["elapsedMs"])
		var number: int = int(series.get("gameNumber", 1))
		if number != _game_number or not _has_game or absf(game_since - _game_since) > 2000.0:
			_game_number = number
			_game_since = game_since
			_has_game = true
	if fresh:
		_wait_since = MatchText.sync_waits(state, _wait_since, now)
	var mine: bool = state.get("activePlayer") != null and int(state.get("activePlayer")) == int(state.get("you", -1))
	var extra: bool = bool(state.get("extraTurn", false)) and not over
	_badge.text = ("+%d" if extra else "%d") % turn
	var fill: Color = PhaseTrack.MINE if mine else PhaseTrack.THEIRS
	var badge_style := StyleBoxFlat.new()
	badge_style.bg_color = fill
	badge_style.set_corner_radius_all(14)
	badge_style.content_margin_left = 6
	badge_style.content_margin_right = 6
	if extra:
		badge_style.border_color = Color(1, 1, 1, 0.7)
		badge_style.set_border_width_all(2)
		badge_style.shadow_color = Color(1, 1, 1, 0.3)
		badge_style.shadow_size = 6
	_badge.add_theme_stylebox_override("normal", badge_style)
	_badge.add_theme_color_override("font_color", Color("#1b1203") if mine else Color.WHITE)
	var upcoming: String = "" if over else PhaseText.upcoming_turns_text(state)
	_badge.tooltip_text = " · ".join(PackedStringArray(["Turno %d · %s" % [turn, PhaseText.owner_text(state)], upcoming].filter(func(s: String) -> bool: return s != "")))
	_turn_time.visible = not over
	_match_chip.tooltip_text = "Duração do jogo %d" % _game_number if _game_number > 1 else "Duração da partida"
	var day_time: String = Txt.of(state.get("dayTime"))
	_day_night.visible = day_time != "" and not over
	if _day_night.visible:
		_day_night.texture = HudIcons.texture(HudIcons.SUN if day_time == "day" else HudIcons.MOON, 48)
		_day_night.modulate = Color("#ffd27a") if day_time == "day" else Color("#b9c6ff")
		_day_night.tooltip_text = PhaseText.day_night_text(state)
	_refresh(now)


func _process(delta: float) -> void:
	_tick += delta
	if _tick >= 0.25 and visible:
		_tick = 0.0
		_refresh(Time.get_ticks_msec())


func _refresh(now: float) -> void:
	if _state.is_empty():
		return
	var over: bool = bool(_state.get("gameOver", false))
	_match_chip.visible = _has_game and not over
	if _match_chip.visible:
		_match_time.text = MatchText.turn_time_text(now - _game_since)
	_turn_time.text = MatchText.turn_time_text(now - _turn_since)
	var wait: Dictionary = MatchText.longest_wait(_state, _wait_since, now)
	var stage: int = int(wait.get("stage", 0))
	_wait_chip.visible = stage >= 1
	if _wait_chip.visible:
		_wait_name.text = "Você" if bool(wait["mine"]) else Txt.of(wait["name"])
		_wait_time.text = MatchText.turn_time_text(float(wait["ms"]))
		_wait_chip.tooltip_text = MatchText.wait_clock_tip(wait)
		var color: Color = Color("#ffb84d") if stage == 1 else (Color("#ff9a3d") if stage == 2 else Color("#ff6a4d"))
		var pulse: float = 0.75 + 0.25 * sin(now / 220.0) if stage >= 2 else 1.0
		_wait_chip.modulate = Color(color.r, color.g, color.b, 1.0) * Color(pulse, pulse, pulse, 1.0)
