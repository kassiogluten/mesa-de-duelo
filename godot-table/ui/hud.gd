# O HUD por cima da mesa 3D: retratos com vida, menu, relógios e histórico no alto, trilha de fases, caixa de ação com
# os botões, avisos, faixas de turno e a carta ampliada.
class_name Hud
extends Control

## Um botão da caixa de ação foi apertado: a mensagem pronta para o servidor ({type:"ok", gen}…).
signal action(message: Dictionary)
signal player_clicked(player_id: int)
signal leave_pressed
## "Relatar um problema", do menu da partida ou da tela do resultado.
signal report_pressed
## "Atalhos de teclado", do menu da partida.
signal shortcuts_pressed
## Tocou num monte do assento ou no dano de comandante: abrir a janela de zona ("graveyard", "exile", "command", "damage", "hand").
signal zone_requested(player_id: int, zone: String)
## O jogador trocou o nível de passar (para guardar).
signal pass_level_changed(level: String)
## Opções trocadas no menu da partida (valem na hora).
signal effects_changed(level: String)
signal volume_changed(volume: float)

## Nome das etapas (STOP_STEPS de src/ui/opponentStops.ts).
const PHASES := {
	"UNTAP": "Desvirar", "UPKEEP": "Manutenção", "DRAW": "Compra", "MAIN1": "Principal 1",
	"COMBAT_BEGIN": "Início do combate", "COMBAT_DECLARE_ATTACKERS": "Atacantes", "COMBAT_DECLARE_BLOCKERS": "Bloqueadores",
	"COMBAT_FIRST_STRIKE_DAMAGE": "Dano de primeiro golpe", "COMBAT_DAMAGE": "Dano de combate", "COMBAT_END": "Fim do combate",
	"MAIN2": "Principal 2", "END_OF_TURN": "Etapa final", "CLEANUP": "Limpeza",
}
const GOLD := HudStyle.GOLD
## Largura da coluna da direita (caixa de ação e trilha de fases).
const RIGHT_COLUMN := ActionPanel.WIDTH
const TRACK_H := 48.0
## Folga entre a mão e a coluna da direita (e os selos do seu assento).
const HAND_GAP := 14.0
## Centro do seu retrato (medido do canto de baixo à esquerda), o lado dele e onde começa a coluna dos selos.
const MY_PORTRAIT := Vector2(99, -119)
const MY_SIDE := 130.0
const MY_COLUMN_LEFT := 99.0 + 65.0 + 14.0

var catalog: CardCatalog
## Onde fica na tela o retrato de um oponente (a mesa 3D responde); (-1, -1) para usar o canto de sempre.
var portrait_slot: Callable = func(_id: int) -> Vector2: return Vector2(-1, -1)
## Quantos jogadores há (retratos menores com mais de um oponente).
var player_count: Callable = func() -> int: return 2
## A faixa da tela ocupada pela sua mão (TableView.hand_rect); Rect2() se não se sabe. A coluna da direita sobe acima
## dela quando a mão chega até ali, e os selos do seu assento quebram a linha antes dela.
var hand_rect: Callable = func() -> Rect2: return Rect2()
## Onde fica na tela um ponto da mesa 3D (id de carta, "stack:<id>"); (-1, -1) se não está à mostra. A reserva de mana
## usa para a mana voar da permanente virada e até o que foi pago.
var table_point: Callable = func(_key: Variant) -> Vector2: return Vector2(-1, -1)

var _menu: MatchMenu
var _history_button: Button
var _clocks: TurnClocks
var _track: PhaseTrack
var _history: HistoryPanel
var _action: ActionPanel
var _preview: TextureRect
var _toasts: ToastStack
## Faixas de turno esperando a da vez acabar ([texto, cor]) e a que está passando.
var _banner_queue: Array = []
var _banner_ref: WeakRef = null
## Quanto a coluna da direita subiu para não cobrir a mão (suavizado).
var _lift: float = 0.0
var _portraits: Dictionary = {}
var _seats: Dictionary = {}
## A tela do fim do jogo (ui/result_screen.gd).
var _result: ResultScreen
var _bar: MatchBar
var _between: PanelContainer
var _between_label: Label
var _between_button: Button


func _ready() -> void:
	# Sob um CanvasLayer não há Control pai: as âncoras sozinhas deixariam o HUD com tamanho zero.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Alto à esquerda: menu, histórico e os relógios (duração, turno, tempo do turno, espera), como na mesa do navegador.
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.position = Vector2(HudStyle.MARGIN, 16)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(top)
	_menu = MatchMenu.new()
	_menu.action.connect(func(message: Dictionary) -> void: action.emit(message))
	_menu.leave_pressed.connect(func() -> void: leave_pressed.emit())
	_menu.report_pressed.connect(func() -> void: report_pressed.emit())
	_menu.shortcuts_pressed.connect(func() -> void: shortcuts_pressed.emit())
	_menu.pass_level_changed.connect(func(level: String) -> void: pass_level_changed.emit(level))
	_menu.effects_changed.connect(func(level: String) -> void: effects_changed.emit(level))
	_menu.volume_changed.connect(func(volume: float) -> void: volume_changed.emit(volume))
	top.add_child(_menu)
	_history_button = Button.new()
	_history_button.icon = HudIcons.texture(HudIcons.HISTORY, 40)
	_history_button.add_theme_constant_override("icon_max_width", 20)
	_history_button.tooltip_text = "Histórico da partida"
	HudStyle.style_chip_button(_history_button)
	_history_button.custom_minimum_size = Vector2(44, HudStyle.CHIP_H)
	_history_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	top.add_child(_history_button)
	_clocks = TurnClocks.new()
	top.add_child(_clocks)
	_bar = MatchBar.new()
	_bar.alignment = BoxContainer.ALIGNMENT_BEGIN
	_bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_bar.offset_left = -640
	_bar.offset_top = 16
	_bar.offset_right = -HudStyle.MARGIN
	_bar.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_bar.action.connect(func(message: Dictionary) -> void: action.emit(message))
	_bar.pass_level_changed.connect(func(level: String) -> void: pass_level_changed.emit(level))
	add_child(_bar)

	# Coluna da direita: a caixa de ação e, embaixo dela, a trilha de fases (onde o olho já está para passar a vez).
	# As duas se posicionam em _process (sobem acima da mão quando ela chega até ali).
	_action = ActionPanel.new()
	_action.catalog = catalog
	_action.action.connect(func(message: Dictionary) -> void: action.emit(message))
	add_child(_action)
	_track = PhaseTrack.new()
	_track.visible = false
	_track.action.connect(func(message: Dictionary) -> void: action.emit(message))
	add_child(_track)

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

	# Gaveta do histórico, à esquerda, abaixo do menu.
	_history = HistoryPanel.new()
	_history.catalog = catalog
	_history.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_history.offset_left = 24
	_history.offset_right = 24 + 460
	_history.offset_top = 68
	_history.offset_bottom = -200
	add_child(_history)
	_history_button.pressed.connect(func() -> void: _history.toggle())

	_toasts = ToastStack.new()
	add_child(_toasts)

	_result = ResultScreen.new()
	_result.catalog = catalog
	_result.action.connect(func(message: Dictionary) -> void: action.emit(message))
	_result.leave_pressed.connect(func() -> void: leave_pressed.emit())
	_result.report_pressed.connect(func() -> void: report_pressed.emit())
	add_child(_result)

	# Entre os jogos de uma melhor de três: seguir com o mesmo deck (trocar cartas com o sideboard fica para depois).
	_between = PanelContainer.new()
	var between_style := HudStyle.panel(Color(0.035, 0.05, 0.085, 0.96), 18)
	between_style.border_color = Color(HudStyle.GOLD, 0.35)
	between_style.set_border_width_all(1)
	between_style.shadow_color = Color(0, 0, 0, 0.5)
	between_style.shadow_size = 24
	between_style.content_margin_left = 32
	between_style.content_margin_right = 32
	between_style.content_margin_top = 26
	between_style.content_margin_bottom = 26
	_between.add_theme_stylebox_override("panel", between_style)
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
	_layout_right_column(delta)
	if not _banner_queue.is_empty() and (_banner_ref == null or _banner_ref.get_ref() == null):
		var next: Array = _banner_queue.pop_front()
		_banner_ref = weakref(TurnBanner.play(self, Txt.of(next[0]), next[1], bool(next[2]), float(next[3])))


## A coluna da direita encostada no canto de baixo; se a mão chega até ela, sobe para ficar acima das cartas.
func _layout_right_column(delta: float) -> void:
	var view: Vector2 = get_viewport_rect().size
	var right: float = view.x - HudStyle.MARGIN
	var left: float = right - RIGHT_COLUMN
	var hand: Rect2 = hand_rect.call()
	var needed: float = 0.0
	if hand.has_area() and hand.end.x + HAND_GAP > left:
		needed = maxf(0.0, (view.y - HudStyle.MARGIN) - (hand.position.y - 10.0))
	_lift = needed if absf(_lift - needed) < 0.5 else lerpf(_lift, needed, 1.0 - exp(-delta * 10.0))
	var track_bottom: float = view.y - HudStyle.MARGIN - _lift
	_track.position = Vector2(left, track_bottom - TRACK_H)
	_track.size = Vector2(RIGHT_COLUMN, TRACK_H)
	var action_bottom: float = (_track.position.y - 10.0) if _track.visible else track_bottom
	_action.corner = Vector2(right, action_bottom)


## A faixa da tela onde a mão cabe sem passar por baixo do HUD: entre o seu retrato e a coluna da direita. A mesa pode
## apertar o leque para caber nela (gancho para TableView._hand_transform: hoje a coluna sobe quando a mão chega nela).
func hand_area() -> Rect2:
	var view: Vector2 = get_viewport_rect().size
	var left: float = MY_COLUMN_LEFT + HAND_GAP
	var right: float = view.x - HudStyle.MARGIN - RIGHT_COLUMN - HAND_GAP
	return Rect2(left, view.y * 0.6, right - left, view.y * 0.4)


## `blocker_name`: a criatura escolhida para bloquear, enquanto falta o atacante.
func apply_state(state: Dictionary, blocker_name: String = "") -> void:
	var input: Dictionary = state.get("input", {})
	var you: int = int(state.get("you", 0))
	var active: Variant = state.get("activePlayer")
	_apply_action_box(state, blocker_name)
	_bar.apply_state(state)
	_menu.apply_state(state)
	_clocks.apply_state(state)
	_track.apply_state(state)
	_history.ingest(state)
	_apply_between(state)
	var selectable_players: Array = input.get("selectablePlayers", [])
	for raw: Variant in state.get("players", []):
		_update_portrait(raw as Dictionary, int((raw as Dictionary)["id"]) == you, selectable_players.has(int((raw as Dictionary)["id"])), active != null and int(active) == int((raw as Dictionary)["id"]), state)
	# A tela do fim do jogo vê todos os estados (guarda os eventos para o destaque do jogo) e aparece no fim.
	_result.apply_state(state)


## A sala da partida em rede (para o botão de revanche da tela do fim do jogo).
func set_room(room: Dictionary) -> void:
	_result.room = room


## Um aviso curto no meio da tela (ui/toast_stack.gd); `kind`: "info", "error", "success" ou "warning".
func show_toast(text: String, kind: String = "info") -> void:
	_toasts.show_toast(text, kind)


## Mostra a carta ampliada (null esconde).
func show_preview(tex: Texture2D) -> void:
	_preview.texture = tex
	_preview.visible = tex != null


## O centro do retrato de um jogador na tela (para as setas que miram jogadores); (-1, -1) se não há.
func portrait_center(player_id: int) -> Vector2:
	var portrait: Button = _portraits.get(player_id)
	return portrait.get_global_rect().get_center() if portrait else Vector2(-1, -1)


## O assento de um jogador (para os efeitos acharem os selos dele); null se não há.
func seat_panel(player_id: int) -> SeatPanel:
	return _seats.get(player_id)


## Onde está a caixa de ação na tela (vazio quando escondida): para quem precisa desviar dela.
func action_rect() -> Rect2:
	return _action.box_rect()


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


## Faixa que atravessa o meio da tela ("Seu turno", "Ataque!"), com o acabamento da mesa do navegador (ui/turn_banner.gd).
## Uma de cada vez: a que chega com outra passando espera ela acabar (no máximo duas na fila, as mais novas).
## `top` e `duration`: a faixa no alto e mais curta (a do ataque, para não cobrir o combate no meio da mesa).
func banner(text: String, color: Color, top: bool = false, duration: float = 0.0) -> void:
	if _banner_ref != null and _banner_ref.get_ref() != null:
		_banner_queue.append([text, color, top, duration])
		while _banner_queue.size() > 2:
			_banner_queue.pop_front()
		return
	_banner_ref = weakref(TurnBanner.play(self, text, color, top, duration))


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
	return _action.primary_message()


## Texto e botões da caixa de ação, pelas mesmas regras da mesa do navegador (ui/action_panel.gd, text/action_box.gd).
func _apply_action_box(state: Dictionary, blocker_name: String) -> void:
	_action.catalog = catalog
	_action.apply(state, blocker_name)


## O assento de cada jogador (ui/seat_panel.gd): retrato, selos, reserva e montes; o seu no canto de baixo.
func _update_portrait(player: Dictionary, mine: bool, selectable: bool, active: bool, state: Dictionary = {}) -> void:
	var id: int = int(player["id"])
	var seat: SeatPanel = _seats.get(id)
	if seat == null:
		seat = SeatPanel.new()
		seat.setup(id, mine)
		add_child(seat)
		# Atrás do resto do HUD: a carta ampliada e os avisos ficam por cima.
		move_child(seat, 0)
		seat.portrait_pressed.connect(func(pid: int) -> void: player_clicked.emit(pid))
		seat.zone_pressed.connect(func(pid: int, zone: String) -> void: zone_requested.emit(pid, zone))
		seat.mana_pressed.connect(func(message: Dictionary) -> void: action.emit(message))
		seat.mana_pool().table_point = func(key: Variant) -> Vector2: return table_point.call(key)
		_seats[id] = seat
		_portraits[id] = seat.portrait
	var crowded: bool = int(player_count.call()) > 2
	if mine:
		# Os selos ao lado do seu retrato quebram a linha antes de chegar na mão.
		var hand: Rect2 = hand_rect.call()
		var width: float = clampf(hand.position.x - MY_COLUMN_LEFT - HAND_GAP, 200.0, 520.0) if hand.has_area() else 260.0
		seat.place(MY_PORTRAIT, MY_SIDE, width)
	else:
		_place_opponent(seat, id, crowded)
	var translate: Callable = func(name: String) -> String: return catalog.label(name) if catalog else name
	seat.apply(player, state, selectable, active, translate)


## O retrato de um oponente no lugar dele na mesa (TableView.portrait_slot). O leque da mão do oponente fica à direita
## do retrato: os selos vão para a esquerda (duelo) ou para baixo do nome (Commander, onde a mão começa logo ao lado do
## retrato). Com a vista aproximada ou girada, o retrato não sai da tela: fica na borda.
func _place_opponent(seat: SeatPanel, id: int, crowded: bool) -> void:
	var side: float = 100.0 if crowded else 130.0
	var view: Vector2 = get_viewport_rect().size
	var slot: Vector2 = portrait_slot.call(id)
	# (-1, -1) é "a mesa não sabe": o meio de cima. Com zoom, o lugar dele pode cair fora da tela (x negativo).
	var center: Vector2 = Vector2(view.x / 2.0, 77) if slot == Vector2(-1, -1) else slot
	center = clamp_portrait(center, side, view)
	seat.place(center, side, 300.0 if crowded else 460.0, "below" if crowded else "left")


## O centro do retrato de um oponente dentro da tela (com a margem) e na metade de cima dela.
static func clamp_portrait(center: Vector2, side: float, view: Vector2) -> Vector2:
	var margin: float = side / 2.0 + 10.0
	# Em cima, o retrato pode encostar na borda (na vista padrão do duelo ele já fica quase lá).
	var top: float = side / 2.0
	return Vector2(clampf(center.x, margin, maxf(margin, view.x - margin)), clampf(center.y, top, maxf(top, view.y * 0.45)))


## A vista da mesa que o botão da barra do alto mostra e muda (table/table_camera.gd).
func set_view_rig(rig: TableCamera) -> void:
	_bar.view_picker.rig = rig


## A vista da mesa andou (zoom, ângulo): os retratos dos oponentes acompanham o lugar deles na mesa.
func follow_view() -> void:
	var crowded: bool = int(player_count.call()) > 2
	for id: Variant in _seats:
		var seat: SeatPanel = _seats[id]
		if not seat.mine:
			_place_opponent(seat, int(id), crowded)


## Atalhos para o estilo comum (outras telas chamam por aqui): ui/hud_style.gd.
static func _panel_style(color: Color, radius: int) -> StyleBoxFlat:
	return HudStyle.panel(color, radius)


static func _label(size: int, color: Color) -> Label:
	return HudStyle.label(size, color)


static func _button(text: String, primary: bool) -> Button:
	return HudStyle.button(text, primary)
