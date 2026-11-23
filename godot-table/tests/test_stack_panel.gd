# Testes do painel da pilha: "N itens", os números das camadas de baixo, a lista que anima entradas e saídas, o texto que
# não cobre a caixa de ação, "Você pode responder", o item sob o mouse aceso na mesa e a galeria em tela cheia.
extends "res://tests/test_case.gd"


func _panel(avoid: Rect2 = Rect2()) -> StackPanel:
	var tree: SceneTree = Engine.get_main_loop()
	var panel := StackPanel.new()
	panel.avoid_rect = func() -> Rect2: return avoid
	tree.root.add_child(panel)
	return panel


func _cleanup(panel: StackPanel) -> void:
	if is_instance_valid(panel.gallery):
		panel.gallery.queue_free()
	panel.queue_free()


func _state(stack: Array, input: Dictionary = {"gen": 7, "priority": true}) -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		players.append({"id": pid, "name": "Você" if pid == 0 else "Ana", "life": 20, "battlefield": [{"id": 500 + pid, "name": "Soul Warden"}], "hand": [], "graveyard": [], "exile": []})
	return {"you": 0, "players": players, "stack": stack, "input": input, "events": []}


func _items(count: int) -> Array:
	var out: Array = []
	var kinds: Array = ["spell", "trigger", "ability"]
	for i: int in count:
		var id: int = 100 + count - i
		out.append({"id": id, "kind": kinds[i % 3], "controller": i % 2, "source": {"id": 900 + id, "name": "Lightning Bolt"},
			"text": "Lightning Bolt deals 3 damage to any target.", "targets": {"players": [1]}})
	return out


func test_header_says_how_many_items_and_lower_layers_are_numbered() -> void:
	check_eq(StackHeader.count_label(1), "1 item", "um item")
	check_eq(StackHeader.count_label(3), "3 itens", "vários itens")
	var panel: StackPanel = _panel()
	panel.apply_state(_state(_items(2)))
	check_eq(panel.header().count_text(), "2 itens", "o cabeçalho diz quantos itens")
	check_eq(panel.layer_chips().texts(), PackedStringArray(["2"]), "dois itens: a camada de baixo leva o 2")
	panel.apply_state(_state(_items(5)))
	check_eq(panel.layer_chips().texts(), PackedStringArray(["2", "3", "4", "+1"]), "cinco itens: três camadas e o +1")
	var top: Rect2 = panel.layer_rect(0)
	var below: Rect2 = panel.layer_rect(1)
	check(top.position.x - below.position.x >= 20.0 and top.position.y - below.position.y >= 20.0, "a camada de baixo aparece numa faixa larga")
	check(panel.layer_rect(StackPanel.MAX_PEEK).position.x >= panel.get_viewport_rect().size.x - StackPanel.MARGIN_RIGHT - StackPanel.WIDTH, "a última camada fica dentro do painel")
	_cleanup(panel)


func test_rows_follow_the_stack_and_the_resolved_one_leaves() -> void:
	done = false
	var panel: StackPanel = _panel()
	var items: Array = _items(3)
	panel.apply_state(_state(items.slice(1)))
	var rows: StackRows = panel.find_children("*", "StackRows", true, false)[0]
	check_eq(rows.row_ids(), [101], "com dois itens, a lista tem o de baixo")
	panel.apply_state(_state(items))
	check_eq(rows.row_ids(), [102, 101], "o item coberto entra no começo da lista e o outro desce")
	panel.apply_state(_state(items.slice(1)))
	check_eq(rows.row_ids(), [101], "o topo resolveu: o que estava em cima sobe para o topo")
	var tree: SceneTree = Engine.get_main_loop()
	await tree.create_timer(StackRows.SLIDE_TIME + 0.2).timeout
	check_eq(rows.get_children().filter(func(n: Node) -> bool: return n is Button).size(), 1, "as linhas que saíram somem de vez")
	_cleanup(panel)
	done = true


func test_text_never_covers_the_action_box() -> void:
	done = false
	var view: Vector2 = (Engine.get_main_loop() as SceneTree).root.get_visible_rect().size
	var box := Rect2(view.x - 364, view.y - 300, 340, 276)
	var panel: StackPanel = _panel(box)
	var items: Array = _items(5)
	(items[0] as Dictionary)["text"] = "Lightning Bolt - " + "This spell costs {1} more to cast for each target beyond the first. ".repeat(6)
	panel.apply_state(_state(items))
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).create_timer(StackRows.SLIDE_TIME + 0.1).timeout
	var info: Rect2 = panel.info_rect()
	check(info.end.y <= box.position.y, "o texto termina antes da caixa de ação (%.0f ≤ %.0f)" % [info.end.y, box.position.y])
	_cleanup(panel)
	done = true


func test_clip_lines_cuts_with_ellipsis() -> void:
	var label := Hud._label(16, Color.WHITE)
	label.custom_minimum_size = Vector2(200, 0)
	var long: String = "palavra ".repeat(60).strip_edges()
	var cut: String = StackPanel.clip_lines(long, label, 2)
	check(cut.ends_with("…") and cut.length() < long.length(), "texto longo ganha reticências")
	check_eq(StackPanel.clip_lines("curto", label, 2), "curto", "texto curto fica igual")
	label.free()


func test_can_respond_when_your_priority_against_an_opponent_item() -> void:
	var items: Array = _items(1)
	(items[0] as Dictionary)["controller"] = 1
	check(StackStyle.can_respond(_state(items)), "a vez é sua e o topo é do oponente")
	(items[0] as Dictionary)["controller"] = 0
	check(not StackStyle.can_respond(_state(items)), "o topo é seu")
	(items[0] as Dictionary)["controller"] = 1
	check(not StackStyle.can_respond(_state(items, {"gen": 1, "priority": false})), "sem a vez")
	check_eq(StackStyle.item_color({"kind": "trigger"}), Hud.GOLD, "gatilho dourado, como na presença 3D")


func test_focus_knows_the_card_and_targets_of_an_item() -> void:
	var spell := {"id": 5, "kind": "spell", "source": {"id": 77}, "targets": {"cards": [12], "players": [1]}}
	check_eq(StackFocus.card_key(spell), 77, "a mágica é a própria carta")
	check_eq(StackFocus.card_key({"id": 6, "kind": "trigger", "source": {"id": 77}}), "stack:6", "o gatilho é a carta da pilha")
	check_eq(StackFocus.target_keys(spell), [12, "player:1"], "os alvos: cartas e retratos")


func test_clicking_a_stack_card_opens_the_gallery_unless_it_is_a_choice() -> void:
	done = false
	var panel: StackPanel = _panel()
	await (Engine.get_main_loop() as SceneTree).process_frame
	var items: Array = _items(3)
	panel.apply_state(_state(items, {"gen": 9, "priority": false, "selectableStacks": [101]}))
	var node := CardNode.new()
	node.data = {"stackId": 101}
	check(not panel.handle_card_click(node), "a escolhível segue para a mesa (manda o stack)")
	node.data = {"stackId": 103}
	check(panel.handle_card_click(node), "a outra abre a galeria")
	check(panel.gallery.is_open(), "galeria aberta")
	var texts: String = "\n".join(panel.gallery.texts())
	check(texts.contains("Resolve primeiro") and texts.contains("Alvo: Ana"), "a galeria mostra a ordem e os alvos")
	check(texts.contains("Selecionar como alvo"), "o item escolhível tem o botão")
	var sent: Array = []
	panel.action.connect(func(m: Dictionary) -> void: sent.append(m))
	panel.gallery.call("_choose", 101, 9)
	check_eq(sent, [{"type": "stack", "id": 101, "gen": 9}], "a mensagem é a mesma da mesa do navegador")
	check(not panel.gallery.is_open(), "escolher fecha a galeria")
	panel.open_gallery()
	panel.apply_state(_state([]))
	check(not panel.gallery.is_open(), "a pilha vazia fecha a galeria")
	node.free()
	_cleanup(panel)
	done = true
