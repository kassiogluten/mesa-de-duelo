# A carta que se está pagando (ou cuja escolha de custo está aberta) à vista, grande, logo acima da caixa de ação, com o
# custo em símbolos apagando o que já foi pago; desistindo, ela volta voando para a mão (o prompt-card de src/ui/tableActionBox.ts).
class_name PaymentCard
extends Control

## Clique na carta (esquerdo ou direito): abrir de perto no inspetor.
signal inspect(card: Dictionary, url: String)

## Altura da carta na tela (a mesma ordem da carta do topo da pilha) e a menor a que ela encolhe para caber.
const HEIGHT := 360.0
const MIN_HEIGHT := 220.0
const ASPECT := ChoiceCard.ASPECT
const WIDTH := HEIGHT / ASPECT
## Folga até a caixa de ação e até o painel da pilha; o alto da tela que fica livre (menu, relógios).
const GAP := 14.0
const TOP_LIMIT := 80.0
## Os símbolos do custo: tamanho, e quanto o já pago apaga.
const SYMBOL_PX := 30
const PAID_ALPHA := 0.26
## Quanto a carta espera antes de sumir (entre um clique e o estado seguinte o pedido some por um instante).
const HIDE_DELAY := 0.22
const FLY_HOME_TIME := 0.42
const TO_STACK_TIME := 0.3

var catalog: CardCatalog
## A mesa 3D: de onde se acha o lugar da carta na mão para o voo de volta.
var table: TableView
## Onde está a caixa de ação (Hud.action_rect); vazio quando escondida.
var anchor: Callable = func() -> Rect2: return Rect2()
## O que a carta não pode cobrir (o painel da pilha): [Rect2].
var avoid: Callable = func() -> Array: return []
## A pilha está recolhida (a carta do topo não está grande no painel).
var stack_collapsed: Callable = func() -> bool: return false

var _tile: ChoiceCard
var _pill: PanelContainer
var _symbols: HBoxContainer
var _card: Dictionary = {}
var _url: String = ""
var _shown_id: int = -1
## O custo desenhado agora ("G:1,2:0…"), para só redesenhar quando muda e apagar com animação o que acabou de ser pago.
var _cost_key: String = ""
var _hide_in: float = -1.0
## Voando para a mão ou para a pilha: o layout não mexe mais na carta.
var _leaving: bool = false
var _placed: bool = false
var _scale: float = 1.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


# — Regras (sem cena, para os testes) —

static func _input_of(state: Dictionary) -> Dictionary:
	return state.get("input", {}) if state.get("input") is Dictionary else {}


## Onde está a carta à vista na mesa: "battlefield" (de qualquer jogador), "hand" (a sua) ou "".
static func location(state: Dictionary, id: int) -> String:
	for raw: Variant in state.get("players", []) if state.get("players") is Array else []:
		var player: Dictionary = raw
		for card: Variant in player.get("battlefield", []) if player.get("battlefield") is Array else []:
			if card is Dictionary and int((card as Dictionary).get("id", -1)) == id:
				return "battlefield"
		if player.get("id") == state.get("you"):
			for card: Variant in player.get("hand", []) if player.get("hand") is Array else []:
				if card is Dictionary and int((card as Dictionary).get("id", -1)) == id:
					return "hand"
	return ""


## A carta é a fonte do item do topo da pilha (já está grande no painel).
static func on_stack_top(state: Dictionary, id: int) -> bool:
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	if stack.is_empty() or not (stack[0] as Dictionary).get("source") is Dictionary:
		return false
	return int(((stack[0] as Dictionary)["source"] as Dictionary).get("id", -1)) == id


## O que a decisão atual mostra: {mode: "show", card, cost} (a carta junto da caixa, com o custo que falta),
## {mode: "source", card} (a permanente ou a carta da mão de onde vem a habilidade, que acende no lugar) ou {}.
## Vale para pagar mana e para as escolhas de um custo ou de um efeito (descartar, sacrificar, pagar vida, alvos).
static func decide(state: Dictionary, collapsed: bool = false) -> Dictionary:
	var input: Dictionary = _input_of(state)
	if bool(state.get("gameOver", false)) or bool(state.get("watching", false)) or bool(state.get("spectating", false)) or state.get("question") is Dictionary:
		return {}
	for key: String in ["opening", "openingWait", "attacking", "blocking", "vote", "suspendCast", "commanderMove"]:
		if input.get(key) != null:
			return {}
	var paying: bool = bool(input.get("paying", false))
	var targeting: Variant = input.get("targeting") if input.get("targeting") is Dictionary and not paying else null
	if bool(input.get("priority", false)) and not paying and targeting == null:
		return {}
	var card: Variant = input.get("card")
	if targeting != null and (targeting as Dictionary).get("card") is Dictionary:
		card = (targeting as Dictionary)["card"]
	if not card is Dictionary or bool((card as Dictionary).get("faceDown", false)) or Txt.of((card as Dictionary).get("name")) == "" or (card as Dictionary).get("id") == null:
		return {}
	var id: int = int((card as Dictionary)["id"])
	if location(state, id) != "":
		# Na escolha de alvos, a carta que mira já acende como selecionada (DecisionRoles).
		return {} if targeting != null else {"mode": "source", "card": card}
	# A que resolve e pede a escolha já está grande no topo da pilha; com a pilha recolhida, volta a aparecer aqui.
	if not collapsed and on_stack_top(state, id):
		return {}
	var cost: Array = cost_symbols(input["manaCost"]) if paying and input.get("manaCost") is Dictionary else []
	return {"mode": "show", "card": card, "cost": cost}


## A permanente (ou a carta da mão) que acende como origem do que se paga agora; -1 se nenhuma.
static func source_id(state: Dictionary) -> int:
	var d: Dictionary = decide(state)
	return int((d["card"] as Dictionary)["id"]) if Txt.of(d.get("mode")) == "source" else -1


## O custo em símbolos, com o que já foi pago apagado: [{symbol, paid}]. Com `total` (o custo quando o pagamento abriu),
## o que sumiu de `remaining` está pago; a genérica que foi paga em parte vira duas: a que falta e a paga ({2} com {1}
## pago: {1} aceso e {1} apagado).
static func cost_symbols(cost: Dictionary) -> Array:
	var remaining: PackedStringArray = ManaSymbols.parse(Txt.of(cost.get("remaining")))
	var total: PackedStringArray = ManaSymbols.parse(Txt.of(cost.get("total"))) if Txt.of(cost.get("total")) != "" else remaining
	var generic_left: int = 0
	var colored_left: Dictionary = {}
	for symbol: String in remaining:
		if symbol.is_valid_int():
			generic_left += int(symbol)
		elif symbol != "":
			colored_left[symbol] = int(colored_left.get(symbol, 0)) + 1
	var out: Array = []
	for symbol: String in total:
		if symbol.is_valid_int():
			var n: int = int(symbol)
			if n == 0:
				continue
			var due: int = mini(n, generic_left)
			generic_left -= due
			if due > 0:
				out.append({"symbol": str(due), "paid": false})
			if n - due > 0:
				out.append({"symbol": str(n - due), "paid": true})
		elif int(colored_left.get(symbol, 0)) > 0:
			colored_left[symbol] = int(colored_left[symbol]) - 1
			out.append({"symbol": symbol, "paid": false})
		else:
			out.append({"symbol": symbol, "paid": true})
	# O que falta e não estava no total (não devia acontecer): aceso no fim.
	if generic_left > 0:
		out.append({"symbol": str(generic_left), "paid": false})
	for symbol: String in colored_left:
		for i: int in int(colored_left[symbol]):
			out.append({"symbol": symbol, "paid": false})
	return out


# — Na tela —

## O estado novo: mostra, atualiza o custo, ou tira a carta (voando para a mão quando ela volta para lá).
func apply_state(state: Dictionary) -> void:
	var d: Dictionary = decide(state, bool(stack_collapsed.call()))
	if Txt.of(d.get("mode")) == "show":
		_hide_in = -1.0
		_show(d["card"], d.get("cost", []))
		return
	if _shown_id < 0 or _leaving:
		return
	if location(state, _shown_id) == "hand":
		_fly_home()
	elif on_stack_top(state, _shown_id):
		_fly_to_stack()
	elif _hide_in < 0.0:
		_hide_in = HIDE_DELAY


## A carta à vista agora (para os testes e para a mana voar até ela); {} sem carta.
func shown_card() -> Dictionary:
	return _card if _shown_id >= 0 and not _leaving else {}


## Os símbolos do custo desenhados: [{symbol, paid}] (para os testes).
func shown_cost() -> Array:
	var out: Array = []
	if _symbols == null or not _pill.visible:
		return out
	for child: Node in _symbols.get_children():
		out.append({"symbol": Txt.of(child.get_meta("symbol", "")), "paid": bool(child.get_meta("paid", false))})
	return out


## O retângulo da carta na tela (vazio sem carta).
func card_rect() -> Rect2:
	if _tile == null or not is_instance_valid(_tile):
		return Rect2()
	var size: Vector2 = _tile.card_size * _tile.scale.x
	var center: Vector2 = _tile.position + _tile.pivot_offset
	return Rect2(center - size / 2.0, size)


## Onde fica na tela a carta `key` (o centro dela), para a mana gasta voar até ela; (-1, -1) se não é esta.
func point_of(key: Variant) -> Vector2:
	if (key is int or key is float) and int(key) == _shown_id and _shown_id >= 0 and _tile != null and is_instance_valid(_tile):
		return card_rect().get_center()
	return Vector2(-1, -1)


func on_texture_ready(url: String, tex: Texture2D) -> void:
	if url == _url and _tile != null and is_instance_valid(_tile):
		_tile.set_texture(tex, _name())


func _name() -> String:
	var name: String = Txt.of(_card.get("name"))
	return catalog.label(name) if catalog else name


func _show(card: Dictionary, cost: Array) -> void:
	var id: int = int(card["id"])
	if id != _shown_id or _tile == null or not is_instance_valid(_tile):
		_clear()
		_build(card)
	_card = card
	_set_cost(cost)


func _build(card: Dictionary) -> void:
	_card = card
	_shown_id = int(card["id"])
	_leaving = false
	_placed = false
	_cost_key = ""
	if catalog:
		catalog.request(PackedStringArray([Txt.of(card.get("name"))]))
	_url = catalog.image_url_for(card) if catalog else ""
	_tile = ChoiceCard.new().setup(card, WIDTH)
	_tile.pivot_offset = Vector2(WIDTH / 2.0, ChoiceCard.LIFT_ROOM + _tile.card_size.y / 2.0)
	_tile.set_texture(catalog.texture(_url) if catalog and _url != "" else null, _name())
	_tile.pressed.connect(func() -> void: inspect.emit(_card, _url))
	_tile.inspect.connect(func() -> void: inspect.emit(_card, _url))
	_tile.tooltip_text = "Clique para ver a carta de perto."
	add_child(_tile)
	_pill = PanelContainer.new()
	var style := HudStyle.panel(Color(0.035, 0.05, 0.09, 0.92), 18)
	style.border_color = Color(HudStyle.GOLD, 0.45)
	style.set_border_width_all(1)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 10
	_pill.add_theme_stylebox_override("panel", style)
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill.visible = false
	add_child(_pill)
	_symbols = HBoxContainer.new()
	_symbols.add_theme_constant_override("separation", 5)
	_symbols.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill.add_child(_symbols)
	# Chega de leve: um pouco menor e de baixo (da caixa de ação), clareando.
	_tile.modulate.a = 0.0
	_pill.modulate.a = 0.0
	_layout(0.0)
	_tile.position.y += 30.0
	_scale *= 0.92
	_tile.scale = Vector2.ONE * _scale
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_tile, "modulate:a", 1.0, 0.18)
	tween.tween_property(_pill, "modulate:a", 1.0, 0.25).set_delay(0.08)


## Os símbolos do custo: redesenha quando muda; o que acabou de ser pago apaga com um estalo.
func _set_cost(cost: Array) -> void:
	var key: String = ",".join(PackedStringArray(cost.map(func(s: Dictionary) -> String: return "%s:%d" % [s["symbol"], int(bool(s["paid"]))])))
	if key == _cost_key:
		return
	var before: Array = shown_cost()
	_cost_key = key
	for child: Node in _symbols.get_children():
		_symbols.remove_child(child)
		child.queue_free()
	_pill.visible = not cost.is_empty()
	var paid_count: int = cost.filter(func(s: Dictionary) -> bool: return bool(s["paid"])).size()
	var lit_count: int = cost.size() - paid_count
	_pill.tooltip_text = "Custo pago." if lit_count == 0 else "Falta pagar o que está aceso; o apagado já foi pago."
	for i: int in cost.size():
		var spec: Dictionary = cost[i]
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(Txt.of(spec["symbol"]), SYMBOL_PX * 2)
		icon.custom_minimum_size = Vector2(SYMBOL_PX, SYMBOL_PX)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.set_meta("symbol", Txt.of(spec["symbol"]))
		icon.set_meta("paid", bool(spec["paid"]))
		_symbols.add_child(icon)
		var paid: bool = bool(spec["paid"])
		# Pago agora (antes estava aceso): apaga com um estalo; o resto já entra no tom certo.
		var just_paid: bool = paid and i < before.size() and not bool((before[i] as Dictionary)["paid"])
		icon.modulate.a = 1.0 if just_paid or not paid else PAID_ALPHA
		if just_paid:
			icon.pivot_offset = Vector2(SYMBOL_PX, SYMBOL_PX) / 2.0
			var tween := icon.create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			tween.tween_property(icon, "scale", Vector2.ONE * 1.3, 0.08)
			tween.tween_property(icon, "scale", Vector2.ONE, 0.18)
			tween.parallel().tween_property(icon, "modulate:a", PAID_ALPHA, 0.3)
	_pill.reset_size()


func _process(delta: float) -> void:
	if _hide_in >= 0.0:
		_hide_in -= delta
		if _hide_in < 0.0:
			_fade_out()
	if _tile != null and is_instance_valid(_tile) and not _leaving:
		_layout(delta)


## Acima da caixa de ação, encostada à direita dela; o painel da pilha aberto empurra a carta para a esquerda dele, e a
## pilha recolhida (no alto) a faz encolher para caber embaixo.
func target_rect() -> Rect2:
	var view: Vector2 = get_viewport_rect().size
	var box: Rect2 = anchor.call()
	var right: float = box.end.x if box.has_area() else view.x - HudStyle.MARGIN
	var pill_h: float = (_pill.get_combined_minimum_size().y + 8.0) if _pill != null and _pill.visible else 0.0
	var bottom: float = (box.position.y if box.has_area() else view.y - HudStyle.MARGIN - 180.0) - GAP
	var height: float = minf(HEIGHT, bottom - pill_h - TOP_LIMIT)
	for raw: Variant in avoid.call():
		var other: Rect2 = raw
		var rect := Rect2(right - height / ASPECT, bottom - height - pill_h, height / ASPECT, height + pill_h)
		if not rect.intersects(other.grow(GAP * 0.5)):
			continue
		var room: float = bottom - pill_h - (other.end.y + GAP)
		if other.end.y < bottom and room >= MIN_HEIGHT:
			height = minf(height, room)
		else:
			right = other.position.x - GAP
	height = maxf(height, MIN_HEIGHT)
	return Rect2(right - height / ASPECT, bottom - height, height / ASPECT, height)


func _layout(delta: float) -> void:
	var rect: Rect2 = target_rect()
	var goal_scale: float = rect.size.y / _tile.card_size.y
	var goal_pos: Vector2 = rect.get_center() - _tile.pivot_offset
	var k: float = 1.0 if delta <= 0.0 or not _placed else 1.0 - exp(-delta * 12.0)
	_placed = true
	_scale = lerpf(_scale, goal_scale, k) if k < 1.0 else goal_scale
	_tile.scale = Vector2.ONE * _scale
	_tile.position = _tile.position.lerp(goal_pos, k)
	if _pill.visible:
		_pill.reset_size()
		var card: Rect2 = card_rect()
		_pill.position = Vector2(card.end.x - _pill.size.x, card.position.y - _pill.size.y - 8.0)


## Desistiu: a carta voa de onde está até o lugar dela na mão, e a carta da mão só aparece quando ela chega.
func _fly_home() -> void:
	var node: CardNode = table.card_node(_shown_id) if table else null
	if node == null or not is_instance_valid(node) or table.camera == null:
		_fade_out()
		return
	var pose: Dictionary = hand_pose(table.camera, node.target_transform())
	if pose.is_empty():
		_fade_out()
		return
	_leaving = true
	_hide_in = -1.0
	var keeper := FlightPieces.Concealer.new()
	keeper.card = weakref(node)
	node.visible = false
	add_child(keeper)
	# A carta da mão nasce voando do grimório (HandMotion.fly_in): já fica no lugar dela, escondida, e o voo desiste.
	node.transform = node.target_transform()
	var tile: ChoiceCard = _tile
	var pill: PanelContainer = _pill
	_forget()
	pill.create_tween().tween_property(pill, "modulate:a", 0.0, 0.12)
	var scale_to: float = float(pose["width"]) / tile.card_size.x
	var tween := tile.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(tile, "position", (pose["center"] as Vector2) - tile.pivot_offset, FLY_HOME_TIME)
	tween.tween_property(tile, "scale", Vector2.ONE * scale_to, FLY_HOME_TIME)
	tween.tween_property(tile, "rotation", float(pose["angle"]), FLY_HOME_TIME)
	tween.chain().tween_callback(func() -> void:
		keeper.reveal()
		keeper.queue_free()
		tile.queue_free()
		pill.queue_free()
		_leaving = false)


## Conjurou: a carta encolhe até o vão do topo da pilha e some ali (a carta da pilha toma o lugar dela).
func _fly_to_stack() -> void:
	var slot: Rect2 = table.stack_slot.call(0) if table else Rect2()
	if not slot.has_area():
		_fade_out()
		return
	_leaving = true
	_hide_in = -1.0
	var tile: ChoiceCard = _tile
	var pill: PanelContainer = _pill
	_forget()
	pill.create_tween().tween_property(pill, "modulate:a", 0.0, 0.1)
	var tween := tile.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tween.tween_property(tile, "position", slot.get_center() - tile.pivot_offset, TO_STACK_TIME)
	tween.tween_property(tile, "scale", Vector2.ONE * (slot.size.y / tile.card_size.y), TO_STACK_TIME)
	tween.tween_property(tile, "modulate:a", 0.0, TO_STACK_TIME * 0.6).set_delay(TO_STACK_TIME * 0.4)
	tween.chain().tween_callback(func() -> void:
		tile.queue_free()
		pill.queue_free()
		_leaving = false)


## Some aos poucos onde está (o pedido acabou sem a carta ir para a mão nem para a pilha).
func _fade_out() -> void:
	if _tile == null or not is_instance_valid(_tile):
		_forget()
		return
	var tile: ChoiceCard = _tile
	var pill: PanelContainer = _pill
	_forget()
	var tween := tile.create_tween().set_parallel(true)
	tween.tween_property(tile, "modulate:a", 0.0, 0.2)
	tween.tween_property(pill, "modulate:a", 0.0, 0.15)
	tween.chain().tween_callback(func() -> void:
		tile.queue_free()
		pill.queue_free())


## Solta a carta atual (quem a leva embora cuida dela).
func _forget() -> void:
	_tile = null
	_pill = null
	_symbols = null
	_shown_id = -1
	_card = {}
	_url = ""
	_cost_key = ""
	_hide_in = -1.0


func _clear() -> void:
	if _tile != null and is_instance_valid(_tile):
		_tile.queue_free()
	if _pill != null and is_instance_valid(_pill):
		_pill.queue_free()
	_forget()


## Onde a carta da mão fica na tela, pelo lugar dela no leque: {center, width, angle} (os cantos da carta projetados);
## {} se ela está atrás da câmera.
static func hand_pose(camera: Camera3D, t: Transform3D) -> Dictionary:
	var half: Vector2 = CardNode.SIZE / 2.0
	var points: Array = []
	for corner: Vector3 in [Vector3(-half.x, 0, -half.y), Vector3(half.x, 0, -half.y), Vector3(half.x, 0, half.y), Vector3(-half.x, 0, half.y)]:
		var world: Vector3 = t * corner
		if camera.is_position_behind(world):
			return {}
		points.append(camera.unproject_position(world))
	var left: Vector2 = ((points[0] as Vector2) + (points[3] as Vector2)) / 2.0
	var right: Vector2 = ((points[1] as Vector2) + (points[2] as Vector2)) / 2.0
	var angle: float = (right - left).angle()
	# A carta pode estar girada meia volta no plano: o ângulo fica perto do zero.
	if absf(angle) > PI / 2.0:
		angle -= signf(angle) * PI
	var center: Vector2 = Vector2.ZERO
	for p: Vector2 in points:
		center += p / 4.0
	return {"center": center, "width": left.distance_to(right), "angle": angle}
