# Testes do inspetor de carta: os textos montados de uma carta do estado, o painel aberto e os símbolos de mana.
extends "res://tests/test_case.gd"

const ANGEL := {"id": 7, "name": "Serra Angel", "manaCost": "{3}{W}{W}", "typeLine": "Creature — Angel", "creature": true,
	"power": 6, "toughness": 6, "basePower": 4, "baseToughness": 4, "damage": 2, "tapped": false, "token": true,
	"keywords": ["FLYING", "VIGILANCE", "LANDWALK", "SPLIT_SECOND"], "landwalk": ["Swamp", "Forest.Snow"],
	"counters": {"P1P1": 2, "Flying": 1}, "copyOf": "Clone", "owner": 1, "controller": 0, "attachedTo": 40,
	"text": "Flying, vigilance (12)"}


func _ctx() -> Dictionary:
	var pt: Dictionary = {
		"Serra Angel": {"label": "Anjo de Serra", "type_line": "Criatura — Anjo", "text": "Voar, vigilância"},
		"Clone": {"label": "Clone", "type_line": "Criatura — Metamorfo", "text": ""},
	}
	return {
		"lookup": func(name: String) -> Dictionary: return pt.get(name, {}),
		"you": 0,
		"player_name": func(id: int) -> String: return "você" if id == 0 else "Oponente",
		"card_name": func(id: int) -> String: return "Floresta" if id == 40 else "",
	}


func test_creature_details_in_portuguese() -> void:
	var d: Dictionary = CardDetails.build(ANGEL, _ctx())
	check_eq(d["name"], "Anjo de Serra", "nome impresso em português")
	check_eq(d["type"], "Criatura — Anjo", "tipo em português")
	check_eq(d["text"], "Voar, vigilância", "texto em português (o do catálogo vence o do Forge)")
	check_eq(d["cost"], "{3}{W}{W}", "custo")
	check_eq([d["power"], d["toughness"], d["base"], d["damage"]], ["6", "6", "4/4", 2], "força atual, base e dano marcado")
	check_eq(d["keywords"], PackedStringArray(["Voar", "Vigilância", "Travessia de pântano e de floresta da neve", "Split second"]), "palavras-chave")
	check_eq(d["counters"], PackedStringArray(["+1/+1 × 2", "Voar × 1"]), "marcadores com nome")
	var notes: PackedStringArray = d["notes"]
	check(notes.has("Ficha."), "nota de ficha")
	check(notes.has("Cópia de Clone."), "nota de cópia")
	check(notes.has("Anexada a Floresta."), "nota de anexada, com o nome da carta")
	check(notes.has("Pertence a Oponente; quem a controla agora é você. Volta para Oponente quando o efeito de controle acabar."), "nota de controle trocado")


func test_forge_text_loses_the_card_ids() -> void:
	var d: Dictionary = CardDetails.build(ANGEL, {})
	check_eq(d["name"], "Serra Angel", "sem o catálogo, o nome do servidor")
	check_eq(d["text"], "Flying, vigilance", "o id interno da carta sai do texto")
	check_eq(d["type"], "Creature — Angel", "o tipo do servidor")


func test_face_down_cards() -> void:
	var theirs: Dictionary = CardDetails.build({"id": 3, "faceDown": true, "faceDownKind": "morph", "power": 2, "toughness": 2, "creature": true}, _ctx())
	check(bool(theirs["hidden"]), "a virada para baixo do oponente fica escondida")
	check_eq(theirs["name"], "Metamorfose", "diz como foi virada")
	check_eq([theirs["power"], theirs["toughness"]], ["2", "2"], "a 2/2")
	var mine: Dictionary = CardDetails.build({"id": 4, "faceDown": true, "power": 2, "toughness": 2, "creature": true,
		"hiddenFace": {"name": "Serra Angel"}}, _ctx())
	check(not bool(mine["hidden"]), "a sua virada para baixo mostra a frente")
	check_eq(mine["name"], "Anjo de Serra", "o nome da frente escondida")
	check((mine["notes"] as PackedStringArray).has("Virada para baixo: só você pode ver qual carta é."), "e avisa que só você vê")


func test_open_inspector_lists_everything() -> void:
	var tree: SceneTree = Engine.get_main_loop()
	var inspector := CardInspector.new()
	tree.root.add_child(inspector)
	inspector.open(ANGEL, _ctx(), "")
	check(inspector.is_open(), "o inspetor abre")
	var text: String = "\n".join(inspector.open_text())
	for part: String in ["Anjo de Serra", "Criatura — Anjo", "Voar, vigilância", "6 / 6", "Base: 4/4", "2 de dano marcado",
			"Vigilância", "Marcadores: +1/+1 × 2", "Ficha.", "Anexada a Floresta."]:
		check(text.contains(part), "o inspetor mostra \"%s\"" % part)
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	tree.root.push_input(escape)
	check(not inspector.is_open(), "Esc fecha o inspetor")
	inspector.queue_free()


func test_mana_symbols() -> void:
	check_eq(ManaSymbols.parse("{2}{G}{w/u}{T}"), PackedStringArray(["2", "G", "W/U", "T"]), "símbolos do custo")
	for symbol: String in ["W", "U", "B", "R", "G", "C", "0", "7", "12", "X", "T", "W/U", "G/P", "??"]:
		var tex: Texture2D = ManaSymbols.texture(symbol, 32)
		check(tex != null and tex.get_width() == 32, "o ícone de {%s} desenha" % symbol)
	var label := RichTextLabel.new()
	ManaSymbols.append_rich(label, "{T}: adicione {G}.", 16)
	var parsed: String = label.get_parsed_text()
	check(parsed.contains(": adicione") and not parsed.contains("{"), "os símbolos viram imagens no texto (veio \"%s\")" % parsed)
	label.free()
