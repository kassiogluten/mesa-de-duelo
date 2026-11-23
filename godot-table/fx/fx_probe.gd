# Sonda dos efeitos para conferir partidas de verdade: com MESA_FX_LOG=1 escreve no console cada efeito tocado (quando,
# onde, quanto atrasou depois do estado), e com MESA_FX_PRINTS=<pasta> salva um print logo depois de cada um.
class_name FxProbe
extends Node

## Espera depois do efeito para o print (o efeito já está no meio) e o espaço mínimo entre dois prints.
const SHOT_DELAY := 0.22
const SHOT_GAP := 0.35
## Eventos sem efeito na mesa: não entram no registro nem nos prints.
const QUIET := ["priority", "phase", "step"]

var log_enabled: bool = OS.get_environment("MESA_FX_LOG") == "1"
var shots_dir: String = OS.get_environment("MESA_FX_PRINTS")
var max_shots: int = int(OS.get_environment("MESA_FX_PRINTS_MAX")) if OS.get_environment("MESA_FX_PRINTS_MAX") != "" else 80
var _shots: int = 0
var _last_shot: float = -10.0
var _started: float = Time.get_ticks_msec() / 1000.0
## Quando chegou o último estado: o atraso de cada efeito é contado a partir dele.
var _state_at: float = 0.0
## O último efeito tocado, para dizer depois de qual veio um quadro lento.
var _last: String = ""
## Quando o último print foi salvo: salvar trava ~130 ms, e esse quadro não conta como lento.
var _saved_at: float = -10.0


## Ligada se alguma das variáveis pediu.
static func wanted() -> bool:
	return OS.get_environment("MESA_FX_LOG") == "1" or OS.get_environment("MESA_FX_PRINTS") != ""


func _ready() -> void:
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)


## Quadro lento (mais de 25 ms): diz quanto e depois de qual efeito (o primeiro uso de um material trava assim).
func _process(delta: float) -> void:
	if log_enabled and delta > 0.025 and _now() > 3.0 and _now() - _saved_at > 0.25:
		print("[fx %7.2f] quadro lento: %.0f ms (último efeito: %s)" % [_now(), delta * 1000.0, _last])


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0 - _started


## Um estado novo com `count` eventos, agendados para tocar em `span` segundos.
func state(count: int, span: float, moments: int) -> void:
	_state_at = _now()
	if log_enabled and (count > 0 or moments > 0):
		print("[fx %7.2f] estado: %d eventos, %d momentos, %.2f s de efeitos" % [_state_at, count, moments, span])


## Um efeito tocou agora.
func played(event: Dictionary, where: Variant) -> void:
	var kind: String = Txt.of(event.get("type"))
	if kind in QUIET:
		return
	_last = kind
	if log_enabled:
		var place: String = "(%.1f, %.1f, %.1f)" % [(where as Vector3).x, (where as Vector3).y, (where as Vector3).z] if where is Vector3 else "-"
		var name: String = Txt.of((event.get("card") as Dictionary).get("name")) if event.get("card") is Dictionary else Txt.of(event.get("sourceName"))
		print("[fx %7.2f] +%.2f %s %s %s" % [_now(), _now() - _state_at, kind, name, place])
	shot(kind)


## Quanto custou montar o efeito (na linha principal): diz quando passa de 4 ms.
func cost(kind: String, usec: int) -> void:
	if log_enabled and usec > 4000:
		print("[fx %7.2f] efeito caro: %s levou %.1f ms para montar" % [_now(), kind, usec / 1000.0])


## Salva um print daqui a pouco, com o nome do que aconteceu (se ainda há cota e espaço desde o último).
func shot(label: String) -> void:
	if shots_dir == "" or _shots >= max_shots or _now() - _last_shot < SHOT_GAP:
		return
	_last_shot = _now()
	_shots += 1
	var path: String = "%s/%03d_%06.2f_%s.png" % [shots_dir, _shots, _now(), label.replace(" ", "_")]
	var ref: WeakRef = weakref(self)
	get_tree().create_timer(SHOT_DELAY).timeout.connect(func() -> void:
		var probe: FxProbe = ref.get_ref() as FxProbe
		if probe and probe.is_inside_tree():
			probe.get_viewport().get_texture().get_image().save_png(path)
			probe._saved_at = probe._now())
