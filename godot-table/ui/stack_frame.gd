# A moldura de uma peça da pilha (cabeçalho, texto, pílula recolhida): borda fixa que segue um retângulo da tela e troca de
# cor com o item do topo, halo que respira só quando dá para responder e um clarão quando um item novo chega.
class_name StackFrame
extends ColorRect

const SHADER := preload("res://ui/stack_frame.gdshader")
const PAD := 18.0

var _material := ShaderMaterial.new()
var _color: Color = StackStyle.GOLD
var _goal: Color = StackStyle.GOLD
var _glow: float = 0.0
var _color_tween: Tween
var _glow_tween: Tween
var _flash_tween: Tween


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	color = Color.WHITE
	_material.shader = SHADER
	_material.set_shader_parameter("pad", PAD)
	_material.set_shader_parameter("color", _color)
	_material.set_shader_parameter("glow", 0.0)
	_material.set_shader_parameter("flash", 0.0)
	material = _material


## Põe a moldura em volta de `rect` (coordenadas do pai) com cantos de `radius`; `border` é quanto a borda fixa aparece.
func wrap(rect: Rect2, radius: float, border: float = 0.55) -> void:
	position = rect.position - Vector2(PAD, PAD)
	size = rect.size + Vector2(PAD, PAD) * 2.0
	_material.set_shader_parameter("box", rect.size)
	_material.set_shader_parameter("radius", minf(radius, minf(rect.size.x, rect.size.y) / 2.0))
	_material.set_shader_parameter("border", border)


## Muda a cor (o tipo do item do topo) devagar.
func tint(to: Color, time: float = 0.35) -> void:
	if to.is_equal_approx(_goal):
		return
	_goal = to
	if _color_tween:
		_color_tween.kill()
	if not is_inside_tree():
		_set_color(to)
		return
	_color_tween = create_tween()
	_color_tween.tween_method(_set_color, _color, to, time)


## O halo de fora: 1 aceso (dá para responder), 0 apagado.
func set_glow(to: float) -> void:
	if is_equal_approx(to, _glow) and not (_glow_tween and _glow_tween.is_running()):
		return
	if _glow_tween:
		_glow_tween.kill()
	_glow = to
	if not is_inside_tree():
		_material.set_shader_parameter("glow", to)
		return
	var from: float = _material.get_shader_parameter("glow")
	_glow_tween = create_tween()
	_glow_tween.tween_method(func(v: float) -> void: _material.set_shader_parameter("glow", v), from, to, 0.4)


## Um clarão que se apaga (item novo no topo).
func flash(strength: float = 1.0) -> void:
	if not is_inside_tree():
		return
	if _flash_tween:
		_flash_tween.kill()
	_flash_tween = create_tween()
	_flash_tween.tween_method(func(v: float) -> void: _material.set_shader_parameter("flash", v), strength, 0.0, 0.7).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)


func glow_value() -> float:
	return _glow


func color_value() -> Color:
	return _goal


func _set_color(value: Color) -> void:
	_color = value
	_material.set_shader_parameter("color", value)
