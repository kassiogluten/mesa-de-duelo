# Som de cada tipo de criatura: segue a tabela e a regra da mesa do navegador (src/ui/creatureTouches.ts) e os arquivos carregam.
extends "res://tests/test_case.gd"


func _creature(type_line: String, extra: Dictionary = {}) -> Dictionary:
	var card: Dictionary = {"id": 1, "name": "X", "typeLine": type_line, "creature": true}
	card.merge(extra, true)
	return card


func _file(cue: String) -> String:
	return cue.get_file()


func test_common_types_get_their_sound() -> void:
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Bear"))), "bear.mp3", "urso")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Elf Druid"))), "elf.mp3", "elfo druida")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Dragon"))), "dragon.mp3", "dragão")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Werewolf"))), "wolf.mp3", "lobisomem uiva como o lobo")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Unicorn"))), "horse.mp3", "unicórnio relincha")
	check_eq(_file(CreatureSounds.cue_for(_creature("Legendary Creature — Dog"))), "dog.mp3", "lendária conta igual")
	check_eq(_file(CreatureSounds.cue_for(_creature("Artifact Creature — Bat"))), "bat.mp3", "criatura artefato")
	check_eq(CreatureSounds.cue_for(_creature("Creature — Angel")), "res://data/audio/criaturas/angel.mp3", "caminho inteiro")


func test_first_printed_subtype_with_a_touch_wins() -> void:
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Human Werewolf"))), "wolf.mp3", "Human não tem som: vale o seguinte")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Zombie Dog"))), "zombie.mp3", "o primeiro impresso")
	check_eq(CreatureSounds.cue_for(_creature("Creature — Spider Elf")), "", "a aranha tem toque mas não som, e vence o elfo")
	check_eq(_file(CreatureSounds.cue_for(_creature("Creature — Elf // Creature — Wolf"))), "elf.mp3", "só a face à mostra")


func test_silent_cards() -> void:
	check_eq(CreatureSounds.cue_for(_creature("Creature — Human Soldier")), "", "tipos comuns ficam em silêncio")
	check_eq(CreatureSounds.cue_for(_creature("Creature")), "", "sem subtipo")
	check_eq(CreatureSounds.cue_for(_creature("Creature — Bear", {"faceDown": true})), "", "virada para baixo")
	check_eq(CreatureSounds.cue_for({"typeLine": "Tribal Instant — Goblin", "creature": false}), "", "não criatura")
	check_eq(CreatureSounds.cue_for({}), "", "carta vazia")


func test_event_counts_tokens_entering_together_once() -> void:
	var tokens: Dictionary = {"type": "entered", "entries": [_creature("Creature — Human Soldier"), _creature("Creature — Squirrel"), _creature("Creature — Bear")]}
	check_eq(_file(CreatureSounds.cue_for_event(tokens)), "squirrel.mp3", "a primeira ficha com toque")
	check_eq(_file(CreatureSounds.cue_for_event({"type": "entered", "card": _creature("Creature — Goblin Scout")})), "goblin.mp3", "entrada de uma carta")
	check_eq(CreatureSounds.cue_for_event({"type": "left", "card": _creature("Creature — Goblin")}), "", "só a entrada tem som")


func test_every_sound_file_loads() -> void:
	var files: Dictionary = {}
	for type: String in CreatureSounds.TOUCHES:
		if Txt.of(CreatureSounds.TOUCHES[type]) != "":
			files[CreatureSounds.TOUCHES[type]] = true
	check(files.size() >= 20, "mais de 20 sons (%d)" % files.size())
	for name: Variant in files:
		var path: String = "%s/%s.mp3" % [CreatureSounds.DIR, Txt.of(name)]
		check(CreatureSounds.stream_for(path) != null, "o som %s carrega" % path)


func test_play_uses_its_own_player_under_sounds() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var sounds := Sounds.new()
	tree.root.add_child(sounds)
	sounds.volume = 0.5
	var before: int = sounds.get_child_count()
	CreatureSounds.play(sounds, _creature("Creature — Wolf"), Vector3(2, 0, 1))
	check_eq(sounds.get_child_count(), before + 1, "um tocador a mais")
	CreatureSounds.play(sounds, _creature("Creature — Human"), Vector3.ZERO)
	check_eq(sounds.get_child_count(), before + 1, "sem som, sem tocador")
	sounds.volume = 0.0
	CreatureSounds.play(sounds, _creature("Creature — Wolf"), Vector3.ZERO)
	check_eq(sounds.get_child_count(), before + 1, "mudo não toca")
	sounds.queue_free()
