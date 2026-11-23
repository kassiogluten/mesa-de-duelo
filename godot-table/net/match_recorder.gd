# Gravação da partida para o relato (porte enxuto de src/forge/recording.ts): estados recebidos, mensagens enviadas e avisos, no formato "mesa-gravacao".
class_name MatchRecorder
extends RefCounted

const FORMAT := "mesa-gravacao"
## Memória para os estados guardados (comprimidos um a um); passando disso, saem os mais antigos (fica o primeiro).
const MEMORY_LIMIT := 10 * 1024 * 1024
const SENT_LIMIT := 400
const NOTES_LIMIT := 200
## Pedidos fora da partida não entram na gravação (como na mesa do navegador).
const OUTSIDE := ["validate-deck", "lookup-room", "list-rooms", "fetch-deck", "similar-cards", "ping", "hello"]
## Campos de mensagens enviadas que não vão para a gravação: decks (ficam em meta.deck) e segredos.
const STRIPPED := ["deck", "you", "opponent", "opponents", "token", "conta"]

## A última partida jogada nesta abertura da mesa: o relato da tela inicial a anexa.
static var last: MatchRecorder

## Código e token do assento ({code, token}): vão nos cabeçalhos do relato para o servidor juntar o diário dele.
var session: Dictionary = {}
var meta: Dictionary = {"app": "godot"}
var started_at: int = 0
var ended_at: int = 0
var dropped: int = 0

## Estados: [{at, v, z (JSON comprimido), n (tamanho aberto)}].
var _frames: Array = []
var _size: int = 0
var _sent: Array = []
var _notes: Array = []
var _last_version: Variant = null
var _last_match: String = ""


## Quantos estados estão guardados.
func frame_count() -> int:
	return _frames.size()


func is_empty() -> bool:
	return _frames.is_empty()


## O pedido que abriu a partida: o deck do jogador vai na meta (a mensagem em si entra em `sent` quando sai).
func start(message: Dictionary) -> void:
	var deck: Variant = message.get("you", message.get("deck"))
	if deck is Dictionary:
		meta["deck"] = deck


## Toda mensagem que chegou do servidor.
func received(msg: Dictionary) -> void:
	match Txt.of(msg.get("type")):
		"hello":
			for key: String in ["rulesVersion", "engineVersion"]:
				if msg.get(key) is String:
					meta[key] = msg[key]
		"state":
			_state(msg)
		"error":
			note("erro", Txt.of(msg.get("text")))
		"toast":
			note("aviso", Txt.of(msg.get("text")))


## Uma mensagem que a mesa mandou ao servidor (sem decks nem tokens).
func sent(msg: Dictionary) -> void:
	var type: String = Txt.of(msg.get("type"))
	if OUTSIDE.has(type):
		return
	if _frames.is_empty() and not ["start", "host", "join", "rejoin", "watch", "lab-host"].has(type):
		return
	var clean: Dictionary = {}
	for key: Variant in msg.keys():
		if not STRIPPED.has(key):
			clean[key] = msg[key]
	var entry: Dictionary = {"at": _now(), "v": _last_version, "msg": clean}
	if msg.get("gen") is int:
		entry["gen"] = msg["gen"]
	_sent.append(entry)
	if _sent.size() > SENT_LIMIT:
		_sent.pop_front()


## Um aviso ou erro da partida ("erro", "aviso", "conexao").
func note(kind: String, text: String, detail: String = "") -> void:
	if text.strip_edges() == "":
		return
	var entry: Dictionary = {"at": _now(), "v": _last_version, "kind": kind, "text": text}
	if detail != "":
		entry["detail"] = detail
	_notes.append(entry)
	if _notes.size() > NOTES_LIMIT:
		_notes.pop_front()


func _state(state: Dictionary) -> void:
	var version: Variant = state.get("stateVersion")
	var match_id: String = Txt.of(state.get("matchId"))
	if version != null and version == _last_version and match_id == _last_match:
		return
	if state.get("session") is Dictionary:
		var seat: Dictionary = state["session"]
		session = {"code": Txt.of(seat.get("code")), "token": Txt.of(seat.get("token"))}
	var text: String = JSON.stringify(without_secrets(state))
	var raw: PackedByteArray = text.to_utf8_buffer()
	var at: int = _now()
	if _frames.is_empty():
		started_at = at
	ended_at = at
	var packed: PackedByteArray = raw.compress(FileAccess.COMPRESSION_GZIP)
	_frames.append({"at": at, "v": version, "z": packed, "n": raw.size()})
	_size += packed.size()
	while _size > MEMORY_LIMIT and _frames.size() > 2:
		_size -= (_frames[1]["z"] as PackedByteArray).size()
		_frames.remove_at(1)
		dropped += 1
	_last_version = version
	_last_match = match_id
	if match_id != "" and not meta.has("matchId"):
		meta["matchId"] = match_id
	var config: Dictionary = state.get("config") if state.get("config") is Dictionary else {}
	for key: String in ["format", "matchLength"]:
		if config.get(key) is String:
			meta[key] = config[key]
	for key: String in ["rulesVersion", "engineVersion"]:
		if state.get(key) is String:
			meta[key] = state[key]
	var players: Array = state.get("players") if state.get("players") is Array else []
	meta["playerCount"] = players.size()
	meta["you"] = state.get("you")
	meta["net"] = state.get("room") is Dictionary and not bool((state["room"] as Dictionary).get("computer", false))
	meta["players"] = players.map(func(p: Variant) -> Dictionary:
		var player: Dictionary = p if p is Dictionary else {}
		return {"id": player.get("id"), "name": Txt.of(player.get("name")), "ai": bool(player.get("ai", false))})
	if state.get("preferences") is Dictionary:
		meta["preferences"] = (state["preferences"] as Dictionary).duplicate()


## O estado sem os tokens de volta ao assento (cópia rasa: só o que muda é copiado).
static func without_secrets(state: Dictionary) -> Dictionary:
	var out: Dictionary = state.duplicate(false)
	for key: String in ["session", "room"]:
		if out.get(key) is Dictionary and (out[key] as Dictionary).has("token"):
			var part: Dictionary = (out[key] as Dictionary).duplicate(false)
			part["token"] = ""
			out[key] = part
	return out


## A gravação no formato da mesa do navegador, com os estados mais novos que cabem em `limit` bytes comprimidos
## (o primeiro fica sempre). `extra_meta` entra na meta (aparelho e preferências do relato).
func recording(limit: int = 2 * 1024 * 1024, extra_meta: Dictionary = {}) -> Dictionary:
	var keep: Array = []
	var budget: int = 0
	var cut: int = 0
	for i: int in range(_frames.size() - 1, 0, -1):
		var size: int = (_frames[i]["z"] as PackedByteArray).size()
		if budget + size > limit and keep.size() > 0:
			cut = i
			break
		budget += size
		keep.push_front(_frames[i])
	if not _frames.is_empty():
		keep.push_front(_frames[0])
	var frames: Array = keep.map(func(f: Dictionary) -> Dictionary:
		var text: String = (f["z"] as PackedByteArray).decompress(int(f["n"]), FileAccess.COMPRESSION_GZIP).get_string_from_utf8()
		return {"at": f["at"], "v": f["v"], "k": text})
	var full_meta: Dictionary = meta.duplicate(true)
	full_meta.merge(extra_meta, true)
	return {
		"format": FORMAT, "version": 1, "startedAt": started_at, "endedAt": ended_at, "meta": full_meta,
		"frames": frames, "sent": _sent.duplicate(true), "notes": _notes.duplicate(true),
		"droppedFrames": dropped + (cut if cut > 0 else 0),
	}


static func _now() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)
