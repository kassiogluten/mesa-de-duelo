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
	for cue: String in ["cast", "impact", "victory", "creak", "tap"]:
		check(sounds._stream(cue) != null, "o som %s carrega" % cue)
	sounds.free()


func test_card_color_comes_from_the_mana_cost() -> void:
	check(Fx.card_color({"manaCost": "{R}"}).r > 0.9, "vermelha")
	check(Fx.card_color({"manaCost": "{1}{U}"}).b > 0.9, "azul")
	check_eq(Fx.card_color({"manaCost": "{W}{U}"}), Color(1.0, 0.8, 0.3), "multicolorida é dourada")


func test_turning_cards_sound_once_per_card_up_to_the_cap_and_once_for_an_untap_batch() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var sounds := Sounds.new()
	tree.root.add_child(sounds)
	var cards: Array = []
	for i: int in 6:
		var node := CardNode.new()
		tree.root.add_child(node)
		node.position = Vector3(i, 0, 0)
		cards.append(node)
	TapFx.turn_sound(sounds, cards, false)
	await tree.create_timer(TapFx.CLICK_DELAY - TapFx.SOUND_TOUCH + TapFx.SOUND_STAGGER * TapFx.SOUND_MAX + 0.05).timeout
	check_eq(_playing(sounds), TapFx.SOUND_MAX, "seis terras viradas para pagar: no máximo SOUND_MAX sons")
	for p: AudioStreamPlayer3D in sounds._players:
		p.stop()
	TapFx.turn_sound(sounds, cards, true)
	await tree.create_timer(TapFx.CLICK_DELAY - TapFx.SOUND_TOUCH + 0.05).timeout
	check_eq(_playing(sounds), 1, "desvirar no começo do turno: um som só")
	for node: CardNode in cards:
		node.queue_free()
	sounds.queue_free()


func _playing(sounds: Sounds) -> int:
	var n: int = 0
	for p: AudioStreamPlayer3D in sounds._players:
		if p.playing and p.stream == sounds._stream("tap"):
			n += 1
	return n
