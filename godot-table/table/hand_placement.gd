# A sua mão em leque na base da tela (e os versos da mão do oponente): o lugar de cada carta, a ordem que o jogador arrumou
# arrastando, as jogáveis mais altas, a mão que desce e sobe com o mouse e a carta comprada voando do grimório. Parte da
# TableView.
class_name HandPlacement
extends RefCounted

## Centro do leque da sua mão inteira à vista: perto da câmera, na base da tela.
const HAND_CENTER := Vector3(0, 3.2, 4.45)
## Quanto a mão desce do HAND_CENTER (para baixo na tela, unidades da mesa): parada, um quarto de baixo das cartas fica
## fora da tela, para sobrar campo; com o mouse na mão, sobe até ficarem quase inteiras; numa escolha sobre as cartas da
## mão (descartar, mulligan, revelar), sobe inteira (0).
const REST_DROP := 0.42
const PEEK_DROP := 0.23
## Na mão: quanto a carta jogável fica mais alta (para cima na tela) e quanto as outras apagam (~8%) quando há o que jogar.
const PLAYABLE_RISE := 0.07
const UNPLAYABLE_DIM := 0.12
## Quanto cada carta gira no leque, por posição a partir do meio (radianos).
const FAN_TURN := 0.025
## Folga em volta da mão (pixels) para o mouse contar como em cima dela.
const PEEK_MARGIN := 14.0

var view: TableView
## A ordem da sua mão (a do servidor, com as mudanças que o jogador fez arrastando) e as cartas jogáveis nela.
var order: Array[int] = []
var playable: Array = []
## O mouse está na mão (ela sobe até as cartas ficarem quase inteiras) e há uma escolha sobre as cartas dela (sobe inteira).
var peek: bool = false
var choosing: bool = false


func _init(table: TableView) -> void:
	view = table


func place(player: Dictionary, frame: Dictionary, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	var scale: float = frame["scale"]
	# A comprada sai deitada do alto do grimório (o monte de agora, sem ela) e descola dele pela borda.
	var library: Vector3 = PaperPhysics.pile_top(frame["library"], scale, int(player.get("library", 0)))
	# A carta que chega na mão (comprada) voa do grimório; com várias, uma depois da outra. Na busca no grimório quem
	# voa é o efeito da busca (CardFlights.tutor), então a carta só aparece; e na mesa sendo montada (o primeiro estado,
	# antes de o grimório existir) a mão já começa no lugar, como na mesa do navegador.
	var arrivals: int = 0
	var searched: bool = _searched_draw(int(player["id"])) or view.card_node("library:%d" % int(player["id"])) == null
	if int(frame["side"]) > 0:
		var cards: Dictionary = {}
		for raw: Variant in player.get("hand", []):
			cards[int((raw as Dictionary)["id"])] = raw
		order = HandDrag.arrange(order, cards.keys())
		for i: int in order.size():
			var id: int = order[i]
			var fresh: bool = view.card_node(id) == null
			var t: Transform3D = transform_at(i, order.size(), id)
			view.put_card(id, cards[id], "hand", t, sleeve, seen, names)
			hand_info(view.card_node(id), cards[id])
			if fresh and not searched:
				HandMotion.fly_in(view.card_node(id), Transform3D(Basis.from_scale(Vector3.ONE * scale), library), t, true, arrivals * HandMotion.ARRIVE_STAGGER)
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
		var fresh: bool = view.card_node(key) == null
		view.put_card(key, {}, "hand", t, sleeve, seen, names)
		if fresh and not searched:
			HandMotion.fly_in(view.card_node(key), Transform3D(Basis(Vector3.FORWARD, PI).scaled(Vector3.ONE * scale), library), t, false, arrivals * HandMotion.ARRIVE_STAGGER)
			arrivals += 1


## O estado traz uma busca no grimório (tutor) desse jogador: o voo da carta é o do efeito.
func _searched_draw(player_id: int) -> bool:
	for raw: Variant in view.current_state().get("events", []):
		var event: Dictionary = raw
		if Txt.of(event.get("type")) == "draw" and bool(event.get("searched", false)) and int(event.get("actor", -1)) == player_id:
			return true
	return false


## Leque da sua mão, de frente para a câmera, na base da tela (mais baixa ou mais alta, pelo drop); a carta jogável fica um
## pouco mais alta que as outras.
func transform_at(index: int, count: int, id: int) -> Transform3D:
	var offset: float = index - (count - 1) / 2.0
	var fan: Vector2 = fan_fit(count)
	var pos := HAND_CENTER + view.camera.global_basis.x * fan.y + Vector3(offset * fan.x, index * 0.006 - abs(offset) * abs(offset) * 0.01, abs(offset) * abs(offset) * 0.006)
	pos -= view.camera.global_basis.y * drop()
	if playable.has(id):
		pos += view.camera.global_basis.y * PLAYABLE_RISE
	return Transform3D(facing_camera(pos) * Basis(Vector3.UP, -offset * FAN_TURN), pos)


## Quanto a mão está abaixo da posição inteira agora (REST_DROP, PEEK_DROP ou 0).
func drop() -> float:
	return level_drop(peek, choosing)


## A conta do drop (sem cena, para os testes): a escolha na mão vence o mouse, que vence a mão parada.
static func level_drop(over: bool, choice: bool) -> float:
	if choice:
		return 0.0
	return PEEK_DROP if over else REST_DROP


## Há uma escolha sobre as cartas da sua mão (a mão sobe inteira): o mulligan e o fundo do grimório depois dele, ou uma
## carta da mão entre as que dá para escolher sem a prioridade (descartar, revelar, escolher da mão).
static func choosing_hand(s: Dictionary) -> bool:
	var input: Dictionary = s.get("input", {}) if s.get("input") is Dictionary else {}
	if Txt.of(input.get("opening")) in ["mulligan", "mulligan-bottom"]:
		return true
	if bool(input.get("priority", false)):
		return false
	var selectable: Array = input.get("selectable", []) if input.get("selectable") is Array else []
	if selectable.is_empty():
		return false
	for raw: Variant in s.get("players", []):
		if raw is Dictionary and int((raw as Dictionary).get("id", -2)) == int(s.get("you", -1)):
			for card: Variant in (raw as Dictionary).get("hand", []):
				if card is Dictionary and selectable.has(int((card as Dictionary).get("id", -1))):
					return true
	return false


## O mouse em `mouse` (pixels da tela): em cima da mão (com folga, ou abaixo dela, no pé da tela) ou de uma carta dela
## levantada, a mão sobe; fora, desce. Leva as cartas quando muda.
func update_peek(mouse: Vector2) -> void:
	var rect: Rect2 = screen_rect()
	var over: bool = rect.size.x > 0.0 and mouse.x >= rect.position.x - PEEK_MARGIN and mouse.x <= rect.end.x + PEEK_MARGIN 		and mouse.y >= rect.position.y - PEEK_MARGIN
	for id: int in order:
		var node: CardNode = view.card_node(id)
		over = over or (node != null and node.lifted)
	set_levels(over, choosing)


## Muda o quanto a mão aparece (o mouse em cima, uma escolha na mão) e leva as cartas para o lugar novo.
func set_levels(over: bool, choice: bool) -> void:
	if over == peek and choice == choosing:
		return
	var before: float = drop()
	peek = over
	choosing = choice
	if is_equal_approx(before, drop()):
		return
	for i: int in order.size():
		var node: CardNode = view.card_node(order[i])
		if node and not view.dragging(node):
			node.move_to(transform_at(i, order.size(), order[i]))


## O leque de `count` cartas: x é a distância entre uma carta e a seguinte e y quanto o centro anda para o lado (unidades
## da mesa), para o leque caber na faixa que o HUD deixa livre (Hud.hand_area, entre o seu retrato e a coluna da direita).
## Sem faixa (testes, laboratório), o leque de sempre, no meio.
func fan_fit(count: int) -> Vector2:
	var spread: float = minf(0.6, 6.4 / maxf(count, 1))
	var area: Rect2 = view.hand_area.call()
	if area.size.x <= 0.0 or count <= 0 or view.camera == null:
		return Vector2(spread, 0.0)
	var center_px: float = view.camera.unproject_position(HAND_CENTER).x
	var ppu: float = absf(view.camera.unproject_position(HAND_CENTER + view.camera.global_basis.x).x - center_px)
	if ppu <= 1.0:
		return Vector2(spread, 0.0)
	# As cartas das pontas giram um pouco (e chegam mais perto da câmera): ocupam mais que a largura da carta.
	var turn: float = (count - 1) / 2.0 * FAN_TURN
	var card_width: float = (CardNode.SIZE.x * cos(turn) + CardNode.SIZE.y * sin(turn)) * 1.08
	return fit_fan(spread, count, area.position.x / ppu, area.end.x / ppu, center_px / ppu, card_width)


## A conta do fan_fit em unidades da mesa (sem cena, para os testes): o espaço entre as cartas encolhe até o leque caber
## entre `left` e `right`, e o centro anda o mínimo para dentro da faixa. Devolve (espaço, deslocamento do centro).
static func fit_fan(spread: float, count: int, left: float, right: float, center: float, card_width: float) -> Vector2:
	var avail: float = right - left
	var fitted: float = spread
	if count > 1:
		fitted = clampf(minf(spread, (avail - card_width) / (count - 1)), 0.1, spread)
	var half: float = (fitted * (count - 1) + card_width) / 2.0
	var target: float = center
	if half * 2.0 >= avail:
		target = (left + right) / 2.0
	else:
		target = clampf(center, left + half, right - half)
	return Vector2(fitted, target - center)


## Uma carta de pé de frente para a câmera: a face (+Y) olha para ela e o alto da carta (-Z) aponta para cima na tela.
func facing_camera(pos: Vector3) -> Basis:
	var y: Vector3 = (TableView.CAMERA_POS - pos).normalized()
	var up: Vector3 = view.camera.global_basis.y
	var z: Vector3 = -(up - y * up.dot(y)).normalized()
	return Basis(y.cross(z), y, z)


## As cartas jogáveis da mão (input.actionable com a prioridade) ficam mais altas, e as outras um pouco apagadas; numa
## escolha sobre as cartas da mão (`choice`, choosing_hand), a mão sobe inteira.
func apply_layout(actionable: Array, priority: bool, choice: bool = false) -> void:
	var next: Array = order.filter(func(id: int) -> bool: return priority and actionable.has(id))
	var changed: bool = next != playable or choice != choosing
	playable = next
	choosing = choice
	for i: int in order.size():
		var node: CardNode = view.card_node(order[i])
		if node == null:
			continue
		if changed and not view.dragging(node):
			node.move_to(transform_at(i, order.size(), order[i]))
		node.set_dim(UNPLAYABLE_DIM if not playable.is_empty() and not playable.has(order[i]) else 0.0)
		hand_info(node, node.data)


## Muda a ordem da sua mão (a que o jogador arrumou arrastando; o servidor não sabe dela) e leva as cartas para o lugar.
func set_order(next: Array) -> void:
	order = HandDrag.arrange(next, order)
	for i: int in order.size():
		var node: CardNode = view.card_node(order[i])
		if node and not view.dragging(node):
			node.move_to(transform_at(i, order.size(), order[i]))


## A sua mão na ordem do leque: [{id, transform}], com o lugar de cada carta.
func slots() -> Array:
	var out: Array = []
	for i: int in order.size():
		out.append({"id": order[i], "transform": transform_at(i, order.size(), order[i])})
	return out


## A faixa da tela ocupada pela sua mão (soltar a carta arrastada ali a devolve ou muda a ordem); vazia sem cartas.
func screen_rect() -> Rect2:
	var points: PackedVector2Array = []
	for slot: Dictionary in slots():
		var t: Transform3D = slot["transform"]
		for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
			points.append(view.camera.unproject_position(t * Vector3(corner.x * CardNode.SIZE.x / 2.0, 0, corner.y * CardNode.SIZE.y / 2.0)))
	if points.is_empty():
		return Rect2()
	var rect := Rect2(points[0], Vector2.ZERO)
	for point: Vector2 in points:
		rect = rect.expand(point)
	return rect


## Na sua mão a carta aparece como impressa (card.gdshader `printed`: sem luz, reflexo nem brilho da cena); saindo da
## mão, volta aos poucos para a luz da mesa enquanto voa.
static func set_printed(node: CardNode, on: bool, time: float = 0.2) -> void:
	var material: ShaderMaterial = CardDressing.material_of(node)
	if material == null or bool(node.get_meta("printed", false)) == on:
		return
	node.set_meta("printed", on)
	var before: Variant = node.get_meta("printed_tween") if node.has_meta("printed_tween") else null
	if before is Tween and (before as Tween).is_valid():
		(before as Tween).kill()
	if not node.is_inside_tree() or time <= 0.0:
		material.set_shader_parameter("printed", 1.0 if on else 0.0)
		return
	var tween: Tween = node.create_tween()
	node.set_meta("printed_tween", tween)
	tween.tween_method(func(v: float) -> void: material.set_shader_parameter("printed", v), printed_amount(node), 1.0 if on else 0.0, time)


## O quanto a carta aparece como impressa agora (0 com a luz da mesa, 1 na mão).
static func printed_amount(node: CardNode) -> float:
	var material: ShaderMaterial = CardDressing.material_of(node)
	var value: Variant = material.get_shader_parameter("printed") if material else null
	return float(value) if value != null else 0.0


## Custo e se é jogável, para o selo do custo da carta da mão.
func hand_info(node: CardNode, card: Dictionary) -> void:
	if node == null:
		return
	# Com redução ou aumento (castCost), o custo de agora e quanto mudou: o selo fica verde mais barato, vermelho mais caro.
	var cast: Variant = card.get("castCost")
	var cost: String = Txt.of((cast as Dictionary).get("cost")) if cast is Dictionary else Txt.of(card.get("manaCost"))
	var delta: int = int((cast as Dictionary).get("delta", 0)) if cast is Dictionary else 0
	node.set_hand_info(cost, playable.has(node.card_id), delta)
