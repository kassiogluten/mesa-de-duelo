# A presença da pilha na mesa 3D: o item do topo ganha chamas de luz atrás, ar tremendo em volta, luzes correndo pela
# borda e partículas subindo; os de baixo, um halo mais fraco. Quando um item chega ao topo ou resolve, uma onda na forma da
# carta e faíscas. Na cor da carta (dourado nos gatilhos); mais forte e rápido quando a vez é sua contra um item do oponente.
class_name StackPresence
extends Node3D

const AURA_SHADER := preload("res://table/stack_aura.gdshader")
const HAZE_SHADER := preload("res://table/stack_haze.gdshader")
const PAD := 0.42
## Quanto o halo de cada camada abaixo do topo apaga; a borda delas continua acesa (fica claro que há mais itens).
const LOWER_DIM := 0.45
const LOWER_EDGE := 0.6
## Espera a carta terminar o voo até o lugar dela na pilha antes da onda de chegada.
const ARRIVAL_DELAY := 0.5

var view: TableView
## Por chave da carta na pilha: {node (WeakRef), layers: {aura, edge, haze, motes}, color, top}.
var _items: Dictionary = {}
var _top_key: Variant = null
var _urgency: float = 0.0
var _urgency_target: float = 0.0


func _init(table: TableView) -> void:
	view = table


## Depois de a pilha ser posta: `entries` é a lista {key, item} do topo para baixo; `state` é o estado novo inteiro.
func sync(entries: Array, state: Dictionary) -> void:
	var countered: Dictionary = _countered_ids(state)
	var present: Dictionary = {}
	for i: int in entries.size():
		var entry: Dictionary = entries[i]
		var key: Variant = entry["key"]
		present[key] = true
		var node: CardNode = view.card_node(key)
		if node == null:
			continue
		if not _items.has(key) or ((_items[key] as Dictionary)["node"] as WeakRef).get_ref() != node:
			_attach(key, node, _color_of(entry["item"]))
		_set_role(key, i == 0)
	for key: Variant in _items.keys():
		if present.has(key):
			continue
		var info: Dictionary = _items[key]
		var gone: bool = countered.has(key) or countered.has(info.get("stack_id", -1))
		_detach(key, not gone)
	var top: Variant = (entries[0] as Dictionary)["key"] if not entries.is_empty() else null
	if top != null and not _same(top, _top_key) and _items.has(top):
		_arrival(top)
	_top_key = top
	# Pode responder: a vez é sua e o topo é de outro jogador.
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var top_item: Dictionary = (entries[0] as Dictionary)["item"] if not entries.is_empty() else {}
	_urgency_target = 1.0 if bool(input.get("priority", false)) and not top_item.is_empty() and int(top_item.get("controller", -1)) != int(state.get("you", 0)) else 0.0


func _process(delta: float) -> void:
	_urgency = move_toward(_urgency, _urgency_target, delta * 2.0)
	for key: Variant in _items:
		var layers: Dictionary = (_items[key] as Dictionary)["layers"]
		for name: String in ["aura", "edge"]:
			var mesh: MeshInstance3D = layers.get(name)
			if mesh and is_instance_valid(mesh):
				(mesh.material_override as ShaderMaterial).set_shader_parameter("urgency", _urgency)


## Mesma chave: as das mágicas são números (id da carta) e as das habilidades, texto ("stack:5"); comparar tipos
## diferentes com == é erro no GDScript.
static func _same(a: Variant, b: Variant) -> bool:
	return typeof(a) == typeof(b) and a == b


## A cor do item: a da carta nas mágicas e habilidades, dourada nos gatilhos.
static func _color_of(item: Dictionary) -> Color:
	if Txt.of(item.get("kind")) == "trigger":
		return Hud.GOLD
	var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
	return Fx.card_color(source)


## Os ids (de carta e de item da pilha) anulados neste estado: esses saem queimando pelo diretor, sem a onda de resolver.
static func _countered_ids(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for raw: Variant in state.get("events", []):
		if not raw is Dictionary or (raw as Dictionary).get("type") != "countered":
			continue
		var event: Dictionary = raw
		out[FxDirector.card_id(event)] = true
		if event.get("stackId") != null:
			out[int(event["stackId"])] = true
			out["stack:%d" % int(event["stackId"])] = true
	return out


func _attach(key: Variant, node: CardNode, color: Color) -> void:
	if _items.has(key):
		_detach(key, false)
	var seed: float = randf() * 50.0
	var layers: Dictionary = {}
	if Fx.quality > 0:
		layers["haze"] = _layer(node, HAZE_SHADER, -0.05, color, seed, -1)
	layers["aura"] = _layer(node, AURA_SHADER, -0.035, color, seed, 0)
	layers["edge"] = _layer(node, AURA_SHADER, 0.006, color, seed, 1)
	if Fx.quality > 0:
		layers["motes"] = _motes(node, color)
	_items[key] = {"node": weakref(node), "layers": layers, "color": color, "stack_id": int(node.data.get("stackId", -1)), "top": false}
	# Aparece aos poucos (a carta ainda está voando para o lugar).
	for name: String in ["aura", "edge"]:
		var material: ShaderMaterial = (layers[name] as MeshInstance3D).material_override
		material.set_shader_parameter("intensity", 0.0)


func _layer(node: CardNode, shader: Shader, y: float, color: Color, seed: float, layer: int) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = CardNode.SIZE + Vector2(PAD, PAD) * 2.0
	mesh.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("card", CardNode.SIZE)
	material.set_shader_parameter("pad", PAD)
	material.set_shader_parameter("seed", seed)
	if layer < 0:
		# O ar tremendo copia a tela antes das camadas transparentes: desenhado primeiro, não apaga o halo das cartas de
		# baixo (que vêm depois, somando luz por cima).
		material.render_priority = -10
	if layer >= 0:
		material.set_shader_parameter("color", color)
		material.set_shader_parameter("hot", color.lerp(Color.WHITE, 0.45))
		material.set_shader_parameter("layer", layer)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = Vector3(0, y, 0)
	node.add_child(mesh)
	return mesh


## Partículas que sobem da borda da carta (no plano dela: "para cima" na tela é o -Z da carta).
func _motes(node: CardNode, color: Color) -> GPUParticles3D:
	var motes := GPUParticles3D.new()
	motes.amount = 48 if Fx.quality > 1 else 22
	motes.lifetime = 1.6
	motes.local_coords = true
	motes.preprocess = 1.0
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINTS
	process.emission_point_texture = _perimeter_points()
	process.emission_point_count = 96
	process.direction = Vector3(0, 0.2, -1)
	process.spread = 35.0
	process.initial_velocity_min = 0.08
	process.initial_velocity_max = 0.3
	process.gravity = Vector3.ZERO
	process.damping_min = 0.05
	process.damping_max = 0.2
	process.scale_min = 0.01
	process.scale_max = 0.026
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lerp(Color.WHITE, 0.6), 0.0))
	ramp.add_point(0.15, Color(color.lerp(Color.WHITE, 0.5), 1.0))
	ramp.set_color(ramp.get_point_count() - 1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	motes.process_material = process
	motes.draw_pass_1 = Fx._spark()
	motes.position = Vector3(0, 0.01, 0)
	node.add_child(motes)
	return motes


static var _points_tex: ImageTexture


## Pontos espalhados pela borda da carta (no plano XZ dela), de onde as partículas saem.
static func _perimeter_points() -> ImageTexture:
	if _points_tex:
		return _points_tex
	var image := Image.create(96, 1, false, Image.FORMAT_RGBF)
	var half := CardNode.SIZE / 2.0 + Vector2(0.015, 0.015)
	var perimeter: float = 4.0 * (half.x + half.y)
	for i: int in 96:
		var s: float = perimeter * (i + 0.5) / 96.0
		var at: Vector2
		if s < 2.0 * half.x:
			at = Vector2(-half.x + s, -half.y)
		elif s < 2.0 * half.x + 2.0 * half.y:
			at = Vector2(half.x, -half.y + (s - 2.0 * half.x))
		elif s < 4.0 * half.x + 2.0 * half.y:
			at = Vector2(half.x - (s - 2.0 * half.x - 2.0 * half.y), half.y)
		else:
			at = Vector2(-half.x, half.y - (s - 4.0 * half.x - 2.0 * half.y))
		image.set_pixel(i, 0, Color(at.x, 0.0, at.y))
	_points_tex = ImageTexture.create_from_image(image)
	return _points_tex


## Topo: tudo aceso; abaixo: o halo mais fraco e a borda acesa na cor do item, sem o ar tremendo e as partículas.
func _set_role(key: Variant, top: bool) -> void:
	var info: Dictionary = _items[key]
	if bool(info["top"]) == top and info.has("set"):
		return
	info["top"] = top
	info["set"] = true
	var layers: Dictionary = info["layers"]
	_fade(layers.get("aura"), 1.0 if top else LOWER_DIM, 0.6)
	_fade(layers.get("edge"), 1.0 if top else LOWER_EDGE, 0.4)
	if layers.get("haze") and is_instance_valid(layers["haze"]):
		(layers["haze"] as MeshInstance3D).visible = top
	if layers.get("motes") and is_instance_valid(layers["motes"]):
		(layers["motes"] as GPUParticles3D).emitting = top


static func _fade(mesh: Variant, to: float, seconds: float) -> void:
	if not mesh is MeshInstance3D or not is_instance_valid(mesh):
		return
	var material: ShaderMaterial = (mesh as MeshInstance3D).material_override
	var current: Variant = material.get_shader_parameter("intensity")
	var from: float = float(current) if current != null else 1.0
	var tween := (mesh as MeshInstance3D).create_tween()
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("intensity", v), from, to, seconds).set_trans(Tween.TRANS_SINE)


## Saiu da pilha: as camadas se apagam; resolvendo (não anulado), a onda e as faíscas no lugar onde estava.
func _detach(key: Variant, burst: bool) -> void:
	var info: Dictionary = _items[key]
	_items.erase(key)
	var node: CardNode = (info["node"] as WeakRef).get_ref() as CardNode
	if burst and node != null and is_instance_valid(node):
		_resolve_burst(node.global_transform, info["color"])
	for layer: Variant in (info["layers"] as Dictionary).values():
		if not is_instance_valid(layer):
			continue
		if layer is GPUParticles3D:
			(layer as GPUParticles3D).emitting = false
			(layer as Node).get_tree().create_timer(1.7).timeout.connect((layer as Node).queue_free)
		elif layer is MeshInstance3D:
			_fade(layer, 0.0, 0.25)
			(layer as Node).get_tree().create_timer(0.3).timeout.connect((layer as Node).queue_free)


## Chegou ao topo: depois do voo, a borda pisca, uma onda na forma da carta se abre e faíscas saltam das bordas.
func _arrival(key: Variant) -> void:
	var ref: WeakRef = (_items[key] as Dictionary)["node"]
	var color: Color = (_items[key] as Dictionary)["color"]
	var weak_self: WeakRef = weakref(self)
	get_tree().create_timer(ARRIVAL_DELAY).timeout.connect(func() -> void:
		var node: CardNode = ref.get_ref() as CardNode
		var me: StackPresence = weak_self.get_ref() as StackPresence
		if node == null or me == null or not is_instance_valid(node):
			return
		node.flash_color(color, 0.3)
		me._shock(node.global_transform, color, 0.18, 0.5)
		me._sparks(node.global_transform, color, 46))


func _resolve_burst(at: Transform3D, color: Color) -> void:
	_shock(at, color, 0.24, 0.45)
	_sparks(at, color, 70)
	Fx.light(self, at.origin, color, 6.0, 4.0, 0.4)


## Onda na forma da carta que se abre a partir da borda dela, numa transformação fixa (não acompanha a carta).
func _shock(at: Transform3D, color: Color, reach: float, seconds: float) -> void:
	var holder := Node3D.new()
	add_child(holder)
	holder.global_transform = at
	var material := ShaderMaterial.new()
	material.shader = AURA_SHADER
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = CardNode.SIZE + Vector2(PAD, PAD) * 2.0 + Vector2(reach, reach) * 2.0
	mesh.mesh = plane
	material.set_shader_parameter("card", CardNode.SIZE)
	material.set_shader_parameter("pad", PAD + reach)
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("hot", color.lerp(Color.WHITE, 0.7))
	material.set_shader_parameter("layer", 2)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = Vector3(0, 0.01, 0)
	holder.add_child(mesh)
	var tween := holder.create_tween().set_parallel(true)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("shock", v), 0.0, reach, seconds).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("intensity", v), 1.6, 0.0, seconds).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(holder.queue_free)


## Faíscas que saltam das bordas da carta para fora, no plano dela.
func _sparks(at: Transform3D, color: Color, amount: int) -> void:
	if Fx.quality == 0:
		return
	var sparks := GPUParticles3D.new()
	sparks.amount = amount if Fx.quality > 1 else amount / 2
	sparks.lifetime = 0.7
	sparks.one_shot = true
	sparks.explosiveness = 0.9
	sparks.local_coords = true
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINTS
	process.emission_point_texture = _perimeter_points()
	process.emission_point_count = 96
	process.direction = Vector3(0, 0.3, 0)
	process.spread = 180.0
	process.radial_velocity_min = 0.4
	process.radial_velocity_max = 1.1
	process.initial_velocity_min = 0.05
	process.initial_velocity_max = 0.2
	process.gravity = Vector3.ZERO
	process.damping_min = 1.5
	process.damping_max = 2.5
	process.scale_min = 0.012
	process.scale_max = 0.03
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lerp(Color.WHITE, 0.7), 1.0))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	sparks.process_material = process
	sparks.draw_pass_1 = Fx._spark()
	var holder := Node3D.new()
	add_child(holder)
	holder.global_transform = at
	holder.add_child(sparks)
	sparks.emitting = true
	holder.get_tree().create_timer(1.0).timeout.connect(holder.queue_free)
