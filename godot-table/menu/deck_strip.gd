# A fileira de decks da tela inicial: um ladrilho por deck do formato (arte e nome), o escolhido em dourado, e no fim o
# "+ Meus decks"; rola para o lado quando não cabem todos.
class_name DeckStrip
extends ScrollContainer

## O jogador tocou num deck.
signal picked(index: int)
## O ladrilho "+ Meus decks".
signal more_pressed
## A parte à mostra mudou (rolou ou mudou de tamanho): hora de pedir as artes que apareceram.
signal view_changed

const GAP := 16
## Folga em volta dos ladrilhos, para o brilho do escolhido não ser cortado na borda da rolagem.
const PAD := 18

var selected: int = -1
var _row: HBoxContainer
var _tiles: Array[DeckTile] = []
## As bordas que apagam quando há mais decks para um lado (dica de que a fileira rola).
var _fade_left: TextureRect
var _fade_right: TextureRect


func _ready() -> void:
	vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	follow_focus = false
	mouse_filter = Control.MOUSE_FILTER_PASS
	var margin := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, PAD)
	add_child(margin)
	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", GAP)
	margin.add_child(_row)
	_fade_left = _edge(Vector2(1, 0), Vector2(0, 0))
	_fade_right = _edge(Vector2(0, 0), Vector2(1, 0))
	get_h_scroll_bar().value_changed.connect(func(_v: float) -> void:
		_update_edges()
		view_changed.emit())
	get_h_scroll_bar().changed.connect(_update_edges)
	sort_children.connect(func() -> void: _update_edges.call_deferred())
	resized.connect(func() -> void:
		_update_edges()
		view_changed.emit())


## Uma borda que apaga no fundo da tela (filho interno: a rolagem não a trata como conteúdo).
func _edge(from: Vector2, to: Vector2) -> TextureRect:
	var edge := TextureRect.new()
	edge.texture = HomeStyle.fade([[0.0, Color(HomeStyle.BG, 0.0)], [1.0, Color(HomeStyle.BG, 0.92)]], from, to)
	edge.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	edge.stretch_mode = TextureRect.STRETCH_SCALE
	edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	edge.visible = false
	add_child(edge, false, Node.INTERNAL_MODE_BACK)
	return edge


func _update_edges() -> void:
	var bar: HScrollBar = get_h_scroll_bar()
	var overflow: bool = bar.max_value - bar.page > 1.0
	_fade_left.visible = overflow and bar.value > 2.0
	_fade_right.visible = overflow and bar.value < bar.max_value - bar.page - 2.0
	var width: float = minf(110.0, size.x * 0.2)
	_fade_left.position = Vector2.ZERO
	_fade_left.size = Vector2(width, size.y)
	_fade_right.position = Vector2(size.x - width, 0)
	_fade_right.size = Vector2(width, size.y)


## Refaz a fileira: `decks` é [{name, colors}] na ordem da lista; `chosen` o índice escolhido.
func set_decks(decks: Array, chosen: int) -> void:
	for child: Node in _row.get_children():
		_row.remove_child(child)
		child.queue_free()
	_tiles.clear()
	for i: int in decks.size():
		var deck: Dictionary = decks[i]
		var colors: PackedStringArray = deck.get("colors", PackedStringArray())
		var tile := DeckTile.new(Txt.of(deck.get("name")), colors)
		tile.index = i
		tile.name = "Deck%d" % i
		tile.pressed.connect(func() -> void: picked.emit(tile.index))
		_row.add_child(tile)
		_tiles.append(tile)
	var more := DeckTile.new("+ Meus decks", PackedStringArray(), true)
	more.name = "MoreDecks"
	more.tooltip_text = "Abrir Meus decks: importar, renomear e escolher."
	more.pressed.connect(func() -> void: more_pressed.emit())
	_row.add_child(more)
	selected = -1
	select(chosen)
	view_changed.emit()


func tile_count() -> int:
	return _tiles.size()


func tile(index: int) -> DeckTile:
	return _tiles[index] if index >= 0 and index < _tiles.size() else null


## Marca o deck escolhido e rola até ele.
func select(index: int) -> void:
	selected = index if index >= 0 and index < _tiles.size() else -1
	for t: DeckTile in _tiles:
		t.set_selected(t.index == selected)
	if selected >= 0:
		_reveal.call_deferred(selected)


## Os índices dos ladrilhos à mostra (e um de folga de cada lado), para baixar só essas artes.
func visible_indices() -> Array[int]:
	var out: Array[int] = []
	var left: float = float(scroll_horizontal) - DeckTile.SIZE.x - GAP
	var right: float = float(scroll_horizontal) + maxf(size.x, 1.0) + DeckTile.SIZE.x + GAP
	for t: DeckTile in _tiles:
		var x: float = PAD + t.index * (DeckTile.SIZE.x + GAP)
		if x + DeckTile.SIZE.x >= left and x <= right:
			out.append(t.index)
	return out


func _reveal(index: int) -> void:
	var target: DeckTile = tile(index)
	if target == null or not is_inside_tree():
		return
	var x: float = PAD + index * (DeckTile.SIZE.x + GAP)
	var view: float = size.x
	var to: float = float(scroll_horizontal)
	if x - PAD < to:
		to = x - PAD
	elif x + DeckTile.SIZE.x + PAD > to + view:
		to = x + DeckTile.SIZE.x + PAD - view
	if absf(to - float(scroll_horizontal)) < 1.0:
		return
	create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT).tween_property(self, "scroll_horizontal", int(to), 0.25)
