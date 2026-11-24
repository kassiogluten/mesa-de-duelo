# Monta uma mesa sem servidor e salva prints de duas coisas: a remoção do oponente que chega já resolvida (o quadro dela na
# pilha, com a mira no alvo, e depois a criatura saindo) e os selos do valor que a carta conta (Terror Tolariano na mão,
# a devoção de Thassa e o Tarmogoyf no campo, a frase no inspetor).
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_counts.gd -- <modo> <caminho base>
# Modos: remocao (grava -remocao-antes, -remocao-pilha, -remocao-saindo), contagens (-contagens, -contagens-inspetor).
extends SceneTree

const NAMES: PackedStringArray = ["Grizzly Bears", "Murder", "Swamp", "Island", "Forest", "Tolarian Terror", "Thassa, God of the Sea",
	"Tarmogoyf", "Opt", "Counterspell", "Combustion Technique", "Mountain"]

var _base: String = "user://contagens"
var _table: TableView
var _stack: StackPanel
var _hud: Hud
var _catalog: CardCatalog
var _fx: FxDirector
var _queue: StateQueue
var _last: Dictionary = {}
var _id: int = 100


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0] if args.size() > 0 else "remocao"
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
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	_catalog.texture_ready.connect(_table.on_texture_ready)
	_catalog.request(NAMES)
	# A fila de verdade da partida (match/state_queue.gd), com o mesmo jeito de pôr o estado na mesa.
	_queue = StateQueue.new()
	_queue.show = _apply
	root.add_child(_queue)
	await create_timer(1.5).timeout
	for name: String in NAMES:
		_catalog.texture(_catalog.image_url_for({"name": name}))
	if mode == "contagens":
		await _counts()
	else:
		await _removal()
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
	print("%s-%s.png" % [_base, tag])


func _card(name: String, owner: int, extra: Dictionary = {}) -> Dictionary:
	_id += 1
	var card: Dictionary = {"id": _id, "name": name, "controller": owner, "owner": owner, "tapped": false, "token": false, "damage": 0}
	card.merge(extra, true)
	return card


func _lands(n: int, name: String, owner: int, tapped: bool = false) -> Array:
	var out: Array = []
	for i: int in n:
		out.append(_card(name, owner, {"land": true, "tapped": tapped}))
	return out


func _state(mine: Array, theirs: Array, hand: Array, stack: Array, events: Array, active: int = 1) -> Dictionary:
	return {"type": "state", "matchId": "preview", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": active,
		"players": [
			{"id": 0, "seat": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": hand.size(), "hand": hand, "battlefield": mine, "graveyard": [], "exile": []},
			{"id": 1, "seat": 1, "name": "Computador", "life": 20, "sleeve": 2, "library": 40, "handCount": 4, "battlefield": theirs, "graveyard": [], "exile": []}],
		"stack": stack, "combat": [], "events": events, "gameOver": false,
		"input": {"gen": 1, "message": "", "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": [], "actionable": []}}


## O oponente conjura Murder no seu urso e tudo resolve no mesmo estado: a fila mostra o quadro e depois o resultado.
func _removal() -> void:
	var bear: Dictionary = _card("Grizzly Bears", 0, {"creature": true, "power": 2, "toughness": 2, "basePower": 2, "baseToughness": 2})
	var mine: Array = [bear] + _lands(3, "Forest", 0)
	var swamps: Array = _lands(3, "Swamp", 1)
	var hand: Array = [_card("Opt", 0), _card("Counterspell", 0)]
	_queue.receive(_state(mine, swamps, hand, [], []), true)
	await _shot(2.5, "remocao-antes")
	var murder: Dictionary = _card("Murder", 1, {"manaCost": "{1}{B}{B}"})
	var item: Dictionary = {"id": 900, "kind": "spell", "controller": 1, "source": murder, "targets": {"cards": [bear["id"]]},
		"text": "Murder - Destroy target creature."}
	var tapped: Array = _lands(3, "Swamp", 1, true)
	var frame: Dictionary = {"turn": 5, "phase": "MAIN1", "activePlayer": 1, "stack": [item], "combat": [],
		"players": [{"id": 0, "life": 20, "battlefield": mine, "handCount": 2, "library": 40},
			{"id": 1, "life": 20, "battlefield": tapped, "handCount": 3, "library": 40}]}
	var dead: Dictionary = bear.duplicate()
	var events: Array = [
		{"seq": 1, "type": "spell-cast", "actor": 1, "card": murder, "stackId": 900, "targets": {"cards": [bear["id"]]}, "frame": frame},
		{"seq": 2, "type": "resolved", "actor": 1, "card": murder, "stackId": 900},
		{"seq": 3, "type": "left", "card": dead, "from": "Battlefield", "to": "Graveyard", "reason": "destroyed"},
	]
	var after: Dictionary = _state(_lands(3, "Forest", 0), tapped, hand, [], events)
	(after["players"][0] as Dictionary)["graveyard"] = [bear]
	(after["players"][1] as Dictionary)["graveyard"] = [murder]
	(after["players"][1] as Dictionary)["handCount"] = 3
	_queue.receive(after)
	await _shot(1.0, "remocao-pilha")
	await _shot(0.75, "remocao-saindo")
	await create_timer(1.5).timeout


## Os selos do valor que a carta conta: Terror Tolariano na mão (mais barato pelo cemitério), Thassa com a devoção contra
## o mínimo e o Tarmogoyf do oponente com os tipos no cemitério.
func _counts() -> void:
	var terror_count: Dictionary = {"of": "cards", "zone": "graveyard", "whose": "you", "types": ["Instant", "Sorcery"], "qualities": [], "value": 4,
		"uses": [{"use": "costLess", "amount": 4}]}
	var terror: Dictionary = _card("Tolarian Terror", 0, {"manaCost": "{6}{U}", "castCost": {"cost": "{2}{U}", "delta": -4}, "counts": [terror_count]})
	var combustion: Dictionary = _card("Combustion Technique", 0, {"manaCost": "{1}{R}", "counts": [{"of": "cards", "zone": "graveyard", "whose": "you",
		"types": ["Lesson"], "qualities": [], "value": 2, "uses": [{"use": "damage", "amount": 4, "plus": 2}]}]})
	var hand: Array = [terror, combustion, _card("Opt", 0)]
	var thassa: Dictionary = _card("Thassa, God of the Sea", 0, {"keywords": ["INDESTRUCTIBLE"],
		"counts": [{"of": "devotion", "colors": ["U"], "value": 3, "uses": [{"use": "creature", "min": 5}]}]})
	var mine: Array = [thassa] + _lands(4, "Island", 0) + _lands(2, "Mountain", 0)
	var goyf: Dictionary = _card("Tarmogoyf", 1, {"creature": true, "power": 3, "toughness": 4, "basePower": 3, "baseToughness": 4,
		"counts": [{"of": "cards", "zone": "graveyard", "whose": "all", "types": ["Card"], "qualities": [], "measure": "cardTypes", "value": 3,
			"uses": [{"use": "pt", "power": "3", "toughness": "4"}]}]})
	var theirs: Array = [goyf] + _lands(3, "Forest", 1)
	_queue.receive(_state(mine, theirs, hand, [], [], 0), true)
	await _shot(4.0, "contagens")
	var inspector := CardInspector.new()
	inspector.catalog = _catalog
	_hud.get_parent().add_child(inspector)
	inspector.open(terror, {"lookup": _catalog.info, "you": 0, "state": _last, "player_name": func(id: int) -> String: return "você" if id == 0 else "Computador"},
		_catalog.image_url_for(terror))
	await _shot(2.5, "contagens-inspetor")
