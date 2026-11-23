# A pilha em tela cheia (como a galeria da mesa do navegador, src/ui/stackView.ts): todos os itens grandes, lado a lado na
# ordem em que resolvem, com o tipo, quem controla, o efeito em português, a forma de conjurar e os alvos; a mesa fica
# desfocada atrás. Esc ou o fundo fecham; ← e → percorrem; o item que dá para escolher tem "Selecionar como alvo".
class_name StackGallery
extends Control

## Mensagem pronta para o servidor ({type:"stack", id, gen}).
signal action(message: Dictionary)
signal closed

const MIN_CARD_W := 170.0
const MAX_CARD_W := 250.0
const PLATE_PAD := 14.0
const CHEVRON_W := 26.0
const GAP := 10.0

var catalog: CardCatalog
## O nome em português de uma carta (CardCatalog.label).
var translate: Callable = func(name: String) -> String: return name
## O texto em português da carta de origem de um item.
var pt_text: Callable = func(_source: Dictionary) -> String: return ""

var _state: Dictionary = {}
var _open: bool = false
var _backdrop: ModalBackdrop
var _content: VBoxContainer
var _title: RichTextLabel
var _scroll: ScrollContainer
var _track: HBoxContainer
var _cards: Dictionary = {}
var _tween: Tween


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_backdrop = ModalBackdrop.new()
	_backdrop.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			close())
	add_child(_backdrop)
	_content = VBoxContainer.new()
	_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_content.offset_left = 60
	_content.offset_right = -60
	_content.offset_top = 46
	_content.offset_bottom = -30
	_content.add_theme_constant_override("separation", 14)
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_content)
	var heading := HBoxContainer.new()
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(heading)
	var left := Control.new()
	left.custom_minimum_size = Vector2(140, 0)
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	heading.add_child(left)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	heading.add_child(titles)
	var title_box := ModalStyle.title("Pilha", 30)
	_title = title_box.get_node("Title")
	titles.add_child(title_box)
	titles.add_child(ModalStyle.wrap(15, ModalStyle.MUTED, "O primeiro à esquerda resolve primeiro."))
	var close_button := ModalStyle.button("Fechar", ModalStyle.Kind.GHOST, 140, 42)
	close_button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	close_button.pressed.connect(close)
	heading.add_child(close_button)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	_content.add_child(_scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scroll.add_child(center)
	_track = HBoxContainer.new()
	_track.add_theme_constant_override("separation", 0)
	_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_track)
	var help := ModalStyle.wrap(14, ModalStyle.FAINT, "Use as setas do teclado para percorrer a pilha. Esc fecha.")
	_content.add_child(help)
	if catalog:
		catalog.texture_ready.connect(_on_texture_ready)
	# O CenterContainer precisa da largura da área rolável para centrar quando cabe tudo.
	_scroll.resized.connect(func() -> void: center.custom_minimum_size = Vector2(_scroll.size.x, _scroll.size.y - 12.0))


## Abre a galeria com o estado (`focus_id`: o item a deixar à vista).
func open(state: Dictionary, focus_id: int = -1) -> void:
	_state = state
	if not _can_show(state):
		return
	var was_open: bool = _open
	_open = true
	visible = true
	if get_parent():
		move_to_front()
	_build()
	if not was_open:
		_backdrop.fade(1.0, 0.24)
		_content.modulate.a = 0.0
		if _tween and _tween.is_valid():
			_tween.kill()
		_tween = create_tween()
		_tween.tween_property(_content, "modulate:a", 1.0, ModalStyle.ENTER_TIME)
		_stagger()
	if focus_id >= 0:
		_show_item.call_deferred(focus_id)


func close() -> void:
	if not _open:
		return
	_open = false
	_backdrop.fade(0.0, ModalStyle.EXIT_TIME + 0.04)
	if _tween and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(_content, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	_tween.tween_callback(func() -> void:
		if not _open:
			visible = false)
	closed.emit()


func is_open() -> bool:
	return _open


## Estado novo com a galeria aberta: refaz os itens, ou fecha (pilha vazia, pergunta aberta, fim do jogo).
func apply_state(state: Dictionary) -> void:
	_state = state
	if not _open:
		return
	if not _can_show(state):
		close()
		return
	_build()


## Os textos à mostra na galeria (para os testes): uma linha por texto, na ordem.
func texts() -> PackedStringArray:
	var out: PackedStringArray = []
	for node: Node in _track.find_children("*", "Label", true, false):
		out.append((node as Label).text)
	for node: Node in _track.find_children("*", "RichTextLabel", true, false):
		out.append((node as RichTextLabel).get_parsed_text())
	for node: Node in _track.find_children("*", "Button", true, false):
		out.append((node as Button).text)
	return out


static func _can_show(state: Dictionary) -> bool:
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	return not stack.is_empty() and not bool(state.get("gameOver", false)) and not state.get("question") is Dictionary


func _input(event: InputEvent) -> void:
	if not _open or not (event is InputEventKey) or not (event as InputEventKey).pressed:
		return
	match (event as InputEventKey).keycode:
		KEY_ESCAPE:
			close()
		KEY_LEFT:
			_scroll.scroll_horizontal -= int(MAX_CARD_W)
		KEY_RIGHT:
			_scroll.scroll_horizontal += int(MAX_CARD_W)
	# Com a galeria aberta, as teclas não mexem na jogada (o Espaço não passa a prioridade por trás dela).
	get_viewport().set_input_as_handled()


func _build() -> void:
	var stack: Array = _state.get("stack", [])
	ModalStyle.set_rich(_title, "Pilha · %s" % StackHeader.count_label(stack.size()), 30, true)
	var input: Dictionary = _state.get("input", {}) if _state.get("input") is Dictionary else {}
	var selectable: Array = input.get("selectableStacks", []) if input.get("selectableStacks") is Array else []
	var groups: Array = StackText.group(stack, selectable)
	var view: Vector2 = get_viewport_rect().size
	var room: float = view.x - 120.0 - groups.size() * (PLATE_PAD * 2.0 + CHEVRON_W + GAP)
	var width: float = clampf(room / maxf(1.0, groups.size()), MIN_CARD_W, MAX_CARD_W)
	# A altura da tela também limita: a carta, o texto e o título precisam caber.
	width = minf(width, (view.y - 470.0) / ChoiceCard.ASPECT)
	width = maxf(width, MIN_CARD_W * 0.8)
	for child: Node in _track.get_children():
		_track.remove_child(child)
		child.queue_free()
	_cards.clear()
	for i: int in groups.size():
		if i > 0:
			_track.add_child(_chevron(width))
		_track.add_child(_column(groups[i], selectable, width, int(input.get("gen", 0))))


## Um item: a placa com o número na ordem, a carta grande, o selo do tipo, quem controla, o efeito, a forma de conjurar e os alvos.
func _column(g: Dictionary, selectable: Array, width: float, gen: int) -> Control:
	var item: Dictionary = g["item"]
	var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
	var at: int = int(g["at"])
	var count: int = int(g["count"])
	var id: int = int(item.get("id", -1))
	var pick: bool = selectable.any(func(value: Variant) -> bool: return int(value) == id)
	var you: int = int(_state.get("you", 0))
	var mine: bool = int(item.get("controller", -1)) == you
	var kind_color: Color = StackStyle.kind_color(item)
	var pt: String = Txt.of(pt_text.call(source))
	var holder := Control.new()
	holder.name = "Item%d" % id
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var plate := PanelContainer.new()
	plate.name = "Plate"
	var border: Color = kind_color if at == 0 else Color(StackStyle.MINE if mine else StackStyle.THEIRS, 0.4)
	var style := ModalStyle.box(Color(0.05, 0.08, 0.14, 0.88), 16, Color(border, 0.9 if at == 0 else 0.45), 2 if at == 0 else 1)
	for side: String in ["left", "right", "top", "bottom"]:
		style.set("content_margin_" + side, PLATE_PAD)
	if at == 0:
		style.shadow_color = Color(kind_color, 0.4)
		style.shadow_size = 22
	plate.add_theme_stylebox_override("panel", style)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(plate)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(column)
	var order: String = "%d iguais, cada um resolve separado" % count if count > 1 else (StackText.top_label(_state) if at == 0 else "%dº na resolução" % (at + 1))
	column.add_child(ModalStyle.wrap(15, ModalStyle.GOLD_LIGHT if at == 0 else ModalStyle.MUTED, order, width))
	var card := ChoiceCard.new().setup(source if not source.is_empty() else null, width)
	card.interactive = pick
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if pick else Control.CURSOR_ARROW
	card.set_badge("%d–%d" % [at + 1, at + count] if count > 1 else str(at + 1), at == 0)
	card.pressed.connect(func() -> void: _choose(id, gen))
	column.add_child(card)
	_cards[id] = card
	if source.is_empty():
		card.set_texture(null, "Efeito na pilha\n\n" + StackText.effect_text(item, ""))
	else:
		var url: String = catalog.image_url_for(source) if catalog else ""
		card.set_meta("url", url)
		card.set_texture(catalog.texture(url) if catalog else null, Txt.of(translate.call(Txt.of(source.get("name")))))
	var badge := StackStyle.kind_badge(14)
	StackStyle.paint_kind_badge(badge, item)
	badge.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(badge)
	var owner: String = StackText.owner_line(item, you, StackText.player_name(_state, int(item.get("controller", -1)), ""))
	column.add_child(ModalStyle.wrap(15, (StackStyle.MINE if mine else StackStyle.THEIRS).lightened(0.3), owner, width))
	var loyalty: String = StackText.loyalty_line(item)
	if loyalty != "":
		column.add_child(ModalStyle.wrap(14, Color(0.78, 0.84, 1.0, 0.9), loyalty, width))
	var effect := ModalStyle.rich(StackText.effect_text(item, pt), 15, Color(1, 1, 1, 0.9), true, width)
	column.add_child(effect)
	var cast: String = StackText.cast_line(item.get("cast"))
	if cast != "":
		column.add_child(ModalStyle.wrap(14, Color(0.78, 0.84, 1.0, 0.9), cast, width))
	var targets: String = StackText.targets_text(_state, item.get("targets"), translate)
	if targets != "":
		column.add_child(ModalStyle.wrap(15, Color(1.0, 0.82, 0.55), targets, width))
	if pick:
		var choose := ModalStyle.button("Selecionar como alvo", ModalStyle.Kind.PRIMARY, width, 44)
		choose.pressed.connect(func() -> void: _choose(id, gen))
		column.add_child(choose)
	holder.custom_minimum_size = plate.get_combined_minimum_size() + Vector2(GAP, 0)
	return holder


func _chevron(width: float) -> Control:
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(CHEVRON_W, width * ChoiceCard.ASPECT + 60.0)
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mark := ModalStyle.label(34, Color(StackStyle.GOLD, 0.45), "›")
	mark.position = Vector2(2, width * ChoiceCard.ASPECT / 2.0 + 30.0)
	holder.add_child(mark)
	return holder


func _choose(id: int, gen: int) -> void:
	action.emit({"type": "stack", "id": id, "gen": gen})
	close()


## Os itens entram um depois do outro, subindo um pouco.
func _stagger() -> void:
	var i: int = 0
	for holder: Node in _track.get_children():
		var plate: Control = (holder as Control).get_node_or_null("Plate")
		if plate == null:
			continue
		plate.position.y = 26.0
		plate.modulate.a = 0.0
		var tween := plate.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(plate, "position:y", 0.0, 0.32).set_delay(0.05 * i)
		tween.tween_property(plate, "modulate:a", 1.0, 0.24).set_delay(0.05 * i)
		i += 1


## Rola até o item `id` ficar à vista.
func _show_item(id: int) -> void:
	var card: ChoiceCard = _cards.get(id)
	if card != null and is_instance_valid(card):
		_scroll.ensure_control_visible(card)


func _on_texture_ready(url: String, tex: Texture2D) -> void:
	for card: ChoiceCard in _cards.values():
		if is_instance_valid(card) and card.has_meta("url") and Txt.of(card.get_meta("url")) == url:
			card.set_texture(tex)
