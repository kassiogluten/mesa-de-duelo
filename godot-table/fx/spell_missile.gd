# Projétil das mágicas e habilidades com alvo: carga na fonte, núcleo brilhante com rastro de fita, faíscas e fumaça no
# estilo da cor da carta (fogo, arcano, sombra, radiante, natureza, energia), curva até o alvo e o impacto.
class_name SpellMissile
extends Node3D

const CORE_SHADER := preload("res://fx/missile_core.gdshader")
const TRAIL_SHADER := preload("res://fx/missile_trail.gdshader")
const CHARGE_TIME := 0.13
const TRAIL_LIFE := 0.34

## Cada estilo: cores, quanto os raios tremulam, quanto o rastro rasga, para onde as faíscas vão, fumaça e largura.
const STYLES := {
	"fire": {"hot": Color(1.0, 0.93, 0.7), "color": Color(1.0, 0.45, 0.12), "tail": Color(0.85, 0.12, 0.04), "rays": 0.7, "rough": 0.85,
		"gravity": Vector3(0, 1.1, 0), "smoke": Color(0.12, 0.09, 0.08, 0.45), "width": 0.26, "sparks": 1.0},
	"arcane": {"hot": Color(0.85, 0.95, 1.0), "color": Color(0.3, 0.62, 1.0), "tail": Color(0.4, 0.3, 1.0), "rays": 0.25, "rough": 0.2,
		"gravity": Vector3.ZERO, "smoke": Color(0, 0, 0, 0), "width": 0.2, "sparks": 0.9},
	"shadow": {"hot": Color(0.95, 0.8, 1.0), "color": Color(0.62, 0.3, 0.95), "tail": Color(0.3, 0.05, 0.4), "rays": 0.4, "rough": 0.9,
		"gravity": Vector3(0, -0.6, 0), "smoke": Color(0.1, 0.02, 0.14, 0.6), "width": 0.28, "sparks": 0.7},
	"radiant": {"hot": Color(1.0, 1.0, 0.95), "color": Color(1.0, 0.86, 0.5), "tail": Color(1.0, 0.7, 0.35), "rays": 1.0, "rough": 0.3,
		"gravity": Vector3(0, 0.3, 0), "smoke": Color(0, 0, 0, 0), "width": 0.22, "sparks": 1.0},
	"nature": {"hot": Color(0.92, 1.0, 0.85), "color": Color(0.35, 0.92, 0.4), "tail": Color(0.15, 0.6, 0.25), "rays": 0.35, "rough": 0.55,
		"gravity": Vector3(0, 0.45, 0), "smoke": Color(0, 0, 0, 0), "width": 0.22, "sparks": 0.9},
	"energy": {"hot": Color(0.95, 0.97, 1.0), "color": Color(0.62, 0.78, 1.0), "tail": Color(0.45, 0.55, 0.85), "rays": 0.9, "rough": 0.6,
		"gravity": Vector3.ZERO, "smoke": Color(0, 0, 0, 0), "width": 0.18, "sparks": 1.1},
}
const STYLE_OF_COLOR := {"W": "radiant", "U": "arcane", "B": "shadow", "R": "fire", "G": "nature"}

var _style: Dictionary
var _from: Vector3
var _to: Vector3
var _c1: Vector3
var _c2: Vector3
var _flight: float
var _speed: float
var _clock: float = 0.0
var _phase: int = 0
var _on_hit: Callable
var _target: WeakRef
var _core := MeshInstance3D.new()
var _core_mat := ShaderMaterial.new()
var _trail := MeshInstance3D.new()
var _trail_mesh := ImmediateMesh.new()
var _trail_mat := ShaderMaterial.new()
var _points: Array = []
var _sparks: GPUParticles3D
var _smoke: GPUParticles3D
var _lamp: OmniLight3D
var _seed: float = randf() * 100.0


## Dispara de `from` até `to` no estilo da carta; `on_hit` toca na chegada. `target_node` é a carta atingida (empurrada).
static func launch(parent: Node3D, from: Vector3, to: Vector3, card: Dictionary, on_hit: Callable = Callable(), speed: float = 1.0, target_node: CardNode = null) -> SpellMissile:
	var missile := SpellMissile.new()
	missile._setup(from, to, style_of(card), on_hit, speed, target_node)
	parent.add_child(missile)
	return missile


## Para o aquecimento: um projétil preto e minúsculo (invisível no modo de somar luz) que compila os materiais e as
## partículas de todas as fases (carga, voo, fumaça, clarão e estilhaços) antes do primeiro de verdade.
static func warm(parent: Node3D, at: Vector3) -> void:
	var style: Dictionary = (STYLES["fire"] as Dictionary).duplicate()
	for key: String in ["hot", "color", "tail"]:
		style[key] = Color(0, 0, 0)
	style["smoke"] = Color(0, 0, 0, 0.001)
	style["width"] = 0.001
	var missile := SpellMissile.new()
	missile._setup(at, at + Vector3(0, 0, -0.05), style, Callable(), 8.0, null)
	missile.scale = Vector3.ONE * 0.01
	parent.add_child(missile)


## O estilo pela cor da carta: uma cor dá o estilo dela; duas ou mais misturam as duas primeiras; incolor é energia.
static func style_of(card: Dictionary) -> Dictionary:
	var cost: String = Txt.of(card.get("manaCost"))
	var found: Array[String] = []
	for symbol: String in ["W", "U", "B", "R", "G"]:
		if cost.contains("{" + symbol) or cost.contains(symbol + "}") or cost.contains("/" + symbol):
			found.append(symbol)
	if found.is_empty():
		return STYLES["energy"]
	var style: Dictionary = (STYLES[STYLE_OF_COLOR[found[0]]] as Dictionary).duplicate()
	if found.size() > 1:
		var other: Dictionary = STYLES[STYLE_OF_COLOR[found[1]]]
		style["tail"] = other["color"]
		style["color"] = (style["color"] as Color).lerp(Color(1.0, 0.82, 0.35), 0.25)
	return style


## Quanto tempo leva da carga ao impacto (para quem precisa esperar a chegada).
static func travel_time(from: Vector3, to: Vector3, speed: float = 1.0) -> float:
	return (CHARGE_TIME + clampf(0.26 + from.distance_to(to) * 0.045, 0.3, 0.62)) / speed


func _setup(from: Vector3, to: Vector3, style: Dictionary, on_hit: Callable, speed: float, target_node: CardNode) -> void:
	_style = style
	_speed = maxf(speed, 0.1)
	_on_hit = on_hit
	_target = weakref(target_node) if target_node else null
	_from = from + Vector3(0, 0.25, 0)
	_to = to + Vector3(0, 0.12, 0)
	_flight = travel_time(from, to, 1.0) - CHARGE_TIME
	# Curva: sobe saindo da fonte, desvia um pouco para o lado e mergulha no alvo.
	var dir: Vector3 = (_to - _from)
	var dist: float = dir.length()
	var flat: Vector3 = Vector3(dir.x, 0, dir.z).normalized() if Vector2(dir.x, dir.z).length() > 0.01 else Vector3.FORWARD
	var side: Vector3 = flat.cross(Vector3.UP) * randf_range(-1.0, 1.0) * clampf(dist * 0.12, 0.1, 0.7)
	var lift: float = clampf(dist * 0.32, 0.5, 2.0)
	_c1 = _from + Vector3(0, lift, 0) + side + flat * dist * 0.15
	_c2 = _to + Vector3(0, lift * 0.55, 0) + side * 0.4 - flat * dist * 0.2


func _ready() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	_core.mesh = quad
	_core_mat.shader = CORE_SHADER
	_core_mat.set_shader_parameter("color", _style["color"])
	_core_mat.set_shader_parameter("hot", _style["hot"])
	_core_mat.set_shader_parameter("rays", _style["rays"])
	_core_mat.set_shader_parameter("seed", _seed)
	_core.material_override = _core_mat
	_core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_core.position = _from
	_core.scale = Vector3.ONE * 0.01
	add_child(_core)
	_trail.mesh = _trail_mesh
	_trail_mat.shader = TRAIL_SHADER
	_trail_mat.set_shader_parameter("color", _style["color"])
	_trail_mat.set_shader_parameter("tail", _style["tail"])
	_trail_mat.set_shader_parameter("hot", _style["hot"])
	_trail_mat.set_shader_parameter("roughness", _style["rough"])
	_trail_mat.set_shader_parameter("seed", _seed)
	_trail.material_override = _trail_mat
	_trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_trail)
	_charge()
	_sparks = _make_sparks()
	_core.add_child(_sparks)
	var smoke_color: Color = _style["smoke"]
	if smoke_color.a > 0.0 and Fx.quality > 0:
		_smoke = _make_smoke(smoke_color)
		_core.add_child(_smoke)
	if Fx.quality > 0:
		_lamp = OmniLight3D.new()
		_lamp.light_color = _style["color"]
		_lamp.light_energy = 0.0
		_lamp.omni_range = 2.6
		_lamp.shadow_enabled = false
		_core.add_child(_lamp)


func _process(delta: float) -> void:
	_clock += delta * _speed
	match _phase:
		0:
			var k: float = clampf(_clock / CHARGE_TIME, 0.0, 1.0)
			_core.scale = Vector3.ONE * lerpf(0.05, 0.95, ease(k, 0.5))
			_core_mat.set_shader_parameter("intensity", lerpf(0.4, 1.3, k))
			if _lamp:
				_lamp.light_energy = 1.2 * k
			if k >= 1.0:
				_phase = 1
				_clock = 0.0
				_sparks.emitting = true
				if _smoke:
					_smoke.emitting = true
		1:
			var k: float = clampf(_clock / _flight, 0.0, 1.0)
			# Acelera de leve: sai pesado e chega rápido.
			var t: float = k * k * 0.45 + k * 0.55
			_core.position = _bezier(t)
			var pulse: float = 0.9 + 0.12 * sin(_clock * 60.0 + _seed)
			_core.scale = Vector3.ONE * pulse
			if _lamp:
				_lamp.light_energy = 2.6 + sin(_clock * 45.0) * 0.6
			_push_point(_core.position)
			if k >= 1.0:
				_impact()
		2:
			if _points.is_empty() and _clock > 1.2:
				queue_free()
	_trim_points()
	_rebuild_trail()


func _bezier(t: float) -> Vector3:
	var u: float = 1.0 - t
	return _from * (u * u * u) + _c1 * (3.0 * u * u * t) + _c2 * (3.0 * u * t * t) + _to * (t * t * t)


func _push_point(at: Vector3) -> void:
	if not _points.is_empty() and ((_points[0] as Dictionary)["pos"] as Vector3).distance_to(at) < 0.015:
		(_points[0] as Dictionary)["pos"] = at
		return
	_points.push_front({"pos": at, "t": _clock_total()})


func _clock_total() -> float:
	return Time.get_ticks_msec() / 1000.0 * _speed


func _trim_points() -> void:
	var now: float = _clock_total()
	while not _points.is_empty() and now - float((_points[_points.size() - 1] as Dictionary)["t"]) > TRAIL_LIFE:
		_points.pop_back()


## A fita do rastro, de frente para a câmera: um par de vértices por ponto, mais larga na cabeça.
func _rebuild_trail() -> void:
	_trail_mesh.clear_surfaces()
	if _points.size() < 2:
		return
	var camera: Camera3D = get_viewport().get_camera_3d()
	var eye: Vector3 = to_local(camera.global_position) if camera else Vector3(0, 10, 6)
	var now: float = _clock_total()
	var width: float = float(_style["width"])
	_trail_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	var count: int = _points.size()
	for i: int in count:
		var p: Vector3 = (_points[i] as Dictionary)["pos"]
		var age: float = clampf((now - float((_points[i] as Dictionary)["t"])) / TRAIL_LIFE, 0.0, 1.0)
		var ahead: Vector3 = (_points[maxi(i - 1, 0)] as Dictionary)["pos"]
		var behind: Vector3 = (_points[mini(i + 1, count - 1)] as Dictionary)["pos"]
		var tangent: Vector3 = ahead - behind
		if tangent.length() < 0.0001:
			tangent = Vector3.FORWARD
		var side: Vector3 = tangent.normalized().cross((eye - p).normalized()).normalized()
		var w: float = width * (1.0 - age * 0.75)
		_trail_mesh.surface_set_uv(Vector2(age, 0.0))
		_trail_mesh.surface_add_vertex(p - side * w)
		_trail_mesh.surface_set_uv(Vector2(age, 1.0))
		_trail_mesh.surface_add_vertex(p + side * w)
	_trail_mesh.surface_end()


## Carga na fonte: partículas que se juntam no ponto de saída.
func _charge() -> void:
	if Fx.quality == 0:
		return
	var gather := GPUParticles3D.new()
	gather.amount = 40
	gather.lifetime = CHARGE_TIME / _speed + 0.05
	gather.one_shot = true
	gather.explosiveness = 0.85
	gather.local_coords = true
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE
	process.emission_sphere_radius = 0.6
	process.radial_accel_min = -14.0
	process.radial_accel_max = -9.0
	process.gravity = Vector3.ZERO
	process.scale_min = 0.07
	process.scale_max = 0.13
	process.color_ramp = _ramp(_style["hot"], _style["color"], 0.9)
	gather.process_material = process
	gather.draw_pass_1 = Fx._spark()
	gather.position = _from
	add_child(gather)
	gather.emitting = true


func _make_sparks() -> GPUParticles3D:
	var sparks := GPUParticles3D.new()
	sparks.amount = int((140 if Fx.quality > 1 else (60 if Fx.quality == 1 else 20)) * float(_style["sparks"]))
	sparks.lifetime = 0.45
	sparks.local_coords = false
	sparks.emitting = false
	# Emite a cada quadro (não a 30 por segundo): com o núcleo voando rápido, as faíscas saem ao longo do caminho em
	# vez de amontoadas no ponto de saída.
	sparks.fixed_fps = 0
	sparks.interpolate = false
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3.UP
	process.spread = 180.0
	process.initial_velocity_min = 0.3
	process.initial_velocity_max = 1.4
	process.gravity = _style["gravity"]
	process.damping_min = 1.5
	process.damping_max = 3.0
	process.scale_min = 0.06
	process.scale_max = 0.15
	var shrink := Curve.new()
	shrink.add_point(Vector2(0, 1))
	shrink.add_point(Vector2(1, 0))
	var shrink_tex := CurveTexture.new()
	shrink_tex.curve = shrink
	process.scale_curve = shrink_tex
	process.color_ramp = _ramp(_style["hot"], _style["color"], 1.0)
	sparks.process_material = process
	sparks.draw_pass_1 = Fx._spark()
	return sparks


## Fumaça (fogo e sombra): manchas escuras e macias que sobem devagar e se abrem.
func _make_smoke(color: Color) -> GPUParticles3D:
	var smoke := GPUParticles3D.new()
	smoke.amount = 26 if Fx.quality > 1 else 12
	smoke.lifetime = 0.7
	smoke.local_coords = false
	smoke.emitting = false
	smoke.fixed_fps = 0
	smoke.interpolate = false
	var process := ParticleProcessMaterial.new()
	process.spread = 180.0
	process.initial_velocity_min = 0.05
	process.initial_velocity_max = 0.25
	process.gravity = Vector3(0, 0.35, 0)
	process.scale_min = 0.3
	process.scale_max = 0.5
	var grow := Curve.new()
	grow.add_point(Vector2(0, 0.4))
	grow.add_point(Vector2(1, 1.4))
	var grow_tex := CurveTexture.new()
	grow_tex.curve = grow
	process.scale_curve = grow_tex
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color, 0.0))
	ramp.add_point(0.2, color)
	ramp.set_color(ramp.get_point_count() - 1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	smoke.process_material = process
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var material := (Fx._spark().material as StandardMaterial3D).duplicate() as StandardMaterial3D
	material.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	quad.material = material
	smoke.draw_pass_1 = quad
	return smoke


static func _ramp(hot: Color, color: Color, alpha: float) -> GradientTexture1D:
	var ramp := Gradient.new()
	ramp.set_color(0, Color(hot, alpha))
	ramp.add_point(0.25, Color(color, alpha))
	ramp.set_color(ramp.get_point_count() - 1, Color(color.darkened(0.3), 0.0))
	var texture := GradientTexture1D.new()
	texture.gradient = ramp
	return texture


## Chegada: o núcleo vira clarão, estilhaços saem para trás e caem, a carta atingida é empurrada e volta; o rastro se apaga.
func _impact() -> void:
	_phase = 2
	_clock = 0.0
	var at: Vector3 = _to
	var incoming: Vector3 = (_to - _bezier(0.92)).normalized()
	_core.visible = false
	_sparks.emitting = false
	if _smoke:
		_smoke.emitting = false
	if _lamp:
		_lamp.light_energy = 0.0
	_flash(at)
	_shards(at, incoming)
	Fx.light(self, at, _style["color"], 7.0, 4.5, 0.4 / _speed)
	_knock(incoming)
	if _on_hit.is_valid():
		_on_hit.call()


func _flash(at: Vector3) -> void:
	var flash := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	flash.mesh = quad
	var material := _core_mat.duplicate() as ShaderMaterial
	material.set_shader_parameter("rays", 1.0)
	flash.material_override = material
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flash.position = at
	flash.scale = Vector3.ONE * 0.6
	add_child(flash)
	var tween := flash.create_tween().set_parallel(true)
	tween.tween_property(flash, "scale", Vector3.ONE * 2.8, 0.24 / _speed).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("intensity", v), 1.6, 0.0, 0.26 / _speed).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(flash.queue_free)


## Estilhaços: saem para trás e para cima (contra a direção da chegada), caem e se apagam.
func _shards(at: Vector3, incoming: Vector3) -> void:
	var shards := GPUParticles3D.new()
	shards.amount = 90 if Fx.quality > 1 else (44 if Fx.quality == 1 else 16)
	shards.lifetime = 0.75
	shards.one_shot = true
	shards.explosiveness = 0.95
	shards.local_coords = false
	var process := ParticleProcessMaterial.new()
	var back: Vector3 = (-incoming * 0.6 + Vector3.UP).normalized()
	process.direction = back
	process.spread = 70.0
	process.initial_velocity_min = 2.0
	process.initial_velocity_max = 5.5
	process.gravity = Vector3(0, -8.0, 0)
	process.damping_min = 0.5
	process.damping_max = 1.5
	process.scale_min = 0.06
	process.scale_max = 0.14
	process.color_ramp = _ramp(_style["hot"], _style["color"], 1.0)
	shards.process_material = process
	shards.draw_pass_1 = Fx._spark()
	shards.position = at
	add_child(shards)
	shards.emitting = true


## A carta atingida inclina para longe do golpe e volta com mola.
func _knock(incoming: Vector3) -> void:
	var node: CardNode = _target.get_ref() as CardNode if _target else null
	if node == null or not is_instance_valid(node):
		return
	var visual: Node3D = CardDressing.visual_of(node)
	if visual == null:
		return
	var flat: Vector3 = Vector3(incoming.x, 0, incoming.z)
	if flat.length() < 0.01:
		return
	var local_dir: Vector3 = node.global_transform.basis.inverse() * flat.normalized()
	var axis: Vector3 = Vector3.UP.cross(local_dir).normalized()
	var home: Basis = visual.basis
	var tilted: Basis = Basis(axis, deg_to_rad(14.0)) * home
	var tween := visual.create_tween()
	tween.tween_property(visual, "basis", tilted, 0.06 / _speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(visual, "basis", home, 0.45 / _speed).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
