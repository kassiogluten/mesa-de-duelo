# Gráfico da vida de cada jogador no fim de cada turno, para a tela de resultado (porte de src/ui/lifeChart.ts): as linhas
# se desenham da esquerda para a direita ao aparecer; passar o mouse numa coluna mostra a vida de todos naquele turno.
class_name LifeChart
extends Control

const LEFT := 40.0
const RIGHT := 130.0
const TOP := 34.0
const BOTTOM := 30.0

var _series: Array = []
var _turns: Array[int] = []
var _range: Vector2i = Vector2i(0, 20)
var _hover: int = -1
## Quanto das linhas já foi desenhado (0 a 1), para a entrada animada.
var progress: float = 1.0:
	set(value):
		progress = value
		queue_redraw()


func _init() -> void:
	custom_minimum_size = Vector2(760, 250)
	mouse_filter = Control.MOUSE_FILTER_PASS


## Monta o gráfico de um estado de fim de jogo; false se não há o que mostrar (sem histórico).
func set_state(state: Dictionary) -> bool:
	_series = GameResult.life_series(state)
	_turns = GameResult.life_turns(state)
	_range = GameResult.life_range(_series)
	_hover = -1
	queue_redraw()
	return not _series.is_empty()


## Redesenha as linhas da esquerda para a direita.
func play(duration: float = 0.9, delay: float = 0.0) -> void:
	progress = 0.0
	var tween := create_tween()
	tween.tween_interval(delay)
	tween.tween_property(self, "progress", 1.0, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## O ponto na tela de um valor de vida no turno de índice `i`.
func point(i: int, life: float) -> Vector2:
	var last: int = maxi(_turns.size() - 1, 1)
	var x: float = LEFT + (size.x - LEFT - RIGHT) * (float(i) / last)
	var span: float = float(_range.y - _range.x) if _range.y != _range.x else 1.0
	var y: float = TOP + (size.y - TOP - BOTTOM) * ((_range.y - life) / span)
	return Vector2(x, y)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and _turns.size() > 1:
		var x: float = (event as InputEventMouseMotion).position.x
		var step: float = (size.x - LEFT - RIGHT) / (_turns.size() - 1)
		var index: int = clampi(roundi((x - LEFT) / step), 0, _turns.size() - 1)
		if index != _hover:
			_hover = index
			queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_MOUSE_EXIT and _hover >= 0:
		_hover = -1
		queue_redraw()


func _draw() -> void:
	if _series.is_empty():
		return
	var font: Font = get_theme_default_font()
	var plot_bottom: float = size.y - BOTTOM
	# Legenda no alto, uma entrada por jogador.
	var lx: float = LEFT
	for s: Dictionary in _series:
		var color: Color = s["color"]
		_line(Vector2(lx, 12), Vector2(lx + 22, 12), color, bool(s["dashed"]))
		draw_string(font, Vector2(lx + 28, 18), Txt.of(s["name"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(1, 1, 1, 0.8))
		lx += 40.0 + font.get_string_size(Txt.of(s["name"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x + 18.0
	# Grade e eixo da vida.
	for v: int in GameResult.life_ticks(_range.x, _range.y):
		var y: float = point(0, v).y
		draw_line(Vector2(LEFT, y), Vector2(size.x - RIGHT, y), Color(1, 1, 1, 0.28 if v == 0 else 0.09), 1.5 if v == 0 else 1.0)
		draw_string(font, Vector2(0, y + 5), str(v), HORIZONTAL_ALIGNMENT_RIGHT, LEFT - 8, 13, Color(1, 1, 1, 0.5))
	# Eixo dos turnos: no máximo uns 10 números.
	var last: int = _turns.size() - 1
	var every: int = maxi(1, ceili(last / 10.0))
	for i: int in _turns.size():
		if i % every == 0 or i == last:
			var x: float = point(i, 0).x
			draw_string(font, Vector2(x - 20, size.y - 8), str(_turns[i]), HORIZONTAL_ALIGNMENT_CENTER, 40, 13, Color(1, 1, 1, 0.5))
	# Coluna sob o mouse.
	if _hover >= 0:
		var hx: float = point(_hover, 0).x
		draw_line(Vector2(hx, TOP), Vector2(hx, plot_bottom), Color(1, 1, 1, 0.3), 1.0)
	# As linhas, até onde a animação chegou.
	var reach: float = progress * last
	for s: Dictionary in _series:
		var color: Color = s["color"]
		var pts: PackedVector2Array = []
		var life: Array[float] = s["life"]
		for i: int in life.size():
			if is_nan(life[i]):
				continue
			if i <= reach:
				pts.append(point(i, life[i]))
			elif i - 1 >= 0 and not is_nan(life[i - 1]):
				pts.append(point(i - 1, life[i - 1]).lerp(point(i, life[i]), reach - (i - 1)))
				break
		if pts.size() >= 2:
			if bool(s["dashed"]):
				for k: int in pts.size() - 1:
					_line(pts[k], pts[k + 1], color, true)
			else:
				draw_polyline(pts, color, 3.0, true)
		if pts.size() >= 1:
			draw_circle(pts[pts.size() - 1], 4.5, color)
	# Os nomes com a vida final na ponta das linhas, afastados para não se encostarem.
	if progress >= 0.999:
		var ys: Array[float] = []
		for s: Dictionary in _series:
			ys.append(point(last, _last_value(s)).y)
		var spread: Array[float] = GameResult.spread_labels(ys, 18.0, plot_bottom)
		for k: int in _series.size():
			var s: Dictionary = _series[k]
			var name: String = Txt.of(s["name"])
			if name.length() > 12:
				name = name.substr(0, 11) + "…"
			var at := Vector2(point(last, 0).x + 12, spread[k] + 5)
			draw_string(font, at, str(int(_last_value(s))), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, s["color"])
			draw_string(font, at + Vector2(30, 0), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.75))
	if _hover >= 0:
		_draw_tip(font, _hover)


func _draw_tip(font: Font, i: int) -> void:
	var x: float = point(i, 0).x
	for s: Dictionary in _series:
		var v: float = (s["life"] as Array[float])[i]
		if not is_nan(v):
			draw_circle(point(i, v), 5.0, s["color"])
	var box := Vector2(150, 30 + _series.size() * 20)
	var bx: float = x + 12 if x + box.x + 16 < size.x else x - box.x - 12
	var rect := Rect2(Vector2(bx, TOP), box)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.08, 0.13, 0.96)
	style.set_corner_radius_all(8)
	style.border_color = Color(1, 1, 1, 0.15)
	style.set_border_width_all(1)
	draw_style_box(style, rect)
	draw_string(font, rect.position + Vector2(10, 20), "Início" if _turns[i] == 0 else "Fim do turno %d" % _turns[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.9))
	for k: int in _series.size():
		var s: Dictionary = _series[k]
		var y: float = rect.position.y + 40 + k * 20
		draw_circle(Vector2(rect.position.x + 14, y - 5), 4.0, s["color"])
		draw_string(font, Vector2(rect.position.x + 24, y), Txt.of(s["name"]).left(10), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.75))
		var v: float = (s["life"] as Array[float])[i]
		draw_string(font, Vector2(rect.end.x - 50, y), "–" if is_nan(v) else str(int(v)), HORIZONTAL_ALIGNMENT_RIGHT, 40, 14, Color.WHITE)


func _last_value(s: Dictionary) -> float:
	var life: Array[float] = s["life"]
	for i: int in range(life.size() - 1, -1, -1):
		if not is_nan(life[i]):
			return life[i]
	return 0.0


## Uma linha cheia ou tracejada (a quarta série).
func _line(a: Vector2, b: Vector2, color: Color, dashed: bool) -> void:
	if dashed:
		draw_dashed_line(a, b, color, 3.0, 7.0, true, true)
	else:
		draw_line(a, b, color, 3.0, true)
