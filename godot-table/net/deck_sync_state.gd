# O que a sincronia de Meus decks guarda entre as sessões (user://decks-sync.json): a conta, as revisões e a fila do que mudou aqui.
class_name DeckSyncState
extends RefCounted

## Onde fica; os testes trocam por outro arquivo.
static var path: String = "user://decks-sync.json"
## O id da conta logada ("" sem login); os testes trocam pela conta de mentira.
static var account_id: Callable = func() -> String: return Txt.of(AccountSession.account().get("id"))


## {conta, rev, base: {id: rev}, pendentes: {id: "salvo" | "apagado"}}, ou {} quando este computador não está ligado a
## uma conta (SyncState de src/conta/sync.ts).
static func read() -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary or not (parsed as Dictionary).get("pendentes") is Dictionary:
		return {}
	var state: Dictionary = parsed
	state["rev"] = int(state.get("rev", 0))
	var base: Dictionary = {}
	if state.get("base") is Dictionary:
		for id: Variant in state["base"]:
			base[id] = int((state["base"] as Dictionary)[id])
	state["base"] = base
	return state


## Grava o estado; {} apaga (saiu da conta).
static func write(state: Dictionary) -> void:
	if state.is_empty():
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
		return
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(state))


## Quantas mudanças daqui ainda não chegaram à conta.
static func pending_count() -> int:
	return (read().get("pendentes", {}) as Dictionary).size()


## O deck como fica depois de lido, para comparar (um deck da conta sem sideboard é o mesmo que o daqui com ele vazio).
static func content(deck: Dictionary) -> String:
	return JSON.stringify(DeckLibrary.normalize(deck), "", true)


## Cada gravação de Meus decks: o que mudou entra na fila, se este computador estiver ligado à conta logada (onSaved).
static func note_saved(before: Array, after: Array) -> void:
	var state: Dictionary = read()
	if state.is_empty() or account_id.call() == "" or account_id.call() != Txt.of(state.get("conta")):
		return
	var old: Dictionary = {}
	for d: Dictionary in before:
		old[d.get("id")] = content(d)
	var pending: Dictionary = state["pendentes"]
	var now: Dictionary = {}
	for d: Dictionary in after:
		now[d.get("id")] = true
		if not bool(d.get("builtin", false)) and old.get(d.get("id")) != content(d):
			pending[d.get("id")] = "salvo"
	for id: Variant in old:
		if not now.has(id):
			pending[id] = "apagado"
	write(state)
