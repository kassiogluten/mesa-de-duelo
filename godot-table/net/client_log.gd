# O registro recente da mesa: guarda as últimas linhas de print, avisos e erros do motor numa fila circular, para ir junto no relato.
class_name ClientLog
extends Logger

## Quantas linhas ficam guardadas (as mais antigas saem).
const LIMIT := 200
## Uma linha muito comprida (um estado inteiro impresso) é cortada aqui.
const LINE_LIMIT := 600

static var _instance: ClientLog
static var _lines: PackedStringArray = []
## O motor chama o registro de qualquer fio (carregamento de imagens, áudio): a fila é protegida.
static var _mutex: Mutex = Mutex.new()


## Liga o registro uma vez só (main.gd chama ao abrir a mesa).
static func install() -> void:
	if _instance:
		return
	_instance = ClientLog.new()
	OS.add_logger(_instance)


## Desliga (testes).
static func uninstall() -> void:
	if _instance:
		OS.remove_logger(_instance)
		_instance = null


## Acrescenta uma linha com a hora; `kind` vazio para print, "erro" ou "aviso" para os do motor.
static func add(text: String, kind: String = "") -> void:
	var line: String = text.strip_edges()
	if line == "":
		return
	if line.length() > LINE_LIMIT:
		line = line.substr(0, LINE_LIMIT) + "…"
	var clock: String = Time.get_time_string_from_system()
	var stamped: String = "%s %s%s" % [clock, "[%s] " % kind if kind != "" else "", line]
	_mutex.lock()
	_lines.append(stamped)
	if _lines.size() > LIMIT:
		_lines = _lines.slice(_lines.size() - LIMIT)
	_mutex.unlock()


## As linhas guardadas, da mais antiga à mais nova.
static func lines() -> PackedStringArray:
	_mutex.lock()
	var copy: PackedStringArray = _lines.duplicate()
	_mutex.unlock()
	return copy


## O registro inteiro num texto só (o que vai no relato).
static func text() -> String:
	return "\n".join(lines())


static func clear() -> void:
	_mutex.lock()
	_lines = PackedStringArray()
	_mutex.unlock()


func _log_message(message: String, error: bool) -> void:
	ClientLog.add(message, "erro" if error else "")


func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
	var what: String = rationale if rationale != "" else code
	var kind: String = "aviso" if error_type == Logger.ERROR_TYPE_WARNING else "erro"
	ClientLog.add("%s (%s:%d %s)" % [what, file.get_file(), line, function], kind)
