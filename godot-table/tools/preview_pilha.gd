# Monta uma mesa sem servidor com o painel da pilha e o HUD e salva prints: a mágica voando até a pilha, a pilha com 2, 3 e
# 5 itens com alvos (e um escolhível), o item sob o mouse aceso na mesa, a galeria, a lealdade, a mágica modal, o Commander
# com quatro jogadores e as telas do fim do jogo.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_pilha.gd -- <modo> <caminho base>
# Modos: pilha (grava -voo, -dois, -entrando, -tres, -responder, -mouse, -galeria, -cinco, -resolvendo, -escolha,
# -lealdade, -modos, -recolhida), commander (-commander, -commander-galeria), fim (-vitoria, -numeros, -derrota, -campo).
extends SceneTree

const NAMES: PackedStringArray = ["Forest", "Mountain", "Island", "Llanowar Elves", "Grizzly Bears", "Shivan Dragon", "Soul Warden",
	"Lightning Bolt", "Counterspell", "Jace Beleren", "Prismari Charm", "Serra Angel", "Fireball"]

var _base: String = "user://pilha"
var _table: TableView
var _stack: StackPanel
var _hud: Hud
var _catalog: CardCatalog
var _fx: FxDirector
var _last: Dictionary = {}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0] if args.size() > 0 else "pilha"
	if args.size() > 1:
		_base = args[1]
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	_fx = FxDirector.new()
	_fx.table = _table
	root.add_child(_fx)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	_stack = StackPanel.new()
	_stack.catalog = _catalog
	layer.add_child(_stack)
	_hud = Hud.new()
	_hud.catalog = _catalog
	layer.add_child(_hud)
	_fx.hud = _hud
	_table.stack_slot = _stack.layer_rect
	_stack.table = _table
	_stack.avoid_rect = _hud.action_rect
	_stack.layout_changed.connect(func() -> void:
		if not _last.is_empty():
			_table.apply_state(_last))
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_stack.preview.connect(_hud.show_preview)
	_stack.action.connect(func(m: Dictionary) -> void: print("ENVIO ", JSON.stringify(m)))
	_hud.action.connect(func(m: Dictionary) -> void: print("ENVIO ", JSON.stringify(m)))
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	_catalog.texture_ready.connect(_table.on_texture_ready)
	_catalog.request(NAMES)
	await create_timer(1.5).timeout
	for name: String in NAMES:
		_catalog.texture(_catalog.image_url_for({"name": name}))
	if mode == "fim":
		await _end_screens()
	elif mode == "commander":
		await _commander_screens()
	else:
		await _stack_screens()
	quit()


func _apply(state: Dictionary) -> void:
	_last = state
	_fx.before_state(state)
	_table.apply_state(state)
	_stack.apply_state(state)
	_hud.apply_state(state)


func _shot(after: float, tag: String) -> void:
	await create_timer(after).timeout
	root.get_texture().get_image().save_png("%s-%s.png" % [_base, tag])


func _stack_screens() -> void:
	var state: Dictionary = _board()
	_apply(state)
	await create_timer(2.5).timeout
	# A sua mágica sai da mão e voa até a pilha.
	var bolt := {"id": 9001, "kind": "spell", "controller": 0, "source": {"id": 150, "name": "Lightning Bolt", "controller": 0},
		"text": "Lightning Bolt - Lightning Bolt deals 3 damage to any target.", "targets": {"players": [1]}}
	state["players"][0]["hand"] = (state["players"][0]["hand"] as Array).slice(1)
	state["stack"] = [bolt]
	state["events"] = [{"seq": 1, "type": "spell-cast", "actor": 0, "stackId": 9001, "card": bolt["source"]}]
	_apply(state)
	await _shot(0.22, "voo")
	await _shot(0.3, "voo-pouso")
	await create_timer(1.0).timeout
	# Um gatilho do oponente entra por cima: dois itens.
	var warden := {"id": 9002, "kind": "trigger", "controller": 1, "source": state["players"][1]["battlefield"][1],
		"text": "Soul Warden (202) - You gain 1 life."}
	state["stack"] = [warden, bolt]
	_apply(state)
	await _shot(1.4, "dois")
	# O mouse no raio da lista: a carta dele acende e a seta vai até o alvo (Ana).
	var bolt_row: Control = _stack.find_child("Row9001", true, false)
	if bolt_row:
		_mouse_at(bolt_row.get_global_rect().get_center())
	await _shot(1.0, "mouse-alvo")
	_mouse_at(Vector2(800, 500))
	# O oponente responde: anula a mágica (a linha do gatilho entra deslizando por cima da lista).
	var counter := {"id": 9003, "kind": "spell", "controller": 1, "source": {"id": 300, "name": "Counterspell", "controller": 1, "manaCost": "{U}{U}"},
		"text": "Counterspell - Counter target spell.", "targets": {"cards": [150]}, "cast": {"mode": "flashback"}}
	state["players"][1]["handCount"] = 3
	state["stack"] = [counter, warden, bolt]
	_apply(state)
	await _shot(0.12, "entrando")
	await _shot(1.3, "tres")
	# A vez é sua e o topo é do oponente: "Você pode responder".
	state["activePlayer"] = 1
	_apply(state)
	await _shot(0.8, "responder")
	# O mouse no raio da lista: a carta dele e o alvo acendem na mesa.
	var row: Control = _stack.find_child("Row9002", true, false)
	if row:
		_mouse_at(row.get_global_rect().get_center())
	await _shot(0.9, "mouse")
	_mouse_at(Vector2(800, 500))
	_stack.open_gallery()
	await _shot(0.9, "galeria")
	_stack.gallery.close()
	await create_timer(0.4).timeout
	# Cinco itens: três camadas por trás do topo e o "+1".
	var extra: Array = [
		{"id": 9004, "kind": "ability", "controller": 0, "source": state["players"][0]["battlefield"][2], "text": "Llanowar Elves - Add {G}."},
		{"id": 9005, "kind": "trigger", "controller": 0, "source": state["players"][0]["battlefield"][3], "text": "Grizzly Bears - Draw a card."},
	]
	state["stack"] = extra + [counter, warden, bolt]
	state["activePlayer"] = 0
	_apply(state)
	await _shot(1.4, "cinco")
	# O topo resolve: o clarão se fecha e a próxima carta sobe.
	state["stack"] = [extra[1], counter, warden, bolt]
	_apply(state)
	await _shot(0.15, "resolvendo")
	await create_timer(1.0).timeout
	state["stack"] = [counter, warden, bolt]
	_apply(state)
	await create_timer(1.0).timeout
	# Escolhendo: a pilha aceita um item como alvo (o raio, embaixo).
	state["input"] = {"gen": 9, "priority": false, "ok": {"label": "", "enabled": false}, "cancel": {"label": "Cancelar", "enabled": true}, "selectable": [], "selectableStacks": [9001]}
	_apply(state)
	_table.highlight([], [], [], true, [9001])
	await _shot(0.8, "escolha")
	# Habilidade de lealdade do Jace, mirando você.
	state["input"] = _priority()
	var jace: Dictionary = state["players"][1]["battlefield"][2]
	state["stack"] = [{"id": 9010, "kind": "ability", "controller": 1, "source": jace, "text": "Jace Beleren - Target player draws a card.",
		"loyalty": {"cost": "-1", "text": "Target player draws a card."}, "targets": {"players": [0]}}]
	_apply(state)
	await _shot(1.4, "lealdade")
	# Mágica modal com o modo escolhido e o X de uma Bola de Fogo embaixo, resolvendo e esperando a sua escolha.
	var charm := {"id": 9020, "kind": "spell", "controller": 1, "resolving": true, "source": {"id": 301, "name": "Prismari Charm", "controller": 1},
		"text": "Prismari Charm - Prismari Charm deals 1 damage to each of one or two targets.", "modes": [{"index": 2, "text": "Prismari Charm deals 1 damage to each of one or two targets."}],
		"targets": {"players": [0], "cards": [102]}}
	var fireball := {"id": 9021, "kind": "spell", "controller": 0, "source": {"id": 151, "name": "Fireball", "controller": 0},
		"text": "Fireball - deals X damage.", "cast": {"x": 5}, "targets": {"players": [1]}}
	state["players"][0]["hand"] = []
	state["stack"] = [charm, fireball]
	state["input"] = {"gen": 11, "priority": false, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false}, "selectable": []}
	_apply(state)
	await _shot(1.4, "modos")
	_stack.collapsed = true
	_apply(state)
	await _shot(0.8, "recolhida")


## Move o mouse de verdade (o hover da lista é o do motor).
func _mouse_at(at: Vector2) -> void:
	var event := InputEventMouseMotion.new()
	var screen: Vector2 = root.get_final_transform() * at
	event.position = screen
	event.global_position = screen
	Input.parse_input_event(event)


## Commander com quatro jogadores: a pilha não cobre o oponente do canto direito nem a caixa de ação.
func _commander_screens() -> void:
	var names: Array = ["Você", "Ana", "Bruno", "Carla"]
	var players: Array = []
	for pid: int in 4:
		var field: Array = []
		for i: int in 3:
			field.append({"id": 100 * (pid + 1) + i, "name": ["Forest", "Llanowar Elves", "Serra Angel"][i], "creature": i > 0, "land": i == 0, "power": 2, "toughness": 2, "tapped": false, "controller": pid})
		players.append({"id": pid, "seat": pid, "name": names[pid], "life": 40, "sleeve": pid + 1, "library": 80, "handCount": 5, "hand": [], "battlefield": field,
			"graveyard": [], "exile": [], "commandZone": [], "commanders": []})
	var state: Dictionary = {"type": "state", "you": 0, "turn": 6, "phase": "MAIN1", "activePlayer": 3, "players": players, "combat": [], "events": [], "gameOver": false,
		"input": _priority(), "stack": [
			{"id": 9101, "kind": "spell", "controller": 3, "source": {"id": 990, "name": "Fireball", "controller": 3}, "text": "Fireball - deals X damage.", "cast": {"x": 4}, "targets": {"players": [0]}},
			{"id": 9102, "kind": "trigger", "controller": 2, "source": players[2]["battlefield"][1], "text": "Llanowar Elves - trigger."},
			{"id": 9103, "kind": "spell", "controller": 1, "source": {"id": 991, "name": "Lightning Bolt", "controller": 1}, "text": "Lightning Bolt deals 3 damage to any target.", "targets": {"cards": [402]}},
		]}
	_apply(state)
	await _shot(3.0, "commander")
	_stack.open_gallery()
	await _shot(0.9, "commander-galeria")


func _priority() -> Dictionary:
	return {"gen": 10, "priority": true, "ok": {"label": "Resolver", "enabled": true}, "cancel": {"label": "", "enabled": false}, "selectable": []}


## Uma mesa pequena: terrenos e criaturas de cada lado, o Jace do oponente e duas cartas na sua mão.
func _board() -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var field: Array = []
		var base: int = 100 + pid * 100
		var entries: Array = [["Forest", false, true], ["Mountain", false, true], ["Llanowar Elves", true, false], ["Grizzly Bears", true, false]] if pid == 0 \
			else [["Island", false, true], ["Soul Warden", true, false], ["Jace Beleren", false, false], ["Shivan Dragon", true, false]]
		for entry: Array in entries:
			base += 1
			field.append({"id": base, "name": entry[0], "creature": entry[1], "land": entry[2], "power": 2, "toughness": 2, "tapped": false, "controller": pid})
		var hand: Array = [{"id": 150, "name": "Lightning Bolt", "controller": 0}, {"id": 151, "name": "Fireball", "controller": 0}] if pid == 0 else []
		players.append({"id": pid, "name": "Você" if pid == 0 else "Ana", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": hand.size() if pid == 0 else 4, "hand": hand, "battlefield": field, "graveyard": [], "exile": []})
	players[1]["battlefield"][1]["id"] = 202
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"events": [], "gameOver": false, "input": _priority()}


func _end_screens() -> void:
	var state: Dictionary = _board()
	state["players"][0]["hand"] = []
	_apply(state)
	await create_timer(1.0).timeout
	# O combate de 7 que virou o jogo e o raio de antes (para o destaque do jogo).
	var bolt := {"id": 150, "name": "Lightning Bolt"}
	var frame := {"stack": [{"id": 9}]}
	state["events"] = [
		{"seq": 1, "type": "turn", "turn": 1},
		{"seq": 2, "type": "spell-cast", "actor": 1, "stackId": 9, "card": bolt, "frame": frame},
		{"seq": 3, "type": "damage", "actor": 1, "delta": -3, "card": bolt, "targets": {"players": [0]}, "frame": frame},
		{"seq": 4, "type": "resolved", "actor": 1, "stackId": 9, "card": bolt},
		{"seq": 5, "type": "damage", "combat": true, "delta": -5, "card": {"name": "Shivan Dragon"}, "targets": {"players": [1]}},
		{"seq": 6, "type": "damage", "combat": true, "delta": -3, "card": {"name": "Grizzly Bears"}, "targets": {"players": [1]}},
		{"seq": 7, "type": "left", "actor": 1, "card": {"name": "Soul Warden"}, "to": "Graveyard"},
	]
	state["gameOver"] = true
	state["winner"] = "Você"
	state["turn"] = 9
	state["players"][0]["life"] = 17
	state["players"][1]["life"] = 0
	state["players"][1]["lossReason"] = "LifeReachedZero"
	state["match"] = {"gameNumber": 1, "wins": [1, 0], "draws": 0, "over": true, "phase": "complete", "gameMs": 754000}
	var life: Array = [[20, 20], [20, 18], [17, 18], [9, 16], [4, 16], [6, 13], [11, 9], [15, 7], [17, 0]]
	state["lifeHistory"] = range(life.size()).map(func(i: int) -> Dictionary: return {"turn": i, "life": {"0": life[i][0], "1": life[i][1]}})
	state["stats"] = {
		"0": {"damage": 23, "combatDamage": 17, "damageTaken": 9, "biggestTurn": 8, "removals": 3, "counters": 1, "kills": 2, "creaturesLost": 1, "attackers": 11, "spells": 9, "abilities": 2, "lands": 6, "draws": 12, "lifeGained": 4, "damageTo": {"1": 23}},
		"1": {"damage": 9, "combatDamage": 6, "damageTaken": 23, "biggestTurn": 4, "removals": 1, "countered": 1, "kills": 1, "creaturesLost": 4, "attackers": 5, "spells": 7, "abilities": 4, "lands": 7, "draws": 11, "damageTo": {"0": 9}},
	}
	_apply(state)
	await _shot(0.35, "entrada")
	await _shot(2.4, "vitoria")
	var result: ResultScreen = _find_result()
	result.call("_toggle_numbers")
	await _shot(0.6, "numeros")
	result.call("_show_table", true)
	await _shot(0.5, "campo")
	result.call("_show_table", false)
	# Derrota por um fio do outro lado: Ana venceu com 1 de vida, e você caiu com dano de comandante.
	state["winner"] = "Ana"
	state["matchId"] = "outra"
	state["players"][0]["life"] = 0
	state["players"][0]["lossReason"] = "CommanderDamage"
	state["players"][0]["commanderDamage"] = [{"commanderId": 204, "damage": 21}]
	state["players"][1]["commanders"] = [{"id": 204, "name": "Shivan Dragon"}]
	state["players"][1]["life"] = 1
	state.erase("lossReason")
	state["players"][1].erase("lossReason")
	state["lifeHistory"] = range(life.size()).map(func(i: int) -> Dictionary: return {"turn": i, "life": {"0": life[i][1], "1": maxi(1, life[i][0] - 8)}})
	result.room = {"seat": 0, "players": [{"name": "Você", "connected": true, "rematch": false}, {"name": "Ana", "connected": true, "rematch": true}]}
	_apply(state)
	await _shot(2.6, "derrota")


func _find_result() -> ResultScreen:
	for child: Node in _hud.get_children():
		if child is ResultScreen:
			return child
	return null
