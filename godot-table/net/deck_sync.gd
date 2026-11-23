# Sincronia de Meus decks com a conta (porte de src/conta/sync.ts): os decks vivem neste computador e a conta é uma réplica.
# Cada gravação marca o que mudou (DeckSyncState); aqui se envia a fila, se busca o que mudou em outros aparelhos e se
# resolvem os conflitos pelas regras de DeckMerge. Sem rede, a fila espera a próxima vez.
class_name DeckSync
extends Node

const ForgeClient := preload("res://net/forge_client.gd")

## off (sem conta), ok, sending, offline ou error; `text` é o que o jogador lê.
signal status_changed(kind: String, text: String)
## Os decks deste computador mudaram por causa da conta (redesenhar as listas).
signal decks_changed

## Junta as gravações seguidas num envio só.
const DEBOUNCE_S := 1.5
## De quanto em quanto tempo buscar o que mudou em outros aparelhos.
const PULL_EVERY_S := 300.0

## (método, caminho depois de /api/conta/, corpo ou null) → {status, data} ou {offline: true}. Os testes trocam por um
## servidor de mentira; o padrão fala com o servidor por HTTP, com o token da AccountSession.
var transport: Callable
## Há conta logada? Os testes trocam.
var signed_in: Callable = func() -> bool: return AccountSession.signed_in()

var kind: String = "off"
var text: String = ""
## Aviso de um deck que a conta recusou (o motivo vem do servidor); some quando o jogador vê.
var notice: String = ""
var _running: bool = false
var _again: bool = false
var _debounce: Timer
var _pull_timer: Timer


func _init() -> void:
	transport = _http


func _ready() -> void:
	_debounce = Timer.new()
	_debounce.one_shot = true
	_debounce.wait_time = DEBOUNCE_S
	_debounce.timeout.connect(run)
	add_child(_debounce)
	_pull_timer = Timer.new()
	_pull_timer.wait_time = PULL_EVERY_S
	_pull_timer.timeout.connect(run)
	add_child(_pull_timer)
	_pull_timer.start()


## Uma tela gravou decks: envia daqui a pouco (se há conta).
func schedule() -> void:
	if _debounce and bool(signed_in.call()):
		_debounce.start()


## Um ciclo inteiro: primeiro login, envio da fila e busca do que mudou. Só um de cada vez.
func run() -> void:
	if _running:
		_again = true
		return
	_running = true
	await _cycle()
	_running = false
	if _again:
		_again = false
		run()


func _set_status(next_kind: String, next_text: String) -> void:
	kind = next_kind
	text = next_text
	status_changed.emit(kind, text)


func _cycle() -> void:
	if not bool(signed_in.call()):
		_set_status("off", "")
		return
	var conta: String = Txt.of(DeckSyncState.account_id.call())
	var state: Dictionary = DeckSyncState.read()
	var outcome: Dictionary = {}
	if state.is_empty() or Txt.of(state.get("conta")) != conta:
		_set_status("sending", "Sincronizando…")
		outcome = await _first_login(conta)
	if outcome.is_empty() and not (DeckSyncState.read().get("pendentes", {}) as Dictionary).is_empty():
		_set_status("sending", "Sincronizando…")
		outcome = await _push(DeckSyncState.read())
	if outcome.is_empty():
		outcome = await _pull(DeckSyncState.read())
	if outcome.is_empty():
		_set_status("ok", "Sincronizado")
	elif bool(outcome.get("offline", false)):
		var pending: int = DeckSyncState.pending_count()
		_set_status("offline", "Sem conexão" if pending == 0 else "Sem conexão · %d %s para enviar" % [pending, "mudança" if pending == 1 else "mudanças"])
	else:
		_set_status("error", Txt.of(outcome.get("error")))


## Chama a rota e devolve {data} ou o problema ({offline} ou {error}).
func _call(method: String, path: String, body: Variant = null) -> Dictionary:
	var reply: Dictionary = await transport.call(method, path, body)
	if bool(reply.get("offline", false)):
		return {"offline": true}
	var status: int = int(reply.get("status", 0))
	var data: Variant = reply.get("data")
	if status == 401:
		return {"error": "A sessão da conta expirou. Entre de novo para sincronizar os decks."}
	if status < 200 or status >= 300:
		var message: String = Txt.of((data as Dictionary).get("error")) if data is Dictionary else ""
		return {"error": message if message != "" else "O servidor respondeu %d." % status}
	return {"data": data if data is Dictionary else {}}


## Primeiro login neste computador (ou com outra conta): junta os decks daqui com os da conta, sem perder nenhum
## (o "Juntar à conta" da mesa do navegador; no conflito, a versão daqui fica como cópia).
func _first_login(conta: String) -> Dictionary:
	var reply: Dictionary = await _call("GET", "estado")
	if not reply.has("data"):
		return reply
	var remote: Dictionary = reply["data"]
	var account: Array = []
	var base: Dictionary = {}
	for change: Dictionary in remote.get("decks", []):
		base[change.get("id")] = int(change.get("rev", 0))
		if change.get("deck") is Dictionary:
			account.append(change["deck"])
	var joined: Dictionary = DeckMerge.join_account(DeckLibrary.load_all(), account, DeckLibrary.new_id, DeckLibrary.now_iso())
	var pending: Dictionary = {}
	for deck: Dictionary in joined["upload"]:
		pending[deck.get("id")] = "salvo"
	DeckSyncState.write({"conta": conta, "rev": int(remote.get("rev", 0)), "base": base, "pendentes": pending})
	_save_from_account(joined["decks"])
	return {}


func _push(state: Dictionary) -> Dictionary:
	var by_id: Dictionary = {}
	for deck: Dictionary in DeckLibrary.load_all():
		by_id[deck.get("id")] = deck
	var changes: Array = []
	var sent: Dictionary = {}
	for id: Variant in state["pendentes"]:
		var base: int = int((state["base"] as Dictionary).get(id, 0))
		var change: Dictionary = {"id": id, "base": base}
		if (state["pendentes"] as Dictionary)[id] == "salvo" and by_id.has(id):
			change["deck"] = by_id[id]
		else:
			change["apagar"] = true
		changes.append(change)
		sent[id] = change
	var reply: Dictionary = await _call("POST", "sincronizar", {"mudancas": changes})
	if not reply.has("data"):
		return reply
	var result: Dictionary = reply["data"]
	# Relê: a fila pode ter crescido enquanto o pedido ia e voltava.
	var next: Dictionary = DeckSyncState.read()
	if next.is_empty():
		next = state
	var library: Array = DeckLibrary.load_all()
	var still_same := func(id: Variant) -> bool:
		var now: Variant = null
		for d: Dictionary in library:
			if d.get("id") == id:
				now = d
		var change: Dictionary = sent[id]
		return now == null if not change.has("deck") else now != null and DeckSyncState.content(now) == DeckSyncState.content(change["deck"])
	var pending: Dictionary = next["pendentes"]
	for applied: Dictionary in result.get("aplicadas", []):
		(next["base"] as Dictionary)[applied.get("id")] = int(applied.get("rev", 0))
		if sent.has(applied.get("id")) and still_same.call(applied.get("id")):
			pending.erase(applied.get("id"))
	for refused: Dictionary in result.get("recusadas", []):
		pending.erase(refused.get("id"))
		notice = Txt.of(refused.get("motivo"))
	var changed: bool = false
	for conflict: Dictionary in result.get("conflitos", []):
		var id: Variant = conflict.get("id")
		var index: int = -1
		for i: int in library.size():
			if (library[i] as Dictionary).get("id") == id:
				index = i
		var mine: Variant = library[index] if index >= 0 else null
		var theirs: Variant = conflict.get("deck") if conflict.get("deck") is Dictionary else null
		var resolution: Dictionary = DeckMerge.resolve_conflict(mine, theirs, DeckLibrary.new_id, DeckLibrary.now_iso())
		(next["base"] as Dictionary)[id] = int(conflict.get("rev", 0))
		if resolution["resend"] != null:
			continue
		pending.erase(id)
		if resolution["keep"] != null:
			if index >= 0:
				library[index] = resolution["keep"]
			else:
				library.push_front(resolution["keep"])
		elif index >= 0:
			library.remove_at(index)
		if resolution["copy"] != null:
			var at: int = -1
			for i: int in library.size():
				if (library[i] as Dictionary).get("id") == id:
					at = i
			library.insert(mini(maxi(0, at) + 1, library.size()), resolution["copy"])
			pending[(resolution["copy"] as Dictionary).get("id")] = "salvo"
		changed = true
	DeckSyncState.write(next)
	if changed:
		_save_from_account(library)
	# Conflitos reenviados e cópias novas sobem na hora.
	if not (result.get("conflitos", []) as Array).is_empty() and not pending.is_empty():
		return await _push(next)
	return {}


func _pull(state: Dictionary) -> Dictionary:
	var reply: Dictionary = await _call("GET", "estado/%d" % int(state.get("rev", 0)))
	if not reply.has("data"):
		return reply
	var remote: Dictionary = reply["data"]
	var next: Dictionary = DeckSyncState.read()
	if next.is_empty():
		next = state
	var decks: Array = remote.get("decks", [])
	if not decks.is_empty():
		var pending: Dictionary = next["pendentes"]
		var changes: Array = []
		for c: Dictionary in decks:
			changes.append({"id": c.get("id"), "deleted": true} if bool(c.get("apagado", false)) or not c.get("deck") is Dictionary
				else {"id": c.get("id"), "deck": c["deck"]})
			if not pending.has(c.get("id")):
				(next["base"] as Dictionary)[c.get("id")] = int(c.get("rev", 0))
		_save_from_account(DeckMerge.apply_remote(DeckLibrary.load_all(), changes, pending))
	next["rev"] = maxi(int(next.get("rev", 0)), int(remote.get("rev", 0)))
	DeckSyncState.write(next)
	return {}


## Grava os decks que vieram da conta, sem marcá-los como mudança daqui, e avisa as telas.
func _save_from_account(decks: Array) -> void:
	var normalized: Array = []
	for deck: Variant in decks:
		if DeckLibrary.valid_deck(deck):
			normalized.append(DeckLibrary.normalize(deck))
	DeckLibrary.save_from_account(normalized)
	decks_changed.emit()


## O transporte de verdade: HTTP no mesmo servidor da mesa, com o token da conta.
func _http(method: String, path: String, body: Variant) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 20.0
	add_child(http)
	var verb: int = HTTPClient.METHOD_POST if method == "POST" else HTTPClient.METHOD_GET
	var payload: String = JSON.stringify(body) if body != null else ""
	if http.request(AccountSession.api_url("/api/conta/" + path), AccountSession.headers(), verb, payload) != OK:
		http.queue_free()
		return {"offline": true}
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return {"offline": true}
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	return {"status": int(result[1]), "data": ForgeClient.normalize(parsed)}
