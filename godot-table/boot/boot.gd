# Tela de abertura da mesa no PC: confere a versão no servidor, baixa o pacote do jogo se houver um novo e entra.
# Não importa nada de fora de boot/: é a única parte embutida no executável, e o resto chega no pacote baixado.
extends Control

const UpdateState := preload("res://boot/update_state.gd")

## Sobe quando o boot muda de um jeito que pacotes novos dependem (o manifesto pede `minBoot`).
const BOOT_VERSION := 1
const DEFAULT_MANIFEST := "https://mesao.online/mesa-pc/versao.json"
const GAME_SCENE := "res://main.tscn"
const MANIFEST_TIMEOUT_S := 6.0
const DOWNLOAD_TIMEOUT_S := 300.0

@onready var _status: Label = %Status
@onready var _progress: ProgressBar = %Progress
@onready var _retry: Button = %Retry
@onready var _site: Button = %Site

var _http: HTTPRequest
var _download_size: int = 0
var _site_url: String = ""


func _ready() -> void:
	_retry.pressed.connect(_start)
	_site.pressed.connect(func() -> void: OS.shell_open(_site_url))
	_start()


func _process(_delta: float) -> void:
	if _http and _download_size > 0 and _progress.visible:
		var done: int = _http.get_downloaded_bytes()
		_progress.value = 100.0 * done / _download_size
		_status.text = "Baixando a atualização… %s de %s" % [_mb(done), _mb(_download_size)]


static func manifest_url() -> String:
	var env: String = OS.get_environment("MESA_PC_MANIFEST")
	return env if env != "" else DEFAULT_MANIFEST


func _start() -> void:
	_retry.hide()
	_site.hide()
	_progress.hide()
	# Rodando do projeto (editor), o jogo já está aqui: entra direto. MESA_PC_MANIFEST liga o atualizador para testar.
	if not OS.has_feature("template") and OS.get_environment("MESA_PC_MANIFEST") == "":
		_enter_game()
		return
	var state: Dictionary = UpdateState.recover(UpdateState.load_state())
	_status.text = "Procurando atualização…"
	var manifest: Dictionary = await _fetch_json(manifest_url())
	if not manifest.is_empty():
		var version: String = String(manifest.get("version", ""))
		var engine: String = String(manifest.get("engine", ""))
		if engine != "" and engine != _engine_version() or int(manifest.get("minBoot", 0)) > BOOT_VERSION:
			if not _has_pack(state):
				_site_url = String(manifest.get("download", manifest_url().get_base_dir() + "/"))
				_fail("Saiu uma versão nova da mesa que precisa ser instalada de novo.", true)
				return
			# Com um pacote que já funciona, entra com ele; a página de download fica para depois.
		elif version != "" and version != state["current"] and not (state["bad"] as Array).has(version):
			if await _download(manifest):
				state = UpdateState.promote(state, version)
	_launch(state)


func _launch(state: Dictionary) -> void:
	for version: String in [String(state["current"]), String(state["previous"])]:
		if version == "" or not FileAccess.file_exists(UpdateState.pck_path(version)):
			continue
		if version != state["current"]:
			state["current"] = version
			state["previous"] = ""
			UpdateState.save_state(state)
		UpdateState.mark_trying(state, version)
		if ProjectSettings.load_resource_pack(UpdateState.pck_path(version)):
			_enter_game()
			return
	_fail("Não foi possível baixar a mesa. Confira a internet e tente de novo.", false)


func _enter_game() -> void:
	_status.text = "Abrindo a mesa…"
	if not ResourceLoader.exists(GAME_SCENE):
		_fail("A mesa não abriu. Tente de novo; se continuar, baixe a mesa de novo no site.", false)
		return
	# Adiado: trocar de cena dentro do _ready do boot é recusado pelo motor.
	get_tree().change_scene_to_file.call_deferred(GAME_SCENE)


func _has_pack(state: Dictionary) -> bool:
	return [String(state["current"]), String(state["previous"])].any(func(v: String) -> bool: return v != "" and FileAccess.file_exists(UpdateState.pck_path(v)))


func _fetch_json(url: String) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = MANIFEST_TIMEOUT_S
	add_child(http)
	if http.request(url, ["Cache-Control: no-cache"]) != OK:
		http.queue_free()
		return {}
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS or int(result[1]) != 200:
		return {}
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	return parsed if parsed is Dictionary else {}


## Baixa o pacote para um .part, confere tamanho e SHA-256 e só então o põe no lugar.
func _download(manifest: Dictionary) -> bool:
	var version: String = String(manifest["version"])
	var target: String = UpdateState.pck_path(version)
	var part: String = target + ".part"
	DirAccess.make_dir_recursive_absolute(UpdateState.DIR)
	_http = HTTPRequest.new()
	_http.download_file = part
	_http.timeout = DOWNLOAD_TIMEOUT_S
	_http.use_threads = true
	add_child(_http)
	_download_size = int(manifest.get("size", 0))
	_progress.value = 0
	_progress.show()
	var url: String = manifest_url().get_base_dir() + "/" + String(manifest.get("pck", ""))
	var ok: bool = _http.request(url) == OK
	if ok:
		var result: Array = await _http.request_completed
		ok = int(result[0]) == HTTPRequest.RESULT_SUCCESS and int(result[1]) == 200
	_http.queue_free()
	_http = null
	_progress.hide()
	if ok and _download_size > 0:
		ok = _file_size(part) == _download_size
	if ok:
		ok = FileAccess.get_sha256(part) == String(manifest.get("sha256", "")).to_lower()
	if not ok:
		DirAccess.remove_absolute(part)
		_status.text = "A atualização não chegou inteira; abrindo a versão que você já tem…"
		return false
	DirAccess.remove_absolute(target)
	return DirAccess.rename_absolute(part, target) == OK


func _fail(text: String, offer_site: bool) -> void:
	_status.text = text
	_progress.hide()
	_retry.visible = not offer_site
	_site.visible = offer_site


static func _file_size(path: String) -> int:
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	return file.get_length() if file else -1


static func _engine_version() -> String:
	var info: Dictionary = Engine.get_version_info()
	return "%d.%d.%d" % [info["major"], info["minor"], info["patch"]]


static func _mb(bytes: int) -> String:
	return ("%.1f MB" % (bytes / 1048576.0)).replace(".", ",")
