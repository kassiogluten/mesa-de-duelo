# Cartas voando entre os montes: cascata e descobrir (o grimório abre em leque e a achada vai para a pilha), moer para o
# cemitério, vidência (versos em leque, os do fundo por baixo do monte) e a busca no grimório até a mão.
# As cartas são temporárias (CardNode só como desenho, sem clique), filhas de um nó que se apaga sozinho no fim.
class_name CardFlights
extends RefCounted

const GOLD := Color(1.0, 0.78, 0.32)
const EXILE_COLOR := Color(0.72, 0.88, 1.0)
const MILL_COLOR := Color(0.66, 0.55, 0.85)
const SURVEIL_COLOR := Color(0.45, 0.78, 1.0)
const DUST_COLOR := Color(0.78, 0.72, 0.64)
## Verso usado quando quem chama não diz a cor do jogador (a 1 de TableView.SLEEVES).
const DEFAULT_SLEEVE := Color("#2a62d0")
## Onde fica a pilha (o mesmo lugar de TableView._place_stack): a carta achada pela cascata termina ali.
const STACK_SPOT := Vector3(4.6, 0.9, -0.2)
const STACK_TILT := 28.0
## O topo do grimório: as cartas nascem um pouco acima do monte.
const LIBRARY_TOP := Vector3(0, 0.22, 0)
## Depois da duração devolvida, o nó ainda fica este tanto para os rastros de faíscas terminarem (sem cartas).
const TAIL := 0.5

## Cascata (cascadeTiming da mesa do navegador): no máximo 7 no leque, e a achada é sempre a última.
const CASCADE_SHOWN := 7
const CASCADE_TRAVEL := 0.38
## Das que ficam fora do leque (as primeiras de uma cascata longa), quantas voam juntas direto para o exílio.
const CASCADE_EXTRA := 4
## Sem achada: quanto o leque fica parado antes de as cartas irem para o exílio.
const CASCADE_SETTLE := 0.55
const CASCADE_DROP := 0.4
const DROP_STAGGER := 0.035
## A carta que chega ao exílio afunda nele.
const SINK := 0.18
## O momento da achada: acende no leque, sobe para a frente da câmera, para grande e voa até a pilha.
const HIT_WAIT := 0.25
const HIT_RISE := 0.32
const HIT_PAUSE := 0.45
const HIT_FLY := 0.38
## O leque e a vitrine da achada, pela distância da câmera (unidades da mesa) e o tamanho da carta.
const FAN_DEPTH := 7.0
const FAN_RAISE := 0.35
const FAN_SIZE := 1.35
const SHOW_DEPTH := 4.6
const SHOW_RAISE := 0.15
const SHOW_SIZE := 1.6

## Moer (millTiming da mesa do navegador): no máximo 8 voos; o resto chega junto com o último.
const MILL_FLIGHTS := 8
const MILL_TRAVEL := 0.52
const MILL_SETTLE := 0.16

## Vidência: no máximo 5 versos no leque.
const SCRY_SHOWN := 5
const SCRY_RISE := 0.33
const SCRY_HOLD := 0.25
const SCRY_RETURN := 0.36
const SCRY_STAGGER := 0.045

## Busca no grimório: a carta sobe acesa e voa até a mão.
const TUTOR_RISE := 0.18
const TUTOR_TRAVEL := 0.46
const TUTOR_TIME := TUTOR_RISE + TUTOR_TRAVEL

const CARD_SIZE := Vector2(0.63, 0.88)


## Uma pose da carta no voo: posição, giro, tamanho e o quanto está virada (1 de costas, 0 de face para cima).
class Pose:
	var pos: Vector3
	var rot: Quaternion
	var size: float
	var flip: float

	func _init(at: Vector3, basis: Basis, scale: float, turned: float) -> void:
		pos = at
		rot = basis.get_rotation_quaternion()
		size = scale
		flip = turned


# — Durações —

## Quanto dura a cascata com `count` cartas reveladas até a achada (com ou sem achada).
static func cascade_duration(count: int, has_hit: bool) -> float:
	var shown: int = clampi(count, 1, CASCADE_SHOWN)
	var arrive: float = CASCADE_TRAVEL + (shown - 1) * _cascade_gap(shown)
	var drop_end: float = CASCADE_DROP + SINK + maxi(0, shown - 1) * DROP_STAGGER
	if not has_hit:
		return arrive + CASCADE_SETTLE + drop_end
	return arrive + maxf(HIT_WAIT + HIT_RISE + HIT_PAUSE + HIT_FLY, HIT_WAIT + HIT_RISE * 0.6 + drop_end)


## Quanto dura moer `count` cartas.
static func mill_duration(count: int) -> float:
	var flights: int = clampi(count, 1, MILL_FLIGHTS)
	return MILL_TRAVEL + (flights - 1) * _mill_gap(count) + MILL_SETTLE


## Quanto dura a vidência (0 se nenhuma carta foi olhada).
static func scry_duration(top: int, bottom: int) -> float:
	var shown: int = mini(SCRY_SHOWN, maxi(0, top) + maxi(0, bottom))
	if shown == 0:
		return 0.0
	return SCRY_RISE + SCRY_HOLD + SCRY_RETURN + (shown - 1) * SCRY_STAGGER


## O rótulo da vidência junto ao grimório (scryLabel da mesa do navegador).
static func scry_label(top: int, bottom: int) -> String:
	if top > 0 and bottom > 0:
		return "%d no topo · %d no fundo" % [top, bottom]
	return "%d no topo" % top if top > 0 else "%d no fundo" % bottom


static func _cascade_gap(shown: int) -> float:
	return 0.11 if shown >= 6 else 0.15


static func _mill_gap(count: int) -> float:
	return 0.07 if count >= 10 else (0.11 if count >= 5 else 0.16)


# — Efeitos —

## Cascata e descobrir: as cartas saem do grimório (`from`) uma a uma, viram de face no ar e abrem em leque; a achada
## (`hit`, o id da carta, como no evento; -1 sem achada) acende dourada, sobe, para grande na frente da câmera e voa para
## a pilha com faíscas; as outras seguem para o exílio (`to`). Devolve a duração.
static func cascade(parent: Node3D, catalog: CardCatalog, from: Vector3, to: Vector3, cards: Array, hit: int, discover: bool = false, sleeve: Color = DEFAULT_SLEEVE) -> float:
	var list: Array[Dictionary] = _cards_of(cards)
	if list.is_empty():
		return 0.0
	var hit_index: int = -1
	for i: int in list.size():
		if hit >= 0 and int(list[i].get("id", -1)) == hit:
			hit_index = i
	var has_hit: bool = hit_index >= 0
	var end: int = hit_index + 1 if has_hit else list.size()
	var first: int = maxi(0, end - CASCADE_SHOWN)
	var shown: Array[Dictionary] = []
	for i: int in range(first, end):
		shown.append(list[i])
	_request(catalog, list)
	var total: float = cascade_duration(shown.size(), has_hit)
	var holder: Node3D = _holder(parent, total)
	var view: Transform3D = _view(parent)
	var gap: float = _cascade_gap(shown.size())
	var arrive: float = CASCADE_TRAVEL + (shown.size() - 1) * gap
	var start := Pose.new(from + LIBRARY_TOP, Basis.IDENTITY, 1.0, 1.0)
	var center: Vector3 = _in_view(view, FAN_DEPTH, FAN_RAISE)
	var title: String = "Descobrir" if discover else "Cascata"
	if list.size() > 1:
		title += " · %d cartas" % list.size()
	var title_for: float = arrive + HIT_WAIT + HIT_RISE * 0.5 if has_hit else arrive + CASCADE_SETTLE
	_title(holder, center + view.basis.y * (CARD_SIZE.y * FAN_SIZE * 0.5 + 0.32), title, title_for)

	# As primeiras de uma cascata longa não entram no leque: voam juntas, já de face, direto para o exílio.
	for j: int in mini(first, CASCADE_EXTRA):
		var extra: CardNode = _new_card(holder, catalog, list[j], sleeve, start)
		var tween: Tween = extra.create_tween()
		tween.tween_interval(j * 0.04)
		tween.tween_callback(extra.show)
		var settle := Pose.new(to + Vector3(0, 0.02 + j * 0.004, 0), Basis(Vector3.UP, randf_range(-0.1, 0.1)), 1.0, 0.0)
		_move(tween, extra, start, settle, 0.42, 0.9, 0.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		if j == 0:
			tween.tween_callback(func() -> void: Fx.ring(parent, to, EXILE_COLOR, 0.8, 0.4, 0.2))
		_sink(tween, extra)

	var step: float = minf(CARD_SIZE.x * FAN_SIZE * 0.78, 5.0 / shown.size())
	for i: int in shown.size():
		var k: float = i - (shown.size() - 1) / 2.0
		var pos: Vector3 = center + view.basis.x * k * step - view.basis.y * k * k * 0.035 + view.basis.z * i * 0.03
		var fan := Pose.new(pos, _facing(view, pos) * Basis(Vector3.UP, -deg_to_rad(k * 4.0)), FAN_SIZE, 0.0)
		var node: CardNode = _new_card(holder, catalog, shown[i], sleeve, start)
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * gap)
		tween.tween_callback(node.show)
		_move(tween, node, start, fan, CASCADE_TRAVEL, 0.5, 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		var waiting: float = maxf(0.0, arrive - (i * gap + CASCADE_TRAVEL))
		if has_hit and i == shown.size() - 1:
			_hit_moment(parent, holder, tween, node, fan, view)
			continue
		tween.tween_interval(waiting)
		tween.tween_method(node.set_dim, 0.0, 0.4, 0.2)
		var leave: float = HIT_WAIT + HIT_RISE * 0.6 if has_hit else CASCADE_SETTLE
		tween.tween_interval(maxf(0.0, leave - 0.2) + i * DROP_STAGGER)
		var settle := Pose.new(to + Vector3(0, 0.03 + i * 0.005, 0), Basis(Vector3.UP, randf_range(-0.12, 0.12)), 1.0, 0.0)
		_move(tween, node, fan, settle, CASCADE_DROP, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		tween.tween_callback(func() -> void: Fx.burst(parent, to + Vector3(0, 0.05, 0), EXILE_COLOR, 10, 0.8, 0.4, 0.05))
		_sink(tween, node)
	return total


## A achada: acende dourada no leque, sobe grande para a frente da câmera, para um instante e voa até a pilha.
static func _hit_moment(parent: Node3D, holder: Node3D, tween: Tween, node: CardNode, fan: Pose, view: Transform3D) -> void:
	tween.tween_callback(func() -> void:
		node.set_glow(GOLD, 1.0)
		Fx.burst(parent, fan.pos, GOLD, 40, 1.6, 0.6, 0.08)
		Fx.light(parent, fan.pos + Vector3(0, 0.4, 0), GOLD, 1.6, 3.0, 0.5))
	tween.tween_interval(HIT_WAIT)
	var show_pos: Vector3 = _in_view(view, SHOW_DEPTH, SHOW_RAISE)
	var showcase := Pose.new(show_pos, _facing(view, show_pos), SHOW_SIZE, 0.0)
	_move(tween, node, fan, showcase, HIT_RISE).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void: Fx.burst(parent, show_pos, GOLD, 26, 1.1, 0.5, 0.05))
	tween.tween_interval(HIT_PAUSE)
	var trail: GPUParticles3D = _trail(holder, GOLD)
	tween.tween_callback(func() -> void: trail.emitting = true)
	var pile := Pose.new(STACK_SPOT, Basis(Vector3.RIGHT, deg_to_rad(STACK_TILT)), 1.0, 0.0)
	_move(tween, node, showcase, pile, HIT_FLY, 0.5, 0.0, trail).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		trail.emitting = false
		Fx.burst(parent, STACK_SPOT, GOLD, 70, 2.4, 0.7, 0.1)
		Fx.ring(parent, Vector3(STACK_SPOT.x, 0.0, STACK_SPOT.z), GOLD, 1.6, 0.5)
		Fx.light(parent, STACK_SPOT, GOLD, 5.0, 5.0, 0.6)
		node.queue_free())


## Moer (ou vidência para o cemitério, com `surveil`): as cartas saem do topo do grimório (`from`) uma depois da outra,
## viram no ar e caem no cemitério (`to`) levantando poeira. Sem `cards` (ou com cartas sem nome), voam versos.
static func mill(parent: Node3D, catalog: CardCatalog, from: Vector3, to: Vector3, cards: Array, surveil: bool = false, sleeve: Color = DEFAULT_SLEEVE) -> float:
	var list: Array[Dictionary] = _cards_of(cards)
	var count: int = maxi(1, cards.size())
	while list.size() < mini(count, MILL_FLIGHTS):
		list.append({})
	_request(catalog, list)
	var total: float = mill_duration(count)
	var holder: Node3D = _holder(parent, total)
	var view: Transform3D = _view(parent)
	var color: Color = SURVEIL_COLOR if surveil else MILL_COLOR
	var flights: int = mini(count, MILL_FLIGHTS)
	var gap: float = _mill_gap(count)
	var start := Pose.new(from + LIBRARY_TOP, Basis.IDENTITY, 1.0, 1.0)
	# O grimório e o cemitério ficam lado a lado no canto: o arco abre para dentro da mesa, onde dá para ver a carta.
	var inward: Vector3 = _inward(from)
	var edge: float = signf(from.z) if from.z != 0.0 else 1.0
	Fx.float_text(parent, from + Vector3(0, 0.1, edge * 0.5), "−%d" % count, color.lightened(0.25), 56, 1.2)
	for i: int in flights:
		var card: Dictionary = list[i]
		var known: bool = card.has("name")
		var spread: float = (i - (flights - 1) / 2.0) * 0.16 if flights >= 6 else 0.0
		var top: Vector3 = from.lerp(to, 0.5) + inward * 1.2 + Vector3(spread, 1.1, 0)
		# No alto do arco a carta vira para a câmera, para dar para ler; de face se a carta é conhecida.
		var apex := Pose.new(top, Basis.IDENTITY.slerp(_facing(view, top), 0.65), 1.3, 0.0 if known else 1.0)
		var settle := Pose.new(to + Vector3(spread * 0.15, 0.03 + i * 0.004, 0), Basis(Vector3.UP, randf_range(-0.1, 0.1)), 1.0, 0.0 if known else 1.0)
		var node: CardNode = _new_card(holder, catalog, card, sleeve, start)
		var trail: GPUParticles3D = _trail(holder, color)
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * gap)
		tween.tween_callback(func() -> void:
			node.show()
			trail.emitting = true)
		_move(tween, node, start, apex, MILL_TRAVEL * 0.55, 0.0, 0.0, trail).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		_move(tween, node, apex, settle, MILL_TRAVEL * 0.45, 0.0, 0.0, trail).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tween.tween_callback(func() -> void:
			trail.emitting = false
			Fx.burst(parent, to + Vector3(0, 0.06, 0), DUST_COLOR, 14, 0.9, 0.55, 0.06)
			Fx.ring(parent, to, color, 0.55, 0.35, 0.16))
		# Fica no cemitério até o fim e some (a mesa já mostra a de verdade no lugar).
		tween.tween_interval(maxf(0.0, total - (i * gap + MILL_TRAVEL)))
		tween.tween_callback(node.queue_free)
	return total


## Vidência: os versos sobem do grimório (`from`) e abrem em leque (os do topo acesos em dourado); os do topo voltam por
## cima e os do fundo descem para baixo do monte. Devolve a duração.
static func scry(parent: Node3D, from: Vector3, top: int, bottom: int, sleeve: Color = DEFAULT_SLEEVE) -> float:
	var shown: int = mini(SCRY_SHOWN, maxi(0, top) + maxi(0, bottom))
	var total: float = scry_duration(top, bottom)
	# O leque abre para dentro da mesa (o grimório fica num canto), e o rótulo fica sobre ele.
	var side := Vector3(-signf(from.x) if from.x != 0.0 else 0.0, 0, -signf(from.z) if from.z != 0.0 else -1.0)
	var center: Vector3 = from + Vector3(side.x * 1.7, 1.5, side.z * 0.7)
	if top + bottom > 0:
		Fx.float_text(parent, center + Vector3(0, 0.3, 0), scry_label(maxi(0, top), maxi(0, bottom)), GOLD, 46, 1.5)
	if shown == 0:
		return total
	var holder: Node3D = _holder(parent, total)
	var view: Transform3D = _view(parent)
	var start := Pose.new(from + LIBRARY_TOP, Basis.IDENTITY, 1.0, 1.0)
	var top_shown: int = mini(maxi(0, top), shown)
	for i: int in shown:
		var k: float = i - (shown - 1) / 2.0
		var pos: Vector3 = center + view.basis.x * k * 0.5 - view.basis.y * k * k * 0.03 + view.basis.z * i * 0.03
		var fan := Pose.new(pos, _facing(view, pos) * Basis(Vector3.UP, -deg_to_rad(k * 4.0)), 1.15, 1.0)
		var to_bottom: bool = i >= top_shown
		var node: CardNode = _new_card(holder, null, {}, sleeve, start)
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * SCRY_STAGGER)
		tween.tween_callback(node.show)
		_move(tween, node, start, fan, SCRY_RISE, 0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		if not to_bottom:
			tween.tween_callback(func() -> void: node.set_glow(GOLD, 0.55))
		tween.tween_interval(SCRY_HOLD)
		if to_bottom:
			# Passa ao lado do monte e desliza por baixo dele.
			var beside := Pose.new(from + Vector3(0, 0.02, -side.z * 0.55), Basis.IDENTITY, 1.0, 1.0)
			var under := Pose.new(from + Vector3(0, -0.004, 0), Basis.IDENTITY, 1.0, 1.0)
			_move(tween, node, fan, beside, SCRY_RETURN * 0.6, 0.15).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
			_move(tween, node, beside, under, SCRY_RETURN * 0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		else:
			_move(tween, node, fan, Pose.new(from + LIBRARY_TOP + Vector3(0, 0.02, 0), Basis.IDENTITY, 1.0, 1.0), SCRY_RETURN, 0.15).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		tween.tween_callback(node.queue_free)
	return total


## Busca no grimório (tutor): uma carta de costas sai do grimório (`from`) com brilho dourado e voa até a mão (`to`).
static func tutor(parent: Node3D, from: Vector3, to: Vector3, sleeve: Color = DEFAULT_SLEEVE) -> float:
	var holder: Node3D = _holder(parent, TUTOR_TIME)
	var view: Transform3D = _view(parent)
	Fx.ring(parent, from, GOLD, 0.8, 0.5, 0.18)
	Fx.burst(parent, from + Vector3(0, 0.3, 0), GOLD, 18, 1.0, 0.5, 0.06)
	Fx.light(parent, from, GOLD, 3.0, 3.5, 0.5)
	var start := Pose.new(from + LIBRARY_TOP, Basis.IDENTITY, 1.0, 1.0)
	var lift_pos: Vector3 = from + Vector3(0, 0.9, 0)
	var lifted := Pose.new(lift_pos, Basis.IDENTITY.slerp(_facing(view, lift_pos), 0.5), 1.15, 1.0)
	var hand := Pose.new(to, _facing(view, to), 1.0, 1.0)
	var node: CardNode = _new_card(holder, null, {}, sleeve, start)
	node.set_glow(GOLD, 0.6)
	var trail: GPUParticles3D = _trail(holder, GOLD)
	var tween: Tween = node.create_tween()
	tween.tween_callback(func() -> void:
		node.show()
		trail.emitting = true)
	_move(tween, node, start, lifted, TUTOR_RISE, 0.0, 0.0, trail).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_move(tween, node, lifted, hand, TUTOR_TRAVEL, 0.5, 0.0, trail).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(func() -> void:
		trail.emitting = false
		Fx.burst(parent, to, GOLD, 20, 0.9, 0.45, 0.05)
		node.queue_free())
	return TUTOR_TIME


# — Peças —

## O nó que guarda as cartas de um efeito; ele (e o que sobrar nele) se apaga `TAIL` depois do fim.
static func _holder(parent: Node3D, total: float) -> Node3D:
	var holder := Node3D.new()
	holder.name = "CardFlights"
	parent.add_child(holder)
	var tween: Tween = holder.create_tween()
	tween.tween_interval(total + TAIL)
	tween.tween_callback(holder.queue_free)
	return holder


## Uma carta temporária, escondida e parada em `at` até o voo dela começar; sem área de clique.
static func _new_card(holder: Node3D, catalog: CardCatalog, card: Dictionary, sleeve: Color, at: Pose) -> CardNode:
	var node := CardNode.new()
	for child: Node in node.get_children():
		if child is Area3D:
			(child as Area3D).input_ray_pickable = false
	node.visible = false
	holder.add_child(node)
	node.transform = _blend(at, at, 0.0, 0.0, 0.0)
	var name: String = Txt.of(card.get("name", ""))
	node.set_data(card, sleeve, catalog.label(name) if catalog and name != "" else name, false)
	if catalog and name != "":
		_bind_texture(node, catalog, card)
	return node


## Põe a imagem da carta e a troca quando os dados ou a imagem chegarem; solta os sinais quando a carta sai.
static func _bind_texture(node: CardNode, catalog: CardCatalog, card: Dictionary) -> void:
	node.image_url = catalog.image_url_for(card)
	node.set_texture(catalog.texture(node.image_url))
	var on_texture: Callable = func(url: String, tex: Texture2D) -> void:
		if is_instance_valid(node) and url != "" and url == node.image_url:
			node.set_texture(tex)
	var on_info: Callable = func(_names: PackedStringArray) -> void:
		if not is_instance_valid(node):
			return
		var url: String = catalog.image_url_for(card)
		if url != node.image_url:
			node.image_url = url
			node.set_texture(catalog.texture(url))
	catalog.texture_ready.connect(on_texture)
	catalog.info_ready.connect(on_info)
	node.tree_exiting.connect(func() -> void:
		if is_instance_valid(catalog):
			if catalog.texture_ready.is_connected(on_texture):
				catalog.texture_ready.disconnect(on_texture)
			if catalog.info_ready.is_connected(on_info):
				catalog.info_ready.disconnect(on_info))


## Leva a carta de `a` até `b` em `duration` (com arco `lift` e crescendo `bulge` no meio); o rastro, se houver, vai junto.
static func _move(tween: Tween, node: Node3D, a: Pose, b: Pose, duration: float, lift: float = 0.0, bulge: float = 0.0, trail: GPUParticles3D = null) -> MethodTweener:
	return tween.tween_method(func(t: float) -> void:
		node.transform = _blend(a, b, t, lift, bulge)
		if trail:
			trail.position = node.position, 0.0, 1.0, duration)


static func _blend(a: Pose, b: Pose, t: float, lift: float, bulge: float) -> Transform3D:
	var arc: float = sin(clampf(t, 0.0, 1.0) * PI)
	var pos: Vector3 = a.pos.lerp(b.pos, t) + Vector3.UP * arc * lift
	var rot: Quaternion = a.rot.slerp(b.rot, t)
	var flip: float = lerpf(a.flip, b.flip, smoothstep(0.1, 0.8, t))
	var size: float = lerpf(a.size, b.size, t) + arc * bulge
	return Transform3D((Basis(rot) * Basis(Vector3.BACK, PI * flip)).scaled(Vector3.ONE * size), pos)


## A carta que chegou ao exílio afunda nele e se apaga.
static func _sink(tween: Tween, node: CardNode) -> void:
	tween.tween_property(node, "scale", Vector3.ONE * 0.02, SINK).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(node.queue_free)


## Rastro de faíscas que segue a carta (parado até `emitting` ligar).
static func _trail(holder: Node3D, color: Color) -> GPUParticles3D:
	var trail := GPUParticles3D.new()
	trail.amount = 48 if Fx.quality > 0 else 18
	trail.lifetime = 0.45
	trail.local_coords = false
	trail.emitting = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = 0.2
	process.spread = 180.0
	process.initial_velocity_min = 0.05
	process.initial_velocity_max = 0.35
	process.gravity = Vector3(0, -0.6, 0)
	process.scale_min = 0.04
	process.scale_max = 0.1
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lightened(0.4), 0.95))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	trail.process_material = process
	trail.draw_pass_1 = Fx._spark()
	holder.add_child(trail)
	return trail


## Título que aparece sobre o leque e some (Cascata · 5 cartas).
static func _title(holder: Node3D, pos: Vector3, text: String, show_for: float) -> void:
	var label := Label3D.new()
	label.text = text
	label.font_size = 64
	label.pixel_size = 0.0045
	label.outline_size = 16
	label.modulate = Color(GOLD.lightened(0.2), 0.0)
	label.outline_modulate = Color(0, 0, 0, 0.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.render_priority = 20
	label.position = pos
	holder.add_child(label)
	var tween: Tween = label.create_tween()
	tween.tween_property(label, "modulate:a", 1.0, 0.18)
	tween.parallel().tween_property(label, "outline_modulate:a", 0.85, 0.18)
	tween.tween_interval(maxf(0.1, show_for - 0.4))
	tween.tween_property(label, "modulate:a", 0.0, 0.22)
	tween.parallel().tween_property(label, "outline_modulate:a", 0.0, 0.22)
	tween.tween_callback(label.queue_free)


## A câmera da cena (ou a posição padrão da mesa, sem câmera).
static func _view(parent: Node3D) -> Transform3D:
	var camera: Camera3D = parent.get_viewport().get_camera_3d() if parent.is_inside_tree() else null
	if camera:
		return camera.global_transform
	return Transform3D(Basis.looking_at(TableView.CAMERA_LOOK - TableView.CAMERA_POS), TableView.CAMERA_POS)


## Um ponto a `depth` da câmera no meio da tela, `raise` acima.
static func _in_view(view: Transform3D, depth: float, raise: float) -> Vector3:
	return view.origin - view.basis.z * depth + view.basis.y * raise


## A carta em pé de frente para a câmera em `pos`: a face (+Y) olha para ela e o alto (-Z) aponta para cima na tela.
static func _facing(view: Transform3D, pos: Vector3) -> Basis:
	var y: Vector3 = (view.origin - pos).normalized()
	var up: Vector3 = view.basis.y
	var z: Vector3 = -(up - y * up.dot(y)).normalized()
	return Basis(y.cross(z), y, z)


## Do monte para o meio da mesa, no tampo (o grimório e o cemitério ficam nos cantos).
static func _inward(from: Vector3) -> Vector3:
	var flat := Vector3(-from.x, 0, -from.z)
	return flat.normalized() if flat.length() > 0.01 else Vector3.ZERO


static func _cards_of(cards: Array) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for raw: Variant in cards:
		out.append(raw as Dictionary if raw is Dictionary else {})
	return out


static func _request(catalog: CardCatalog, cards: Array[Dictionary]) -> void:
	if catalog == null:
		return
	var names: PackedStringArray = []
	for card: Dictionary in cards:
		var name: String = Txt.of(card.get("name", ""))
		if name != "":
			names.append(name)
	catalog.request(names)
