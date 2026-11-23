# Laboratório de efeitos: uma mesa montada sem servidor, com um botão por efeito e câmera lenta, para ver e medir cada um.
class_name EffectsLab
extends Node

signal finished

## Cartas da mesa de teste: id → [nome, custo, tipo, criatura, terreno, poder, resistência, dono].
const CARDS := {
	101: ["Serra Angel", "{3}{W}{W}", "Creature — Angel", true, false, 4, 4, 0],
	102: ["Llanowar Elves", "{G}", "Creature — Elf Druid", true, false, 1, 1, 0],
	103: ["Grizzly Bears", "{1}{G}", "Creature — Bear", true, false, 2, 2, 0],
	104: ["Plains", "", "Basic Land — Plains", false, true, 0, 0, 0],
	105: ["Forest", "", "Basic Land — Forest", false, true, 0, 0, 0],
	106: ["Forest", "", "Basic Land — Forest", false, true, 0, 0, 0],
	201: ["Shivan Dragon", "{4}{R}{R}", "Creature — Dragon", true, false, 5, 5, 1],
	202: ["Goblin Guide", "{R}", "Creature — Goblin Scout", true, false, 2, 2, 1],
	203: ["Mountain", "", "Basic Land — Mountain", false, true, 0, 0, 1],
	204: ["Mountain", "", "Basic Land — Mountain", false, true, 0, 0, 1],
	111: ["Giant Growth", "{G}", "Instant", false, false, 0, 0, 0],
	112: ["Isamaru, Hound of Konda", "{W}", "Legendary Creature — Dog", true, false, 2, 2, 0],
	113: ["Swords to Plowshares", "{W}", "Instant", false, false, 0, 0, 0],
	301: ["Lightning Bolt", "{R}", "Instant", false, false, 0, 0, 1],
}
const BATTLEFIELD := [101, 102, 103, 104, 105, 106, 201, 202, 203, 204]
const HAND := [111, 112, 113]

var _field: Array = BATTLEFIELD.duplicate()
var _hand: Array = HAND.duplicate()

var _catalog: CardCatalog
var _table: TableView
var _fx: FxDirector
var _hud: Hud
var _seq: int = 0
var _absent: Array = []
var _stack: bool = false


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
	_hud = Hud.new()
	_hud.catalog = _catalog
	layer.add_child(_hud)
	_fx.hud = _hud
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	_catalog.texture_ready.connect(_table.on_texture_ready)
	layer.add_child(_panel())
	_rebuild()


func _panel() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.04, 0.05, 0.09, 0.85), 14))
	panel.position = Vector2(20, 100)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(250, 760)
	panel.add_child(scroll)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	scroll.add_child(column)
	var title := Hud._label(22, Hud.GOLD)
	title.text = "Laboratório de efeitos"
	column.add_child(title)
	for entry: Array in [
		["Dano de mágica", _spell_damage], ["Golpe de combate", _combat_hit], ["Golpe enorme (12)", _big_hit],
		["Ganho de vida", _life_gain], ["Mágica conjurada", _cast], ["Habilidade", _ability.bind(false)], ["Gatilho", _ability.bind(true)],
		["Entrada", _enter.bind(103)], ["Entrada lendária", _enter.bind(112)], ["Destruída", _leave.bind(202, "Graveyard", "destroyed")],
		["Sacrificada", _leave.bind(102, "Graveyard", "sacrificed")], ["Exilada", _leave.bind(201, "Exile", "")],
		["Ataque", _attack], ["Bloqueio", _block], ["Marcadores +1/+1", _counters], ["Anulada", _countered],
		["Indestrutível", _survived], ["Limpa-campo", _wrath],
		["Primeiro sangue", _first_blood], ["Golpe de comandante", _commander_hit], ["Moeda", _simple.bind({"type": "coin", "heads": true})], ["Dado", _simple.bind({"type": "die", "sides": 20, "result": 17})],
		["Quem começa", _simple.bind({"type": "starting-roll", "actor": 0, "rolls": [[{"player": 0, "roll": 4}, {"player": 1, "roll": 4}], [{"player": 0, "roll": 6}, {"player": 1, "roll": 2}]]})],
		["Seu turno", _simple.bind({"type": "turn", "actor": 0, "turn": 6})], ["Vitória", func() -> void: _fx.game_over(true)],
		["Derrota", func() -> void: _fx.game_over(false)], ["Remontar mesa", _reset],
	]:
		var button := Hud._button(Txt.of(entry[0]), false)
		button.custom_minimum_size = Vector2(220, 40)
		button.add_theme_font_size_override("font_size", 16)
		button.pressed.connect(entry[1])
		column.add_child(button)
	var speed := Hud._label(18, Color(1, 1, 1, 0.8))
	speed.text = "Velocidade"
	column.add_child(speed)
	var speeds := HBoxContainer.new()
	for pair: Array in [["1×", 1.0], ["¼×", 0.25], ["1/10×", 0.1]]:
		var button := Hud._button(Txt.of(pair[0]), false)
		button.custom_minimum_size = Vector2(70, 38)
		var scale: float = pair[1]
		button.pressed.connect(func() -> void: Engine.time_scale = scale)
		speeds.add_child(button)
	column.add_child(speeds)
	var back := Hud._button("Voltar", true)
	back.pressed.connect(func() -> void:
		Engine.time_scale = 1.0
		finished.emit())
	column.add_child(back)
	return panel


## Aperta o botão com esse nome (MESA_LAB, para os prints).
func press(button_name: String) -> void:
	for node: Node in find_children("*", "Button", true, false):
		if (node as Button).text == button_name:
			(node as Button).pressed.emit()


func _card(id: int) -> Dictionary:
	var c: Array = CARDS[id]
	return {"id": id, "name": c[0], "manaCost": c[1], "typeLine": c[2], "creature": c[3], "land": c[4], "power": c[5], "toughness": c[6],
		"basePower": c[5], "baseToughness": c[6], "tapped": false, "controller": c[7], "damage": 0}


func _state(events: Array = []) -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var field: Array = []
		for id: Variant in _field:
			if int((CARDS[id] as Array)[7]) == pid and not _absent.has(id):
				field.append(_card(id))
		var hand: Array = []
		if pid == 0:
			for id: Variant in _hand:
				if not _absent.has(id):
					hand.append(_card(id))
		players.append({"id": pid, "name": "Você" if pid == 0 else "Oponente", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": hand.size() if pid == 0 else 4, "hand": hand, "battlefield": field, "graveyard": [], "exile": []})
	var stack: Array = []
	if _stack:
		stack.append({"id": 900, "text": "Lightning Bolt", "kind": "spell", "controller": 1, "source": _card(301)})
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": stack, "combat": [],
		"input": {"gen": 1, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": []}, "events": events, "gameOver": false}


func _rebuild(events: Array = []) -> void:
	var state: Dictionary = _state(events)
	_fx.before_state(state)
	_table.apply_state(state)
	_hud.apply_state(state)


func _event(data: Dictionary) -> Dictionary:
	_seq += 1
	var event: Dictionary = data.duplicate()
	event["seq"] = _seq
	return event


func _reset() -> void:
	_absent = []
	_stack = false
	_field = BATTLEFIELD.duplicate()
	_hand = HAND.duplicate()
	_rebuild()


# — Efeitos —

func _spell_damage() -> void:
	_stack = true
	_rebuild()
	await get_tree().create_timer(0.4).timeout
	_rebuild([_event({"type": "damage", "card": _card(301), "sourceId": 301, "targets": {"cards": [101]}, "delta": -3})])


func _combat_hit() -> void:
	_rebuild([_event({"type": "damage", "combat": true, "card": _card(202), "sourceId": 202, "targets": {"players": [0]}, "delta": -2}),
		_event({"type": "life-changed", "actor": 0, "delta": -2})])


func _big_hit() -> void:
	_rebuild([_event({"type": "damage", "combat": true, "card": _card(201), "sourceId": 201, "targets": {"players": [0]}, "delta": -12, "lethal": true})])


func _life_gain() -> void:
	_rebuild([_event({"type": "life-changed", "actor": 0, "delta": 4})])


func _cast() -> void:
	_stack = true
	_rebuild([_event({"type": "spell-cast", "card": _card(301), "actor": 1, "stackId": 900})])


func _ability(trigger: bool) -> void:
	_rebuild([_event({"type": "ability-activated", "card": _card(102), "sourceId": 102, "trigger": trigger})])


## Entrada: a carta some do campo (ou sai da mão) e volta com o evento de entrada.
func _enter(id: int) -> void:
	_absent.append(id)
	_rebuild()
	await get_tree().create_timer(0.3).timeout
	_absent.erase(id)
	_hand.erase(id)
	if not _field.has(id):
		_field.append(id)
	_rebuild([_event({"type": "entered", "card": _card(id), "to": "Battlefield"})])


func _leave(id: int, to: String, reason: String) -> void:
	var event: Dictionary = {"type": "left", "card": _card(id), "to": to}
	if reason != "":
		event["reason"] = reason
	_absent.append(id)
	_rebuild([_event(event)])


func _attack() -> void:
	_rebuild([_event({"type": "attackers", "cards": [101, 103], "actor": 0})])


func _block() -> void:
	_rebuild([_event({"type": "blockers", "cards": [202], "actor": 1})])


func _counters() -> void:
	_rebuild([_event({"type": "counters", "sourceId": 103, "counter": "P1P1", "delta": 2})])


func _countered() -> void:
	_stack = true
	_rebuild()
	await get_tree().create_timer(0.3).timeout
	var event: Dictionary = _event({"type": "countered", "card": _card(301), "stackId": 900})
	_stack = false
	_fx.before_state(_state([event]))
	_table.apply_state(_state())


## O primeiro golpe de combate num jogador (o momento só vale uma vez por partida: "Remontar mesa" não o reinicia).
func _first_blood() -> void:
	_rebuild([_event({"type": "damage", "combat": true, "card": _card(202), "sourceId": 202, "targets": {"players": [0]}, "delta": -2})])


## Golpe de comandante, com o total já perto do letal.
func _commander_hit() -> void:
	_rebuild([_event({"type": "damage", "combat": true, "commander": true, "commanderId": 201, "commanderTotal": 16, "card": _card(201), "sourceId": 201, "targets": {"players": [0]}, "delta": -5})])


## Todas as criaturas destruídas de uma vez (o pior caso para os quadros).
func _wrath() -> void:
	var events: Array = []
	for id: Variant in _field.duplicate():
		if bool((CARDS[id] as Array)[3]):
			events.append(_event({"type": "left", "card": _card(id), "to": "Graveyard", "reason": "destroyed"}))
			_absent.append(id)
	_rebuild(events)


func _survived() -> void:
	_rebuild([_event({"type": "survived", "sourceId": 101, "survived": "indestructible"})])


func _simple(data: Dictionary) -> void:
	_rebuild([_event(data)])
