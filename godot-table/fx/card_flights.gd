# Cartas voando entre os montes: cascata e descobrir (o grimório abre em leque, cada carta revelada com uma luz que
# atravessa a face, e a achada vai para a pilha), moer para o cemitério, vidência (versos em leque com um halo macio, os
# do fundo por baixo do monte) e a busca no grimório (o monte acende remexido, a carta sobe numa coluna de luz e voa até
# a mão). As cartas são temporárias (CardNode só como desenho, sem clique), com o borrão do movimento atrás; saem do alto
# do grimório de verdade e pousam no lugar exato do monte, onde passam a vez para a carta da mesa (escondida até lá).
class_name CardFlights
extends RefCounted

const Pose := FlightPieces.Pose
const GOLD := Color(1.0, 0.78, 0.32)
const EXILE_COLOR := Color(0.72, 0.88, 1.0)
const MILL_COLOR := Color(0.66, 0.55, 0.85)
const SURVEIL_COLOR := Color(0.45, 0.78, 1.0)
const DUST_COLOR := Color(0.78, 0.72, 0.64)
## O rastro das cartas reveladas (antes de terem cor) e o halo das que vão para o fundo na vidência.
const REVEAL_COLOR := Color(0.82, 0.88, 1.0)
const BOTTOM_COLOR := Color(0.5, 0.66, 1.0)
## Verso usado quando quem chama não diz a cor do jogador (a 1 de TableView.SLEEVES).
const DEFAULT_SLEEVE := Color("#2a62d0")
## Onde fica a pilha (o mesmo lugar de TableView._place_stack): a carta achada pela cascata termina ali.
const STACK_SPOT := Vector3(4.6, 0.9, -0.2)
const STACK_TILT := 28.0
## Sem os montes de verdade (piles), as cartas nascem um pouco acima do grimório.
const LIBRARY_TOP := Vector3(0, 0.22, 0)
## Depois da duração devolvida, o nó ainda fica este tanto para os rastros terminarem (sem cartas).
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
## A carta que chega ao exílio sem carta de verdade no lugar afunda nele.
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

## Busca no grimório: o monte remexe aceso, a carta sobe na coluna de luz, para um instante e voa até a mão.
const TUTOR_RUMMAGE := 0.24
const TUTOR_RISE := 0.26
const TUTOR_HOLD := 0.08
const TUTOR_TRAVEL := 0.42
const TUTOR_TIME := TUTOR_RUMMAGE + TUTOR_RISE + TUTOR_HOLD + TUTOR_TRAVEL

const CARD_SIZE := FlightPieces.CARD_SIZE


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


# — Os montes de verdade —

## Onde ficam os montes de verdade de `player`, para o voo sair do alto do grimório e pousar no lugar exato: o alto do
## grimório e o nó dele, a escala do jogador e, em `zone` ("graveyard", "exile"), a base e quantas cartas há, e das
## cartas de `cards` que a mesa já pôs lá, o nó de cada uma (escondido até a temporária pousar). Sem mesa, {}.
static func piles(table: TableView, player: int, zone: String = "", cards: Array = []) -> Dictionary:
	if table == null or not is_instance_valid(table):
		return {}
	var frame: Dictionary = table.frame_of(player)
	if frame.is_empty():
		return {}
	var seat: Dictionary = {}
	for raw: Variant in table.current_state().get("players", []):
		if raw is Dictionary and int((raw as Dictionary).get("id", -1)) == player:
			seat = raw
	var scale: float = float(frame.get("scale", 1.0))
	var into: Transform3D = table.global_transform
	var out: Dictionary = {"scale": scale, "library": table.card_node("library:%d" % player),
		"library_top": into * PaperPhysics.pile_top(frame["library"], scale, int(seat.get("library", 0)))}
	if zone != "" and frame.has(zone):
		out["base"] = into * (frame[zone] as Vector3)
		out["count"] = (seat.get(zone, []) as Array).size() if seat.get(zone) is Array else 0
		var real: Dictionary = {}
		for raw: Variant in cards:
			var id: int = int((raw as Dictionary).get("id", -1)) if raw is Dictionary else -1
			var node: CardNode = table.card_node(id) if id >= 0 else null
			if node and table.zone_of(id) == zone:
				real[id] = {"node": node, "pose": into * node.target_transform()}
		out["real"] = real
	return out


## De onde as cartas saem: o alto do grimório de verdade, ou um pouco acima de `from` sem ele.
static func _top(from: Vector3, piles_info: Dictionary) -> Vector3:
	return (piles_info["library_top"] as Vector3) + Vector3(0, 0.012, 0) if piles_info.has("library_top") else from + LIBRARY_TOP


## Onde a carta `index` de `total` pousa no monte de destino: o lugar da carta de verdade (com o nó dela), senão o alto
## do monte (com a bagunça fixa do id), senão perto de `to`. Devolve [Pose, CardNode ou null].
static func _landing(card: Dictionary, index: int, total: int, to: Vector3, piles_info: Dictionary, face_up: bool) -> Array:
	var id: int = int(card.get("id", -1))
	var scale: float = float(piles_info.get("scale", 1.0))
	var real: Dictionary = piles_info.get("real", {})
	if real.has(id):
		var entry: Dictionary = real[id]
		return [Pose.resting(entry["pose"], 0.0 if face_up else 1.0), entry["node"]]
	if piles_info.has("base"):
		var count: int = int(piles_info.get("count", 0))
		var t: Transform3D = PaperPhysics.pile_pose(piles_info["base"], scale, id if id >= 0 else index, count + index, count + total)
		return [Pose.resting(t, 0.0 if face_up else 1.0), null]
	var loose := Pose.new(to + Vector3(0, 0.03 + index * 0.004, 0), Basis(Vector3.UP, randf_range(-0.1, 0.1)), scale, 0.0 if face_up else 1.0)
	return [loose, null]


# — Efeitos —

## Cascata e descobrir: as cartas saem do grimório (`from`) uma a uma, viram de face no ar (com o borrão do movimento) e
## abrem em leque, cada uma com a luz atravessando a face; a achada (`hit`, o id da carta; -1 sem achada) acende dourada,
## sobe, para grande na frente da câmera e voa para a pilha (`stack_spot`; sem ele, o lugar antigo no tampo); as outras
## pousam no exílio (`to`). `piles_info` (CardFlights.piles) dá os montes de verdade. Devolve a duração.
static func cascade(parent: Node3D, catalog: CardCatalog, from: Vector3, to: Vector3, cards: Array, hit: int, discover: bool = false, sleeve: Color = DEFAULT_SLEEVE, stack_spot: Variant = null, piles_info: Dictionary = {}) -> float:
	var list: Array[Dictionary] = FlightPieces.cards_of(cards)
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
	FlightPieces.request(catalog, list)
	var total: float = cascade_duration(shown.size(), has_hit)
	var holder: Node3D = FlightPieces.holder(parent, total, TAIL)
	var view: Transform3D = FlightPieces.view(parent)
	var gap: float = _cascade_gap(shown.size())
	var arrive: float = CASCADE_TRAVEL + (shown.size() - 1) * gap
	var scale: float = float(piles_info.get("scale", 1.0))
	var top: Vector3 = _top(from, piles_info)
	var start := Pose.new(top, Basis.IDENTITY, scale, 1.0)
	var center: Vector3 = FlightPieces.in_view(view, FAN_DEPTH, FAN_RAISE)
	var title: String = "Descobrir" if discover else "Cascata"
	if list.size() > 1:
		title += " · %d cartas" % list.size()
	var title_for: float = arrive + HIT_WAIT + HIT_RISE * 0.5 if has_hit else arrive + CASCADE_SETTLE
	FlightPieces.title(holder, center + view.basis.y * (CARD_SIZE.y * FAN_SIZE * 0.5 + 0.32), title, title_for)
	# O grimório solta fiapos de luz enquanto as cartas saem.
	for k: int in mini(shown.size(), 3):
		MomentPieces.after(holder, k * gap * 2.0, func() -> void: FlightPieces.flutter(holder, top, sleeve.lerp(Color.WHITE, 0.5), 5))

	# As primeiras de uma cascata longa não entram no leque: voam juntas, já de face, direto para o exílio.
	for j: int in mini(first, CASCADE_EXTRA):
		var extra: CardNode = FlightPieces.new_card(holder, catalog, list[j], sleeve, start)
		var landing: Array = _landing(list[j], j, mini(first, CASCADE_EXTRA), to, piles_info, true)
		var keeper: FlightPieces.Concealer = FlightPieces.conceal(holder, landing[1])
		var tween: Tween = extra.create_tween()
		tween.tween_interval(j * 0.04)
		tween.tween_callback(extra.show)
		FlightPieces.smear(holder, extra, EXILE_COLOR, 0.3)
		FlightPieces.move(tween, extra, start, landing[0], 0.42, 0.9, 0.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_touch_down(parent, tween, extra, (landing[0] as Pose).pos, EXILE_COLOR, keeper, j == 0)

	var step: float = minf(CARD_SIZE.x * FAN_SIZE * 0.78, 5.0 / shown.size())
	var dropping: int = shown.size() - (1 if has_hit else 0)
	for i: int in shown.size():
		var k: float = i - (shown.size() - 1) / 2.0
		var pos: Vector3 = center + view.basis.x * k * step - view.basis.y * k * k * 0.035 + view.basis.z * i * 0.03
		var fan := Pose.new(pos, FlightPieces.facing(view, pos) * Basis(Vector3.UP, -deg_to_rad(k * 4.0)), FAN_SIZE, 0.0)
		var node: CardNode = FlightPieces.new_card(holder, catalog, shown[i], sleeve, start)
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * gap)
		tween.tween_callback(node.show)
		var trail: TrailRibbon = FlightPieces.smear(holder, node, REVEAL_COLOR, 0.42)
		FlightPieces.move(tween, node, start, fan, CASCADE_TRAVEL, 0.5, 0.12).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		# Virou de face no leque: a luz atravessa a carta (na achada, dourada e mais forte, logo depois).
		var hit_card: bool = has_hit and i == shown.size() - 1
		tween.tween_callback(func() -> void:
			if trail:
				trail.emitting = false
			if not hit_card:
				FlightPieces.sheen(node, Fx.card_color(node.data).lerp(Color.WHITE, 0.4), 0.42, 0.8))
		var waiting: float = maxf(0.0, arrive - (i * gap + CASCADE_TRAVEL))
		if hit_card:
			_hit_moment(parent, holder, tween, node, fan, view, stack_spot)
			continue
		tween.tween_interval(waiting)
		tween.tween_method(node.set_dim, 0.0, 0.4, 0.2)
		var leave: float = HIT_WAIT + HIT_RISE * 0.6 if has_hit else CASCADE_SETTLE
		tween.tween_interval(maxf(0.0, leave - 0.2) + i * DROP_STAGGER)
		var landing: Array = _landing(shown[i], first + i, first + dropping, to, piles_info, true)
		var keeper: FlightPieces.Concealer = FlightPieces.conceal(holder, landing[1])
		tween.tween_callback(func() -> void: FlightPieces.smear(holder, node, EXILE_COLOR, 0.3))
		FlightPieces.move(tween, node, fan, landing[0], CASCADE_DROP, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		_touch_down(parent, tween, node, (landing[0] as Pose).pos, EXILE_COLOR, keeper, false)
	return total


## A carta revelada pousa no exílio: poeira fria rente ao tampo; com a carta de verdade no lugar, passa a vez para ela;
## sem, afunda no monte e some. `first` acende o lampejo frio (a primeira das que voam juntas).
static func _touch_down(parent: Node3D, tween: Tween, node: CardNode, at: Vector3, color: Color, keeper: FlightPieces.Concealer, first: bool) -> void:
	tween.tween_callback(func() -> void:
		TouchFx.dust(parent, at, color, 0.45)
		if first:
			Fx.light(parent, at, color, 1.6, 2.5, 0.3))
	if keeper:
		tween.tween_callback(func() -> void:
			keeper.reveal()
			node.queue_free())
		return
	tween.tween_property(node, "scale", Vector3.ONE * 0.02, SINK).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(node.queue_free)


## A achada: a luz dourada atravessa a carta no leque, ela sobe grande para a frente da câmera, para um instante e voa
## até a pilha com o borrão dourado e faíscas.
static func _hit_moment(parent: Node3D, holder: Node3D, tween: Tween, node: CardNode, fan: Pose, view: Transform3D, stack_spot: Variant = null) -> void:
	tween.tween_callback(func() -> void:
		node.set_glow(GOLD, 1.0)
		FlightPieces.sheen(node, GOLD, 0.4, 1.3)
		Fx.burst(parent, fan.pos, GOLD, 30, 1.4, 0.6, 0.07)
		Fx.light(parent, fan.pos + Vector3(0, 0.4, 0), GOLD, 1.6, 3.0, 0.5))
	tween.tween_interval(HIT_WAIT)
	var show_pos: Vector3 = FlightPieces.in_view(view, SHOW_DEPTH, SHOW_RAISE)
	var showcase := Pose.new(show_pos, FlightPieces.facing(view, show_pos), SHOW_SIZE, 0.0)
	FlightPieces.move(tween, node, fan, showcase, HIT_RISE).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void:
		Fx.burst(parent, show_pos, GOLD, 22, 1.0, 0.5, 0.05)
		FlightPieces.sheen(node, Color(1.0, 0.92, 0.7), 0.45, 0.9))
	tween.tween_interval(HIT_PAUSE)
	var sparks: GPUParticles3D = _sparks(holder, GOLD)
	tween.tween_callback(func() -> void:
		sparks.emitting = true
		FlightPieces.smear(holder, node, GOLD, 0.6, 0.2))
	# A pilha de agora é a carta de pé no painel da direita (`stack_spot`); sem ela, o monte antigo no tampo.
	var floating: bool = stack_spot is Vector3
	var spot: Vector3 = stack_spot if floating else STACK_SPOT
	var pile := Pose.new(spot, FlightPieces.facing(view, spot) if floating else Basis(Vector3.RIGHT, deg_to_rad(STACK_TILT)), 1.0, 0.0)
	FlightPieces.move(tween, node, showcase, pile, HIT_FLY, 0.5, 0.0, sparks).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		sparks.emitting = false
		ManaOrb.flash(parent, spot, GOLD, 1.6, 0.3)
		Fx.burst(parent, spot, GOLD, 50, 2.0, 0.6, 0.08)
		Fx.light(parent, spot, GOLD, 4.0, 5.0, 0.5)
		node.queue_free())


## Moer (ou vigilância para o cemitério, com `surveil`): as cartas saem do alto do grimório (`from`) uma depois da outra,
## viram no ar com o borrão do movimento e pousam no lugar exato delas no cemitério (`to`), levantando poeira rente ao
## tampo; ali a carta de verdade aparece no lugar da temporária. Sem `cards` (ou com cartas sem nome), voam versos.
static func mill(parent: Node3D, catalog: CardCatalog, from: Vector3, to: Vector3, cards: Array, surveil: bool = false, sleeve: Color = DEFAULT_SLEEVE, piles_info: Dictionary = {}) -> float:
	var list: Array[Dictionary] = FlightPieces.cards_of(cards)
	var count: int = maxi(1, cards.size())
	while list.size() < mini(count, MILL_FLIGHTS):
		list.append({})
	FlightPieces.request(catalog, list)
	var total: float = mill_duration(count)
	var holder: Node3D = FlightPieces.holder(parent, total, TAIL)
	var view: Transform3D = FlightPieces.view(parent)
	var color: Color = SURVEIL_COLOR if surveil else MILL_COLOR
	var flights: int = mini(count, MILL_FLIGHTS)
	var gap: float = _mill_gap(count)
	var scale: float = float(piles_info.get("scale", 1.0))
	var top: Vector3 = _top(from, piles_info)
	var start := Pose.new(top, Basis.IDENTITY, scale, 1.0)
	# O grimório e o cemitério ficam lado a lado no canto: o arco abre para dentro da mesa, onde dá para ver a carta.
	var inward: Vector3 = FlightPieces.inward(from)
	var edge: float = signf(from.z) if from.z != 0.0 else 1.0
	Fx.float_text(parent, from + Vector3(0, 0.1, edge * 0.5), "−%d" % count, color.lightened(0.25), 56, 1.2)
	for i: int in flights:
		var card: Dictionary = list[i]
		var known: bool = card.has("name")
		var spread: float = (i - (flights - 1) / 2.0) * 0.16 if flights >= 6 else 0.0
		var apex_pos: Vector3 = from.lerp(to, 0.5) + inward * 1.2 + Vector3(spread, 1.1, 0)
		# No alto do arco a carta vira para a câmera, para dar para ler; de face se a carta é conhecida.
		var apex := Pose.new(apex_pos, Basis.IDENTITY.slerp(FlightPieces.facing(view, apex_pos), 0.65), 1.3 * scale, 0.0 if known else 1.0)
		var landing: Array = _landing(card, i, flights, to, piles_info, known)
		var settle: Pose = landing[0]
		var keeper: FlightPieces.Concealer = FlightPieces.conceal(holder, landing[1])
		var node: CardNode = FlightPieces.new_card(holder, catalog, card, sleeve, start)
		var tint: Color = Fx.card_color(card).lerp(color, 0.5) if known else color
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * gap)
		tween.tween_callback(func() -> void:
			node.show()
			FlightPieces.smear(holder, node, tint, 0.42)
			FlightPieces.flutter(holder, top, sleeve.lerp(Color.WHITE, 0.55), 4, inward + Vector3.UP))
		FlightPieces.move(tween, node, start, apex, MILL_TRAVEL * 0.55).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		FlightPieces.move(tween, node, apex, settle, MILL_TRAVEL * 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tween.tween_callback(func() -> void: TouchFx.dust(parent, settle.pos, DUST_COLOR.lerp(color, 0.3), 0.55))
		if keeper:
			# A carta de verdade já está ali, no mesmo lugar: aparece e a temporária sai.
			tween.tween_callback(func() -> void:
				keeper.reveal()
				node.queue_free())
			continue
		# Sem a de verdade, fica no cemitério até o fim e some.
		tween.tween_interval(maxf(0.0, total - (i * gap + MILL_TRAVEL)))
		tween.tween_callback(node.queue_free)
	return total


## Vidência: os versos sobem do grimório (`from`) e abrem em leque com um halo macio atrás (dourado nos que ficam no
## topo, frio nos que vão para o fundo); os do topo voltam por cima e os do fundo descem para baixo do monte, cada um com
## o rastro da cor dele. Devolve a duração.
static func scry(parent: Node3D, from: Vector3, top: int, bottom: int, sleeve: Color = DEFAULT_SLEEVE, piles_info: Dictionary = {}) -> float:
	var shown: int = mini(SCRY_SHOWN, maxi(0, top) + maxi(0, bottom))
	var total: float = scry_duration(top, bottom)
	# O leque abre para dentro da mesa (o grimório fica num canto), e o rótulo fica sobre ele.
	var side := Vector3(-signf(from.x) if from.x != 0.0 else 0.0, 0, -signf(from.z) if from.z != 0.0 else -1.0)
	var center: Vector3 = from + Vector3(side.x * 1.7, 1.5, side.z * 0.7)
	if top + bottom > 0:
		Fx.float_text(parent, center + Vector3(0, 0.3, 0), scry_label(maxi(0, top), maxi(0, bottom)), GOLD, 46, 1.5)
	if shown == 0:
		return total
	var holder: Node3D = FlightPieces.holder(parent, total, TAIL)
	var view: Transform3D = FlightPieces.view(parent)
	var scale: float = float(piles_info.get("scale", 1.0))
	var pile_top: Vector3 = _top(from, piles_info)
	var start := Pose.new(pile_top, Basis.IDENTITY, scale, 1.0)
	var top_shown: int = mini(maxi(0, top), shown)
	FlightPieces.flutter(holder, pile_top, sleeve.lerp(Color.WHITE, 0.5), 6)
	for i: int in shown:
		var k: float = i - (shown - 1) / 2.0
		var pos: Vector3 = center + view.basis.x * k * 0.5 - view.basis.y * k * k * 0.03 + view.basis.z * i * 0.03
		var fan := Pose.new(pos, FlightPieces.facing(view, pos) * Basis(Vector3.UP, -deg_to_rad(k * 4.0)), 1.15, 1.0)
		var to_bottom: bool = i >= top_shown
		var tint: Color = BOTTOM_COLOR if to_bottom else GOLD
		var node: CardNode = FlightPieces.new_card(holder, null, {}, sleeve, start)
		var tween: Tween = node.create_tween()
		tween.tween_interval(i * SCRY_STAGGER)
		tween.tween_callback(node.show)
		FlightPieces.move(tween, node, start, fan, SCRY_RISE, 0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		# No leque: o halo macio acende atrás de cada verso (o foco), e a decisão aparece na cor dele.
		tween.tween_callback(func() -> void:
			FlightPieces.halo(node, tint, 0.8 if to_bottom else 1.0, SCRY_HOLD, 0.16, 0.2)
			if to_bottom:
				node.fade_dim(0.3, 0.2)
			else:
				node.set_glow(GOLD, 0.55))
		tween.tween_interval(SCRY_HOLD)
		tween.tween_callback(func() -> void: FlightPieces.smear(holder, node, tint, 0.38 if to_bottom else 0.45))
		if to_bottom:
			# Passa ao lado do monte e desliza por baixo dele.
			var beside := Pose.new(from + Vector3(0, 0.02, -side.z * 0.55 * scale), Basis.IDENTITY, scale, 1.0)
			var under := Pose.new(from + Vector3(0, -0.004, 0), Basis.IDENTITY, scale, 1.0)
			FlightPieces.move(tween, node, fan, beside, SCRY_RETURN * 0.6, 0.15).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
			FlightPieces.move(tween, node, beside, under, SCRY_RETURN * 0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		else:
			var back := Pose.new(pile_top + Vector3(0, 0.01, 0), Basis.IDENTITY, scale, 1.0)
			FlightPieces.move(tween, node, fan, back, SCRY_RETURN, 0.15).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		tween.tween_callback(node.queue_free)
	return total


## Busca no grimório (tutor): o grimório (`from`) remexe aceso, uma carta de costas sobe numa coluna de luz dourada,
## para um instante e voa até a mão (`to`) com o borrão dourado.
static func tutor(parent: Node3D, from: Vector3, to: Vector3, sleeve: Color = DEFAULT_SLEEVE, piles_info: Dictionary = {}) -> float:
	var holder: Node3D = FlightPieces.holder(parent, TUTOR_TIME, TAIL)
	var view: Transform3D = FlightPieces.view(parent)
	var scale: float = float(piles_info.get("scale", 1.0))
	var pile_top: Vector3 = _top(from, piles_info)
	TouchFx.rummage(holder, piles_info.get("library") as CardNode, pile_top, GOLD, TUTOR_RUMMAGE)
	var start := Pose.new(pile_top, Basis.IDENTITY, scale, 1.0)
	var lift_pos: Vector3 = from + Vector3(0, 1.0, 0)
	var lifted := Pose.new(lift_pos, Basis.IDENTITY.slerp(FlightPieces.facing(view, lift_pos), 0.55), 1.15, 1.0)
	var hand := Pose.new(to, FlightPieces.facing(view, to), 1.0, 1.0)
	var node: CardNode = FlightPieces.new_card(holder, null, {}, sleeve, start)
	var tween: Tween = node.create_tween()
	tween.tween_interval(TUTOR_RUMMAGE)
	tween.tween_callback(func() -> void:
		node.show()
		node.set_glow(GOLD, 0.6)
		EnergyBeam.pillar(holder, Vector3(from.x, pile_top.y, from.z), 3.0, GOLD, TUTOR_RISE + TUTOR_HOLD, 0.62 * scale)
		Fx.light(parent, from, GOLD, 2.5, 3.5, 0.6))
	FlightPieces.move(tween, node, start, lifted, TUTOR_RISE).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void: FlightPieces.sheen(node, GOLD, 0.3, 1.1))
	tween.tween_interval(TUTOR_HOLD)
	tween.tween_callback(func() -> void: FlightPieces.smear(holder, node, GOLD, 0.55, 0.2))
	FlightPieces.move(tween, node, lifted, hand, TUTOR_TRAVEL, 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(func() -> void:
		ManaOrb.flash(parent, to, GOLD, 1.0, 0.24)
		Fx.burst(parent, to, GOLD, 16, 0.8, 0.4, 0.04)
		node.queue_free())
	return TUTOR_TIME


## Faíscas que seguem a carta achada (paradas até `emitting` ligar).
static func _sparks(holder: Node3D, color: Color) -> GPUParticles3D:
	var trail := GPUParticles3D.new()
	trail.amount = 40 if Fx.quality > 0 else 14
	trail.lifetime = 0.4
	trail.local_coords = false
	trail.emitting = false
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = 0.2
	process.spread = 180.0
	process.initial_velocity_min = 0.05
	process.initial_velocity_max = 0.35
	process.gravity = Vector3(0, -0.6, 0)
	process.scale_min = 0.03
	process.scale_max = 0.08
	process.color_ramp = SpellMissile._ramp(color.lightened(0.5), color, 0.95)
	trail.process_material = process
	trail.draw_pass_1 = Fx._spark()
	holder.add_child(trail)
	return trail
