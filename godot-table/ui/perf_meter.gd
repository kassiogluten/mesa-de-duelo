# Medidor de desempenho: FPS e tempo de quadro sempre no canto da tela (F3 mostra também os objetos desenhados) e o resumo
# da sessão para os testes.
class_name PerfMeter
extends Label

var _frames: int = 0
var _elapsed: float = 0.0
var _worst_ms: float = 0.0
var _slow: int = 0
var _window: float = 0.0
## Com o detalhe (F3 ou MESA_FPS=1), mostra também quantos objetos a placa desenhou no quadro.
var detailed: bool = false


func _ready() -> void:
	add_theme_font_size_override("font_size", 13)
	add_theme_color_override("font_color", Color(0.6, 1.0, 0.6, 0.85))
	add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	add_theme_constant_override("outline_size", 4)
	dock_top(true)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	detailed = OS.get_environment("MESA_FPS") == "1"


## Na partida, logo abaixo da barra do alto à esquerda (Menu, histórico e relógios), sem cobrir nada da mesa; nas telas
## do menu, no canto de baixo à esquerda, onde não há título nem botão.
func dock_top(top: bool) -> void:
	if top:
		set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
		offset_left = 26
		offset_right = 520
		offset_top = 58
		offset_bottom = 78
	else:
		set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
		offset_left = 16
		offset_right = 520
		offset_top = -34
		offset_bottom = -12


func _process(delta: float) -> void:
	_frames += 1
	_elapsed += delta
	_worst_ms = max(_worst_ms, delta * 1000.0)
	if delta > 1.0 / 55.0:
		_slow += 1
	_window += delta
	if _window >= 0.5:
		_window = 0.0
		var fps: float = Engine.get_frames_per_second()
		# Verde com folga, amarelo abaixo de 60, vermelho abaixo de 30.
		add_theme_color_override("font_color", Color(0.6, 1.0, 0.6, 0.85) if fps >= 60.0 else (Color(1.0, 0.85, 0.4, 0.9) if fps >= 30.0 else Color(1.0, 0.45, 0.4, 0.95)))
		text = "%d FPS · %.1f ms" % [fps, delta * 1000.0]
		if detailed:
			text += " · %d objetos desenhados" % int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_F3:
		detailed = not detailed
		_window = 0.5


## Resumo desde o começo: média de FPS, pior quadro e quantos quadros passaram de 18 ms.
func summary() -> String:
	return "FPS médio %.0f, pior quadro %.1f ms, %d de %d quadros acima de 18 ms" % [_frames / max(_elapsed, 0.001), _worst_ms, _slow, _frames]
