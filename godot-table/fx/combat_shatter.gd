# A morte em combate: a carta se despedaça em cacos com a imagem dela, que voam para longe do golpe, caem no tampo,
# ficam deitados um instante e se desfazem (o movimento é do combat_shatter.gdshader: uma malha e um desenho só).
class_name CombatShatter
extends RefCounted

const SHADER := preload("res://fx/combat_shatter.gdshader")
## A grade que vira cacos (cada célula, dois triângulos) e quanto o caco dura.
const COLS := 4
const ROWS := 6
const LIFE := 2.0

static var _mesh: ArrayMesh


## Despedaça `node` (o nó some na hora; os cacos ficam no lugar dele): `from` é de onde veio o golpe (null: de frente),
## `color` a brasa nas quebras.
static func break_card(parent: Node3D, node: CardNode, from: Variant, color: Color, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var card: ShaderMaterial = CardDressing.material_of(node)
	var tex: Texture2D = null
	var sleeve := Color(0.42, 0.24, 0.12)
	if card:
		if bool(card.get_shader_parameter("has_front")):
			tex = card.get_shader_parameter("front_tex") as Texture2D
		var raw: Variant = card.get_shader_parameter("sleeve_color")
		if raw is Color:
			sleeve = raw
	spawn(parent, visual.global_transform, tex, sleeve, from, color, speed)
	node.queue_free()


## Os cacos de uma carta em `place` (o transform da face dela), com a face `tex` (null: o verso na cor `sleeve`).
static func spawn(parent: Node3D, place: Transform3D, tex: Texture2D, sleeve: Color, from: Variant, color: Color, speed: float = 1.0) -> MeshInstance3D:
	var shards := MeshInstance3D.new()
	shards.mesh = shards_mesh()
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("front_tex", tex)
	material.set_shader_parameter("has_front", tex != null)
	material.set_shader_parameter("sleeve_color", sleeve)
	material.set_shader_parameter("edge_color", color)
	var inverse: Transform3D = place.affine_inverse()
	var hit := Vector2(0.0, CardNode.SIZE.y * 0.5)
	var push := Vector3(0, 0, -1)
	if from is Vector3:
		var local: Vector3 = inverse * (from as Vector3)
		hit = Vector2(clampf(local.x, -0.4, 0.4), clampf(local.z, -0.55, 0.55))
		var flat: Vector3 = place.origin - (from as Vector3)
		flat.y = 0.0
		if flat.length() > 0.01:
			push = (place.basis.inverse() * flat.normalized())
			push.y = 0.0
			push = push.normalized()
	material.set_shader_parameter("impact", hit)
	material.set_shader_parameter("push", push)
	material.set_shader_parameter("power", 1.0 if Fx.quality > 0 else 0.7)
	material.set_shader_parameter("floor_y", (inverse * Vector3(place.origin.x, 0.004, place.origin.z)).y)
	shards.material_override = material
	# Os vértices saem do lugar no shader: sem margem, a malha seria cortada quando a carta sai da tela.
	shards.extra_cull_margin = 4.0
	parent.add_child(shards)
	shards.global_transform = place
	var life: float = LIFE / speed
	var tween := shards.create_tween().set_parallel(true)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("t", v), 0.0, LIFE, life)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("fade", v), 0.0, 1.0, life * 0.4).set_delay(life * 0.6)
	tween.chain().tween_callback(shards.queue_free)
	return shards


## A face da carta partida em triângulos irregulares (cada um com o centro e duas sementes em CUSTOM0 e a coordenada
## baricêntrica na cor do vértice, para a brasa da borda). Montada uma vez.
static func shards_mesh() -> ArrayMesh:
	if _mesh:
		return _mesh
	var rng := RandomNumberGenerator.new()
	rng.seed = 7341
	var size: Vector2 = CardNode.SIZE
	var points: Array[Vector3] = []
	for row: int in ROWS + 1:
		for col: int in COLS + 1:
			var x: float = (float(col) / COLS - 0.5) * size.x
			var z: float = (float(row) / ROWS - 0.5) * size.y
			# Os pontos de dentro saem da grade (cacos irregulares); os da borda ficam nela.
			if col > 0 and col < COLS:
				x += rng.randf_range(-0.35, 0.35) * size.x / COLS
			if row > 0 and row < ROWS:
				z += rng.randf_range(-0.35, 0.35) * size.y / ROWS
			points.append(Vector3(x, 0, z))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_custom_format(0, SurfaceTool.CUSTOM_RGBA_FLOAT)
	for row: int in ROWS:
		for col: int in COLS:
			var a: Vector3 = points[row * (COLS + 1) + col]
			var b: Vector3 = points[row * (COLS + 1) + col + 1]
			var c: Vector3 = points[(row + 1) * (COLS + 1) + col]
			var d: Vector3 = points[(row + 1) * (COLS + 1) + col + 1]
			if rng.randf() < 0.5:
				_shard(st, a, b, d, size, rng)
				_shard(st, a, d, c, size, rng)
			else:
				_shard(st, a, b, c, size, rng)
				_shard(st, b, d, c, size, rng)
	_mesh = st.commit()
	return _mesh


static func _shard(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, size: Vector2, rng: RandomNumberGenerator) -> void:
	# A ordem dos vértices decide qual lado é a frente (a face da carta, virada para cima); o outro lado é o verso.
	var area: float = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
	if area > 0.0:
		var swap: Vector3 = b
		b = c
		c = swap
	var center: Vector3 = (a + b + c) / 3.0
	var seeds := Color(center.x, center.z, rng.randf(), rng.randf())
	var corners: Array[Color] = [Color(1, 0, 0), Color(0, 1, 0), Color(0, 0, 1)]
	var i: int = 0
	for v: Vector3 in [a, b, c]:
		st.set_normal(Vector3.UP)
		st.set_color(corners[i])
		st.set_uv(Vector2(v.x / size.x + 0.5, v.z / size.y + 0.5))
		st.set_custom(0, seeds)
		st.add_vertex(v)
		i += 1
