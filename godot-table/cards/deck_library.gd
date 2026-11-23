# Meus decks no computador do jogador (user://decks.json), no mesmo formato do localStorage da mesa do navegador ({version: 2, decks, recovery}).
class_name DeckLibrary
extends RefCounted

const ForgeClient := preload("res://net/forge_client.gd")

## Onde os decks ficam; os testes trocam por outro arquivo para não mexer nos decks de verdade.
static var path: String = "user://decks.json"
## Os registros que não deu para ler, guardados como vieram (para nunca perder um deck estragado).
static var _recovery: Array = []
static var _error: String = ""


## Os decks guardados, normalizados como a mesa do navegador os lê (normalizeDeck).
static func load_all() -> Array:
	_error = ""
	_recovery = []
	if not FileAccess.file_exists(path):
		return []
	var raw: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(raw)
	if not parsed is Dictionary or int((parsed as Dictionary).get("version", 0)) != 2 or not (parsed as Dictionary).get("decks") is Array:
		_keep_unreadable(raw)
		_error = "Não foi possível ler seus decks. Uma cópia do arquivo foi guardada."
		return []
	var data: Dictionary = ForgeClient.normalize(parsed)
	_recovery = data.get("recovery", []) if data.get("recovery") is Array else []
	var seen: Dictionary = {}
	var out: Array = []
	for record: Variant in data["decks"]:
		if not valid_deck(record) or seen.has((record as Dictionary)["id"]):
			_recovery.append(record)
			continue
		seen[(record as Dictionary)["id"]] = true
		out.append(normalize(record))
	if not _recovery.is_empty():
		_error = "Alguns decks precisam de recuperação; os reconhecidos continuam disponíveis."
	return out


## O aviso da última leitura ("" quando deu tudo certo).
static func error() -> String:
	return _error


## Grava a lista inteira; avisa a sincronia da conta do que mudou. Devolve false se não deu para gravar.
static func save_all(decks: Array) -> bool:
	for deck: Variant in decks:
		if not valid_deck(deck):
			return false
	var before: Array = load_all() if FileAccess.file_exists(path) else []
	if not _write(decks):
		return false
	DeckSyncState.note_saved(before, decks)
	return true


## Grava sem marcar nada para enviar (decks que vieram da conta).
static func save_from_account(decks: Array) -> bool:
	return _write(decks)


static func _write(decks: Array) -> bool:
	var tmp: String = path + ".tmp"
	var file: FileAccess = FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"version": 2, "decks": decks, "recovery": _recovery}, "", false))
	file.close()
	var dir: DirAccess = DirAccess.open(path.get_base_dir())
	return dir != null and dir.rename(tmp.get_file(), path.get_file()) == OK


## Um arquivo que não deu para ler fica guardado ao lado, com a hora no nome, antes de qualquer gravação.
static func _keep_unreadable(raw: String) -> void:
	var file: FileAccess = FileAccess.open("%s.recuperacao-%d.json" % [path.get_basename(), int(Time.get_unix_time_from_system())], FileAccess.WRITE)
	if file:
		file.store_string(raw)


## Um deck como a mesa do navegador aceita (validDeck de src/decks.ts).
static func valid_deck(value: Variant) -> bool:
	if not value is Dictionary:
		return false
	var d: Dictionary = value
	if not d.get("id") is String or Txt.of(d["id"]) == "" or not d.get("name") is String or not _valid_entries(d.get("cards")):
		return false
	for section: String in ["sideboard", "commanders"]:
		if d.has(section) and not _valid_entries(d[section]):
			return false
	if d.has("format") and not (Txt.of(d["format"]) in DeckList.FORMATS or d["format"] == "precon"):
		return false
	return true


static func _valid_entries(value: Variant) -> bool:
	if not value is Array:
		return false
	for e: Variant in value:
		if not e is Dictionary or not (e as Dictionary).get("name") is String or Txt.of((e as Dictionary)["name"]).strip_edges() == "":
			return false
		var count: Variant = (e as Dictionary).get("count")
		if not (count is int or count is float) or float(count) != floorf(float(count)) or float(count) < 1.0:
			return false
	return true


## Deck do jogador: nunca pronto nem precon, sem formato vira Livre, sempre com sideboard (normalizeDeck).
static func normalize(record: Dictionary) -> Dictionary:
	var out: Dictionary = record.duplicate(true)
	out.erase("precon")
	out["builtin"] = false
	var format: String = Txt.of(out.get("format", "free"))
	out["format"] = "commander" if format == "precon" else (format if format != "" else "free")
	if not out.get("sideboard") is Array:
		out["sideboard"] = []
	return out


## Um id novo no formato do crypto.randomUUID() do navegador (UUID v4).
static func new_id() -> String:
	var bytes: PackedByteArray = Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	var hex: String = bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [hex.substr(0, 8), hex.substr(8, 4), hex.substr(12, 4), hex.substr(16, 4), hex.substr(20, 12)]


## A hora agora no formato do toISOString() do navegador.
static func now_iso() -> String:
	var unix: float = Time.get_unix_time_from_system()
	return "%s.%03dZ" % [Time.get_datetime_string_from_unix_time(int(unix)), int(fmod(unix, 1.0) * 1000.0)]


## Uma cópia do deck com outro id ("Nome (cópia)"), como o Duplicar de Meus decks.
static func duplicate_deck(source: Dictionary) -> Dictionary:
	var copy: Dictionary = normalize(source)
	copy["id"] = new_id()
	copy["name"] = "%s (cópia)" % Txt.of(source.get("name"))
	copy["updatedAt"] = now_iso()
	if bool(source.get("builtin", false)):
		copy["sourceTemplateId"] = source.get("id")
	return copy
