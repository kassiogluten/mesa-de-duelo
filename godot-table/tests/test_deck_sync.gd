# Testes da sincronia de Meus decks com a conta (net/deck_sync.gd) contra uma conta de mentira que responde como as
# rotas /api/conta/estado e /api/conta/sincronizar do servidor (AccountDecks.java), sem rede e sem login de verdade.
extends "res://tests/test_case.gd"

var _sync: DeckSync
var _server: FakeAccount
var _paths: Array = []


## A conta no servidor: cada deck com a revisão dele; apagar guarda a revisão (como a lixeira).
class FakeAccount extends RefCounted:
	var rev: int = 0
	var decks: Dictionary = {}
	var offline: bool = false
	var calls: Array = []

	func put(deck: Dictionary) -> void:
		rev += 1
		decks[deck["id"]] = {"rev": rev, "deck": deck.duplicate(true)}

	func remove(id: String) -> void:
		rev += 1
		decks[id] = {"rev": rev, "apagado": true}

	func handle(method: String, path: String, body: Variant) -> Dictionary:
		calls.append("%s %s" % [method, path])
		if offline:
			return {"offline": true}
		if method == "GET" and path.begins_with("estado"):
			var since: int = int(path.get_slice("/", 1)) if path.contains("/") else -1
			var out: Array = []
			for id: String in decks:
				var entry: Dictionary = decks[id]
				if int(entry["rev"]) > since and (since >= 0 or not entry.has("apagado")):
					out.append({"id": id, "rev": entry["rev"], "deck": entry.get("deck"), "apagado": entry.get("apagado", false)} if entry.has("apagado")
						else {"id": id, "rev": entry["rev"], "deck": (entry["deck"] as Dictionary).duplicate(true)})
			return {"status": 200, "data": {"rev": rev, "decks": out}}
		if method == "POST" and path == "sincronizar":
			var applied: Array = []
			var conflicts: Array = []
			for change: Dictionary in (body as Dictionary)["mudancas"]:
				var id: String = change["id"]
				var entry: Variant = decks.get(id)
				var current: int = int((entry as Dictionary)["rev"]) if entry is Dictionary else 0
				if current != int(change["base"]):
					conflicts.append({"id": id, "rev": current, "deck": (entry as Dictionary).get("deck")} if entry is Dictionary and (entry as Dictionary).has("deck")
						else {"id": id, "rev": current, "apagado": true})
					continue
				if bool(change.get("apagar", false)):
					remove(id)
				else:
					put(change["deck"])
				applied.append({"id": id, "rev": decks[id]["rev"]})
			return {"status": 200, "data": {"rev": rev, "aplicadas": applied, "conflitos": conflicts, "recusadas": []}}
		return {"status": 404, "data": {"error": "Rota desconhecida."}}


static func _deck(id: String, name: String, card: String) -> Dictionary:
	return {"id": id, "name": name, "format": "pauper", "cards": [{"name": card, "count": 60}], "sideboard": []}


func _setup() -> void:
	_paths = [DeckLibrary.path, DeckSyncState.path, DeckSyncState.account_id]
	DeckLibrary.path = "user://test-sync-decks.json"
	DeckSyncState.path = "user://test-sync-state.json"
	DeckSyncState.account_id = func() -> String: return "conta-1"
	DeckSyncState.write({})
	DeckLibrary.save_from_account([])
	_server = FakeAccount.new()
	_sync = DeckSync.new()
	_sync.transport = _server.handle
	_sync.signed_in = func() -> bool: return true
	(Engine.get_main_loop() as SceneTree).root.add_child(_sync)


func _teardown() -> void:
	_sync.queue_free()
	for path: String in [DeckLibrary.path, DeckSyncState.path]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	DeckLibrary.path = _paths[0]
	DeckSyncState.path = _paths[1]
	DeckSyncState.account_id = _paths[2]
	done = true


static func _names(decks: Array) -> Array:
	return decks.map(func(d: Dictionary) -> String: return Txt.of(d["name"]))


func test_first_login_joins_without_losing_a_deck() -> void:
	done = false
	_setup()
	_server.put(_deck("b", "Elfos", "Forest"))
	_server.put(_deck("c", "Só na conta", "Swamp"))
	DeckLibrary.save_all([_deck("a", "Fadas", "Island"), _deck("b", "Elfos", "Llanowar Elves")])
	await _sync.run()
	check_eq(_names(DeckLibrary.load_all()), ["Fadas", "Elfos", "Elfos" + DeckMerge.COPY_SUFFIX, "Só na conta"], "todos os decks ficam")
	check_eq(_server.decks.size(), 4, "o daqui e a cópia sobem")
	check(_server.decks.has("a"), "o deck só daqui foi para a conta")
	check_eq(DeckSyncState.pending_count(), 0, "nada esperando")
	check_eq(_sync.kind, "ok", "sincronizado")
	check_eq(_sync.text, "Sincronizado", "o texto")
	_teardown()


func test_local_changes_go_up_and_remote_ones_come_down() -> void:
	done = false
	_setup()
	DeckLibrary.save_all([_deck("a", "Fadas", "Island")])
	await _sync.run()
	var decks: Array = DeckLibrary.load_all()
	(decks[0] as Dictionary)["name"] = "Fadas novas"
	decks.append(_deck("n", "Novo", "Plains"))
	DeckLibrary.save_all(decks)
	check_eq(DeckSyncState.pending_count(), 2, "a gravação marca o que mudou")
	await _sync.run()
	check_eq((_server.decks["a"]["deck"] as Dictionary)["name"], "Fadas novas", "a edição subiu")
	check(_server.decks.has("n"), "o deck novo subiu")
	# Outro aparelho apaga um e cria outro.
	_server.remove("a")
	_server.put(_deck("z", "De lá", "Mountain"))
	await _sync.run()
	check_eq(_names(DeckLibrary.load_all()), ["De lá", "Novo"], "o que mudou lá chega aqui")
	_teardown()


func test_conflict_keeps_both_versions() -> void:
	done = false
	_setup()
	DeckLibrary.save_all([_deck("a", "Burn", "Mountain")])
	await _sync.run()
	_server.put(_deck("a", "Burn", "Lightning Bolt"))
	var decks: Array = DeckLibrary.load_all()
	(decks[0] as Dictionary)["cards"] = [{"name": "Shock", "count": 60}]
	DeckLibrary.save_all(decks)
	await _sync.run()
	var local: Array = DeckLibrary.load_all()
	check_eq(_names(local), ["Burn", "Burn" + DeckMerge.COPY_SUFFIX], "a da conta e a cópia daqui")
	check_eq(((local[0] as Dictionary)["cards"] as Array)[0]["name"], "Lightning Bolt", "a da conta fica com o id")
	check_eq(((local[1] as Dictionary)["cards"] as Array)[0]["name"], "Shock", "a edição daqui não se perde")
	check(_server.decks.has((local[1] as Dictionary)["id"]), "a cópia sobe")
	_teardown()


func test_offline_keeps_decks_and_queue() -> void:
	done = false
	_setup()
	DeckLibrary.save_all([_deck("a", "Fadas", "Island")])
	await _sync.run()
	_server.offline = true
	var decks: Array = DeckLibrary.load_all()
	decks.append(_deck("n", "Novo", "Plains"))
	DeckLibrary.save_all(decks)
	await _sync.run()
	check_eq(_sync.kind, "offline", "sem conexão")
	check_eq(_sync.text, "Sem conexão · 1 mudança para enviar", "o texto")
	check_eq(DeckLibrary.load_all().size(), 2, "os decks daqui ficam")
	_server.offline = false
	await _sync.run()
	check(_server.decks.has("n"), "a fila sobe quando a conexão volta")
	check_eq(_sync.kind, "ok", "sincronizado de novo")
	_teardown()


func test_signed_out_does_nothing() -> void:
	done = false
	_setup()
	_sync.signed_in = func() -> bool: return false
	DeckLibrary.save_all([_deck("a", "Fadas", "Island")])
	await _sync.run()
	check_eq(_sync.kind, "off", "sem conta, sem sincronia")
	check(_server.calls.is_empty(), "nenhuma chamada")
	check_eq(DeckSyncState.pending_count(), 0, "nem fila")
	_teardown()
