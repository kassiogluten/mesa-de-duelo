# A sessão da conta do jogador na mesa no PC: o token do servidor (vindo do vínculo pelo site), quem é a conta e as
# chamadas autenticadas a /api/conta/. Contrato entre o login (quem preenche) e quem usa a conta (decks, relatos).
class_name AccountSession
extends RefCounted

## Onde a sessão fica guardada no computador do jogador.
const FILE := "user://conta.json"

static var _token: String = ""
static var _account: Dictionary = {}
static var _expires_at: int = 0
static var _loaded: bool = false


## O token do servidor para o cabeçalho Authorization ("" sem login).
static func token() -> String:
	_load()
	if _expires_at > 0 and Time.get_unix_time_from_system() * 1000.0 > _expires_at:
		return ""
	return _token


## A conta logada ({id, nome, foto, apelido}); {} sem login.
static func account() -> Dictionary:
	_load()
	return _account if token() != "" else {}


static func signed_in() -> bool:
	return token() != ""


## O endereço de uma rota da API (o mesmo servidor da mesa, em HTTP).
static func api_url(path: String) -> String:
	return GameConfig.http_url(path)


## Os cabeçalhos de uma chamada autenticada.
static func headers() -> PackedStringArray:
	var out := PackedStringArray(["Content-Type: application/json"])
	if token() != "":
		out.append("Authorization: Bearer %s" % token())
	return out


## Guarda a sessão recebida do servidor ({token, expiresAt, conta}).
static func store(session: Dictionary) -> void:
	_token = Txt.of(session.get("token"))
	_expires_at = int(session.get("expiresAt", 0))
	_account = session.get("conta", {}) if session.get("conta") is Dictionary else {}
	_loaded = true
	var file: FileAccess = FileAccess.open(FILE, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"token": _token, "expiresAt": _expires_at, "conta": _account}))


## Esquece a sessão (sair, ou o servidor recusou o token).
static func clear() -> void:
	_token = ""
	_account = {}
	_expires_at = 0
	_loaded = true
	if FileAccess.file_exists(FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(FILE))


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(FILE):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FILE))
	if parsed is Dictionary:
		_token = Txt.of((parsed as Dictionary).get("token"))
		_expires_at = int((parsed as Dictionary).get("expiresAt", 0))
		_account = (parsed as Dictionary).get("conta", {}) if (parsed as Dictionary).get("conta") is Dictionary else {}
