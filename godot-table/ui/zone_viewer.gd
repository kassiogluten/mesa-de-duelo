# A janela de zona: cemitério, exílio, zona de comando, mão revelada ou dano de comandante de um jogador, com abas e setas para passar de um jogador a outro e as cartas que dá para usar dali.
class_name ZoneViewer
extends Control

## Uma carta acesa da janela foi tocada: a mensagem pronta ({type:"card", id, gen}).
signal action(message: Dictionary)

const TITLES := {"graveyard": "Cemitério", "exile": "Exílio", "command": "Zona de comando", "hand": "Mão revelada", "damage": "Dano de comandante"}
const CARD_SIZE := Vector2(196, 273)
const GOLD := Color("#f0b84a")

var catalog: CardCatalog:
	set(value):
		catalog = value
		if catalog and not catalog.texture_ready.is_connected(_on_texture_ready):
			catalog.texture_ready.connect(_on_texture_ready)
			catalog.info_ready.connect(func(_names: PackedStringArray) -> void: _rebuild())

var _state: Dictionary = {}
var _player: int = -1
var _zone: String = ""
var _title: Label
var _tabs: HBoxContainer
var _body: ScrollContainer
var _hint: Label
var _prev: Button
var _next: Button
## Endereço da imagem → as TextureRect que esperam por ela.
var _waiting: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.02, 0.05, 0.62)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.05, 0.07, 0.12, 0.97), 18))
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -660
	panel.offset_right = 660
	panel.offset_top = -420
	panel.offset_bottom = 420
	add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	column.add_child(head)
	_prev = _small_button("←", "Jogador anterior")
	_prev.pressed.connect(_step.bind(-1))
	head.add_child(_prev)
	_title = Hud._label(28, GOLD)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.clip_text = true
	head.add_child(_title)
	_next = _small_button("→", "Próximo jogador")
	_next.pressed.connect(_step.bind(1))
	head.add_child(_next)
	var close_button := _small_button("Fechar", "Fechar (Esc)")
	close_button.pressed.connect(close)
	head.add_child(close_button)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 8)
	column.add_child(_tabs)
	_body = ScrollContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(_body)
	_hint = Hud._label(16, Color(1, 1, 1, 0.6))
	column.add_child(_hint)


## Abre a zona `zone` ("graveyard", "exile", "command", "hand", "damage") do jogador.
func open_zone(player_id: int, zone: String) -> void:
	_player = player_id
	_zone = zone
	visible = true
	_rebuild()


func close() -> void:
	visible = false
	_player = -1
	_waiting.clear()


func is_open() -> bool:
	return visible


## O estado novo: a janela aberta acompanha (cartas que entram e saem, o que dá para usar); fecha se o jogador sumiu.
func apply_state(state: Dictionary) -> void:
	_state = state
	if visible:
		_rebuild()


func _input(event: InputEvent) -> void:
	if not visible or not event is InputEventKey or not (event as InputEventKey).pressed:
		return
	match (event as InputEventKey).keycode:
		KEY_ESCAPE:
			close()
		KEY_LEFT:
			_step(-1)
		KEY_RIGHT:
			_step(1)
		_:
			return
	get_viewport().set_input_as_handled()


func _players() -> Array:
	return _state.get("players", []) if _state.get("players") is Array else []


func _player_data(id: int) -> Dictionary:
	for raw: Variant in _players():
		if int((raw as Dictionary)["id"]) == id:
			return raw
	return {}


func _who(p: Dictionary) -> String:
	return "Você" if int(p["id"]) == int(_state.get("you", -1)) else Txt.of(p.get("name"))


## Passa para o jogador anterior ou seguinte (a mesma zona).
func _step(delta: int) -> void:
	var players: Array = _players()
	if players.size() < 2:
		return
	var index: int = 0
	for i: int in players.size():
		if int((players[i] as Dictionary)["id"]) == _player:
			index = i
	_player = int((players[posmod(index + delta, players.size())] as Dictionary)["id"])
	_rebuild()


func _rebuild() -> void:
	if not visible or _title == null:
		return
	var p: Dictionary = _player_data(_player)
	if p.is_empty():
		close()
		return
	_waiting.clear()
	var entries: Array = [] if _zone == "damage" else SeatInfo.zone_cards(_state, p, _zone)
	var count_text: String = "" if _zone == "damage" else " (%d)" % entries.size()
	_title.text = "%s · %s%s" % [Txt.of(TITLES.get(_zone, "")), _who(p), count_text]
	var several: bool = _players().size() > 1 and _zone != "hand"
	_prev.visible = several
	_next.visible = several
	_build_tabs(several)
	for child: Node in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	if _zone == "damage":
		_body.add_child(_damage_list(p))
		_hint.text = "Dano de combate recebido de cada comandante. O limite é 21 para cada carta."
		return
	if entries.is_empty():
		var empty := Hud._label(20, Color(1, 1, 1, 0.5))
		empty.text = "Vazio."
		_body.add_child(empty)
	else:
		var grid := HFlowContainer.new()
		grid.add_theme_constant_override("h_separation", 14)
		grid.add_theme_constant_override("v_separation", 14)
		grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_body.add_child(grid)
		var names: PackedStringArray = []
		for raw: Variant in entries:
			names.append(Txt.of(((raw as Dictionary)["card"] as Dictionary).get("name")))
		if catalog:
			catalog.request(names)
		for raw: Variant in entries:
			grid.add_child(_tile(raw as Dictionary))
	var usable: bool = entries.any(func(e: Dictionary) -> bool: return bool(e["usable"]))
	var owner_hint: String = "Só para ver: quem joga estas cartas é %s." % Txt.of(p.get("name")) if _zone == "hand" else ""
	_hint.text = owner_hint if owner_hint != "" else ("As cartas acesas dá para usar agora: clique nelas. ← → trocam de jogador; Esc fecha." if usable else ("← → trocam de jogador; Esc fecha." if several else "Esc fecha."))


## Uma aba por jogador, com quantas cartas cada um tem nesta zona.
func _build_tabs(several: bool) -> void:
	for child: Node in _tabs.get_children():
		_tabs.remove_child(child)
		child.queue_free()
	_tabs.visible = several
	if not several:
		return
	for raw: Variant in _players():
		var p: Dictionary = raw
		var id: int = int(p["id"])
		var count: String = ""
		if _zone == "damage":
			count = Txt.of(SeatInfo.commander_damage(p)["text"]).replace("Dano ", "")
		else:
			count = str(SeatInfo.zone_cards(_state, p, _zone).size())
		var tab := _small_button("%s  %s" % [_who(p), count], "")
		var selected: bool = id == _player
		for state_name: String in ["normal", "hover", "pressed"]:
			var style := Hud._panel_style(GOLD.darkened(0.55) if selected else Color(0.1, 0.13, 0.2), 16)
			style.border_color = GOLD if selected else Color(1, 1, 1, 0.12)
			style.set_border_width_all(2 if selected else 1)
			style.content_margin_top = 6
			style.content_margin_bottom = 6
			tab.add_theme_stylebox_override(state_name, style)
		tab.pressed.connect(func() -> void:
			_player = id
			_rebuild())
		_tabs.add_child(tab)


## Uma carta: a imagem (ou o nome, enquanto ela baixa), o nome em português e a etiqueta (taxa, suspensa, tramada…).
func _tile(entry: Dictionary) -> Control:
	var card: Dictionary = entry["card"]
	var usable: bool = bool(entry["usable"])
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	box.custom_minimum_size = Vector2(CARD_SIZE.x, 0)
	var frame := Button.new()
	frame.custom_minimum_size = CARD_SIZE
	frame.focus_mode = Control.FOCUS_NONE
	frame.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if usable else Control.CURSOR_ARROW
	var card_name: String = Txt.of(card.get("name"))
	var label: String = catalog.label(card_name) if catalog and card_name != "" else (card_name if card_name != "" else "Carta virada")
	frame.tooltip_text = label
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0.1, 0.12, 0.18)
		style.set_corner_radius_all(10)
		style.border_color = GOLD if usable else Color(1, 1, 1, 0.1 if state_name != "hover" else 0.35)
		style.set_border_width_all(4 if usable else 1)
		if usable:
			style.shadow_color = Color(GOLD.r, GOLD.g, GOLD.b, 0.45 if state_name == "hover" else 0.25)
			style.shadow_size = 10
		frame.add_theme_stylebox_override(state_name, style)
	var art := TextureRect.new()
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	art.offset_left = 4
	art.offset_top = 4
	art.offset_right = -4
	art.offset_bottom = -4
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(art)
	var placeholder := Hud._label(18, Color(1, 1, 1, 0.75))
	placeholder.text = label
	placeholder.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	placeholder.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	placeholder.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	placeholder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(placeholder)
	var url: String = catalog.image_url_for(card) if catalog and not bool(card.get("faceDown", false)) else ""
	var tex: Texture2D = catalog.texture(url) if url != "" else null
	if tex:
		art.texture = tex
		placeholder.visible = false
	elif url != "":
		if not _waiting.has(url):
			_waiting[url] = []
		(_waiting[url] as Array).append([art, placeholder])
	if Txt.of(entry["tag"]) != "":
		var tag := PanelContainer.new()
		tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var style := Hud._panel_style(Color(0.04, 0.05, 0.09, 0.9), 10)
		style.border_color = GOLD
		style.set_border_width_all(1)
		style.content_margin_top = 3
		style.content_margin_bottom = 3
		style.content_margin_left = 9
		style.content_margin_right = 9
		tag.add_theme_stylebox_override("panel", style)
		var text := Hud._label(15, GOLD)
		text.text = Txt.of(entry["tag"])
		tag.add_child(text)
		tag.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
		tag.grow_horizontal = Control.GROW_DIRECTION_BOTH
		tag.grow_vertical = Control.GROW_DIRECTION_BEGIN
		tag.offset_bottom = -10
		frame.add_child(tag)
	if usable:
		var id: int = int(card.get("id", -1))
		frame.pressed.connect(func() -> void:
			var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
			action.emit({"type": "card", "id": id, "gen": int(input.get("gen", 0))}))
	box.add_child(frame)
	var caption := Hud._label(15, Color(1, 1, 1, 0.82))
	caption.text = label
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.clip_text = true
	caption.custom_minimum_size = Vector2(CARD_SIZE.x, 0)
	box.add_child(caption)
	if Txt.of(entry.get("note")) != "":
		var note := Hud._label(14, GOLD)
		note.text = Txt.of(entry["note"])
		note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		note.custom_minimum_size = Vector2(CARD_SIZE.x, 0)
		box.add_child(note)
	return box


## O dano de comandante recebido: uma linha por comandante, com o dono e "X / 21" (vermelho perto do limite).
func _damage_list(p: Dictionary) -> Control:
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 10)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var lines: Array = SeatInfo.commander_lines(_state, p, func(n: String) -> String: return catalog.label(n) if catalog else n)
	if lines.is_empty():
		var empty := Hud._label(20, Color(1, 1, 1, 0.5))
		empty.text = "Nenhum dano de comandante."
		list.add_child(empty)
	for raw: Variant in lines:
		var line: Dictionary = raw
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		var who := Hud._label(24, Color.WHITE)
		who.text = Txt.of(line["name"]) + ("  ·  de %s" % line["owner"] if Txt.of(line["owner"]) != "" else "")
		who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(who)
		var damage: int = int(line["damage"])
		var value := Hud._label(30, Color("#ff5a4e") if damage >= SeatInfo.COMMANDER_NEAR else Color.WHITE)
		value.text = Txt.of(line["text"])
		row.add_child(value)
		list.add_child(row)
		var bar := ProgressBar.new()
		bar.max_value = SeatInfo.COMMANDER_LIMIT
		bar.value = mini(damage, SeatInfo.COMMANDER_LIMIT)
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(0, 10)
		var fill := StyleBoxFlat.new()
		fill.bg_color = Color("#ff5a4e") if damage >= SeatInfo.COMMANDER_NEAR else GOLD
		fill.set_corner_radius_all(5)
		bar.add_theme_stylebox_override("fill", fill)
		var back := StyleBoxFlat.new()
		back.bg_color = Color(1, 1, 1, 0.08)
		back.set_corner_radius_all(5)
		bar.add_theme_stylebox_override("background", back)
		list.add_child(bar)
	return list


func _on_texture_ready(url: String, tex: Texture2D) -> void:
	for pair: Variant in _waiting.get(url, []):
		var art: TextureRect = (pair as Array)[0]
		var placeholder: Label = (pair as Array)[1]
		if is_instance_valid(art):
			art.texture = tex
		if is_instance_valid(placeholder):
			placeholder.visible = false
	_waiting.erase(url)


static func _small_button(text: String, hint: String) -> Button:
	var button := Hud._button(text, false)
	button.custom_minimum_size = Vector2(52, 44)
	button.add_theme_font_size_override("font_size", 18)
	button.tooltip_text = hint
	button.focus_mode = Control.FOCUS_NONE
	return button
