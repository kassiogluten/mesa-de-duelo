# Tela da partida: liga o servidor, a mesa 3D, o HUD e as perguntas, e transforma cliques em mensagens com o `gen`.
class_name MatchScreen
extends Node

## A partida acabou ou o jogador saiu: volta à tela inicial.
signal finished

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")
const UpdateState := preload("res://boot/update_state.gd")

## O pedido de partida ({type:"start", ...}) que a tela manda ao conectar.
var start_message: Dictionary = {}

var _client: ForgeClient = ForgeClient.new()
var _catalog: CardCatalog
var _table: TableView
var _hud: Hud
var _stack: StackPanel
var _question: QuestionDialog
var _zones: ZoneViewer
var _room: RoomPanel
var _fx: FxDirector
var _finale_done: bool = false
var _state: Dictionary = {}
var _selected_blocker: int = -1
## O gen do pedido em que já se mandou um clique de carta: os cliques repetidos antes do estado novo são ignorados.
var _clicked_gen: int = -1
## MESA_AUTOJOGAR=1: joga sozinho (terrenos, depois mágicas, senão OK), só para testar e tirar prints da mesa cheia.
var _autoplay: bool = OS.get_environment("MESA_AUTOJOGAR") == "1"
var _autoplay_wait: float = 0.0
var _autoplay_gen: int = -1
var _autoplay_tries: int = 0


func _ready() -> void:
	_catalog = CardCatalog.new()
	add_child(_catalog)
	_table = TableView.new()
	_table.catalog = _catalog
	add_child(_table)
	_fx = FxDirector.new()
	_fx.table = _table
	_fx.sounds = Sounds.new()
	_fx.add_child(_fx.sounds)
	_fx.mood = TableMood.new()
	_fx.add_child(_fx.mood)
	_fx.mood.attach(_table)
	add_child(_fx)
	var layer := CanvasLayer.new()
	add_child(layer)
	# A pilha antes do HUD: a tela do fim do jogo e as perguntas ficam por cima dela.
	_stack = StackPanel.new()
	_stack.catalog = _catalog
	layer.add_child(_stack)
	_stack.action.connect(func(message: Dictionary) -> void: _client.send(message))
	_stack.preview.connect(func(tex: Texture2D) -> void: _hud.show_preview(tex))
	_stack.layout_changed.connect(func() -> void:
		if not _state.is_empty():
			_table.apply_state(_state))
	_table.stack_slot = _stack.layer_rect
	_hud = Hud.new()
	_hud.catalog = _catalog
	layer.add_child(_hud)
	_fx.hud = _hud
	_zones = ZoneViewer.new()
	_zones.catalog = _catalog
	layer.add_child(_zones)
	_zones.action.connect(func(message: Dictionary) -> void: _client.send(message))
	_hud.zone_requested.connect(open_zone)
	_question = QuestionDialog.new()
	_question.catalog = _catalog
	layer.add_child(_question)
	_room = RoomPanel.new()
	layer.add_child(_room)
	_room.action.connect(func(message: Dictionary) -> void: _client.send(message))
	_room.leave_pressed.connect(_leave)

	_catalog.info_ready.connect(func(_names: PackedStringArray) -> void:
		_table.refresh_textures()
		if not _state.is_empty():
			_table.apply_state(_state))
	_catalog.texture_ready.connect(_table.on_texture_ready)
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	_table.card_clicked.connect(_on_card_clicked)
	_table.card_hovered.connect(_on_card_hovered)
	_hud.action.connect(func(message: Dictionary) -> void: _client.send(message))
	_hud.pass_level_changed.connect(_save_pass_level)
	_hud.player_clicked.connect(_on_player_clicked)
	_hud.leave_pressed.connect(_leave)
	# Opções do menu da partida: valem na hora, sem sair da mesa.
	_hud.effects_changed.connect(func(level: String) -> void:
		_fx.automatic = level == "auto"
		Fx.quality = {"alto": 2, "medio": 1, "leve": 0}.get(level, 2))
	_hud.volume_changed.connect(func(volume: float) -> void: _fx.sounds.volume = volume)
	_question.answered.connect(func(message: Dictionary) -> void: _client.send(message))

	_client.client_version = UpdateState.current_version()
	_client.connected.connect(func() -> void: _client.send(start_message))
	_client.message.connect(_on_message)
	_client.disconnected.connect(func(_code: int, _reason: String, retry: bool) -> void:
		_hud.show_toast("A conexão com o servidor caiu. Tentando voltar…" if retry else "A conexão com o servidor caiu."))
	_client.reconnected.connect(func() -> void: _hud.show_toast("De volta à partida."))
	_client.gave_up.connect(func(reason: String) -> void: _hud.show_toast(reason if reason != "" else "Não foi possível voltar à partida."))
	_client.connect_to(GameConfig.forge_url())


## O último estado recebido do servidor.
func current_state() -> Dictionary:
	return _state


## Abre a janela de uma zona do jogador: "graveyard", "exile", "command", "hand" (mão revelada) ou "damage" (dano de
## comandante). Os selos do retrato já chamam; o clique nos montes 3D pode chamar com SeatInfo.owner_zone(estado, id).
func open_zone(player_id: int, zone: String) -> void:
	_zones.apply_state(_state)
	_zones.open_zone(player_id, zone)


func _process(delta: float) -> void:
	_client.poll()
	if _autoplay:
		_autoplay_wait -= delta
		if _autoplay_wait <= 0.0:
			_autoplay_wait = 0.7
			_autoplay_step()


func _autoplay_step() -> void:
	if _state.is_empty() or bool(_state.get("gameOver", false)):
		return
	var input: Dictionary = _input_data()
	var gen: int = int(input.get("gen", 0))
	_autoplay_tries = _autoplay_tries + 1 if gen == _autoplay_gen else 0
	_autoplay_gen = gen
	var question: Variant = _state.get("question")
	if question is Dictionary:
		var q: Dictionary = question
		var reply: Dictionary = {"type": "answer", "id": q["id"], "indices": [0]}
		if q.get("kind") == "order":
			reply["indices"] = range((q.get("options", []) as Array).size())
		elif q.get("kind") == "confirm":
			reply = {"type": "answer", "id": q["id"], "value": true}
		elif q.get("kind") in ["number", "amount", "text", "reveal"]:
			reply = {"type": "answer", "id": q["id"], "number": int(q.get("min", 0)), "indices": [], "text": ""}
		_client.send(reply)
		return
	var selectable: Array = input.get("selectable", [])
	if not selectable.is_empty() and _autoplay_tries < 2:
		_client.send({"type": "card", "id": int(selectable[0]), "gen": gen})
		return
	var players: Array = input.get("selectablePlayers", [])
	if not players.is_empty() and _autoplay_tries < 2:
		_client.send({"type": "player", "id": int(players[-1]), "gen": gen})
		return
	var actionable: Array = input.get("actionable", [])
	if _autoplay_tries == 0 and not actionable.is_empty() and not input.has("blocking"):
		var pick: int = int(actionable[0])
		for id: Variant in actionable:
			if bool(_table.card_data(int(id)).get("land", false)):
				pick = int(id)
		_client.send({"type": "card", "id": pick, "gen": gen})
		return
	var primary: Dictionary = _hud.primary_message()
	if not primary.is_empty():
		_client.send(primary)


func _unhandled_input(event: InputEvent) -> void:
	# Espaço aperta o botão principal da caixa de ação, como na mesa do navegador.
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_SPACE:
		# Com a janela de uma zona aberta, o espaço não passa a prioridade sem querer.
		if _zones.is_open():
			return
		var message: Dictionary = _hud.primary_message()
		if not message.is_empty():
			_client.send(message)


func _on_message(msg: Dictionary) -> void:
	match Txt.of(msg.get("type", "")):
		"room":
			_room.show_room(msg.get("room", {}) if msg.get("room") is Dictionary else {})
			_hud.set_room(msg.get("room", {}) if msg.get("room") is Dictionary else {})
		"state":
			_room.visible = false
			if _state.is_empty():
				_restore_pass_level(msg)
			_state = msg
			_selected_blocker = -1 if not (msg.get("input", {}) as Dictionary).has("blocking") else _selected_blocker
			_fx.before_state(msg)
			_table.apply_state(msg)
			_stack.apply_state(msg)
			_play_finale(msg)
			_hud.apply_state(msg, _blocker_name())
			_zones.apply_state(msg)
			_question.show_question(msg.get("question", {}) if msg.get("question") is Dictionary else {})
			_refresh_highlights()
			_probe_click.call_deferred()
		"error":
			_hud.show_toast(Txt.of(msg.get("text", "")))
			# Recusado antes de começar (código errado, sala cheia): volta ao início depois de mostrar o aviso.
			if _state.is_empty() and not _room.visible:
				get_tree().create_timer(3.0).timeout.connect(_leave)
		"toast":
			_hud.show_toast(Txt.of(msg.get("text", "")))
		"gone":
			_hud.show_toast(Txt.of(msg.get("text", "A partida acabou.")))


## No fim da partida, a cena final (uma vez por jogo): fogos na vitória, brasas na derrota.
func _play_finale(state: Dictionary) -> void:
	if not bool(state.get("gameOver", false)):
		_finale_done = false
		return
	if _finale_done:
		return
	_finale_done = true
	var me: String = ""
	for p: Variant in state.get("players", []):
		if (p as Dictionary).get("id") == state.get("you"):
			me = Txt.of((p as Dictionary).get("name"))
	_fx.game_over(Txt.of(state.get("winner")) == me)


## O nome da criatura escolhida para bloquear (para a caixa de ação pedir o atacante).
func _blocker_name() -> String:
	if _selected_blocker < 0:
		return ""
	return _catalog.label(Txt.of(_table.card_data(_selected_blocker).get("name")))


## Guarda o nível de passar escolhido para as próximas partidas.
func _save_pass_level(level: String) -> void:
	Prefs.save("passLevel", level)


## No começo da partida, manda o nível de passar guardado (se for outro que o do servidor).
func _restore_pass_level(state: Dictionary) -> void:
	var level: String = Txt.of(Prefs.load_all().get("passLevel"))
	var current: String = Txt.of(ShortInstruction.dig(state, "preferences", "passLevel"))
	if level != "" and level != current:
		_client.send({"type": "preferences", "passLevel": level})


func _input_data() -> Dictionary:
	return _state.get("input", {}) if _state.get("input") is Dictionary else {}


func _send_input(kind: String) -> void:
	var input: Dictionary = _input_data()
	var button: Dictionary = input.get(kind, {}) if input.get(kind) is Dictionary else {}
	if not bool(button.get("enabled", false)):
		return
	_client.send({"type": kind, "gen": int(input.get("gen", 0))})


## MESA_TESTE_CLIQUE=1: com a prioridade e uma carta da mão para jogar, move o mouse até ela, espera e clica, pelo
## caminho real do motor (Input.parse_input_event), para conferir que o clique na mão chega ao servidor.
var _probe_done: bool = false


func _probe_click() -> void:
	if _probe_done or OS.get_environment("MESA_TESTE_CLIQUE") != "1":
		return
	var input: Dictionary = _input_data()
	if input.get("opening") == "mulligan" and _hud.primary_message().size() > 0:
		_client.send(_hud.primary_message())
		return
	var hand: Array = []
	for p: Variant in _state.get("players", []):
		if (p as Dictionary).get("id") == _state.get("you"):
			hand = ((p as Dictionary).get("hand", []) as Array).map(func(c: Dictionary) -> int: return int(c["id"]))
	var target: int = -1
	for id: Variant in input.get("actionable", []):
		if hand.has(int(id)):
			target = int(id)
	if target < 0 or not bool(input.get("priority", false)):
		return
	_probe_done = true
	# A mesa desenha em 1920x1080 e a janela pode ter outro tamanho: o evento vai em coordenadas da janela.
	var screen: Vector2 = get_viewport().get_final_transform() * _table.camera.unproject_position(_table.card_node(target).global_position)
	print("TESTE: clicando na carta %d da mão em %s" % [target, screen])
	var move := InputEventMouseMotion.new()
	move.position = screen
	move.global_position = screen
	Input.parse_input_event(move)
	await get_tree().create_timer(0.8).timeout
	for pressed: bool in [true, false]:
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = pressed
		click.position = screen
		click.global_position = screen
		Input.parse_input_event(click)
		await get_tree().create_timer(0.1).timeout


func _on_card_clicked(node: CardNode) -> void:
	if OS.get_environment("MESA_LOG_ENVIO") == "1":
		print("CLIQUE na carta %d (zona %s)" % [node.card_id, _table.zone_of(node.card_id)])
	var input: Dictionary = _input_data()
	if _open_pile(node, input):
		return
	var gen: int = int(input.get("gen", 0))
	if gen == _clicked_gen:
		return
	var stack_id: int = int(node.data.get("stackId", -1))
	if stack_id >= 0 and (input.get("selectableStacks", []) as Array).has(stack_id):
		_clicked_gen = gen
		_client.send({"type": "stack", "id": stack_id, "gen": gen})
		return
	var id: int = node.card_id
	if id < 0:
		return
	if input.get("blocking") is Dictionary:
		_block_click(id, input["blocking"], gen)
		return
	for list: String in ["selectable", "actionable", "untappable", "manaOnly"]:
		if (input.get(list, []) as Array).has(id):
			_clicked_gen = gen
			_client.send({"type": "card", "id": id, "gen": gen})
			return


## Carta de cemitério, exílio ou zona de comando que não é uma escolha agora: abre a janela daquela zona.
func _open_pile(node: CardNode, input: Dictionary) -> bool:
	if not ["graveyard", "exile", "command"].has(_table.zone_of(node.card_id)):
		return false
	for list: String in ["selectable", "actionable", "untappable", "manaOnly"]:
		if (input.get(list, []) as Array).has(node.card_id):
			return false
	var where: Dictionary = SeatInfo.owner_zone(_state, node.card_id)
	if where.is_empty():
		return false
	open_zone(int(where["player"]), Txt.of(where["zone"]))
	return true


## Bloqueio: escolhe a sua criatura e depois o atacante (direto, se ela só pode bloquear um).
func _block_click(id: int, blocking: Dictionary, gen: int) -> void:
	var legal: Dictionary = {}
	for raw: Variant in blocking.get("legalAssignments", []):
		legal[int((raw as Dictionary)["blocker"])] = (raw as Dictionary).get("attackers", [])
	if legal.has(id):
		var targets: Array = legal[id]
		if targets.size() == 1:
			_client.send({"type": "block", "blocker": id, "attacker": int(targets[0]), "gen": gen})
		else:
			_selected_blocker = id
			_refresh_highlights()
			_hud.apply_state(_state, _blocker_name())
		return
	if _selected_blocker >= 0 and (legal.get(_selected_blocker, []) as Array).has(id):
		_client.send({"type": "block", "blocker": _selected_blocker, "attacker": id, "gen": gen})
		_selected_blocker = -1


func _on_player_clicked(player_id: int) -> void:
	var input: Dictionary = _input_data()
	if (input.get("selectablePlayers", []) as Array).has(player_id):
		_client.send({"type": "player", "id": player_id, "gen": int(input.get("gen", 0))})


func _on_card_hovered(node: CardNode, on: bool) -> void:
	var visible_face: bool = not node.data.is_empty() and not bool(node.data.get("faceDown", false))
	_hud.show_preview(_catalog.texture(node.image_url) if on and visible_face and node.image_url != "" else null)


func _refresh_highlights() -> void:
	var input: Dictionary = _input_data()
	var selectable: Array = input.get("selectable", []).duplicate()
	var selected: Array = []
	var selection: Variant = input.get("selection")
	if selection is Dictionary:
		selected = (selection as Dictionary).get("cards", [])
	var actionable: Array = input.get("actionable", [])
	var blocking: Variant = input.get("blocking")
	if blocking is Dictionary:
		for raw: Variant in (blocking as Dictionary).get("legalAssignments", []):
			selectable.append(int((raw as Dictionary)["blocker"]))
		if _selected_blocker >= 0:
			selected = [_selected_blocker]
			for raw: Variant in (blocking as Dictionary).get("legalAssignments", []):
				if int((raw as Dictionary)["blocker"]) == _selected_blocker:
					selectable = (raw as Dictionary).get("attackers", []).duplicate()
	var choosing: bool = not bool(input.get("priority", false)) and not selectable.is_empty()
	_table.highlight(actionable, selectable, selected, choosing, input.get("selectableStacks", []))
	_table.set_arrows(_arrows())


## Setas: ataque (vermelho) e bloqueio (azul) do combate, os alvos sendo escolhidos (dourado) e os do topo da pilha.
func _arrows() -> Array:
	var out: Array = []
	for raw: Variant in _state.get("combat", []):
		var entry: Dictionary = raw
		var attacker: int = int(entry.get("attacker", -1))
		if entry.get("defender") != null:
			var to: Variant = "player:%d" % int(entry["defender"]) if entry.get("defenderKind", "player") == "player" else int(entry["defender"])
			out.append({"from": attacker, "to": to, "color": Color(1.0, 0.35, 0.25)})
		for blocker: Variant in entry.get("blockers", []):
			out.append({"from": int(blocker), "to": attacker, "color": Color(0.35, 0.7, 1.0)})
	var targeting: Variant = _input_data().get("targeting")
	if targeting is Dictionary:
		_target_arrows(out, (targeting as Dictionary).get("source"), targeting)
	var stack: Array = _state.get("stack", [])
	if not stack.is_empty() and (stack[0] as Dictionary).get("targets") is Dictionary:
		var top: Dictionary = stack[0]
		var source: Variant = (top.get("source") as Dictionary).get("id") if top.get("source") is Dictionary else null
		if Txt.of(top.get("kind", "spell")) != "spell":
			source = "stack:%d" % int(top["id"])
		_target_arrows(out, source, top["targets"])
	return out


func _target_arrows(out: Array, source: Variant, targets: Dictionary) -> void:
	if source == null:
		return
	var from: Variant = int(source) if source is float or source is int else source
	for id: Variant in targets.get("cards", []):
		out.append({"from": from, "to": int(id), "color": Color(1.0, 0.82, 0.3)})
	for id: Variant in targets.get("players", []):
		out.append({"from": from, "to": "player:%d" % int(id), "color": Color(1.0, 0.82, 0.3)})


func _leave() -> void:
	if not _state.is_empty() and not bool(_state.get("gameOver", false)):
		_client.send({"type": "concede"})
	_client.send({"type": "leave"})
	_client.forget_session()
	_client.close()
	finished.emit()
