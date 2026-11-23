# Laboratório de efeitos: uma mesa montada sem servidor, com um botão por efeito e câmera lenta, para ver e medir cada um.
class_name EffectsLab
extends Node

signal finished

## Cartas da mesa de teste: id → [nome, custo, tipo, criatura, terreno, poder, resistência, dono, ficha (opcional)].
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
	302: ["Wrath of God", "{2}{W}{W}", "Sorcery", false, false, 0, 0, 1],
	303: ["Pyroclasm", "{1}{R}", "Sorcery", false, false, 0, 0, 1],
	304: ["Demonic Tutor", "{1}{B}", "Sorcery", false, false, 0, 0, 0],
	305: ["Rancor", "{G}", "Enchantment — Aura", false, false, 0, 0, 0],
	306: ["Atraxa, Praetors' Voice", "{G}{W}{U}{B}", "Legendary Creature — Phyrexian Angel Horror", true, false, 4, 4, 0],
	307: ["Delver of Secrets", "{U}", "Creature — Human Wizard", true, false, 1, 1, 0],
	308: ["Insectile Aberration", "", "Creature — Human Insect", true, false, 3, 2, 0],
	309: ["Squirrel Nest", "{1}{G}", "Creature — Squirrel", true, false, 1, 1, 0],
	601: ["Treasure", "", "Token Artifact — Treasure", false, false, 0, 0, 0, true],
	602: ["Clue", "", "Token Artifact — Clue", false, false, 0, 0, 0, true],
	603: ["Food", "", "Token Artifact — Food", false, false, 0, 0, 0, true],
	604: ["Blood", "", "Token Artifact — Blood", false, false, 0, 0, 0, true],
}
## Raridade de algumas (o foil das raras e míticas aparece só no inspetor, não na mesa).
const RARITY := {201: "mythic", 112: "rare", 306: "mythic", 101: "rare"}
const BATTLEFIELD := [101, 102, 103, 104, 105, 106, 201, 202, 203, 204]
const HAND := [111, 112, 113]

## A mesa de agora (as jogadas mexem nisto e chamam rebuild()).
var field: Array = BATTLEFIELD.duplicate()
var hand: Array = HAND.duplicate()
var absent: Array = []
## A carta na pilha (-1: pilha vazia) e quem a controla.
var stack_card: int = -1
## id → dono trocado (mudar de controle), virada (tapped) e a face nova (transformar: id → id da outra face em CARDS).
var controller: Dictionary = {}
var tapped: Dictionary = {}
var faces: Dictionary = {}
## Monarca, dianteira (id do jogador, -1 ninguém), dia/noite e o formato da partida.
var monarch: int = -1
var initiative: int = -1
var day_time: String = ""
var format: String = ""
## Cartas extras no campo de um jogador (a mesa lotada): jogador → quantos terrenos a mais.
var crowd: Dictionary = {}

var catalog: CardCatalog
var table: TableView
var fx: FxDirector
var hud: Hud
var _seq: int = 0
var _panel_node: Control


func _ready() -> void:
	catalog = CardCatalog.new()
	add_child(catalog)
	table = TableView.new()
	table.catalog = catalog
	add_child(table)
	fx = FxDirector.new()
	fx.table = table
	fx.sounds = Sounds.new()
	fx.add_child(fx.sounds)
	fx.mood = TableMood.new()
	fx.add_child(fx.mood)
	fx.mood.attach(table)
	add_child(fx)
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	hud.catalog = catalog
	layer.add_child(hud)
	fx.hud = hud
	table.player_screen_position = hud.portrait_center
	hud.portrait_slot = table.portrait_slot
	hud.player_count = table.player_count
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: table.refresh_textures())
	catalog.texture_ready.connect(table.on_texture_ready)
	_panel_node = _panel()
	layer.add_child(_panel_node)
	rebuild()
	# MESA_LAB_SERIE=<pasta> e MESA_LAB_BOTOES=<a|b|c>: aperta cada botão, salva um print de cada (MESA_LAB_APOS segundos
	# depois, ou <botão>@<segundos>) e fecha, com o FPS de cada efeito no console (para comparar antes e depois).
	if OS.get_environment("MESA_LAB_SERIE") != "":
		_series.call_deferred(OS.get_environment("MESA_LAB_SERIE"), OS.get_environment("MESA_LAB_BOTOES").split("|", false))


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
	var buttons: Array = [
		["Dano de mágica", _spell_damage], ["Golpe de combate", _combat_hit], ["Golpe enorme (12)", _big_hit],
		["Ganho de vida", _life_gain], ["Mágica conjurada", _cast], ["Habilidade", _ability.bind(false)], ["Gatilho", _ability.bind(true)],
		["Entrada", _enter.bind(103)], ["Entrada lendária", _enter.bind(112)], ["Destruída", _leave.bind(202, "Graveyard", "destroyed")],
		["Sacrificada", _leave.bind(102, "Graveyard", "sacrificed")], ["Exilada", _leave.bind(201, "Exile", "")],
		["Ataque", _attack], ["Bloqueio", _block], ["Marcadores +1/+1", _counters], ["Anulada", _countered],
		["Indestrutível", _survived.bind("indestructible")], ["Regenerada", _survived.bind("regenerated")],
		["Primeiro sangue", _first_blood], ["Golpe de comandante", _commander_hit],
		["Cascata", _cascade], ["Moer 4", _mill], ["Vidência 3", simple.bind({"type": "scry", "actor": 0, "top": 1, "bottom": 2})],
		["Busca no grimório", simple.bind({"type": "draw", "actor": 0, "searched": true})], ["Moeda", simple.bind({"type": "coin", "heads": true})], ["Dado", simple.bind({"type": "die", "sides": 20, "result": 17})],
		["Quem começa", simple.bind({"type": "starting-roll", "actor": 0, "rolls": [[{"player": 0, "roll": 4}, {"player": 1, "roll": 4}], [{"player": 0, "roll": 6}, {"player": 1, "roll": 2}]]})],
		["Seu turno", simple.bind({"type": "turn", "actor": 0, "turn": 6})], ["Vitória", func() -> void: fx.game_over(true)],
		["Derrota", func() -> void: fx.game_over(false)],
	]
	buttons.append_array(LabPlays.buttons(self))
	buttons.append(["Remontar mesa", reset])
	for entry: Array in buttons:
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


## A série de prints: cada botão apertado com a mesa remontada, o print depois de `MESA_LAB_APOS` s e o FPS do trecho.
func _series(folder: String, names: PackedStringArray) -> void:
	_panel_node.visible = false
	var after: float = float(OS.get_environment("MESA_LAB_APOS")) if OS.get_environment("MESA_LAB_APOS") != "" else 0.6
	await get_tree().create_timer(2.5).timeout
	DirAccess.make_dir_recursive_absolute(folder)
	for i: int in names.size():
		var parts: PackedStringArray = names[i].split("@")
		var wait: float = float(parts[1]) if parts.size() > 1 else after
		reset()
		await get_tree().create_timer(0.8).timeout
		var start_frames: int = Engine.get_process_frames()
		var start_ms: int = Time.get_ticks_msec()
		var worst: float = 0.0
		press(parts[0])
		var elapsed: float = 0.0
		while elapsed < wait:
			await get_tree().process_frame
			var delta: float = get_process_delta_time()
			elapsed += delta
			worst = maxf(worst, delta * 1000.0)
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("%s/%02d_%s.png" % [folder, i, parts[0].replace(" ", "_").replace("/", "-")])
		var frames: int = Engine.get_process_frames() - start_frames
		print("SERIE %s: %.0f FPS, pior quadro %.1f ms" % [parts[0], frames * 1000.0 / maxf(Time.get_ticks_msec() - start_ms, 1), worst])
		await get_tree().create_timer(2.0).timeout
	get_tree().quit()


## A carta da mesa de teste, como o servidor a manda (com a face, o dono e a virada de agora).
func card_of(id: int) -> Dictionary:
	var face: int = int(faces.get(id, id))
	var c: Array = CARDS[face]
	return {"id": id, "name": c[0], "manaCost": c[1], "typeLine": c[2], "creature": c[3], "land": c[4], "power": c[5], "toughness": c[6],
		"basePower": c[5], "baseToughness": c[6], "tapped": tapped.has(id), "controller": int(controller.get(id, c[7])), "damage": 0,
		"token": c.size() > 8 and bool(c[8]), "rarity": Txt.of(RARITY.get(face, "common"))}


func _state(events: Array = []) -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		var cards: Array = []
		for id: Variant in field:
			if int(card_of(int(id))["controller"]) == pid and not absent.has(id):
				cards.append(card_of(int(id)))
		for i: int in int(crowd.get(pid, 0)):
			cards.append({"id": 700 + i, "name": "Forest", "manaCost": "", "typeLine": "Basic Land — Forest", "land": true, "tapped": false, "controller": pid})
		var in_hand: Array = []
		if pid == 0:
			for id: Variant in hand:
				if not absent.has(id):
					in_hand.append(card_of(int(id)))
		players.append({"id": pid, "name": "Você" if pid == 0 else "Oponente", "life": 20, "sleeve": 1 if pid == 0 else 2, "library": 40,
			"handCount": in_hand.size() if pid == 0 else 4, "hand": in_hand, "battlefield": cards, "graveyard": [], "exile": [],
			"monarch": monarch == pid, "initiative": initiative == pid})
	var stack: Array = []
	if stack_card >= 0:
		var source: Dictionary = card_of(stack_card)
		stack.append({"id": 900, "text": source["name"], "kind": "spell", "controller": source["controller"], "source": source})
	var state: Dictionary = {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": stack, "combat": [],
		"input": {"gen": 1, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": []}, "events": events, "gameOver": false}
	if day_time != "":
		state["dayTime"] = day_time
	if format != "":
		state["config"] = {"format": format, "matchLength": "bo1"}
	return state


func rebuild(events: Array = []) -> void:
	var state: Dictionary = _state(events)
	fx.before_state(state)
	table.apply_state(state)
	hud.apply_state(state)


## Um evento com o próximo número.
func make_event(data: Dictionary) -> Dictionary:
	_seq += 1
	var event: Dictionary = data.duplicate()
	event["seq"] = _seq
	return event


## Espera `seconds` (para as jogadas em mais de um estado).
func wait(seconds: float) -> void:
	await get_tree().create_timer(seconds).timeout


func reset() -> void:
	absent = []
	stack_card = -1
	field = BATTLEFIELD.duplicate()
	hand = HAND.duplicate()
	controller = {}
	tapped = {}
	faces = {}
	crowd = {}
	monarch = -1
	initiative = -1
	day_time = ""
	format = ""
	table.highlight([], [], [], false)
	rebuild()


func simple(data: Dictionary) -> void:
	rebuild([make_event(data)])


# — Efeitos —

func _spell_damage() -> void:
	stack_card = 301
	rebuild()
	await wait(0.4)
	rebuild([make_event({"type": "damage", "card": card_of(301), "sourceId": 301, "targets": {"cards": [101]}, "delta": -3})])


func _combat_hit() -> void:
	rebuild([make_event({"type": "damage", "combat": true, "card": card_of(202), "sourceId": 202, "targets": {"players": [0]}, "delta": -2}),
		make_event({"type": "life-changed", "actor": 0, "delta": -2})])


func _big_hit() -> void:
	rebuild([make_event({"type": "damage", "combat": true, "card": card_of(201), "sourceId": 201, "targets": {"players": [0]}, "delta": -12, "lethal": true})])


func _life_gain() -> void:
	rebuild([make_event({"type": "life-changed", "actor": 0, "delta": 4})])


func _cast() -> void:
	stack_card = 301
	rebuild([make_event({"type": "spell-cast", "card": card_of(301), "actor": 1, "stackId": 900})])


func _ability(trigger: bool) -> void:
	rebuild([make_event({"type": "ability-activated", "card": card_of(102), "sourceId": 102, "trigger": trigger})])


## Entrada: a carta some do campo (ou sai da mão) e volta com o evento de entrada.
func _enter(id: int) -> void:
	absent.append(id)
	rebuild()
	await wait(0.3)
	absent.erase(id)
	hand.erase(id)
	if not field.has(id):
		field.append(id)
	rebuild([make_event({"type": "entered", "card": card_of(id), "to": "Battlefield"})])


func _leave(id: int, to: String, reason: String) -> void:
	var event: Dictionary = {"type": "left", "card": card_of(id), "to": to}
	if reason != "":
		event["reason"] = reason
	absent.append(id)
	rebuild([make_event(event)])


func _attack() -> void:
	rebuild([make_event({"type": "attackers", "cards": [101, 103], "actor": 0})])


func _block() -> void:
	rebuild([make_event({"type": "blockers", "cards": [202], "actor": 1})])


func _counters() -> void:
	rebuild([make_event({"type": "counters", "sourceId": 103, "counter": "P1P1", "delta": 2})])


func _countered() -> void:
	stack_card = 301
	rebuild()
	await wait(0.3)
	var event: Dictionary = make_event({"type": "countered", "card": card_of(301), "stackId": 900})
	stack_card = -1
	fx.before_state(_state([event]))
	table.apply_state(_state())


## Cascata do oponente: três cartas saem do topo até a que é conjurada de graça.
func _cascade() -> void:
	var revealed: Array = [card_of(204), card_of(203), card_of(301)]
	revealed[0]["id"] = 401
	revealed[1]["id"] = 402
	rebuild([make_event({"type": "cascade", "actor": 1, "dig": "cascade", "card": card_of(201), "revealed": revealed, "hit": 301, "cast": true})])


## Moer 4: quatro eventos de uma carta cada, que a mesa junta num voo só.
func _mill() -> void:
	var events: Array = []
	for id: int in [101, 102, 103, 113]:
		var card: Dictionary = card_of(id)
		card["id"] = 500 + id
		events.append(make_event({"type": "mill", "actor": 0, "card": card, "sourceName": "Teste"}))
	rebuild(events)


## O primeiro golpe de combate num jogador (o momento só vale uma vez por partida: "Remontar mesa" não o reinicia).
func _first_blood() -> void:
	rebuild([make_event({"type": "damage", "combat": true, "card": card_of(202), "sourceId": 202, "targets": {"players": [0]}, "delta": -2})])


## Golpe de comandante, com o total já perto do letal.
func _commander_hit() -> void:
	rebuild([make_event({"type": "damage", "combat": true, "commander": true, "commanderId": 201, "commanderTotal": 16, "card": card_of(201), "sourceId": 201, "targets": {"players": [0]}, "delta": -5})])


func _survived(how: String) -> void:
	rebuild([make_event({"type": "survived", "sourceId": 101, "survived": how})])
