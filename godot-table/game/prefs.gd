# Preferências do jogador guardadas entre as sessões (user://preferencias.json): nível de passar, efeitos e volume.
class_name Prefs
extends RefCounted

const PATH := "user://preferencias.json"


static func load_all() -> Dictionary:
	if not FileAccess.file_exists(PATH):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	return parsed if parsed is Dictionary else {}


static func save(key: String, value: Variant) -> void:
	var prefs: Dictionary = load_all()
	prefs[key] = value
	var file: FileAccess = FileAccess.open(PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(prefs))
