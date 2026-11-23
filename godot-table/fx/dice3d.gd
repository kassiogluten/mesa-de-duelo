# Dados e moeda em 3D de verdade: o dado cai, quica, rola e para com o resultado virado para cima, e a moeda gira no ar e cai na face certa.
class_name Dice3D
extends RefCounted

## Quanto o dado (ou a moeda) fica parado mostrando o resultado antes de sumir.
const HOLD := 1.2
const GOLD := Color(1.0, 0.8, 0.3)
## Cor dos números e das pintas.
const INK := Color(1.0, 0.93, 0.74)
## Cor do corpo de cada forma de dado (pelo número de faces).
const BODY := {4: Color(0.05, 0.42, 0.25), 6: Color(0.62, 0.05, 0.09), 8: Color(0.78, 0.34, 0.05), 10: Color(0.03, 0.38, 0.46), 12: Color(0.38, 0.1, 0.58), 20: Color(0.08, 0.15, 0.58)}
const SHAPES: Array[int] = [4, 6, 8, 10, 12, 20]
const COIN_RADIUS := 0.42
const COIN_HALF := 0.03

static var _pip_mesh: CylinderMesh
## [albedo da cara, relevo da cara, albedo da coroa, relevo da coroa]
static var _coin_textures: Array[ImageTexture] = []


## Lança um dado de `sides` faces em `pos` (no tampo): cai, quica, rola e para com `result` em cima; some depois de HOLD s.
static func roll(parent: Node3D, pos: Vector3, sides: int, result: int, duration: float = 1.4) -> Node3D:
	return _roll(parent, pos, sides, result, duration, HOLD, Color(0, 0, 0, 0), Callable())


## Moeda dourada que sobe girando, cai na face certa (Cara ou Coroa), quica, assenta girando e some.
static func coin(parent: Node3D, pos: Vector3, heads: bool, duration: float = 1.3) -> Node3D:
	var root := _make_coin()
	var spin: Node3D = root.get_node("Spin")
	var final: Basis = _basis_for(Vector3.UP if heads else Vector3.DOWN, Vector3.FORWARD if heads else Vector3.BACK)
	var start: Vector3 = pos + Vector3(randf_range(-0.35, 0.35), 0.35, 0.8)
	var axis: Vector3 = Vector3.RIGHT.rotated(Vector3.UP, randf_range(-0.35, 0.35))
	var turns: float = TAU * randf_range(4.0, 5.5)
	var phase: float = randf() * TAU
	var land: float = 0.62
	var rim: PackedVector3Array = _coin_rim()
	var pose: Callable = func(t: float) -> void:
		var basis: Basis
		if t < land:
			basis = Basis(axis, turns * pow(1.0 - t / land, 1.6)) * final
		else:
			# Assenta como moeda de verdade: inclinada, girando cada vez mais rápido, até deitar.
			var k: float = (t - land) / (1.0 - land)
			var around: float = phase + 16.0 * pow(k, 1.3)
			basis = Basis(Vector3(cos(around), 0, sin(around)), 0.26 * pow(1.0 - k, 2.0)) * final
		spin.basis = basis
		var height: float = 0.0
		if t < land:
			var k: float = t / land
			height = 0.35 * (1.0 - k) + 2.1 * 4.0 * k * (1.0 - k)
		elif t < land + 0.13:
			var k: float = (t - land) / 0.13
			height = 0.12 * 4.0 * k * (1.0 - k)
		var flat: Vector3 = start.lerp(pos, 1.0 - pow(1.0 - t, 2.0))
		root.position = Vector3(flat.x, pos.y + maxf(COIN_HALF + height, -_lowest_of(rim, 0.0, basis)), flat.z)
	pose.call(0.0)
	root.scale = Vector3.ONE * 0.3
	parent.add_child(root)
	var tween := root.create_tween()
	tween.tween_method(pose, 0.0, 1.0, duration)
	tween.parallel().tween_property(root, "scale", Vector3.ONE, duration * 0.12)
	tween.parallel().tween_callback(func() -> void: _thud(parent, root, pos.y, 0.7)).set_delay(duration * land)
	tween.tween_callback(func() -> void:
		var ground := Vector3(root.position.x, pos.y, root.position.z)
		Fx.ring(parent, ground, GOLD, 1.1, 0.5, 0.1)
		Fx.light(parent, ground, GOLD, 3.0, 3.0, 0.5)
		Fx.burst(parent, ground + Vector3(0, 0.15, 0), GOLD, 18, 1.1, 0.5, 0.07))
	_fade_out(tween, root, HOLD)
	return root


## O d6 de quem começa: rodada por rodada (empates rolam de novo), um dado por jogador; o vencedor da última ganha destaque dourado.
## `positions`: id do jogador → ponto no tampo; `rolls`: [[{player, roll}, ...], ...] como no evento starting-roll.
static func starting_roll(parent: Node3D, positions: Dictionary, rolls: Array) -> void:
	var where: Dictionary = {}
	for key: Variant in positions:
		where[int(key)] = positions[key]
	var tween := parent.create_tween()
	var spin_time: float = 1.25
	for i: int in rolls.size():
		var entries: Array = rolls[i] if rolls[i] is Array else []
		var last: bool = i == rolls.size() - 1
		var best: int = -1
		var top: int = -1
		var spots: Array[Vector3] = []
		for raw: Variant in entries:
			if raw is Dictionary and where.has(int((raw as Dictionary).get("player", -1))):
				var value: int = int((raw as Dictionary).get("roll", 0))
				spots.append(where[int((raw as Dictionary).get("player", -1))])
				if value > top:
					top = value
					best = int((raw as Dictionary).get("player", -1))
		if spots.is_empty():
			continue
		tween.tween_callback(func() -> void:
			for raw: Variant in entries:
				if not raw is Dictionary or not where.has(int((raw as Dictionary).get("player", -1))):
					continue
				var player: int = int((raw as Dictionary).get("player", -1))
				var on_stop: Callable = Callable()
				if last and player == best:
					on_stop = func(die: Node3D) -> void: _crown(parent, die)
				_roll(parent, where[player], 6, int((raw as Dictionary).get("roll", 1)), spin_time, 2.2 if last else 0.6, Color(0, 0, 0, 0), on_stop))
		tween.tween_interval(spin_time)
		if not last:
			var middle := Vector3.ZERO
			for spot: Vector3 in spots:
				middle += spot / spots.size()
			tween.tween_callback(func() -> void: Fx.float_text(parent, middle, "Empate!", Color(0.92, 0.94, 1.0), 64, 1.0))
			tween.tween_interval(0.9)


## A rotação do dado parado com `result` virado para cima e legível de quem olha da câmera (texto “em pé” para o lado do oponente).
static func final_basis(sides: int, result: int) -> Basis:
	var shape: Dictionary = DiceShapes.shape(shape_for(sides))
	var value: int = face_value(sides, result)
	for reading: Dictionary in shape["readings"]:
		if int(reading["value"]) == value:
			return _basis_for(reading["n"], reading["u"])
	return Basis.IDENTITY


## O número que está em cima com o dado nessa rotação (a face, ou no d4 o vértice, mais alto).
static func top_value(sides: int, basis: Basis) -> int:
	var best: int = 0
	var height: float = -INF
	for reading: Dictionary in DiceShapes.shape(shape_for(sides))["readings"]:
		var y: float = (basis * (reading["n"] as Vector3)).y
		if y > height:
			height = y
			best = int(reading["value"])
	return best


## A forma usada para um dado de `sides` faces: a menor das formas de verdade que comporta todos os números.
static func shape_for(sides: int) -> int:
	for faces: int in SHAPES:
		if sides <= faces:
			return faces
	return 20


## Em qual número da forma o resultado cai (num d100 feito com o d20, o 57 vai para a face 17, que mostra “57”).
static func face_value(sides: int, result: int) -> int:
	return (maxi(result, 1) - 1) % shape_for(sides) + 1


static func _roll(parent: Node3D, pos: Vector3, sides: int, result: int, duration: float, hold: float, tint: Color, on_stop: Callable) -> Node3D:
	var faces: int = shape_for(sides)
	var shape: Dictionary = DiceShapes.shape(faces)
	var color: Color = tint if tint.a > 0.0 else BODY[faces]
	var die := _make_die(sides, result, color)
	var spin: Node3D = die.get_node("Spin")
	var final: Basis = final_basis(sides, result)
	var rest: float = -_lowest(shape, final)
	var heading: float = randf() * TAU
	var dir := Vector3(cos(heading), 0, sin(heading))
	var start: Vector3 = pos - dir * randf_range(1.1, 1.6) + Vector3(0, 2.6, 0)
	var roll_axis: Vector3 = dir.cross(Vector3.UP).normalized()
	var wobble_axis := Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1))
	wobble_axis = wobble_axis.normalized() if wobble_axis.length() > 0.1 else Vector3.UP
	var turns: float = TAU * randf_range(2.0, 3.0)
	var wobble: float = randf_range(1.5, 3.0)
	var pose: Callable = func(t: float) -> void:
		var left: float = pow(1.0 - t, 2.4)
		var basis: Basis = Basis(roll_axis, turns * left) * Basis(wobble_axis, wobble * left * left) * final
		spin.basis = basis
		var flat: Vector3 = start.lerp(pos, 1.0 - pow(1.0 - t, 2.0))
		# O ponto mais baixo nunca entra no tampo: rolando, o dado se apoia nas quinas.
		die.position = Vector3(flat.x, pos.y + maxf(rest + _bounce(t, start.y - pos.y - rest), -_lowest(shape, basis)), flat.z)
	pose.call(0.0)
	die.scale = Vector3.ONE * 0.4
	parent.add_child(die)
	var tween := die.create_tween()
	tween.tween_method(pose, 0.0, 1.0, duration)
	tween.parallel().tween_property(die, "scale", Vector3.ONE, duration * 0.15)
	tween.parallel().tween_callback(func() -> void: _thud(parent, die, pos.y, 1.0)).set_delay(duration * 0.3)
	tween.parallel().tween_callback(func() -> void: _thud(parent, die, pos.y, 0.5)).set_delay(duration * 0.52)
	tween.tween_callback(func() -> void:
		var ground := Vector3(die.position.x, pos.y, die.position.z)
		Fx.ring(parent, ground, color.lightened(0.45), 1.0, 0.5, 0.1)
		Fx.light(parent, ground, color.lightened(0.5), 2.5, 2.5, 0.5)
		for label: Label3D in die.get_meta("result_labels", []):
			label.create_tween().tween_property(label, "modulate", Color(1.7, 1.5, 1.1), 0.25)
		if on_stop.is_valid():
			on_stop.call(die))
	if hold >= 0.0:
		_fade_out(tween, die, hold)
	return die


## Altura acima do repouso: a queda até o primeiro toque e três quiques cada vez menores.
static func _bounce(t: float, drop: float) -> float:
	if t < 0.3:
		var k: float = t / 0.3
		return drop * (1.0 - k * k)
	for hop: Vector3 in [Vector3(0.3, 0.52, 0.5), Vector3(0.52, 0.68, 0.2), Vector3(0.68, 0.79, 0.06)]:
		if t < hop.y:
			var k: float = (t - hop.x) / (hop.y - hop.x)
			return hop.z * 4.0 * k * (1.0 - k)
	return 0.0


## Poeirinha onde o dado ou a moeda bate no tampo.
static func _thud(parent: Node3D, node: Node3D, floor_y: float, strength: float) -> void:
	if not is_instance_valid(node):
		return
	var ground := Vector3(node.position.x, floor_y + 0.04, node.position.z)
	Fx.burst(parent, ground, Color(0.85, 0.8, 0.7), int(14 * strength), 0.9 * strength, 0.35, 0.06)
	Fx.ring(parent, ground, Color(0.7, 0.68, 0.62), 0.6 * strength, 0.35, 0.08)


## Destaque do vencedor do d6 de quem começa: ondas e faíscas douradas, um halo dourado no tampo e o dado crescendo um pouco.
static func _crown(parent: Node3D, die: Node3D) -> void:
	var ground := Vector3(die.position.x, 0.0, die.position.z)
	Fx.ring(parent, ground, GOLD, 1.7, 0.7, 0.14)
	var weak: WeakRef = weakref(parent)
	parent.get_tree().create_timer(0.18).timeout.connect(func() -> void:
		var alive: Node3D = weak.get_ref() as Node3D
		if alive != null:
			Fx.ring(alive, ground, GOLD, 1.2, 0.6, 0.1))
	Fx.burst(parent, ground + Vector3(0, 0.5, 0), GOLD, 40, 1.8, 0.8, 0.09)
	Fx.light(parent, ground, GOLD, 4.0, 3.5, 0.8)
	var halo := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE * 1.5
	halo.mesh = quad
	var glow := StandardMaterial3D.new()
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glow.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	glow.albedo_color = Color(GOLD, 0.0)
	var dot := GradientTexture2D.new()
	dot.fill = GradientTexture2D.FILL_RADIAL
	dot.fill_from = Vector2(0.5, 0.5)
	dot.fill_to = Vector2(1.0, 0.5)
	var fade := Gradient.new()
	fade.set_color(0, Color(1, 1, 1, 1))
	fade.set_color(1, Color(1, 1, 1, 0))
	dot.gradient = fade
	glow.albedo_texture = dot
	halo.material_override = glow
	halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	halo.transform = Transform3D(Basis(Vector3.RIGHT, -PI / 2.0), Vector3(0, -die.position.y + 0.02, 0))
	die.add_child(halo)
	var body: MeshInstance3D = die.get_node("Spin/Body")
	var material: StandardMaterial3D = body.material_override
	material.emission = GOLD
	var rest: float = die.position.y
	var tween := die.create_tween().set_parallel(true)
	tween.tween_property(glow, "albedo_color:a", 0.75, 0.3)
	tween.tween_property(material, "emission_energy_multiplier", 0.18, 0.3)
	tween.tween_property(die, "scale", Vector3.ONE * 1.25, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(die, "position:y", rest * 1.25, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.chain().tween_property(die, "scale", Vector3.ONE * 1.15, 0.25)
	tween.tween_property(die, "position:y", rest * 1.15, 0.25)


## Espera `hold` s e some encolhendo.
static func _fade_out(tween: Tween, node: Node3D, hold: float) -> void:
	tween.tween_interval(hold)
	tween.tween_property(node, "scale", Vector3.ONE * 0.01, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(node.queue_free)


## Rotação que leva a face de normal `n` (e “em cima do texto” `u`) para o alto, com o texto em pé para quem olha da câmera.
static func _basis_for(n: Vector3, u: Vector3) -> Basis:
	var local := Basis(u.cross(n), u, n)
	var world := Basis(Vector3.RIGHT, Vector3.FORWARD, Vector3.UP)
	return (world * local.transposed()).orthonormalized()


static func _lowest(shape: Dictionary, basis: Basis) -> float:
	return _lowest_of(shape["verts"], float(shape["pad"]), basis)


static func _lowest_of(points: PackedVector3Array, pad: float, basis: Basis) -> float:
	var low: float = INF
	for point: Vector3 in points:
		low = minf(low, (basis * point).y)
	return low - pad


# --- Montagem do dado ---------------------------------------------------------------------------------------------------

static func _make_die(sides: int, result: int, color: Color) -> Node3D:
	var faces: int = shape_for(sides)
	var shape: Dictionary = DiceShapes.shape(faces)
	var root := Node3D.new()
	root.name = "Dice3D"
	root.set_meta("sides", sides)
	root.set_meta("result", result)
	var spin := Node3D.new()
	spin.name = "Spin"
	root.add_child(spin)
	var body := MeshInstance3D.new()
	body.name = "Body"
	body.mesh = shape["mesh"]
	body.material_override = _body_material(color)
	spin.add_child(body)
	var shown: int = face_value(sides, result)
	var result_labels: Array[Label3D] = []
	if faces == 6 and sides == 6:
		if _pip_mesh == null:
			_pip_mesh = CylinderMesh.new()
			_pip_mesh.top_radius = 0.042
			_pip_mesh.bottom_radius = 0.042
			_pip_mesh.height = 0.01
			_pip_mesh.radial_segments = 20
			_pip_mesh.rings = 1
			var ink := StandardMaterial3D.new()
			ink.albedo_color = INK
			ink.roughness = 0.35
			ink.emission_enabled = true
			ink.emission = INK
			ink.emission_energy_multiplier = 0.15
			_pip_mesh.material = ink
		for pip: Dictionary in shape["pips"]:
			var dot := MeshInstance3D.new()
			dot.mesh = _pip_mesh
			dot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var n: Vector3 = pip["n"]
			var r: Vector3 = pip["r"]
			dot.transform = Transform3D(Basis(r, n, r.cross(n)), pip["pos"])
			spin.add_child(dot)
	else:
		for spec: Dictionary in shape["labels"]:
			var value: int = int(spec["value"])
			var text: String = str(result) if value == shown else str(value)
			if faces >= 8 and (text == "6" or text == "9"):
				text += "."
			var label := _number(text, float(spec["size"]))
			var n: Vector3 = spec["n"]
			var u: Vector3 = spec["u"]
			label.transform = Transform3D(Basis(u.cross(n), u, n), (spec["pos"] as Vector3) + n * 0.003)
			spin.add_child(label)
			if value == shown:
				result_labels.append(label)
	root.set_meta("result_labels", result_labels)
	return root


static func _number(text: String, size: float) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.font_size = 96
	label.outline_size = 10
	label.modulate = INK
	# Contorno da mesma cor: o número sai mais grosso e se lê de longe.
	label.outline_modulate = INK
	var digits: int = text.replace(".", "").length()
	label.pixel_size = size / (96.0 * 0.72) * (1.0 if digits < 2 else (0.82 if digits == 2 else 0.6))
	label.double_sided = false
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return label


static func _body_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.2
	material.metallic = 0.05
	material.metallic_specular = 0.7
	material.clearcoat_enabled = true
	material.clearcoat = 0.8
	material.clearcoat_roughness = 0.12
	material.rim_enabled = true
	material.rim = 0.35
	material.rim_tint = 0.6
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 0.06
	return material


# --- Montagem da moeda --------------------------------------------------------------------------------------------------

static func _make_coin() -> Node3D:
	var root := Node3D.new()
	root.name = "Coin3D"
	var spin := Node3D.new()
	spin.name = "Spin"
	root.add_child(spin)
	var body := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = COIN_RADIUS
	cylinder.bottom_radius = COIN_RADIUS
	cylinder.height = COIN_HALF * 2.0
	cylinder.radial_segments = 64
	cylinder.rings = 1
	body.mesh = cylinder
	body.material_override = _gold(null, null)
	spin.add_child(body)
	if _coin_textures.is_empty():
		for heads: bool in [true, false]:
			_coin_textures.append_array(_coin_face(heads))
	for heads: bool in [true, false]:
		var face := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2.ONE * COIN_RADIUS * 2.0
		face.mesh = quad
		var at: int = 0 if heads else 2
		var material: StandardMaterial3D = _gold(_coin_textures[at], _coin_textures[at + 1])
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		face.material_override = material
		face.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var n: Vector3 = Vector3.UP if heads else Vector3.DOWN
		var u: Vector3 = Vector3.FORWARD if heads else Vector3.BACK
		face.transform = Transform3D(Basis(u.cross(n), u, n), n * (COIN_HALF + 0.001))
		spin.add_child(face)
		var word := Label3D.new()
		word.text = "CARA" if heads else "COROA"
		word.font_size = 64
		word.outline_size = 6
		word.modulate = Color(0.36, 0.2, 0.04)
		word.outline_modulate = Color(0.36, 0.2, 0.04)
		word.pixel_size = 0.1 / (64.0 * 0.72)
		word.double_sided = false
		word.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		word.position = Vector3(0, -COIN_RADIUS * 0.47, 0.002)
		face.add_child(word)
	return root


static func _gold(albedo: ImageTexture, relief: ImageTexture) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(1.0, 0.78, 0.34)
	material.metallic = 0.65
	material.roughness = 0.3
	material.clearcoat_enabled = true
	material.clearcoat = 0.5
	material.rim_enabled = true
	material.rim = 0.4
	material.rim_tint = 1.0
	material.emission_enabled = true
	material.emission = Color(1.0, 0.7, 0.25)
	material.emission_energy_multiplier = 0.12
	if albedo:
		material.albedo_color = Color.WHITE
		material.albedo_texture = albedo
	if relief:
		material.normal_enabled = true
		material.normal_texture = relief
		material.normal_scale = 1.0
	return material


## A borda da moeda, para ela nunca entrar no tampo ao girar.
static func _coin_rim() -> PackedVector3Array:
	var out := PackedVector3Array()
	for k: int in 24:
		var a: float = k * TAU / 24.0
		for y: float in [-COIN_HALF, COIN_HALF]:
			out.append(Vector3(cos(a) * COIN_RADIUS, y, sin(a) * COIN_RADIUS))
	return out


## Textura de uma face da moeda: borda em relevo e o símbolo (um sol com rosto na cara, uma coroa na coroa).
static func _coin_face(heads: bool) -> Array[ImageTexture]:
	var images: Array[Image] = coin_images(heads)
	return [ImageTexture.create_from_image(images[0]), ImageTexture.create_from_image(images[1])]


## As imagens de uma face da moeda (cor e relevo). Só mexe em imagens: roda fora da linha principal (o aquecimento faz
## isso ao abrir a mesa; desenhar pixel a pixel na hora da primeira moeda travava a mesa por ~110 ms).
static func coin_images(heads: bool) -> Array[Image]:
	var size: int = 160
	var heights := PackedFloat32Array()
	heights.resize(size * size)
	var pixel: float = 2.0 / size
	for py: int in size:
		for px: int in size:
			var p := Vector2(px * pixel - 1.0 + pixel / 2.0, 1.0 - py * pixel - pixel / 2.0)
			heights[py * size + px] = _coin_height(p, heads, pixel)
	var albedo := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var relief := Image.create(size, size, false, Image.FORMAT_RGBA8)
	for py: int in size:
		for px: int in size:
			var h: float = heights[py * size + px]
			var r: float = Vector2(px * pixel - 1.0, 1.0 - py * pixel).length()
			var shade: float = lerpf(0.68, 1.12, h)
			albedo.set_pixel(px, py, Color(1.0 * shade, 0.78 * shade, 0.34 * shade, 1.0 if r < 0.995 else 0.0))
			var dx: float = heights[py * size + mini(px + 1, size - 1)] - heights[py * size + maxi(px - 1, 0)]
			var dy: float = heights[mini(py + 1, size - 1) * size + px] - heights[maxi(py - 1, 0) * size + px]
			var n := Vector3(-dx * 6.0, dy * 6.0, 1.0).normalized()
			relief.set_pixel(px, py, Color(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5))
	albedo.generate_mipmaps()
	relief.generate_mipmaps()
	return [albedo, relief]


## Guarda as texturas da moeda já desenhadas (cara: cor e relevo, coroa: cor e relevo), feitas pelo aquecimento.
static func set_coin_images(images: Array[Image]) -> void:
	if not _coin_textures.is_empty() or images.size() != 4:
		return
	for image: Image in images:
		_coin_textures.append(ImageTexture.create_from_image(image))


## Altura (0 a 1) de um ponto da face da moeda, com `p` de -1 a 1 (y para cima).
static func _coin_height(p: Vector2, heads: bool, pixel: float) -> float:
	var r: float = p.length()
	var h: float = 0.35
	h = maxf(h, smoothstep(0.86 - pixel, 0.86 + pixel, r))
	h = maxf(h, 0.7 * (1.0 - smoothstep(0.012, 0.012 + pixel * 1.5, absf(r - 0.77))))
	var s: Vector2 = p - Vector2(0, 0.12)
	var on: bool = false
	var dent: bool = false
	if heads:
		var sr: float = s.length()
		if sr < 0.21:
			on = true
			# Rosto do sol: dois olhos e um sorriso afundados.
			dent = (s - Vector2(-0.075, 0.05)).length() < 0.03 or (s - Vector2(0.075, 0.05)).length() < 0.03 \
				or (absf((s - Vector2(0, 0.04)).length() - 0.11) < 0.018 and s.y < -0.02)
		elif sr > 0.26 and sr < 0.47:
			var angle: float = fposmod(atan2(s.y, s.x), TAU / 12.0) - TAU / 24.0
			on = absf(angle) < 0.14 * (1.0 - (sr - 0.26) / 0.21)
	else:
		if absf(s.x) < 0.36 and s.y > -0.16 and s.y < -0.02:
			on = true
			dent = (s - Vector2(-0.2, -0.09)).length() < 0.03 or (s - Vector2(0, -0.09)).length() < 0.03 or (s - Vector2(0.2, -0.09)).length() < 0.03
		for spike: Vector3 in [Vector3(-0.36, 0.24, 0.07), Vector3(-0.18, 0.32, 0.08), Vector3(0.0, 0.4, 0.09), Vector3(0.18, 0.32, 0.08), Vector3(0.36, 0.24, 0.07)]:
			if s.y >= -0.02 and s.y <= spike.y and absf(s.x - spike.x) <= spike.z * (spike.y - s.y) / (spike.y + 0.02):
				on = true
			if (s - Vector2(spike.x, spike.y)).length() < 0.04:
				on = true
	if on:
		h = maxf(h, 0.45 if dent else 0.9)
	return h
