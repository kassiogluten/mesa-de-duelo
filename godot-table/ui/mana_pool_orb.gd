# Uma gota de mana voando na tela em arco (da fonte até o pip da reserva, ou do pip até o que está sendo pago), com rastro
# de partículas na GPU; ao chegar, acende faíscas no destino, avisa quem a esperava e some.
class_name ManaPoolOrb
extends Control

const SHADER := preload("res://ui/mana_pool_orb.gdshader")

## Para onde vai: uma função que devolve o ponto na tela (segue o destino se ele anda); (-1, -1) mantém o último.
var target: Callable = Callable()
## Chamada na chegada (por exemplo, o pip contando a mana); ignorada se o dono já sumiu.
var on_arrive: Callable = Callable()
var tint: Color = Color.WHITE
var calm: bool = false
## Faíscas na chegada (o pip faz as dele no arrive; no pagamento, a gota acende no destino).
var sparks_on_arrival: bool = true

var _from: Vector2
var _to: Vector2
var _bend: float = 0.0
var _delay: float = 0.0
var _duration: float = 0.5
var _t: float = 0.0
var _done: bool = false
var _linger: float = 0.0
var _core: ColorRect
var _trail: GPUParticles2D
var _side: float = 22.0


## Começa o voo: de `from` até o alvo, depois de `delay` segundos, levando `duration` segundos; `bend` curva o arco
## (em pixels, para o lado; negativo para o outro).
func launch(from: Vector2, to: Vector2, delay: float, duration: float, bend: float) -> void:
	_from = from
	_to = to
	_delay = delay
	_duration = maxf(duration, 0.05)
	_bend = bend
	top_level = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_side = 34.0 if calm else 48.0
	size = Vector2.ZERO
	position = from
	_core = ColorRect.new()
	_core.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("tint", tint)
	_core.material = material
	_core.size = Vector2(_side, _side)
	_core.position = -_core.size / 2.0
	add_child(_core)
	if Fx.quality > 0:
		_trail = ManaPoolFx.trail(self, tint, calm)
	visible = delay <= 0.0
	if _trail:
		_trail.emitting = visible


func _process(delta: float) -> void:
	if _done:
		_linger -= delta
		if _linger <= 0.0:
			queue_free()
		return
	if _delay > 0.0:
		_delay -= delta
		if _delay > 0.0:
			return
		visible = true
		if _trail:
			_trail.emitting = true
	if target.is_valid():
		var p: Vector2 = target.call()
		if p.x >= 0.0:
			_to = p
	_t = minf(_t + delta / _duration, 1.0)
	# Sai devagar, acelera no meio e chega firme.
	var k: float = _t * _t * (3.0 - 2.0 * _t)
	var mid: Vector2 = (_from + _to) / 2.0
	var normal: Vector2 = (_to - _from).orthogonal().normalized()
	var control: Vector2 = mid + normal * _bend
	position = _from.lerp(control, k).lerp(control.lerp(_to, k), k)
	var grow: float = 0.55 + 0.45 * sin(k * PI) + 0.25 * k
	_core.scale = Vector2.ONE * grow
	_core.pivot_offset = _core.size / 2.0
	if _t >= 1.0:
		_arrive()


func _arrive() -> void:
	_done = true
	_core.visible = false
	if _trail:
		_trail.emitting = false
	_linger = 0.4
	if sparks_on_arrival and get_parent() is Control:
		ManaPoolFx.sparks_ring(get_parent() as Control, position, tint, calm, 0.6)
	if on_arrive.is_valid():
		on_arrive.call()
