# Testes de Meus decks: a leitura das listas coladas (cards/deck_list.gd), o arquivo dos decks (deck_library.gd) e as
# regras de junção com a conta (deck_merge.gd), nos mesmos casos dos testes da mesa do navegador.
extends "res://tests/test_case.gd"

const BOLT := [[4, "Lightning Bolt"], [56, "Mountain"]]
const NOW := "2026-10-28T12:00:00.000Z"


static func _deck(id: String, name: String, cards: Array, extra: Dictionary = {}) -> Dictionary:
	var out: Dictionary = {"id": id, "name": name, "format": "pauper", "cards": cards.map(func(c: Array) -> Dictionary: return {"name": c[1], "count": c[0]})}
	out.merge(extra, true)
	return out


static func _ids() -> Callable:
	var n: Array = [0]
	return func() -> String:
		n[0] += 1
		return "novo-%d" % n[0]


func test_arena_mtgo_and_tags_keep_main_and_sideboard() -> void:
	for text: String in ["Deck\n4 Lightning Bolt (M10) 146\n20 Mountain\n\nSideboard\n2 Duress", "4 Lightning Bolt\n20 Mountain\n\n2 Duress",
			"4x Lightning Bolt\n20 Mountain\nSB: 2 Duress", "4 Lightning Bolt\n20 Mountain\n2 Duress [Sideboard]"]:
		var parsed: Dictionary = DeckList.parse(text)
		check_eq(DeckList.count_entries(parsed["main"]), 24, "principal de %s" % text.c_escape())
		check_eq(parsed["sideboard"], [{"name": "Duress", "count": 2}], "sideboard de %s" % text.c_escape())
		check_eq(parsed["skipped"], [], "nada de fora em %s" % text.c_escape())


func test_malformed_counts_and_excluded_sections_are_reported() -> void:
	var parsed: Dictionary = DeckList.parse("Deck\n0 Lightning Bolt\n-1 Forest\n1.5 Island\n9007199254740992 Swamp\n4 Mountain\nMaybeboard\n2 Duress\nCommander\n1 Atraxa, Praetors' Voice")
	check_eq((parsed["skipped"] as Array).size(), 4, "linhas recusadas")
	check_eq((parsed["ignored"] as Array).size(), 1, "maybeboard ignorado")
	check_eq(parsed["commanders"], [{"name": "Atraxa, Praetors' Voice", "count": 1}], "comandante")
	check_eq(parsed["main"], [{"name": "Mountain", "count": 4}], "principal")


func test_printing_survives_and_export_reads_back() -> void:
	var parsed: Dictionary = DeckList.parse("3 Plains (DMU) 277\n2 Plains (ONE) 267\n1 Plains (DMU) 277\n1x Lightning Bolt (m10) 146 [Burn]\n1 Llanowar Elves (DOM)\n4 Shock")
	check_eq(parsed["main"], [
		{"name": "Plains", "count": 4, "set": "dmu", "cn": "277"}, {"name": "Plains", "count": 2, "set": "one", "cn": "267"},
		{"name": "Lightning Bolt", "count": 1, "set": "m10", "cn": "146"}, {"name": "Llanowar Elves", "count": 1, "set": "dom"},
		{"name": "Shock", "count": 4},
	], "uma linha por impressão")
	var deck: Dictionary = {"id": "x", "name": "Séries", "cards": parsed["main"]}
	check_eq(DeckList.export_list(deck), "Deck\n4 Plains (DMU) 277\n2 Plains (ONE) 267\n1 Lightning Bolt (M10) 146\n1 Llanowar Elves (DOM)\n4 Shock\n", "exportada")
	check_eq(DeckList.parse(DeckList.export_list(deck))["main"], parsed["main"], "ida e volta")


func test_commander_markers_do_not_make_a_sideboard_from_blank_lines() -> void:
	for marker: String in ["*CMDR*", "[Commander]"]:
		var parsed: Dictionary = DeckList.parse("1 Marwyn, the Nurturer (DOM) 172 %s\n\n99 Forest" % marker)
		check_eq(parsed["commanders"], [{"name": "Marwyn, the Nurturer", "count": 1, "set": "dom", "cn": "172"}], "comandante %s" % marker)
		check_eq(parsed["main"], [{"name": "Forest", "count": 99}], "principal %s" % marker)
		check_eq(parsed["sideboard"], [], "sem sideboard %s" % marker)


func test_promote_to_commander_swaps_and_keeps_the_total() -> void:
	var deck: Dictionary = {"id": "p", "format": "commander", "commanders": [{"name": "Krenko, Mob Boss", "count": 1}],
		"cards": [{"name": "Goblin Guide", "count": 1}, {"name": "Zada, Hedron Grinder", "count": 1, "set": "bfz", "cn": "162"}, {"name": "Mountain", "count": 30}]}
	check(DeckList.promote_to_commander(deck, "Zada, Hedron Grinder|bfz|162"), "promoveu")
	check_eq(deck["commanders"], [{"name": "Zada, Hedron Grinder", "count": 1, "set": "bfz", "cn": "162"}], "o novo comandante")
	check_eq(DeckList.total_size(deck), 33, "o total não muda")
	check((deck["cards"] as Array).any(func(e: Dictionary) -> bool: return e["name"] == "Krenko, Mob Boss"), "o antigo volta ao deck")
	check(not DeckList.promote_to_commander(deck, "Ninguém"), "carta que não está no deck")


func test_library_round_trip_keeps_the_browser_shape() -> void:
	var previous: String = DeckLibrary.path
	DeckLibrary.path = "user://test-decks.json"
	var old_sync: String = DeckSyncState.path
	DeckSyncState.path = "user://test-decks-sync.json"
	DeckSyncState.write({})
	var deck: Dictionary = _deck("a", "Burn", BOLT, {"sideboard": [{"name": "Pyroblast", "count": 2}]})
	check(DeckLibrary.save_all([deck, _deck("b", "Elfos", [[60, "Forest"]], {"format": "precon"})]), "gravou")
	var raw: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DeckLibrary.path))
	check_eq(int(raw["version"]), 2, "versão 2, como o localStorage")
	var loaded: Array = DeckLibrary.load_all()
	check_eq(loaded.size(), 2, "os dois decks")
	check_eq((loaded[0] as Dictionary)["cards"], deck["cards"], "cartas como inteiros")
	check_eq((loaded[1] as Dictionary)["format"], "commander", "precon vira commander")
	check_eq((loaded[1] as Dictionary)["sideboard"], [], "sempre com sideboard")
	check(not DeckLibrary.save_all([{"id": "", "name": "x", "cards": []}]), "deck sem id não grava")
	var file: FileAccess = FileAccess.open(DeckLibrary.path, FileAccess.WRITE)
	file.store_string('{"version": 2, "decks": [{"id": "ok", "name": "Ok", "cards": [{"name": "Forest", "count": 1}]}, {"id": "ruim", "cards": 3}]}')
	file.close()
	check_eq(DeckLibrary.load_all().size(), 1, "o registro estragado fica de lado")
	check(DeckLibrary.error() != "", "e há aviso")
	DeckLibrary.save_all(DeckLibrary.load_all())
	check_eq((JSON.parse_string(FileAccess.get_file_as_string(DeckLibrary.path))["recovery"] as Array).size(), 1, "sem perder o estragado")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(DeckLibrary.path))
	DeckLibrary.path = previous
	DeckSyncState.path = old_sync
	check(DeckLibrary.new_id().length() == 36 and DeckLibrary.new_id() != DeckLibrary.new_id(), "ids novos como os do navegador")


func test_fingerprint_ignores_ids_dates_order_and_case() -> void:
	var a: Dictionary = _deck("a", "Burn", BOLT, {"updatedAt": "2020", "importHistory": ["x"]})
	var b: Dictionary = _deck("b", "Burn ", [[56, "mountain"], [2, "Lightning Bolt"], [2, "lightning bolt"]])
	check_eq(DeckMerge.fingerprint(a), DeckMerge.fingerprint(b), "mesma impressão")
	check(DeckMerge.fingerprint(a) != DeckMerge.fingerprint(_deck("a", "Burn 2", BOLT)), "o nome conta")
	check(DeckMerge.fingerprint(a) != DeckMerge.fingerprint(_deck("a", "Burn", BOLT, {"format": "free"})), "o formato conta")


func test_joining_keeps_every_deck() -> void:
	var account: Array = [_deck("1", "Burn", BOLT), _deck("2", "Elfos", [[60, "Forest"]]), _deck("9", "Só na conta", [[60, "Swamp"]])]
	var edited_here: Dictionary = _deck("2", "Elfos", [[59, "Forest"], [1, "Llanowar Elves"]])
	var local: Array = [_deck("3", "Fadas", [[60, "Island"]]), edited_here, _deck("x", "Burn", BOLT)]
	var joined: Dictionary = DeckMerge.join_account(local, account, _ids(), NOW)
	check_eq((joined["decks"] as Array).map(func(d: Dictionary) -> Array: return [d["id"], d["name"]]),
		[["3", "Fadas"], ["2", "Elfos"], ["novo-1", "Elfos" + DeckMerge.COPY_SUFFIX], ["1", "Burn"], ["9", "Só na conta"]], "a ordem e as cópias")
	check_eq(((joined["decks"] as Array)[2] as Dictionary)["cards"], edited_here["cards"], "a edição daqui vira a cópia")
	check_eq((joined["upload"] as Array).map(func(d: Dictionary) -> String: return d["id"]), ["3", "novo-1"], "o que sobe")
	check_eq(edited_here["name"], "Elfos", "a entrada não muda")


func test_push_conflicts_and_remote_changes() -> void:
	var mine: Dictionary = _deck("1", "Burn", [[60, "Mountain"]])
	var theirs: Dictionary = _deck("1", "Burn", BOLT)
	check_eq(DeckMerge.resolve_conflict(mine, null, _ids(), NOW), {"keep": mine, "resend": mine, "copy": null}, "editar vence apagar lá")
	check_eq(DeckMerge.resolve_conflict(null, theirs, _ids(), NOW), {"keep": theirs, "resend": null, "copy": null}, "editar vence apagar aqui")
	var both: Dictionary = DeckMerge.resolve_conflict(mine, theirs, _ids(), NOW)
	check_eq((both["copy"] as Dictionary)["name"], "Burn" + DeckMerge.COPY_SUFFIX, "duas edições ficam as duas")
	var local: Array = [_deck("1", "A", BOLT), _deck("2", "B", BOLT), _deck("3", "C", BOLT)]
	var out: Array = DeckMerge.apply_remote(local, [
		{"id": "1", "deck": _deck("1", "A editado", BOLT)}, {"id": "2", "deleted": true}, {"id": "3", "deck": _deck("3", "C de lá", BOLT)},
		{"id": "4", "deck": _deck("4", "Novo", BOLT)}, {"id": "5", "deleted": true},
	], {"3": true})
	check_eq(out.map(func(d: Dictionary) -> Array: return [d["id"], d["name"]]), [["4", "Novo"], ["1", "A editado"], ["3", "C"]], "aplica o que mudou lá")
	check_eq(local.size(), 3, "a entrada não muda")
