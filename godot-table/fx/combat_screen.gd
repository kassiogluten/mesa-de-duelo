# As bordas da tela no combate: o vermelho que pulsa quando você leva um golpe (mais forte com mais dano), o aviso fraco
# quando atacam você e o quadro do impacto grande (a imagem esticando a partir do golpe). Fica escondido (sem custo)
# fora disso.
class_name CombatScreen
extends CanvasLayer

const SHADER := preload("res://fx/combat_vignette.gdshader")
const ZOOM := preload("res://fx/combat_zoom.gdshader")
## O quadro do impacto: quanto dura (estica rápido e volta).
const ZOOM_TIME := 0.22

var _rect := ColorRect.new()
var _material := ShaderMaterial.new()
var _tween: Tween
var _zoom_rect := ColorRect.new()
var _zoom_material := ShaderMaterial.new()
var _zoom_tween: Tween


func _init() -> void:
	# Por cima da mesa e por baixo da interface (o HUD fica na camada 1).
	layer = 0
	name = "BordasDoCombate"
	# O quadro do impacto fica por baixo das bordas vermelhas (elas não esticam junto).
	_zoom_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_zoom_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_zoom_material.shader = ZOOM
	_zoom_rect.material = _zoom_material
	_zoom_rect.visible = false
	add_child(_zoom_rect)
	_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_material.shader = SHADER
	_material.set_shader_parameter("amount", 0.0)
	_rect.material = _material
	_rect.visible = false
	add_child(_rect)


## O golpe em você: `weight` de 0 a 1 (o tamanho do dano); `color` vermelho no dano, verde no veneno.
func flash(weight: float, color: Color = Color(0.75, 0.03, 0.02)) -> void:
	_pulse(lerpf(0.55, 1.0, clampf(weight, 0.0, 1.0)), 0.07, lerpf(0.55, 0.95, weight), color)


## Atacam você: as bordas avermelham de leve, duas batidas, como um coração acelerando.
func threat() -> void:
	if Fx.quality == 0:
		return
	_material.set_shader_parameter("color", Color(0.6, 0.02, 0.02))
	_rect.visible = true
	if _tween:
		_tween.kill()
	_tween = create_tween()
	for i: int in 2:
		_tween.tween_method(_set_amount, 0.0, 0.32, 0.09).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_tween.tween_method(_set_amount, 0.32, 0.05, 0.22).set_ease(Tween.EASE_IN)
	_tween.tween_method(_set_amount, 0.05, 0.0, 0.3)
	_tween.tween_callback(func() -> void: _rect.visible = false)


## O quadro do impacto grande em `at` (ponto da mesa, visto por `camera`): a imagem estica para fora a partir dele por
## um piscar. Só no "alto" (lê a tela inteira algumas vezes por quadro).
func zoom(camera: Camera3D, at: Vector3, weight: float, tint: Color) -> void:
	if Fx.quality < 2 or camera == null or not camera.is_inside_tree() or camera.is_position_behind(at):
		return
	var size: Vector2 = camera.get_viewport().get_visible_rect().size
	var center: Vector2 = camera.unproject_position(at) / size
	_zoom_material.set_shader_parameter("center", center)
	_zoom_material.set_shader_parameter("tint", tint)
	_zoom_rect.visible = true
	if _zoom_tween:
		_zoom_tween.kill()
	var peak: float = lerpf(0.55, 1.0, clampf(weight, 0.0, 1.0))
	_zoom_tween = create_tween()
	# O tempo do quadro anda no relógio de verdade: a pausa do impacto (hit-stop) não o segura na tela.
	_zoom_tween.set_ignore_time_scale(true)
	_zoom_tween.tween_method(_set_zoom, 0.0, peak, ZOOM_TIME * 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_zoom_tween.tween_method(_set_zoom, peak, 0.0, ZOOM_TIME * 0.8).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	_zoom_tween.tween_callback(func() -> void: _zoom_rect.visible = false)


## Mostra uns quadros sem nada (a placa compila os shaders antes do primeiro golpe).
func warm() -> void:
	_rect.visible = true
	_set_amount(0.0)
	if Fx.quality >= 2:
		_zoom_rect.visible = true
		_set_zoom(0.0)
	var ref: WeakRef = weakref(self)
	get_tree().create_timer(0.2).timeout.connect(func() -> void:
		var screen: CombatScreen = ref.get_ref() as CombatScreen
		if screen == null:
			return
		if screen._tween == null or not screen._tween.is_running():
			screen._rect.visible = false
		if screen._zoom_tween == null or not screen._zoom_tween.is_running():
			screen._zoom_rect.visible = false)


func amount() -> float:
	return float(_material.get_shader_parameter("amount"))


## Quanto o quadro do impacto estica agora (0 desligado; os testes conferem que ele volta).
func zoom_amount() -> float:
	return float(_zoom_material.get_shader_parameter("amount")) if _zoom_rect.visible else 0.0


func _pulse(peak: float, rise: float, fall: float, color: Color) -> void:
	_material.set_shader_parameter("color", color)
	_rect.visible = true
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_method(_set_amount, amount(), peak, rise).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_tween.tween_method(_set_amount, peak, 0.0, fall).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_tween.tween_callback(func() -> void: _rect.visible = false)


func _set_amount(value: float) -> void:
	_material.set_shader_parameter("amount", value)


func _set_zoom(value: float) -> void:
	_zoom_material.set_shader_parameter("amount", value)
