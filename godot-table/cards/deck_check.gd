# Confere os decks no servidor (o pedido validate-deck da mesa do navegador) e diz em português o que falta: cartas
# desconhecidas e problemas do formato. Guarda o resultado de cada lista, para a marca de válido em Meus decks.
class_name DeckCheck
extends Node

const ForgeClient := preload("res://net/forge_client.gd")

## Um deck foi conferido (ou não deu: sem conexão); `key` é a de key_of().
signal checked(key: String, result: Dictionary)

## Quanto esperar a conexão abrir antes de dar a conferência como "sem conexão".
const CONNECT_TIMEOUT_MS := 6000

## Os testes trocam por um servidor de mentira: (format, forge_deck) → a resposta {type: "validation", validation} ou outra.
var requester: Callable
var _client: ForgeClient
var _results: Dictionary = {}
var _queue: Array = []
var _busy: bool = false
var _connect_deadline: int = -1


func _init() -> void:
	requester = _server_request


func _process(_delta: float) -> void:
	if _client:
		_client.poll()
		if not _client.is_open() and _connect_deadline >= 0 and Time.get_ticks_msec() > _connect_deadline:
			_connect_deadline = -1
			_client.close()
			_client = null


func _exit_tree() -> void:
	if _client:
		_client.close()


## A chave do resultado: o formato e as cartas (o nome do deck não muda a legalidade).
static func key_of(deck: Dictionary) -> String:
	var copy: Dictionary = deck.duplicate()
	copy["name"] = ""
	return DeckMerge.fingerprint(copy)


## O resultado guardado: {status: "valid" | "invalid" | "offline", issues, deck?}, ou {} se ainda não foi conferido.
func result(deck: Dictionary) -> Dictionary:
	return _results.get(key_of(deck), {})


## Pede a conferência (uma vez por lista; `again` confere de novo, por exemplo depois de voltar a conexão).
func check(deck: Dictionary, again: bool = false) -> void:
	var key: String = key_of(deck)
	if (_results.has(key) and not again) or _queue.any(func(item: Dictionary) -> bool: return item["key"] == key):
		return
	_queue.append({"key": key, "deck": deck})
	if not _busy:
		_drain()


func _drain() -> void:
	_busy = true
	while not _queue.is_empty():
		var item: Dictionary = _queue.pop_front()
		var deck: Dictionary = item["deck"]
		var format: String = Txt.of(deck.get("format", "free"))
		var payload: Dictionary = DeckList.forge_deck(deck)
		payload.erase("tokens")
		var reply: Variant = await requester.call(format, payload)
		var outcome: Dictionary = {"status": "offline", "issues": []}
		if reply is Dictionary and Txt.of((reply as Dictionary).get("type")) == "validation" and (reply as Dictionary).get("validation") is Dictionary:
			var validation: Dictionary = (reply as Dictionary)["validation"]
			outcome = {"status": "valid" if bool(validation.get("valid", false)) else "invalid", "issues": validation.get("issues", [])}
			if validation.get("deck") is Dictionary:
				outcome["deck"] = validation["deck"]
		_results[item["key"]] = outcome
		checked.emit(item["key"], outcome)
	_busy = false


## O pedido de verdade: abre a conexão com o servidor se preciso e espera a resposta.
func _server_request(format: String, payload: Dictionary) -> Dictionary:
	if _client == null:
		_client = ForgeClient.new()
		_client.url = GameConfig.forge_url()
		_connect_deadline = Time.get_ticks_msec() + CONNECT_TIMEOUT_MS
		if _client.connect_to(GameConfig.forge_url()) != OK:
			_client = null
			return {}
	var client: ForgeClient = _client
	while not client.is_open():
		if _client != client:
			return {}
		await get_tree().process_frame
	_connect_deadline = -1
	return await client.request({"type": "validate-deck", "format": format, "deck": payload}).done


## O que mostrar ao jogador: {unknown: nomes que o servidor não conhece, problems: frases do formato}, com os nomes
## das cartas pelo `label` dado (o nome em português do CardCatalog).
static func describe(issues: Array, label: Callable) -> Dictionary:
	var unknown: PackedStringArray = []
	var problems: PackedStringArray = []
	for raw: Variant in issues:
		if not raw is Dictionary:
			continue
		var issue: Dictionary = raw
		var card: String = Txt.of(issue.get("card"))
		var code: String = Txt.of(issue.get("code"))
		if code in ["unknown-card", "invalid-name", "identity-mismatch"]:
			if card != "" and not unknown.has(card):
				unknown.append(card)
			continue
		var message: String = Txt.of(issue.get("message"))
		problems.append("%s: %s" % [Txt.of(label.call(card)), message] if card != "" else message)
	return {"unknown": unknown, "problems": problems}
