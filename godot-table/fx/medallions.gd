# Medalhões em 3D quando muda quem é o monarca, quem tem a dianteira (iniciativa) e o dia/noite: a medalha surge girando
# no meio da mesa com o título, e a do monarca e a da dianteira voam até o retrato de quem ficou com ela; a do dia/noite
# vira de face (sol de um lado, lua do outro), a luz da mesa puxa para a cor dela e entram raios de sol ou luar e estrelas.
class_name Medallions
extends RefCounted

const GOLD := Color(1.0, 0.78, 0.34)
const SILVER := Color(0.8, 0.86, 0.95)
const MONARCH := Color(0.62, 0.24, 0.85)
const INITIATIVE := Color(0.22, 0.48, 0.95)
const DAY := Color(1.0, 0.78, 0.38)
const NIGHT := Color(0.42, 0.52, 1.0)
## Onde a medalha aparece: acima do meio da mesa.
const HOME := Vector3(0, 1.6, 0.6)

static var _shapes: Dictionary = {}


## O monarca (ou a dianteira, com `initiative`) mudou para `player` (`at`: o retrato dele, ou null): a medalha surge,
## gira, mostra o título e voa até ele.
static func crown_holder(parent: Node3D, camera: Camera3D, at: Variant, title: String, subtitle: String, initiative: bool, speed: float = 1.0) -> void:
	var enamel: Color = INITIATIVE if initiative else MONARCH
	var medal: Node3D = _medal(camera, enamel, GOLD, "sword" if initiative else "crown", "sword" if initiative else "crown")
	medal.position = HOME
	medal.scale = Vector3.ONE * 0.01
	parent.add_child(medal)
	var spin: Node3D = medal.get_child(0)
	var turn := spin.create_tween()
	turn.tween_property(spin, "rotation:y", TAU * 2.0, 1.2 / speed).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	var tween := medal.create_tween()
	tween.tween_property(medal, "scale", Vector3.ONE, 0.35 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void:
		Fx.burst(parent, HOME, GOLD, 50, 2.4, 0.7, 0.08)
		Fx.light(parent, HOME, GOLD, 5.0, 6.0, 0.8 / speed))
	MomentPieces.title(parent, HOME + Vector3(0, 1.0, 0.3), title, GOLD.lerp(Color.WHITE, 0.2), enamel.darkened(0.6), 84, 1.5 / speed, 0.2 / speed)
	if subtitle != "":
		MomentPieces.after(parent, 0.35 / speed, func() -> void:
			Fx.float_text(parent, HOME + Vector3(0, -1.05, 0.9), subtitle, Color(1, 1, 1), 50, 1.3 / speed))
	tween.tween_interval(1.0 / speed)
	if at is Vector3:
		var goal: Vector3 = at
		tween.tween_property(medal, "position", goal + Vector3(0, 0.3, 0), 0.45 / speed).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		tween.parallel().tween_property(medal, "scale", Vector3.ONE * 0.35, 0.45 / speed)
		tween.tween_callback(func() -> void:
			Fx.burst(parent, goal + Vector3(0, 0.3, 0), GOLD, 40, 1.8, 0.6, 0.07)
			MomentExtras.flare(parent, goal + Vector3(0, 0.3, 0), GOLD.lightened(0.2), 1.5, 0.45 / speed)
			MomentExtras.sparkles(parent, goal + Vector3(0, 0.3, 0), GOLD.lightened(0.4), 0.4, 0.5 / speed, 10, 0.18))
	tween.tween_property(medal, "scale", Vector3.ONE * 0.001, 0.18 / speed)
	tween.tween_callback(medal.queue_free)


## Virou dia ou noite: a medalha (sol de um lado, lua do outro) surge mostrando o de antes e vira para o novo.
static func day_night(parent: Node3D, camera: Camera3D, day: bool, mood: TableMood, speed: float = 1.0) -> void:
	var medal: Node3D = _medal(camera, Color(0.12, 0.2, 0.42), SILVER.lerp(GOLD, 0.5), "moon" if day else "sun", "sun" if day else "moon")
	medal.position = HOME
	medal.scale = Vector3.ONE * 0.01
	parent.add_child(medal)
	var spin: Node3D = medal.get_child(0)
	var color: Color = DAY if day else NIGHT
	var tween := medal.create_tween()
	tween.tween_property(medal, "scale", Vector3.ONE * 1.2, 0.3 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_interval(0.2 / speed)
	tween.tween_property(spin, "rotation:y", PI, 0.5 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void:
		Fx.burst(parent, HOME, color, 60, 2.6, 0.8, 0.08)
		Fx.light(parent, HOME, color, 6.0, 9.0, 1.0 / speed)
		Fx.ring(parent, Vector3(HOME.x, 0.03, HOME.z), color, 6.0, 0.9 / speed, 0.06)
		# De dia, raios de sol quentes entram pela mesa; de noite, uma luz fria de lua e estrelas piscando.
		MomentExtras.shafts(parent, Vector3(HOME.x, 0.0, HOME.z), color.lerp(Color.WHITE, 0.25), 4 if day else 3, 1.8 / speed, 3.0, 0.32 if day else 0.22)
		if not day:
			MomentExtras.sparkles(parent, HOME + Vector3(0, 0.8, 0), Color(0.75, 0.82, 1.0), 2.4, 1.4 / speed, 26, 0.16)
		if mood:
			mood.pulse(color, 1.6))
	MomentPieces.title(parent, HOME + Vector3(0, 1.1, 0.3), "Dia" if day else "Noite", color.lerp(Color.WHITE, 0.3), Color(0.02, 0.03, 0.08), 96, 1.5 / speed, 0.6 / speed)
	tween.tween_interval(0.9 / speed)
	tween.tween_property(medal, "position:y", HOME.y + 0.6, 0.4 / speed).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(medal, "scale", Vector3.ONE * 0.001, 0.4 / speed).set_ease(Tween.EASE_IN)
	tween.tween_callback(medal.queue_free)


## A medalha: disco de esmalte com aro dourado, de frente para a câmera, com um emblema em relevo de cada lado. O primeiro
## filho é o que gira.
static func _medal(camera: Camera3D, enamel: Color, metal: Color, front: String, back: String) -> Node3D:
	var holder := Node3D.new()
	if camera:
		holder.basis = camera.global_basis
	var spin := Node3D.new()
	holder.add_child(spin)
	var disc := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.5
	cylinder.bottom_radius = 0.5
	cylinder.height = 0.07
	cylinder.radial_segments = 64
	disc.mesh = cylinder
	disc.rotation_degrees = Vector3(90, 0, 0)
	disc.material_override = _metal(enamel, 0.3, 0.35, 0.35)
	spin.add_child(disc)
	var rim := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.47
	torus.outer_radius = 0.56
	torus.rings = 64
	torus.ring_segments = 12
	rim.mesh = torus
	rim.rotation_degrees = Vector3(90, 0, 0)
	rim.material_override = _metal(metal, 0.95, 0.22, 0.12)
	spin.add_child(rim)
	for side: int in [1, -1]:
		var emblem := MeshInstance3D.new()
		emblem.mesh = _shape(front if side > 0 else back)
		emblem.material_override = _metal(metal, 0.9, 0.25, 0.5)
		emblem.position = Vector3(0, 0, 0.04 * side)
		if side < 0:
			emblem.rotation_degrees = Vector3(0, 180, 0)
		emblem.scale = Vector3.ONE * 0.3
		spin.add_child(emblem)
	return holder


static func _metal(color: Color, metallic: float, roughness: float, glow: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.rim_enabled = true
	material.rim = 0.5
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = glow
	return material


## O emblema em relevo (plano XY, cerca de 2 de largura): coroa, espada, sol ou lua.
static func _shape(kind: String) -> ArrayMesh:
	if _shapes.has(kind):
		return _shapes[kind]
	var polygons: Array[PackedVector2Array] = []
	match kind:
		"crown":
			polygons.append(PackedVector2Array([Vector2(-1.0, -0.42), Vector2(1.0, -0.42), Vector2(1.12, 0.62), Vector2(0.55, 0.12),
				Vector2(0.0, 0.8), Vector2(-0.55, 0.12), Vector2(-1.12, 0.62)]))
			polygons.append(PackedVector2Array([Vector2(-1.0, -0.72), Vector2(1.0, -0.72), Vector2(1.0, -0.52), Vector2(-1.0, -0.52)]))
		"sword":
			polygons.append(PackedVector2Array([Vector2(-0.12, -0.3), Vector2(0.12, -0.3), Vector2(0.12, 0.85), Vector2(0.0, 1.1), Vector2(-0.12, 0.85)]))
			polygons.append(PackedVector2Array([Vector2(-0.55, -0.42), Vector2(0.55, -0.42), Vector2(0.55, -0.3), Vector2(-0.55, -0.3)]))
			polygons.append(PackedVector2Array([Vector2(-0.08, -0.95), Vector2(0.08, -0.95), Vector2(0.08, -0.42), Vector2(-0.08, -0.42)]))
			polygons.append(_circle(Vector2(0, -1.02), 0.13, 16))
		"sun":
			polygons.append(_circle(Vector2.ZERO, 0.5, 32))
			for i: int in 12:
				var a: float = TAU * i / 12.0
				var dir := Vector2(cos(a), sin(a))
				var side := Vector2(-dir.y, dir.x)
				polygons.append(PackedVector2Array([dir * 0.62 + side * 0.11, dir * 1.05, dir * 0.62 - side * 0.11]))
		"moon":
			var outer: PackedVector2Array = _circle(Vector2.ZERO, 0.9, 48)
			var bite: PackedVector2Array = _circle(Vector2(0.42, 0.22), 0.78, 48)
			var clipped: Array[PackedVector2Array] = Geometry2D.clip_polygons(outer, bite)
			polygons.append_array(clipped)
	var vertices := PackedVector3Array()
	for shape: PackedVector2Array in polygons:
		var indices: PackedInt32Array = Geometry2D.triangulate_polygon(shape)
		for index: int in indices:
			vertices.append(Vector3(shape[index].x, shape[index].y, 0))
	var normals := PackedVector3Array()
	normals.resize(vertices.size())
	normals.fill(Vector3(0, 0, 1))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	_shapes[kind] = mesh
	return mesh


static func _circle(center: Vector2, radius: float, steps: int) -> PackedVector2Array:
	var points := PackedVector2Array()
	for i: int in steps:
		var a: float = TAU * i / steps
		points.append(center + Vector2(cos(a), sin(a)) * radius)
	return points
