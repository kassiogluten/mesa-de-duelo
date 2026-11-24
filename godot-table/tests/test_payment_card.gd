# A carta que se está pagando: quando aparece junto da caixa de ação, quando acende a permanente de origem em vez disso,
# o custo com o já pago apagado, a posição acima da caixa (e fora do painel da pilha) e o voo de volta para a mão.
extends "res://tests/test_case.gd"

const SPELL := {"id": 50, "name": "Cultivate", "typeLine": "Sorcery", "manaCost": "{2}{G}"}


func _state(input: Dictionary, extra: Dictionary = {}) -> Dictionary:
	var me: Dictionary = {"id": 0, "name": "Você", "hand": [{"id": 40, "name": "Forest"}], "battlefield": [{"id": 10, "name": "Rogue's Passage", "land": true}]}
	var them: Dictionary = {"id": 1, "name": "Oponente", "hand": [], "battlefield": [{"id": 20, "name": "Shivan Dragon"}]}
	var state: Dictionary = {"you": 0, "players": [me, them], "stack": [], "input": input}
	state.merge(extra, true)
	return state


func _paying(card: Dictionary, remaining: String, total: String = "") -> Dictionary:
	var cost: Dictionary = {"remaining": remaining}
	if total != "":
		cost["total"] = total
	return {"gen": 3, "paying": true, "payingFor": "spell", "card": card, "manaCost": cost}


func test_spell_being_paid_shows_with_its_cost() -> void:
	var d: Dictionary = PaymentCard.decide(_state(_paying(SPELL, "{2}{G}")))
	check_eq(d.get("mode"), "show", "a mágica que saiu da mão aparece")
	check_eq(d.get("cost"), [{"symbol": "2", "paid": false}, {"symbol": "G", "paid": false}], "nada pago: tudo aceso")


func test_paid_symbols_dim() -> void:
	check_eq(PaymentCard.cost_symbols({"remaining": "{1}", "total": "{2}{G}"}),
		[{"symbol": "1", "paid": false}, {"symbol": "1", "paid": true}, {"symbol": "G", "paid": true}], "genérica paga em parte vira duas")
	check_eq(PaymentCard.cost_symbols({"remaining": "{G}", "total": "{2}{G}"}),
		[{"symbol": "2", "paid": true}, {"symbol": "G", "paid": false}], "a genérica paga e a verde que falta")
	check_eq(PaymentCard.cost_symbols({"remaining": "{U}", "total": "{U}{U}"}),
		[{"symbol": "U", "paid": false}, {"symbol": "U", "paid": true}], "cores repetidas")
	check_eq(PaymentCard.cost_symbols({"remaining": "0", "total": "{1}{R}"}),
		[{"symbol": "1", "paid": true}, {"symbol": "R", "paid": true}], "tudo pago")


func test_ability_of_a_permanent_lights_the_source() -> void:
	var input: Dictionary = _paying({"id": 10, "name": "Rogue's Passage"}, "{4}")
	input["payingFor"] = "ability"
	var s: Dictionary = _state(input)
	check_eq(PaymentCard.decide(s).get("mode"), "source", "a permanente no campo não ganha cópia")
	check_eq(PaymentCard.source_id(s), 10, "ela acende como origem")
	var roles: Dictionary = DecisionRoles.build(s, BlockFlow.new(), AttackFlow.new())
	check_eq(TableHighlights.role_of(10, -1, roles), "source", "o papel de origem chega à mesa")
	check_eq(PaymentCard.source_id(_state(_paying(SPELL, "{2}{G}"))), -1, "a mágica sendo paga não acende nada no campo")


func test_non_mana_costs_show_the_card() -> void:
	var input: Dictionary = {"gen": 4, "card": SPELL, "selectable": [40], "selection": {"cards": [], "min": 1, "max": 1}, "message": "Discard a card"}
	var d: Dictionary = PaymentCard.decide(_state(input))
	check_eq(d.get("mode"), "show", "descartar como custo mostra a carta")
	check_eq(d.get("cost"), [], "sem custo de mana: sem símbolos")


func test_when_nothing_shows() -> void:
	check_eq(PaymentCard.decide(_state({"gen": 1, "priority": true, "card": SPELL})), {}, "com a prioridade, nada")
	var face_down: Dictionary = SPELL.duplicate()
	face_down["faceDown"] = true
	check_eq(PaymentCard.decide(_state(_paying(face_down, "{3}"))), {}, "carta virada para baixo não aparece")
	check_eq(PaymentCard.decide(_state(_paying(SPELL, "{2}{G}"), {"question": {"id": 1}})), {}, "com uma pergunta aberta, a janela dela mostra")
	var resolving: Dictionary = {"stack": [{"id": 9, "kind": "spell", "resolving": true, "source": SPELL}]}
	check_eq(PaymentCard.decide(_state({"gen": 2, "card": SPELL, "selectable": [40]}, resolving)), {}, "a do topo da pilha já está grande no painel")
	check_eq(PaymentCard.decide(_state({"gen": 2, "card": SPELL, "selectable": [40]}, resolving), true).get("mode"), "show", "com a pilha recolhida, volta a aparecer")
	var targeting: Dictionary = {"gen": 2, "targeting": {"source": 10, "card": {"id": 10, "name": "Rogue's Passage"}}, "selectable": [20]}
	check_eq(PaymentCard.decide(_state(targeting)), {}, "mirando de uma permanente: ela já fica selecionada")
	var casting: Dictionary = {"gen": 2, "targeting": {"source": 50, "card": SPELL}, "selectable": [20]}
	check_eq(PaymentCard.decide(_state(casting)).get("mode"), "show", "mirando com a mágica que saiu da mão: ela aparece")


func _screen(rect: Rect2, avoid: Array = []) -> PaymentCard:
	var tree: SceneTree = Engine.get_main_loop()
	var card := PaymentCard.new()
	card.anchor = func() -> Rect2: return rect
	card.avoid = func() -> Array: return avoid
	tree.root.add_child(card)
	return card


func test_sits_above_the_action_box_and_beside_the_stack() -> void:
	var box := Rect2(1556, 860, 340, 196)
	var card: PaymentCard = _screen(box)
	card.apply_state(_state(_paying(SPELL, "{1}", "{2}{G}")))
	var rect: Rect2 = card.target_rect()
	check(rect.end.y <= box.position.y - PaymentCard.GAP + 0.5, "acima da caixa, sem cobri-la")
	check(absf(rect.end.x - box.end.x) < 0.5, "encostada à direita da caixa")
	check(rect.size.y >= PaymentCard.HEIGHT - 0.5, "grande")
	check_eq(card.shown_cost().map(func(s: Dictionary) -> bool: return s["paid"]), [false, true, true], "o custo desenhado apaga o pago")
	var stack := Rect2(1524, 0, 396, 1080)
	card.avoid = func() -> Array: return [stack]
	rect = card.target_rect()
	check(not rect.intersects(stack), "com a pilha aberta, fica fora dela")
	check(rect.end.x <= stack.position.x, "à esquerda do painel")
	card.queue_free()


func test_hides_after_the_payment_ends() -> void:
	done = false
	var card: PaymentCard = _screen(Rect2(1556, 860, 340, 196))
	card.apply_state(_state(_paying(SPELL, "{2}{G}")))
	check_eq(int(card.shown_card().get("id", -1)), 50, "à vista enquanto paga")
	card.apply_state(_state({"gen": 5}))
	check_eq(int(card.shown_card().get("id", -1)), 50, "um estado sem pedido logo depois do clique não a tira na hora")
	await (Engine.get_main_loop() as SceneTree).create_timer(PaymentCard.HIDE_DELAY + 0.1).timeout
	check(card.shown_card().is_empty(), "depois de um instante, some")
	card.queue_free()
	done = true


func test_flies_back_to_the_hand_when_given_up() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	var card: PaymentCard = _screen(Rect2(1556, 860, 340, 196))
	card.table = table
	var paying: Dictionary = _state(_paying(SPELL, "{2}{G}"))
	table.apply_state(paying)
	card.apply_state(paying)
	await tree.process_frame
	var back: Dictionary = _state({"gen": 6, "priority": true})
	((back["players"] as Array)[0] as Dictionary)["hand"] = [{"id": 40, "name": "Forest"}, SPELL]
	table.apply_state(back)
	card.apply_state(back)
	var node: CardNode = table.card_node(50)
	check(node != null and not node.visible, "a carta da mão fica escondida enquanto a outra voa")
	check(card.shown_card().is_empty(), "a carta junto da caixa já foi embora")
	await tree.create_timer(PaymentCard.FLY_HOME_TIME + 0.2).timeout
	check(node != null and is_instance_valid(node) and node.visible, "ao chegar, a carta da mão aparece")
	card.queue_free()
	table.queue_free()
	catalog.queue_free()
	done = true
