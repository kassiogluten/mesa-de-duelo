# Efeitos numa permanente: a cúpula do ward (sobe, segura ou trinca), a aura ou o equipamento que se prende, a mudança
# de controle, a carta que transforma (gira e troca de face), as rachaduras que fecham de quem sobreviveu, os dois cortes do
# golpe duplo e a mana que voa dos terrenos para a mágica conjurada.
class_name PermanentFx
extends RefCounted

const WARD := Color(0.45, 0.78, 1.0)
const CONTROL := Color(0.72, 0.42, 1.0)

static var _dome_shader: Shader


## A cúpula do ward sobre a carta em `pos`: "rise" sobe e fica um instante; "hold" acende e segura (quem mirou foi
## anulado); "break" trinca e se parte (o custo foi pago).
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
	material.shader = _dome()
	material.set_shader_parameter("color", WARD)
	dome.material_override = material
	dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dome.position = Vector3(pos.x, 0.0, pos.z)
	var full := Vector3(0.55, 0.38, 0.7)
	dome.scale = Vector3(full.x, 0.01, full.z)
	parent.add_child(dome)
	var set_param: Callable = func(v: float, key: String) -> void: material.set_shader_parameter(key, v)
	var tween := dome.create_tween()
	tween.tween_property(dome, "scale", full, 0.28 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_method(set_param.bind("alpha"), 0.0, 1.0, 0.2 / speed)
	match outcome:
		"hold":
			tween.tween_callback(func() -> void:
				Fx.light(parent, pos, WARD, 4.0, 4.0, 0.5 / speed)
				Fx.float_text(parent, pos + Vector3(0, 0.3, 0), "Protegida", WARD.lightened(0.35), 60))
			tween.tween_method(set_param.bind("flash"), 1.0, 0.0, 0.45 / speed)
			tween.tween_interval(0.35 / speed)
			tween.tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.35 / speed)
		"break":
			tween.tween_interval(0.12 / speed)
			tween.tween_method(set_param.bind("cracks"), 0.0, 1.0, 0.3 / speed)
			tween.tween_callback(func() -> void:
				Fx.burst(parent, pos + Vector3(0, 0.25, 0), WARD.lightened(0.4), 70, 2.6, 0.75, 0.07)
				Fx.float_text(parent, pos + Vector3(0, 0.3, 0), "Ward pago", WARD.lightened(0.2), 50))
			tween.tween_property(dome, "scale", full * 1.15, 0.12 / speed)
			tween.parallel().tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.12 / speed)
		_:
			tween.tween_interval(0.7 / speed)
			tween.tween_method(set_param.bind("alpha"), 1.0, 0.0, 0.4 / speed)
	tween.tween_callback(dome.queue_free)


## A aura ou o equipamento se prende: uma corrente de luz corre dela até a carta (ou o jogador), e o contorno da carta
## que a recebe acende.
static func attach(parent: Node3D, from: Vector3, to: Vector3, color: Color, speed: float = 1.0, host: CardNode = null) -> void:
	var links: int = 9
	var lift: float = clampf(from.distance_to(to) * 0.3, 0.3, 1.2)
	for i: int in links:
		var t: float = (i + 1.0) / (links + 1.0)
		var at: Vector3 = from.lerp(to, t) + Vector3(0, sin(t * PI) * lift + 0.1, 0)
		MomentPieces.after(parent, t * 0.28 / speed, func() -> void:
			Fx.burst(parent, at, color.lerp(Color.WHITE, 0.4), 10, 0.4, 0.5, 0.14)
			Fx.burst(parent, at, Color(1.0, 0.9, 0.6), 4, 0.15, 0.35, 0.2))
	MomentPieces.after(parent, 0.3 / speed, func() -> void:
		if host:
			CardGlow.trace(host, color.lerp(Color(1.0, 0.85, 0.45), 0.4), 0.45, speed)
		Fx.burst(parent, to + Vector3(0, 0.1, 0), color, 26, 1.2, 0.5, 0.07))


## Mudou de controle: um rastro roxo do lugar antigo até o novo, um redemoinho e o contorno da carta acendendo.
static func control(parent: Node3D, from: Variant, to: Vector3, speed: float = 1.0, node: CardNode = null) -> void:
	if from is Vector3:
		Fx.bolt(parent, from as Vector3, to, CONTROL, 0.4 / speed)
	MomentPieces.after(parent, 0.3 / speed, func() -> void:
		MomentPieces.spiral(parent, to, CONTROL, 14, 0.9, 0.7 / speed)
		CardGlow.pulse(node, CONTROL, 0.06, speed)
		Fx.float_text(parent, to + Vector3(0, 0.2, 0), "Mudou de lado", CONTROL.lightened(0.35), 54))


## A carta transforma: sobe um pouco, gira de lado mostrando a face antiga, troca no meio do giro e volta com a nova;
## `old_tex` é a imagem de antes (a mesa já pôs a nova). Na desvirada (metamorfose), o texto muda.
static func flip(parent: Node3D, node: CardNode, old_tex: Texture2D, face_up: bool, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var material: ShaderMaterial = CardDressing.material_of(node)
	var pos: Vector3 = node.global_position
	var new_tex: Variant = material.get_shader_parameter("front_tex") if material else null
	if material and old_tex:
		material.set_shader_parameter("front_tex", old_tex)
		material.set_shader_parameter("has_front", true)
	var half: float = 0.22 / speed
	var tween := visual.create_tween()
	tween.tween_property(visual, "position:y", 0.35, half).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "rotation:z", PI / 2.0, half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		if material:
			# Se a imagem nova chegou durante o giro, ela já está no material: vale a mais nova.
			var current: Variant = material.get_shader_parameter("front_tex")
			var face: Variant = current if current != old_tex else new_tex
			material.set_shader_parameter("front_tex", face)
			material.set_shader_parameter("has_front", face != null)
		visual.rotation.z = -PI / 2.0
		Fx.burst(parent, pos + Vector3(0, 0.35, 0), Color(1.0, 0.9, 0.6), 40, 1.8, 0.6, 0.08)
		Fx.light(parent, pos, Color(1.0, 0.85, 0.6), 4.0, 4.0, 0.5 / speed))
	tween.tween_property(visual, "rotation:z", 0.0, half * 1.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "position:y", 0.0, half * 1.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		CardGlow.pulse(node, Color(1.0, 0.85, 0.5), 0.06, speed)
		node.flash_color(Color(1.0, 0.9, 0.7), 0.4)
		Fx.float_text(parent, pos + Vector3(0, 0.2, 0), "Desvirada" if face_up else "Transformou", Color(1.0, 0.9, 0.65), 54))


## Sobreviveu: a carta trinca do meio para fora, a luz vaza pelas fendas e elas se fecham com um clarão.
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
	var tween := node.create_tween()
	tween.tween_method(set_cracks, 0.0, 1.0, 0.22 / speed).set_ease(Tween.EASE_OUT)
	tween.tween_interval(0.3 / speed)
	tween.tween_callback(func() -> void:
		node.flash_color(color, 0.45)
		CardGlow.pulse(node, color, 0.05, speed)
		Fx.light(parent, pos, color, 3.0, 3.5, 0.5 / speed))
	tween.tween_method(set_cracks, 1.0, 0.0, 0.42 / speed).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)


## Golpe duplo: no primeiro golpe um corte; no segundo, outro cruzando, e o "Golpe duplo".
static func double_strike(parent: Node3D, at: Vector3, second: bool) -> void:
	var color := Color(1.0, 0.78, 0.4)
	MomentPieces.slash(parent, at + Vector3(0, 0.3, 0), color, -0.65 if second else 0.65, 1.5, 0.22, 0.0)
	if second:
		MomentPieces.slash(parent, at + Vector3(0, 0.3, 0), color.lightened(0.3), 0.65, 1.5, 0.18, 0.0)
		Fx.float_text(parent, at + Vector3(0, 0.55, 0), "Golpe duplo", color.lightened(0.2), 56, 0.9)


## A mana dos terrenos virados voa até a mágica: uma esfera na cor de cada terreno, uma depois da outra.
static func mana(parent: Node3D, sources: Array, to: Vector3, speed: float = 1.0) -> float:
	var gap: float = minf(0.07, 0.4 / maxf(sources.size(), 1))
	var i: int = 0
	for raw: Variant in sources:
		var source: Dictionary = raw
		var from: Vector3 = source["at"]
		var color: Color = source["color"]
		var delay: float = i * gap / speed
		MomentPieces.after(parent, delay, func() -> void:
			Fx.burst(parent, from + Vector3(0, 0.1, 0), color, 10, 0.6, 0.35, 0.07)
			Fx.bolt(parent, from + Vector3(0, 0.1, 0), to, color, 0.42 / speed, func() -> void:
				Fx.burst(parent, to, color.lerp(Color.WHITE, 0.3), 14, 0.9, 0.35, 0.07)))
		i += 1
	return (i * gap + 0.42) / speed


static func _dome() -> Shader:
	if _dome_shader == null:
		_dome_shader = Shader.new()
		_dome_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(0.45, 0.78, 1.0, 1.0);
uniform float alpha = 1.0;
uniform float flash = 0.0;
uniform float cracks = 0.0;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Favos hexagonais: perto da borda da célula, 1.
float hexes(vec2 p) {
	p.x *= 1.1547;
	p.y += mod(floor(p.x), 2.0) * 0.5;
	vec2 f = abs(fract(p) - 0.5);
	return smoothstep(0.42, 0.5, max(f.x * 1.5 + f.y, f.y * 2.0));
}
void fragment() {
	float rim = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.2);
	float cells = hexes(UV * vec2(18.0, 7.0));
	float shimmer = 0.6 + 0.4 * sin(UV.y * 30.0 - TIME * 5.0);
	float crack = 0.0;
	if (cracks > 0.0) {
		vec2 g = floor(UV * vec2(9.0, 4.0));
		crack = step(1.0 - cracks * 0.8, hash(g)) * cells;
	}
	ALBEDO = mix(color.rgb, vec3(1.0), flash * 0.6 + crack) * (1.2 + flash * 2.5 + crack * 3.0);
	ALPHA = clamp(rim * 0.75 + cells * 0.12 * shimmer + flash * 0.3 + crack, 0.0, 1.0) * alpha;
}
"""
	return _dome_shader
