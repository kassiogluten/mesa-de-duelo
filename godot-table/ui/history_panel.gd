# Gaveta do histórico da partida (porte de src/ui/historyPanel.ts): as jogadas agrupadas por turno (text/history_log.gd),
# uma linha por jogada em português com a miniatura da carta, que amplia ao passar o mouse mesmo depois de ela sair da mesa.
class_name HistoryPanel
extends PanelContainer

## O que entra no histórico (PRESENTABLE de src/ui/presentationTimeline.ts, mais as compras).
const KEPT := ["land-played", "spell-cast", "ability-activated", "resolved", "countered", "entered", "left", "discard", "mill", "attackers",
	"blockers", "damage", "life-changed", "turn", "scry", "coin", "die", "attached", "control-changed", "starting-roll", "survived", "cascade", "draw"]
const LIMIT := 3000
const THUMB := Vector2(34, 47)

var catalog: CardCatalog
var _history: Array = []
var _cursor: int = 0
## Já houve golpe de combate num jogador neste jogo (o turno 1 desmarca): o próximo é o "Primeiro sangue".
var _bloodied: bool = true
var _state: Dictionary = {}
var _open: Dictionary = {}
var _list: VBoxContainer
var _scroll: ScrollContainer
var _preview: TextureRect
var _dirty: bool = false
var _urls: Dictionary = {}


func _ready() -> void:
	add_theme_stylebox_override("panel", HudStyle.framed(Hud._panel_style(Color(0.035, 0.05, 0.085, 0.95), 14)))
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	add_child(column)
	var head := HBoxContainer.new()
	column.add_child(head)
	var title := Hud._label(22, Hud.GOLD)
	title.add_theme_constant_override("outline_size", 0)
	title.text = "Histórico da partida"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var close := MatchBar._small("Fechar")
	close.pressed.connect(func() -> void: toggle(false))
	head.add_child(close)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 6)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	_preview = TextureRect.new()
	_preview.top_level = true
	_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_preview.size = Vector2(300, 420)
	_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_preview.visible = false
	add_child(_preview)
	if catalog:
		catalog.texture_ready.connect(func(url: String, _tex: Texture2D) -> void:
			if visible and _urls.has(url):
				_dirty = true)


func _process(_delta: float) -> void:
	if _dirty and visible:
		_dirty = false
		_render()


## Abre ou fecha a gaveta (sem argumento, alterna).
func toggle(open: Variant = null) -> void:
	visible = not visible if open == null else bool(open)
	_preview.visible = false
	if visible:
		_render()


## Guarda os eventos novos do estado (uma vez cada, pela ordem), como a fila de apresentação da mesa do navegador.
func ingest(state: Dictionary) -> void:
	_state = state
	var events: Array = (state.get("events", []) as Array).duplicate() if state.get("events") is Array else []
	events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("seq", 0)) < int(b.get("seq", 0)))
	if not events.is_empty() and int((events[-1] as Dictionary).get("seq", 0)) < _cursor - 1000:
		# O servidor recomeçou a contagem: é outra partida.
		_history.clear()
		_cursor = 0
		_open.clear()
	var added: bool = false
	for raw: Variant in events:
		var event: Dictionary = (raw as Dictionary).duplicate(true)
		var seq: int = int(event.get("seq", 0))
		if seq <= _cursor:
			continue
		_cursor = seq
		var type: String = Txt.of(event.get("type"))
		if not KEPT.has(type):
			continue
		_mark_first_blood(event)
		if type == "mill":
			event["milled"] = [event["card"]] if event.get("card") is Dictionary else []
		if type == "entered" and _land_transition(event):
			continue
		if type == "land-played":
			_drop_entry_of(event)
		var last: Variant = _history[-1] if not _history.is_empty() else null
		if last is Dictionary and _same_mill(last, event):
			event["milled"] = ((last as Dictionary).get("milled", []) as Array) + (event.get("milled", []) as Array)
			_history[-1] = event
		elif last is Dictionary and _same_draw(last, event):
			event["count"] = EventText.num(last, "count", 1) + EventText.num(event, "count", 1)
			_history[-1] = event
		else:
			_history.append(event)
		added = true
	if _history.size() > LIMIT:
		_history = _history.slice(_history.size() - LIMIT)
	if added and visible:
		_dirty = true


## Os eventos guardados (para os testes e para ver de novo).
func history() -> Array:
	return _history


func _mark_first_blood(event: Dictionary) -> void:
	var type: String = Txt.of(event.get("type"))
	if type == "turn" and int(EventText.num(event, "turn")) == 1:
		_bloodied = false
		return
	var hit: bool = type == "damage" and EventText.truthy(event.get("combat")) and not EventText.truthy(event.get("prevented")) \
		and event.get("targets") is Dictionary and not ((event["targets"] as Dictionary).get("players", []) as Array).is_empty()
	if _bloodied or not hit:
		return
	_bloodied = true
	event["firstBlood"] = true


## A entrada no campo de um terreno jogado logo antes (a jogada já conta).
func _land_transition(entry: Dictionary) -> bool:
	return _partner(entry, "land-played") >= 0


## Terreno jogado logo depois da entrada dele no campo: a entrada sai do histórico.
func _drop_entry_of(played: Dictionary) -> void:
	var i: int = _partner(played, "entered")
	if i >= 0:
		_history.remove_at(i)


## O índice, entre os últimos eventos guardados, do par (jogou o terreno ↔ entrou no campo vindo da mão) da mesma carta.
func _partner(event: Dictionary, type: String) -> int:
	var id: Variant = _card_id(event)
	if id == null:
		return -1
	for i: int in range(_history.size() - 1, maxi(-1, _history.size() - 4), -1):
		var other: Dictionary = _history[i]
		var entry: Dictionary = other if type == "entered" else event
		if Txt.of(other.get("type")) == type and Txt.of(entry.get("from")) == "Hand" and _card_id(other) != null \
			and float(_card_id(other)) == float(id) and absi(int(event.get("seq", 0)) - int(other.get("seq", 0))) <= 2:
			return i
	return -1


static func _card_id(event: Dictionary) -> Variant:
	return (event["card"] as Dictionary).get("id") if event.get("card") is Dictionary else event.get("sourceId")


static func _same_mill(a: Dictionary, b: Dictionary) -> bool:
	return Txt.of(a.get("type")) == "mill" and Txt.of(b.get("type")) == "mill" and a.get("actor") == b.get("actor") \
		and EventText.truthy(a.get("surveil")) == EventText.truthy(b.get("surveil")) and a.get("sourceName") == b.get("sourceName")


static func _same_draw(a: Dictionary, b: Dictionary) -> bool:
	return Txt.of(a.get("type")) == "draw" and Txt.of(b.get("type")) == "draw" and a.get("actor") == b.get("actor") \
		and EventText.truthy(a.get("searched")) == EventText.truthy(b.get("searched"))


## A vista que as frases precisam (text/event_text.gd), com os nomes em português do catálogo.
func event_view() -> Dictionary:
	return {
		"state": func() -> Dictionary: return _state,
		"label": func(card: Variant) -> String: return _label(card),
		"findCard": func(id: Variant) -> Variant: return _find_card(id),
		"ptName": func(name: Variant) -> Variant:
			var pt: String = catalog.label(Txt.of(name)) if catalog else Txt.of(name)
			return pt if pt != Txt.of(name) else null,
	}


## Os nomes do histórico agrupado (text/history_log.gd).
func history_names() -> Dictionary:
	var view: Dictionary = event_view()
	return {
		"you": _state.get("you"),
		"player": func(id: Variant) -> String:
			var name: Variant = EventText.player_name(_state, id)
			return Txt.of(name) if name != null else "Jogador",
		"card": func(e: Dictionary) -> Variant:
			var c: Variant = e.get("card")
			return _label(c) if c is Dictionary and EventText.truthy((c as Dictionary).get("name")) and not EventText.truthy((c as Dictionary).get("faceDown")) else null,
		"cardById": func(id: Variant, e: Dictionary) -> Variant:
			var c: Variant = EventText.frame_card(id, e)
			return c if c != null else _find_card(id),
		"label": func(card: Variant) -> String: return _label(card),
		"describe": func(e: Dictionary) -> String: return EventText.describe(view, e, true),
	}


func _label(card: Variant) -> String:
	if not card is Dictionary:
		return ""
	var name: String = Txt.of((card as Dictionary).get("name"))
	return catalog.label(name) if catalog and name != "" else name


func _find_card(id: Variant) -> Variant:
	if id == null:
		return null
	for p: Variant in _state.get("players", []):
		for zone: String in ["battlefield", "hand", "graveyard", "exile", "command"]:
			for c: Variant in (p as Dictionary).get(zone, []) if (p as Dictionary).get(zone) is Array else []:
				if c is Dictionary and (c as Dictionary).get("id") != null and float((c as Dictionary)["id"]) == float(id):
					return c
	return null


func _render() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	_urls.clear()
	var turns: Array = HistoryLog.history_turns(_history, history_names())
	if turns.is_empty():
		_list.add_child(_note("As jogadas aparecerão aqui."))
		return
	var you: Variant = _state.get("you")
	var names: Dictionary = history_names()
	for i: int in range(turns.size() - 1, -1, -1):
		var turn: Dictionary = turns[i]
		var key: String = turn["key"]
		var open: bool = bool(_open.get(key, i >= turns.size() - 2))
		var mine: bool = turn["actor"] != null and you != null and float(turn["actor"]) == float(you)
		var heading: String = "Início da partida" if turn["turn"] == null else "Turno %d · %s" % [int(turn["turn"]), "Você" if mine else (names["player"] as Callable).call(turn["actor"])]
		var head := Button.new()
		head.flat = true
		head.alignment = HORIZONTAL_ALIGNMENT_LEFT
		head.text = "%s  %s    %s" % ["▾" if open else "▸", heading, HistoryLog.turn_summary(turn)]
		head.add_theme_font_size_override("font_size", 16)
		head.add_theme_color_override("font_color", Hud.GOLD if mine else Color(1, 1, 1, 0.85))
		head.add_theme_color_override("font_hover_color", Color(1, 1, 1))
		head.focus_mode = Control.FOCUS_NONE
		head.pressed.connect(func() -> void:
			_open[key] = not open
			_render())
		_list.add_child(head)
		if not open:
			continue
		var lines: Array = turn["lines"]
		if lines.is_empty():
			_list.add_child(_note("Nenhuma jogada ainda."))
		for j: int in range(lines.size() - 1, -1, -1):
			_add_line(lines[j], you)


func _add_line(line: Dictionary, you: Variant) -> void:
	var mine: bool = line.get("actor") != null and you != null and float(line["actor"]) == float(you)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var accent := ColorRect.new()
	accent.color = Hud.GOLD if mine else Color(1, 1, 1, 0.15)
	accent.custom_minimum_size = Vector2(3, 0)
	row.add_child(accent)
	row.add_child(_thumb(line.get("card")))
	var text := Hud._label(15, Color(1, 1, 1, 0.92))
	text.add_theme_constant_override("outline_size", 0)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.text = Txt.of(line["text"])
	text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var badges: Array = line.get("badges", [])
	if not badges.is_empty():
		text.text += "  ·  " + "  ·  ".join(PackedStringArray(badges))
		text.add_theme_color_override("font_color", Color("#ffd27a"))
	row.add_child(text)
	var children: Array = line.get("children", [])
	var key: String = Txt.of(line["key"])
	var expanded: bool = bool(_open.get(key, false))
	if not children.is_empty():
		var more := MatchBar._small("%d %s" % [children.size(), "▴" if expanded else "▾"])
		more.custom_minimum_size = Vector2(52, 32)
		more.tooltip_text = ("Esconder" if expanded else "Mostrar") + " os detalhes"
		more.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		more.pressed.connect(func() -> void:
			_open[key] = not expanded
			_render())
		row.add_child(more)
	_list.add_child(row)
	if expanded:
		for child: Dictionary in children:
			var sub := HBoxContainer.new()
			sub.add_theme_constant_override("separation", 8)
			var indent := Control.new()
			indent.custom_minimum_size = Vector2(28, 0)
			sub.add_child(indent)
			sub.add_child(_thumb(child.get("card"), 0.8))
			var t := Hud._label(14, Color(1, 1, 1, 0.75))
			t.add_theme_constant_override("outline_size", 0)
			t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			t.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			t.text = Txt.of(child["text"])
			sub.add_child(t)
			_list.add_child(sub)


## A miniatura da carta (vazia sem carta); passar o mouse amplia ao lado da gaveta.
func _thumb(card: Variant, scale: float = 1.0) -> Control:
	var box := Panel.new()
	box.custom_minimum_size = THUMB * scale
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1, 1, 1, 0.05) if card is Dictionary else Color(0, 0, 0, 0)
	style.set_corner_radius_all(4)
	box.add_theme_stylebox_override("panel", style)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not card is Dictionary or catalog == null:
		return box
	var url: String = catalog.image_url_for(card)
	if url == "":
		catalog.request(PackedStringArray([Txt.of((card as Dictionary).get("name"))]))
		return box
	_urls[url] = true
	var tex: Texture2D = catalog.texture(url)
	var rect := TextureRect.new()
	rect.texture = tex
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_STOP
	rect.mouse_entered.connect(func() -> void: _show_preview(catalog.texture(url), rect))
	rect.mouse_exited.connect(func() -> void: _preview.visible = false)
	box.add_child(rect)
	return box


func _show_preview(tex: Texture2D, from: Control) -> void:
	if tex == null:
		return
	_preview.texture = tex
	var view: Vector2 = get_viewport_rect().size
	var rect: Rect2 = get_global_rect()
	var y: float = clampf(from.get_global_rect().get_center().y - _preview.size.y / 2.0, 12.0, view.y - _preview.size.y - 12.0)
	_preview.position = Vector2(rect.end.x + 14.0, y)
	_preview.visible = true


static func _note(text: String) -> Label:
	var label := Hud._label(15, Color(1, 1, 1, 0.6))
	label.add_theme_constant_override("outline_size", 0)
	label.text = text
	return label
