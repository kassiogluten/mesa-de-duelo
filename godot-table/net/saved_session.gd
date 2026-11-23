# O assento da partida (ou sala) em andamento guardado no computador, para a tela inicial oferecer "Voltar à partida" (src/app/resume.ts).
class_name SavedSession
extends RefCounted

const FILE := "user://partida.json"
## Onde gravar (os testes usam outro arquivo, para não apagar o assento de quem joga).
static var path: String = FILE
## Depois disso o servidor já encerrou a partida sem ninguém (são 5 minutos lá); o folgado cobre quem joga devagar.
const MAX_AGE_S := 6 * 3600

## O último assento gravado: o estado chega várias vezes por segundo, e só a mudança vai para o disco.
static var _last: String = ""


## O assento guardado ({code, token, room, format, url, at}) para o servidor de agora; {} se não há.
static func current(forge_url: String = GameConfig.forge_url()) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return {}
	var seat: Dictionary = parsed
	if Txt.of(seat.get("code")) == "" or Txt.of(seat.get("token")) == "" or Txt.of(seat.get("url")) != forge_url:
		return {}
	if Time.get_unix_time_from_system() - float(seat.get("at", 0.0)) > MAX_AGE_S:
		return {}
	return seat


static func save(code: String, token: String, room: bool, format: String, forge_url: String = GameConfig.forge_url()) -> void:
	var key: String = "%s|%s|%s|%s" % [code, token, room, forge_url]
	if key == _last and FileAccess.file_exists(path):
		return
	_last = key
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"code": code, "token": token, "room": room, "format": format, "url": forge_url, "at": Time.get_unix_time_from_system()}))


static func clear() -> void:
	_last = ""
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


## Acompanha as mensagens da partida: a sala de espera e o estado guardam o assento; o fim da partida, o `gone` e o
## `replaced` o esquecem (como o saveResume/clearResume do navegador).
static func track(msg: Dictionary) -> void:
	match Txt.of(msg.get("type")):
		"room":
			var room: Dictionary = msg.get("room", {}) if msg.get("room") is Dictionary else {}
			if not room.is_empty() and not bool(room.get("started", false)) and not bool(room.get("lab", false)) and Txt.of(room.get("token")) != "":
				save(Txt.of(room.get("code")), Txt.of(room.get("token")), true, Txt.of((room.get("config", {}) as Dictionary).get("format")))
		"state":
			var seat: Variant = msg.get("session")
			if not seat is Dictionary:
				return
			var over: bool = bool(msg.get("gameOver", false))
			if msg.get("match") is Dictionary:
				over = bool((msg["match"] as Dictionary).get("over", over))
			if over:
				clear()
			else:
				var config: Dictionary = msg.get("config", {}) if msg.get("config") is Dictionary else {}
				save(Txt.of((seat as Dictionary).get("code")), Txt.of((seat as Dictionary).get("token")), bool((seat as Dictionary).get("room", false)), Txt.of(config.get("format")))
		"gone", "replaced":
			clear()
