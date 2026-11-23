# Tela da partida: liga o servidor, a mesa 3D, o HUD e as perguntas; os cliques e atalhos que mexem na jogada passam
# pela TableInteraction (match/table_interaction.gd), que os transforma em mensagens com o `gen`.
class_name MatchScreen
extends Node

## A partida acabou ou o jogador saiu: volta à tela inicial.
signal finished

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")
const UpdateState := preload("res://boot/update_state.gd")

## O pedido de partida ({type:"start", ...}) que a tela manda ao conectar.
var start_message: Dictionary = {}
## Sem servidor (a ferramenta de prints monta a partida com estados prontos, tools/preview_interactions.gd).
var offline: bool = false

var _client: ForgeClient = ForgeClient.new()
var _catalog: CardCatalog
var _table: TableView
var _hud: Hud
var _stack: StackPanel
var _question: QuestionDialog
var _zones: ZoneViewer
var _room: RoomPanel
var _fx: FxDirector
var _inspector: CardInspector
var _drag: HandDrag
var _interaction: TableInteraction
var _help: ShortcutsHelp
## A carta sob o mouse (a que o clique direito e o "I" abrem no inspetor).
var _hovered: CardNode
var _finale_done: bool = false
var _state: Dictionary = {}
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
	_stack.preview.connect(func(tex: Texture2D) -> void: _inspector.show_texture(tex))
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
	_inspector = CardInspector.new()
	_inspector.catalog = _catalog
	layer.add_child(_inspector)
	_catalog.texture_ready.connect(_inspector.on_texture_ready)
	_help = ShortcutsHelp.new()
	layer.add_child(_help)
	_drag = HandDrag.new()
	_drag.table = _table
	_drag.state = current_state
	add_child(_drag)
	_interaction = TableInteraction.new()
	_interaction.table = _table
	_interaction.hud = _hud
	_interaction.drag = _drag
	_interaction.state = current_state
	_interaction.label = func(name: String) -> String: return _catalog.label(name)
	add_child(_interaction)
	_interaction.send.connect(func(message: Dictionary) -> void:
		_inspector.hide_preview(true)
		_client.send(message))
	_interaction.notice.connect(func(text: String) -> void: _hud.show_toast(text))
	_interaction.zone_requested.connect(open_zone)
	_interaction.blocker_changed.connect(func() -> void:
		if not _state.is_empty():
			_hud.apply_state(_state, _interaction.blocker_name()))
	_drag.tapped.connect(_interaction.click_card)
	_drag.started.connect(func() -> void: _inspector.hide_preview(true))
	_drag.play.connect(func(message: Dictionary) -> void: _interaction.send_once(message))

	_catalog.info_ready.connect(func(_names: PackedStringArray) -> void:
		_table.refresh_textures()
		if not _state.is_empty():
			_table.apply_state(_state))
	_catalog.texture_ready.connect(_table.on_texture_ready)
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	_table.card_clicked.connect(func(node: CardNode) -> void:
		_inspector.hide_preview(true)
		_interaction.card_pressed(node))
	_table.card_hovered.connect(_on_card_hovered)
	_hud.action.connect(func(message: Dictionary) -> void: _client.send(message))
	_hud.pass_level_changed.connect(_save_pass_level)
	_hud.player_clicked.connect(func(id: int) -> void: _interaction.player_clicked(id))
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
	if not offline:
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
	# Clique direito: com uma escolha em andamento (bloqueador, atacantes marcados, alvo do Tab), desfaz a escolha; senão
	# abre a carta sob o mouse de perto (Esc ou "I" fecham, no inspetor).
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_RIGHT:
		if _interaction.cancel_pending():
			get_viewport().set_input_as_handled()
		elif is_instance_valid(_hovered) and not _drag.active():
			_inspector.open(_hovered.data, _inspect_context(), _hovered.image_url)
			get_viewport().set_input_as_handled()
		return
	var action: String = KeyMap.action(event)
	if action == "":
		return
	if action == "help" or (action == "cancel" and _help.visible):
		_help.visible = action == "help" and not _help.visible
		get_viewport().set_input_as_handled()
		return
	if action == "inspect":
		if is_instance_valid(_hovered) and not _drag.active():
			_inspector.open(_hovered.data, _inspect_context(), _hovered.image_url)
			get_viewport().set_input_as_handled()
		return
	# Com a janela de uma zona aberta, o Espaço e o Enter não passam a prioridade sem querer.
	if action in ["primary", "confirm"] and _zones.is_open():
		return
	if _interaction.handle_key(action):
		get_viewport().set_input_as_handled()


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
			_interaction.blocks.sync(msg)
			_fx.before_state(msg)
			_drag.before_state(msg)
			_table.apply_state(msg)
			_stack.apply_state(msg)
			_play_finale(msg)
			_hud.apply_state(msg, _interaction.blocker_name())
			_zones.apply_state(msg)
			_question.show_question(msg.get("question", {}) if msg.get("question") is Dictionary else {})
			_interaction.apply_state(msg)
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


## MESA_TESTE_CLIQUE=1: com a prioridade e uma carta da mão para jogar, move o mouse até ela, espera e clica, pelo
## caminho real do motor (Input.parse_input_event), para conferir que o clique na mão chega ao servidor.
var _probe_done: bool = false


func _probe_click() -> void:
	if _probe_done or OS.get_environment("MESA_TESTE_CLIQUE") != "1":
		return
	var input: Dictionary = _input_data()
	if input.get("opening") in ["mulligan", "play-draw", "starting-player"] and _hud.primary_message().size() > 0:
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
	# A carta acabada de comprar ainda está voando do grimório: espera ela chegar na mão.
	await get_tree().create_timer(HandMotion.ARRIVE_TIME + 0.4).timeout
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


## A carta sob o mouse: a prévia grande ao lado dele (fora do arrasto). A da sua mão não tem prévia: ela mesma sobe e
## cresce até o tamanho da prévia, e outra carta ao lado só cobriria as vizinhas.
func _on_card_hovered(node: CardNode, on: bool) -> void:
	if on:
		_hovered = node
	elif _hovered == node:
		_hovered = null
	var in_hand: bool = node.card_id >= 0 and _table.zone_of(node.card_id) == "hand"
	if on and not _drag.active() and not node.data.is_empty() and not in_hand:
		_inspector.show_preview(node.data, _inspect_context(), node.image_url)
	elif not on:
		_inspector.hide_preview()


## Para o inspetor montar os textos: nomes em português, dos jogadores e das outras cartas da mesa.
func _inspect_context() -> Dictionary:
	var names: Dictionary = {}
	for raw: Variant in _state.get("players", []):
		names[int((raw as Dictionary)["id"])] = Txt.of((raw as Dictionary).get("name"))
	var you: int = int(_state.get("you", -1))
	return {
		"lookup": _catalog.info,
		"you": you,
		"player_name": func(id: int) -> String: return "você" if id == you else Txt.of(names.get(id, "Jogador %d" % id)),
		"card_name": func(id: int) -> String:
			var card: Dictionary = _table.card_data(id)
			return _catalog.label(Txt.of(card.get("name"))) if Txt.of(card.get("name")) != "" else "",
	}


func _leave() -> void:
	if not _state.is_empty() and not bool(_state.get("gameOver", false)):
		_client.send({"type": "concede"})
	_client.send({"type": "leave"})
	_client.forget_session()
	_client.close()
	finished.emit()
