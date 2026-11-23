# Estado do atualizador no disco: qual pacote do jogo está em uso, o anterior para voltar e as versões que falharam.
# Fica embutido no executável junto com o boot; o jogo chama confirm() quando abre bem, e só então a versão nova vale.
# O pacote que vem no zip, ao lado do executável, entra como se tivesse sido baixado (adopt_bundled).
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
## A versão para mostrar ao jogador: o número, sem o hash do pacote (0.240.0+a1b2c3d4 → 0.240.0).
static func display_version(version: String) -> String:
	return version.get_slice("+", 0)


static func current_version() -> String:
	return String(load_state()["current"]) if OS.has_feature("template") or OS.get_environment("MESA_PC_MANIFEST") != "" else ""


## Pacote do jogo que veio no zip, ao lado do executável (`game-<versão>.pck`): {version, path}, ou {} se não houver.
static func bundled_pack(exe_dir: String) -> Dictionary:
	var found: Dictionary = {}
	if not DirAccess.dir_exists_absolute(exe_dir):
		return found
	for name: String in DirAccess.get_files_at(exe_dir):
		if not (name.begins_with("game-") and name.ends_with(".pck")):
			continue
		var version: String = name.trim_prefix("game-").trim_suffix(".pck")
		if found.is_empty() or is_newer(version, String(found["version"])):
			found = {"version": version, "path": exe_dir.path_join(name)}
	return found


## Copia o pacote do zip para as atualizações quando ainda não há nenhum que abra ou quando ele é mais novo que o atual
## (zip baixado de novo no site): a primeira abertura funciona sem internet, e o resto segue como uma atualização.
static func adopt_bundled(state: Dictionary, bundled: Dictionary) -> Dictionary:
	if bundled.is_empty():
		return state
	var version: String = String(bundled["version"])
	var current: String = String(state["current"])
	if version == current or (state["bad"] as Array).has(version):
		return state
	var has_pack: bool = [current, String(state["previous"])].any(func(v: String) -> bool: return v != "" and FileAccess.file_exists(pck_path(v)))
	if has_pack and not is_newer(version, current):
		return state
	DirAccess.make_dir_recursive_absolute(DIR)
	var part: String = pck_path(version) + ".part"
	if DirAccess.copy_absolute(String(bundled["path"]), part) != OK:
		DirAccess.remove_absolute(part)
		return state
	DirAccess.remove_absolute(pck_path(version))
	if DirAccess.rename_absolute(part, pck_path(version)) != OK:
		return state
	return promote(state, version)


## `a` é uma versão (x.y.z) mais nova que `b`; qualquer versão é mais nova que "". O hash depois do "+" (x.y.z+a1b2c3d4,
## o mesmo número com outro pacote) não conta: só diz que o pacote é outro, não qual é mais novo.
static func is_newer(a: String, b: String) -> bool:
	if b == "":
		return a != ""
	var pa: PackedStringArray = a.get_slice("+", 0).split(".")
	var pb: PackedStringArray = b.get_slice("+", 0).split(".")
	for i: int in maxi(pa.size(), pb.size()):
		var x: int = pa[i].to_int() if i < pa.size() else 0
		var y: int = pb[i].to_int() if i < pb.size() else 0
		if x != y:
			return x > y
	return false
