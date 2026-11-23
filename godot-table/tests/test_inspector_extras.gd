# Testes do que o inspetor ganhou na segunda rodada: tipo mudado, faces da carta (virar), cartas ligadas com a seta de
# voltar, o Apontar, o rodapé de teclas e a raridade e as faces no catálogo.
extends "res://tests/test_case.gd"

## Como /api/cartas manda uma carta de duas faces (Delver), com a impressão em português.
const DELVER := {"name": "Delver of Secrets // Insectile Aberration", "rarity": "common", "layout": "transform",
	"type_line": "Creature — Human Wizard // Creature — Human Insect",
	"card_faces": [
		{"name": "Delver of Secrets", "mana_cost": "{U}", "type_line": "Creature — Human Wizard", "oracle_text": "At the beginning of your upkeep…",
			"power": "1", "toughness": "1", "image_uris": {"normal": "http://127.0.0.1:9/delver-frente.jpg"}},
		{"name": "Insectile Aberration", "mana_cost": "", "type_line": "Creature — Human Insect", "oracle_text": "Flying",
			"power": "3", "toughness": "2", "image_uris": {"normal": "http://127.0.0.1:9/delver-verso.jpg"}}],
	"pt": {"card_faces": [
		{"printed_name": "Investigador de Segredos", "printed_type_line": "Criatura — Humano Mago", "printed_text": "No início de sua manutenção…"},
		{"printed_name": "Aberração Insetídea", "printed_type_line": "Criatura — Humano Inseto", "printed_text": "Voar"}]}}


## Um catálogo só com estas cartas (`in_tree`: posto na árvore antes, porque ao entrar ele lê o que está guardado no disco).
func _catalog(in_tree: bool = false) -> CardCatalog:
	var catalog := CardCatalog.new()
	if in_tree:
		(Engine.get_main_loop() as SceneTree).root.add_child(catalog)
	catalog._info = {
		"Delver of Secrets // Insectile Aberration": CardCatalog._entry(DELVER),
		"Shivan Dragon": {"label": "Dragão de Shiv", "type_line": "Criatura — Dragão", "text": "Voar", "image": "http://127.0.0.1:9/shivan.jpg", "rarity": "rare"},
		"Oblivion Ring": {"label": "Anel do Esquecimento", "type_line": "Encantamento", "text": "Exile.", "image": "", "rarity": "uncommon"},
	}
	catalog._info["Delver of Secrets"] = catalog._info["Delver of Secrets // Insectile Aberration"]
	return catalog


func _ctx(catalog: CardCatalog, state: Dictionary, pointed: Array) -> Dictionary:
	return {"lookup": catalog.info, "you": 0, "state": state, "player_name": func(id: int) -> String: return "você" if id == 0 else "Ana",
		"card_name": func(_id: int) -> String: return "", "point": func(id: int) -> void: pointed.append(id)}


func _state(mine: Array, exile: Array = [], other_ai: bool = false) -> Dictionary:
	return {"you": 0, "gameOver": false, "stack": [], "players": [
		{"id": 0, "name": "Você", "battlefield": mine, "exile": [], "graveyard": [], "hand": []},
		{"id": 1, "name": "Ana", "ai": other_ai, "battlefield": [], "exile": exile, "graveyard": [], "hand": []}]}


func test_type_change_wording() -> void:
	check_eq(TypeChange.text(TypeChange.between("Basic Land — Forest", "Basic Land Creature — Forest Elemental"), {"creature": true, "power": 3, "toughness": 3}),
		"agora também Criatura — Elemental 3/3", "terreno que virou criatura")
	check_eq(TypeChange.text(TypeChange.between("Creature — Elf Druid", "Land")), "agora é Terreno; não é mais Criatura", "criatura que virou só terreno")
	check_eq(TypeChange.text(TypeChange.between("Artifact — Equipment", "Artifact Creature — Equipment Golem"), {}), "agora também Criatura — Golem",
		"sem força conhecida, sem o P/T")
	check(TypeChange.between("Creature — Human Wizard // Creature — Human Insect", "Creature — Human Insect").is_empty(), "a face transformada não é tipo ganho")
	check(TypeChange.between("Creature — Shapeshifter", "Creature — Shapeshifter").is_empty(), "sem mudança")
	check_eq(TypeChange.permanent_text({"printedType": "Creature — Shapeshifter", "typeLine": "Creature — Shapeshifter (All)", "keywords": ["CHANGELING"]}), "",
		"o changeling não conta como mudança")
	var forest: Dictionary = CardDetails.build({"name": "Forest", "printedType": "Basic Land — Forest", "typeLine": "Basic Land Creature — Forest Elemental",
		"creature": true, "power": 3, "toughness": 3}, {})
	check_eq(forest["type_change"], "agora também Criatura — Elemental 3/3", "os detalhes trazem o tipo mudado")


func test_catalog_keeps_rarity_and_faces() -> void:
	var entry: Dictionary = CardCatalog._entry(DELVER)
	check_eq(entry["rarity"], "common", "raridade")
	check_eq(entry["layout"], "transform", "layout")
	var faces: Array = entry["faces"]
	check_eq(faces.size(), 2, "duas faces")
	check_eq([faces[1]["name"], faces[1]["label"], faces[1]["type_line"], faces[1]["text"], faces[1]["power"]],
		["Insectile Aberration", "Aberração Insetídea", "Criatura — Humano Inseto", "Voar", "3"], "o verso em português")
	check(Txt.of(faces[1]["image"]).ends_with("delver-verso.jpg"), "a imagem do verso")
	check((CardCatalog._entry({"name": "Sol Ring", "rarity": "uncommon"})["faces"] as Array).is_empty(), "carta de uma face, sem faces")
	var catalog := _catalog()
	check_eq(int(catalog.face_of("Insectile Aberration").get("index", -1)), 1, "acha a carta pelo nome do verso")
	check(catalog.face_of("Shivan Dragon").is_empty(), "carta de uma face não é face de nada")
	catalog.free()


func test_card_sides() -> void:
	var catalog := _catalog()
	var front: Dictionary = CardFaces.sides({"id": 1, "name": "Delver of Secrets"}, catalog)
	check_eq([front.get("kind"), front.get("shown")], ["dfc", 0], "a frente à mostra")
	var back: Dictionary = CardFaces.sides({"id": 1, "name": "Insectile Aberration"}, catalog)
	check_eq(back.get("shown"), 1, "transformada: o verso à mostra")
	var printed: Dictionary = CardFaces.sides({"id": 1, "name": "Delver of Secrets", "print": {"set": "MID", "cn": "47"}}, catalog)
	check((printed["urls"] as PackedStringArray)[1].ends_with("&face=back"), "a impressão escolhida vira com face=back")
	check(CardFaces.sides({"id": 2, "name": "Shivan Dragon"}, catalog).is_empty(), "carta de uma face não vira")
	check(CardFaces.sides({"id": 3, "faceDown": true}, catalog).is_empty(), "virada para baixo não vira")
	var lookup: Callable = CardFaces.lookup(catalog, catalog.info)
	check_eq(Txt.of(lookup.call("Insectile Aberration").get("label")), "Aberração Insetídea", "o nome da face à mostra")
	check_eq(Txt.of(lookup.call("Delver of Secrets").get("text")), "No início de sua manutenção…", "o texto só da face à mostra")
	catalog.free()


func test_linked_cards_and_pointing() -> void:
	var ring := {"id": 30, "name": "Oblivion Ring", "exiling": [301]}
	var angel := {"id": 31, "name": "Serra Angel"}
	var aura := {"id": 32, "name": "Rancor", "attachedTo": 31, "exiling": [302]}
	var mutant := {"id": 33, "name": "Gemrazer", "merged": [{"id": 33, "name": "Gemrazer"}, {"id": 34, "name": "Llanowar Elves"}, {"id": 35, "faceDown": true}]}
	var state := _state([ring, angel, aura, mutant], [{"id": 301, "name": "Shivan Dragon"}, {"id": 302, "faceDown": true}])
	var label := func(name: String) -> String: return name
	var links: Array = CardLinks.of(ring, state, label)
	check_eq(links.size(), 1, "uma exilada")
	check_eq([links[0]["caption"], links[0]["card"]["name"]], ["Exilada por esta carta", "Shivan Dragon"], "a exilada pelo anel")
	var on_angel: Array = CardLinks.of(angel, state, label)
	check_eq([on_angel[0]["caption"], on_angel[0]["hidden"]], ["Exilada por Rancor, anexada a esta carta", true], "a exilada pela aura presa, virada para baixo")
	var host: Array = CardLinks.of(aura, state, label)
	check_eq(host.map(func(l: Dictionary) -> String: return l["caption"]), ["Exilada por esta carta", "A carta a que esta está anexada"], "a aura mostra a exilada e a carta em que está")
	var merged: Array = CardLinks.of(mutant, state, label)
	check_eq(merged.map(func(l: Dictionary) -> bool: return l["hidden"]), [false, true], "as de baixo da mutação, a virada sem nome")
	check(CardLinks.can_point(state, 30), "dá para apontar uma carta do campo")
	check(not CardLinks.can_point(state, 999), "nem uma carta que não está à mostra")
	check(not CardLinks.can_point(_state([ring], [], true), 30), "nem contra o computador sozinho")


func test_inspector_turns_links_back_and_points() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := _catalog(true)
	var inspector := CardInspector.new()
	inspector.catalog = catalog
	tree.root.add_child(inspector)
	var pointed: Array = []
	var delver := {"id": 10, "name": "Delver of Secrets", "creature": true, "power": 1, "toughness": 1, "exiling": [301], "controller": 0}
	var state := _state([delver], [{"id": 301, "name": "Shivan Dragon"}])
	inspector.open(delver, _ctx(catalog, state, pointed), "http://127.0.0.1:9/delver-frente.jpg")
	var text: String = "\n".join(inspector.open_text())
	for part: String in ["Investigador de Segredos", "Ver o verso", "Apontar", "Carta ligada", "Exilada por esta carta", "Dragão de Shiv",
			"vira a carta", "aponta para os outros jogadores"]:
		check(text.contains(part), "o inspetor mostra \"%s\"" % part)
	inspector.turn()
	await tree.create_timer(CardInspector.FLIP_TIME + 0.15).timeout
	check(inspector.turned(), "virou")
	text = "\n".join(inspector.open_text())
	check(text.contains("Aberração Insetídea") and text.contains("Voar") and text.contains("Ver a frente"), "o verso em português, com o botão de voltar à frente")
	inspector.open_link(CardLinks.find(state, 301))
	check_eq(inspector.back_depth(), 1, "abriu a ligada, com a seta de voltar")
	text = "\n".join(inspector.open_text())
	check(text.contains("Dragão de Shiv") and text.contains("volta à carta anterior"), "a ligada aberta e a tecla de voltar no rodapé")
	var backspace := InputEventKey.new()
	backspace.keycode = KEY_BACKSPACE
	backspace.pressed = true
	tree.root.push_input(backspace)
	check_eq(inspector.back_depth(), 0, "Backspace volta")
	check("\n".join(inspector.open_text()).contains("Investigador de Segredos"), "de volta à carta de antes, pela frente")
	var a_key := InputEventKey.new()
	a_key.keycode = KEY_A
	a_key.pressed = true
	tree.root.push_input(a_key)
	check_eq(pointed, [10], "A aponta a carta para os outros jogadores")
	check(not inspector.is_open(), "e fecha o inspetor")
	inspector.queue_free()
	catalog.queue_free()
	done = true
