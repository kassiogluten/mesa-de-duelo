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
var _stats: Label3D
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

	_stats = Label3D.new()
	_stats.pixel_size = 0.0042
	_stats.font_size = 48
	_stats.outline_size = 14
	_stats.modulate = Color(1, 1, 1)
	_stats.outline_modulate = Color(0.05, 0.05, 0.08)
	# Sempre de frente para a câmera: lê-se igual com a carta virada.
	_stats.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_stats.no_depth_test = true
	_stats.position = Vector3(SIZE.x * 0.3, 0.05, SIZE.y * 0.38)
	_stats.visible = false
	_visual.add_child(_stats)

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
	var known: bool = card.has("name") and not bool(card.get("faceDown", false))
	_name_label.text = label if known and not _material.get_shader_parameter("has_front") else ""
	if on_battlefield and bool(card.get("creature", false)) and card.has("power") and known:
		_stats.text = "%d/%d" % [int(card["power"]), int(card["toughness"]) - int(card.get("damage", 0))]
		var buffed: bool = int(card["power"]) > int(card.get("basePower", card["power"])) or int(card["toughness"]) > int(card.get("baseToughness", card["toughness"]))
		_stats.modulate = Color(1.0, 0.35, 0.3) if int(card.get("damage", 0)) > 0 else (Color(0.5, 1.0, 0.55) if buffed else Color(1, 1, 1))
		_stats.visible = true
	else:
		_stats.visible = false


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
	_tween.tween_method(func(t: float) -> void:
		var eased: float = ease(t, -2.2)
		var current: Transform3D = from.interpolate_with(target, eased)
		current.origin.y += sin(t * PI) * lift
		transform = current, 0.0, 1.0, MOVE_TIME * (1.6 if arc else 1.0))


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


func _set_hover(on: bool) -> void:
	hovered = on
	_material.set_shader_parameter("hover", 1.0 if on else 0.0)
	hover_changed.emit(self, on)


func _on_input(_camera: Node, event: InputEvent, _position: Vector3, _normal: Vector3, _shape: int) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		clicked.emit(self)
