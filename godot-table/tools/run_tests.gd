# Roda os testes da mesa no PC (res://tests/test_*.gd, métodos test_*) headless e sai com 1 se algum falhar.
# npm run godot:test (um arquivo só: npm run godot:test -- update_state)
extends SceneTree

const DIR := "res://tests"


func _initialize() -> void:
	# Antes do primeiro quadro a árvore ainda não começou: nós postos na raiz não recebem _ready.
	await process_frame
	var only: String = ""
	for arg: String in OS.get_cmdline_user_args():
		only = arg
	var passed: int = 0
	var failed: int = 0
	for file: String in DirAccess.get_files_at(DIR):
		if not file.begins_with("test_") or not file.ends_with(".gd") or file == "test_case.gd":
			continue
		if only != "" and not file.contains(only):
			continue
		var script: GDScript = load("%s/%s" % [DIR, file])
		for method: Dictionary in script.get_script_method_list():
			var name: String = method["name"]
			if not name.begins_with("test_"):
				continue
			var case: RefCounted = script.new()
			case.call(name)
			var waited: float = 0.0
			while not bool(case.get("done")) and waited < 10.0:
				await process_frame
				waited += get_root().get_process_delta_time()
			if not bool(case.get("done")):
				(case.get("failures") as PackedStringArray).append("não terminou em 10 s")
			var failures: PackedStringArray = case.get("failures")
			if failures.is_empty():
				passed += 1
				print("ok - %s › %s" % [file.trim_suffix(".gd"), name])
			else:
				failed += 1
				printerr("FALHOU - %s › %s" % [file.trim_suffix(".gd"), name])
				for line: String in failures:
					printerr("    " + line)
	print("\n%d passaram, %d falharam." % [passed, failed])
	quit(1 if failed > 0 or passed == 0 else 0)
