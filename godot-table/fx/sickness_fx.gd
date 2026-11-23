# Enjoo de invocação em 3D (como src/ui/gpu/gpuDizzy.ts): a criatura que chega tonta solta estrelinhas douradas que dão
# meia volta numa elipse acima dela e se recolhem no selo; enquanto dura, as estrelinhas do selo giram devagar; quando o
# enjoo passa, elas saem do selo girando e voam para cima com um brilho pequeno.
class_name SicknessFx
extends Node3D

const ORBIT_SHADER := preload("res://fx/sickness_orbit.gdshader")
## O ouro das estrelinhas do ícone (ICON_DIZZY) e o claro que alterna com ele.
const STAR := Color(1.0, 0.84, 0.42)
const STAR_LIGHT := Color(1.0, 0.945, 0.81)
## Chegar e passar, em segundos (os do navegador).
const ARRIVE_TIME := 0.85
const LEAVE_TIME := 0.76
## A carta pousa e as estrelinhas saem logo depois (LANDING + 260 ms no navegador).
const AFTER_LANDING := 0.26
## O selo reaparece aos poucos quando as estrelinhas chegam nele.
const REVEAL_TIME := 0.25
## Lado da estrelinha voando (unidades da mesa).
const STAR_SIZE := 0.1

static var _orbit_material: ShaderMaterial
static var _orbit_quad: QuadMesh

var camera: Camera3D
## id da carta → Entry (as tontas à mostra).
var _entries: Dictionary = {}


class Entry:
	var node: WeakRef
	## O selo (ícone solto) de agora e o giro preso nele (null sem o giro: opção desligada ou efeitos leves).
	var sprite: WeakRef
	var orbit: WeakRef
	## Até quando o selo fica escondido (as estrelinhas ainda estão chegando) e quando volta a aparecer.
	var hidden_until: float = 0.0
	var phase: float = 0.0


## As tontas de agora (`ids`) depois de um estado: guarda as novas e solta as que deixaram de estar.
func keep(ids: Array) -> void:
	for id: Variant in ids:
		if not _entries.has(id):
			var entry := Entry.new()
			entry.node = weakref(null)
			entry.sprite = weakref(null)
			entry.orbit = weakref(null)
			entry.phase = randf() * TAU
			_entries[id] = entry
	for id: Variant in _entries.keys():
		if not ids.has(id):
			_release(_entries[id])
			_entries.erase(id)
	set_process(not _entries.is_empty())


func _ready() -> void:
	set_process(not _entries.is_empty())


## A criatura `node` chegou tonta: espera ela pousar e as estrelinhas saem dela até o selo (que fica escondido até elas chegarem).
func arrive(id: int, node: CardNode, delay: float = 0.0) -> void:
	var entry: Entry = _entries.get(id)
	if entry:
		entry.hidden_until = _now() + 10.0
	var ref: WeakRef = weakref(node)
	var me: WeakRef = weakref(self)
	TouchFx.when_landed(self, node, func() -> void:
		var fx: SicknessFx = me.get_ref() as SicknessFx
		var card: CardNode = ref.get_ref() as CardNode
		if fx == null or card == null or card.is_queued_for_deletion():
			return
		var wait: float = AFTER_LANDING + delay
		var start: float = _now() + wait
		if entry:
			entry.hidden_until = start + ARRIVE_TIME * 0.85
		fx.get_tree().create_timer(wait).timeout.connect(func() -> void:
			var later: SicknessFx = me.get_ref() as SicknessFx
			var alive: CardNode = ref.get_ref() as CardNode
			if later and alive and not alive.is_queued_for_deletion():
				later._play_arrive(alive)), 2.0)


## O enjoo passou (o turno do dono começou, ou ela ganhou ímpeto): as estrelinhas saem do selo e voam para cima.
func leave(node: CardNode, delay: float = 0.0) -> void:
	if node == null or camera == null:
		return
	var from: Vector3 = tag_spot(node, camera)
	var me: WeakRef = weakref(self)
	get_tree().create_timer(delay).timeout.connect(func() -> void:
		var fx: SicknessFx = me.get_ref() as SicknessFx
		if fx:
			fx._play_leave(from))


## Onde fica o selo do enjoo de uma carta, pelo lugar em que ela vai parar (o selo do alto, no meio, como CardBadges).
static func tag_spot(node: CardNode, cam: Camera3D) -> Vector3:
	var tapped: bool = bool(node.data.get("tapped", false))
	var anchor: Vector3 = CardBadges.region_anchor(Vector2(0, -1), Vector2(0, CardBadges.MARGIN * 0.6), CardNode.SIZE, tapped)
	var place: Transform3D = node.get_parent().global_transform * node.target_transform() if node.get_parent() is Node3D else node.global_transform
	return place * anchor - cam.global_basis.y * 46.0 * CardBadges.PX


## O selo do enjoo à mostra na carta (o ícone solto do alto), ou null.
static func tag_sprite(node: CardNode) -> Sprite3D:
	var list: Array[GeometryInstance3D] = BadgeFx.parts(node, "tag")
	if list.size() == 1 and list[0] is Sprite3D:
		return list[0] as Sprite3D
	return null


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


# — O giro do selo —

func _process(_delta: float) -> void:
	var looping: bool = AmbientFx.level() > 0
	var now: float = _now()
	for id: Variant in _entries:
		var entry: Entry = _entries[id]
		var node: CardNode = entry.node.get_ref() as CardNode
		if node == null or node.is_queued_for_deletion():
			var view: TableView = _view()
			node = view.card_node(id) if view else null
			entry.node = weakref(node)
		if node == null:
			continue
		var sprite: Sprite3D = entry.sprite.get_ref() as Sprite3D
		if sprite == null or sprite.is_queued_for_deletion() or not sprite.is_inside_tree():
			sprite = tag_sprite(node)
			entry.sprite = weakref(sprite)
			entry.orbit = weakref(null)
		if sprite == null:
			continue
		var orbit: MeshInstance3D = entry.orbit.get_ref() as MeshInstance3D
		if looping and orbit == null:
			orbit = _make_orbit(sprite, entry.phase)
			entry.orbit = weakref(orbit)
		elif not looping and orbit:
			orbit.queue_free()
			orbit = null
			entry.orbit = weakref(null)
		# Escondido enquanto as estrelinhas chegam; depois aparece aos poucos. Com o giro, o ícone parado fica invisível.
		var shown: float = clampf((now - entry.hidden_until) / REVEAL_TIME, 0.0, 1.0)
		if orbit:
			orbit.set_instance_shader_parameter("alpha", shown)
			sprite.modulate.a = 0.0
		else:
			sprite.modulate.a = shown


func _view() -> TableView:
	var at: Node = get_parent()
	while at and not at is TableView:
		at = at.get_parent()
	return at as TableView


## O giro preso no selo (na mesma região: anda com a carta e some com os selos quando eles são refeitos).
func _make_orbit(sprite: Sprite3D, phase: float) -> MeshInstance3D:
	if _orbit_quad == null:
		_orbit_quad = QuadMesh.new()
		_orbit_quad.size = Vector2.ONE
	var size: float = (sprite.texture.get_size().x if sprite.texture else 208.0) * sprite.pixel_size
	var mesh := MeshInstance3D.new()
	mesh.mesh = _orbit_quad
	mesh.material_override = orbit_material(sprite.modulate)
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.scale = Vector3.ONE * size
	mesh.transparency = sprite.transparency
	mesh.set_instance_shader_parameter("center", BadgeFx.offset_of(sprite) / size)
	mesh.set_instance_shader_parameter("phase", phase)
	mesh.set_meta("badge", "tag-orbit")
	sprite.get_parent().add_child(mesh)
	return mesh


## O material do giro (um só; a cor do aro é a do selo).
static func orbit_material(_tint: Color = Color.WHITE) -> ShaderMaterial:
	if _orbit_material == null:
		_orbit_material = ShaderMaterial.new()
		_orbit_material.shader = ORBIT_SHADER
		_orbit_material.render_priority = CardBadges.PRIORITY_TEXT
	return _orbit_material


func _release(entry: Entry) -> void:
	var orbit: MeshInstance3D = entry.orbit.get_ref() as MeshInstance3D
	if orbit:
		orbit.queue_free()
	var sprite: Sprite3D = entry.sprite.get_ref() as Sprite3D
	if sprite and not sprite.is_queued_for_deletion():
		sprite.modulate.a = 1.0


## Quantas cartas estão com o giro aceso (para os testes e a medição).
func orbits() -> int:
	var n: int = 0
	for entry: Entry in _entries.values():
		if entry.orbit.get_ref() != null:
			n += 1
	return n


func tracked() -> Array:
	return _entries.keys()


# — Chegar e passar —

## As estrelinhas saem do meio da carta, abrem uma elipse acima dela, dão meia volta e fecham no selo.
func _play_arrive(node: CardNode) -> void:
	if camera == null:
		return
	var card: Vector3 = node.global_position + Vector3(0, 0.04, 0)
	var sprite: Sprite3D = tag_sprite(node)
	var end: Vector3 = BadgeFx.center([sprite], camera) if sprite else tag_spot(node, camera)
	var width: float = minf(CardNode.SIZE.x, CardNode.SIZE.y)
	# A elipse fica acima da carta, do lado do selo; deitada no tampo, para dar a volta "em torno" da cabeça dela.
	var middle: Vector3 = (card + end) * 0.5 + Vector3(0, 0.16, 0)
	var right: Vector3 = camera.global_basis.x
	var toward: Vector3 = Vector3(0, 0, 1)
	var rx: float = width * 0.42
	var rz: float = width * 0.2
	var n: int = 2 if Fx.quality == 0 else 3
	var stars: Array = []
	for i: int in n:
		var tint: Color = STAR_LIGHT if i % 2 == 1 else STAR
		var mesh: MeshInstance3D = BadgeFx.star(self, STAR_SIZE * (1.0 if i == 0 else randf_range(0.6, 0.85)), Color(tint, 0.0))
		mesh.global_position = card
		stars.append({"mesh": mesh, "angle": float(i) / n * TAU, "tint": tint, "size": mesh.scale.x})
	var glint: MeshInstance3D = BadgeFx.star(self, 0.3, Color(STAR, 0.0), 1.0)
	glint.global_position = end
	var me: WeakRef = weakref(self)
	var sparked: Array = [false]
	var step: Callable = func(t: float) -> void:
		var open: float = _ease_out(minf(1.0, t / 0.3))
		var close: float = maxf(0.0, (t - 0.55) / 0.45)
		var r: float = open * (1.0 - _ease_out(close))
		for one: Dictionary in stars:
			var mesh: MeshInstance3D = one["mesh"]
			if not is_instance_valid(mesh):
				continue
			var a: float = float(one["angle"]) + t * PI * 1.4
			var depth: float = (sin(a) + 1.0) * 0.5
			var orbit_at: Vector3 = middle + right * cos(a) * rx * r + toward * sin(a) * rz * r
			var to: Vector3 = orbit_at.lerp(end, _ease_out(close)) if close > 0.0 else orbit_at
			mesh.global_position = card.lerp(to, open)
			mesh.scale = Vector3.ONE * float(one["size"]) * (0.65 + 0.35 * depth) * (1.0 - 0.5 * close)
			mesh.set_instance_shader_parameter("spin", a * 1.5)
			var alpha: float = 0.75 * minf(1.0, t / 0.15) * (0.55 + 0.45 * depth) * (1.0 - close * close)
			mesh.set_instance_shader_parameter("tint", Color(one["tint"], alpha))
		if is_instance_valid(glint):
			glint.scale = Vector3.ONE * 0.22 * (0.6 + 0.6 * close)
			glint.set_instance_shader_parameter("tint", Color(STAR, 0.3 * sin(PI * close)))
		if not sparked[0] and close > 0.6:
			sparked[0] = true
			var fx: SicknessFx = me.get_ref() as SicknessFx
			if fx:
				Fx.burst(fx, end, STAR, 2 if Fx.quality == 0 else 3, 0.35, 0.3, 0.035, 0.0)
	var tween := create_tween()
	tween.tween_method(step, 0.0, 1.0, ARRIVE_TIME)
	tween.tween_callback(func() -> void:
		for one: Dictionary in stars:
			if is_instance_valid(one["mesh"]):
				(one["mesh"] as Node).queue_free()
		if is_instance_valid(glint):
			glint.queue_free())


## As estrelinhas saem do selo num leque para cima, girando, e somem subindo; um brilho curto no selo.
func _play_leave(from: Vector3) -> void:
	var n: int = 2 if Fx.quality == 0 else 3
	var width: float = minf(CardNode.SIZE.x, CardNode.SIZE.y)
	var up: Vector3 = camera.global_basis.y
	var right: Vector3 = camera.global_basis.x
	var stars: Array = []
	for i: int in n:
		var tint: Color = STAR_LIGHT if i % 2 == 1 else STAR
		var mesh: MeshInstance3D = BadgeFx.star(self, STAR_SIZE * randf_range(0.75, 1.0), Color(tint, 0.7))
		mesh.global_position = from
		var angle: float = -PI / 2.0 + (i - (n - 1) / 2.0) * 0.62 + randf_range(-0.12, 0.12)
		# Na tela, o "para cima" é o −y do ângulo: o leque abre para o alto.
		var travel: Vector3 = right * cos(angle) * width * randf_range(0.4, 0.6) - up * sin(angle) * width * randf_range(0.45, 0.65)
		stars.append({"mesh": mesh, "travel": travel, "spin": randf_range(5.0, 9.0) * (1.0 if i % 2 == 1 else -1.0), "tint": tint, "size": mesh.scale.x})
	var glow: MeshInstance3D = BadgeFx.star(self, 0.22, Color(STAR, 0.2), 1.0)
	glow.global_position = from
	Fx.burst(self, from, STAR, 2 if Fx.quality == 0 else 3, 0.45, 0.32, 0.035, 0.6)
	var step: Callable = func(t: float) -> void:
		var k: float = _ease_out(t)
		for one: Dictionary in stars:
			var mesh: MeshInstance3D = one["mesh"]
			if not is_instance_valid(mesh):
				continue
			mesh.global_position = from + (one["travel"] as Vector3) * k
			mesh.set_instance_shader_parameter("spin", float(one["spin"]) * t)
			mesh.scale = Vector3.ONE * float(one["size"]) * (1.0 - 0.45 * t)
			var alpha: float = 0.7 * (1.0 if t < 0.5 else 1.0 - (t - 0.5) / 0.5)
			mesh.set_instance_shader_parameter("tint", Color(one["tint"], alpha))
		if is_instance_valid(glow):
			glow.scale = Vector3.ONE * 0.22 * (1.0 + 0.5 * k)
			glow.set_instance_shader_parameter("tint", Color(STAR, 0.2 * (1.0 - minf(1.0, t / 0.5))))
	var tween := create_tween()
	tween.tween_method(step, 0.0, 1.0, LEAVE_TIME)
	tween.tween_callback(func() -> void:
		for one: Dictionary in stars:
			if is_instance_valid(one["mesh"]):
				(one["mesh"] as Node).queue_free()
		if is_instance_valid(glow):
			glow.queue_free())


static func _ease_out(t: float) -> float:
	return 1.0 - pow(1.0 - t, 3.0)
