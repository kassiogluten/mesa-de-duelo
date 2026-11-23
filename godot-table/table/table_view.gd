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
## Centro do leque da sua mão (HandPlacement) e a altura das permanentes sobre o tampo (FieldPlacement).
const HAND_CENTER := HandPlacement.HAND_CENTER
const FIELD_Y := FieldPlacement.FIELD_Y

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
## id do jogador → as zonas dele (SeatLayout)
var _frames: Dictionary = {}
var _arrows: Arrows
var _marks: TargetMarks
## Setas pedidas: [{from, to, color, live}], com from/to sendo o id de uma carta, "player:<id>" ou um ponto da mesa.
var _arrow_specs: Array = []
## Onde fica na tela o retrato de cada jogador (o HUD responde), para a seta que mira um jogador.
var player_screen_position: Callable = func(_id: int) -> Vector2: return Vector2(-1, -1)
## Onde fica na tela cada camada da pilha (0 é o topo), o vão do painel da pilha (StackPanel.layer_rect); sem painel
## (testes, laboratório), Rect2() e a pilha fica no tampo, à direita.
var stack_slot: Callable = func(_depth: int) -> Rect2: return Rect2()
## A faixa da tela onde a sua mão deve caber (Hud.hand_area: entre o seu retrato e a coluna da direita); Rect2() sem HUD.
var hand_area: Callable = func() -> Rect2: return Rect2()

## As partes da mesa: o campo, a mão, a pilha e os destaques.
var _field := FieldPlacement.new(self)
var _hand := HandPlacement.new(self)
var _stack := StackPlacement.new(self)
var highlights := TableHighlights.new(self)
## O destaque da pilha (chamas de luz, ar tremendo, partículas e as ondas de chegar e resolver).
var stack_presence: StackPresence


func _ready() -> void:
	# O clique nas cartas é por raio da câmera até as áreas de colisão (Area3D.input_event).
	get_viewport().physics_object_picking = true
	_build_scene()


func _build_scene() -> void:
	# Câmera, luzes, ambiente, pós-processamento e o tampo: table/table_environment.gd.
	camera = TableEnvironment.build(self)

	_arrows = Arrows.new()
	add_child(_arrows)
	_marks = TargetMarks.new()
	add_child(_marks)
	stack_presence = StackPresence.new(self)
	add_child(stack_presence)


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
	_field.place_all(players, _frames, seen, names)
	for raw: Variant in players:
		var player: Dictionary = raw
		var frame: Dictionary = _frames[int(player["id"])]
		var sleeve: Color = SLEEVES[int(player.get("sleeve", 0)) % SLEEVES.size()]
		_hand.place(player, frame, sleeve, seen, names)
		_place_pile(player, "graveyard", frame, sleeve, seen, names)
		_place_pile(player, "exile", frame, sleeve, seen, names)
		_place_pile(player, "commandZone", frame, sleeve, seen, names)
		_place_library(player, frame, sleeve, seen)
	_stack.place(state.get("stack", []), you, seen, names)
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


## As setas a desenhar: [{from, to, color}] com o id da carta, "player:<id>" ou um ponto da mesa (Vector3) em cada
## ponta; `live` desenha a seta que segue o mouse (tracejada, andando).
func set_arrows(specs: Array) -> void:
	_arrow_specs = specs


## Os números nos alvos já escolhidos: [{key, text, color}] (a carta ou "player:<id>").
func set_target_marks(marks: Array) -> void:
	_marks.marks = marks


func _process(_delta: float) -> void:
	var drawn: Array = []
	for raw: Variant in _arrow_specs:
		var spec: Dictionary = raw
		var a: Variant = _anchor(spec["from"])
		var b: Variant = _anchor(spec["to"])
		if a is Vector3 and b is Vector3:
			drawn.append({"from": a, "to": b, "color": spec["color"], "live": bool(spec.get("live", false))})
	_arrows.arrows = drawn
	_marks.update_positions(_anchor)


## A posição de uma ponta da seta: o centro da carta, o retrato do jogador levado para dentro da mesa, ou o próprio ponto.
func _anchor(key: Variant) -> Variant:
	if key is Vector3:
		return key
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


## Destaques do prompt atual: pode usar, escolhível (alvo), selecionada; o resto do campo escurece se há escolha.
## `stacks`: itens da pilha escolhíveis. Para os outros estados (atacando, mana), highlight_roles.
func highlight(actionable: Array, selectable: Array, selected: Array, dim_others: bool, stacks: Array = []) -> void:
	highlight_roles({"actionable": actionable, "selectable": selectable, "selected": selected, "stacks": stacks}, dim_others)


## Os papéis do prompt (TableHighlights.role_of): {selected, selectable, attacking, untappable, actionable, mana_only,
## blocking, stacks}.
func highlight_roles(roles: Dictionary, dim_others: bool) -> void:
	highlights.apply(roles, dim_others)


# — Zonas —

## A rotação de uma carta de pé de frente para a câmera em `pos` (a carta arrastada perto da mão, a pilha).
func hand_basis(pos: Vector3) -> Basis:
	return _hand.facing_camera(pos)


## As cartas jogáveis da mão (input.actionable com a prioridade) ficam mais altas, e as outras um pouco apagadas.
## Chame depois de highlight(), que acende as cartas pelo prompt.
func apply_hand_layout(actionable: Array, priority: bool) -> void:
	_hand.apply_layout(actionable, priority)


## Muda a ordem da sua mão (a que o jogador arrumou arrastando; o servidor não sabe dela) e leva as cartas para o lugar.
func set_hand_order(order: Array) -> void:
	_hand.set_order(order)


## A sua mão na ordem do leque: [{id, transform}], com o lugar de cada carta.
func hand_slots() -> Array:
	return _hand.slots()


## A faixa da tela ocupada pela sua mão (soltar a carta arrastada ali a devolve ou muda a ordem); vazia sem cartas.
func hand_rect() -> Rect2:
	return _hand.screen_rect()


## O lugar da camada `depth` de uma pilha de `count` itens (StackPlacement.transform_at).
func stack_transform(depth: int, count: int) -> Transform3D:
	return _stack.transform_at(depth, count)


## A carta da mão que está sendo arrastada (escondida: quem aparece é a cópia que segue o mouse); a mesa não a move.
func dragging(node: CardNode) -> bool:
	return node != null and not node.visible


## Cemitério, exílio e zona de comando: as cartas empilhadas, a de cima à mostra, e quantas são. O monte tem a
## espessura das cartas de papel e uma bagunça arrumada fixa por id (PaperPhysics.pile_pose); quem chega pousa no alto
## dele e empurra um tico a de baixo, e a carta nova (moída, destruída) cai rente sobre o monte.
func _place_pile(player: Dictionary, zone: String, frame: Dictionary, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
	var cards: Array = player.get(zone, []) if player.get(zone) is Array else []
	var key: String = "command" if zone == "commandZone" else zone
	var pos: Vector3 = frame[key]
	var scale: float = frame["scale"]
	# No primeiro estado (a mesa sendo montada, antes de o grimório existir) os montes já começam no lugar.
	var settled: bool = card_node("library:%d" % int(player["id"])) != null
	var step: float = PaperPhysics.pile_step(cards.size())
	var below: CardNode = null
	var drops: int = 0
	for i: int in cards.size():
		var card: Dictionary = cards[i]
		var id: int = int(card["id"])
		var fresh: bool = not _cards.has(id)
		var arriving: bool = fresh or _zones.get(id, key) != key
		var face_down: bool = bool(card.get("faceDown", false))
		var t: Transform3D = PaperPhysics.pile_pose(pos, scale, id, i, cards.size(), face_down)
		put_card(id, card, key, t, sleeve, seen, names)
		var node: CardNode = _cards[id]
		node.set_pile_depth(step)
		node.set_contact_shadow(i == 0)
		if fresh and settled:
			node.drop_in(t, below, drops * 0.08)
			drops += 1
		elif arriving:
			node.land_on(below)
		below = node
	_count_label("%s:%d" % [key, int(player["id"])], cards.size(), pos + Vector3(0.22, 0.25, 0.3), seen, cards.size() > 1)


## O grimório: um bloco virado para baixo, apoiado no tampo, com a altura das cartas que tem (PaperPhysics.library_pose).
func _place_library(player: Dictionary, frame: Dictionary, sleeve: Color, seen: Dictionary) -> void:
	var count: int = int(player.get("library", 0))
	var pos: Vector3 = frame["library"]
	var scale: float = frame["scale"]
	var key: String = "library:%d" % int(player["id"])
	if count > 0:
		var pose: Array = PaperPhysics.library_pose(pos, scale, count)
		put_card(key, {}, "library", pose[0], sleeve, seen, PackedStringArray())
		# Virado para baixo, a face de cima é a de baixo da carta: a borda do monte desce do verso até o tampo.
		(_cards[key] as CardNode).set_pile_depth(pose[1])
	_count_label(key, count, pos + Vector3(0.22, 0.45, 0.3), seen, true)


## Cria ou atualiza o nó da carta e o manda para `t` (em arco se mudou de zona).
func put_card(key: Variant, card: Dictionary, zone: String, t: Transform3D, sleeve: Color, seen: Dictionary, names: PackedStringArray) -> void:
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
	highlights.hover(node, on)
	card_hovered.emit(node, on)


# — Para as partes da mesa —

## O último estado aplicado.
func current_state() -> Dictionary:
	return _state


## O contexto dos selos e da arrumação do campo (BadgeSpec.context) do estado atual.
func badge_context() -> Dictionary:
	return _ctx


## As zonas de um jogador (SeatLayout); {} se ele não está na mesa.
func frame_of(player_id: int) -> Dictionary:
	return _frames.get(player_id, {})


## As chaves de todas as cartas à mostra.
func card_keys() -> Array:
	return _cards.keys()


## A chave de um nó de carta (o id, ou o texto das escondidas); null se não é da mesa.
func key_of(node: CardNode) -> Variant:
	if node.card_id >= 0 and _cards.get(node.card_id) == node:
		return node.card_id
	for key: Variant in _cards:
		if _cards[key] == node:
			return key
	return null

