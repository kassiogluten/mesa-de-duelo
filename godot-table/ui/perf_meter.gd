# Medidor de desempenho: FPS e tempo de quadro na tela (F3 liga e desliga) e o resumo da sessão para os testes.
class_name PerfMeter
extends Label

var _frames: int = 0
var _elapsed: float = 0.0
var _worst_ms: float = 0.0
var _slow: int = 0
var _window: float = 0.0


func _ready() -> void:
	add_theme_font_size_override("font_size", 16)
	add_theme_color_override("font_color", Color(0.6, 1.0, 0.6))
	set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	offset_left = 24
	offset_right = 420
	offset_top = 300
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = OS.get_environment("MESA_FPS") == "1"


func _process(delta: float) -> void:
	_frames += 1
	_elapsed += delta
	_worst_ms = max(_worst_ms, delta * 1000.0)
	if delta > 1.0 / 55.0:
		_slow += 1
	_window += delta
	if _window >= 0.5 and visible:
		_window = 0.0
		text = "%d FPS · %.1f ms · %d objetos desenhados" % [Engine.get_frames_per_second(), delta * 1000.0, int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))]


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_F3:
		visible = not visible


## Resumo desde o começo: média de FPS, pior quadro e quantos quadros passaram de 18 ms.
func summary() -> String:
	return "FPS médio %.0f, pior quadro %.1f ms, %d de %d quadros acima de 18 ms" % [_frames / max(_elapsed, 0.001), _worst_ms, _slow, _frames]
