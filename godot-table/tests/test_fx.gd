# Efeitos e sons: o mapa de evento para som segue o da mesa do navegador, os sons carregam e a cor da carta sai do custo.
extends "res://tests/test_case.gd"


func test_sound_cues_follow_the_web_table() -> void:
	check_eq(Sounds.cue_for({"type": "damage", "targets": {"players": [1]}}, 0), "player-hit", "golpe no jogador")
	check_eq(Sounds.cue_for({"type": "damage", "targets": {"cards": [5]}}, 0), "impact", "golpe na criatura")
	check_eq(Sounds.cue_for({"type": "left", "reason": "destroyed", "to": "Graveyard"}, 0), "shatter", "destruída")
	check_eq(Sounds.cue_for({"type": "left", "to": "Exile"}, 0), "exile", "exilada")
	check_eq(Sounds.cue_for({"type": "entered", "card": {"keywords": ["FLYING"]}}, 0), "wing", "voadora entrando")
	check_eq(Sounds.cue_for({"type": "turn", "actor": 0}, 0), "turn-self", "seu turno")
	check_eq(Sounds.cue_for({"type": "counters", "counter": "M1M1", "delta": 1}, 0), "counter-bad", "marcador ruim")
	check_eq(Sounds.cue_for({"type": "priority"}, 0), "", "prioridade não tem som")


func test_sounds_load_from_the_project() -> void:
	var sounds := Sounds.new()
	for cue: String in ["cast", "impact", "victory"]:
		check(sounds._stream(cue) != null, "o som %s carrega" % cue)
	sounds.free()


func test_card_color_comes_from_the_mana_cost() -> void:
	check(Fx.card_color({"manaCost": "{R}"}).r > 0.9, "vermelha")
	check(Fx.card_color({"manaCost": "{1}{U}"}).b > 0.9, "azul")
	check_eq(Fx.card_color({"manaCost": "{W}{U}"}), Color(1.0, 0.8, 0.3), "multicolorida é dourada")
