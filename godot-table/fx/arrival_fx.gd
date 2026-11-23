# Chegadas com cena própria: o comandante saindo da zona de comando (sobe, paira, mergulha com a mesa tremendo e a arte
# sai da moldura), o Game Changer (a mesa escurece, o holofote, a gema e a faixa) e as fichas que viram objeto (o Tesouro
# é uma moeda, a Pista uma lupa, a Comida uma maçã, o Sangue uma gota) e mergulham na carta.
class_name ArrivalFx
extends RefCounted

const GOLD := Color(1.0, 0.76, 0.28)
const GEM := Color(0.35, 1.0, 0.82)
## Fichas com objeto: o nome (como o Forge escreve, em inglês) → o objeto.
const TOKENS := {"Treasure": "coin", "Gold": "coin", "Clue": "glass", "Food": "apple", "Blood": "drop"}

static var _bloom_shader: Shader
static var _dim_shader: Shader


## O objeto da ficha que entrou ("" se ela não tem um).
static func token_kind(card: Dictionary) -> String:
	if not bool(card.get("token", false)):
		return ""
	var name: String = Txt.of(card.get("name"))
	for key: String in TOKENS:
		if name == key or name.begins_with(key + " "):
			return TOKENS[key]
	return ""


## A entrada do comandante: a carta (já no lugar) sobe grande, paira, mergulha; no impacto a mesa treme, a poeira sobe e a
## arte sai da moldura, cresce em volta e volta.
static func commander(parent: Node3D, node: CardNode, camera: Camera3D, color: Color, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var pos: Vector3 = node.global_position
	var rise: float = 0.5 / speed
	var dive: float = 0.17 / speed
	var tween := visual.create_tween()
	tween.tween_property(visual, "position:y", 1.7, rise).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "scale", Vector3.ONE * 1.5, rise).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(visual, "position:y", 1.85, 0.2 / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(visual, "position:y", 0.0, dive).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(visual, "scale", Vector3.ONE, dive).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		Fx.ring(parent, Vector3(pos.x, 0.02, pos.z), GOLD, 3.2, 0.7 / speed, 0.1)
		Fx.ring(parent, Vector3(pos.x, 0.02, pos.z), color, 1.8, 0.5 / speed, 0.2)
		Fx.burst(parent, pos + Vector3(0, 0.05, 0), Color(0.75, 0.62, 0.45), 60, 2.2, 0.8, 0.12)
		Fx.burst(parent, pos + Vector3(0, 0.2, 0), GOLD, 50, 2.8, 0.7, 0.07)
		Fx.light(parent, pos, GOLD, 7.0, 7.0, 0.8 / speed)
		Fx.pillar(parent, pos, GOLD, 5.0, 0.8 / speed)
		Fx.shake(camera, 0.11, 0.4)
		node.flash_color(GOLD, 0.5)
		_art_bloom(parent, node, pos, 1.0 / speed))
	tween.tween_property(visual, "scale", Vector3(1.06, 1.0, 1.06), 0.06 / speed)
	tween.tween_property(visual, "scale", Vector3.ONE, 0.14 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## O Game Changer chegando: a mesa escurece em volta da carta, um holofote acende, a gema gira acima dela e pousa no
## canto, com a faixa "Game Changer" e o nome da carta.
static func game_changer(parent: Node3D, table: TableView, pos: Vector3, label: String, speed: float = 1.0) -> void:
	var total: float = 2.1 / speed
	_dim(parent, pos, total)
	var spot := SpotLight3D.new()
	spot.position = pos + Vector3(0, 4.0, 0.4)
	spot.look_at_from_position(spot.position, pos)
	spot.spot_angle = 16.0
	spot.spot_range = 7.0
	spot.light_color = Color(0.85, 1.0, 0.95)
	spot.light_energy = 0.0
	parent.add_child(spot)
	var lamp := spot.create_tween()
	lamp.tween_property(spot, "light_energy", 9.0, 0.25 / speed)
	lamp.tween_interval(total - 0.7 / speed)
	lamp.tween_property(spot, "light_energy", 0.0, 0.45 / speed)
	lamp.tween_callback(spot.queue_free)
	var gem := _gem()
	gem.position = pos + Vector3(0, 0.3, 0)
	gem.scale = Vector3.ONE * 0.01
	parent.add_child(gem)
	var corner: Vector3 = pos + Vector3(0.24, 0.05, -0.34)
	var spin := gem.create_tween()
	spin.tween_property(gem, "rotation:y", TAU * 3.0, total).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var path := gem.create_tween()
	path.tween_property(gem, "position:y", pos.y + 1.0, 0.45 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	path.parallel().tween_property(gem, "scale", Vector3.ONE * 0.22, 0.45 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	path.tween_callback(func() -> void:
		Fx.burst(parent, gem.position, GEM, 40, 1.8, 0.6, 0.07)
		Fx.light(parent, gem.position, GEM, 4.0, 4.0, 0.6 / speed))
	path.tween_interval(total * 0.42)
	path.tween_property(gem, "position", corner, 0.3 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	path.parallel().tween_property(gem, "scale", Vector3.ONE * 0.07, 0.3 / speed)
	path.tween_callback(func() -> void:
		Fx.burst(parent, corner, GEM.lerp(Color.WHITE, 0.4), 30, 1.4, 0.5, 0.06)
		Fx.ring(parent, Vector3(corner.x, 0.02, corner.z), GEM, 0.5, 0.35 / speed, 0.2))
	path.tween_property(gem, "scale", Vector3.ONE * 0.001, 0.2 / speed)
	path.tween_callback(gem.queue_free)
	var at: Vector3 = MomentPieces.beside(table, pos, 0.0)
	MomentPieces.title(parent, at, "Game Changer", GEM.lerp(Color.WHITE, 0.15), Color(0.0, 0.14, 0.12), 96, 1.6 / speed, 0.15 / speed)
	if label != "":
		var below: Vector3 = at - MomentPieces.screen_up(parent) * 0.45
		MomentPieces.after(parent, 0.3 / speed, func() -> void:
			Fx.float_text(parent, below - Vector3(0, 0.5, 0), label, Color(0.92, 1.0, 0.97), 46, 1.4 / speed))


## A ficha vira objeto: ele salta da carta girando, paira um instante com luz e mergulha nela.
static func token(parent: Node3D, pos: Vector3, kind: String, speed: float = 1.0) -> void:
	var object: Node3D = _token_object(kind)
	if object == null:
		return
	var color: Color = {"coin": GOLD, "glass": Color(0.6, 0.85, 1.0), "apple": Color(0.95, 0.35, 0.25), "drop": Color(0.85, 0.08, 0.12)}.get(kind, GOLD)
	object.position = pos + Vector3(0, 0.05, 0)
	object.scale = Vector3.ONE * 0.01
	parent.add_child(object)
	var glow := OmniLight3D.new()
	glow.light_color = color
	glow.omni_range = 1.6
	glow.light_energy = 0.0
	object.add_child(glow)
	var spin := object.create_tween()
	spin.tween_property(object, "rotation:y", TAU * 2.5, 1.2 / speed)
	var tween := object.create_tween()
	tween.tween_property(object, "position:y", pos.y + 0.75, 0.35 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(object, "scale", Vector3.ONE, 0.35 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(glow, "light_energy", 2.0, 0.3 / speed)
	tween.tween_callback(func() -> void: Fx.burst(parent, object.position, color.lerp(Color.WHITE, 0.4), 18, 1.0, 0.5, 0.06))
	tween.tween_property(object, "position:y", pos.y + 0.85, 0.4 / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(object, "position:y", pos.y + 0.05, 0.22 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(object, "scale", Vector3.ONE * 0.25, 0.22 / speed)
	tween.parallel().tween_property(glow, "light_energy", 0.0, 0.22 / speed)
	tween.tween_callback(func() -> void:
		Fx.ring(parent, Vector3(pos.x, 0.02, pos.z), color, 0.9, 0.4 / speed, 0.18)
		Fx.burst(parent, pos + Vector3(0, 0.08, 0), color, 26, 1.2, 0.45, 0.07)
		object.queue_free())


## A arte da carta saindo da moldura: cresce em volta da carta, de frente para a câmera, com as bordas esfumadas.
static func _art_bloom(parent: Node3D, node: CardNode, pos: Vector3, duration: float) -> void:
	var material_card: ShaderMaterial = CardDressing.material_of(node)
	var tex: Variant = material_card.get_shader_parameter("front_tex") if material_card else null
	if not tex is Texture2D:
		return
	var quad := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = Vector2(0.53, 0.4)
	quad.mesh = mesh
	var material := ShaderMaterial.new()
	material.shader = _bloom()
	material.set_shader_parameter("art", tex)
	quad.material_override = material
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.position = pos + Vector3(0, 0.6, 0)
	parent.add_child(quad)
	var set_alpha: Callable = func(a: float) -> void: material.set_shader_parameter("alpha", a)
	var tween := quad.create_tween()
	tween.tween_property(quad, "scale", Vector3.ONE * 4.2, duration * 0.35).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_method(set_alpha, 0.0, 0.95, duration * 0.3)
	tween.parallel().tween_property(quad, "position:y", pos.y + 1.5, duration * 0.35)
	tween.tween_property(quad, "scale", Vector3.ONE * 4.5, duration * 0.3)
	tween.tween_property(quad, "scale", Vector3.ONE, duration * 0.35).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(set_alpha, 0.95, 0.0, duration * 0.35)
	tween.parallel().tween_property(quad, "position:y", pos.y + 0.1, duration * 0.35)
	tween.tween_callback(quad.queue_free)


## Véu escuro sobre o tampo com um furo em volta de `pos`, que entra e sai em `total` segundos.
static func _dim(parent: Node3D, pos: Vector3, total: float) -> MeshInstance3D:
	if Fx.quality == 0:
		return null
	var veil := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(40, 30)
	veil.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = _dim_material()
	material.set_shader_parameter("hole", Vector2(pos.x, pos.z))
	veil.material_override = material
	veil.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	veil.position = Vector3(0, minf(pos.y, 0.3) + 0.25, 0)
	parent.add_child(veil)
	var set_amount: Callable = func(a: float) -> void: material.set_shader_parameter("amount", a)
	var tween := veil.create_tween()
	tween.tween_method(set_amount, 0.0, 0.5, total * 0.15)
	tween.tween_interval(total * 0.6)
	tween.tween_method(set_amount, 0.5, 0.0, total * 0.25)
	tween.tween_callback(veil.queue_free)
	return veil


static func _gem() -> MeshInstance3D:
	var gem := MeshInstance3D.new()
	var shape := SphereMesh.new()
	# Quatro lados e dois anéis: uma gema lapidada de oito faces.
	shape.radial_segments = 6
	shape.rings = 2
	shape.radius = 1.0
	shape.height = 2.6
	gem.mesh = shape
	var material := StandardMaterial3D.new()
	material.albedo_color = GEM.darkened(0.3)
	material.metallic = 0.3
	material.roughness = 0.12
	material.emission_enabled = true
	material.emission = GEM
	material.emission_energy_multiplier = 1.6
	material.rim_enabled = true
	material.rim = 1.0
	gem.material_override = material
	gem.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return gem


static func _token_object(kind: String) -> Node3D:
	var root := Node3D.new()
	match kind:
		"coin":
			var coin := _part(root, _cylinder(0.24, 0.05), _material(GOLD, 0.85, 0.28, 0.15))
			coin.rotation_degrees = Vector3(90, 0, 0)
			var rim := _part(root, _torus(0.205, 0.245), _material(GOLD.lightened(0.15), 0.9, 0.2, 0.2))
			rim.rotation_degrees = Vector3(90, 0, 0)
		"glass":
			var ring := _part(root, _torus(0.17, 0.215), _material(Color(0.78, 0.6, 0.3), 0.9, 0.3, 0.05))
			ring.rotation_degrees = Vector3(90, 0, 0)
			var lens := _part(root, _cylinder(0.175, 0.012), _material(Color(0.6, 0.85, 1.0, 0.45), 0.0, 0.05, 0.25))
			lens.rotation_degrees = Vector3(90, 0, 0)
			var handle := _part(root, _cylinder(0.035, 0.28), _material(Color(0.35, 0.2, 0.1), 0.0, 0.6, 0.0))
			handle.position = Vector3(0.16, -0.26, 0)
			handle.rotation_degrees = Vector3(0, 0, 32)
		"apple":
			var fruit := _part(root, _sphere(0.2, 0.36), _material(Color(0.82, 0.12, 0.1), 0.0, 0.35, 0.05))
			fruit.scale = Vector3(1.05, 0.95, 1.05)
			var stem := _part(root, _cylinder(0.015, 0.1), _material(Color(0.35, 0.22, 0.1), 0.0, 0.8, 0.0))
			stem.position = Vector3(0, 0.2, 0)
			var leaf := _part(root, _sphere(0.06, 0.02), _material(Color(0.3, 0.75, 0.25), 0.0, 0.5, 0.05))
			leaf.position = Vector3(0.07, 0.22, 0)
			leaf.scale = Vector3(1.4, 1.0, 0.7)
		"drop":
			var body := _part(root, _sphere(0.17, 0.34), _material(Color(0.6, 0.02, 0.05), 0.2, 0.08, 0.35))
			body.position = Vector3(0, -0.05, 0)
			var tip := MeshInstance3D.new()
			var cone := CylinderMesh.new()
			cone.top_radius = 0.0
			cone.bottom_radius = 0.155
			cone.height = 0.22
			tip.mesh = cone
			tip.material_override = body.material_override
			tip.position = Vector3(0, 0.13, 0)
			root.add_child(tip)
		_:
			return null
	return root


static func _part(root: Node3D, mesh: Mesh, material: Material) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.material_override = material
	root.add_child(part)
	return part


static func _material(color: Color, metallic: float, roughness: float, glow: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	material.rim_enabled = true
	material.rim = 0.5
	if color.a < 1.0:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if glow > 0.0:
		material.emission_enabled = true
		material.emission = Color(color, 1.0)
		material.emission_energy_multiplier = glow
	return material


static func _cylinder(radius: float, height: float) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 40
	return mesh


static func _torus(inner: float, outer: float) -> TorusMesh:
	var mesh := TorusMesh.new()
	mesh.inner_radius = inner
	mesh.outer_radius = outer
	mesh.rings = 40
	mesh.ring_segments = 12
	return mesh


static func _sphere(radius: float, height: float) -> SphereMesh:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = height
	return mesh


static func _bloom() -> Shader:
	if _bloom_shader == null:
		_bloom_shader = Shader.new()
		_bloom_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled;
uniform sampler2D art : source_color, filter_linear_mipmap;
uniform float alpha = 1.0;
void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}
void fragment() {
	// A ilustração ocupa mais ou menos de 11% a 56% da altura da carta, dentro da moldura.
	vec2 uv = vec2(mix(0.085, 0.915, UV.x), mix(0.115, 0.555, UV.y));
	vec2 e = min(UV, 1.0 - UV);
	float soft = smoothstep(0.0, 0.16, min(e.x * 1.3, e.y));
	ALBEDO = texture(art, uv).rgb * 1.05;
	ALPHA = soft * alpha;
}
"""
	return _bloom_shader


static func _dim_material() -> Shader:
	if _dim_shader == null:
		_dim_shader = Shader.new()
		_dim_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec2 hole = vec2(0.0);
uniform float amount = 0.0;
varying vec3 world;
void vertex() { world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float d = length(world.xz - hole);
	ALBEDO = vec3(0.0, 0.01, 0.02);
	ALPHA = amount * smoothstep(0.7, 1.9, d);
}
"""
	return _dim_shader
