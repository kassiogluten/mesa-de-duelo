# Destaque da pilha: a cor de cada item, os anulados (sem a onda de resolver) e as chaves de tipos diferentes.
extends "res://tests/test_case.gd"


func test_item_color_follows_the_card_and_triggers_are_gold() -> void:
	check_eq(StackPresence._color_of({"kind": "trigger", "source": {"manaCost": "{U}"}}), Hud.GOLD, "gatilho é dourado")
	check_eq(StackPresence._color_of({"kind": "spell", "source": {"manaCost": "{R}"}}), Fx.card_color({"manaCost": "{R}"}), "mágica na cor da carta")
	check_eq(StackPresence._color_of({"kind": "ability", "source": {"manaCost": "{G}"}}), Fx.card_color({"manaCost": "{G}"}), "habilidade na cor da fonte")


func test_countered_items_are_found_by_card_and_stack_id() -> void:
	var ids: Dictionary = StackPresence._countered_ids({"events": [
		{"type": "countered", "card": {"id": 150}, "stackId": 9001},
		{"type": "resolved", "card": {"id": 151}, "stackId": 9002}]})
	check(ids.has(150), "a carta anulada")
	check(ids.has(9001) and ids.has("stack:9001"), "o item anulado da pilha")
	check(not ids.has(151), "a que resolveu fica de fora")


func test_keys_of_different_types_never_match() -> void:
	check(StackPresence._same(5, 5), "mesmo número")
	check(StackPresence._same("stack:5", "stack:5"), "mesmo texto")
	check(not StackPresence._same(5, "stack:5"), "número e texto não se comparam")
	check(not StackPresence._same(5, null), "nada no topo antes")
