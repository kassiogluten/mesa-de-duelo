# A pilha não passa rápido demais: a remoção do oponente que chega já resolvida ganha o quadro dela (na pilha, com o alvo
# ainda no campo), cada item fica o tempo mínimo à vista, e a fila não segura o primeiro estado, o fim do jogo nem o atraso.
extends "res://tests/test_case.gd"

const MURDER := {"id": 70, "name": "Murder", "manaCost": "{1}{B}{B}"}
const BEAR := {"id": 10, "name": "Grizzly Bears", "creature": true, "power": 2, "toughness": 2}


## O oponente (1) conjura Murder (70) no seu urso (10), e tudo resolve no mesmo estado.
func _murder_state(seq: int = 1) -> Dictionary:
	var item: Dictionary = {"id": 900, "kind": "spell", "controller": 1, "source": MURDER, "targets": {"cards": [10]}}
	var frame: Dictionary = {"turn": 3, "phase": "MAIN1", "activePlayer": 1, "stack": [item], "combat": [],
		"players": [{"id": 0, "life": 20, "battlefield": [BEAR], "handCount": 5, "library": 30},
			{"id": 1, "life": 20, "battlefield": [], "handCount": 4, "library": 30}]}
	var events: Array = [
		{"seq": seq, "type": "spell-cast", "actor": 1, "card": MURDER, "stackId": 900, "targets": {"cards": [10]}, "frame": frame},
		{"seq": seq + 1, "type": "resolved", "actor": 1, "card": MURDER, "stackId": 900},
		{"seq": seq + 2, "type": "left", "card": BEAR, "from": "Battlefield", "to": "Graveyard", "reason": "destroyed"},
	]
	return {"type": "state", "matchId": "m1", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 1, "stack": [],
		"players": [{"id": 0, "life": 20, "battlefield": [], "graveyard": [BEAR], "hand": [], "handCount": 5},
			{"id": 1, "life": 20, "battlefield": [], "graveyard": [MURDER], "handCount": 4}],
		"input": {"gen": 7, "message": "Sua vez", "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false}, "selectable": [10]},
		"question": {"kind": "x"}, "castable": [{"id": 3}], "events": events}


func test_a_removal_that_already_resolved_shows_its_frame_first() -> void:
	var hold := StackHold.new()
	var steps: Array = hold.plan(_murder_state())
	check_eq(steps.size(), 2, "o quadro da mágica e depois o estado")
	var frame: Dictionary = steps[0]
	check_eq((frame["stack"] as Array).size(), 1, "no quadro, Murder está na pilha")
	var me: Dictionary = frame["players"][0]
	check_eq((me["battlefield"] as Array).map(func(c: Dictionary) -> int: return int(c["id"])), [10], "o urso ainda está no campo")
	check_eq(me["graveyard"], [], "e não está no cemitério ao mesmo tempo")
	check_eq((frame["players"][1] as Dictionary)["graveyard"], [], "Murder não aparece no cemitério enquanto está na pilha")
	check_eq((frame["events"] as Array).size(), 1, "só os eventos até a mágica entrar na pilha")
	check_eq(int(frame["input"]["gen"]), -1, "sem a sua decisão no quadro")
	check(not bool(frame["input"]["ok"]["enabled"]), "sem o OK aceso")
	check(not frame.has("question"), "sem pergunta")
	check_eq(frame["castable"], [], "sem cartas para jogar")
	check(steps[1] == _murder_state(), "depois, o estado de verdade, intacto")


func test_each_item_stays_on_the_stack_its_minimum() -> void:
	var hold := StackHold.new()
	var steps: Array = hold.plan(_murder_state())
	hold.shown(steps[0], 10.0)
	check(absf(hold.wait_before(steps[1], 10.2) - (StackHold.OTHERS_SPELL - 0.2)) < 0.001, "a mágica do oponente fica à vista o tempo dela")
	check_eq(hold.wait_before(steps[1], 20.0), 0.0, "já vista o bastante: sem espera")
	check(absf(hold.wait_before(steps[1], 10.2, 1) - (StackHold.OTHERS_SPELL - 0.2) * StackHold.pace(1)) < 0.001, "com fila, encurta")
	check_eq(hold.wait_before(steps[1], 10.2, StackHold.SKIP_BACKLOG), 0.0, "com muita fila, só alcança o jogo")
	hold.shown(steps[1], 10.2)
	check_eq(hold.wait_before(steps[1], 10.3), 0.0, "o que já saiu da pilha não segura mais nada")


func test_minimums_by_kind_and_controller() -> void:
	check_eq(StackHold.min_visible({"kind": "spell", "controller": 1}, 0), StackHold.OTHERS_SPELL, "mágica do oponente")
	check_eq(StackHold.min_visible({"kind": "spell", "controller": 0}, 0), StackHold.YOUR_SPELL, "a sua, mais curta")
	check_eq(StackHold.min_visible({"kind": "ability", "controller": 1, "targets": {"cards": [4]}}, 0), StackHold.OTHERS_ABILITY, "habilidade com alvo")
	check_eq(StackHold.min_visible({"kind": "trigger", "controller": 1}, 0), 0.0, "gatilho sem alvo não segura a mesa")


func test_no_frame_on_the_first_state_game_over_or_seen_items() -> void:
	check_eq(StackHold.new().plan(_murder_state(), 0, true).size(), 1, "abrir ou voltar à partida: só o estado")
	var over: Dictionary = _murder_state()
	over["gameOver"] = true
	check_eq(StackHold.new().plan(over).size(), 1, "fim do jogo: só o estado")
	check_eq(StackHold.new().plan(_murder_state(), StackHold.SKIP_BACKLOG).size(), 1, "fila grande: só o estado")
	var hold := StackHold.new()
	hold.shown({"you": 0, "stack": [{"id": 900, "kind": "spell", "controller": 1}]}, 1.0)
	check_eq(hold.plan(_murder_state()).size(), 1, "a mágica que já apareceu na pilha não ganha outro quadro")
	var again := StackHold.new()
	again.plan(_murder_state())
	check_eq(again.plan(_murder_state()).size(), 1, "os mesmos eventos de novo não repetem o quadro")


func test_triggers_without_targets_pass_without_a_frame() -> void:
	var state: Dictionary = _murder_state()
	var cast: Dictionary = (state["events"] as Array)[0]
	cast["type"] = "ability-activated"
	cast["trigger"] = true
	cast.erase("targets")
	check_eq(StackHold.new().plan(state).size(), 1, "gatilho sem alvo: sem quadro")
	cast["targets"] = {"cards": [10]}
	check_eq(StackHold.new().plan(state).size(), 2, "gatilho com alvo (a criatura que destrói ao entrar): com quadro")


func test_the_queue_shows_the_frame_then_waits_for_the_result() -> void:
	done = false
	var queue := StateQueue.new()
	var shown: Array = []
	var now: Array = [100.0]
	queue.clock = func() -> float: return now[0]
	queue.show = func(s: Dictionary) -> void: shown.append(s)
	Engine.get_main_loop().root.add_child(queue)
	queue.receive({"type": "state", "matchId": "m1", "you": 0, "stack": [], "players": [], "events": []}, true)
	check_eq(shown.size(), 1, "o primeiro estado aparece na hora")
	queue.receive(_murder_state())
	check_eq(shown.size(), 2, "o quadro de Murder aparece na hora")
	check_eq(((shown[1] as Dictionary)["stack"] as Array).size(), 1, "com a mágica na pilha")
	check_eq(queue.pending(), 1, "o resultado espera")
	await Engine.get_main_loop().create_timer(StackHold.OTHERS_SPELL + 0.2).timeout
	check_eq(shown.size(), 3, "depois do tempo da mágica, o resultado")
	check_eq(queue.pending(), 0, "e a fila esvazia")
	queue.queue_free()
	done = true
