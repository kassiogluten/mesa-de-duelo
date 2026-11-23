# Testes do acabamento da permanente: exiladas por baixo, atacantes iguais num monte com o dano somado, Portador do Anel,
# Game Changer, mutada, preparada, "Selecionada", previsão de lealdade e os selos acompanhando a carta que vira.
extends "res://tests/test_case.gd"

var _id: int = 0


func _card(name: String, type_line: String, extra: Dictionary = {}) -> Dictionary:
	_id += 1
	var card: Dictionary = {"id": _id, "name": name, "typeLine": type_line, "controller": 0, "owner": 0, "tapped": false, "token": false,
		"creature": type_line.contains("Creature"), "land": type_line.contains("Land")}
	card.merge(extra, true)
	return card


func _state(mine: Array, theirs: Array = [], extra: Dictionary = {}, exile: Array = []) -> Dictionary:
	var state: Dictionary = {"you": 0, "players": [{"id": 0, "battlefield": mine, "exile": [], "hand": []},
		{"id": 1, "battlefield": theirs, "exile": exile, "hand": []}], "stack": [], "combat": [], "input": {"selectable": [], "actionable": []}}
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


func _texts(node: Node) -> PackedStringArray:
	var out: PackedStringArray = []
	for label: Node in node.find_children("*", "Label3D", true, false):
		out.append((label as Label3D).text)
	return out


func test_exiled_cards_go_under_the_permanent_that_exiled_them() -> void:
	var dragon: Dictionary = _card("Shivan Dragon", "Creature — Dragon", {"controller": 1, "owner": 1})
	var relic: Dictionary = _card("Sol Ring", "Artifact", {"controller": 1, "owner": 1})
	var ring: Dictionary = _card("Oblivion Ring", "Enchantment", {"exiling": [dragon["id"], 999]})
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var ghosts: Dictionary = _card("Sheltered by Ghosts", "Enchantment — Aura", {"attachedTo": bear["id"], "exiling": [relic["id"]]})
	var ctx: Dictionary = BadgeSpec.context(_state([ring, bear, ghosts], [], {}, [dragon, relic]))
	var under: Dictionary = ctx["exiled_under"]
	check_eq((under[ring["id"]] as Array).map(func(x: Dictionary) -> int: return int(x["card"]["id"])), [dragon["id"]], "só a que está no exílio")
	check_eq((under[bear["id"]] as Array)[0]["by"], ghosts["id"], "a da aura sai por baixo da criatura a que ela está presa")
	check(not under.has(ghosts["id"]), "e não da aura")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(bear, ctx)), PackedStringArray(["exile"]), "o selo conta a exilada pela aura")
	var first: Vector2 = FieldLayout.exiled_offset(0, 1)
	var third: Vector2 = FieldLayout.exiled_offset(2, 3)
	check(first.y > 0.0 and first.x < 0.0, "sai por baixo, um pouco para a esquerda")
	check(third.y < FieldLayout.exiled_offset(0, 1).y * 3.0, "com mais cartas a descida encolhe")


func test_table_shows_the_exiled_card_tucked_under_and_keeps_it_in_exile() -> void:
	done = false
	var table: TableView = _table()
	var dragon: Dictionary = _card("Shivan Dragon", "Creature — Dragon", {"controller": 1, "owner": 1})
	var ring: Dictionary = _card("Oblivion Ring", "Enchantment", {"exiling": [dragon["id"]]})
	table.apply_state(_state([ring], [], {}, [dragon]))
	var host: CardNode = table.card_node(ring["id"])
	var under: CardNode = table.card_node("exu:%d" % int(dragon["id"]))
	# Ela sai de baixo da permanente até o lugar dela.
	await (Engine.get_main_loop() as SceneTree).create_timer(0.6).timeout
	check(under != null, "a cópia de vista por baixo da permanente")
	check(table.card_node(dragon["id"]) != null and table.zone_of(dragon["id"]) == "exile", "a carta continua no exílio")
	if under:
		check_eq(under.card_id, int(dragon["id"]), "o clique e o mouse respondem pela carta exilada")
		check(under.position.y < host.position.y, "embaixo da permanente")
		check(under.position.z > host.position.z, "saindo pela borda de baixo")
		check((under.get_node("ExileVeil") as Node3D).visible, "esmaecida")
	# A permanente sai do campo: a exilada volta e a cópia de vista some.
	var back: Dictionary = dragon.duplicate()
	table.apply_state(_state([], [back]))
	check(table.zone_of("exu:%d" % int(dragon["id"])) == "", "a cópia de vista sai")
	_free(table)
	done = true


func test_identical_unblocked_attackers_stack_with_the_damage_added() -> void:
	var goblins: Array = []
	for i: int in 3:
		goblins.append(_card("Goblin", "Token Creature — Goblin", {"power": 1, "toughness": 1, "token": true, "tapped": true, "attacking": true}))
	var aces: Array = []
	for i: int in 2:
		aces.append(_card("Fencing Ace", "Creature — Human", {"power": 1, "toughness": 1, "tapped": true, "attacking": true, "keywords": ["DOUBLE_STRIKE"]}))
	var walker: Dictionary = _card("Liliana", "Legendary Planeswalker — Liliana", {"planeswalker": true, "controller": 1})
	var wall: Dictionary = _card("Wall of Omens", "Creature — Wall", {"controller": 1})
	var combat: Array = []
	for g: Dictionary in goblins:
		combat.append({"attacker": g["id"], "defender": 1, "defenderKind": "player", "blockers": []})
	combat.append({"attacker": aces[0]["id"], "defender": 1, "defenderKind": "player", "blockers": []})
	combat.append({"attacker": aces[1]["id"], "defender": walker["id"], "defenderKind": "card", "blockers": []})
	(combat[2] as Dictionary)["blockers"] = [wall["id"]]
	var ctx: Dictionary = BadgeSpec.context(_state(goblins + aces, [walker, wall], {"combat": combat}))
	var piles: Array = FieldLayout.stacks(goblins + aces, ctx)
	check_eq(piles.map(func(p: Array) -> int: return p.size()), [2, 1, 1, 1], "o bloqueado e o que ataca outro alvo ficam sozinhos")
	var spec: Dictionary = BadgeSpec.for_pile(piles[0], ctx)
	check_eq((spec["bottom_mid"] as Array)[0]["text"], "2", "o dano somado do monte")
	check_eq(BadgeSpec.icons_of(spec).has("×2"), true, "e o ×2")
	check((BadgeSpec.for_pile(piles[2], ctx)["bottom_mid"] as Array).is_empty(), "sem monte, sem o dano somado")
	check_eq(FieldLayout.attack_damage(aces[0]), 2, "golpe duplo conta em dobro")


func test_ring_bearer_game_changer_mutated_and_prepared() -> void:
	var bearer: Dictionary = _card("Frodo", "Legendary Creature — Halfling", {"power": 1, "toughness": 1, "ringBearer": true})
	var tithe: Dictionary = _card("Smothering Tithe", "Enchantment")
	var token: Dictionary = _card("Smothering Tithe", "Enchantment", {"token": true})
	var mutant: Dictionary = _card("Gemrazer", "Creature — Beast", {"power": 4, "toughness": 4, "merged": [{"id": 1}, {"id": 2}, {"id": 3}]})
	var prepared: Dictionary = _card("Elf", "Creature — Elf", {"power": 1, "toughness": 1, "prepared": true})
	var cards: Array = [bearer, tithe, token, mutant, prepared]
	var commander: Dictionary = BadgeSpec.context(_state(cards, [], {"config": {"format": "commander"}}))
	var standard: Dictionary = BadgeSpec.context(_state(cards, [], {"config": {"format": "standard"}}))
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(bearer, commander)), PackedStringArray(["ring"]), "o Anel")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(tithe, commander)), PackedStringArray(["gem"]), "a gema no Commander")
	check(BadgeSpec.icons_of(BadgeSpec.for_card(tithe, standard)).is_empty(), "fora do Commander, sem gema")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(token, commander)), PackedStringArray(["FICHA"]), "a ficha não leva a gema")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(mutant, standard)), PackedStringArray(["MUTADA ×3"]), "mutada com quantas cartas")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(prepared, standard)), PackedStringArray(["PREPARADA"]), "preparada")


func test_attacked_planeswalker_shows_the_loyalty_forecast() -> void:
	var lili: Dictionary = _card("Liliana", "Legendary Planeswalker — Liliana", {"planeswalker": true, "counters": {"LOYALTY": 3}})
	var jace: Dictionary = _card("Jace", "Legendary Planeswalker — Jace", {"planeswalker": true, "counters": {"LOYALTY": 4}})
	var safe: Dictionary = _card("Teferi", "Legendary Planeswalker — Teferi", {"planeswalker": true, "counters": {"LOYALTY": 5}})
	var ctx: Dictionary = BadgeSpec.context(_state([lili, jace, safe], [], {"forecast": [{"player": 0, "planeswalkers": [
		{"id": lili["id"], "loyalty": 3, "after": 1}, {"id": jace["id"], "loyalty": 4, "after": 0}, {"id": safe["id"], "loyalty": 5, "after": 5}]}]}))
	var pt: Dictionary = BadgeSpec.for_card(lili, ctx)["pt"]
	check_eq([pt["value"], pt["after"], pt["lethal"]], [3, 1, false], "3 → 1")
	check_eq(BadgeSpec.for_card(jace, ctx)["pt"]["lethal"], true, "4 → 0 é letal")
	check(not (BadgeSpec.for_card(safe, ctx)["pt"] as Dictionary).has("after"), "sem perder lealdade, só o número")


func test_selected_mark_only_for_who_can_attack_or_block() -> void:
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var other: Dictionary = _card("Wall", "Creature — Wall", {"power": 0, "toughness": 4})
	var attack: Dictionary = BadgeSpec.context(_state([bear, other], [], {"input": {"attacking": {"attackers": [bear["id"]]}}}))
	check_eq(BadgeSpec.for_card(bear, attack)["pending"]["icon"], "sword", "pode atacar: espada")
	check((BadgeSpec.for_card(other, attack)["pending"] as Dictionary).is_empty(), "não pode atacar: nada")
	var block: Dictionary = BadgeSpec.context(_state([bear], [], {"input": {"blocking": {"blockers": [bear["id"]]}}}))
	check_eq(BadgeSpec.for_card(bear, block)["pending"]["icon"], "shield", "pode bloquear: escudo")


func test_table_marks_the_selected_attacker() -> void:
	done = false
	var table: TableView = _table()
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	table.apply_state(_state([bear], [], {"input": {"selectable": [], "actionable": [], "attacking": {"attackers": [bear["id"]]}}}))
	var node: CardNode = table.card_node(bear["id"])
	check(not _texts(node).has("Selecionada"), "antes de escolher, nada")
	table.highlight_roles({"selected": [bear["id"]]}, true)
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	check(_texts(node).has("Selecionada"), "selecionada para atacar")
	table.highlight_roles({}, false)
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	check(not _texts(node).has("Selecionada"), "desmarcada, some")
	_free(table)
	done = true


func test_badges_follow_the_card_while_it_taps() -> void:
	check_eq(CardBadges.tap_amount(Vector3(0, 0, 1)), 0.0, "de pé")
	check(is_equal_approx(CardBadges.tap_amount(Vector3(-1, 0, 0)), 1.0), "virada")
	check(is_equal_approx(CardBadges.tap_amount(Vector3(-1, 0, 1).normalized()), 0.5), "no meio do giro")
	var size := CardNode.SIZE
	var corner := Vector2(1, 1)
	var inset := Vector2(CardBadges.MARGIN, CardBadges.MARGIN)
	var up: Vector3 = CardBadges.region_anchor(corner, inset, size, false)
	var tap: Vector3 = CardBadges.region_anchor(corner, inset, size, true)
	check(up.x > 0.0 and up.z > 0.0, "de pé, o canto de baixo à direita")
	# Virada (−90° em Y), o canto vai para o de baixo à direita da carta deitada na tela.
	var world: Vector3 = Basis(Vector3.UP, -PI / 2.0) * tap
	check(world.x > 0.0 and world.z > 0.0, "virada, continua embaixo à direita na tela")
	# Uma carta de verdade virando: no meio do giro o canto está no meio do caminho (sem pular para o fim).
	var node := CardNode.new()
	(Engine.get_main_loop() as SceneTree).root.add_child(node)
	var spec: Dictionary = {"corner": [], "tag": {}, "counters": [], "keywords": [], "top_right": [], "bottom_mid": [], "aim": "",
		"pt": {"kind": "pt", "power": 2, "toughness": 2, "damage": 0, "pcolor": BadgeSpec.PAPER_INK, "tcolor": BadgeSpec.PAPER_INK}}
	node.set_badges(spec, true, false)
	node.basis = Basis(Vector3.UP, -PI / 4.0)
	var badges: CardBadges = null
	for child: Node in node.find_children("*", "Node3D", true, false):
		if child is CardBadges:
			badges = child
	badges._process(0.0)
	var region: Node3D = badges.get_child(4)
	check(region.position.distance_to(up.lerp(tap, 0.5)) < 0.001, "no meio do caminho entre os dois cantos")
	node.queue_free()
