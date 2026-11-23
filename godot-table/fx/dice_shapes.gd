# Malhas e numeração dos dados 3D: cubo arredondado com pintas e os poliedros (d4, d8, d10, d12, d20) com onde fica cada número.
class_name DiceShapes
extends RefCounted

## Raio (do centro ao vértice) de cada forma; o cubo usa CUBE_HALF.
const RADIUS := {4: 0.6, 8: 0.5, 10: 0.5, 12: 0.5, 20: 0.52}
const CUBE_HALF := 0.25
const CUBE_ROUND := 0.06
## Pintas do d6, em metades da meia-aresta, no plano da face (direita, cima).
const PIPS := {1: [Vector2(0, 0)], 2: [Vector2(-1, 1), Vector2(1, -1)], 3: [Vector2(-1, 1), Vector2(0, 0), Vector2(1, -1)],
	4: [Vector2(-1, 1), Vector2(1, 1), Vector2(-1, -1), Vector2(1, -1)], 5: [Vector2(-1, 1), Vector2(1, 1), Vector2(0, 0), Vector2(-1, -1), Vector2(1, -1)],
	6: [Vector2(-1, 1), Vector2(-1, 0), Vector2(-1, -1), Vector2(1, 1), Vector2(1, 0), Vector2(1, -1)]}

## faces da forma → {mesh, verts, pad, readings: [{value, n, u}], labels: [{pos, n, u, size, value}], pips: [{pos, n, r}]}
## readings: a direção (n) que fica para cima quando sai aquele número e o “em cima” do texto (u); no d4, os vértices.
static var _shapes: Dictionary = {}


## A forma de `faces` faces (montada uma vez só).
static func shape(faces: int) -> Dictionary:
	if not _shapes.has(faces):
		_shapes[faces] = _cube() if faces == 6 else _polyhedron(faces)
	return _shapes[faces]


## Poliedro de faces planas (d4, d8, d10, d12, d20), com os números de faces opostas somando faces + 1.
static func _polyhedron(faces: int) -> Dictionary:
	var verts: PackedVector3Array = _poly_vertices(faces)
	var polys: Array[PackedVector3Array] = _hull(verts)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for poly: PackedVector3Array in polys:
		var n: Vector3 = _normal(poly)
		for i: int in range(1, poly.size() - 1):
			_tri(st, [poly[0], poly[i], poly[i + 1]], [n, n, n])
	var readings: Array[Dictionary] = []
	var labels: Array[Dictionary] = []
	if faces == 4:
		# No d4 vale o vértice de cima: cada face mostra, junto de cada vértice, o número dele.
		for i: int in verts.size():
			var n: Vector3 = verts[i].normalized()
			for poly: PackedVector3Array in polys:
				if _index_in(poly, verts[i]) >= 0:
					var f: Vector3 = _normal(poly)
					readings.append({"value": i + 1, "n": n, "u": -(f - n * f.dot(n)).normalized()})
					break
		for poly: PackedVector3Array in polys:
			var c: Vector3 = _center(poly)
			for p: Vector3 in poly:
				labels.append({"pos": c + (p - c) * 0.52, "n": _normal(poly), "u": (p - c).normalized(), "size": _inradius(poly) * 0.62, "value": _index_in(verts, p) + 1})
	else:
		var values: PackedInt32Array = _pair_values(polys, faces)
		for i: int in polys.size():
			var poly: PackedVector3Array = polys[i]
			var c: Vector3 = _center(poly)
			var n: Vector3 = _normal(poly)
			var tip: Vector3 = poly[0]
			if faces == 10:
				for p: Vector3 in poly:
					if absf(p.y) > absf(tip.y):
						tip = p
			var u: Vector3 = (tip - c).normalized()
			readings.append({"value": values[i], "n": n, "u": u})
			var size: float = _inradius(poly) * (1.05 if poly.size() == 3 else 0.95)
			labels.append({"pos": c - u * size * 0.06, "n": n, "u": u, "size": size, "value": values[i]})
	return {"mesh": st.commit(), "verts": verts, "pad": 0.0, "readings": readings, "labels": labels, "pips": []}


## Cubo de cantos arredondados com as pintas do d6 (1 oposto ao 6, 2 ao 5, 3 ao 4).
static func _cube() -> Dictionary:
	var h: float = CUBE_HALF
	var flat: float = CUBE_HALF - CUBE_ROUND
	var grid: PackedFloat32Array = []
	var steps: int = 4
	for i: int in range(steps, -1, -1):
		grid.append(-(flat + CUBE_ROUND * sin(PI / 2.0 * i / steps)))
	for i: int in range(0, steps + 1):
		grid.append(flat + CUBE_ROUND * sin(PI / 2.0 * i / steps))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var readings: Array[Dictionary] = []
	var labels: Array[Dictionary] = []
	var pips: Array[Dictionary] = []
	for face: Array in [[Vector3.UP, Vector3.FORWARD, 1], [Vector3.DOWN, Vector3.FORWARD, 6], [Vector3.RIGHT, Vector3.UP, 3],
			[Vector3.LEFT, Vector3.UP, 4], [Vector3.BACK, Vector3.UP, 2], [Vector3.FORWARD, Vector3.UP, 5]]:
		var n: Vector3 = face[0]
		var u: Vector3 = face[1]
		var r: Vector3 = u.cross(n)
		var value: int = face[2]
		var points: Array[Vector3] = []
		var normals: Array[Vector3] = []
		for a: float in grid:
			for b: float in grid:
				var p: Vector3 = n * h + r * a + u * b
				var inner: Vector3 = p.clamp(-Vector3.ONE * flat, Vector3.ONE * flat)
				var out: Vector3 = (p - inner).normalized()
				points.append(inner + out * CUBE_ROUND)
				normals.append(out)
		var side: int = grid.size()
		for a: int in side - 1:
			for b: int in side - 1:
				var i0: int = a * side + b
				var i1: int = (a + 1) * side + b
				var i2: int = (a + 1) * side + b + 1
				var i3: int = a * side + b + 1
				_tri(st, [points[i0], points[i1], points[i2]], [normals[i0], normals[i1], normals[i2]])
				_tri(st, [points[i0], points[i2], points[i3]], [normals[i0], normals[i2], normals[i3]])
		readings.append({"value": value, "n": n, "u": u})
		labels.append({"pos": n * h, "n": n, "u": u, "size": h * 0.95, "value": value})
		for spot: Vector2 in PIPS[value]:
			pips.append({"pos": n * (h - 0.003) + (r * spot.x + u * spot.y) * h * 0.5, "n": n, "r": r})
	var corners := PackedVector3Array()
	for x: float in [-flat, flat]:
		for y: float in [-flat, flat]:
			for z: float in [-flat, flat]:
				corners.append(Vector3(x, y, z))
	return {"mesh": st.commit(), "verts": corners, "pad": CUBE_ROUND, "readings": readings, "labels": labels, "pips": pips}


## Triângulo com a frente para fora (o Godot desenha a frente no sentido horário).
static func _tri(st: SurfaceTool, points: Array[Vector3], normals: Array[Vector3]) -> void:
	var order: Array[int] = [0, 1, 2]
	if (points[1] - points[0]).cross(points[2] - points[0]).dot(normals[0] + normals[1] + normals[2]) > 0.0:
		order = [0, 2, 1]
	for i: int in order:
		st.set_normal(normals[i])
		st.add_vertex(points[i])


static func _poly_vertices(faces: int) -> PackedVector3Array:
	var phi: float = (1.0 + sqrt(5.0)) / 2.0
	var out := PackedVector3Array()
	match faces:
		4:
			out = PackedVector3Array([Vector3(1, 1, 1), Vector3(1, -1, -1), Vector3(-1, 1, -1), Vector3(-1, -1, 1)])
		8:
			out = PackedVector3Array([Vector3.RIGHT, Vector3.LEFT, Vector3.UP, Vector3.DOWN, Vector3.BACK, Vector3.FORWARD])
		10:
			# Trapezoedro pentagonal: a altura dos polos que deixa cada pipa plana.
			var ring: float = 0.11
			var apex: float = ring * (1.0 + cos(PI / 5.0)) / (1.0 - cos(PI / 5.0))
			out.append(Vector3(0, apex, 0))
			out.append(Vector3(0, -apex, 0))
			for k: int in 10:
				out.append(Vector3(cos(k * PI / 5.0), ring if k % 2 == 0 else -ring, sin(k * PI / 5.0)))
		12:
			for x: float in [-1.0, 1.0]:
				for y: float in [-1.0, 1.0]:
					out.append(Vector3(x, y, -1))
					out.append(Vector3(x, y, 1))
					out.append(Vector3(0, x / phi, y * phi))
					out.append(Vector3(x / phi, y * phi, 0))
					out.append(Vector3(x * phi, 0, y / phi))
		_:
			for a: float in [-1.0, 1.0]:
				for b: float in [-1.0, 1.0]:
					out.append(Vector3(0, a, b * phi))
					out.append(Vector3(a, b * phi, 0))
					out.append(Vector3(a * phi, 0, b))
	var far: float = 0.0
	for v: Vector3 in out:
		far = maxf(far, v.length())
	var scale: float = float(RADIUS.get(faces, 0.5)) / far
	for i: int in out.size():
		out[i] *= scale
	return out


## Faces do fecho convexo dos vértices, cada uma com os vértices em volta do centro dela.
static func _hull(verts: PackedVector3Array) -> Array[PackedVector3Array]:
	var out: Array[PackedVector3Array] = []
	var normals: Array[Vector3] = []
	var eps: float = 0.002
	for i: int in verts.size():
		for j: int in range(i + 1, verts.size()):
			for k: int in range(j + 1, verts.size()):
				var n: Vector3 = (verts[j] - verts[i]).cross(verts[k] - verts[i])
				if n.length() < 1e-6:
					continue
				n = n.normalized()
				if n.dot(verts[i]) < 0.0:
					n = -n
				var d: float = n.dot(verts[i])
				var outside: bool = false
				for v: Vector3 in verts:
					if n.dot(v) > d + eps:
						outside = true
						break
				if outside or normals.any(func(m: Vector3) -> bool: return m.dot(n) > 0.999):
					continue
				var poly := PackedVector3Array()
				for v: Vector3 in verts:
					if absf(n.dot(v) - d) <= eps:
						poly.append(v)
				var c: Vector3 = _center(poly)
				var e1: Vector3 = (poly[0] - c).normalized()
				var e2: Vector3 = n.cross(e1)
				var sorted: Array = Array(poly)
				sorted.sort_custom(func(a: Vector3, b: Vector3) -> bool:
					return atan2((a - c).dot(e2), (a - c).dot(e1)) < atan2((b - c).dot(e2), (b - c).dot(e1)))
				out.append(PackedVector3Array(sorted))
				normals.append(n)
	return out


static func _pair_values(polys: Array[PackedVector3Array], faces: int) -> PackedInt32Array:
	var values := PackedInt32Array()
	values.resize(polys.size())
	values.fill(0)
	var next: int = 1
	for i: int in polys.size():
		if values[i] != 0:
			continue
		values[i] = next
		var n: Vector3 = _normal(polys[i])
		for j: int in polys.size():
			if j != i and values[j] == 0 and _normal(polys[j]).dot(n) < -0.999:
				values[j] = faces + 1 - next
				break
		next += 1
	return values


static func _center(poly: PackedVector3Array) -> Vector3:
	var sum := Vector3.ZERO
	for p: Vector3 in poly:
		sum += p
	return sum / poly.size()


static func _normal(poly: PackedVector3Array) -> Vector3:
	var n: Vector3 = (poly[1] - poly[0]).cross(poly[2] - poly[0]).normalized()
	return -n if n.dot(_center(poly)) < 0.0 else n


static func _inradius(poly: PackedVector3Array) -> float:
	var c: Vector3 = _center(poly)
	var best: float = INF
	for i: int in poly.size():
		var a: Vector3 = poly[i]
		var edge: Vector3 = (poly[(i + 1) % poly.size()] - a).normalized()
		var off: Vector3 = c - a
		best = minf(best, (off - edge * off.dot(edge)).length())
	return best


static func _index_in(points: PackedVector3Array, point: Vector3) -> int:
	for i: int in points.size():
		if points[i].distance_to(point) < 1e-4:
			return i
	return -1
