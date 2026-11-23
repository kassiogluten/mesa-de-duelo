# Gota de mana voando de um terreno virado até a mágica conjurada: o mesmo núcleo do projétil das mágicas em tamanho
# pequeno (centro claro e coroa na cor da mana), um cometa curto atrás, poucas faíscas, e um clarão pequeno quando ela
# se funde na carta. Sem luz própria (com sete terrenos seriam sete luzes): só a fusão final acende uma.
class_name ManaOrb
extends Node3D

## O tamanho do núcleo no meio da mesa (o do projétil é ~1).
const SIZE := 0.34
const POP_TIME := 0.08

## Quanto a gota é maior que a da mana (Fx.bolt usa gotas maiores).
var size: float = 1.0

var _from: Vector3
var _to: Vector3
var _c1: Vector3
var _c2: Vector3
var _flight: float = 0.4
var _clock: float = 0.0
var _phase: int = 0
var _color: Color
var _on_arrive: Callable
var _core := MeshInstance3D.new()
var _core_mat := ShaderMaterial.new()
var _sparks: GPUParticles3D
var _trail: TrailRibbon


## Solta uma gota de `from` até `to` em `flight` s, na cor; `on_arrive` toca quando ela chega.
static func launch(parent: Node3D, from: Vector3, to: Vector3, color: Color, flight: float = 0.42, on_arrive: Callable = Callable()) -> ManaOrb:
	var orb := ManaOrb.new()
	orb._setup(from, to, color, flight, on_arrive)
	parent.add_child(orb)
	return orb


func _setup(from: Vector3, to: Vector3, color: Color, flight: float, on_arrive: Callable) -> void:
	_from = from
	_to = to
	_color = color
	_flight = maxf(flight, 0.05)
	_on_arrive = on_arrive
	# Sobe da carta, abre um pouco para o lado e mergulha na mágica: cada gota com a sua curva.
	var dir: Vector3 = to - from
	var flat: Vector3 = Vector3(dir.x, 0, dir.z)
	var side: Vector3 = flat.cross(Vector3.UP).normalized() * randf_range(-1.0, 1.0) * clampf(flat.length() * 0.1, 0.05, 0.5) if flat.length() > 0.01 else Vector3.ZERO
	var lift: float = clampf(dir.length() * 0.28, 0.35, 1.5)
	_c1 = from + Vector3(0, lift, 0) + side + dir * 0.1
	_c2 = to + Vector3(0, lift * 0.4, 0) + side * 0.3 - dir * 0.25


func _ready() -> void:
	top_level = true
	global_transform = Transform3D.IDENTITY
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	_core.mesh = quad
	_core_mat.shader = SpellMissile.CORE_SHADER
	_core_mat.set_shader_parameter("color", _color)
	_core_mat.set_shader_parameter("hot", _color.lerp(Color.WHITE, 0.8))
	_core_mat.set_shader_parameter("rays", 0.35)
	_core_mat.set_shader_parameter("seed", randf() * 100.0)
	_core_mat.set_shader_parameter("intensity", 1.2)
	_core.material_override = _core_mat
	_core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_core.position = _from
	_core.scale = Vector3.ONE * 0.01
	add_child(_core)
	_trail = TrailRibbon.comet(self, _core, _color, 0.13, 0.2, 0.9)
	if Fx.quality > 0:
		_sparks = _make_sparks()
		_core.add_child(_sparks)


func _process(delta: float) -> void:
	_clock += delta
	match _phase:
		0:
			# Nasce na carta: o núcleo acende e cresce.
			var k: float = clampf(_clock / POP_TIME, 0.0, 1.0)
			_core.scale = Vector3.ONE * SIZE * size * ease(k, 0.4) * Fx.depth_scale(self, _from)
			if k >= 1.0:
				_phase = 1
				_clock = 0.0
				if _sparks:
					_sparks.emitting = true
		1:
			var k: float = clampf(_clock / _flight, 0.0, 1.0)
			# Sai devagar e acelera, como se a mágica puxasse.
			var t: float = k * k * 0.6 + k * 0.4
			var u: float = 1.0 - t
			_core.position = _from * (u * u * u) + _c1 * (3.0 * u * u * t) + _c2 * (3.0 * u * t * t) + _to * (t * t * t)
			var pulse: float = 0.92 + 0.1 * sin(_clock * 50.0)
			# Perto da câmera (a pilha no painel) a gota encolhe: o mesmo tamanho na tela.
			_core.scale = Vector3.ONE * SIZE * size * pulse * Fx.depth_scale(self, _core.position)
			if k >= 1.0:
				_arrive()
		2:
			if _clock > 0.5:
				queue_free()


func _arrive() -> void:
	_phase = 2
	_clock = 0.0
	_core.visible = false
	if _sparks:
		_sparks.emitting = false
	if _trail:
		_trail.emitting = false
	flash(self, _to, _color, 0.75 * size)
	if _on_arrive.is_valid():
		_on_arrive.call()


## Clarão pequeno na cor (o núcleo do projétil abrindo e apagando): a gota se fundindo na carta.
static func flash(parent: Node3D, at: Vector3, color: Color, reach: float = 1.0, time: float = 0.2) -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var mesh := MeshInstance3D.new()
	mesh.mesh = quad
	var material := ShaderMaterial.new()
	material.shader = SpellMissile.CORE_SHADER
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("hot", color.lerp(Color.WHITE, 0.85))
	material.set_shader_parameter("rays", 0.8)
	material.set_shader_parameter("intensity", 1.4)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mesh)
	mesh.global_position = at
	var near: float = Fx.depth_scale(parent, at)
	mesh.scale = Vector3.ONE * 0.2 * reach * near
	var tween := mesh.create_tween().set_parallel(true)
	tween.tween_property(mesh, "scale", Vector3.ONE * reach * near, time).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("intensity", v), 1.4, 0.0, time * 1.1).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(mesh.queue_free)


func _make_sparks() -> GPUParticles3D:
	var sparks := GPUParticles3D.new()
	sparks.amount = 22 if Fx.quality > 1 else 12
	sparks.lifetime = 0.3
	sparks.local_coords = false
	sparks.emitting = false
	sparks.fixed_fps = 0
	sparks.interpolate = false
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3.UP
	process.spread = 180.0
	process.initial_velocity_min = 0.15
	process.initial_velocity_max = 0.6
	process.gravity = Vector3(0, -0.4, 0)
	process.damping_min = 1.5
	process.damping_max = 3.0
	process.scale_min = 0.03
	process.scale_max = 0.06
	process.color_ramp = SpellMissile._ramp(_color.lerp(Color.WHITE, 0.7), _color, 0.9)
	sparks.process_material = process
	sparks.draw_pass_1 = Fx._spark()
	return sparks


## Para o aquecimento: uma gota preta (invisível no modo de somar luz) que anda o bastante para desenhar o cometa e
## compila o núcleo, a fita e as faíscas.
static func warm(parent: Node3D, at: Vector3) -> void:
	ManaOrb.launch(parent, at, at + Vector3(0.3, 0, -0.6), Color(0, 0, 0), 0.15)
	flash(parent, at, Color(0, 0, 0), 0.01, 0.05)
