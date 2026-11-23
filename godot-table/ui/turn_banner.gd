# Faixa que atravessa o meio da tela ("Seu turno", "Ataque!"), com o acabamento da mesa do navegador (.banner de
# src/style.css): faixa escura que some nas pontas, filetes na cor em cima e embaixo, texto com brilho que abre do centro
# com as letras se aproximando, fica um instante e some crescendo de leve.
class_name TurnBanner
extends Control

const DURATION := 1.2
const HEIGHT := 112.0
## Faixa no alto: o centro fica nesta fração da altura da tela (acima do campo do oponente, longe do combate).
const TOP_CENTER := 0.19
const DARK := Color("#060912")

var _clip: Control
var _content: Control
var _font: FontVariation
var _t: float = 0.0
var _duration: float = DURATION


## Mostra a faixa por cima de `parent` (ela se apaga sozinha). `top` a põe no alto da tela, em vez do meio; `duration`
## (0 = a de sempre) encurta ou alonga.
static func play(parent: Control, text: String, color: Color, top: bool = false, duration: float = 0.0) -> TurnBanner:
	var banner := TurnBanner.new()
	banner._duration = duration if duration > 0.0 else DURATION
	parent.add_child(banner)
	banner._build(text, color)
	if top:
		banner.anchor_top = TOP_CENTER
		banner.anchor_bottom = TOP_CENTER
	return banner


func _build(text: String, color: Color) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_CENTER_LEFT)
	anchor_right = 1.0
	offset_top = -HEIGHT / 2.0
	offset_bottom = HEIGHT / 2.0
	offset_left = 0
	offset_right = 0
	_clip = Control.new()
	_clip.clip_contents = true
	_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_clip)
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clip.add_child(_content)
	var band := TextureRect.new()
	band.texture = _gradient([0.0, 0.3, 0.7, 1.0], [Color(DARK, 0.0), Color(DARK, 0.88), Color(DARK, 0.88), Color(DARK, 0.0)])
	band.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	band.stretch_mode = TextureRect.STRETCH_SCALE
	band.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_content.add_child(band)
	for top: bool in [true, false]:
		var line := TextureRect.new()
		line.texture = _gradient([0.0, 0.5, 1.0], [Color(color, 0.0), Color(color, 0.8), Color(color, 0.0)])
		line.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		line.stretch_mode = TextureRect.STRETCH_SCALE
		line.anchor_left = 0.15
		line.anchor_right = 0.85
		line.anchor_top = 0.0 if top else 1.0
		line.anchor_bottom = line.anchor_top
		line.offset_top = 0.0 if top else -2.0
		line.offset_bottom = 2.0 if top else 0.0
		_content.add_child(line)
	_font = FontVariation.new()
	_font.base_font = get_theme_default_font()
	_font.variation_embolden = 0.9
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label.add_theme_font_override("font", _font)
	label.add_theme_font_size_override("font_size", 56)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_shadow_color", Color(color, 0.5))
	label.add_theme_constant_override("shadow_outline_size", 22)
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", 0)
	label.add_theme_color_override("font_outline_color", color.darkened(0.82))
	label.add_theme_constant_override("outline_size", 4)
	_content.add_child(label)
	modulate.a = 0.0
	_step(0.0)


static func _gradient(offsets: Array, colors: Array) -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array(offsets)
	gradient.colors = PackedColorArray(colors)
	var tex := GradientTexture2D.new()
	tex.gradient = gradient
	tex.width = 256
	tex.height = 1
	return tex


func _process(delta: float) -> void:
	_t += delta
	_step(_t)
	if _t >= _duration:
		queue_free()


## O quadro da animação no tempo `t` (keyframes de @keyframes banner: abre até 18%, fica até 75%, some crescendo).
func _step(t: float) -> void:
	var p: float = clampf(t / _duration, 0.0, 1.0)
	var width: float = size.x if size.x > 0.0 else get_viewport_rect().size.x
	var open: float = ease(clampf(p / 0.18, 0.0, 1.0), 0.35)
	_clip.size = Vector2(width * open, HEIGHT)
	_clip.position = Vector2(width * (1.0 - open) / 2.0, 0.0)
	_content.size = Vector2(width, HEIGHT)
	_content.position = Vector2(-_clip.position.x, 0.0)
	# As letras chegam espaçadas (0,3 em) e se juntam (0,08 em).
	_font.set_spacing(TextServer.SPACING_GLYPH, int(lerpf(17.0, 4.0, open)))
	var fade: float = clampf((p - 0.75) / 0.25, 0.0, 1.0)
	modulate.a = open * (1.0 - fade)
	pivot_offset = Vector2(width / 2.0, HEIGHT / 2.0)
	scale = Vector2.ONE * (1.0 + 0.04 * fade)
