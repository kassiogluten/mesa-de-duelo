# A caixa de ação do HUD: o pedido em destaque, o detalhe e o andamento com os símbolos de mana desenhados, os botões
# (o principal com o atalho Espaço), a espera calma com o nome de quem decide, a borda dourada que corre quando a vez é
# sua, o pulso a cada decisão nova e a altura que acompanha o conteúdo sem pular.
class_name ActionPanel
extends Control

## Um botão foi apertado: a mensagem pronta para o servidor ({type:"ok", gen}…).
signal action(message: Dictionary)

const WIDTH := 340.0
const PAD_X := 18.0
const PAD_TOP := 14.0
const PAD_BOTTOM := 16.0
const INNER := WIDTH - PAD_X * 2.0
const RADIUS := 4.0
## Texto do Forge muito longo vira reticências (a carta inteira está no inspetor).
const DETAIL_MAX := 300
const HEADINGS := {"mulligan": "Manter esta mão?", "starting-player": "Quem começa a partida?", "play-draw": "Você ganhou o sorteio: jogar primeiro?"}

var catalog: CardCatalog
## Onde fica o canto de baixo à direita da caixa (o HUD acerta: sobe acima da mão quando ela chega até aqui).
var corner: Vector2 = Vector2(-1, -1)

var _clip: Control
var _column: VBoxContainer
var _short: RichTextLabel
var _detail: RichTextLabel
var _progress: RichTextLabel
var _forecast: RichTextLabel
var _wait_row: HBoxContainer
var _spinner: WaitSpinner
var _wait_label: Label
var _buttons_box: VBoxContainer
var _primary: Dictionary = {}
var _shown: bool = false
## A vez é sua: há um botão ligado (a borda acende e corre).
var _active: bool = false
var _height: float = 0.0
var _glow: float = 0.0
var _flash: float = 0.0
var _time: float = 0.0
var _key: String = ""
var _short_text: String = ""
var _bg: StyleBoxFlat
var _halo: StyleBoxFlat
var _edge: StyleBoxFlat


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	modulate.a = 0.0
	visible = false
	_bg = HudStyle.panel(HudStyle.PANEL_BG, int(RADIUS))
	_bg.shadow_color = Color(0, 0, 0, 0.45)
	_bg.shadow_size = 18
	_bg.shadow_offset = Vector2(0, 5)
	_halo = StyleBoxFlat.new()
	_halo.bg_color = Color(0, 0, 0, 0)
	_halo.set_corner_radius_all(int(RADIUS))
	_halo.shadow_size = 16
	_edge = StyleBoxFlat.new()
	_edge.draw_center = false
	_edge.set_corner_radius_all(int(RADIUS))
	_edge.set_border_width_all(1)
	_edge.anti_aliasing = true
	_clip = Control.new()
	_clip.clip_contents = true
	_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_clip)
	_column = VBoxContainer.new()
	_column.add_theme_constant_override("separation", 8)
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clip.add_child(_column)
	_short = HudStyle.rich_label(HudStyle.SIZE_TITLE, HudStyle.TEXT, INNER, true)
	_column.add_child(_short)
	_detail = HudStyle.rich_label(HudStyle.SIZE_SMALL, HudStyle.TEXT_DIM, INNER)
	_column.add_child(_detail)
	_progress = HudStyle.rich_label(HudStyle.SIZE_BODY, HudStyle.GOLD, INNER)
	_column.add_child(_progress)
	_forecast = HudStyle.rich_label(HudStyle.SIZE_BODY, Color(1, 0.75, 0.6), INNER)
	_column.add_child(_forecast)
	_wait_row = HBoxContainer.new()
	_wait_row.add_theme_constant_override("separation", 12)
	_wait_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spinner = WaitSpinner.new()
	_spinner.color = Color(HudStyle.GOLD, 0.8)
	_wait_row.add_child(_spinner)
	_wait_label = HudStyle.label(HudStyle.SIZE_BODY, HudStyle.TEXT_SOFT)
	_wait_label.add_theme_constant_override("outline_size", 0)
	_wait_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_wait_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_wait_row.add_child(_wait_label)
	_column.add_child(_wait_row)
	_buttons_box = VBoxContainer.new()
	_buttons_box.add_theme_constant_override("separation", 8)
	_column.add_child(_buttons_box)


## A mensagem do botão principal ligado ({} se não há), para o Espaço.
func primary_message() -> Dictionary:
	return _primary


## A caixa está à vista (ou chegando).
func showing() -> bool:
	return _shown


## O retângulo da caixa na tela (vazio quando escondida), para os avisos não ficarem por cima.
func box_rect() -> Rect2:
	return Rect2(position, size) if _shown else Rect2()


## Texto e botões da caixa de ação, pelas mesmas regras da mesa do navegador (text/action_box.gd).
func apply(state: Dictionary, blocker_name: String) -> void:
	var translate: Callable = func(name: String) -> String: return catalog.label(name) if catalog else name
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var info: Dictionary = ActionBox.text(state, blocker_name, translate)
	var opening: Variant = input.get("opening")
	var heading: String = Txt.of(HEADINGS.get(opening, "")) if opening != null else ""
	var short: String = Txt.of(info["short"]) if Txt.of(info["short"]) != "" else heading
	var detail: String = Txt.of(info["detail"])
	if input.get("tapToPay") is Dictionary and short == "":
		# Convocar e afins: o título em destaque e a explicação embaixo (o nome da carta já em português).
		var lines: PackedStringArray = detail.split("\n", false, 1)
		short = lines[0] if not lines.is_empty() else ""
		detail = lines[1] if lines.size() > 1 else ""
	var title: String = short if short != "" else detail
	# Com a frase curta em português, o texto do jogo (às vezes em inglês, "Select target creature") fica escondido,
	# como na mesa do navegador: aparece só ao passar o mouse no pedido.
	var below: String = ""
	if Txt.of(info["short"]) == "" and short != "" and detail != short:
		below = detail
	_short.tooltip_text = detail if Txt.of(info["short"]) != "" and detail != short else ""
	_short.mouse_filter = Control.MOUSE_FILTER_STOP if _short.tooltip_text != "" else Control.MOUSE_FILTER_IGNORE
	var progress: String = ("%s · %s" % [info["progress"], info["instruction"]]) if Txt.of(info["progress"]) != "" else ""
	var forecast: String = Txt.of(info.get("forecast"))
	_set_text(_short, title)
	if title != _short_text:
		_short_text = title
		_short.modulate.a = 0.0
		_short.create_tween().tween_property(_short, "modulate:a", 1.0, 0.18)
	_set_text(_detail, _clamp_text(below))
	_set_text(_progress, progress)
	_set_text(_forecast, forecast)
	var list: Array = ActionBox.buttons(state, translate)
	var waiting: bool = list.size() == 1 and ((list[0] as Dictionary).get("message", {}) as Dictionary).is_empty()
	_wait_row.visible = waiting
	_wait_label.text = Txt.of((list[0] as Dictionary)["label"]) if waiting else ""
	_build_buttons([] if waiting else list)
	_active = not waiting and list.any(func(b: Dictionary) -> bool: return bool(b.get("enabled", false)) and not (b.get("message", {}) as Dictionary).is_empty())
	var shown: bool = title != "" or not list.is_empty()
	if shown and not _shown:
		_height = 0.0
	_shown = shown
	# Decisão nova (outro pedido ou outros botões) com a vez sua: a caixa pulsa uma vez.
	var labels: PackedStringArray = PackedStringArray(list.map(func(b: Dictionary) -> String: return Txt.of(b.get("label"))))
	var key: String = "%s|%s|%s" % [Txt.of(input.get("gen")), title, ",".join(labels)]
	if key != _key:
		_key = key
		if _active:
			pulse()


## A caixa cresce de leve e o aro acende (uma decisão nova chegou).
func pulse() -> void:
	_flash = 1.0
	pivot_offset = Vector2(size.x / 2.0, size.y)
	scale = Vector2.ONE * 1.035
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _set_text(node: RichTextLabel, text: String) -> void:
	node.visible = text != ""
	if node.get_meta("text", "") != text:
		node.set_meta("text", text)
		HudStyle.set_rich_text(node, text)


static func _clamp_text(text: String) -> String:
	if text.length() <= DETAIL_MAX:
		return text
	var cut: int = text.rfind(" ", DETAIL_MAX)
	return text.substr(0, cut if cut > 0 else DETAIL_MAX).strip_edges() + "…"


func _build_buttons(list: Array) -> void:
	for child: Node in _buttons_box.get_children():
		_buttons_box.remove_child(child)
		child.queue_free()
	_primary = {}
	var row: HBoxContainer = null
	for entry: Variant in list:
		var spec: Dictionary = entry
		var message: Dictionary = spec.get("message", {})
		var primary: bool = bool(spec.get("primary", false))
		var button: Button = make_button(Txt.of(spec["label"]), primary)
		button.disabled = not bool(spec.get("enabled", false)) or message.is_empty()
		button.pressed.connect(func() -> void: action.emit(message))
		if primary and not button.disabled:
			_primary = message
			_add_keycap(button)
		# Os pequenos ("Sempre não", "Sempre sim") lado a lado, numa fileira.
		if bool(spec.get("small", false)):
			button.custom_minimum_size = Vector2(0, 36)
			button.add_theme_font_size_override("font_size", HudStyle.SIZE_SMALL)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if row == null:
				row = HBoxContainer.new()
				row.add_theme_constant_override("separation", 8)
				_buttons_box.add_child(row)
			row.add_child(button)
			continue
		row = null
		_buttons_box.add_child(button)
	_buttons_box.visible = _buttons_box.get_child_count() > 0


## Um botão da caixa: o visual da mesa, um realce ao passar o mouse e os símbolos de mana desenhados no rótulo.
static func make_button(text: String, primary: bool) -> Button:
	var button: Button = HudStyle.button(text, primary)
	# Texto longo demais vira reticências em vez de alargar a caixa.
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	if primary:
		button.add_theme_font_override("font", HudStyle.bold_font())
	if HudStyle.has_symbols(text):
		button.text = ""
		button.tooltip_text = text
		var rich := HudStyle.rich_label(20, HudStyle.INK if primary else Color.WHITE, 0.0, primary)
		rich.fit_content = false
		rich.remove_theme_constant_override("outline_size")
		rich.add_theme_constant_override("outline_size", 0)
		rich.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		rich.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		rich.push_paragraph(HORIZONTAL_ALIGNMENT_CENTER)
		ManaSymbols.append_rich(rich, text, 20)
		rich.pop()
		button.add_child(rich)
	var ref: WeakRef = weakref(button)
	button.mouse_entered.connect(func() -> void: _hover(ref, true))
	button.mouse_exited.connect(func() -> void: _hover(ref, false))
	return button


static func _hover(ref: WeakRef, on: bool) -> void:
	var button: Button = ref.get_ref()
	if button == null or (button.disabled and on):
		return
	button.pivot_offset = button.size / 2.0
	var tween := button.create_tween()
	tween.tween_property(button, "scale", Vector2.ONE * (1.015 if on else 1.0), 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## A tecla "Espaço" no canto do botão principal. O texto fica no centro quando cabe ao lado dela; senão sai do centro
## e, se ainda for longo, a letra diminui um pouco (o botão nunca passa da largura da caixa).
static func _add_keycap(button: Button) -> void:
	var cap_w: float = 56.0
	var font: Font = button.get_theme_font("font") if button.has_theme_font_override("font") else ThemeDB.fallback_font
	var text: String = button.text if button.text != "" else button.tooltip_text
	var size: int = button.get_theme_font_size("font_size")
	var text_w: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	if text_w / 2.0 + cap_w + 14.0 > INNER / 2.0:
		var room: float = INNER - (cap_w + 22.0) - 14.0 - 4.0
		while text_w > room and size > 15:
			size -= 1
			text_w = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		if text_w > room:
			return
		button.add_theme_font_size_override("font_size", size)
		for state_name: String in ["normal", "hover", "pressed", "disabled"]:
			var style: StyleBox = button.get_theme_stylebox(state_name).duplicate()
			style.content_margin_right = cap_w + 22.0
			style.content_margin_left = 14.0
			button.add_theme_stylebox_override(state_name, style)
	var cap: PanelContainer = HudStyle.keycap("Espaço", true)
	cap.anchor_left = 1.0
	cap.anchor_right = 1.0
	cap.anchor_top = 0.5
	cap.anchor_bottom = 0.5
	cap.offset_left = -14.0
	cap.offset_right = -14.0
	cap.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	cap.grow_vertical = Control.GROW_DIRECTION_BOTH
	button.add_child(cap)


func _process(delta: float) -> void:
	_time += delta
	var target_alpha: float = 1.0 if _shown else 0.0
	modulate.a = move_toward(modulate.a, target_alpha, delta * 7.0)
	visible = modulate.a > 0.01
	if not visible:
		return
	# A altura segue o conteúdo suavemente; os botões ficam parados embaixo e o texto se revela em cima.
	var column_h: float = _column.get_combined_minimum_size().y
	var target: float = column_h + PAD_TOP + PAD_BOTTOM
	_height = target if _height <= 0.0 else lerpf(_height, target, 1.0 - exp(-delta * 16.0))
	if absf(_height - target) < 0.5:
		_height = target
	size = Vector2(WIDTH, _height)
	if corner.x >= 0.0:
		position = corner - size
	_clip.position = Vector2(PAD_X, PAD_TOP)
	_clip.size = Vector2(INNER, maxf(0.0, _height - PAD_TOP - PAD_BOTTOM))
	_column.size = Vector2(INNER, column_h)
	_column.position = Vector2(0.0, _clip.size.y - column_h)
	_glow = move_toward(_glow, 1.0 if _active else 0.0, delta * 3.0)
	_flash = maxf(0.0, _flash - delta * 1.8)
	queue_redraw()


func _draw() -> void:
	var rect := Rect2(Vector2.ZERO, size)
	var breathe: float = 0.5 + 0.5 * sin(_time * 2.2)
	var halo: float = _glow * (0.12 + 0.1 * breathe) + _flash * 0.45
	if halo > 0.01:
		_halo.shadow_color = Color(HudStyle.GOLD, halo)
		_halo.shadow_size = int(14 + 10 * _flash)
		draw_style_box(_halo, rect)
	draw_style_box(_bg, rect)
	var dim := Color(1, 1, 1, 0.1)
	var lit := Color(HudStyle.GOLD, 0.55 + 0.15 * breathe)
	_edge.border_color = dim.lerp(lit, clampf(_glow + _flash, 0.0, 1.0))
	draw_style_box(_edge, rect)
	if _glow > 0.01:
		_draw_comet(rect.grow(-0.5), _glow)


## Um brilho que corre devagar pela borda enquanto a vez é sua.
func _draw_comet(rect: Rect2, strength: float) -> void:
	var r: float = minf(RADIUS, minf(rect.size.x, rect.size.y) / 2.0)
	var total: float = _perimeter(rect, r)
	if total <= 0.0:
		return
	var head: float = fposmod(_time * 0.16, 1.0) * total
	var length: float = total * 0.2
	var points: PackedVector2Array = []
	var colors: PackedColorArray = []
	var steps: int = 28
	for i: int in steps + 1:
		var f: float = float(i) / steps
		points.append(_perimeter_point(rect, r, head - length * (1.0 - f)))
		colors.append(Color(HudStyle.GOLD_SOFT, f * f * 0.9 * strength))
	draw_polyline_colors(points, colors, 2.0, true)


static func _perimeter(rect: Rect2, r: float) -> float:
	return 2.0 * (rect.size.x - 2.0 * r) + 2.0 * (rect.size.y - 2.0 * r) + TAU * r


## O ponto a `s` de distância pela borda arredondada, no sentido do relógio a partir do canto de cima à esquerda.
static func _perimeter_point(rect: Rect2, r: float, s: float) -> Vector2:
	var w: float = rect.size.x - 2.0 * r
	var h: float = rect.size.y - 2.0 * r
	var arc: float = PI * r / 2.0
	s = fposmod(s, _perimeter(rect, r))
	var o: Vector2 = rect.position
	var pieces: Array = [w, arc, h, arc, w, arc, h, arc]
	for i: int in pieces.size():
		var piece: float = pieces[i]
		if s > piece and i < pieces.size() - 1:
			s -= piece
			continue
		var f: float = s / piece if piece > 0.0 else 0.0
		match i:
			0:
				return o + Vector2(r + w * f, 0.0)
			1:
				return o + Vector2(r + w, r) + Vector2.from_angle(-PI / 2.0 + f * PI / 2.0) * r
			2:
				return o + Vector2(rect.size.x, r + h * f)
			3:
				return o + Vector2(r + w, r + h) + Vector2.from_angle(f * PI / 2.0) * r
			4:
				return o + Vector2(r + w * (1.0 - f), rect.size.y)
			5:
				return o + Vector2(r, r + h) + Vector2.from_angle(PI / 2.0 + f * PI / 2.0) * r
			6:
				return o + Vector2(0.0, r + h * (1.0 - f))
			_:
				return o + Vector2(r, r) + Vector2.from_angle(PI + f * PI / 2.0) * r
	return o
