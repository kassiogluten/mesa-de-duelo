# A interação com a mesa na partida: o clique em cada carta e retrato vira a mensagem certa (usar, alvo, atacar,
# bloquear, abrir a zona), a seta que segue o mouse grudando no alvo válido, os destaques de cada estado, os números
# dos alvos escolhidos, o cursor e os atalhos de teclado que mexem na jogada.
class_name TableInteraction
extends Node

## Mensagem pronta para o servidor (já conferida contra cliques repetidos no mesmo prompt).
signal send(message: Dictionary)
## Aviso curto para o jogador (ataque não permitido, nada para desfazer...); `kind` como Hud.show_toast.
signal notice(text: String, kind: String)
## Abrir a janela de uma zona (cemitério, exílio, comando).
signal zone_requested(player_id: int, zone: String)
## A criatura escolhida para bloquear mudou (a caixa de ação muda o texto).
signal blocker_changed

const GOLD := Color(1.0, 0.82, 0.3)
const RED := Color(1.0, 0.35, 0.25)
const BLUE := Color(0.35, 0.7, 1.0)
## Altura, sobre o tampo, do ponto onde a seta que segue o mouse termina quando não está num alvo.
const AIM_HEIGHT := 0.35

var table: TableView
var hud: Hud
var drag: HandDrag
## O último estado do servidor.
var state: Callable = func() -> Dictionary: return {}
## O nome de uma carta em português (CardCatalog.label).
var label: Callable = func(name: String) -> String: return name

var blocks := BlockFlow.new()
var attacks := AttackFlow.new()
var pointer := BoardPointer.new()
## O painel "Atacar quem?" (ui/attack_panel.gd), ligado por use_attack_panel; null nos testes sem HUD.
var attack_panel: AttackPanel

## O gen do pedido em que já se mandou um clique: os cliques repetidos antes do estado novo são ignorados.
var _sent_gen: int = -1
## O alvo marcado pelo Tab (a chave da carta ou "player:<id>"); null sem foco.
var _focus: Variant = null
## O defensor sob o mouse no painel "Atacar quem?" (a seta mira nele); null sem nenhum.
var _panel_hover: Variant = null
## Um ataque acabou de ir: a pose das marcadas espera o estado novo (para não voltarem ao lugar e saírem de novo).
var _hold_pose: bool = false
var _hovered: CardNode
var _fixed_arrows: Array = []
var _cursor: int = -1
## O nível de passar de antes do controle total (F), para voltar a ele.
var _level_before: String = ""


func _ready() -> void:
	add_child(pointer)
	pointer.tapped.connect(click_card)
	pointer.drag_started.connect(_on_drag_started)
	pointer.dropped.connect(_on_dropped)


## Liga o painel "Atacar quem?": escolher um defensor, "Retirar do combate", "Limpar seleção" e a mira ao passar o mouse.
func use_attack_panel(panel: AttackPanel) -> void:
	attack_panel = panel
	panel.chosen.connect(func(defender: Dictionary) -> void: _apply(attacks.choose(_s(), defender, card_name)))
	panel.remove_pressed.connect(func() -> void: _apply(attacks.remove_selected(_s())))
	panel.clear_pressed.connect(func() -> void:
		attacks.clear()
		_focus = null
		refresh())
	panel.hovered.connect(func(defender: Dictionary) -> void:
		_panel_hover = null if defender.is_empty() else ("player:%d" % int(defender["id"]) if defender["kind"] == "player" else int(defender["id"])))


func _s() -> Dictionary:
	var s: Variant = state.call()
	return s if s is Dictionary else {}


func _input_data() -> Dictionary:
	var s: Dictionary = _s()
	return s.get("input", {}) if s.get("input") is Dictionary else {}


## Estado novo: as escolhas locais que não valem mais caem, e os destaques e as setas são refeitos.
func apply_state(_state: Dictionary) -> void:
	var s: Dictionary = _s()
	var had_blocker: int = blocks.blocker
	blocks.sync(s)
	attacks.sync(s)
	if blocks.blocker != had_blocker:
		blocker_changed.emit()
	_hold_pose = false
	refresh()


## Manda a mensagem uma vez por prompt (o `gen`); as sem gen sempre vão. Devolve true se mandou.
func send_once(message: Dictionary) -> bool:
	if message.has("gen"):
		if int(message["gen"]) == _sent_gen:
			return false
		_sent_gen = int(message["gen"])
	send.emit(message)
	return true


## O nome em português da carta com esse id ("" se não está à mostra).
func card_name(id: int) -> String:
	var name: String = Txt.of(table.card_data(id).get("name"))
	return Txt.of(label.call(name)) if name != "" else ""


## O nome da criatura escolhida para bloquear (para a caixa de ação pedir o atacante).
func blocker_name() -> String:
	return card_name(blocks.blocker) if blocks.pending() else ""


# — Cliques —

## Apertou uma carta da mesa: a da mão espera (clique ou arrasto, HandDrag); o atacante e o bloqueador também (arrastar
## até o alvo); o resto é clique.
func card_pressed(node: CardNode) -> void:
	if node.card_id >= 0 and table.zone_of(node.card_id) == "hand":
		drag.press(node)
		return
	if node.card_id >= 0 and table.zone_of(node.card_id) == "battlefield" and _draggable(node.card_id):
		pointer.press(node)
		return
	click_card(node)


## A permanente pode ser arrastada agora: a criatura que pode atacar, ou a que pode bloquear.
func _draggable(id: int) -> bool:
	var s: Dictionary = _s()
	return AttackFlow.attackers(s).has(id) or BlockFlow.legal(s).has(id)


func click_card(node: CardNode) -> void:
	if not is_instance_valid(node):
		return
	if OS.get_environment("MESA_LOG_ENVIO") == "1":
		print("CLIQUE na carta %d (zona %s)" % [node.card_id, table.zone_of(node.card_id)])
	var s: Dictionary = _s()
	var input: Dictionary = _input_data()
	if _open_pile(node, input):
		return
	var gen: int = int(input.get("gen", 0))
	var stack_id: int = int(node.data.get("stackId", -1))
	if stack_id >= 0 and (input.get("selectableStacks", []) as Array).has(stack_id):
		send_once({"type": "stack", "id": stack_id, "gen": gen})
		return
	var id: int = node.card_id
	if id < 0:
		return
	if BlockFlow.legal(s).size() > 0:
		_apply(blocks.click(s, id), true)
		return
	if AttackFlow.active(s) and table.zone_of(id) == "battlefield":
		if AttackFlow.attackers(s).has(id):
			_apply(attacks.click_attacker(s, id, card_name))
		else:
			_apply(attacks.choose(s, {"id": id, "kind": "card"}, card_name))
		return
	for list: String in ["selectable", "actionable", "untappable", "manaOnly"]:
		if (input.get(list, []) as Array).has(id):
			send_once({"type": "card", "id": id, "gen": gen})
			return


## O que uma escolha devolveu: manda, avisa ou só redesenha os destaques.
func _apply(result: Dictionary, block: bool = false) -> void:
	if result.has("send"):
		# As marcadas que acabaram de ir para o ataque ficam na pose até o estado novo (que já as traz atacando).
		_hold_pose = send_once(result["send"])
	if result.has("notice"):
		notice.emit(Txt.of(result["notice"]), "warning")
	if block:
		blocker_changed.emit()
	if not result.is_empty():
		_focus = null
		refresh()


## Carta de cemitério, exílio ou zona de comando que não é uma escolha agora: abre a janela daquela zona.
func _open_pile(node: CardNode, input: Dictionary) -> bool:
	if not ["graveyard", "exile", "command"].has(table.zone_of(node.card_id)):
		return false
	for list: String in ["selectable", "actionable", "untappable", "manaOnly"]:
		if (input.get(list, []) as Array).has(node.card_id):
			return false
	var where: Dictionary = SeatInfo.owner_zone(_s(), node.card_id)
	if where.is_empty():
		return false
	zone_requested.emit(int(where["player"]), Txt.of(where["zone"]))
	return true


## Clicou no retrato de um jogador: escolhe quem atacar na declaração de ataque; senão, o jogador como alvo.
func player_clicked(player_id: int) -> void:
	var s: Dictionary = _s()
	if AttackFlow.active(s):
		_apply(attacks.choose(s, {"id": player_id, "kind": "player"}, card_name))
		return
	var input: Dictionary = _input_data()
	if (input.get("selectablePlayers", []) as Array).has(player_id):
		send_once({"type": "player", "id": player_id, "gen": int(input.get("gen", 0))})


func _on_drag_started(node: CardNode) -> void:
	# Arrastar a criatura que pode bloquear já a escolhe: a linha sai dela e segue o mouse.
	if BlockFlow.legal(_s()).has(node.card_id) and blocks.blocker != node.card_id:
		blocks.blocker = node.card_id
		blocker_changed.emit()
	refresh()


## Soltou a permanente arrastada: no defensor (ataque) ou no atacante (bloqueio) sob a ponta da seta.
func _on_dropped(node: CardNode, at: Vector2) -> void:
	var s: Dictionary = _s()
	var target: Variant = TargetSnap.pick(at, _candidates(), _hovered_key())
	if AttackFlow.active(s) and target != null:
		var defender: Dictionary = _defender_of(target)
		if not defender.is_empty():
			_apply(attacks.drop(s, node.card_id, defender, card_name))
	elif BlockFlow.legal(s).has(node.card_id) and target is int:
		_apply(blocks.drop(s, node.card_id, int(target)), true)
	refresh()


static func _defender_of(key: Variant) -> Dictionary:
	if key is int:
		return {"id": int(key), "kind": "card"}
	var text: String = Txt.of(key)
	if text.begins_with("player:"):
		return {"id": int(text.substr(7)), "kind": "player"}
	return {}


# — Escolha em andamento, cancelar e teclado —

## Há algo escolhido só aqui, esperando o próximo clique (bloqueador, atacantes marcados, arrasto, alvo do Tab).
func has_pending() -> bool:
	return blocks.pending() or attacks.pending() or pointer.dragging() != null or _focus != null


## Esc ou clique direito: desfaz a escolha em andamento. Devolve true se havia uma.
func cancel_pending() -> bool:
	var had_blocker: bool = blocks.pending()
	var had: bool = pointer.cancel()
	_hold_pose = false
	had = blocks.cancel() or had
	had = attacks.cancel() or had
	if _focus != null:
		_focus = null
		had = true
	if had_blocker:
		blocker_changed.emit()
	if had:
		refresh()
	return had


## Um atalho de teclado (KeyMap) que mexe na jogada; true se fez algo.
func handle_key(action: String) -> bool:
	var s: Dictionary = _s()
	if s.is_empty() or bool(s.get("gameOver", false)):
		return false
	match action:
		"primary":
			var message: Dictionary = hud.primary_message()
			if not message.is_empty() and not s.get("question") is Dictionary:
				send_once(message)
				return true
		"confirm":
			if _focus != null:
				_activate(_focus)
				return true
			var ok: Variant = _input_data().get("ok")
			if ok is Dictionary and bool((ok as Dictionary).get("enabled", false)) and not s.get("question") is Dictionary:
				send_once({"type": "ok", "gen": int(_input_data().get("gen", 0))})
				return true
		"cancel":
			return cancel_pending()
		"cycle", "cycle_back":
			var keys: Array = TargetSnap.order(_candidates())
			if keys.is_empty():
				return false
			_focus = TargetSnap.cycle(keys, _focus, 1 if action == "cycle" else -1)
			pointer.travel = 0.0
			refresh()
			return true
		"undo":
			var undo: Dictionary = s.get("undo", {}) if s.get("undo") is Dictionary else {}
			if undo.get("last") is Dictionary and not bool(undo.get("pending", false)):
				send.emit({"type": "undo-request"})
			else:
				notice.emit("Nada para desfazer agora.", "info")
			return true
		"control":
			_toggle_control(s)
			return true
	return false


## O Enter no alvo marcado pelo Tab: o mesmo que clicar nele.
func _activate(key: Variant) -> void:
	var defender: Dictionary = _defender_of(key)
	_focus = null
	if defender.get("kind") == "player":
		player_clicked(int(defender["id"]))
	elif table.card_node(key) != null:
		click_card(table.card_node(key))
	refresh()


## F: liga o controle total (para em toda etapa) e, de novo, volta ao nível de antes; passando até o fim do turno, para.
func _toggle_control(s: Dictionary) -> void:
	var prefs: Dictionary = s.get("preferences", {}) if s.get("preferences") is Dictionary else {}
	if bool(prefs.get("passingTurn", false)):
		send.emit({"type": "pass-turn-stop"})
		notice.emit("Parou de passar até o fim do turno.", "info")
		return
	var level: String = Txt.of(prefs.get("passLevel"))
	if level != "sempre":
		_level_before = level if level != "" else "acoes"
		send.emit({"type": "preferences", "passLevel": "sempre"})
		notice.emit("Controle total: a mesa para em toda etapa. Aperte F para voltar.", "info")
	else:
		send.emit({"type": "preferences", "passLevel": _level_before if _level_before != "" else "acoes"})
		notice.emit("Controle total desligado.", "info")


# — Destaques, setas e mira —

## Refaz os destaques das cartas, as setas fixas e os números dos alvos pelo estado e pelas escolhas locais.
func refresh() -> void:
	if table == null:
		return
	var s: Dictionary = _s()
	var input: Dictionary = _input_data()
	var roles: Dictionary = DecisionRoles.build(s, blocks, attacks, pointer.dragging())
	var choosing: bool = (not bool(input.get("priority", false)) and not (roles["selectable"] as Array).is_empty()) or blocks.pending() or attacks.pending()
	table.highlight_roles(roles, choosing)
	table.highlights.set_focus(_focus if _focus is int or (_focus is String and table.card_node(_focus) != null) else null)
	table.apply_hand_layout(input.get("actionable", []), bool(input.get("priority", false)))
	_fixed_arrows = DecisionRoles.fixed_arrows(s)
	table.set_target_marks(DecisionRoles.target_marks(s))
	if attack_panel != null:
		attack_panel.show_model(AttackPanelModel.build(s, attacks, card_name))
	_pose_marked(s)


## As marcadas para atacar que ainda não têm defensor já avançam e inclinam de leve (FieldPlacement.MARKED_META): a
## mesa refaz a arrumação do campo só quando a lista muda.
func _pose_marked(s: Dictionary) -> void:
	if _hold_pose:
		return
	var marked: Array = attacks.selected.filter(func(id: int) -> bool: return not AttackFlow.assigned(s, id)) if AttackFlow.active(s) else []
	var before: Array = table.get_meta(FieldPlacement.MARKED_META, [])
	if marked == before:
		return
	table.set_meta(FieldPlacement.MARKED_META, marked)
	if not table.current_state().is_empty():
		table.apply_state(table.current_state())


func hover(node: CardNode, on: bool) -> void:
	if on:
		_hovered = node
	elif _hovered == node:
		_hovered = null


func _hovered_key() -> Variant:
	if not is_instance_valid(_hovered) or not _hovered.hovered:
		return null
	return table.key_of(_hovered)


func _process(_delta: float) -> void:
	if table == null or table.camera == null:
		return
	if _focus != null and pointer.travel > 40.0:
		_focus = null
		refresh()
	var live: Array = _live_arrows()
	table.set_arrows(_fixed_arrows + live)
	_update_cursor(not live.is_empty())


## A seta que segue o mouse: da carta que mira (ou do bloqueador escolhido, ou do atacante arrastado ou marcado) até o
## alvo válido sob o mouse ou perto dele; sem alvo, até o ponto da mesa sob o mouse.
func _live_arrows() -> Array:
	var s: Dictionary = _s()
	var sources: Array = []
	var color: Color = GOLD
	var dragged: CardNode = pointer.dragging()
	if dragged != null and AttackFlow.active(s):
		sources = [table.key_of(dragged)]
		color = RED
	elif blocks.pending():
		sources = [blocks.blocker]
		color = BLUE
	elif AttackFlow.active(s) and not attacks.selected.is_empty():
		sources = attacks.selected.duplicate()
		color = RED
	elif _aiming_targets(s):
		sources = [_target_source(s)]
	if sources.is_empty() or sources[0] == null:
		table.highlights.set_snapped(null)
		return []
	# A ponta: o alvo do Tab, o defensor sob o mouse no painel, ou o alvo válido perto do mouse; com o mouse por cima do
	# painel sem um defensor, a seta some (não aponta para a mesa embaixo dele).
	var over_panel: bool = attack_panel != null and attack_panel.showing() and attack_panel.get_global_rect().has_point(pointer.mouse)
	var end: Variant = _focus if _focus != null else (_panel_hover if _panel_hover != null else (null if over_panel else TargetSnap.pick(pointer.mouse, _candidates(), _hovered_key())))
	table.highlights.set_snapped(end if end is int or end is String else null)
	if color == RED and end != null:
		var defender: Dictionary = _defender_of(end)
		if not defender.is_empty():
			color = AttackPanelModel.defender_color(s, defender)
	if end == null:
		if pointer.mouse.x < 0.0 or over_panel:
			return []
		end = _mouse_on_table()
		if end == null:
			return []
	var out: Array = []
	for source: Variant in sources:
		if not TargetSnap.same(source, end):
			out.append({"from": source, "to": end, "color": color, "live": true})
	return out


## Escolhendo os alvos de uma mágica ou habilidade agora (sem pergunta aberta nem pagamento).
static func _aiming_targets(s: Dictionary) -> bool:
	var input: Dictionary = s.get("input", {}) if s.get("input") is Dictionary else {}
	return input.get("targeting") is Dictionary and not bool(input.get("paying", false)) and not s.get("question") is Dictionary


## De onde sai a seta de alvo: a carta que alveja (na mesa ou na pilha), senão o topo da pilha, senão a sua mão.
func _target_source(s: Dictionary) -> Variant:
	var targeting: Dictionary = (s["input"] as Dictionary)["targeting"]
	var source: Variant = targeting.get("source")
	if source != null and table.card_node(int(source)) != null:
		return int(source)
	var stack: Array = s.get("stack", [])
	if not stack.is_empty():
		var top: Dictionary = stack[0]
		var key: Variant = int((top["source"] as Dictionary)["id"]) if top.get("source") is Dictionary and Txt.of(top.get("kind", "spell")) == "spell" else "stack:%d" % int(top["id"])
		if table.card_node(key) != null:
			return key
	return HandPlacement.HAND_CENTER


## Os alvos válidos agora, com o lugar de cada um na tela: [{key, screen}].
func _candidates() -> Array:
	var s: Dictionary = _s()
	var input: Dictionary = _input_data()
	var out: Array = []
	var cards: Array = []
	var players: Array = []
	if AttackFlow.active(s):
		for t: Dictionary in AttackFlow.all_targets(s):
			(players if t["kind"] == "player" else cards).append(int(t["id"]))
		if not attacks.pending() and pointer.dragging() == null:
			cards.append_array(AttackFlow.attackers(s))
	elif BlockFlow.legal(s).size() > 0:
		cards = blocks.selectable(s)
	else:
		cards = (input.get("selectable", []) as Array).duplicate()
		players = (input.get("selectablePlayers", []) as Array).duplicate()
		for key: Variant in table.card_keys():
			var node: CardNode = table.card_node(key)
			if node != null and node.data.has("stackId") and (input.get("selectableStacks", []) as Array).has(int(node.data["stackId"])):
				out.append({"key": key, "screen": table.camera.unproject_position(node.global_position)})
	for id: Variant in cards:
		var node: CardNode = table.card_node(int(id))
		if node != null and node.visible:
			out.append({"key": int(id), "screen": table.camera.unproject_position(node.global_position)})
	for id: Variant in players:
		var screen: Vector2 = hud.portrait_center(int(id)) if hud else Vector2(-1, -1)
		if screen.x >= 0.0:
			out.append({"key": "player:%d" % int(id), "screen": screen})
	return out


## O ponto da mesa sob o mouse (um pouco acima do tampo), ou null.
func _mouse_on_table() -> Variant:
	var origin: Vector3 = table.camera.project_ray_origin(pointer.mouse)
	var direction: Vector3 = table.camera.project_ray_normal(pointer.mouse)
	return Plane(Vector3.UP, AIM_HEIGHT).intersects_ray(origin, direction)


## Mãozinha sobre o que responde ao clique; mira enquanto uma seta segue o mouse; a seta comum no resto.
func _update_cursor(aiming: bool) -> void:
	var key: Variant = _hovered_key()
	var shape: int = Input.CURSOR_ARROW
	if key != null and TableHighlights.clickable(table.highlights.role(key)):
		shape = Input.CURSOR_POINTING_HAND
	elif aiming:
		shape = Input.CURSOR_CROSS
	if shape != _cursor:
		_cursor = shape
		Input.set_default_cursor_shape(shape as Input.CursorShape)
