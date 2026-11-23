# A mesa 3D: câmera, luz, tampo e as cartas de cada zona; a cada estado novo, cada carta voa para o lugar dela.
# Layout aproximado ao da mesa do navegador: você embaixo, o oponente em cima, mão em leque, grimório e cemitério nos cantos.
class_name TableView
extends Node3D

signal card_clicked(card: CardNode)
signal card_hovered(card: CardNode, on: bool)

## Cor do verso de cada jogador (sleeve 0 a 7 do servidor; .sleeve-N --sleeve-mid de src/style.css).
const SLEEVES: Array[Color] = [Color("#8c5523"), Color("#2a62d0"), Color("#a3322b"), Color("#217e71"), Color("#6b40aa"), Color("#838383"), Color("#ad3c7e"), Color("#9b8a12")]
const CAMERA_POS := Vector3(0, 8.4, 6.3)
const CAMERA_LOOK := Vector3(0, 0, 0.6)
const TAP_ANGLE := -PI / 2.0
## Centro do leque da sua mão: perto da câmera, na base da tela.
const HAND_CENTER := Vector3(0, 3.2, 4.45)
## Na mão: quanto a carta jogável fica mais alta (para cima na tela) e quanto as outras apagam quando há o que jogar.
const HAND_PLAYABLE_RISE := 0.07
const HAND_UNPLAYABLE_DIM := 0.22
## Altura das permanentes sobre o tampo: a carta tem espessura, e a face de baixo não pode encostar no tampo.
const FIELD_Y := CardNode.THICKNESS + 0.004

var catalog: CardCatalog
var camera: Camera3D

## chave (id da carta, ou texto nas escondidas) → CardNode
var _cards: Dictionary = {}
## chave → zona da última vez, para saber quando a carta muda de zona (e voar em arco)
var _zones: Dictionary = {}
var _counts: Dictionary = {}
var _state: Dictionary = {}
## O que os selos e a arrumação do campo precisam do estado (BadgeSpec.context), refeito a cada estado.
var _ctx: Dictionary = {}
## Linha fina entre os grupos de uma fileira (criaturas | planeswalkers; artefatos | terrenos): "sep:<jogador>:<fileira>" → nó.
var _separators: Dictionary = {}
## id do jogador → as zonas dele (SeatLayout)
var _frames: Dictionary = {}
var _arrows: Arrows
## A ordem da sua mão (a do servidor, com as mudanças que o jogador fez arrastando) e as cartas jogáveis nela.
var _hand_order: Array[int] = []
var _hand_playable: Array = []
## Setas pedidas: [{from, to, color}], com from/to sendo o id de uma carta ou "player:<id>".
var _arrow_specs: Array = []
## Onde fica na tela o retrato de cada jogador (o HUD responde), para a seta que mira um jogador.
var player_screen_position: Callable = func(_id: int) -> Vector2: return Vector2(-1, -1)


func _ready() -> void:
	# O clique nas cartas é por raio da câmera até as áreas de colisão (Area3D.input_event).
	get_viewport().physics_object_picking = true
	_build_scene()


func _build_scene() -> void:
	# Câmera, luzes, ambiente, pós-processamento e o tampo: table/table_environment.gd.
	camera = TableEnvironment.build(self)

	_arrows = Arrows.new()
	add_child(_arrows)


## Aplica um estado: cria as cartas novas, move as que mudaram e apaga as que saíram.
func apply_state(state: Dictionary) -> void:
	_state = state
	_ctx = BadgeSpec.context(state)
	var you: int = int(state.get("you", 0))
	var players: Array = state.get("players", [])
	var seen: Dictionary = {}
	var names: PackedStringArray = []
	var opponents: Array = SeatLayout.opponents_in_order(players, you)
	_frames = {you: SeatLayout.mine()}
	for i: int in opponents.size():
		_frames[int((opponents[i] as Dictionary)["id"])] = SeatLayout.opponent(i, opponents.size())
	for raw: Variant in players:
		var player: Dictionary = raw
		var frame: Dictionary = _frames[int(player["id"])]
		var sleeve: Color = SLEEVES[int(player.get("sleeve", 0)) % SLEEVES.size()]
		_place_battlefield(player, frame, sleeve, seen, names)
		_place_hand(player, frame, sleeve, seen, names)
		_place_pile(player, "graveyard", frame, sleeve, seen, names)
		_place_pile(player, "exile", frame, sleeve, seen, names)
		_place_pile(player, "commandZone", frame, sleeve, seen, names)
		_place_library(player, frame, sleeve, seen)
	_place_stack(state.get("stack", []), you, seen, names)
	catalog.request(names)
	for key: Variant in _cards.keys():
		if not seen.has(key):
			(_cards[key] as CardNode).vanish()
			_cards.erase(key)
			_zones.erase(key)
	for key: Variant in _counts.keys():
		(_counts[key] as Label3D).visible = seen.has("#" + Txt.of(key))


## Onde fica na tela o retrato de um oponente (o HUD põe o retrato ali); (-1, -1) para você, que fica no canto.
func portrait_slot(player_id: int) -> Vector2:
	var frame: Dictionary = _frames.get(player_id, {})
	if frame.is_empty() or int(frame["side"]) > 0:
		return Vector2(-1, -1)
	return camera.unproject_position(frame["portrait"])


## Quantos jogadores há na mesa (para o HUD escolher o tamanho dos retratos).
func player_count() -> int:
	return _frames.size()


## As setas a desenhar: [{from, to, color}] com o id da carta ou "player:<id>" em cada ponta.
func set_arrows(specs: Array) -> void:
	_arrow_specs = specs


func _process(_delta: float) -> void:
	var drawn: Array = []
	for raw: Variant in _arrow_specs:
		var spec: Dictionary = raw
		var a: Variant = _anchor(spec["from"])
		var b: Variant = _anchor(spec["to"])
		if a is Vector3 and b is Vector3:
			drawn.append({"from": a, "to": b, "color": spec["color"]})
	_arrows.arrows = drawn


## A posição de uma ponta da seta: o centro da carta, ou o retrato do jogador levado para dentro da mesa.
func _anchor(key: Variant) -> Variant:
	if _cards.has(key):
		return (_cards[key] as CardNode).global_position + Vector3(0, 0.05, 0)
	var text: String = Txt.of(key)
	if text.begins_with("player:"):
		var screen: Vector2 = player_screen_position.call(int(text.substr(7)))
		if screen.x < 0:
			return null
		# O ponto do tampo (um pouco acima) debaixo do retrato: a seta e o golpe chegam na mesa, não colados na câmera.
		var origin: Vector3 = camera.project_ray_origin(screen)
		var direction: Vector3 = camera.project_ray_normal(screen)
		var hit: Variant = Plane(Vector3.UP, 0.4).intersects_ray(origin, direction)
		return hit if hit is Vector3 else camera.project_position(screen, 6.5)
	return null


## Tira a carta da mesa sem apagá-la (o diretor de efeitos a faz sair em cena); null se não está à mostra.
func detach(id: Variant) -> CardNode:
	var node: CardNode = _cards.get(id)
	if node:
		_cards.erase(id)
		_zones.erase(id)
	return node


## Onde fica, na mesa, uma carta ("player:<id>" para o retrato do jogador); null se não está à mostra.
func anchor(key: Variant) -> Variant:
	return _anchor(key)


## Onde fica uma zona de um jogador ("library", "graveyard", "exile", "command"; "hand" é a mão: a sua, no leque).
func zone_position(player_id: int, zone: String) -> Vector3:
	var frame: Dictionary = _frames.get(player_id, SeatLayout.mine())
	if zone == "hand" and int(frame["side"]) > 0:
		return HAND_CENTER
	return frame.get(zone, frame["library"])


## A cor do verso das cartas de um jogador.
func sleeve_of(player_id: int) -> Color:
	for raw: Variant in _state.get("players", []):
		if int((raw as Dictionary)["id"]) == player_id:
			return SLEEVES[int((raw as Dictionary).get("sleeve", 0)) % SLEEVES.size()]
	return SLEEVES[0]


## O meio da área de um jogador no tampo (onde cai o dado dele no "quem começa").
func seat_center(player_id: int) -> Vector3:
	var frame: Dictionary = _frames.get(player_id, SeatLayout.mine())
	return Vector3(float(frame["cx"]), 0, float(frame["others_z"]) + (0.4 if int(frame["side"]) > 0 else -0.2))


## Onde fica o grimório de um jogador.
func library_position(player_id: int) -> Vector3:
	var frame: Dictionary = _frames.get(player_id, SeatLayout.mine())
	return frame["library"]


## O nó de uma carta (null se não está à mostra).
func card_node(id: Variant) -> CardNode:
	return _cards.get(id)


## A zona em que a carta está na mesa ("hand", "battlefield"…), ou "".
func zone_of(id: Variant) -> String:
	return Txt.of(_zones.get(id, ""))


## A carta do estado com esse id, onde estiver ({} se não está à mostra).
func card_data(id: int) -> Dictionary:
	var node: CardNode = _cards.get(id)
	return node.data if node else {}


func refresh_textures() -> void:
	for node: CardNode in _cards.values():
		_update_texture(node)


func on_texture_ready(url: String, tex: Texture2D) -> void:
	for node: CardNode in _cards.values():
		if node.image_url == url:
			node.set_texture(tex)


## Destaques do prompt atual: pode jogar (azul), escolhível (amarelo), selecionada (verde); o resto escurece se há escolha.
func highlight(actionable: Array, selectable: Array, selected: Array, dim_others: bool, stacks: Array = []) -> void:
	for key: Variant in _cards.keys():
		var node: CardNode = _cards[key]
		# Item da pilha que a escolha aceita (o alvo de um contra-feitiço): aceso como escolhível.
		if node.data.has("stackId") and stacks.has(int(node.data["stackId"])):
			node.set_glow(Color(1.0, 0.82, 0.3), 0.9)
			node.set_dim(0.0)
			continue
		if not key is int:
			node.set_glow(Color.BLACK, 0.0)
			node.set_dim(0.0)
			continue
		var id: int = key
		if selected.has(id):
			node.set_glow(Color(0.35, 1.0, 0.45), 1.0)
		elif selectable.has(id):
			node.set_glow(Color(1.0, 0.82, 0.3), 0.9)
		elif actionable.has(id):
			node.set_glow(Color(0.3, 0.75, 1.0), 0.75)
		else:
			node.set_glow(Color.BLACK, 0.0)
		node.set_dim(0.45 if dim_others and not selectable.has(id) and not selected.has(id) and _zones.get(id, "") == "battlefield" else 0.0)


# — Zonas —

## As permanentes de um jogador (FieldLayout): criaturas e, ao lado, planeswalkers/batalhas na fileira da frente; atrás,
## artefatos/encantamentos e terrenos. Cópias iguais num monte (a de cima com o "×N") e os anexos em leque atrás da carta.
func _place_battlefield(player: Dictionary, frame: Dictionary, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	var scale: float = frame["scale"]
	var rows: Dictionary = FieldLayout.rows(player, _ctx, float(frame["width"]) / scale)
	var attackers: Dictionary = {}
	for raw: Variant in _state.get("combat", []):
		attackers[int((raw as Dictionary).get("attacker", -1))] = true
	for row: String in ["front", "back"]:
		var z: float = float(frame["others_z"] if row == "front" else frame["lands_z"])
		_place_separator("sep:%d:%s" % [int(player["id"]), row], rows[row], frame, z)
		# Os selos crescem um pouco nas cartas menores e mais longe da câmera, para continuarem legíveis.
		var boost: float = (1.0 + maxf(0.0, -z) * 0.07) / sqrt(scale)
		for raw: Variant in rows[row]:
			var item: Dictionary = raw
			var cards: Array = item["cards"]
			var squeeze: float = item["squeeze"]
			for k: int in cards.size():
				var card: Dictionary = cards[k]
				var tapped: bool = bool(card.get("tapped", false))
				var x: float = float(frame["cx"]) + (float(item["x"]) + k * FieldLayout.copy_step(cards.size(), tapped) * squeeze) * scale
				var t := Transform3D(_field_basis(tapped, scale), Vector3(x, FIELD_Y + 0.004 * k + 0.008, z))
				if attackers.has(int(card["id"])) or bool(card.get("attacking", false)):
					t.origin.z -= int(frame["side"]) * 0.55
				var top: bool = k == cards.size() - 1
				_put_permanent(card, t, sleeve, seen, names, BadgeSpec.for_card(card, _ctx, cards.size()) if top else {}, boost)
				if k == 0:
					_place_attachments(card, t, scale, squeeze, seen, names)


## Auras e equipamentos presos a `host`: atrás dela, cada um um pouco mais para a direita e para o alto, menores.
func _place_attachments(host: Dictionary, host_t: Transform3D, scale: float, squeeze: float, seen: Dictionary, names: PackedStringArray) -> void:
	var atts: Array = (_ctx["attachments"] as Dictionary).get(int(host["id"]), [])
	var rise: float = FieldLayout.ATTACH_RISE * FieldLayout.CARD.y * minf(1.0, 1.5 / maxf(atts.size(), 1))
	for i: int in atts.size():
		var card: Dictionary = atts[i]
		var n: int = i + 1
		var offset := Vector3(FieldLayout.ATTACH_STEP * FieldLayout.CARD.x * n * squeeze, -0.003 * n, -rise * n) * scale
		var att_scale: float = scale * FieldLayout.ATTACH_SCALE
		var t := Transform3D(_field_basis(bool(card.get("tapped", false)), att_scale), host_t.origin + offset)
		t.origin.y = maxf(t.origin.y, FIELD_Y)
		_put_permanent(card, t, sleeve_of(int(card.get("controller", 0))), seen, names, {})


func _field_basis(tapped: bool, scale: float) -> Basis:
	var basis := Basis.from_scale(Vector3(scale, scale, scale))
	if tapped:
		basis = Basis(Vector3.UP, TAP_ANGLE).scaled(Vector3(scale, scale, scale))
	return basis


## Põe uma permanente na mesa com os selos dela.
func _put_permanent(card: Dictionary, t: Transform3D, sleeve: Color, seen: Dictionary, names: PackedStringArray, badges: Dictionary, boost: float = 1.0) -> void:
	var id: int = int(card["id"])
	_put(id, card, "battlefield", t, sleeve, seen, names)
	var node: CardNode = _cards.get(id)
	if node:
		node.set_badges(badges, bool(card.get("tapped", false)), bool(card.get("faceDown", false)), boost)


## A linha entre o primeiro e o segundo grupo de uma fileira, no meio do vão entre eles (escondida com um grupo só).
func _place_separator(key: String, items: Array, frame: Dictionary, z: float) -> void:
	var line: MeshInstance3D = _separators.get(key)
	var at: float = INF
	for i: int in range(1, items.size()):
		var a: Dictionary = items[i - 1]
		var b: Dictionary = items[i]
		if int(a["group"]) != int(b["group"]):
			var squeeze: float = b["squeeze"]
			var a_right: float = float(a["x"]) + (float(a["width"]) - (FieldLayout.CARD.y if bool(a["tapped"]) else FieldLayout.CARD.x) / 2.0) * squeeze
			var b_left: float = float(b["x"]) - (FieldLayout.CARD.y if bool(b["tapped"]) else FieldLayout.CARD.x) / 2.0 * squeeze
			at = (a_right + b_left) / 2.0
	if at == INF:
		if line:
			line.visible = false
		return
	if line == null:
		line = MeshInstance3D.new()
		var quad := PlaneMesh.new()
		quad.size = Vector2(0.014, FieldLayout.CARD.y * 0.8)
		line.mesh = quad
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.albedo_color = Color(0.95, 0.71, 0.3, 0.28)
		line.material_override = material
		line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(line)
		_separators[key] = line
	var scale: float = frame["scale"]
	line.visible = true
	line.scale = Vector3(scale, 1, scale)
	line.position = Vector3(float(frame["cx"]) + at * scale, -0.006, z)


func _place_hand(player: Dictionary, frame: Dictionary, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	var library: Vector3 = (frame["library"] as Vector3) + Vector3(0, 0.3, 0)
	var scale: float = frame["scale"]
	# A carta que chega na mão (comprada) voa do grimório; com várias, uma depois da outra. Na busca no grimório quem
	# voa é o efeito da busca (CardFlights.tutor), então a carta só aparece; e na mesa sendo montada (o primeiro estado,
	# antes de o grimório existir) a mão já começa no lugar, como na mesa do navegador.
	var arrivals: int = 0
	var searched: bool = _searched_draw(int(player["id"])) or not _cards.has("library:%d" % int(player["id"]))
	if int(frame["side"]) > 0:
		var cards: Dictionary = {}
		for raw: Variant in player.get("hand", []):
			cards[int((raw as Dictionary)["id"])] = raw
		_hand_order = HandDrag.arrange(_hand_order, cards.keys())
		for i: int in _hand_order.size():
			var id: int = _hand_order[i]
			var fresh: bool = not _cards.has(id)
			var t: Transform3D = _hand_transform(i, _hand_order.size(), id)
			_put(id, cards[id], "hand", t, sleeve, seen, names)
			_hand_info(_cards[id] as CardNode, cards[id])
			if fresh and not searched:
				HandMotion.fly_in(_cards[id] as CardNode, Transform3D(Basis.from_scale(Vector3.ONE * scale), library), t, true, arrivals * HandMotion.ARRIVE_STAGGER)
				arrivals += 1
		return
	# Mão do oponente: os versos em leque no alto da mesa.
	var count: int = int(player.get("handCount", 0))
	var center: Vector3 = frame["hand"]
	for i: int in count:
		var offset: float = i - (count - 1) / 2.0
		var basis: Basis = (Basis(Vector3.FORWARD, PI) * Basis(Vector3.UP, offset * 0.06)).scaled(Vector3(scale, scale, scale))
		var t := Transform3D(basis, center + Vector3(offset * float(frame["hand_spread"]), 0.01 + 0.002 * i, abs(offset) * 0.03))
		var key: String = "hand:%d:%d" % [int(player["id"]), i]
		var fresh: bool = not _cards.has(key)
		_put(key, {}, "hand", t, sleeve, seen, names)
		if fresh and not searched:
			HandMotion.fly_in(_cards[key] as CardNode, Transform3D(Basis(Vector3.FORWARD, PI).scaled(Vector3.ONE * scale), library), t, false, arrivals * HandMotion.ARRIVE_STAGGER)
			arrivals += 1


## O estado traz uma busca no grimório (tutor) desse jogador: o voo da carta é o do efeito.
func _searched_draw(player_id: int) -> bool:
	for raw: Variant in _state.get("events", []):
		var event: Dictionary = raw
		if Txt.of(event.get("type")) == "draw" and bool(event.get("searched", false)) and int(event.get("actor", -1)) == player_id:
			return true
	return false


## Leque da sua mão, de frente para a câmera, na base da tela; a carta jogável fica um pouco mais alta que as outras.
func _hand_transform(index: int, count: int, id: int) -> Transform3D:
	var offset: float = index - (count - 1) / 2.0
	var spread: float = min(0.6, 6.4 / max(count, 1))
	var pos := HAND_CENTER + Vector3(offset * spread, index * 0.006 - abs(offset) * abs(offset) * 0.01, abs(offset) * abs(offset) * 0.006)
	if _hand_playable.has(id):
		pos += camera.global_basis.y * HAND_PLAYABLE_RISE
	return Transform3D(_facing_camera(pos) * Basis(Vector3.UP, -offset * 0.05), pos)


## Uma carta de pé de frente para a câmera: a face (+Y) olha para ela e o alto da carta (-Z) aponta para cima na tela.
func _facing_camera(pos: Vector3) -> Basis:
	var y: Vector3 = (CAMERA_POS - pos).normalized()
	var up: Vector3 = camera.global_basis.y
	var z: Vector3 = -(up - y * up.dot(y)).normalized()
	return Basis(y.cross(z), y, z)


## A rotação de uma carta de pé de frente para a câmera em `pos` (a carta arrastada perto da mão).
func hand_basis(pos: Vector3) -> Basis:
	return _facing_camera(pos)


## As cartas jogáveis da mão (input.actionable com a prioridade) ficam mais altas, e as outras um pouco apagadas.
## Chame depois de highlight(), que acende as cartas pelo prompt.
func apply_hand_layout(actionable: Array, priority: bool) -> void:
	var playable: Array = _hand_order.filter(func(id: int) -> bool: return priority and actionable.has(id))
	var changed: bool = playable != _hand_playable
	_hand_playable = playable
	for i: int in _hand_order.size():
		var node: CardNode = _cards.get(_hand_order[i])
		if node == null:
			continue
		if changed and not dragging(node):
			node.move_to(_hand_transform(i, _hand_order.size(), _hand_order[i]))
		node.set_dim(HAND_UNPLAYABLE_DIM if not playable.is_empty() and not playable.has(_hand_order[i]) else 0.0)
		_hand_info(node, node.data)


## Muda a ordem da sua mão (a que o jogador arrumou arrastando; o servidor não sabe dela) e leva as cartas para o lugar.
func set_hand_order(order: Array) -> void:
	_hand_order = HandDrag.arrange(order, _hand_order)
	for i: int in _hand_order.size():
		var node: CardNode = _cards.get(_hand_order[i])
		if node and not dragging(node):
			node.move_to(_hand_transform(i, _hand_order.size(), _hand_order[i]))


## A sua mão na ordem do leque: [{id, transform}], com o lugar de cada carta.
func hand_slots() -> Array:
	var out: Array = []
	for i: int in _hand_order.size():
		out.append({"id": _hand_order[i], "transform": _hand_transform(i, _hand_order.size(), _hand_order[i])})
	return out


## A faixa da tela ocupada pela sua mão (soltar a carta arrastada ali a devolve ou muda a ordem); vazia sem cartas.
func hand_rect() -> Rect2:
	var points: PackedVector2Array = []
	for slot: Dictionary in hand_slots():
		var t: Transform3D = slot["transform"]
		for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
			points.append(camera.unproject_position(t * Vector3(corner.x * CardNode.SIZE.x / 2.0, 0, corner.y * CardNode.SIZE.y / 2.0)))
	if points.is_empty():
		return Rect2()
	var rect := Rect2(points[0], Vector2.ZERO)
	for point: Vector2 in points:
		rect = rect.expand(point)
	return rect


## A carta da mão que está sendo arrastada (escondida: quem aparece é a cópia que segue o mouse); a mesa não a move.
func dragging(node: CardNode) -> bool:
	return node != null and not node.visible


## Custo e se é jogável, para o selo do custo da carta da mão (CardNode.set_hand_info, quando existir).
func _hand_info(node: CardNode, card: Dictionary) -> void:
	if node == null or not node.has_method("set_hand_info"):
		return
	# Com redução ou aumento (castCost), o custo de agora e quanto mudou: o selo fica verde mais barato, vermelho mais caro.
	var cast: Variant = card.get("castCost")
	var cost: String = Txt.of((cast as Dictionary).get("cost")) if cast is Dictionary else Txt.of(card.get("manaCost"))
	var delta: int = int((cast as Dictionary).get("delta", 0)) if cast is Dictionary else 0
	node.call("set_hand_info", cost, _hand_playable.has(node.card_id), delta)


## Cemitério, exílio e zona de comando: as cartas empilhadas, a de cima à mostra, e quantas são.
func _place_pile(player: Dictionary, zone: String, frame: Dictionary, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	var cards: Array = player.get(zone, []) if player.get(zone) is Array else []
	var key: String = "command" if zone == "commandZone" else zone
	var pos: Vector3 = frame[key]
	var scale: float = frame["scale"]
	for i: int in cards.size():
		var card: Dictionary = cards[i]
		_put(int(card["id"]), card, key, Transform3D(Basis.from_scale(Vector3(scale, scale, scale)), pos + Vector3(0, FIELD_Y + 0.003 * i, 0)), sleeve, seen, names)
		(_cards[int(card["id"])] as CardNode).set_contact_shadow(i == 0)
	_count_label("%s:%d" % [key, int(player["id"])], cards.size(), pos + Vector3(0.22, 0.25, 0.3), seen, cards.size() > 1)


func _place_library(player: Dictionary, frame: Dictionary, sleeve: Color, seen: Dictionary) -> void:
	var count: int = int(player.get("library", 0))
	var pos: Vector3 = frame["library"]
	var scale: float = frame["scale"]
	var key: String = "library:%d" % int(player["id"])
	if count > 0:
		var depth: float = min(count, 60) * 0.004
		var t := Transform3D((Basis(Vector3.FORWARD, PI)).scaled(Vector3(scale, scale, scale)), pos + Vector3(0, depth + 0.002, 0))
		_put(key, {}, "library", t, sleeve, seen, PackedStringArray())
		# Virado para baixo, a face de cima é a de baixo da carta: a borda do monte desce do verso até o tampo.
		(_cards[key] as CardNode).set_pile_depth(depth)
	_count_label(key, count, pos + Vector3(0.22, 0.45, 0.3), seen, true)


## Onde fica na tela cada camada da pilha (0 é o topo), o vão do painel da pilha (StackPanel.layer_rect); sem painel
## (testes, laboratório), Rect2() e a pilha fica no tampo, à direita.
var stack_slot: Callable = func(_depth: int) -> Rect2: return Rect2()
## Distância da câmera até a carta do topo da pilha (as de baixo ficam um pouco atrás).
const STACK_DEPTH := 7.0
## As cartas que estão na pilha flutuando no painel: sem sombra no tampo (a sombra volta quando saem da pilha).
var _stack_keys: Dictionary = {}


## A pilha: cada item é uma carta de pé, de frente para a câmera, no vão do painel da pilha (o topo na frente e as de
## baixo aparecendo por trás). A mágica da sua mão voa até lá em arco; a do oponente sai da mão dele, virando; a
## habilidade e o gatilho saem da permanente que os gerou.
func _place_stack(stack: Array, you: int, seen: Dictionary, names: PackedStringArray) -> void:
	var floating: bool = stack_slot.call(0).size.y > 0.0
	var now: Dictionary = {}
	for i: int in stack.size():
		var item: Dictionary = stack[i]
		var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
		var spell: bool = Txt.of(item.get("kind", "spell")) == "spell" and source.has("id")
		var key: Variant = int(source["id"]) if spell else "stack:%d" % int(item["id"])
		var controller: int = int(item.get("controller", you))
		var sleeve: Color = SLEEVES[0]
		for raw: Variant in _state.get("players", []):
			if int((raw as Dictionary)["id"]) == controller:
				sleeve = SLEEVES[int((raw as Dictionary).get("sleeve", 0)) % SLEEVES.size()]
		var card: Dictionary = source.duplicate()
		card["stackId"] = int(item["id"])
		var t: Transform3D = _stack_transform(i, stack.size())
		var fresh: bool = not _cards.has(key)
		var from: Variant = _stack_origin(source, controller, spell) if fresh else null
		_put(key, card, "stack", from if from is Transform3D else t, sleeve, seen, names)
		if from is Transform3D:
			(_cards[key] as CardNode).move_to(t, true)
		if floating:
			now[key] = true
			_cast_shadow(_cards[key], false)
	for key: Variant in _stack_keys:
		if not now.has(key) and _cards.has(key):
			_cast_shadow(_cards[key], true)
	_stack_keys = now


static func _cast_shadow(node: Node3D, on: bool) -> void:
	for child: Node in node.find_children("*", "GeometryInstance3D", true, false):
		(child as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## O lugar da camada `depth` da pilha: no vão do painel, ou (sem painel) o monte inclinado no tampo, à direita.
func _stack_transform(depth: int, count: int) -> Transform3D:
	var rect: Rect2 = stack_slot.call(depth)
	if rect.size.y <= 0.0:
		var d: int = count - 1 - depth
		return Transform3D(Basis(Vector3.RIGHT, deg_to_rad(28.0)), Vector3(4.6 + d * 0.18, 0.9 + d * 0.05, -0.2 + d * 0.25))
	# As camadas além da terceira ficam exatamente atrás dela (o painel mostra até três por trás do topo).
	var distance: float = STACK_DEPTH + 0.12 * depth
	var pos: Vector3 = camera.project_position(rect.get_center(), distance)
	var view_h: float = camera.get_viewport().get_visible_rect().size.y
	var pixels_per_unit: float = view_h / (2.0 * distance * tan(deg_to_rad(camera.fov) / 2.0))
	var s: float = rect.size.y / pixels_per_unit / CardNode.SIZE.y
	return Transform3D(_facing_camera(pos).scaled(Vector3(s, s, s)), pos)


## De onde vem um item novo da pilha: a habilidade da permanente que a gerou, a mágica do oponente da mão dele (de
## costas); null para nascer já no lugar (a sua mágica já existe: voa da sua mão).
func _stack_origin(source: Dictionary, controller: int, spell: bool) -> Variant:
	if not spell and source.has("id") and _cards.has(int(source["id"])):
		var origin: CardNode = _cards[int(source["id"])]
		return Transform3D(origin.global_transform.basis.orthonormalized().scaled(Vector3(0.6, 0.6, 0.6)), origin.global_position + Vector3(0, 0.2, 0))
	var frame: Dictionary = _frames.get(controller, {})
	if frame.is_empty():
		return null
	var scale: float = frame["scale"]
	var at: Vector3 = HAND_CENTER if int(frame["side"]) > 0 else frame["hand"]
	return Transform3D(Basis(Vector3.FORWARD, PI).scaled(Vector3(scale, scale, scale)), at + Vector3(0, 0.1, 0))


## Cria ou atualiza o nó da carta e o manda para `t` (em arco se mudou de zona).
func _put(key: Variant, card: Dictionary, zone: String, t: Transform3D, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	seen[key] = true
	var node: CardNode = _cards.get(key)
	var fresh: bool = node == null
	if fresh:
		node = CardNode.new()
		node.card_id = key if key is int else -1
		node.clicked.connect(func(n: CardNode) -> void: card_clicked.emit(n))
		node.hover_changed.connect(_on_hover)
		add_child(node)
		_cards[key] = node
		# A carta nova nasce no lugar de onde vem: a do grimório no grimório, a ficha já no campo.
		node.transform = _spawn_from(card, zone, t)
	var face_down: bool = card.is_empty() or bool(card.get("faceDown", false))
	if face_down and zone != "library" and zone != "hand":
		t.basis = t.basis * Basis(Vector3.FORWARD, PI)
	var name: String = Txt.of(card.get("name", ""))
	if name != "":
		names.append(name)
	node.set_data(card, sleeve, catalog.label(name) if name != "" else "", zone == "battlefield")
	_update_texture(node)
	node.set_contact_shadow(zone == "battlefield" or zone == "library")
	if zone != "hand":
		node.set_lifted(false)
		node.set_hand_info("", false)
	var moved_zone: bool = _zones.get(key, zone) != zone
	_zones[key] = zone
	node.move_to(t, moved_zone or fresh)


func _spawn_from(card: Dictionary, zone: String, t: Transform3D) -> Transform3D:
	if zone == "hand" and card.has("controller"):
		var frame: Dictionary = _frames.get(int(card["controller"]), SeatLayout.mine())
		return Transform3D(Basis(Vector3.FORWARD, PI), (frame["library"] as Vector3) + Vector3(0, 0.3, 0))
	return t


func _update_texture(node: CardNode) -> void:
	var url: String = catalog.image_url_for(node.data) if not node.data.is_empty() and not bool(node.data.get("faceDown", false)) else ""
	if url == node.image_url:
		return
	node.image_url = url
	node.set_texture(catalog.texture(url))


func _count_label(key: String, count: int, pos: Vector3, seen: Dictionary, show: bool) -> void:
	var label: Label3D = _counts.get(key)
	if label == null:
		label = Label3D.new()
		label.pixel_size = 0.004
		label.font_size = 36
		label.outline_size = 10
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		add_child(label)
		_counts[key] = label
	label.position = pos
	label.text = str(count)
	if show:
		seen["#" + key] = true


func _on_hover(node: CardNode, on: bool) -> void:
	# A carta da sua mão sob o mouse sobe e cresce (só o desenho; a área do clique fica no lugar).
	if _zones.get(node.card_id, "") == "hand" and node.card_id >= 0:
		node.set_lifted(on)
	card_hovered.emit(node, on)

