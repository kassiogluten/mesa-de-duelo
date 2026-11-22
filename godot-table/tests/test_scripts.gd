# Todo script do jogo compila: um erro num arquivo que nenhum teste carrega (uma tela) só apareceria ao abrir a mesa.
extends "res://tests/test_case.gd"


func test_every_script_compiles() -> void:
	var count: int = 0
	for path: String in _scripts("res://"):
		var script: GDScript = load(path)
		count += 1
		if script == null or not script.can_instantiate():
			failures.append("%s não compila" % path)
	check(count > 20, "achou os scripts do jogo (%d)" % count)


func _scripts(dir: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for sub: String in DirAccess.get_directories_at(dir):
		if not sub.begins_with(".") and sub != "export" and sub != "tools":
			out.append_array(_scripts(dir.path_join(sub)))
	for file: String in DirAccess.get_files_at(dir):
		if file.ends_with(".gd"):
			out.append(dir.path_join(file))
	return out
