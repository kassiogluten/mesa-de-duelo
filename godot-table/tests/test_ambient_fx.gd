# Testes dos efeitos contínuos das permanentes: quais efeitos cada carta mostra (AmbientTraits) e a camada na mesa (AmbientFx).
extends "res://tests/test_case.gd"

const M := AmbientTraits.Mode

var _id: int = 0


func _card(name: String, type_line: String, keywords: Array = [], extra: Dictionary = {}) -> Dictionary:
	_id += 1
	var card: Dictionary = {"id": _id, "name": name, "typeLine": type_line, "controller": 0, "tapped": false, "token": false,
		"creature": type_line.contains("Creature"), "land": type_line.contains("Land"), "keywords": keywords}
	if card["creature"]:
		card["power"] = 2
		card["toughness"] = 2
	card.merge(extra, true)
	return card


func _state(mine: Array, theirs: Array = [], extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"type": "state", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "events": [],
		"players": [{"id": 0, "battlefield": mine, "exile": [], "graveyard": [], "hand": [], "library": 30},
			{"id": 1, "battlefield": theirs, "exile": [], "graveyard": [], "hand": [], "handCount": 0, "library": 30}],
		"stack": [], "combat": [], "input": {"selectable": [], "actionable": []}}
	state.merge(extra, true)
	return state


func test_two_strongest_effects_per_card() -> void:
	var hawk: Dictionary = _card("Vampire Nighthawk", "Creature — Vampire", ["FLYING", "DEATHTOUCH", "LIFELINK"])
	check_eq(AmbientTraits.pick(hawk), [M.DEATHTOUCH, M.LIFELINK] as Array[int], "toque mortífero e vínculo; o vento do voar fica de fora")
	check(AmbientTraits.hovers(hawk), "mas a carta paira mesmo assim")
	var angel: Dictionary = _card("Serra Angel", "Creature — Angel", ["FLYING", "VIGILANCE"])
	check_eq(AmbientTraits.pick(angel), [M.FLYING, M.VIGILANCE] as Array[int], "voar e vigilância")


func test_haste_only_on_the_turn_it_entered() -> void:
	var fresh: Dictionary = _card("Raging Goblin", "Creature — Goblin", ["HASTE"], {"sick": true})
	var old: Dictionary = _card("Raging Goblin", "Creature — Goblin", ["HASTE"])
	check_eq(AmbientTraits.pick(fresh), [M.HASTE] as Array[int], "acabou de entrar: o ar treme")
	check(AmbientTraits.pick(old).is_empty(), "nos turnos seguintes o ímpeto não muda nada")


func test_overlapping_keywords_show_once() -> void:
	var ace: Dictionary = _card("Fencing Ace", "Creature — Human", ["DOUBLE_STRIKE", "FIRST_STRIKE"])
	check_eq(AmbientTraits.pick(ace), [M.DOUBLE_STRIKE] as Array[int], "golpe duplo engole a iniciativa")
	var cloak: Dictionary = _card("Troll", "Creature — Troll", ["SHROUD", "HEXPROOF"])
	check_eq(AmbientTraits.pick(cloak), [M.SHROUD] as Array[int], "manto engole a resistência à magia")


func test_noncreatures_identity_and_hidden_cards() -> void:
	var relic: Dictionary = _card("Darksteel Relic", "Artifact", ["INDESTRUCTIBLE", "FLYING"])
	check_eq(AmbientTraits.pick(relic), [M.INDESTRUCTIBLE] as Array[int], "artefato: só a proteção")
	check(not AmbientTraits.hovers(relic), "artefato com Voar não paira")
	var cmd: Dictionary = _card("Krenko, Mob Boss", "Legendary Creature — Goblin", [], {"commander": true, "counters": {"P1P1": 1}})
	check_eq(AmbientTraits.pick(cmd), [M.COMMANDER, M.P1P1] as Array[int], "comandante (no lugar da aura de lendária) e +1/+1")
	var walker: Dictionary = _card("Liliana", "Legendary Planeswalker — Liliana", [], {"planeswalker": true, "counters": {"LOYALTY": 4}})
	check_eq(AmbientTraits.pick(walker), [M.PLANESWALKER, M.LEGENDARY] as Array[int], "planeswalker antes da lendária")
	check_eq(AmbientTraits.loyalty(walker), 4, "a lealdade dá o ritmo do pulso")
	var token: Dictionary = _card("Soldier", "Token Creature — Soldier", [], {"token": true})
	check_eq(AmbientTraits.pick(token), [M.TOKEN] as Array[int], "ficha prateada")
	var morph: Dictionary = _card("", "Creature", ["FLYING"], {"faceDown": true})
	check(AmbientTraits.pick(morph).is_empty() and not AmbientTraits.hovers(morph), "virada para baixo não entrega nada")


func test_only_the_top_of_a_pile_and_attachments_show() -> void:
	var bears: Array = [_card("Grizzly Bears", "Creature — Bear", ["TRAMPLE"]), _card("Grizzly Bears", "Creature — Bear", ["TRAMPLE"])]
	var host: Dictionary = _card("Llanowar Elves", "Creature — Elf")
	var aura: Dictionary = _card("Rancor", "Enchantment — Aura", [], {"attachedTo": host["id"]})
	var mine: Array = bears + [host, aura]
	var state: Dictionary = _state(mine)
	var shown: Dictionary = AmbientTraits.visible_cards(state["players"][0], BadgeSpec.context(state))
	check_eq((shown["tops"] as Dictionary).keys(), [int(bears[1]["id"]), int(host["id"])], "a de cima do monte e o hospedeiro")
	check_eq((shown["attached"] as Dictionary).get(int(aura["id"])), int(host["id"]), "a aura sabe de quem é")


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func test_table_layers_float_and_quiet_moments() -> void:
	var was_enabled: bool = AmbientFx.enabled
	var was_quality: int = Fx.quality
	AmbientFx.enabled = true
	AmbientFx._pref_loaded = true
	Fx.quality = 2
	var table := _table()
	var drake: Dictionary = _card("Wind Drake", "Creature — Drake", ["FLYING"])
	var myr: Dictionary = _card("Darksteel Myr", "Artifact Creature — Myr", ["INDESTRUCTIBLE"])
	var bear: Dictionary = _card("Grizzly Bears", "Creature — Bear")
	var calm: Dictionary = _state([drake, myr, bear])
	table.apply_state(calm)
	var ambient: AmbientFx = table.get_node("AmbientFx")
	check_eq(ambient.stats(), {"cards": 2, "emitters": 0, "hovering": 1}, "o urso sem nada fica sem camada")
	check_eq(ambient.modes_of(int(myr["id"])), [M.INDESTRUCTIBLE] as Array[int], "o myr brilha em dourado")
	var node: CardNode = table.card_node(int(drake["id"]))
	check(node.float_node().get_parent() == node.get_child(0), "o desenho que paira fica dentro do desenho da carta")
	check(node.float_node().get_node_or_null("Ambient") != null, "a camada vai junto com o desenho")
	# Pilha com algo: tudo baixa para 30%; voltou a calma, volta.
	var busy: Dictionary = _state([drake, myr, bear], [], {"stack": [{"id": 900, "text": "Shock", "controller": 1}]})
	table.apply_state(busy)
	check_eq(ambient.global_gain(), AmbientFx.QUIET_GAIN, "momento grande: os efeitos baixam")
	table.apply_state(calm)
	check_eq(ambient.global_gain(), 1.0, "calma de novo")
	# O drake saiu do campo: a camada some e o desenho volta para o lugar.
	table.apply_state(_state([myr, bear]))
	check_eq(ambient.stats()["cards"], 1, "só o myr")
	# A opção desligada apaga tudo.
	AmbientFx.enabled = false
	table.apply_state(calm)
	check_eq(ambient.stats()["cards"], 0, "desligado, nenhuma camada")
	AmbientFx.enabled = true
	Fx.quality = 0
	table.apply_state(calm)
	check_eq(ambient.stats()["cards"], 0, "nos efeitos leves também não")
	AmbientFx.enabled = was_enabled
	Fx.quality = was_quality
	table.catalog.queue_free()
	table.queue_free()


func test_particle_budget_per_side() -> void:
	var was_quality: int = Fx.quality
	var was_enabled: bool = AmbientFx.enabled
	AmbientFx.enabled = true
	AmbientFx._pref_loaded = true
	Fx.quality = 2
	var table := _table()
	var mine: Array = []
	var theirs: Array = []
	for i: int in 10:
		mine.append(_card("Child of Night %d" % i, "Creature — Vampire", ["LIFELINK"]))
		theirs.append(_card("Boggart Brute %d" % i, "Creature — Goblin", ["MENACE"], {"controller": 1}))
	table.apply_state(_state(mine, theirs))
	var ambient: AmbientFx = table.get_node("AmbientFx")
	check_eq(ambient.stats()["emitters"], AmbientFx.EMITTERS_MINE + AmbientFx.EMITTERS_DUEL, "o orçamento de cada lado")
	Fx.quality = 1
	table.apply_state(_state(mine, theirs))
	check_eq(ambient.stats()["emitters"], 0, "no médio, só o shader")
	check_eq(ambient.stats()["cards"], 20, "mas todas com a camada")
	Fx.quality = was_quality
	AmbientFx.enabled = was_enabled
	table.catalog.queue_free()
	table.queue_free()


func test_far_opponents_get_one_gameplay_effect() -> void:
	var token: Dictionary = _card("Soldier", "Token Creature — Soldier", ["LIFELINK", "VIGILANCE"], {"token": true})
	check_eq(AmbientTraits.pick(token, {}, true), [M.LIFELINK] as Array[int], "longe: um efeito só")
	var plain: Dictionary = _card("Soldier", "Token Creature — Soldier", [], {"token": true, "counters": {"P1P1": 1}})
	check(AmbientTraits.pick(plain, {}, true).is_empty(), "longe: ficha e +1/+1 não acendem")
