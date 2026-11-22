# Estado do atualizador no disco: qual pacote do jogo está em uso, o anterior para voltar e as versões que falharam.
# Fica embutido no executável junto com o boot; o jogo chama confirm() quando abre bem, e só então a versão nova vale.
extends RefCounted

const DIR := "user://updates"
const STATE_PATH := "user://updates/estado.json"
## Aberturas sem confirmação antes de dar a versão por quebrada e voltar à anterior.
const MAX_TRIES := 2


static func pck_path(version: String) -> String:
	return "%s/%s.pck" % [DIR, version]


static func load_state() -> Dictionary:
	var state: Dictionary = {"current": "", "previous": "", "trying": "", "tries": 0, "bad": []}
	if FileAccess.file_exists(STATE_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STATE_PATH))
		if parsed is Dictionary:
			state.merge(parsed as Dictionary, true)
	return state


static func save_state(state: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	var file: FileAccess = FileAccess.open(STATE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(state, "  "))


## Se a versão atual já abriu MAX_TRIES vezes sem confirmar, marca como quebrada e volta à anterior.
static func recover(state: Dictionary) -> Dictionary:
	var current: String = state["current"]
	if current != "" and state["trying"] == current and int(state["tries"]) >= MAX_TRIES:
		(state["bad"] as Array).append(current)
		state["current"] = state["previous"]
		state["previous"] = ""
		state["trying"] = ""
		state["tries"] = 0
		save_state(state)
	return state


## Um pacote novo baixado e conferido passa a ser o atual; o atual vira o anterior.
static func promote(state: Dictionary, version: String) -> Dictionary:
	if state["current"] != version:
		state["previous"] = state["current"]
		state["current"] = version
	state["trying"] = ""
	state["tries"] = 0
	save_state(state)
	return state


## Antes de carregar a versão: conta uma tentativa, que confirm() zera.
static func mark_trying(state: Dictionary, version: String) -> void:
	if state["trying"] != version:
		state["trying"] = version
		state["tries"] = 0
	state["tries"] = int(state["tries"]) + 1
	save_state(state)


## O jogo abriu bem com a versão atual: zera as tentativas e apaga os pacotes que não são o atual nem o anterior.
static func confirm() -> void:
	var state: Dictionary = load_state()
	if state["trying"] == "":
		return
	state["trying"] = ""
	state["tries"] = 0
	save_state(state)
	var keep: PackedStringArray = ["%s.pck" % state["current"], "%s.pck" % state["previous"], "estado.json"]
	for name: String in DirAccess.get_files_at(DIR):
		if not keep.has(name):
			DirAccess.remove_absolute("%s/%s" % [DIR, name])


## A versão do pacote do jogo em uso ("" rodando direto do projeto, sem atualizador).
static func current_version() -> String:
	return String(load_state()["current"]) if OS.has_feature("template") or OS.get_environment("MESA_PC_MANIFEST") != "" else ""
