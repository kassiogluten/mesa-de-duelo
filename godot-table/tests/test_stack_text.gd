# Testes do texto da pilha (text/stack_text.gd), com os mesmos casos de tests/stack*.test.mjs da mesa do navegador.
extends "res://tests/test_case.gd"


func _state() -> Dictionary:
	return {"you": 10, "players": [
		{"id": 10, "name": "Você", "battlefield": [{"id": 1, "name": "Llanowar Elves"}]},
		{"id": 23, "name": "Ana", "battlefield": [{"id": 2, "name": "Jace Beleren"}]}],
		"stack": [], "input": {"gen": 4, "priority": true, "ok": {"enabled": true}, "cancel": {"enabled": false}, "selectable": []}}


func test_badge_joins_kind_and_cast_form() -> void:
	check_eq(StackText.badge_text({"kind": "spell", "cast": {"mode": "flashback"}}), "Mágica · Flashback", "flashback")
	check_eq(StackText.badge_text({"kind": "spell", "cast": {"kicker": 2}}), "Mágica · Reforçada ×2", "reforçada duas vezes")
	check_eq(StackText.badge_text({"kind": "spell", "cast": {"x": 3}}), "Mágica · X=3", "o X")
	check_eq(StackText.badge_text({"kind": "ability", "loyalty": {"cost": "-3"}}), "Habilidade · −3", "custo de lealdade com o sinal tipográfico")
	check_eq(StackText.badge_text({"kind": "trigger"}), "Gatilho", "só o tipo")
	check_eq(StackText.badge_text({}), "", "servidor antigo, sem tipo")


func test_cast_line_lists_everything_paid() -> void:
	check_eq(StackText.cast_line({"mode": "flashback", "kicker": 2, "extras": ["buyback"], "x": 3}),
		"Conjurada por flashback, com reforço 2 vezes e com recompra. X = 3.", "frase completa")
	check_eq(StackText.cast_line({"kicker": 1}), "Conjurada com reforço.", "só o reforço")
	check_eq(StackText.cast_line(null), "", "custo normal")


func test_owner_line() -> void:
	check_eq(StackText.owner_line({"kind": "spell", "controller": 10}, 10, "Você"), "Sua mágica", "sua")
	check_eq(StackText.owner_line({"kind": "trigger", "controller": 23}, 10, "Ana"), "Gatilho de Ana", "do oponente")
	check_eq(StackText.owner_line({"controller": 23}, 10, "Ana"), "Ana", "sem tipo")


func test_loyalty_and_modes_use_the_portuguese_text() -> void:
	var pt := "+2: Cada jogador compra um card.\n−1: O jogador alvo compra um card.\n−10: O jogador alvo mói vinte cards."
	var strip: Dictionary = StackText.loyalty_strip({"kind": "ability", "loyalty": {"cost": "-1", "text": "Target player draws a card."}}, pt)
	check_eq(strip["cost"], "−1", "custo")
	check_eq(strip["tone"], "down", "tom")
	check_eq(strip["text"], "O jogador alvo compra um card.", "linha em português")
	check_eq(StackText.loyalty_strip({"loyalty": {"cost": "+2", "text": "Each player draws a card."}}, "")["text"], "Each player draws a card.", "sem texto em português, o do servidor")
	var charm := "Escolha um —\n• Vigie 2, depois compre um card.\n• Causa 1 ponto de dano a cada um de um ou dois alvos.\n• Devolva a permanente alvo."
	var rows: Array = StackText.mode_rows({"modes": [{"index": 2, "text": "Deals 1 damage."}]}, charm)
	check_eq(rows, [{"index": 2, "text": "Causa 1 ponto de dano a cada um de um ou dois alvos."}], "o modo em português")


func test_effect_text() -> void:
	check_eq(StackText.effect_text({"kind": "spell", "text": "Lightning Bolt - Deal 3."}, "Raio causa 3 pontos de dano."), "Raio causa 3 pontos de dano.", "mágica: o texto impresso")
	check_eq(StackText.effect_text({"kind": "trigger", "text": "Soul Warden (31) - You gain 1 life."}, ""), "You gain 1 life.", "sem o nome e o id do Forge")
	var gargadon := {"kind": "ability", "line": 1, "text": "x", "source": {"text": "Suspend 10—{R}\r\n\r\nSacrifice a land: Remove a time counter."}}
	check_eq(StackText.effect_text(gargadon, "Suspender 10—{R}\n\nSacrifique um terreno: Remova um marcador de tempo."), "Remova um marcador de tempo.", "habilidade: a linha dela sem o custo")


func test_targets_text_names_cards_then_players() -> void:
	var label := func(n: String) -> String: return {"Llanowar Elves": "Elfos de Llanowar"}.get(n, n)
	check_eq(StackText.targets_text(_state(), {"players": [23], "cards": [1]}, label), "Alvos: Elfos de Llanowar, Ana", "dois alvos")
	check_eq(StackText.targets_text(_state(), {"players": [10]}, label), "Alvo: Você", "um alvo")
	check_eq(StackText.targets_text(_state(), {}, label), "", "sem alvos")


func test_resolving_choice_says_who_decides() -> void:
	var state := _state()
	state["stack"] = [{"id": 5, "kind": "spell", "resolving": true}]
	check_eq(StackText.top_label(state), "Resolve primeiro", "com a prioridade, ninguém escolhe")
	state["input"] = {"gen": 5, "priority": false, "ok": {"enabled": false}, "cancel": {"enabled": false}, "selectable": [1]}
	check_eq(StackText.top_label(state), "Aguardando sua escolha", "a escolha é sua")
	state["input"] = {"gen": 5, "priority": false, "ok": {"enabled": false}, "cancel": {"enabled": false}, "selectable": []}
	state["deciding"] = [{"player": 23, "kind": "choice"}]
	check_eq(StackText.top_label(state), "Ana está escolhendo", "a escolha é do oponente")
	state["stack"] = [{"id": 5, "kind": "spell"}]
	check_eq(StackText.top_label(state), "Resolve primeiro", "fora da resolução")


func test_group_keeps_order_and_joins_equal_neighbours() -> void:
	var life := {"kind": "trigger", "controller": 10, "text": "Soul Warden - You gain 1 life.", "source": {"name": "Soul Warden"}}
	var bolt := {"id": 1, "kind": "spell", "controller": 23, "text": "Bolt", "source": {"name": "Lightning Bolt"}}
	var a: Dictionary = life.duplicate()
	a["id"] = 2
	var b: Dictionary = life.duplicate()
	b["id"] = 3
	var c: Dictionary = life.duplicate()
	c["id"] = 4
	var groups: Array = StackText.group([bolt, a, b, c])
	check_eq(groups.size(), 2, "o raio e os três gatilhos")
	check_eq(int(groups[0]["at"]), 0, "o topo primeiro")
	check_eq(int(groups[1]["count"]), 3, "três iguais juntos")
	check_eq(StackText.group([bolt, a, b, c], [3]).size(), 4, "o escolhível fica sozinho e corta o grupo")
