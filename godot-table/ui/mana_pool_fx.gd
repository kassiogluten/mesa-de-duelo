# Peças dos efeitos da reserva de mana no HUD: a cor de cada mana, gotas voando, anel de faíscas, poeira de luz subindo,
# o fantasma do pip que estoura ou se desfaz, o ponto da mesa 3D projetado na tela e o aquecimento dos materiais.
class_name ManaPoolFx
extends RefCounted

## A luz de cada mana (mais viva que o disco do símbolo, para brilhar no escuro da mesa).
const TINTS := {
	"W": Color(1.0, 0.94, 0.72), "U": Color(0.36, 0.66, 1.0), "B": Color(0.72, 0.46, 0.98), "R": Color(1.0, 0.45, 0.22),
	"G": Color(0.38, 0.95, 0.45), "C": Color(0.82, 0.8, 0.78),
}
## Os tipos básicos de terreno e a mana que dão.
const BASIC_TYPES := {"Plains": "W", "Island": "U", "Swamp": "B", "Mountain": "R", "Forest": "G", "Wastes": "C"}

static var _dot_texture: GradientTexture2D
static var _materials: Dictionary = {}


## A luz de uma cor de mana; dourado claro para as que não conhece.
static func tint(color: String) -> Color:
	return TINTS.get(color, Color(0.95, 0.85, 0.55))


## Quantas partículas, pela qualidade dos efeitos (leve: metade) e pelo assento (os oponentes mais calmos).
static func amount(base: int, calm: bool) -> int:
	var scale: float = 0.5 if Fx.quality == 0 else (1.0 if Fx.quality == 1 else 1.3)
	return maxi(3, int(base * scale * (0.6 if calm else 1.0)))


## As manas que uma permanente pode dar ("WUBRG", "C"…), pelos tipos básicos e pelo "Add {G}" do texto; "" se não sabe.
static func produces(card: Dictionary) -> String:
	var out: String = ""
	var types: String = Txt.of(card.get("typeLine"))
	for basic: String in BASIC_TYPES:
		if types.contains(basic) and not out.contains(BASIC_TYPES[basic]):
			out += Txt.of(BASIC_TYPES[basic])
	var text: String = Txt.of(card.get("text"))
	var at: int = text.find("Add ")
	if at >= 0:
		var tail: String = text.substr(at, 120)
		if tail.contains("any color"):
			return "WUBRG"
		for color: String in ["W", "U", "B", "R", "G", "C"]:
			if tail.contains("{%s}" % color) and not out.contains(color):
				out += color
	return out


## Onde fica na tela um ponto da mesa 3D (id de carta ou "stack:<id>", como TableView.anchor); (-1, -1) se não está à
## mostra ou fica atrás da câmera.
static func project(table: TableView, key: Variant) -> Vector2:
	if table == null or table.camera == null or not table.is_inside_tree():
		return Vector2(-1, -1)
	var at: Variant = table.anchor(key)
	if not (at is Vector3) or table.camera.is_position_behind(at):
		return Vector2(-1, -1)
	return table.camera.unproject_position(at)


## Uma gota de mana de `from` até `target` (função que devolve o ponto na tela); `on_arrive` é chamada quando chega.
static func fly(parent: Control, from: Vector2, target: Callable, color: Color, delay: float, calm: bool, on_arrive: Callable = Callable(), sparks: bool = false) -> ManaPoolOrb:
	var orb := ManaPoolOrb.new()
	orb.tint = color
	orb.calm = calm
	orb.target = target
	orb.on_arrive = on_arrive
	orb.sparks_on_arrival = sparks
	parent.add_child(orb)
	var to: Vector2 = target.call() if target.is_valid() else from
	var distance: float = from.distance_to(to)
	# Longe: um pouco mais de tempo e um arco mais aberto, para os dois lados alternando.
	var duration: float = clampf(0.32 + distance / 1800.0, 0.34, 0.7)
	var bend: float = clampf(distance * 0.22, 20.0, 140.0) * (1.0 if int(delay * 100.0) % 2 == 0 else -1.0)
	orb.launch(from, to, delay, duration, bend)
	return orb


## Um anel de faíscas abrindo em volta de `at` (a mana chegando, ou estourando ao ser gasta).
static func sparks_ring(parent: Control, at: Vector2, color: Color, calm: bool, strength: float = 1.0) -> void:
	var p: GPUParticles2D = _particles(parent, at, "ring", amount(int(16 * strength), calm), 0.5)
	p.modulate = Color(color.r * 1.3, color.g * 1.3, color.b * 1.3)
	p.speed_scale = 1.0 if not calm else 0.8


## Poeira de luz subindo devagar de uma área de raio `radius` (a mana que se perde no fim da etapa).
static func motes_rise(parent: Control, at: Vector2, radius: float, color: Color, calm: bool, strength: float = 1.0) -> void:
	var p: GPUParticles2D = _particles(parent, at, "motes", amount(int(26 * strength), calm), 1.2)
	(p.process_material as ParticleProcessMaterial).emission_sphere_radius = radius
	p.modulate = color
	p.explosiveness = 0.55


## O rastro de uma gota voando (as partículas ficam no lugar enquanto ela anda).
static func trail(parent: Node, color: Color, calm: bool) -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.amount = amount(30, calm)
	p.lifetime = 0.4
	p.local_coords = false
	p.texture = _dot()
	p.process_material = _material("trail")
	p.material = _additive()
	p.modulate = color
	p.emitting = false
	parent.add_child(p)
	return p


## O fantasma do pip no lugar dele: "burst" estoura (gasto, cresce e some num clarão), "fade" se desfaz (sobe, encolhe e
## apaga devagar, a mana perdida no fim da etapa).
static func ghost(parent: Control, pip: ManaPoolPip, kind: String) -> void:
	var rect := TextureRect.new()
	rect.texture = pip.icon_texture()
	rect.top_level = true
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.size = Vector2(pip.icon_size, pip.icon_size)
	rect.pivot_offset = rect.size / 2.0
	parent.add_child(rect)
	rect.global_position = pip.icon_center_global() - rect.size / 2.0
	# Um brilho na cor atrás do símbolo, que se apaga junto.
	var glow := TextureRect.new()
	glow.texture = _dot()
	glow.material = _additive()
	glow.modulate = pip.tint()
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.size = rect.size * 2.4
	glow.position = rect.size / 2.0 - glow.size / 2.0
	glow.show_behind_parent = true
	rect.add_child(glow)
	var tween: Tween = rect.create_tween().set_parallel()
	if kind == "burst":
		rect.modulate = Color(1.8, 1.8, 1.8)
		tween.tween_property(rect, "scale", Vector2.ONE * 1.7, 0.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(rect, "modulate", Color(1.5, 1.5, 1.5, 0.0), 0.28).set_ease(Tween.EASE_IN)
	else:
		var rise: float = 26.0 if pip.mine else 18.0
		tween.tween_property(rect, "position:y", rect.position.y - rise, 0.95).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		tween.tween_property(rect, "scale", Vector2.ONE * 0.7, 0.95).set_ease(Tween.EASE_IN)
		tween.tween_property(rect, "modulate", Color(1.2, 1.2, 1.2, 0.0), 0.95).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(rect.queue_free)


## Desenha uma vez, minúsculos e quase transparentes, os materiais e as partículas da reserva, para a placa compilá-los
## antes da primeira mana (como FxWarmup faz com os da mesa 3D). Somem junto com `holder`.
static func warm(holder: Node) -> void:
	var layer := CanvasLayer.new()
	holder.add_child(layer)
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.modulate = Color(1, 1, 1, 0.004)
	layer.add_child(root)
	for shader: Shader in [ManaPoolPip.HALO_SHADER, ManaPoolPip.SWIRL_SHADER, ManaPoolOrb.SHADER]:
		var rect := ColorRect.new()
		var material := ShaderMaterial.new()
		material.shader = shader
		rect.material = material
		rect.size = Vector2(2, 2)
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(rect)
	for kind: String in ["ring", "motes"]:
		_particles(root, Vector2(1, 1), kind, 3, 0.1).modulate = Color(0, 0, 0, 0.01)
	var t: GPUParticles2D = trail(root, Color(0, 0, 0, 0.01), true)
	t.emitting = true
	# Os símbolos nos dois tamanhos (o seu e o dos oponentes): o SVG vira imagem uma vez só.
	for color: String in TINTS:
		SeatIcons.mana(color, 34)
		SeatIcons.mana(color, 26)


static func _particles(parent: Control, at: Vector2, kind: String, count: int, life: float) -> GPUParticles2D:
	var p := GPUParticles2D.new()
	p.top_level = true
	p.amount = count
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 0.95
	p.local_coords = false
	p.texture = _dot()
	# O material de cada tipo é um só (compila uma vez); o raio dos grãos que sobem muda por pip, então esse é cópia.
	p.process_material = _material(kind).duplicate() if kind == "motes" else _material(kind)
	p.material = _additive()
	parent.add_child(p)
	p.global_position = at
	p.finished.connect(p.queue_free)
	p.emitting = true
	return p


static func _additive() -> CanvasItemMaterial:
	if not _materials.has("add"):
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		_materials["add"] = m
	return _materials["add"]


static func _material(kind: String) -> ParticleProcessMaterial:
	if _materials.has(kind):
		return _materials[kind]
	var m := ParticleProcessMaterial.new()
	m.particle_flag_disable_z = true
	m.gravity = Vector3.ZERO
	var fade := Gradient.new()
	fade.set_color(0, Color(1, 1, 1, 1))
	fade.set_color(1, Color(1, 1, 1, 0))
	var ramp := GradientTexture1D.new()
	ramp.gradient = fade
	m.color_ramp = ramp
	var shrink := Curve.new()
	shrink.add_point(Vector2(0, 1))
	shrink.add_point(Vector2(1, 0.2))
	var curve := CurveTexture.new()
	curve.curve = shrink
	m.scale_curve = curve
	match kind:
		"ring":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
			m.emission_sphere_radius = 4.0
			m.direction = Vector3(1, 0, 0)
			m.spread = 180.0
			m.initial_velocity_min = 70.0
			m.initial_velocity_max = 150.0
			m.damping_min = 160.0
			m.damping_max = 240.0
			m.scale_min = 0.22
			m.scale_max = 0.5
		"motes":
			m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
			m.emission_sphere_radius = 12.0
			m.direction = Vector3(0, -1, 0)
			m.spread = 30.0
			m.initial_velocity_min = 10.0
			m.initial_velocity_max = 38.0
			m.gravity = Vector3(0, -34, 0)
			m.damping_min = 4.0
			m.damping_max = 10.0
			m.scale_min = 0.22
			m.scale_max = 0.48
			m.turbulence_enabled = false
		"trail":
			m.direction = Vector3(1, 0, 0)
			m.spread = 180.0
			m.initial_velocity_min = 4.0
			m.initial_velocity_max = 18.0
			m.scale_min = 0.35
			m.scale_max = 0.7
	_materials[kind] = m
	return m


## Um grão de luz redondo e macio (as partículas o tingem).
static func _dot() -> GradientTexture2D:
	if _dot_texture == null:
		var gradient := Gradient.new()
		gradient.set_color(0, Color(1, 1, 1, 1))
		gradient.set_color(1, Color(1, 1, 1, 0))
		gradient.add_point(0.35, Color(1, 1, 1, 0.55))
		_dot_texture = GradientTexture2D.new()
		_dot_texture.gradient = gradient
		_dot_texture.fill = GradientTexture2D.FILL_RADIAL
		_dot_texture.fill_from = Vector2(0.5, 0.5)
		_dot_texture.fill_to = Vector2(1.0, 0.5)
		_dot_texture.width = 32
		_dot_texture.height = 32
	return _dot_texture
