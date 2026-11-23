# Os escudos dos bloqueadores (filho do CombatStage): o escudo de energia na cor de cada bloqueador, virado para o
# atacante, e a linha que estala entre os dois até o golpe partir o escudo ou o combate acabar.
class_name CombatLinks
extends Node3D

const SHIELD := preload("res://fx/combat_shield.gdshader")
const LINE := preload("res://fx/combat_line.gdshader")

var stage: CombatStage
## bloqueador → {attacker, shield, shield_mat, line, mesh, line_mat, seed, dir}
var _links: Dictionary = {}
var _clock: float = 0.0


## Quantos escudos estão de pé (os testes conferem que o fim do combate apaga todos).
func count() -> int:
	return _links.size()


## O escudo do bloqueador e a linha dele até o atacante (seguem as cartas a cada quadro).
func link(blocker: int, attacker: int, color: Color) -> void:
	if _links.has(blocker):
		spend(blocker, null)
	var shield := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(0.95, 0.72)
	quad.subdivide_width = 12
	quad.subdivide_depth = 2
	shield.mesh = quad
	var shield_mat := ShaderMaterial.new()
	shield_mat.shader = SHIELD
	shield_mat.set_shader_parameter("color", color)
	shield_mat.set_shader_parameter("seed", randf() * 10.0)
	shield.material_override = shield_mat
	shield.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shield.top_level = true
	add_child(shield)
	var line := MeshInstance3D.new()
	var mesh := ImmediateMesh.new()
	line.mesh = mesh
	line.top_level = true
	line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	line.extra_cull_margin = 8.0
	var line_mat := ShaderMaterial.new()
	line_mat.shader = LINE
	line_mat.set_shader_parameter("color", color)
	line_mat.set_shader_parameter("alpha", 0.0)
	add_child(line)
	line.global_transform = Transform3D.IDENTITY
	var entry: Dictionary = {"attacker": attacker, "shield": shield, "shield_mat": shield_mat, "line": line, "mesh": mesh,
		"line_mat": line_mat, "seed": randf() * 100.0, "dir": Vector3.FORWARD}
	_links[blocker] = entry
	_place(blocker, entry)
	var speed: float = _speed()
	var tween := shield.create_tween().set_parallel(true)
	tween.tween_method(func(v: float) -> void: shield_mat.set_shader_parameter("rise", v), 0.0, 1.0, 0.32 / speed).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: line_mat.set_shader_parameter("alpha", v), 0.0, 1.0, 0.25 / speed).set_delay(0.12 / speed)
	tween.tween_method(func(v: float) -> void: shield_mat.set_shader_parameter("hit", v), 0.8, 0.0, 0.35 / speed)


## O golpe acertou o bloqueador `id` (ou o atacante dele) em `at`: o escudo acende ali e se parte.
func hit(id: int, at: Vector3) -> void:
	for blocker: Variant in _links.keys():
		if int(blocker) == id or int((_links[blocker] as Dictionary)["attacker"]) == id:
			spend(int(blocker), at)


## Apaga os escudos cujo bloqueador não bloqueia mais (`attacker_of`: bloqueador → atacante do combate de agora).
func keep_only(attacker_of: Dictionary) -> void:
	for blocker: Variant in _links.keys():
		if not attacker_of.has(blocker):
			spend(int(blocker), null)


## O combate acabou: todos se apagam.
func spend_all() -> void:
	for blocker: Variant in _links.keys():
		spend(int(blocker), null)


## O escudo e a linha se apagam (o golpe partiu o escudo em `at`, ou o combate acabou com null).
func spend(blocker: int, at: Variant) -> void:
	if not _links.has(blocker):
		return
	var entry: Dictionary = _links[blocker]
	_links.erase(blocker)
	var shield: MeshInstance3D = entry["shield"]
	var line: MeshInstance3D = entry["line"]
	var shield_mat: ShaderMaterial = entry["shield_mat"]
	var line_mat: ShaderMaterial = entry["line_mat"]
	var speed: float = _speed()
	var tween := shield.create_tween().set_parallel(true)
	if at is Vector3:
		# O golpe acende o escudo no ponto em que bateu, e ele se desfaz em faíscas.
		var local: Vector3 = shield.global_transform.affine_inverse() * (at as Vector3)
		shield_mat.set_shader_parameter("hit_x", clampf(local.x / 0.95 + 0.5, 0.0, 1.0))
		tween.tween_method(func(v: float) -> void: shield_mat.set_shader_parameter("hit", v), 1.0, 0.0, 0.3 / speed)
		Fx.burst(self, shield.global_position, shield_mat.get_shader_parameter("color") as Color, 22, 1.6, 0.45, 0.06)
		line_mat.set_shader_parameter("alpha", 1.6)
	tween.tween_method(func(v: float) -> void: shield_mat.set_shader_parameter("alpha", v), 1.0, 0.0, (0.3 if at is Vector3 else 0.45) / speed).set_delay(0.06 / speed)
	tween.tween_method(func(v: float) -> void: line_mat.set_shader_parameter("alpha", v), float(line_mat.get_shader_parameter("alpha")), 0.0, 0.25 / speed)
	tween.chain().tween_callback(func() -> void:
		shield.queue_free()
		line.queue_free())


func _process(delta: float) -> void:
	_clock += delta
	for blocker: Variant in _links.keys():
		_place(int(blocker), _links[blocker])


func _speed() -> float:
	return stage.director.speed if stage and stage.director else 1.0


## O escudo na frente do bloqueador, virado para o atacante, e a linha entre os dois, tremendo.
func _place(blocker: int, entry: Dictionary) -> void:
	var b: Variant = stage.position_of(blocker) if stage else null
	if not b is Vector3:
		spend(blocker, null)
		return
	var a: Variant = stage.position_of(int(entry["attacker"]))
	var dir: Vector3 = entry["dir"]
	if a is Vector3:
		var flat: Vector3 = (a as Vector3) - (b as Vector3)
		flat.y = 0.0
		if flat.length() > 0.05:
			dir = flat.normalized()
			entry["dir"] = dir
	var shield: MeshInstance3D = entry["shield"]
	shield.global_transform = Transform3D(Basis.looking_at(-dir, Vector3.UP), (b as Vector3) + dir * 0.5 + Vector3(0, 0.33, 0))
	if a is Vector3:
		_draw_line(entry, (b as Vector3) + Vector3(0, 0.12, 0), (a as Vector3) + Vector3(0, 0.12, 0))


func _draw_line(entry: Dictionary, a: Vector3, b: Vector3) -> void:
	var mesh: ImmediateMesh = entry["mesh"]
	mesh.clear_surfaces()
	var camera: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null
	if camera == null or a.distance_to(b) < 0.05:
		return
	var segments: int = 16
	# Os estalos trocam 20 vezes por segundo (a linha treme sem tremer a cada quadro).
	var tick: float = floorf(_clock * 20.0) + float(entry["seed"])
	var along: Vector3 = (b - a).normalized()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP, entry["line_mat"])
	for i: int in segments + 1:
		var t: float = float(i) / segments
		var bulge: float = sin(t * PI)
		var p: Vector3 = a.lerp(b, t) + Vector3.UP * bulge * 0.42
		var side: Vector3 = along.cross((camera.global_position - p).normalized()).normalized()
		p += side * (_hash(tick * 31.0 + i) - 0.5) * 0.1 * bulge + Vector3.UP * (_hash(tick * 17.0 + i * 3.0) - 0.5) * 0.05 * bulge
		var width: float = 0.05
		mesh.surface_set_uv(Vector2(t, 0.0))
		mesh.surface_add_vertex(p + side * width)
		mesh.surface_set_uv(Vector2(t, 1.0))
		mesh.surface_add_vertex(p - side * width)
	mesh.surface_end()


static func _hash(x: float) -> float:
	return fposmod(sin(x * 12.9898) * 43758.5453, 1.0)
