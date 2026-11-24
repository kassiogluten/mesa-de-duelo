# Testes dos efeitos dos estados das permanentes: o que mudou de um estado para o outro (StateFx), os selos achados pela
# chave (CardBadges), o giro do enjoo, o salto dos selos novos, as fichas dos marcadores e os selos do assento.
extends "res://tests/test_case.gd"

var _id: int = 0


func _card(name: String, extra: Dictionary = {}) -> Dictionary:
	_id += 1
	var card: Dictionary = {"id": 3000 + _id, "name": name, "typeLine": "Creature — Bear", "controller": 0, "tapped": false,
		"token": false, "creature": true, "land": false, "power": 2, "toughness": 2, "basePower": 2, "baseToughness": 2}
	card.merge(extra, true)
	return card


func _state(mine: Array, extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"type": "state", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "events": [],
		"players": [{"id": 0, "battlefield": mine, "exile": [], "graveyard": [], "hand": [], "library": 30},
			{"id": 1, "battlefield": [], "exile": [], "graveyard": [], "hand": [], "handCount": 0, "library": 30}],
		"stack": [], "combat": [], "input": {"selectable": [], "actionable": []}}
	state.merge(extra, true)
	return state


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func _free(table: TableView) -> void:
	table.catalog.queue_free()
	table.queue_free()


func _snap(card: Dictionary, keys: Array = []) -> Dictionary:
	return StateFx.snapshot(card, PackedStringArray(keys))


func test_sickness_arrives_and_clears() -> void:
	var sick: Dictionary = _card("Grizzly Bears", {"sick": true})
	var hasty: Dictionary = _card("Raging Goblin", {"sick": true, "keywords": ["HASTE"]})
	check_eq(StateFx.changes({}, _snap(sick), {}, false)["dizzy"], "arrived", "chegou tonta")
	check_eq(StateFx.changes({}, _snap(hasty), {}, false)["dizzy"], "", "com ímpeto não fica tonta")
	var well: Dictionary = sick.duplicate()
	well["sick"] = false
	check_eq(StateFx.changes(_snap(sick), _snap(well), {}, true)["dizzy"], "cleared", "o enjoo passou")
	check_eq(StateFx.changes(_snap(sick), _snap(sick), {}, false)["dizzy"], "", "continua tonta: nada novo")


func test_untap_only_when_the_turn_starts_and_tap_not_when_attacking() -> void:
	var tapped: Dictionary = _card("Forest", {"tapped": true, "creature": false, "land": true})
	var open: Dictionary = tapped.duplicate()
	open["tapped"] = false
	check(bool(StateFx.changes(_snap(tapped), _snap(open), {}, true)["untap"]), "desvirou no começo do turno")
	check(not bool(StateFx.changes(_snap(tapped), _snap(open), {}, false)["untap"]), "desvirar no meio do turno (efeito) não é a etapa")
	check(bool(StateFx.changes(_snap(open), _snap(tapped), {}, false)["tap"]), "virou para mana")
	var bear: Dictionary = _card("Grizzly Bears")
	var attacking: Dictionary = bear.duplicate()
	attacking["tapped"] = true
	attacking["attacking"] = true
	check(not bool(StateFx.changes(_snap(bear), _snap(attacking), {}, false)["tap"]), "atacar tem o efeito dele")


func test_pt_and_loyalty_changes_leave_counters_to_their_event() -> void:
	var bear: Dictionary = _card("Grizzly Bears")
	var pumped: Dictionary = bear.duplicate()
	pumped["power"] = 5
	pumped["toughness"] = 5
	check_eq(StateFx.changes(_snap(bear), _snap(pumped), {}, false)["pt"], Vector2i(3, 3), "Giant Growth: +3/+3")
	check_eq(StateFx.changes(_snap(bear), _snap(pumped), {"P1P1": true}, false)["pt"], Vector2i.ZERO, "o marcador mostra o P/T dele")
	var hurt: Dictionary = bear.duplicate()
	hurt["damage"] = 1
	check_eq(StateFx.changes(_snap(bear), _snap(hurt), {}, false)["pt"], Vector2i.ZERO, "dano marcado não é encolher")
	var walker: Dictionary = _card("Chandra", {"creature": false, "planeswalker": true, "counters": {"LOYALTY": 4}})
	var hit: Dictionary = walker.duplicate()
	hit["counters"] = {"LOYALTY": 2}
	check_eq(StateFx.changes(_snap(walker), _snap(hit), {}, false)["loyalty"], Vector2i(4, 2), "dano no planeswalker: 4 → 2")
	check_eq(StateFx.changes(_snap(walker), _snap(hit), {"LOYALTY": true}, false)["loyalty"], null, "a habilidade tem o evento")
	var other: Dictionary = pumped.duplicate()
	other["name"] = "Insectile Aberration"
	check_eq(StateFx.changes(_snap(bear), _snap(other), {}, false)["pt"], Vector2i.ZERO, "transformou: a troca de face tem o efeito dela")


func test_new_badges_skip_the_copy_count() -> void:
	var bear: Dictionary = _card("Grizzly Bears")
	var before: Dictionary = _snap(bear, ["pt"])
	var now: Dictionary = _snap(bear, ["pt", "keyword:FLYING", "top_right:ring", "top_right:text", "counter:+1/+1"])
	check_eq(StateFx.changes(before, now, {}, false)["badges"], PackedStringArray(["keyword:FLYING", "top_right:ring"]),
		"palavra-chave e o Anel saltam; o ×N e o marcador (que tem a ficha) não")


func test_badge_parts_by_key() -> void:
	var table := _table()
	var bear: Dictionary = _card("Grizzly Bears", {"sick": true, "counters": {"P1P1": 2}, "keywords": ["FLYING"], "ringBearer": true})
	table.apply_state(_state([bear]))
	var badges: CardBadges = BadgeFx.badges_of(table.card_node(int(bear["id"])))
	var keys: PackedStringArray = badges.keys()
	for key: String in ["tag", "pt", "keyword:FLYING", "top_right:ring", "counter:" + CardLabels.counter_name("P1P1")]:
		check(keys.has(key), "o selo %s tem chave" % key)
	check_eq(badges.parts_of("tag").size(), 1, "o enjoo é um ícone solto")
	check(SicknessFx.tag_sprite(table.card_node(int(bear["id"]))) != null, "achado como selo do enjoo")
	var counter: Array[GeometryInstance3D] = badges.parts_of("counter:" + CardLabels.counter_name("P1P1"))
	check(counter.size() >= 2 and counter.any(func(p: GeometryInstance3D) -> bool: return p is Label3D), "o marcador: fundo, ícone e número")
	_free(table)


func _ripple_of(node: CardNode) -> MeshInstance3D:
	for child: Node in node.find_children("*", "MeshInstance3D", true, false):
		if child.get_meta("badge", "") == "sickness-ripple" and not child.is_queued_for_deletion():
			return child as MeshInstance3D
	return null


func test_sick_badge_orbits_only_with_the_option_on() -> void:
	done = false
	var was_enabled: bool = AmbientFx.enabled
	var was_quality: int = Fx.quality
	AmbientFx.enabled = true
	AmbientFx._pref_loaded = true
	Fx.quality = 2
	var table := _table()
	var bear: Dictionary = _card("Grizzly Bears", {"sick": true})
	table.apply_state(_state([bear]))
	var fx: StateFx = table.get_node("StateFx")
	check_eq(fx.sickness.tracked(), [int(bear["id"])], "a tonta é acompanhada")
	var tree: SceneTree = Engine.get_main_loop()
	await tree.process_frame
	await tree.process_frame
	check_eq(fx.sickness.orbits(), 1, "o selo gira")
	var sprite: Sprite3D = SicknessFx.tag_sprite(table.card_node(int(bear["id"])))
	check(sprite != null and is_zero_approx(sprite.modulate.a), "o ícone parado some atrás do giro")
	check_eq(fx.sickness.ripples(), 1, "a arte ondula")
	var node: CardNode = table.card_node(int(bear["id"]))
	var ripple: MeshInstance3D = _ripple_of(node)
	check(ripple != null and ripple.get_parent() == SicknessRipple.face_of(node), "a ondulação fica presa na face da carta")
	AmbientFx.enabled = false
	await tree.process_frame
	check_eq(fx.sickness.orbits(), 0, "opção desligada: sem giro")
	check_eq(fx.sickness.ripples(), 0, "nem ondulação")
	check(sprite != null and is_equal_approx(sprite.modulate.a, 1.0), "e o ícone parado volta")
	AmbientFx.enabled = true
	await tree.process_frame
	check_eq(fx.sickness.ripples(), 1, "opção de volta: a arte ondula de novo")
	var well: Dictionary = bear.duplicate()
	well["sick"] = false
	table.apply_state(_state([well], {"turn": 5}))
	check(fx.sickness.tracked().is_empty(), "o enjoo passou: nada a acompanhar")
	check_eq(fx.sickness.ripples(), 1, "a ondulação se acalma antes de sair")
	await tree.create_timer(StateFx.AFTER_BANNER + SicknessFx.RIPPLE_OUT + 0.4).timeout
	await tree.process_frame
	check_eq(fx.sickness.ripples(), 0, "e depois sai")
	await tree.process_frame
	check(_ripple_of(node) == null, "sem a folha na carta")
	AmbientFx.enabled = was_enabled
	Fx.quality = was_quality
	_free(table)
	done = true


func test_new_keyword_badge_pops() -> void:
	done = false
	var table := _table()
	var bear: Dictionary = _card("Grizzly Bears")
	table.apply_state(_state([bear]))
	var flyer: Dictionary = bear.duplicate()
	flyer["keywords"] = ["FLYING"]
	table.apply_state(_state([flyer]))
	var tree: SceneTree = Engine.get_main_loop()
	await tree.create_timer(0.2).timeout
	var parts: Array[GeometryInstance3D] = BadgeFx.parts(table.card_node(int(bear["id"])), "keyword:FLYING")
	check(not parts.is_empty() and parts[0].has_meta("pop_base"), "o selo novo está saltando")
	await tree.create_timer(0.5).timeout
	check(not parts.is_empty() and not parts[0].has_meta("pop_base"), "e volta ao tamanho")
	_free(table)
	done = true


func test_pop_returns_parts_to_their_place() -> void:
	done = false
	var table := _table()
	var bear: Dictionary = _card("Grizzly Bears")
	table.apply_state(_state([bear]))
	var parts: Array[GeometryInstance3D] = BadgeFx.parts(table.card_node(int(bear["id"])), "pt")
	var before: Array = parts.map(func(p: GeometryInstance3D) -> Array: return [p.get("offset"), p.get("pixel_size")])
	BadgeFx.pop(parts, 0.4, 1.2, 0.2)
	check(not is_equal_approx(float(parts[0].get("pixel_size")), float(before[0][1])), "durante o salto o selo muda de tamanho")
	var tree: SceneTree = Engine.get_main_loop()
	await tree.create_timer(0.35).timeout
	var after: Array = parts.map(func(p: GeometryInstance3D) -> Array: return [p.get("offset"), p.get("pixel_size")])
	check_eq(after, before, "depois, cada peça volta ao lugar e ao tamanho")
	_free(table)
	done = true


func test_counter_chip_text_and_colors() -> void:
	check_eq(CounterFx.chip_text(2), "+2", "ganhou dois")
	check_eq(CounterFx.chip_text(-1), "−1", "perdeu um")
	check_eq(CounterFx.color_of("P1P1"), CounterFx.GREEN, "+1/+1 verde")
	check_eq(CounterFx.color_of("M1M1"), CounterFx.RED, "−1/−1 vermelho")
	check_eq(CounterFx.color_of("CHARGE"), BadgeSpec.GOLD_LIGHT, "os outros no dourado dos selos")


func test_seat_badges_that_appear_or_change() -> void:
	var seats := SeatBadgeFx.new()
	var calm: Dictionary = _state([])
	check(seats.diff(calm, []).is_empty(), "o primeiro estado só guarda")
	var crowned: Dictionary = _state([])
	crowned["players"][0]["monarch"] = true
	crowned["players"][0]["ringTempted"] = 1
	var changes: Array = seats.diff(crowned, [])
	var keys: Array = changes.map(func(c: Dictionary) -> String: return Txt.of(c["key"]))
	check(keys.has("MONARCH") and keys.has("RING"), "monarca e o Anel apareceram: %s" % [keys])
	check(changes.all(func(c: Dictionary) -> bool: return bool(c["new"])), "os dois são novos")
	var poisoned: Dictionary = crowned.duplicate(true)
	poisoned["players"][0]["counters"] = {"POISON": 2}
	var event: Dictionary = {"type": "counters", "counter": "POISON", "delta": 2, "targets": {"players": [0]}}
	check(seats.diff(poisoned, [event]).is_empty(), "o veneno do evento tem a ficha voando")
	var more: Dictionary = poisoned.duplicate(true)
	more["players"][0]["ringTempted"] = 2
	var again: Array = seats.diff(more, [])
	check(again.size() == 1 and again[0]["key"] == "RING" and not bool(again[0]["new"]), "o Anel tentou de novo: o selo muda")
