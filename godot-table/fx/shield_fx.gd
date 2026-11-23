# A cúpula do ward (sobe, segura o golpe com uma onda nos favos, ou trinca e se parte em cacos) e a carta que sobrevive
# (indestrutível ou regenerada: trinca, a luz vaza pelas fendas e elas se fecham com uma faixa de luz). PermanentFx chama daqui.
class_name ShieldFx
extends RefCounted

const WARD := Color(0.45, 0.78, 1.0)
const DOME := preload("res://fx/ward_dome.gdshader")


## A cúpula do ward sobre a carta em `pos`: "rise" sobe e fica um instante; "hold" acende e segura (quem mirou foi
## anulado), com a onda do golpe descendo pelos favos; "break" trinca e se parte em cacos (o custo foi pago).
static func ward(parent: Node3D, pos: Vector3, outcome: String, speed: float = 1.0) -> void:
	var dome := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.is_hemisphere = true
	sphere.radial_segments = 48
	sphere.rings = 16
	dome.mesh = sphere
	var material := ShaderMaterial.new()
	material.shader = DOME
	material.set_shader_parameter("color", WARD)
	dome.material_override = material
	dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dome.position = Vector3(pos.x, 0.0, pos.z)
	var full := Vector3(0.55, 0.42, 0.7)
	dome.scale = Vector3(full.x, 0.01, full.z)
	parent.add_child(dome)
	var top: Vector3 = dome.position + Vector3(0, full.y, 0)
	var set_param: Callable = func(v: float, key: String) -> void: material.set_shader_parameter(key, v)
	var tween := dome.create_tween()
	tween.tween_property(dome, "scale", full, 0.28 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_method(set_param.bind("alpha"), 0.0, 1.0, 0.2 / speed)
	match outcome:
		"hold":
			tween.tween_callback(func() -> void:
				MomentExtras.flare(parent, top, WARD.lightened(0.4), 1.3, 0.4 / speed)
				Fx.light(parent, pos, WARD, 4.0, 4.0, 0.5 / speed)
				Fx.float_text(parent, pos + Vector3(0, 0.3, 0), "Protegida", WARD.lightened(0.35), 60))
			tween.tween_method(set_param.bind("hit"), 0.0, 1.0, 0.5 / speed).set_ease(Tween.EASE_OUT)
			tween.parallel().tween_method(set_param.bind("flash"), 1.0, 0.0, 0.45 / speed)
			tween.tween_interval(0.2 / speed)
			tween.tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.35 / speed)
		"break":
			tween.tween_interval(0.12 / speed)
			tween.tween_method(set_param.bind("cracks"), 0.0, 1.0, 0.3 / speed)
			for i: int in 4:
				tween.parallel().tween_property(dome, "position:x", pos.x + (0.02 if i % 2 == 0 else -0.02), 0.07 / speed).set_delay(i * 0.07 / speed)
			tween.tween_callback(func() -> void:
				MomentExtras.shards(parent, top - Vector3(0, full.y * 0.4, 0), Color(WARD.lightened(0.35), 0.9), 34, 2.6, 0.8, 0.12, 0.35)
				MomentExtras.flare(parent, top, WARD.lightened(0.5), 1.6, 0.35 / speed)
				Fx.burst(parent, pos + Vector3(0, 0.25, 0), WARD.lightened(0.4), 40, 2.2, 0.6, 0.06)
				Fx.float_text(parent, pos + Vector3(0, 0.3, 0), "Ward pago", WARD.lightened(0.2), 50))
			tween.tween_property(dome, "scale", full * 1.12, 0.1 / speed)
			tween.parallel().tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.1 / speed)
		_:
			tween.tween_interval(0.7 / speed)
			tween.tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.4 / speed)
	tween.tween_callback(dome.queue_free)


## Sobreviveu: a carta trinca do meio para fora, a luz vaza pelas fendas em cintilas e brasas, e elas se fecham com uma
## faixa de luz atravessando a face e a luz correndo a borda.
static func survive(parent: Node3D, node: CardNode, regenerated: bool, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	var material: ShaderMaterial = CardDressing.material_of(node)
	var color: Color = Color(0.45, 1.0, 0.55) if regenerated else Color(1.0, 0.86, 0.45)
	var pos: Vector3 = node.global_position
	node.jolt(0.08)
	Fx.burst(parent, pos + Vector3(0, 0.1, 0), Color(0.9, 0.9, 1.0), 30, 1.6, 0.5, 0.06)
	if material == null:
		return
	material.set_shader_parameter("crack_color", color)
	var set_cracks: Callable = func(v: float) -> void: material.set_shader_parameter("cracks", v)
	var ref: WeakRef = weakref(node)
	var tween := node.create_tween()
	tween.tween_method(set_cracks, 0.0, 1.0, 0.22 / speed).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void:
		MomentExtras.sparkles(parent, pos + Vector3(0, 0.06, 0), color.lerp(Color.WHITE, 0.4), 0.28, 0.3 / speed, 12, 0.16)
		Fx.burst(parent, pos + Vector3(0, 0.05, 0), color, 16, 0.6, 0.6, 0.04, 0.8))
	tween.tween_interval(0.3 / speed)
	tween.tween_callback(func() -> void:
		var card: CardNode = ref.get_ref() as CardNode
		if card == null:
			return
		card.flash_color(color, 0.45)
		CardGlow.sweep(card, color.lerp(Color.WHITE, 0.35), 0.42, speed)
		CardGlow.trace(card, color, 0.5, speed)
		Fx.light(parent, pos, color, 3.0, 3.5, 0.5 / speed))
	tween.tween_method(set_cracks, 1.0, 0.0, 0.42 / speed).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
