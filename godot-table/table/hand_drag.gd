# Arrastar cartas da mão: soltar acima da mão joga (o mesmo {type:"card", id, gen} do clique), soltar na mão muda a
# ordem, e a carta segue o mouse em 3D (deita ao chegar no campo e inclina para onde vai). Sem arrastar, é um clique.
class_name HandDrag
extends Node

## Clique numa carta da mão sem arrastar (a tela da partida trata como o clique de sempre).
signal tapped(node: CardNode)
## Soltou a carta jogável no campo.
signal play(message: Dictionary)
## Começou a arrastar (a prévia da carta sai da frente).
signal started

## Quanto o mouse anda (pixels da mesa) antes de virar arrasto.
const THRESHOLD := 9.0
## Altura, sobre o tampo, da carta arrastada sobre o campo.
const TABLE_HEIGHT := 0.75
## Tempo de espera pelo estado depois de soltar para jogar; sem resposta, a carta volta para a mão.
const PLAY_WAIT := 2.5
const RETURN_TIME := 0.22

var table: TableView
## O último estado do servidor.
var state: Callable = func() -> Dictionary: return {}

var _button_down: bool = false
var _pending: CardNode
var _start: Vector2
var _source: CardNode
var _ghost: CardNode
var _mouse: Vector2
var _last_mouse: Vector2
var _velocity: Vector2 = Vector2.ZERO
var _rise: float = 0.0
## Soltou para jogar e espera o estado: {id, gen, ghost, source, left}.
var _awaiting: Dictionary = {}


# — Regras (sem cena, para os testes) —

## Dá para jogar a carta arrastando agora: é sua, da mão, e o servidor a lista como jogável com a prioridade, sem
## pergunta, pagamento ou alvo em andamento (canDragHandCard de src/ui/handDrag.ts).
static func can_drag(s: Dictionary, id: int) -> bool:
	var input: Dictionary = s.get("input", {}) if s.get("input") is Dictionary else {}
	if not bool(input.get("priority", false)) or bool(s.get("gameOver", false)) or s.get("question") is Dictionary or s.get("sideboarding") is Dictionary:
		return false
	var ok: Variant = input.get("ok")
	if not (ok is Dictionary and bool((ok as Dictionary).get("enabled", false))):
		return false
	for busy: String in ["paying", "targeting", "suspendCast"]:
		var value: Variant = input.get(busy)
		if value is Dictionary or value is Array or (value is bool and value):
			return false
	var in_hand: bool = false
	for raw: Variant in s.get("players", []):
		var player: Dictionary = raw
		if int(player.get("id", -1)) == int(s.get("you", -2)):
			for card: Variant in player.get("hand", []):
				in_hand = in_hand or int((card as Dictionary).get("id", -1)) == id
	return in_hand and ((input.get("actionable", []) as Array).has(id) or (s.get("castable", []) as Array).has(id))


## O que soltar a carta faz: {type:"card", id, gen} quando ela anda o bastante, sai da faixa da mão e é jogável; senão {}.
static func drop_action(s: Dictionary, id: int, start: Vector2, end: Vector2, hand: Rect2) -> Dictionary:
	if start.distance_to(end) < THRESHOLD or inside_hand(hand, end) or not can_drag(s, id):
		return {}
	return {"type": "card", "id": id, "gen": int((s.get("input", {}) as Dictionary).get("gen", 0))}


## Soltar dentro da faixa da mão (ou abaixo dela, no pé da tela) devolve a carta ou muda a ordem.
static func inside_hand(hand: Rect2, point: Vector2) -> bool:
	return hand.size.x > 0.0 and point.x >= hand.position.x - 20.0 and point.x <= hand.end.x + 20.0 and point.y >= hand.position.y


## Mantém a ordem guardada das cartas que continuam na mão; as que chegaram entram no fim, na ordem do servidor.
static func arrange(saved: Array, ids: Array) -> Array[int]:
	var out: Array[int] = []
	for id: Variant in saved:
		if ids.has(int(id)) and not out.has(int(id)):
			out.append(int(id))
	for id: Variant in ids:
		if not out.has(int(id)):
			out.append(int(id))
	return out


## Leva a carta para a posição `to` (contada sem ela); [] quando nada muda.
static func move_in_hand(order: Array, id: int, to: int) -> Array:
	var from: int = order.find(id)
	if from < 0:
		return []
	var target: int = clampi(to, 0, order.size() - 1)
	if target == from:
		return []
	var next: Array = order.filter(func(x: Variant) -> bool: return int(x) != id)
	next.insert(target, id)
	return next


## Onde a carta cai ao soltar em `x`: quantas das outras cartas têm o centro antes do mouse.
static func drop_index(centers: Array, from: int, x: float) -> int:
	var count: int = 0
	for i: int in centers.size():
		if i != from and float(centers[i]) < x:
			count += 1
	return count


# — Na mesa —

## Arrastando uma carta agora.
func active() -> bool:
	return _ghost != null and _source != null


## Apertou uma carta da sua mão: espera para ver se é clique ou arrasto (se já soltou, é clique).
func press(node: CardNode) -> void:
	if not _button_down or active() or not _awaiting.is_empty():
		tapped.emit(node)
		return
	_pending = node
	_start = _mouse


## Antes de a mesa aplicar um estado: a carta que foi solta para jogar sai da mão a partir de onde foi solta.
func before_state(s: Dictionary) -> void:
	if _awaiting.is_empty():
		return
	var id: int = _awaiting["id"]
	var source: CardNode = _awaiting["source"]
	var ghost: CardNode = _awaiting["ghost"]
	if not _in_hand(s, id):
		_awaiting = {}
		if is_instance_valid(source):
			source.transform = ghost.transform
			source.visible = true
		ghost.queue_free()
	elif int((s.get("input", {}) as Dictionary).get("gen", 0)) != int(_awaiting["gen"]):
		_return_awaiting()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var button := event as InputEventMouseButton
		_button_down = button.pressed
		_mouse = button.position
		if not button.pressed:
			_release(button.position)
	elif event is InputEventMouseMotion:
		_mouse = (event as InputEventMouseMotion).position
		if _pending and not active() and _mouse.distance_to(_start) >= THRESHOLD:
			_begin()
	elif event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE and active():
		_finish_return()
		get_viewport().set_input_as_handled()


func _process(delta: float) -> void:
	if not _awaiting.is_empty():
		_awaiting["left"] = float(_awaiting["left"]) - delta
		if float(_awaiting["left"]) <= 0.0:
			_return_awaiting()
	if not active():
		return
	if not is_instance_valid(_source) or table.zone_of(_source.card_id) != "hand":
		# A carta saiu da mão por outro caminho enquanto era arrastada.
		_ghost.queue_free()
		_ghost = null
		_source = null
		return
	# O mouse vem dos eventos (_input), não da posição do sistema: assim os testes e os prints conseguem movê-lo.
	var mouse: Vector2 = _mouse
	var instant: Vector2 = (mouse - _last_mouse) / maxf(delta, 0.001) if mouse != _last_mouse else Vector2.ZERO
	_last_mouse = mouse
	_velocity = _velocity.lerp(instant, 0.3) if instant != Vector2.ZERO else _velocity * 0.82
	var goal: Transform3D = _drag_pose(mouse)
	var follow: float = 1.0 - exp(-28.0 * delta)
	var current: Transform3D = _ghost.transform
	var turn: Quaternion = current.basis.get_rotation_quaternion().slerp(goal.basis.get_rotation_quaternion(), follow)
	var size: float = lerpf(current.basis.get_scale().x, goal.basis.get_scale().x, follow)
	_ghost.transform = Transform3D(Basis(turn).scaled(Vector3.ONE * size), current.origin.lerp(goal.origin, follow))
	var over_field: bool = not inside_hand(table.hand_rect(), mouse)
	var playable: bool = can_drag(_state(), _source.card_id)
	# Sobre o campo, a carta jogável acende: soltar ali joga.
	_ghost.set_glow(Color(0.3, 0.75, 1.0), 1.25 if over_field and playable else (0.55 if playable else 0.0))
	_ghost.set_dim(0.35 if over_field and not playable else 0.0)


## A pose da carta arrastada sob o mouse: de pé de frente para a câmera perto da mão, deitada sobre o tampo no campo.
func _drag_pose(mouse: Vector2) -> Transform3D:
	var camera: Camera3D = table.camera
	var hand: Rect2 = table.hand_rect()
	var field_y: float = camera.unproject_position(table.seat_center(_you())).y
	var top: float = hand.position.y if hand.size.y > 0 else camera.get_viewport().get_visible_rect().size.y * 0.75
	_rise = clampf((top - mouse.y) / maxf(1.0, top - field_y), 0.0, 1.0)
	var depth: float = camera.global_position.distance_to(TableView.HAND_CENTER) * 0.92
	var near: Vector3 = camera.project_position(mouse, depth)
	var hit: Variant = Plane(Vector3.UP, TABLE_HEIGHT).intersects_ray(camera.project_ray_origin(mouse), camera.project_ray_normal(mouse))
	var far: Vector3 = hit if hit is Vector3 else near
	var lay: float = ease(_rise, -1.6)
	var tilt: Vector3 = HandMotion.drag_tilt(_velocity, _rise)
	var standing: Quaternion = table.hand_basis(near).get_rotation_quaternion()
	var basis := Basis(standing.slerp(Quaternion.IDENTITY, lay)) * Basis(Vector3.RIGHT, tilt.x) * Basis(Vector3.BACK, tilt.y)
	return Transform3D(basis.scaled(Vector3.ONE * tilt.z), near.lerp(far, lay))


func _begin() -> void:
	_source = _pending
	_pending = null
	if not is_instance_valid(_source):
		_source = null
		return
	started.emit()
	_ghost = CardNode.new()
	_ghost.card_id = _source.card_id
	table.add_child(_ghost)
	_ghost.set_data(_source.data, table.sleeve_of(_you()), "", false)
	_ghost.image_url = _source.image_url
	var tex: Texture2D = table.catalog.texture(_source.image_url) if table.catalog else null
	# Sem a imagem ainda, a carta desenhada (a mesma que estava na mão).
	_ghost.set_texture(tex if tex != null or table.catalog == null else table.catalog.sketch(_source.data))
	_unpickable(_ghost)
	# Começa onde está o desenho da carta (levantada pelo mouse, se estava).
	var start: Transform3D = _source.transform
	if _source.lifted:
		start = start * Transform3D(Basis.from_scale(Vector3.ONE * CardNode.LIFT_SCALE), CardNode.LIFT)
	_ghost.transform = start
	_source.visible = false
	_velocity = Vector2.ZERO
	_last_mouse = _mouse


func _release(at: Vector2) -> void:
	if _pending and not active():
		var node: CardNode = _pending
		_pending = null
		if is_instance_valid(node):
			tapped.emit(node)
		return
	if not active():
		return
	var id: int = _source.card_id
	var hand: Rect2 = table.hand_rect()
	if inside_hand(hand, at):
		var slots: Array = table.hand_slots()
		var order: Array = slots.map(func(slot: Dictionary) -> int: return int(slot["id"]))
		var centers: Array = slots.map(func(slot: Dictionary) -> float: return table.camera.unproject_position((slot["transform"] as Transform3D).origin).x)
		var next: Array = move_in_hand(order, id, drop_index(centers, order.find(id), at.x))
		if not next.is_empty():
			table.set_hand_order(next)
		_finish_return()
		return
	var message: Dictionary = drop_action(_state(), id, _start, at, hand)
	if message.is_empty():
		_finish_return()
		return
	# Solta no campo: a cópia deita onde caiu e espera o estado (a carta de verdade sai dali para a pilha ou o campo).
	var ghost: CardNode = _ghost
	_awaiting = {"id": id, "gen": int(message["gen"]), "ghost": ghost, "source": _source, "left": PLAY_WAIT}
	_ghost = null
	_source = null
	var flat: Transform3D = _drag_pose(at)
	var tween := ghost.create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(ghost, "transform", Transform3D(Basis.from_scale(Vector3.ONE * 1.05), Vector3(flat.origin.x, 0.12, flat.origin.z)), 0.16)
	play.emit(message)


## A carta volta para o lugar dela na mão (soltou na mão, fora do campo, ou não era jogável).
func _finish_return() -> void:
	var ghost: CardNode = _ghost
	var source: CardNode = _source
	_ghost = null
	_source = null
	_fly_back(ghost, source)


func _return_awaiting() -> void:
	var ghost: CardNode = _awaiting["ghost"]
	var source: CardNode = _awaiting["source"]
	_awaiting = {}
	_fly_back(ghost, source)


func _fly_back(ghost: CardNode, source: CardNode) -> void:
	if not is_instance_valid(source) or table.zone_of(source.card_id) != "hand":
		if is_instance_valid(source):
			source.visible = true
		ghost.queue_free()
		return
	var home: Transform3D = source.transform
	for slot: Dictionary in table.hand_slots():
		if int(slot["id"]) == source.card_id:
			home = slot["transform"]
	ghost.set_glow(Color.BLACK, 0.0)
	var tween := ghost.create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(ghost, "transform", home, RETURN_TIME)
	tween.tween_callback(func() -> void:
		if is_instance_valid(source):
			source.transform = home
			source.visible = true
		ghost.queue_free())


static func _in_hand(s: Dictionary, id: int) -> bool:
	for raw: Variant in s.get("players", []):
		var player: Dictionary = raw
		if int(player.get("id", -1)) == int(s.get("you", -2)):
			for card: Variant in player.get("hand", []):
				if int((card as Dictionary).get("id", -1)) == id:
					return true
	return false


## A cópia que segue o mouse não pega o mouse (senão ela tapava as cartas de baixo).
static func _unpickable(node: Node) -> void:
	for child: Node in node.get_children():
		if child is Area3D:
			(child as Area3D).input_ray_pickable = false


func _state() -> Dictionary:
	var s: Variant = state.call()
	return s if s is Dictionary else {}


func _you() -> int:
	return int(_state().get("you", 0))
