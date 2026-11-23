# Testes da permanente no campo: quais selos cada carta mostra (BadgeSpec), cópias empilhadas e a ordem do campo (FieldLayout).
extends "res://tests/test_case.gd"

var _id: int = 0


func _card(name: String, type_line: String, extra: Dictionary = {}) -> Dictionary:
	_id += 1
	var card: Dictionary = {"id": _id, "name": name, "typeLine": type_line, "controller": 0, "tapped": false, "token": false,
		"creature": type_line.contains("Creature"), "land": type_line.contains("Land")}
	card.merge(extra, true)
	return card


func _state(mine: Array, theirs: Array = [], extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"you": 0, "players": [{"id": 0, "battlefield": mine, "exile": []}, {"id": 1, "battlefield": theirs, "exile": []}],
		"stack": [], "combat": [], "input": {"selectable": [], "actionable": []}}
	state.merge(extra, true)
	return state


func test_creature_shows_counters_keywords_and_pt() -> void:
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 4, "toughness": 4, "basePower": 2, "baseToughness": 2, "damage": 1,
		"counters": {"P1P1": 2}, "keywords": ["FLYING", "TRAMPLE", "NOT_A_KEYWORD"]})
	var spec: Dictionary = BadgeSpec.for_card(bear, BadgeSpec.context(_state([bear])))
	check_eq(BadgeSpec.icons_of(spec), PackedStringArray(["P1P1", "FLYING", "TRAMPLE"]), "marcador e palavras-chave conhecidas")
	check_eq((spec["counters"] as Array)[0]["text"], "2", "o número do marcador")
	var pt: Dictionary = spec["pt"]
	check_eq([pt["power"], pt["toughness"]], [4, 3], "a resistência já sem o dano")
	check_eq(pt["pcolor"], BadgeSpec.UP, "poder acima da base em verde")
	check_eq(pt["tcolor"], BadgeSpec.DOWN, "com dano, a resistência em vermelho")


func test_keyword_from_a_counter_is_not_repeated() -> void:
	var rex: Dictionary = _card("Indominus Rex", "Creature — Dinosaur", {"power": 6, "toughness": 6, "counters": {"Flying": 1}, "keywords": ["FLYING", "HASTE"]})
	var spec: Dictionary = BadgeSpec.for_card(rex, BadgeSpec.context(_state([rex])))
	check_eq(BadgeSpec.icons_of(spec), PackedStringArray(["FLYING", "HASTE"]), "o Voar vem só do marcador (com o ícone de voar)")


func test_noncreature_shows_only_protective_keywords() -> void:
	var relic: Dictionary = _card("Darksteel Relic", "Artifact", {"keywords": ["INDESTRUCTIBLE", "FLYING"]})
	var spec: Dictionary = BadgeSpec.for_card(relic, BadgeSpec.context(_state([relic])))
	check_eq(BadgeSpec.icons_of(spec), PackedStringArray(["INDESTRUCTIBLE"]), "só a de proteção")
	check((spec["pt"] as Dictionary).is_empty(), "artefato sem P/T")


func test_corner_badges_and_summoning_sickness() -> void:
	var goblin: Dictionary = _card("Goblin", "Token Creature — Goblin", {"power": 1, "toughness": 1, "token": true, "sick": true})
	var hasty: Dictionary = _card("Goblin Guide", "Creature — Goblin", {"power": 2, "toughness": 2, "sick": true, "keywords": ["HASTE"]})
	var cmd: Dictionary = _card("Isamaru, Hound of Konda", "Legendary Creature — Dog", {"power": 2, "toughness": 2, "commander": true})
	var clone: Dictionary = _card("Shivan Dragon", "Creature — Dragon", {"power": 5, "toughness": 5, "copyOf": "Clone"})
	var ctx: Dictionary = BadgeSpec.context(_state([goblin, hasty, cmd, clone]))
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(goblin, ctx)), PackedStringArray(["FICHA", "tag:dizzy"]), "ficha com enjoo")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(hasty, ctx)), PackedStringArray(["HASTE"]), "com ímpeto, sem enjoo")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(cmd, ctx)), PackedStringArray(["crown"]), "comandante com a coroa")
	check_eq(BadgeSpec.icons_of(BadgeSpec.for_card(clone, ctx)), PackedStringArray(["CÓPIA"]), "cópia")


func test_combat_tags_untap_and_aim() -> void:
	var attacker: Dictionary = _card("Serra Angel", "Creature — Angel", {"power": 4, "toughness": 4})
	var walker: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", {"planeswalker": true, "counters": {"LOYALTY": 3}, "controller": 1})
	var blocker: Dictionary = _card("Wall of Omens", "Creature — Wall", {"power": 0, "toughness": 4, "controller": 1})
	var land: Dictionary = _card("Forest", "Basic Land — Forest", {"tapped": true})
	var state: Dictionary = _state([attacker, land], [walker, blocker], {
		"combat": [{"attacker": attacker["id"], "defender": walker["id"], "defenderKind": "card", "blockers": [blocker["id"]]}],
		"stack": [{"id": 9, "controller": 1, "targets": {"cards": [attacker["id"]]}}, {"id": 8, "controller": 0, "targets": {"cards": [blocker["id"]]}}],
		"input": {"untappable": [land["id"]]}})
	var ctx: Dictionary = BadgeSpec.context(state)
	var atk: Dictionary = BadgeSpec.for_card(attacker, ctx)
	check_eq([atk["tag"]["icon"], atk["tag"]["text"]], ["sword", "1"], "atacante com a espada e o número")
	check_eq(atk["aim"], "theirs", "alvo de uma mágica do oponente")
	var blk: Dictionary = BadgeSpec.for_card(blocker, ctx)
	check_eq(blk["tag"]["icon"], "shield", "bloqueador com o escudo")
	check_eq(blk["aim"], "mine", "alvo de uma mágica sua")
	var pw: Dictionary = BadgeSpec.for_card(walker, ctx)
	check_eq(pw["tag"]["text"], "Atacado 1", "o planeswalker diz quem o ataca")
	check_eq([pw["pt"]["kind"], pw["pt"]["value"]], ["loyalty", 3], "a lealdade no lugar do P/T")
	check((pw["counters"] as Array).is_empty(), "a lealdade não repete como marcador")
	check_eq(BadgeSpec.for_card(land, ctx)["tag"]["icon"], "untap", "terreno virado para mana com o ↺")


func test_identical_lands_stack_and_split_by_state() -> void:
	var lands: Array = []
	for i: int in 4:
		lands.append(_card("Forest", "Basic Land — Forest", {"tapped": i >= 3}))
	lands.append(_card("Swamp", "Basic Land — Swamp"))
	var ctx: Dictionary = FieldLayout.context(_state(lands))
	var stacks: Array = FieldLayout.stacks(lands, ctx)
	check_eq(stacks.map(func(s: Array) -> int: return s.size()), [3, 1, 1], "3 florestas desviradas, 1 virada e o pântano")


func test_creatures_with_differences_or_in_combat_stay_alone() -> void:
	var a: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var b: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var hurt: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2, "damage": 1})
	var fighting: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2, "attacking": true})
	var aura: Dictionary = _card("Rancor", "Enchantment — Aura")
	var host: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	aura["attachedTo"] = host["id"]
	var cards: Array = [a, b, hurt, fighting, host]
	var ctx: Dictionary = FieldLayout.context(_state(cards + [aura]))
	check_eq(FieldLayout.stacks(cards, ctx).map(func(s: Array) -> int: return s.size()), [2, 1, 1, 1], "só as duas iguais juntas")


func test_field_order_and_attachments() -> void:
	var land: Dictionary = _card("Forest", "Basic Land — Forest")
	var ring: Dictionary = _card("Sol Ring", "Artifact")
	var walker: Dictionary = _card("Liliana of the Veil", "Legendary Planeswalker — Liliana", {"planeswalker": true})
	var battle: Dictionary = _card("Invasion of Zendikar", "Battle — Siege")
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var aura: Dictionary = _card("Rancor", "Enchantment — Aura", {"attachedTo": bear["id"]})
	var golem: Dictionary = _card("Steel Golem", "Artifact Creature — Golem", {"power": 3, "toughness": 4})
	var mine: Array = [land, ring, walker, aura, battle, bear, golem]
	var state: Dictionary = _state(mine)
	var rows: Dictionary = FieldLayout.rows(state["players"][0], FieldLayout.context(state), 100.0)
	var names := func(items: Array) -> Array: return items.map(func(item: Dictionary) -> String: return Txt.of((item["cards"] as Array)[0]["name"]))
	check_eq(names.call(rows["front"]), ["Grizzly Bears", "Steel Golem", "Liliana of the Veil", "Invasion of Zendikar"], "criaturas e depois planeswalkers/batalhas")
	check_eq(names.call(rows["back"]), ["Sol Ring", "Forest"], "artefatos antes dos terrenos; a aura vai com a criatura")
	var front: Array = rows["front"]
	check_eq([front[0]["group"], front[2]["group"]], [0, 1], "dois grupos na frente")
	check(float(front[2]["x"]) - float(front[1]["x"]) > float(front[1]["x"]) - float(front[0]["x"]), "o vão entre os grupos é maior")
	check(float(front[0]["width"]) > FieldLayout.CARD.x, "o urso ocupa também o leque da aura")


func test_wide_row_is_squeezed_to_fit() -> void:
	var cards: Array = []
	for i: int in 12:
		cards.append(_card("Creature %d" % i, "Creature — Test", {"power": i, "toughness": 1}))
	var state: Dictionary = _state(cards)
	var front: Array = FieldLayout.rows(state["players"][0], FieldLayout.context(state), 5.0)["front"]
	check_eq(front.size(), 12, "uma carta por monte")
	var span: float = float(front[11]["x"]) - float(front[0]["x"]) + FieldLayout.CARD.x * float(front[0]["squeeze"])
	check(span <= 5.0 + 0.001, "cabe na largura (%.2f)" % span)
	check(absf(float(front[0]["x"]) + float(front[11]["x"])) < 0.001, "centrada")


func test_table_places_attachments_behind_and_tops_stacks() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear", {"power": 2, "toughness": 2})
	var aura: Dictionary = _card("Rancor", "Enchantment — Aura", {"attachedTo": bear["id"]})
	var forests: Array = [_card("Forest", "Basic Land — Forest"), _card("Forest", "Basic Land — Forest")]
	var state: Dictionary = _state([bear, aura] + forests)
	state["players"][0]["hand"] = []
	state["players"][1]["hand"] = []
	table.apply_state(state)
	var host: CardNode = table.card_node(bear["id"])
	var att: CardNode = table.card_node(aura["id"])
	check(att.position.x > host.position.x and att.position.z < host.position.z, "a aura sai para a direita e para o alto")
	check(att.position.y < host.position.y, "atrás (embaixo) da criatura")
	check(att.scale.x < host.scale.x, "menor")
	var low: CardNode = table.card_node(forests[0]["id"])
	var top: CardNode = table.card_node(forests[1]["id"])
	check(top.position.y > low.position.y and top.position.x > low.position.x, "a cópia de cima um pouco à direita")
	check(absf(top.position.z - low.position.z) < 0.001, "as cópias na mesma fileira")
	catalog.queue_free()
	table.queue_free()
