# Painel da pilha à direita da mesa: "Pilha N" com a moldura viva na cor do topo, o selo do topo (ícone, Mágica/Habilidade/
# Gatilho e a forma de conjurar), a faixa da lealdade ou dos modos, quem resolve agora, o efeito, os alvos, os outros itens
# na ordem em que resolvem (ui/stack_rows.gd) e a galeria em tela cheia (ui/stack_gallery.gd). A carta grande do topo é a
# carta 3D da mesa, que voa até o vão do painel (TableView._place_stack pergunta onde fica com layer_rect).
class_name StackPanel
extends Control

## Mensagem pronta para o servidor ({type:"stack", id, gen}).
signal action(message: Dictionary)
## A carta de um item sob o mouse (null ao sair), para a carta ampliada.
signal preview(texture: Texture2D)
## O vão da carta mudou (recolheu, expandiu, a tela mudou de tamanho): a mesa recoloca as cartas da pilha.
signal layout_changed

const GOLD := StackStyle.GOLD
const WIDTH := 280.0
## Largura da pílula da pilha recolhida.
const COLLAPSED_W := 262.0
const MARGIN_RIGHT := 24.0
const TOP := 150.0
## Com três oponentes ou mais, o do canto direito tem o grimório logo acima do painel: o painel desce um pouco.
const TOP_CROWDED := 170.0
const HEADER_H := 44.0
## Altura da carta do topo na tela; a largura sai da proporção da carta.
const CARD_H := 270.0
const COLLAPSED_H := 84.0
## Quanto cada camada de baixo aparece por trás do topo (para cima e para a esquerda), até a terceira: uma faixa larga de
## cada carta à vista, para ficar claro que há mais itens debaixo do topo.
const PEEK := Vector2(-24, -24)
const MAX_PEEK := 3
const MAX_ROWS := 3
## Espaço mínimo entre o painel e a caixa de ação.
const ACTION_GAP := 12.0
const KIND_COLORS := StackStyle.KIND_COLORS
const TONE_COLORS := {"up": Color("#3fbf6a"), "down": Color("#e0574f"), "zero": Color("#9aa3b5")}

var catalog: CardCatalog
## A mesa 3D (para acender a carta e os alvos do item sob o mouse); sem mesa, só a carta ampliada.
var table: TableView:
	set(value):
		table = value
		if _focus:
			_focus.table = value
## Onde fica a caixa de ação na tela (Hud.action_rect): o texto do painel nunca passa por cima dela.
var avoid_rect: Callable = func() -> Rect2: return Rect2()
var collapsed: bool = false
## A galeria em tela cheia (fica ao lado do painel, no mesmo CanvasLayer, e vai para a frente ao abrir).
var gallery: StackGallery

var _state: Dictionary = {}
var _top_id: int = -1
var _ids: Array = []
var _shown: bool = false
## Mesa com três oponentes ou mais (o painel desce para não cobrir o grimório do oponente do canto).
var _crowded: bool = false
var _time: float = 0.0
var _last_avoid: Rect2 = Rect2()
var _header: StackHeader
var _header_frame: StackFrame
var _badge: PanelContainer
var _status: PanelContainer
var _status_label: Label
var _strip: PanelContainer
var _strip_box: VBoxContainer
var _effect_face: PanelContainer
var _effect_face_label: Label
var _info: PanelContainer
var _info_frame: StackFrame
var _respond: PanelContainer
var _owner: Label
var _effect: Label
## O efeito inteiro (o rótulo pode mostrar só as primeiras linhas; o resto fica no balão do texto).
var _effect_full: String = ""
var _cast: Label
var _targets: Label
var _choose: Button
var _rows: StackRows
var _rows_title: Label
var _focus: StackFocus
## O aro de luz em volta do vão quando uma carta nova pousa no topo (ou resolve).
var _flash: Panel
var _hide_tween: Tween
## Os números das camadas de baixo (2, 3, 4) na cor do tipo de cada uma, e o "+N" das que ficam escondidas atrás.
var _layer_chips: StackLayerChips


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_focus = StackFocus.new()
	_focus.table = table
	add_child(_focus)
	_header = StackHeader.new()
	_header.gallery_pressed.connect(func() -> void: open_gallery())
	_header.toggle_pressed.connect(func() -> void:
		collapsed = not collapsed
		_refresh()
		layout_changed.emit())
	_effect_face = _pill(Color(0.1, 0.11, 0.17, 0.97), 14)
	_effect_face_label = Hud._label(17, Color(1, 1, 1, 0.9))
	_effect_face_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_effect_face_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_effect_face_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_effect_face.add_child(_effect_face_label)
	_strip = _pill(Color(0.04, 0.05, 0.09, 0.9), 10)
	_strip_box = VBoxContainer.new()
	_strip_box.add_theme_constant_override("separation", 4)
	_strip_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_strip.add_child(_strip_box)
	_badge = StackStyle.kind_badge(15)
	_status = _pill(Color(0.05, 0.06, 0.1, 0.95), 14)
	_status_label = Hud._label(15, GOLD)
	_status.add_child(_status_label)
	_build_info()
	_flash = Panel.new()
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.modulate.a = 0.0
	var ring := StyleBoxFlat.new()
	ring.draw_center = false
	ring.set_border_width_all(4)
	ring.set_corner_radius_all(12)
	ring.border_blend = true
	_flash.add_theme_stylebox_override("panel", ring)
	add_child(_flash)
	# O cabeçalho e o texto seguram o clique (não vaza para a carta da mesa atrás); o vão da carta deixa passar.
	_info.mouse_filter = Control.MOUSE_FILTER_STOP
	_header_frame = StackFrame.new()
	_info_frame = StackFrame.new()
	_layer_chips = StackLayerChips.new()
	for node: Control in [_info_frame, _layer_chips, _effect_face, _strip, _info, _badge, _status, _header_frame, _header]:
		add_child(node)
	gallery = StackGallery.new()
	gallery.catalog = catalog
	gallery.translate = _translate
	gallery.pt_text = func(source: Dictionary) -> String: return _pt_text(source)
	gallery.action.connect(func(message: Dictionary) -> void: action.emit(message))
	# A galeria cobre o HUD: vai para o mesmo CanvasLayer do painel, depois dele (e para a frente quando abre).
	if get_parent():
		get_parent().add_child.call_deferred(gallery)
	else:
		add_child(gallery)
	get_viewport().size_changed.connect(func() -> void:
		if visible:
			_place()
			layout_changed.emit())


func _exit_tree() -> void:
	if is_instance_valid(gallery) and gallery.get_parent() != self:
		gallery.queue_free()


func _build_info() -> void:
	_info = _pill(Color(0.05, 0.07, 0.12, 0.92), 14)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_info.add_child(column)
	_respond = PanelContainer.new()
	var respond_style := _style(Color(0.3, 0.2, 0.04, 0.95), 8, 10, 1)
	respond_style.border_color = Color(GOLD, 0.8)
	respond_style.shadow_color = Color(GOLD, 0.35)
	respond_style.shadow_size = 6
	_respond.add_theme_stylebox_override("panel", respond_style)
	_respond.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var respond_row := HBoxContainer.new()
	respond_row.add_theme_constant_override("separation", 6)
	respond_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_respond.add_child(respond_row)
	var bolt := TextureRect.new()
	bolt.texture = StackStyle.kind_icon("trigger", 32)
	bolt.modulate = GOLD.lightened(0.3)
	bolt.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bolt.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	bolt.custom_minimum_size = Vector2(15, 15)
	bolt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bolt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	respond_row.add_child(bolt)
	var respond_label := Hud._label(15, Color(1, 0.9, 0.6))
	respond_label.text = "Você pode responder"
	respond_row.add_child(respond_label)
	column.add_child(_respond)
	_owner = Hud._label(15, GOLD)
	column.add_child(_owner)
	_effect = _wrapping(16, Color(1, 1, 1, 0.92))
	column.add_child(_effect)
	_cast = _wrapping(14, Color(0.78, 0.84, 1.0, 0.9))
	column.add_child(_cast)
	_targets = _wrapping(15, Color(1.0, 0.82, 0.55))
	column.add_child(_targets)
	_choose = Hud._button("Escolher como alvo", true)
	_choose.custom_minimum_size = Vector2(0, 40)
	_choose.add_theme_font_size_override("font_size", 16)
	_choose.pressed.connect(func() -> void: _send(_top_id))
	column.add_child(_choose)
	_rows_title = Hud._label(13, Color(1, 1, 1, 0.5))
	_rows_title.text = "Depois, nesta ordem"
	column.add_child(_rows_title)
	_rows = StackRows.new()
	_rows.catalog = catalog
	_rows.translate = _translate
	_rows.pt_text = func(source: Dictionary) -> String: return _pt_text(source)
	_rows.picked.connect(_send)
	_rows.opened.connect(func(id: int) -> void: open_gallery(id))
	_rows.hovered.connect(func(item: Dictionary) -> void: _focus.focus(item))
	_rows.preview.connect(func(tex: Texture2D) -> void: preview.emit(tex))
	column.add_child(_rows)


## Mostra a pilha do estado (some com a pilha vazia ou no fim do jogo).
func apply_state(state: Dictionary) -> void:
	_state = state
	var crowded: bool = (state.get("players", []) as Array).size() > 3 if state.get("players") is Array else false
	if crowded != _crowded:
		_crowded = crowded
		layout_changed.emit()
	_refresh()
	if is_instance_valid(gallery):
		gallery.apply_state(state)


## Abre a pilha em tela cheia (`focus_id`: o item a deixar à vista).
func open_gallery(focus_id: int = -1) -> void:
	if is_instance_valid(gallery) and _shown:
		_focus.focus({})
		gallery.open(_state, focus_id)


## Clique numa carta 3D da mesa: a carta da pilha que não é uma escolha agora abre a galeria (devolve true); a escolhível
## segue para a TableInteraction, que manda o {type:"stack"}.
func handle_card_click(node: CardNode) -> bool:
	if not _shown or node == null or not node.data.has("stackId"):
		return false
	var id: int = int(node.data["stackId"])
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	if (input.get("selectableStacks", []) as Array).any(func(value: Variant) -> bool: return int(value) == id):
		return false
	open_gallery(id)
	return true


## Onde fica na tela a camada `depth` da pilha (0 é o topo): o retângulo da carta. Não depende do estado: a mesa pode
## perguntar antes do painel receber o estado novo.
func layer_rect(depth: int) -> Rect2:
	var view: Vector2 = get_viewport_rect().size
	var left: float = view.x - MARGIN_RIGHT - WIDTH
	if collapsed:
		var small := Vector2(COLLAPSED_H * CardNode.SIZE.x / CardNode.SIZE.y, COLLAPSED_H)
		var d: int = mini(depth, 2)
		return Rect2(Vector2(view.x - MARGIN_RIGHT - small.x - 14.0 + d * -6.0, _top() + HEADER_H + 14.0 + d * -6.0), small)
	var size := Vector2(CARD_H * CardNode.SIZE.x / CardNode.SIZE.y, CARD_H)
	var base := Vector2(left + (WIDTH - size.x) / 2.0 - PEEK.x * MAX_PEEK / 2.0, _top() + HEADER_H + 22.0 - PEEK.y * MAX_PEEK)
	return Rect2(base + PEEK * mini(depth, MAX_PEEK), size)


func _top() -> float:
	return TOP_CROWDED if _crowded else TOP


func _refresh() -> void:
	var stack: Array = _state.get("stack", []) if _state.get("stack") is Array else []
	var show: bool = not stack.is_empty() and not bool(_state.get("gameOver", false))
	var ids: Array = stack.map(func(item: Variant) -> int: return int((item as Dictionary).get("id", -1)))
	_resolved_bursts(stack, ids)
	if not show:
		_hide_panel()
		_top_id = -1
		_ids = []
		_focus.focus({})
		return
	var was_shown: bool = _shown
	_show_panel()
	if not _focus.current().is_empty() and not ids.has(int(_focus.current().get("id", -1))):
		_focus.focus({})
	var top: Dictionary = stack[0]
	var source: Dictionary = top.get("source", {}) if top.get("source") is Dictionary else {}
	var pt: String = _pt_text(source)
	var color: Color = StackStyle.item_color(top)
	var top_name: String = _translate.call(Txt.of(source.get("name"))) if source.has("name") else "Efeito"
	_header.paint(stack.size(), top_name, color, StackText.kind_of(top) == "trigger", collapsed, was_shown)

	StackStyle.paint_kind_badge(_badge, top)
	_badge.visible = _badge.visible and not collapsed

	var waiting: Dictionary = StackText.resolving_choice(_state)
	_status_label.text = StackText.top_label(_state)
	_status.visible = not collapsed
	var status_style: StyleBoxFlat = _status.get_theme_stylebox("panel")
	status_style.border_color = Color(1.0, 0.55, 0.3) if not waiting.is_empty() else GOLD
	status_style.bg_color = Color(0.3, 0.14, 0.04, 0.96) if not waiting.is_empty() and bool(waiting["mine"]) else Color(0.05, 0.06, 0.1, 0.95)
	_status_label.add_theme_color_override("font_color", Color(1.0, 0.75, 0.5) if not waiting.is_empty() else GOLD)

	_effect_face.visible = source.is_empty() and not collapsed
	_effect_face_label.text = "Efeito na pilha\n\n" + StackText.effect_text(top, "")
	StackStyle.fill_strip(_strip_box, top, pt)
	_layer_chips.fill(stack, MAX_PEEK)
	_layer_chips.visible = not collapsed
	_strip.visible = _strip_box.get_child_count() > 0 and not collapsed

	var respond: bool = StackStyle.can_respond(_state) and waiting.is_empty()
	_respond.visible = respond
	var owner: String = StackText.player_name(_state, int(top.get("controller", -1)), "")
	_owner.text = StackText.owner_line(top, int(_state.get("you", 0)), owner)
	var loyalty_line: String = StackText.loyalty_line(top)
	_effect_full = StackText.effect_text(top, pt) if _strip_box.get_child_count() == 0 else (loyalty_line if loyalty_line != "" else "")
	_effect.text = _effect_full
	_effect.visible = _effect_full != ""
	_cast.text = StackText.cast_line(top.get("cast"))
	_targets.text = StackText.targets_text(_state, top.get("targets"), _translate)
	_targets.visible = _targets.text != ""
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	var selectable: Array = input.get("selectableStacks", []) if input.get("selectableStacks") is Array else []
	_choose.visible = selectable.any(func(id: Variant) -> bool: return int(id) == int(top.get("id", -1)))
	_info.visible = not collapsed
	_info_frame.visible = not collapsed
	_header_frame.tint(color)
	_info_frame.tint(color)
	_header_frame.set_glow(1.0 if respond else 0.0)
	_info_frame.set_glow(0.7 if respond else 0.0)
	_fit()

	var id: int = int(top.get("id", -1))
	if id != _top_id:
		_top_id = id
		# A carta voa até o vão; o texto chega logo depois dela, e o clarão acompanha a onda de chegada da carta 3D.
		for node: Control in [_info, _info_frame, _badge, _status, _strip, _layer_chips]:
			node.modulate.a = 0.0
			var tween := node.create_tween()
			tween.tween_interval(0.28)
			tween.tween_property(node, "modulate:a", 1.0, 0.22)
		var arrive := create_tween()
		arrive.tween_interval(StackPresence.ARRIVAL_DELAY)
		arrive.tween_callback(func() -> void:
			if collapsed:
				return
			_land_flash(color, false)
			_header_frame.flash(0.9)
			StackStyle.sparks(self, layer_rect(0), color))
	_ids = ids
	_place.call_deferred()


## Os itens que saíram da pilha neste estado (e não foram anulados: esses saem queimando pelo diretor) dão um clarão que
## se fecha no vão e faíscas subindo, junto com a onda de resolver da carta 3D.
func _resolved_bursts(stack: Array, ids: Array) -> void:
	if not _shown or collapsed or _ids.is_empty():
		return
	var countered: Dictionary = StackPresence._countered_ids(_state)
	var old_top: int = int(_ids[0])
	if ids.has(old_top) or countered.has(old_top):
		return
	var color: Color = _frame_color()
	_land_flash(color, true)
	StackStyle.sparks(self, layer_rect(0), color, true)
	if not stack.is_empty():
		_header_frame.flash(0.5)


func _frame_color() -> Color:
	return _header_frame.color_value() if _header_frame else GOLD


func _show_panel() -> void:
	if _hide_tween and _hide_tween.is_valid():
		_hide_tween.kill()
	modulate.a = 1.0
	visible = true
	_shown = true


## A pilha esvaziou: o painel some aos poucos (o clarão de resolver ainda aparece).
func _hide_panel() -> void:
	if not _shown:
		visible = false
		return
	_shown = false
	if not is_inside_tree():
		visible = false
		return
	if _hide_tween and _hide_tween.is_valid():
		_hide_tween.kill()
	_hide_tween = create_tween()
	_hide_tween.tween_property(self, "modulate:a", 0.0, 0.4).set_delay(0.15)
	_hide_tween.tween_callback(func() -> void:
		if not _shown:
			visible = false)


## Quantas linhas da lista cabem sem o texto passar por cima da caixa de ação; com pouco espaço, o efeito encurta.
func _fit() -> void:
	if collapsed:
		return
	var avoid: Rect2 = avoid_rect.call()
	_last_avoid = avoid
	var view: Vector2 = get_viewport_rect().size
	var left: float = view.x - MARGIN_RIGHT - WIDTH
	var limit: float = view.y - HudStyle.MARGIN
	if avoid.has_area() and avoid.end.x > left and avoid.position.x < left + WIDTH:
		limit = avoid.position.y - ACTION_GAP
	var card: Rect2 = layer_rect(0)
	var top_y: float = card.end.y + _status.get_combined_minimum_size().y / 2.0 + 10.0
	var room: float = limit - top_y
	var below: int = (_state.get("stack", []) as Array).size() - 1
	# Com pouco espaço, sai primeiro a linha da forma de conjurar (o selo já diz), depois o efeito encurta: a lista
	# fica com pelo menos uma linha quando há itens debaixo do topo.
	var fits: int = 0
	for step: int in 3:
		_cast.visible = _cast.text != "" and step == 0
		_effect.text = clip_lines(_effect_full, _effect, 5 if step < 2 else 2)
		fits = _rows_that_fit(room, below)
		if fits >= mini(1, below):
			break
	_info.tooltip_text = _effect_full if _effect.text != _effect_full else ""
	_rows.show_items(_state, fits)
	_rows_title.visible = _rows.row_count() > 0
	_rows.visible = below > 0


## O texto cortado em `max_lines` linhas na largura do rótulo, com "…" no fim (o max_lines_visible do Label só esconde as
## linhas, sem diminuir a altura que ele ocupa).
static func clip_lines(text: String, label: Label, max_lines: int) -> String:
	var paragraph := TextParagraph.new()
	paragraph.add_string(text, label.get_theme_font("font"), label.get_theme_font_size("font_size"))
	paragraph.width = label.custom_minimum_size.x
	paragraph.break_flags = TextServer.BREAK_MANDATORY | TextServer.BREAK_WORD_BOUND | TextServer.BREAK_ADAPTIVE
	if paragraph.get_line_count() <= max_lines:
		return text
	var cut: String = text.substr(0, paragraph.get_line_range(max_lines - 1).y).strip_edges()
	var space: int = cut.rfind(" ")
	if space > cut.length() - 12 and space > 0:
		cut = cut.substr(0, space)
	return cut.rstrip(" ,.;:") + "…"


## Quantas linhas da lista cabem em `room` pixels, com o resto do texto como está agora.
func _rows_that_fit(room: float, below: int) -> int:
	var title_h: float = _rows_title.get_combined_minimum_size().y + 6.0
	var fixed: float = _info.get_combined_minimum_size().y - _rows.custom_minimum_size.y - (title_h if _rows_title.visible else 0.0)
	var per_row: float = StackRows.ROW_H + StackRows.GAP
	for n: int in range(mini(below, MAX_ROWS), 0, -1):
		var more: float = StackRows.MORE_H + StackRows.GAP if below > n else 0.0
		if fixed + title_h + n * per_row - StackRows.GAP + more <= room:
			return n
	return 0


func _process(delta: float) -> void:
	if not _shown:
		return
	_time += delta
	# "Resolve primeiro" respira devagar; esperando uma escolha, mais forte.
	var waiting: bool = _status_label.text != "Resolve primeiro"
	var wave: float = 0.5 + 0.5 * sin(_time * (4.0 if waiting else 2.4))
	var status_style: StyleBoxFlat = _status.get_theme_stylebox("panel")
	status_style.shadow_color = Color(status_style.border_color, 0.2 + 0.35 * wave)
	status_style.shadow_size = int(6 + 6 * wave)
	_status.pivot_offset = _status.size / 2.0
	_status.scale = Vector2.ONE * (1.0 + 0.025 * wave)
	if _respond.visible:
		_respond.modulate = Color(1, 1, 1, 0.82 + 0.18 * wave)
	var avoid: Rect2 = avoid_rect.call()
	if not avoid.is_equal_approx(_last_avoid) and not collapsed:
		_fit()
		_place()
	# A lista anima a altura: o painel do texto acompanha.
	elif not collapsed and absf(_info.get_combined_minimum_size().y - _info.size.y) > 0.5:
		_place()


## O aro em volta do vão: na chegada abre e some; ao resolver, acende forte e se fecha sobre a carta.
func _land_flash(color: Color, closing: bool) -> void:
	var card: Rect2 = layer_rect(0)
	var ring: StyleBoxFlat = _flash.get_theme_stylebox("panel")
	ring.border_color = color.lightened(0.1)
	ring.shadow_color = Color(color, 0.3)
	ring.shadow_size = 10
	_flash.position = card.position - Vector2(4, 4)
	_flash.size = card.size + Vector2(8, 8)
	_flash.pivot_offset = _flash.size / 2.0
	_flash.scale = Vector2(1.1, 1.1) if closing else Vector2.ONE
	_flash.modulate.a = 0.0
	var tween := _flash.create_tween()
	tween.tween_property(_flash, "modulate:a", 1.0, 0.06)
	var to: Vector2 = Vector2(0.86, 0.86) if closing else Vector2(1.12, 1.12)
	tween.tween_property(_flash, "scale", to, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN if closing else Tween.EASE_OUT)
	tween.parallel().tween_property(_flash, "modulate:a", 0.0, 0.45)


func _send(id: int) -> void:
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	action.emit({"type": "stack", "id": id, "gen": int(input.get("gen", 0))})


## Põe cada peça em volta do vão da carta do topo.
func _place() -> void:
	var view: Vector2 = get_viewport_rect().size
	var left: float = view.x - MARGIN_RIGHT - WIDTH
	var card: Rect2 = layer_rect(0)
	var header_w: float = COLLAPSED_W if collapsed else WIDTH
	_header.position = Vector2(view.x - MARGIN_RIGHT - header_w, _top())
	_header.size = Vector2(header_w, HEADER_H)
	_header_frame.wrap(Rect2(_header.position, _header.size), 22.0)
	if collapsed:
		return
	_layer_chips.place(layer_rect, MAX_PEEK, PEEK)
	_effect_face.position = card.position
	_effect_face.size = card.size
	_badge.reset_size()
	_badge.position = Vector2(card.get_center().x - _badge.size.x / 2.0, card.position.y - _badge.size.y / 2.0)
	_status.reset_size()
	_status.position = Vector2(card.get_center().x - _status.size.x / 2.0, card.end.y - _status.size.y / 2.0)
	_strip.size = Vector2(card.size.x + 24.0, 0)
	_strip.reset_size()
	_strip.size.x = card.size.x + 24.0
	_strip.position = Vector2(card.get_center().x - _strip.size.x / 2.0, card.end.y - _status.size.y / 2.0 - _strip.size.y - 4.0)
	_info.position = Vector2(left, card.end.y + _status.size.y / 2.0 + 10.0)
	_info.size = Vector2(WIDTH, 0)
	_info.reset_size()
	_info.size.x = WIDTH
	_info_frame.wrap(Rect2(_info.position, _info.size), 14.0, 0.0, 0.35)


## O cabeçalho e os números das camadas (para os testes).
func header() -> StackHeader:
	return _header


func layer_chips() -> StackLayerChips:
	return _layer_chips


## O retângulo do texto (para os testes conferirem que não cobre a caixa de ação).
func info_rect() -> Rect2:
	return Rect2(_info.position, Vector2(WIDTH, _info.get_combined_minimum_size().y)) if _info.visible else Rect2()


func _pt_text(source: Dictionary) -> String:
	if catalog == null or not source.has("name"):
		return ""
	return Txt.of(catalog.info(Txt.of(source["name"])).get("text"))


var _translate: Callable = func(name: String) -> String: return catalog.label(name) if catalog else name


static func _style(color: Color, radius: int, margin_x: int, border: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = margin_x
	style.content_margin_right = margin_x
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	style.set_border_width_all(border)
	style.border_color = Color(1, 1, 1, 0.14)
	return style


func _pill(color: Color, radius: int) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := _style(color, radius, 14, 1)
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 8
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return panel


static func _wrapping(size: int, color: Color) -> Label:
	var label := Hud._label(size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(WIDTH - 30.0, 0)
	return label
