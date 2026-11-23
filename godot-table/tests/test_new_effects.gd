# Efeitos da lapidação: quando a jogada vira limpa-campo, quando a permanente transformou, quem virou monarca, a mana dos
# terrenos, a entrada do comandante, os bichos, o Game Changer, o foil e o laboratório tocando cada botão sem erro.
extends "res://tests/test_case.gd"


func _left(seq: int, id: int, extra: Dictionary = {}) -> Dictionary:
	var event: Dictionary = {"seq": seq, "type": "left", "card": {"id": id, "name": "X"}, "from": "Battlefield", "to": "Graveyard", "reason": "destroyed"}
	event.merge(extra, true)
	return event


func test_three_exits_of_the_same_spell_are_a_sweep() -> void:
	var sweeps := BoardSweep.new()
	var wrath: Dictionary = {"seq": 1, "type": "resolved", "card": {"id": 9, "name": "Wrath of God", "manaCost": "{2}{W}{W}"}, "stackId": 50}
	var found: Array = sweeps.observe([wrath, _left(2, 1, {"stackId": 50}), _left(3, 2, {"stackId": 50}), _left(4, 3, {"stackId": 50})], Callable())
	check_eq(found.size(), 1, "uma onda")
	if found.size() == 1:
		var group: Dictionary = found[0]
		check_eq((group["events"] as Array).size(), 3, "as três saídas")
		check_eq(group["text"], "3 permanentes destruídas", "a frase")
		check((group["color"] as Color).r > 0.9 and (group["color"] as Color).b > 0.6, "branca (a cor da mágica)")
		check(bool(group["wave"]), "com a onda")


func test_two_exits_or_combat_deaths_are_not_a_sweep() -> void:
	var sweeps := BoardSweep.new()
	check_eq(sweeps.observe([_left(1, 1, {"stackId": 5}), _left(2, 2, {"stackId": 5})], Callable()).size(), 0, "duas não bastam")
	# Mortes em combate: sem mágica resolvendo, cada uma sai sozinha.
	var combat: Array = [{"seq": 3, "type": "damage", "combat": true, "targets": {"cards": [1, 2, 3]}, "delta": -3}]
	for i: int in 3:
		combat.append(_left(4 + i, i + 1))
	check_eq(sweeps.observe(combat, Callable()).size(), 0, "mortes em combate não são limpa-campo")


func test_deaths_right_after_a_resolution_count_for_it() -> void:
	var sweeps := BoardSweep.new()
	var events: Array = [{"seq": 1, "type": "resolved", "stackId": 7, "card": {"id": 9, "manaCost": "{B}{B}"}}]
	for i: int in 4:
		events.append(_left(2 + i, i + 1, {"from": null}))
	var on_field: Callable = func(_id: int) -> bool: return true
	var found: Array = sweeps.observe(events, on_field)
	check_eq(found.size(), 1, "as saídas logo depois da resolução são dela")
	# Outra jogada no meio (uma mágica conjurada) corta a ligação.
	var cut: Array = [{"seq": 10, "type": "resolved", "stackId": 8}, {"seq": 11, "type": "spell-cast", "card": {"id": 30}}]
	for i: int in 3:
		cut.append(_left(12 + i, 20 + i, {"from": null}))
	check_eq(sweeps.observe(cut, on_field).size(), 0, "sem ligação, sem onda")


func test_mass_damage_is_a_fire_wave_unless_it_targeted() -> void:
	var sweeps := BoardSweep.new()
	var events: Array = []
	for i: int in 3:
		events.append({"seq": i + 1, "type": "damage", "sourceId": 40, "card": {"id": 40}, "targets": {"cards": [i + 1]}, "delta": -2})
	var found: Array = sweeps.observe(events, Callable())
	check_eq(found.size(), 1, "dano em três criaturas sem mirar")
	if found.size() == 1:
		check(bool(found[0]["damage"]), "é o de dano")
		check_eq(found[0]["text"], "3 criaturas atingidas", "a frase do dano")
	# Arc Lightning: a mágica mirou as cartas, o dano dividido continua com os projéteis.
	var arc := BoardSweep.new()
	var aimed: Array = [{"seq": 1, "type": "spell-cast", "card": {"id": 41}, "targets": {"cards": [1, 2, 3]}}]
	for i: int in 3:
		aimed.append({"seq": i + 2, "type": "damage", "sourceId": 41, "targets": {"cards": [i + 1]}, "delta": -1})
	check_eq(arc.observe(aimed, Callable()).size(), 0, "dano dividido entre alvos não é limpa-campo")


func test_the_wave_reaches_the_far_cards_later() -> void:
	check_eq(BoardSweep.arrival(0.0), 0.0, "no meio, logo")
	check(BoardSweep.arrival(1.0) < BoardSweep.arrival(3.0), "mais longe, mais tarde")
	check(BoardSweep.arrival(BoardSweep.REACH * 2.0) <= BoardSweep.WAVE_TIME + 0.001, "nunca depois do fim da onda")


func test_a_new_name_on_the_same_id_is_a_transform() -> void:
	var change: Dictionary = StateWatch.transform_of({"id": 5, "name": "Delver of Secrets"}, {"id": 5, "name": "Insectile Aberration"})
	check_eq(change.get("to"), "Insectile Aberration", "transformou")
	check_eq(change.get("face_up"), false, "não é desvirar")
	check(StateWatch.transform_of({"id": 5, "name": "A"}, {"id": 5, "name": "A"}).is_empty(), "mesmo nome: nada")
	check_eq(StateWatch.transform_of({"id": 5, "faceDown": true}, {"id": 5, "name": "Den Protector"}).get("face_up"), true, "a metamorfose desvirada")
	check(StateWatch.transform_of({"id": 5, "name": "A"}, {"id": 5, "faceDown": true}).is_empty(), "virar para baixo não é transformar")


func _state(players: Array, extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"players": players}
	state.merge(extra, true)
	return state


func test_watch_sees_transforms_monarch_and_day() -> void:
	var watch := StateWatch.new()
	var old: Dictionary = {5: {"id": 5, "name": "Delver of Secrets"}}
	var previous: Callable = func(id: int) -> Dictionary: return old.get(id, {})
	var first: Dictionary = watch.observe(_state([{"id": 0, "monarch": true, "battlefield": []}], {"dayTime": "day"}), [], previous, 0.0)
	check(first["monarch"] == null and first["day"] == "", "o primeiro estado só guarda (reconexão não vira efeito)")
	var next: Dictionary = watch.observe(_state([{"id": 0, "battlefield": [{"id": 5, "name": "Insectile Aberration"}]}, {"id": 1, "monarch": true, "battlefield": []}], {"dayTime": "night"}), [], previous, 1.0)
	check_eq(next["monarch"], 1, "o monarca passou para o 1")
	check_eq(next["day"], "night", "virou noite")
	check_eq((next["transforms"] as Array).size(), 1, "a permanente transformou")
	var same: Dictionary = watch.observe(_state([{"id": 0, "battlefield": []}, {"id": 1, "monarch": true, "battlefield": []}], {"dayTime": "night"}), [], previous, 2.0)
	check(same["monarch"] == null and same["day"] == "", "nada mudou")


func test_tapped_lands_pay_the_next_spell() -> void:
	var watch := StateWatch.new()
	var old: Dictionary = {10: {"id": 10, "land": true, "tapped": false}, 11: {"id": 11, "land": true, "tapped": false}}
	var previous: Callable = func(id: int) -> Dictionary: return old.get(id, {})
	var lands: Array = [{"id": 10, "land": true, "tapped": true, "typeLine": "Basic Land — Forest"}, {"id": 11, "land": true, "tapped": true, "typeLine": "Basic Land — Island"}]
	watch.observe(_state([{"id": 0, "battlefield": lands}]), [], previous, 0.0)
	var cast: Dictionary = {"seq": 3, "type": "spell-cast", "actor": 0, "card": {"id": 20}}
	var out: Dictionary = watch.observe(_state([{"id": 0, "battlefield": lands}]), [cast], func(_id: int) -> Dictionary: return {}, 1.0)
	var paid: Array = (out["mana"] as Dictionary).get(3, [])
	check_eq(paid.size(), 2, "as duas terras pagaram")
	if paid.size() == 2:
		check(((paid[0] as Dictionary)["color"] as Color).g > 0.8, "a Floresta manda mana verde")
	var again: Dictionary = watch.observe(_state([{"id": 0, "battlefield": lands}]), [{"seq": 4, "type": "spell-cast", "actor": 0, "card": {"id": 21}}], func(_id: int) -> Dictionary: return {}, 2.0)
	check((again["mana"] as Dictionary).is_empty(), "a mesma mana não paga duas mágicas")
	var late := StateWatch.new()
	late.observe(_state([{"id": 0, "battlefield": lands}]), [], previous, 0.0)
	var stale: Dictionary = late.observe(_state([{"id": 0, "battlefield": lands}]), [cast], func(_id: int) -> Dictionary: return {}, StateWatch.MANA_WINDOW + 1.0)
	check((stale["mana"] as Dictionary).is_empty(), "terra virada há muito tempo não voa")


func test_mana_that_went_through_the_pool_does_not_fly_twice() -> void:
	var watch := StateWatch.new()
	var old: Dictionary = {10: {"id": 10, "land": true, "tapped": false}, 11: {"id": 11, "land": true, "tapped": false}}
	var previous: Callable = func(id: int) -> Dictionary: return old.get(id, {})
	var forest: Dictionary = {"id": 10, "land": true, "tapped": true, "typeLine": "Basic Land — Forest"}
	var island: Dictionary = {"id": 11, "land": true, "tapped": true, "typeLine": "Basic Land — Island"}
	watch.observe(_state([{"id": 0, "battlefield": [], "pool": {}}]), [], previous, 0.0)
	# A Floresta virou e a mana ficou na reserva (a HUD mostra a gota indo para lá).
	watch.observe(_state([{"id": 0, "battlefield": [forest], "pool": {"G": 1}}]), [], previous, 0.5)
	old[10] = forest
	# A Ilha virou pagando direto, no mesmo estado da mágica.
	var cast: Dictionary = {"seq": 3, "type": "spell-cast", "actor": 0, "card": {"id": 20}}
	var out: Dictionary = watch.observe(_state([{"id": 0, "battlefield": [forest, island], "pool": {}}]), [cast], previous, 1.0)
	var paid: Array = (out["mana"] as Dictionary).get(3, [])
	check_eq(paid.size(), 1, "só a Ilha voa do terreno para a mágica")
	if paid.size() == 1:
		check_eq(int((paid[0] as Dictionary)["id"]), 11, "a Floresta já voou pela reserva")


func test_commander_entry_needs_a_cast_from_the_command_zone() -> void:
	var watch := StateWatch.new()
	var none: Callable = func(_id: int) -> Dictionary: return {}
	var card: Dictionary = {"id": 7, "name": "Atraxa", "controller": 0}
	watch.observe(_state([]), [{"seq": 1, "type": "spell-cast", "actor": 0, "card": card, "from": "Command"}], none, 0.0)
	var out: Dictionary = watch.observe(_state([]), [{"seq": 2, "type": "entered", "card": card, "from": "Stack"}], none, 1.0)
	check((out["commander_entries"] as Dictionary).has(2), "saiu da zona de comando e entrou")
	var blink: Dictionary = watch.observe(_state([]), [{"seq": 3, "type": "entered", "card": card, "from": "Exile"}], none, 2.0)
	check((blink["commander_entries"] as Dictionary).is_empty(), "voltar do exílio não é a entrada do comandante")


func test_crowded_field_creaks_with_a_gap() -> void:
	var watch := StateWatch.new()
	var none: Callable = func(_id: int) -> Dictionary: return {}
	var field: Array = []
	for i: int in StateWatch.CROWDED + 1:
		field.append({"id": 100 + i})
	var entered: Dictionary = {"seq": 1, "type": "entered", "card": {"id": 100, "controller": 1}}
	var out: Dictionary = watch.observe(_state([{"id": 1, "battlefield": field}]), [entered], none, 100.0)
	check_eq(out["creak"], 1, "o campo lotado range")
	var soon: Dictionary = watch.observe(_state([{"id": 1, "battlefield": field}]), [entered], none, 105.0)
	check_eq(soon["creak"], -1, "não range de novo logo em seguida")
	var small: Dictionary = StateWatch.new().observe(_state([{"id": 1, "battlefield": field.slice(0, 10)}]), [entered], none, 0.0)
	check_eq(small["creak"], -1, "campo pequeno não range")


func test_critters_come_with_their_creatures_and_rarely_alone() -> void:
	check_eq(Critters.kind_for({"creature": true, "typeLine": "Creature — Squirrel"}), "squirrel", "esquilo")
	check_eq(Critters.kind_for({"creature": true, "typeLine": "Creature — Vampire Bat"}), "bat", "morcego")
	check_eq(Critters.kind_for({"creature": true, "typeLine": "Creature — Bear"}), "", "urso não tem bicho")
	var critters := Critters.new()
	check_eq(critters.on_entered({"creature": true, "typeLine": "Creature — Rat"}, 100.0), "rat", "o rato passa")
	check_eq(critters.on_entered({"creature": true, "typeLine": "Creature — Rat"}, 105.0), "", "um bicho por vez")
	check_eq(critters.on_entered({"creature": true, "typeLine": "Creature — Rat"}, 100.0 + Critters.COOLDOWN), "rat", "depois do intervalo, de novo")
	var idle := Critters.new()
	check_eq(idle.on_turn(1000.0, 0.5), "", "na maioria das viradas, nada")
	check(idle.on_turn(1000.0, 0.01) in Critters.ALL, "às vezes um bicho")
	check_eq(idle.on_turn(1001.0, 0.01), "", "e não logo de novo")


func test_game_changers_follow_the_shared_list() -> void:
	var file: FileAccess = FileAccess.open(ProjectSettings.globalize_path("res://").path_join("../shared/commander-brackets.json"), FileAccess.READ)
	if file:
		var lists: Dictionary = JSON.parse_string(file.get_as_text())
		check_eq(Array(GameChangers.NAMES), lists.get("gameChangers", []), "a lista é a mesma de shared/commander-brackets.json")
	check(GameChangers.listed("Demonic Tutor"), "Demonic Tutor")
	check(GameChangers.listed("demonic tutor"), "sem diferença de maiúsculas")
	check(not GameChangers.listed("Lightning Bolt"), "Lightning Bolt não")
	var cast: Dictionary = {"type": "spell-cast", "card": {"id": 1, "name": "Demonic Tutor"}}
	check(GameChangers.play(cast, true), "conjurado no Commander")
	check(not GameChangers.play(cast, false), "fora do Commander, não")
	check(GameChangers.commander_rules({"config": {"format": "precon"}}), "pré-montado tem as regras do Commander")


func test_foil_follows_the_rarity() -> void:
	check_eq(CardDressing.foil_level("common"), 0.0, "comum sem foil")
	check_eq(CardDressing.foil_level("rare"), 1.0, "rara com brilho")
	check_eq(CardDressing.foil_level("mythic"), 2.0, "mítica com arco-íris")
	check_eq(CardDressing.rarity_of({"name": "X", "rarity": "mythic"}), "mythic", "a raridade do estado")
	check_eq(CardDressing.rarity_of({"name": "X", "rarity": "mythic", "faceDown": true}), "", "virada para baixo não mostra")
	check_eq(ArrivalFx.token_kind({"token": true, "name": "Treasure"}), "coin", "Tesouro vira moeda")
	check_eq(ArrivalFx.token_kind({"token": false, "name": "Treasure"}), "", "só ficha")


## Cada botão novo do laboratório toca sem erro e a mesa volta ao normal (nada de nó sobrando depois dos efeitos).
func test_the_lab_plays_every_new_effect() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var lab := EffectsLab.new()
	tree.root.add_child(lab)
	await tree.process_frame
	var before: int = lab.fx.get_child_count()
	for entry: Variant in LabPlays.buttons(lab):
		lab.reset()
		(entry as Array)[1].call()
		for i: int in 6:
			await tree.process_frame
	lab.fx.speed = 1.0
	await tree.create_timer(4.0).timeout
	check(lab.fx.get_child_count() <= before + 2, "os efeitos se apagam sozinhos (%d → %d nós)" % [before, lab.fx.get_child_count()])
	lab.queue_free()
	done = true
