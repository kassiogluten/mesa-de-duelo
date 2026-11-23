# Testes da tela Meus decks (menu/deck_screen.gd) e da importação por texto (deck_import_dialog.gd), com a conferência
# do servidor de mentira e os decks num arquivo de teste.
extends "res://tests/test_case.gd"

var _screen: DeckScreen
var _paths: Array = []


static func _deck(id: String, name: String, format: String, cards: Array, commanders: Array = []) -> Dictionary:
	return {"id": id, "name": name, "format": format, "cards": cards, "sideboard": [], "commanders": commanders}


## O servidor confere: sem comandante no Commander, o deck tem problema; "Carta Inventada" não existe.
static func _fake_validation(format: String, deck: Dictionary) -> Dictionary:
	var issues: Array = []
	for e: Dictionary in deck["cards"]:
		if e["name"] == "Carta Inventada":
			issues.append({"code": "unknown-card", "message": "Carta não encontrada no motor de regras.", "card": e["name"], "section": "main"})
	if format == "commander" and (deck["commanders"] as Array).is_empty():
		issues.append({"code": "commander-count", "message": "Escolha um comandante ou dois com uma parceria válida.", "section": "commander"})
	return {"type": "validation", "validation": {"valid": issues.is_empty(), "issues": issues}}


func _setup(decks: Array) -> void:
	_paths = [DeckLibrary.path, DeckSyncState.path]
	DeckLibrary.path = "user://test-screen-decks.json"
	DeckSyncState.path = "user://test-screen-sync.json"
	DeckSyncState.write({})
	DeckLibrary.save_from_account(decks)
	_screen = DeckScreen.new()
	_screen.checker = DeckCheck.new()
	_screen.checker.requester = _fake_validation
	_screen.add_child(_screen.checker)
	(Engine.get_main_loop() as SceneTree).root.add_child(_screen)


func _teardown() -> void:
	_screen.queue_free()
	if FileAccess.file_exists(DeckLibrary.path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(DeckLibrary.path))
	DeckLibrary.path = _paths[0]
	DeckSyncState.path = _paths[1]
	done = true


func _rows() -> Array:
	return _screen.find_children("*", "DeckRow", true, false)


func test_lists_decks_by_format_with_the_validity_mark() -> void:
	done = false
	_setup([
		_deck("a", "Burn", "standard", [{"name": "Mountain", "count": 60}]),
		_deck("b", "Elfos", "standard", [{"name": "Forest", "count": 59}, {"name": "Carta Inventada", "count": 1}]),
		_deck("c", "Krenko", "commander", [{"name": "Mountain", "count": 100}]),
	])
	await (Engine.get_main_loop() as SceneTree).process_frame
	var rows: Array = _rows()
	check_eq(rows.size(), 3, "uma linha por deck")
	var marks: Dictionary = {}
	for row: DeckRow in rows:
		var mark: Label = row.get_child(0).get_child(2)
		marks[row.deck["id"]] = mark.text
	check_eq(marks, {"a": "Válido", "b": "Com problemas", "c": "Com problemas"}, "a marca de cada um")
	var elfos: DeckRow = rows.filter(func(r: DeckRow) -> bool: return r.deck["id"] == "b")[0]
	check((elfos.get_child(0).get_child(2) as Label).tooltip_text.contains("Carta Inventada"), "a dica diz qual carta falta")
	check((elfos.find_child("Play", true, false) as Button).disabled, "deck com problema não joga")
	check_eq(DeckRow.size_text(_deck("x", "x", "standard", [{"name": "A", "count": 60}])), "60 cartas", "contagem")
	_teardown()


func test_delete_asks_first_and_can_be_undone() -> void:
	done = false
	_setup([_deck("a", "Burn", "standard", [{"name": "Mountain", "count": 60}]), _deck("b", "Elfos", "standard", [{"name": "Forest", "count": 60}])])
	var modal: MenuModal = _screen._ask_delete(DeckLibrary.load_all()[0])
	await (Engine.get_main_loop() as SceneTree).process_frame
	check_eq(DeckLibrary.load_all().size(), 2, "perguntar não apaga")
	(modal.find_child("Remove", true, false) as Button).pressed.emit()
	check_eq(DeckLibrary.load_all().map(func(d: Dictionary) -> String: return d["name"]), ["Elfos"], "excluiu")
	_screen.undo_delete()
	check_eq(DeckLibrary.load_all().map(func(d: Dictionary) -> String: return d["name"]), ["Burn", "Elfos"], "Desfazer devolve no lugar")
	_teardown()


func test_import_reads_checks_and_saves() -> void:
	done = false
	_setup([])
	var dialog: DeckImportDialog = _screen.open_import()
	dialog.set_list("Deck\n4 Lightning Bolt (M10) 146\n55 Mountain\n1 Carta Inventada\n\nSideboard\n2 Duress\nMaybeboard\n1 Opt", "Burn", "pauper")
	dialog._on_review()
	await (Engine.get_main_loop() as SceneTree).process_frame
	var texts: PackedStringArray = []
	for label: Label in dialog.find_children("*", "Label", true, false):
		texts.append(label.text)
	var all: String = "\n".join(texts)
	check(all.contains("Deck principal: 60 · Sideboard: 2"), "as contagens")
	check(all.contains("Cartas não reconhecidas"), "as cartas desconhecidas")
	check(all.contains("1 Opt"), "a linha que ficou de fora")
	dialog._on_save()
	var saved: Array = DeckLibrary.load_all()
	check_eq(saved.size(), 1, "o deck entrou em Meus decks")
	check_eq((saved[0] as Dictionary)["format"], "pauper", "no formato escolhido")
	check_eq((saved[0] as Dictionary)["unresolved"], ["Carta Inventada"], "a carta desconhecida fica marcada")
	check_eq(((saved[0] as Dictionary)["cards"] as Array)[0], {"name": "Lightning Bolt", "count": 4, "set": "m10", "cn": "146"}, "com a impressão")
	_teardown()


func test_commander_import_picks_the_commander() -> void:
	done = false
	_setup([])
	var dialog: DeckImportDialog = _screen.open_import()
	dialog.set_list("1 Krenko, Mob Boss\n99 Mountain", "Goblins", "commander")
	dialog._on_review()
	var picker: OptionButton = dialog.find_children("*", "OptionButton", true, false).filter(func(o: OptionButton) -> bool: return o.item_count == 2)[0]
	picker.select(1)
	picker.item_selected.emit(1)
	await (Engine.get_main_loop() as SceneTree).process_frame
	dialog._on_save()
	var saved: Dictionary = DeckLibrary.load_all()[0]
	check_eq(saved["commanders"], [{"name": "Krenko, Mob Boss", "count": 1}], "o comandante escolhido")
	check_eq(DeckList.forge_deck(saved)["commanders"], saved["commanders"], "vai na partida")
	_teardown()
