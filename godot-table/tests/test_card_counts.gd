# O valor que a carta conta na mesa no PC: o selo na mão, na pilha e no campo (sem a redução do próprio custo no campo),
# a devoção com o disco da cor, o mínimo que já vale em verde, de quem é a contagem e a frase no inspetor.
extends "res://tests/test_case.gd"

## Terror Tolariano: custa {1} a menos por mágica instantânea ou feitiço no seu cemitério.
const TERROR_COUNT := {"of": "cards", "zone": "graveyard", "whose": "you", "types": ["Instant", "Sorcery"], "qualities": [], "value": 4,
	"uses": [{"use": "costLess", "amount": 4}]}
const GOD_COUNT := {"of": "devotion", "colors": ["U"], "value": 3, "uses": [{"use": "creature", "min": 5}]}
const SCOURGE_COUNT := {"of": "cards", "zone": "battlefield", "whose": "opponents", "types": ["Creature"], "qualities": [], "value": 2,
	"uses": [{"use": "pt", "power": "+2", "toughness": "+2"}]}


func _ctx() -> Dictionary:
	return BadgeSpec.context({"you": 0, "players": [{"id": 0, "name": "Você", "battlefield": []}, {"id": 1, "name": "Ana", "battlefield": []}], "stack": []})


func test_tolarian_terror_counts_in_hand_but_not_on_the_field() -> void:
	var terror: Dictionary = {"id": 5, "name": "Tolarian Terror", "controller": 0, "counts": [TERROR_COUNT]}
	var chips: Array = BadgeSpec.count_chips(terror, _ctx())
	check_eq(chips.size(), 1, "na mão: o selo do cemitério")
	check_eq(chips[0]["text"], "4", "com o número")
	check_eq(chips[0]["icon"], "tally", "e os risquinhos")
	check_eq(chips[0]["name"], "Cartas de mágica instantânea ou cartas de feitiço no seu cemitério: 4. Custa 4 a menos.", "a frase inteira")
	check_eq(BadgeSpec.count_chips(terror, _ctx(), true), [], "no campo, a redução do próprio custo já não muda nada")


func test_devotion_shows_the_color_and_the_minimum() -> void:
	var god: Dictionary = {"id": 6, "name": "Thassa, God of the Sea", "controller": 0, "creature": false, "counts": [GOD_COUNT]}
	var chip: Dictionary = BadgeSpec.count_chips(god, _ctx(), true)[0]
	check_eq(chip["text"], "3/5", "devoção contra o mínimo")
	check_eq(chip["icon"], "mana_U", "o disco azul")
	check_eq(chip["fg"], BadgeSpec.DEVOTION_INK, "ainda sem valer")
	var met: Dictionary = GOD_COUNT.duplicate(true)
	met["value"] = 6
	god["counts"] = [met]
	check_eq((BadgeSpec.count_chips(god, _ctx(), true)[0] as Dictionary)["fg"], BadgeSpec.COUNT_MET, "verde quando já vale")
	check_eq(CardIcons.icon_body("mana_UR").count("<path"), 2, "duas cores: meio a meio")


func test_the_field_shows_counts_with_whose_they_are() -> void:
	var scourge: Dictionary = {"id": 7, "name": "Scourge", "controller": 1, "creature": true, "power": 3, "toughness": 3, "counts": [SCOURGE_COUNT]}
	var spec: Dictionary = BadgeSpec.for_card(scourge, _ctx())
	var chip: Dictionary = (spec["top_right"] as Array)[0]
	check_eq(chip["text"], "2", "o número no canto de cima")
	check_eq(chip["name"], "Criaturas que os oponentes de Ana controlam: 2. Dá +2/+2.", "do ponto de vista de quem a controla")
	scourge["faceDown"] = true
	check_eq(BadgeSpec.count_chips(scourge, _ctx(), true), [], "virada para baixo: nada")


func test_the_inspector_explains_the_count() -> void:
	var terror: Dictionary = {"id": 5, "name": "Tolarian Terror", "controller": 0, "counts": [TERROR_COUNT]}
	var ctx: Dictionary = {"you": 0, "state": {"players": [{"id": 0, "battlefield": []}]}}
	check((CardDetails.build(terror, ctx)["notes"] as PackedStringArray).has("Cartas de mágica instantânea ou cartas de feitiço no seu cemitério: 4. Custa 4 a menos."), "na mão, a frase vai nas notas")
	ctx["state"] = {"players": [{"id": 0, "battlefield": [terror]}]}
	check(not (CardDetails.build(terror, ctx)["notes"] as PackedStringArray).has("Cartas de mágica instantânea ou cartas de feitiço no seu cemitério: 4. Custa 4 a menos."), "no campo, não")


func test_the_hand_card_draws_its_count_seal() -> void:
	var node: CardNode = CardNode.new()
	Engine.get_main_loop().root.add_child(node)
	node.set_hand_info("{6}{U}", true, -4, BadgeSpec.count_chips({"counts": [TERROR_COUNT]}, _ctx()))
	var counts: Node3D = node.get("_counts")
	check(counts != null and counts.get_child_count() == 2, "o selo (fundo e número) deitado na carta")
	node.set_hand_info("{6}{U}", true, -4, [])
	check(node.get("_counts") == null, "sem contagem, o selo sai")
	node.queue_free()
