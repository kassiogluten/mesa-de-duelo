# As peças de malha e material que todas as cartas da mesa dividem: a borda lateral (a espessura do papel) e a sombra de
# contato esfumada. Feitas uma vez só e guardadas.
class_name CardMeshes
extends RefCounted

static var _edge_mesh: ArrayMesh
static var _shadow_material: StandardMaterial3D


## A borda lateral: um anel de cantos arredondados do tamanho da carta, de y = 0 a y = −THICKNESS (o mesmo para todas).
static func edge() -> ArrayMesh:
	if _edge_mesh:
		return _edge_mesh
	var outline: PackedVector2Array = []
	var half: Vector2 = CardNode.SIZE / 2.0 - Vector2(CardNode.CORNER, CardNode.CORNER)
	var corners: Array[Vector2] = [Vector2(half.x, half.y), Vector2(-half.x, half.y), Vector2(-half.x, -half.y), Vector2(half.x, -half.y)]
	for c: int in 4:
		for step: int in 7:
			var angle: float = c * PI / 2.0 + step * (PI / 2.0) / 6.0
			outline.append(corners[c] + Vector2(cos(angle), sin(angle)) * CardNode.CORNER)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i: int in outline.size():
		var a: Vector2 = outline[i]
		var b: Vector2 = outline[(i + 1) % outline.size()]
		var normal := Vector3(b.y - a.y, 0, -(b.x - a.x)).normalized()
		# A normal aponta para fora do anel.
		if normal.dot(Vector3(a.x + b.x, 0, a.y + b.y)) < 0:
			normal = -normal
		var top_a := Vector3(a.x, -0.0005, a.y)
		var top_b := Vector3(b.x, -0.0005, b.y)
		var low_a := Vector3(a.x, -CardNode.THICKNESS, a.y)
		var low_b := Vector3(b.x, -CardNode.THICKNESS, b.y)
		for v: Vector3 in [top_a, low_a, low_b, top_a, low_b, top_b]:
			st.set_normal(normal)
			st.add_vertex(v)
	_edge_mesh = st.commit()
	return _edge_mesh


## Material da sombra de contato: um retângulo de cantos redondos com a borda bem esfumada.
static func shadow_material() -> StandardMaterial3D:
	if _shadow_material:
		return _shadow_material
	var w: int = 96
	var h: int = 128
	var image := Image.create(w, h, false, Image.FORMAT_RGBA8)
	var inner := Vector2(w, h) / 2.0 / 1.22
	for y: int in h:
		for x: int in w:
			var p := Vector2(absf(x + 0.5 - w / 2.0), absf(y + 0.5 - h / 2.0))
			var q: Vector2 = p - (inner - Vector2(6, 6))
			var d: float = Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - 6.0
			var a: float = clampf(1.0 - (d + 4.0) / 13.0, 0.0, 1.0)
			image.set_pixel(x, y, Color(0, 0, 0, a * a * 0.6))
	image.generate_mipmaps()
	_shadow_material = StandardMaterial3D.new()
	_shadow_material.albedo_texture = ImageTexture.create_from_image(image)
	_shadow_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shadow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shadow_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return _shadow_material
