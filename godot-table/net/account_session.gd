# A sessão da conta do jogador na mesa no PC: o token do servidor (vindo do vínculo pelo site), quem é a conta e as
# chamadas autenticadas a /api/conta/. Contrato entre o login (quem preenche) e quem usa a conta (decks, relatos).
class_name AccountSession
extends RefCounted

## Onde a sessão fica guardada no computador do jogador.
const FILE := "user://conta.json"


## Avisa quem mostra a conta (menu, decks) quando ela entra, sai ou o perfil muda: AccountSession.notifier().changed.
class Notifier extends RefCounted:
	signal changed


## Onde gravar (os testes trocam por um arquivo deles, para não mexer na conta de quem roda).
static var path: String = FILE
static var _token: String = ""
static var _account: Dictionary = {}
## Fim da sessão em milissegundos desde 1970 (0: sem data).
static var _expires_at: int = 0
static var _loaded: bool = false
static var _notifier: Notifier = Notifier.new()


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


## O nome para mostrar: o apelido da conta, ou o primeiro nome do Google.
static func display_name() -> String:
	var a: Dictionary = account()
	for key: String in ["apelido", "nome"]:
		var text: String = Txt.of(a.get(key)).strip_edges()
		if text != "":
			return text
	return "Sua conta" if signed_in() else ""


## O endereço de uma rota da API (o mesmo servidor da mesa, em HTTP).
static func api_url(path: String) -> String:
	return GameConfig.http_url(path)


## Os cabeçalhos de uma chamada autenticada.
static func headers() -> PackedStringArray:
	var out := PackedStringArray(["Content-Type: application/json"])
	if token() != "":
		out.append("Authorization: Bearer %s" % token())
	return out


static func notifier() -> Notifier:
	return _notifier


## Guarda a sessão recebida do servidor ({token, expiresAt, conta}); expiresAt vem como data ISO ou em milissegundos.
static func store(session: Dictionary) -> void:
	_token = Txt.of(session.get("token"))
	_expires_at = parse_expiry(session.get("expiresAt", 0))
	_account = (session["conta"] as Dictionary).duplicate(true) if session.get("conta") is Dictionary else {}
	_loaded = true
	_save()
	_notifier.changed.emit()


## Troca só o perfil (o servidor confirmou a sessão e mandou a conta atualizada).
static func update_account(conta: Dictionary) -> void:
	_load()
	if _token == "":
		return
	_account = conta
	_save()
	_notifier.changed.emit()


## Esquece a sessão (sair, ou o servidor recusou o token).
static func clear() -> void:
	var had: bool = _token != "" or FileAccess.file_exists(path)
	_token = ""
	_account = {}
	_expires_at = 0
	_loaded = true
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	if had:
		_notifier.changed.emit()


## Relê do disco na próxima consulta (os testes trocam o arquivo). Não se chama reload: AccountSession.reload() recarregaria o script.
static func reread() -> void:
	_loaded = false
	_token = ""
	_account = {}
	_expires_at = 0


## "2027-05-20T12:00:00Z" ou 1810000000000 → milissegundos; 0 se não der para ler.
static func parse_expiry(value: Variant) -> int:
	if value is float or value is int:
		return int(value)
	var text: String = Txt.of(value).strip_edges()
	if text == "":
		return 0
	if text.is_valid_int():
		return text.to_int()
	# Time não lê a fração de segundo nem o "Z": tira os dois (o servidor manda sempre em UTC).
	var plain: String = text.trim_suffix("Z")
	if plain.contains("."):
		plain = plain.substr(0, plain.find("."))
	var seconds: int = Time.get_unix_time_from_datetime_string(plain)
	return seconds * 1000 if seconds > 0 else 0


static func _save() -> void:
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"token": _token, "expiresAt": _expires_at, "conta": _account}))


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary:
		_token = Txt.of((parsed as Dictionary).get("token"))
		_expires_at = parse_expiry((parsed as Dictionary).get("expiresAt", 0))
		_account = (parsed as Dictionary).get("conta", {}) if (parsed as Dictionary).get("conta") is Dictionary else {}
