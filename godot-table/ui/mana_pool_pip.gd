# Um pip da reserva de mana no assento: o símbolo com a energia girando dentro, o halo com faíscas orbitando, o "×N" que
# sobe quicando, o aviso âmbar da mana que vai se perder e, pagando, o botão que gasta uma mana daquela cor.
class_name ManaPoolPip
extends Button

const HALO_SHADER := preload("res://ui/mana_pool_halo.gdshader")
const SWIRL_SHADER := preload("res://ui/mana_pool_swirl.gdshader")
## O retângulo do halo é o símbolo vezes isto (as faíscas orbitam por fora do disco).
const HALO_SCALE := 2.4
const GOLD := HudStyle.GOLD
const CHIP_BG := Color(0.06, 0.08, 0.13, 0.9)

## A cor da mana ("W", "U", "B", "R", "G", "C"…).
var color_key: String = ""
## Quanto há na reserva (o estado) e quanto ainda está voando até aqui: o número mostrado é a diferença.
var count: int = 0
var pending: int = 0
var mine: bool = false
var icon_size: int = 30
## Pagando: a mensagem que este pip manda ({type:"mana", color, gen}); {} fora do pagamento.
var message: Dictionary = {}

var _tint: Color = Color.WHITE
var _body: Control
var _icon: TextureRect
var _swirl: ColorRect
var _halo: ColorRect
var _count: Label
var _halo_mat: ShaderMaterial
var _swirl_mat: ShaderMaterial
var _hovering: bool = false
var _hover: float = 0.0
var _flash: float = 0.0
var _warn: float = 0.0
var _warn_target: float = 0.0
var _press: float = 0.0
var _pop: Tween
var _bounce: Tween


## Monta o pip de uma cor; `is_mine`: o seu assento (maior e mais vivo; o dos oponentes é menor e mais calmo).
func setup(color: String, is_mine: bool) -> void:
	color_key = color
	mine = is_mine
	icon_size = 34 if mine else 26
	_tint = ManaPoolFx.tint(color)
	focus_mode = Control.FOCUS_NONE
	flat = false
	clip_contents = false
	mouse_entered.connect(func() -> void: _hovering = true)
	mouse_exited.connect(func() -> void: _hovering = false)
	var phase: float = float(hash(color) % 97) / 97.0
	_halo = ColorRect.new()
	_halo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_halo_mat = ShaderMaterial.new()
	_halo_mat.shader = HALO_SHADER
	_halo_mat.set_shader_parameter("tint", _tint)
	_halo_mat.set_shader_parameter("core", 1.0 / HALO_SCALE)
	_halo_mat.set_shader_parameter("intensity", 1.0 if mine else 0.6)
	_halo_mat.set_shader_parameter("phase", phase)
	_halo.material = _halo_mat
	add_child(_halo)
	_body = Control.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_body)
	_icon = TextureRect.new()
	_icon.texture = SeatIcons.mana(color, icon_size)
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icon.size = Vector2(icon_size, icon_size)
	_body.add_child(_icon)
	_swirl = ColorRect.new()
	_swirl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_swirl_mat = ShaderMaterial.new()
	_swirl_mat.shader = SWIRL_SHADER
	_swirl_mat.set_shader_parameter("tint", _tint)
	_swirl_mat.set_shader_parameter("intensity", 1.0 if mine else 0.65)
	_swirl_mat.set_shader_parameter("phase", phase)
	_swirl.material = _swirl_mat
	_swirl.size = Vector2(icon_size, icon_size)
	_body.add_child(_swirl)
	_count = HudStyle.label(17 if mine else 15, Color.WHITE)
	_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_count.add_theme_constant_override("outline_size", 4)
	_count.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_body.add_child(_count)
	set_clickable({})


## O número de manas desta cor no estado novo (as que ainda voam continuam pendentes até chegar).
func set_count(n: int) -> void:
	count = maxi(n, 0)
	pending = clampi(pending, 0, count)
	_relayout()


## Pagando (message com algo): vira botão com a borda dourada; fora disso, só mostra (com o balão).
func set_clickable(msg: Dictionary) -> void:
	message = msg
	var clickable: bool = not msg.is_empty()
	disabled = not clickable
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if clickable else Control.CURSOR_ARROW
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		if not clickable:
			var empty := StyleBoxEmpty.new()
			empty.content_margin_left = 4
			empty.content_margin_right = 4
			add_theme_stylebox_override(state_name, empty)
			continue
		var fill: Color = CHIP_BG
		if state_name == "hover":
			fill = Color(0.22, 0.18, 0.08, 0.95)
		elif state_name == "pressed":
			fill = Color(0.04, 0.05, 0.08, 0.96)
		var style := StyleBoxFlat.new()
		style.bg_color = fill
		style.border_color = GOLD if state_name != "hover" else GOLD.lightened(0.3)
		style.set_border_width_all(2)
		style.set_corner_radius_all(int(icon_size * 0.6))
		style.content_margin_left = 8
		style.content_margin_right = 9
		if state_name == "hover":
			# O brilho na cor da mana em volta do botão: "toque aqui".
			style.shadow_color = Color(_tint.r, _tint.g, _tint.b, 0.55)
			style.shadow_size = 10
		add_theme_stylebox_override(state_name, style)
	_halo_mat.set_shader_parameter("shimmer", 1.0 if clickable else 0.0)
	_relayout()


## O aviso âmbar: você tem a prioridade e a mana se perde no fim da etapa.
func set_warn(on: bool) -> void:
	_warn_target = 1.0 if on else 0.0


## Quanto o número mostrado ainda não conta (manas voando para cá).
func shown_count() -> int:
	return maxi(count - pending, 0)


## O centro do símbolo na tela (onde as manas chegam e de onde saem).
func icon_center_global() -> Vector2:
	return global_position + _icon_origin() + Vector2(icon_size, icon_size) / 2.0


## O símbolo desta cor (para os fantasmas que somem no lugar do pip).
func icon_texture() -> Texture2D:
	return _icon.texture


func tint() -> Color:
	return _tint


## Chegou mana voando: o número sobe quicando, o símbolo cresce e acende.
func arrive(amount: int = 1) -> void:
	pending = maxi(pending - amount, 0)
	_flash = 1.0
	_relayout()
	_pop_body(1.38 if mine else 1.25, 0.42)
	_bounce_count(true)


## Gastou ou perdeu parte: o símbolo encolhe um instante e o número desce.
func squash() -> void:
	_relayout()
	_pop_body(0.8, 0.3)
	_bounce_count(false)


func _process(delta: float) -> void:
	var hovered: bool = _hovering and not disabled
	_hover = move_toward(_hover, 1.0 if hovered else (0.35 if _hovering else 0.0), delta * 6.0)
	_flash = maxf(_flash - delta * 2.2, 0.0)
	_warn = move_toward(_warn, _warn_target, delta * 1.5)
	var pressing: bool = not disabled and get_draw_mode() in [DRAW_PRESSED, DRAW_HOVER_PRESSED]
	_press = move_toward(_press, 1.0 if pressing else 0.0, delta * 18.0)
	var quality: int = Fx.quality
	_halo_mat.set_shader_parameter("hover", _hover)
	_halo_mat.set_shader_parameter("flash", _flash)
	_halo_mat.set_shader_parameter("warn", _warn)
	_halo_mat.set_shader_parameter("motes", 0.0 if quality == 0 else (3.0 if mine else 2.0) + (1.0 if quality >= 2 and mine else 0.0))
	_swirl_mat.set_shader_parameter("flash", _flash)
	_swirl.visible = quality > 0
	# Apertando: o símbolo afunda um pouco.
	_body.position = Vector2(0, 2.0 * _press)
	if _pop == null or not _pop.is_running():
		_body.scale = Vector2.ONE * (1.0 - 0.07 * _press + 0.06 * _hover * (1.0 if not disabled else 0.0))


func _icon_origin() -> Vector2:
	var left: float = get_theme_stylebox("normal").content_margin_left if has_theme_stylebox("normal") else 4.0
	return Vector2(maxf(left, 0.0), (size.y - icon_size) / 2.0)


## Posições do símbolo, do halo e do número, e o tamanho mínimo pelo número de verdade (o mostrado pode estar atrás).
func _relayout() -> void:
	if _icon == null:
		return
	var shown: int = shown_count()
	_count.text = "×%d" % shown if shown > 1 else ""
	var reserve: String = "×%d" % count if count > 1 else ""
	var font: Font = _count.get_theme_font("font")
	var font_size: int = _count.get_theme_font_size("font_size")
	var reserve_w: float = font.get_string_size(reserve, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x if reserve != "" and font else 0.0
	var style: StyleBox = get_theme_stylebox("normal")
	var margins: Vector2 = Vector2(style.content_margin_left + maxf(style.content_margin_right, 0.0), 6.0) if style else Vector2(8, 6)
	custom_minimum_size = Vector2(icon_size + (reserve_w + 3.0 if reserve_w > 0.0 else 0.0) + margins.x, icon_size + margins.y)
	var origin: Vector2 = _icon_origin()
	var h: float = maxf(size.y, custom_minimum_size.y)
	origin.y = (h - icon_size) / 2.0
	_icon.position = origin
	_swirl.position = origin
	_count.size = _count.get_combined_minimum_size()
	if _bounce == null or not _bounce.is_running():
		_count.position = Vector2(origin.x + icon_size + 2.0, (h - _count.size.y) / 2.0)
	_count.pivot_offset = Vector2(4, _count.size.y / 2.0)
	_body.pivot_offset = origin + Vector2(icon_size, icon_size) / 2.0
	var halo_side: float = icon_size * HALO_SCALE
	_halo.size = Vector2(halo_side, halo_side)
	_halo.position = origin + Vector2(icon_size, icon_size) / 2.0 - _halo.size / 2.0
	# Ainda sem nenhuma chegada: o lugar fica guardado, mas vazio (a primeira mana acende o pip).
	var empty: bool = shown <= 0
	_body.modulate.a = 0.0 if empty else 1.0
	_halo.modulate.a = 0.0 if empty else 1.0


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_relayout()


func _pop_body(peak: float, duration: float) -> void:
	if _pop and _pop.is_running():
		_pop.kill()
	_body.scale = Vector2.ONE * peak
	_pop = create_tween()
	_pop.tween_property(_body, "scale", Vector2.ONE, duration).set_trans(Tween.TRANS_BACK if peak > 1.0 else Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _bounce_count(up: bool) -> void:
	if _count.text == "":
		return
	if _bounce and _bounce.is_running():
		_bounce.kill()
	_count.scale = Vector2.ONE * (1.6 if up else 0.75)
	_count.position.y += -6.0 if up else 3.0
	_count.modulate = Color(1.6, 1.5, 1.1) if up else Color(0.8, 0.8, 0.85)
	var rest_y: float = (maxf(size.y, custom_minimum_size.y) - _count.size.y) / 2.0
	_bounce = create_tween().set_parallel()
	_bounce.tween_property(_count, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	_bounce.tween_property(_count, "position:y", rest_y, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_bounce.tween_property(_count, "modulate", Color.WHITE, 0.4)
