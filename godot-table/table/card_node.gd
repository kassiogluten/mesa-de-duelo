# Uma carta na cena 3D: vive enquanto o id existe no estado e voa até o lugar novo quando muda de zona ou de posição.
class_name CardNode
extends Node3D

signal clicked(card: CardNode)
signal hover_changed(card: CardNode, on: bool)

const SIZE := Vector2(0.63, 0.88)
const SHADER := preload("res://table/card.gdshader")
const MOVE_TIME := 0.32
## A carta da mão sob o mouse: quanto o desenho sobe na tela (-Z), vem para a câmera (+Y) e cresce.
const LIFT := Vector3(0, 0.35, -0.62)
const LIFT_SCALE := 1.45
## Espessura da carta (a borda lateral na cor do verso) e o raio dos cantos (o mesmo do card.gdshader).
const THICKNESS := 0.011
const CORNER := 0.035

static var _edge_mesh: ArrayMesh
static var _shadow_material: StandardMaterial3D

## Id da carta no estado (negativo nas cartas escondidas: grimório, mão do oponente).
var card_id: int = 0
## O FCard do último estado ({} nas escondidas).
var data: Dictionary = {}
var image_url: String = ""
var hovered: bool = false
var lifted: bool = false

## O desenho (malha e textos): é ele que sobe na mão, enquanto a área do clique fica parada no lugar da carta.
var _visual := Node3D.new()
var _hit_box := BoxShape3D.new()
var _hit_shape := CollisionShape3D.new()
var _lift_tween: Tween
var _material: ShaderMaterial
var _name_label: Label3D
var _edge: MeshInstance3D
var _edge_material := StandardMaterial3D.new()
var _bottom: MeshInstance3D
var _shadow: MeshInstance3D
var _shadow_on: bool = false
## Voando em arco (a sombra de contato espera o pouso).
var _flying: bool = false
var _badges := CardBadges.new()
var _cost: Node3D
var _cost_key: String = ""
var _depth: float = THICKNESS
var _tween: Tween
var _target: Transform3D
var _placed: bool = false


func _init() -> void:
	var mesh := PlaneMesh.new()
	mesh.size = SIZE
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	add_child(_visual)
	var body := MeshInstance3D.new()
	body.mesh = mesh
	body.material_override = _material
	_visual.add_child(body)

	_name_label = Label3D.new()
	_name_label.pixel_size = 0.0022
	_name_label.font_size = 32
	_name_label.outline_size = 6
	_name_label.width = 250.0
	_name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_name_label.rotation_degrees = Vector3(-90, 0, 0)
	_name_label.position = Vector3(0, 0.004, 0)
	_visual.add_child(_name_label)

	# A espessura: a borda lateral (na cor do verso) e a face de baixo, que mostra o verso quando a carta está virada para baixo.
	_edge_material.roughness = 0.7
	_edge = MeshInstance3D.new()
	_edge.mesh = _edge_shape()
	_edge.material_override = _edge_material
	_visual.add_child(_edge)
	_bottom = MeshInstance3D.new()
	_bottom.mesh = mesh
	_bottom.material_override = _material
	_bottom.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_visual.add_child(_bottom)
	# Sombra de contato: um halo escuro e macio colado no tampo, embaixo da carta.
	_shadow = MeshInstance3D.new()
	var quad := PlaneMesh.new()
	quad.size = SIZE * 1.22
	_shadow.mesh = quad
	_shadow.material_override = _shadow_mat()
	_shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_shadow.visible = false
	_visual.add_child(_shadow)
	_set_depth(THICKNESS)
	_visual.add_child(_badges)

	var area := Area3D.new()
	_hit_shape.shape = _hit_box
	_fit_hit_area(false)
	area.add_child(_hit_shape)
	area.input_event.connect(_on_input)
	area.mouse_entered.connect(func() -> void: _set_hover(true))
	area.mouse_exited.connect(func() -> void: _set_hover(false))
	add_child(area)


## Atualiza os dados (nome, poder/resistência) e a cor do verso.
func set_data(card: Dictionary, sleeve: Color, label: String, on_battlefield: bool) -> void:
	data = card
	_material.set_shader_parameter("sleeve_color", sleeve)
	_edge_material.albedo_color = sleeve.darkened(0.25)
	var known: bool = card.has("name") and not bool(card.get("faceDown", false))
	_name_label.text = label if known and not _material.get_shader_parameter("has_front") else ""
	if not on_battlefield:
		_badges.show_spec({}, SIZE, false)


## Os selos da permanente (BadgeSpec.for_card); {} apaga. Virada, os selos vão para os cantos da carta deitada de lado;
## virada para baixo (a carta gira 180° no eixo Z), os selos giram de volta para ficarem por cima.
## `boost` aumenta os selos (cartas pequenas ou longe da câmera).
func set_badges(spec: Dictionary, tapped: bool, face_down: bool, boost: float = 1.0) -> void:
	_badges.basis = Basis(Vector3.FORWARD, PI) if face_down else Basis.IDENTITY
	_badges.position = Vector3(0, -_depth, 0) if face_down else Vector3.ZERO
	_badges.show_spec(spec, SIZE, tapped, boost)


## O selo de custo da carta da mão: `cost` como "{2}{G}" ("" apaga). Jogável, a borda acende; `delta` < 0 (mais barata que
## o impresso) fica verde e > 0 (mais cara) vermelha, como na mesa do navegador.
func set_hand_info(cost: String, playable: bool, delta: int = 0) -> void:
	var key: String = "%s|%s|%d" % [cost, str(playable), delta]
	if key == _cost_key:
		return
	_cost_key = key
	if _cost:
		_cost.queue_free()
		_cost = null
	if cost == "":
		return
	_cost = CardBadges.cost_chip(cost, playable, delta, SIZE)
	_visual.add_child(_cost)


## Sombra de contato embaixo da carta (no campo e nos montes; na mão e na pilha, não).
func set_contact_shadow(on: bool) -> void:
	_shadow_on = on
	_shadow.visible = on and not _flying


## Um monte (o grimório): a borda desce até `depth`, como várias cartas empilhadas.
func set_pile_depth(depth: float) -> void:
	_set_depth(maxf(depth, THICKNESS))


func _set_depth(depth: float) -> void:
	_depth = depth
	_edge.scale = Vector3(1, depth / THICKNESS, 1)
	_bottom.position = Vector3(0, -depth, 0)
	_shadow.position = Vector3(0, -depth - 0.0015, 0)


func set_texture(tex: Texture2D) -> void:
	_material.set_shader_parameter("front_tex", tex)
	_material.set_shader_parameter("has_front", tex != null)
	if tex != null:
		_name_label.text = ""


## Destaque: força 0 apaga.
func set_glow(color: Color, strength: float) -> void:
	_material.set_shader_parameter("glow", Vector4(color.r, color.g, color.b, strength))


func set_dim(amount: float) -> void:
	_material.set_shader_parameter("dim", amount)


## Leva a carta até `target`; com `arc`, sobe no meio do caminho (mudança de zona).
func move_to(target: Transform3D, arc: bool = false) -> void:
	if _placed and target.is_equal_approx(_target):
		return
	_target = target
	if not _placed:
		_placed = true
		transform = target
		return
	if _tween:
		_tween.kill()
	_tween = create_tween().set_parallel(true)
	var from: Transform3D = transform
	var lift: float = 1.2 if arc else 0.0
	# No voo em arco a sombra de contato sairia do tampo junto com a carta: some e volta no pouso.
	_flying = arc
	if arc:
		_shadow.visible = false
	_tween.tween_method(func(t: float) -> void:
		var eased: float = ease(t, -2.2)
		var current: Transform3D = from.interpolate_with(target, eased)
		current.origin.y += sin(t * PI) * lift
		transform = current, 0.0, 1.0, MOVE_TIME * (1.6 if arc else 1.0))
	# Pouso com física leve: um quique pequeno e a inclinação que se desfaz (mais forte quando veio em arco).
	_tween.chain().tween_callback(func() -> void:
		_flying = false
		_shadow.visible = _shadow_on
		CardMotion.settle(self, 1.0 if arc else 0.4))


## Levanta (ou abaixa) o desenho da carta da mão. A área do clique não sai do lugar: só cresce para cobrir também a
## carta levantada. Se ela subisse junto, a carta saía de baixo do mouse, descia, voltava a subir, e o clique se perdia.
func set_lifted(on: bool) -> void:
	if on == lifted:
		return
	lifted = on
	_fit_hit_area(on)
	if _lift_tween:
		_lift_tween.kill()
	_lift_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_lift_tween.tween_property(_visual, "position", LIFT if on else Vector3.ZERO, 0.14)
	_lift_tween.tween_property(_visual, "scale", Vector3.ONE * (LIFT_SCALE if on else 1.0), 0.14)


## A área do clique: a carta parada ou, levantada, o retângulo que vai dela até a carta levantada.
func _fit_hit_area(on: bool) -> void:
	if not on:
		_hit_box.size = Vector3(SIZE.x, 0.02, SIZE.y)
		_hit_shape.position = Vector3.ZERO
		return
	var top: float = LIFT.z - SIZE.y * LIFT_SCALE / 2.0
	var bottom: float = SIZE.y / 2.0
	_hit_box.size = Vector3(SIZE.x * LIFT_SCALE, LIFT.y * 2.0 + 0.02, bottom - top)
	_hit_shape.position = Vector3(0, LIFT.y, (top + bottom) / 2.0)


## Queima até sumir (destruída), com a borda acesa na cor dada; depois se apaga.
func burn_away(color: Color, duration: float = 0.9) -> void:
	_material.set_shader_parameter("dissolve_color", color)
	_hide_extras()
	var tween := create_tween()
	tween.tween_method(func(v: float) -> void: _material.set_shader_parameter("dissolve", v), 0.001, 1.0, duration).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


## Sugada por um portal (exílio): gira, encolhe e afunda; depois se apaga.
func swirl_away(duration: float = 0.8) -> void:
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_property(self, "scale", Vector3(0.02, 0.02, 0.02), duration)
	tween.tween_property(self, "rotation:y", rotation.y + TAU * 1.5, duration)
	tween.tween_property(self, "position:y", position.y + 0.6, duration * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.chain().tween_callback(queue_free)


## Avança até perto de `target` e volta (o golpe do atacante).
func lunge(target: Vector3, duration: float = 0.32) -> void:
	var home: Vector3 = position
	var parent_target: Vector3 = (get_parent() as Node3D).to_local(target) if get_parent() is Node3D else target
	var hit: Vector3 = home.lerp(parent_target, 0.45) + Vector3(0, 0.35, 0)
	var tween := create_tween()
	tween.tween_property(self, "position", hit, duration * 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_property(self, "position", home, duration * 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Clarão rápido na carta (dano, entrada, bloqueio).
func flash_color(color: Color, duration: float = 0.35) -> void:
	var tween := create_tween()
	tween.tween_method(func(a: float) -> void: _material.set_shader_parameter("flash", Vector4(color.r, color.g, color.b, a)), 1.6, 0.0, duration)


## Treme de leve no lugar (ganhou marcador, sobreviveu).
func jolt(strength: float = 0.06) -> void:
	var tween := create_tween()
	for i: int in 4:
		tween.tween_property(_visual, "position:x", strength * (1.0 if i % 2 == 0 else -1.0), 0.04)
	tween.tween_property(_visual, "position:x", 0.0, 0.04)


## Some e se apaga (a carta saiu do estado).
func vanish() -> void:
	if _tween:
		_tween.kill()
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector3(0.01, 0.01, 0.01), 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


## A borda, a sombra e os selos não queimam com o shader: somem logo que a carta começa a queimar.
func _hide_extras() -> void:
	_badges.clear()
	_shadow_on = false
	_shadow.visible = false
	var tween := create_tween()
	tween.tween_interval(0.12)
	tween.tween_callback(func() -> void: _edge.visible = false)


## A borda lateral: um anel de cantos arredondados do tamanho da carta, de y = 0 a y = −THICKNESS (o mesmo para todas).
static func _edge_shape() -> ArrayMesh:
	if _edge_mesh:
		return _edge_mesh
	var outline: PackedVector2Array = []
	var half: Vector2 = SIZE / 2.0 - Vector2(CORNER, CORNER)
	var corners: Array[Vector2] = [Vector2(half.x, half.y), Vector2(-half.x, half.y), Vector2(-half.x, -half.y), Vector2(half.x, -half.y)]
	for c: int in 4:
		for step: int in 7:
			var angle: float = c * PI / 2.0 + step * (PI / 2.0) / 6.0
			outline.append(corners[c] + Vector2(cos(angle), sin(angle)) * CORNER)
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
		var low_a := Vector3(a.x, -THICKNESS, a.y)
		var low_b := Vector3(b.x, -THICKNESS, b.y)
		for v: Vector3 in [top_a, low_a, low_b, top_a, low_b, top_b]:
			st.set_normal(normal)
			st.add_vertex(v)
	_edge_mesh = st.commit()
	return _edge_mesh


## Material da sombra de contato: um retângulo de cantos redondos com a borda bem esfumada.
static func _shadow_mat() -> StandardMaterial3D:
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


func _set_hover(on: bool) -> void:
	hovered = on
	_material.set_shader_parameter("hover", 1.0 if on else 0.0)
	hover_changed.emit(self, on)


func _on_input(_camera: Node, event: InputEvent, _position: Vector3, _normal: Vector3, _shape: int) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		clicked.emit(self)
