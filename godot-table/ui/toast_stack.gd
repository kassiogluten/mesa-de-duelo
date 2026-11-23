# Avisos curtos da partida (servidor caiu, de volta à partida, jogada recusada): pílulas escuras com um filete na cor
# do tipo, empilhadas no meio da tela logo acima da faixa de turno, que entram deslizando e somem sozinhas.
class_name ToastStack
extends Control

const LIFETIME := 4.0
const MAX_TOASTS := 3
const MAX_WIDTH := 720.0
const GAP := 8.0
## A pilha termina logo acima da faixa de turno (TurnBanner.HEIGHT no meio da tela), sem ficar por baixo dela.
const ABOVE_CENTER := 74.0
const TONES := {"info": HudStyle.INFO, "error": HudStyle.DANGER, "success": HudStyle.SUCCESS, "warning": HudStyle.GOLD}

## [{node, left, kind, text}]: o mais novo por último (embaixo, mais perto do meio).
var _items: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Mostra um aviso; `kind`: "info", "error", "success" ou "warning". O mesmo texto repetido só renova o que já está.
func show_toast(text: String, kind: String = "info") -> void:
	if text.strip_edges() == "":
		return
	for item: Dictionary in _items:
		if item["text"] == text and is_instance_valid(item["node"]):
			item["left"] = LIFETIME
			_bump(item["node"])
			return
	var node := _make(text, Txt.of(kind))
	add_child(node)
	node.modulate.a = 0.0
	_items.append({"node": node, "left": LIFETIME, "kind": kind, "text": text, "y": -1.0, "age": 0.0})
	while _items.size() > MAX_TOASTS:
		var old: Dictionary = _items.pop_front()
		(old["node"] as Node).queue_free()


## Quantos avisos estão à vista.
func count() -> int:
	return _items.size()


## O texto dos avisos à vista, do mais velho ao mais novo.
func texts() -> PackedStringArray:
	return PackedStringArray(_items.map(func(item: Dictionary) -> String: return Txt.of(item["text"])))


func _make(text: String, kind: String) -> PanelContainer:
	var tone: Color = TONES.get(kind, HudStyle.INFO)
	var box := PanelContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := HudStyle.panel(Color(0.03, 0.045, 0.08, 0.94), 12)
	style.border_color = Color(tone, 0.4)
	style.set_border_width_all(1)
	style.border_width_left = 4
	style.content_margin_left = 16
	style.content_margin_right = 18
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	style.shadow_color = Color(0, 0, 0, 0.4)
	style.shadow_size = 12
	style.shadow_offset = Vector2(0, 4)
	box.add_theme_stylebox_override("panel", style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(row)
	var dot := Panel.new()
	var dot_style := StyleBoxFlat.new()
	dot_style.bg_color = tone
	dot_style.set_corner_radius_all(5)
	dot.add_theme_stylebox_override("panel", dot_style)
	dot.custom_minimum_size = Vector2(9, 9)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(dot)
	var label := HudStyle.label(18, HudStyle.TEXT)
	label.add_theme_constant_override("outline_size", 0)
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var font: Font = ThemeDB.fallback_font
	var natural: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x + 4.0
	label.custom_minimum_size = Vector2(minf(natural, MAX_WIDTH - 60.0), 0)
	row.add_child(label)
	return box


func _bump(node: Control) -> void:
	node.pivot_offset = node.size / 2.0
	node.scale = Vector2.ONE * 1.06
	node.create_tween().tween_property(node, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _process(delta: float) -> void:
	if _items.is_empty():
		return
	var view: Vector2 = get_viewport_rect().size
	var bottom: float = view.y / 2.0 - ABOVE_CENTER
	var alive: Array = []
	for item: Dictionary in _items:
		item["left"] = float(item["left"]) - delta
		item["age"] = float(item["age"]) + delta
		if float(item["left"]) <= 0.0 or not is_instance_valid(item["node"]):
			if is_instance_valid(item["node"]):
				(item["node"] as Node).queue_free()
			continue
		alive.append(item)
	_items = alive
	# Do mais novo (embaixo) para o mais velho (em cima); cada um desliza até o seu lugar.
	for i: int in range(_items.size() - 1, -1, -1):
		var item: Dictionary = _items[i]
		var node: PanelContainer = item["node"]
		node.reset_size()
		var box_size: Vector2 = node.get_combined_minimum_size()
		var y: float = bottom - box_size.y
		bottom = y - GAP
		var current: float = float(item["y"])
		current = y + 14.0 if current < 0.0 else lerpf(current, y, 1.0 - exp(-delta * 14.0))
		item["y"] = current
		node.size = box_size
		node.position = Vector2((view.x - box_size.x) / 2.0, current)
		var left: float = float(item["left"])
		var fade_in: float = clampf(float(item["age"]) / 0.18, 0.0, 1.0)
		node.modulate.a = minf(fade_in, clampf(left / 0.5, 0.0, 1.0))
