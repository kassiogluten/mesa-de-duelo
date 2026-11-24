# Confere o manifesto do atualizador (versao.json) com a mesa aberta, a cada 15 minutos e na volta à tela inicial, e avisa de versão nova.
class_name UpdateCheck
extends Node

## Saiu versão nova. `reinstall`: ela precisa ser baixada no site (outro motor ou outro boot), e `download` diz onde.
signal available(version: String, reinstall: bool, download: String)
## Terminou uma conferência: "nova" (há versão nova, avisada agora ou antes), "em_dia" ou "falhou" (sem resposta do servidor).
signal checked(result: String)

const UpdateState := preload("res://boot/update_state.gd")
const Boot := preload("res://boot/boot.gd")
const INTERVAL_S := 15.0 * 60.0
## Conferir de novo antes disso (voltas seguidas à tela inicial) não pede nada ao servidor.
const MIN_GAP_S := 60.0
const TIMEOUT_S := 8.0

## A versão nova encontrada ({version, reinstall, download}); vazio enquanto não houver. O menu da partida a mostra.
static var pending: Dictionary = {}

## A versão em uso; vazio (rodando do projeto, sem atualizador) não confere nada.
var current: String = UpdateState.current_version()
var manifest_url: String = Boot.manifest_url()
var _last_check_ms: int = -1000000
var _busy: bool = false
var _timer: Timer


func _ready() -> void:
	if current == "":
		return
	_timer = Timer.new()
	_timer.wait_time = INTERVAL_S
	_timer.timeout.connect(check_now)
	add_child(_timer)
	_timer.start()


## Confere agora (na volta à tela inicial), se a última conferência não foi há menos de um minuto; `force` (o botão
## Procurar atualização) confere mesmo assim.
func check_now(force: bool = false) -> void:
	if current == "" or _busy or (not force and Time.get_ticks_msec() - _last_check_ms < int(MIN_GAP_S * 1000.0)):
		return
	_busy = true
	_last_check_ms = Time.get_ticks_msec()
	var http := HTTPRequest.new()
	http.timeout = TIMEOUT_S
	add_child(http)
	var me: WeakRef = weakref(self)
	http.request_completed.connect(func(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
		http.queue_free()
		var check: UpdateCheck = me.get_ref()
		if check == null:
			return
		check._busy = false
		var parsed: Variant = JSON.parse_string(body.get_string_from_utf8()) if result == HTTPRequest.RESULT_SUCCESS and code == 200 else null
		if parsed is Dictionary:
			check.apply_manifest(parsed)
		else:
			check.checked.emit("falhou"))
	if http.request(manifest_url, ["Cache-Control: no-cache"]) != OK:
		http.queue_free()
		_busy = false
		checked.emit("falhou")


## Lê o manifesto e avisa uma vez por versão.
func apply_manifest(manifest: Dictionary) -> void:
	var found: Dictionary = evaluate(manifest, current, UpdateState.load_state(), Boot.BOOT_VERSION, ReportPayload.engine_version())
	if found.is_empty():
		checked.emit("nova" if not pending.is_empty() else "em_dia")
		return
	if Txt.of(pending.get("version")) != found["version"]:
		pending = found
		ClientLog.add("Versão nova disponível: %s." % found["version"])
		available.emit(found["version"], found["reinstall"], found["download"])
	checked.emit("nova")


## A versão nova que vale avisar, ou {}: diferente da atual e não marcada como quebrada. `reinstall` quando o pacote pede
## outro motor ou um boot mais novo (o atualizador não consegue trocar sozinho; o boot manda para o site).
static func evaluate(manifest: Dictionary, current_version: String, state: Dictionary, boot_version: int, engine: String) -> Dictionary:
	var version: String = Txt.of(manifest.get("version"))
	if version == "" or current_version == "" or version == current_version:
		return {}
	if (state.get("bad", []) as Array).has(version):
		return {}
	var wanted_engine: String = Txt.of(manifest.get("engine"))
	var reinstall: bool = (wanted_engine != "" and wanted_engine != engine) or int(manifest.get("minBoot", 0)) > boot_version
	var download: String = Txt.of(manifest.get("download"))
	return {"version": version, "reinstall": reinstall, "download": download}


## Fecha e abre a mesa de novo: o boot confere a versão ao abrir e entra com a nova.
static func relaunch(tree: SceneTree) -> void:
	ClientLog.add("Reiniciando a mesa para atualizar.")
	OS.set_restart_on_exit(true, OS.get_cmdline_args())
	tree.quit()
