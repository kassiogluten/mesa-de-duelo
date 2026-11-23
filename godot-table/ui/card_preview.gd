# A prévia de carta que acompanha o mouse: a imagem grande e, embaixo, a força, os marcadores e os estados da permanente.
class_name CardPreview
extends PanelContainer

## A carta na prévia: largura em pixels da mesa (a altura segue a proporção da carta).
const WIDTH := 300.0
const GAP := 26.0
const MARGIN := 10.0
## Espera antes de mostrar a prévia (passar o mouse por cima de várias cartas não pisca uma por uma) e antes de escondê-la.
const SHOW_DELAY := 0.12
const HIDE_DELAY := 0.1

var catalog: CardCatalog
## Onde está o mouse (quem é dono da prévia atualiza, pelos eventos).
var mouse: Vector2 = Vector2(-1, -1)

var _image: TextureRect
var _notes: VBoxContainer
var _url: String = ""
var _pending_card: Dictionary = {}
var _pending_ctx: Dictionary = {}
var _pending_url: String = ""
var _show_left: float = -1.0
var _hide_left: float = -1.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_stylebox_override("panel", InspectorKit.box(InspectorKit.BG, 14, 0))
	visible = false
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(column)
	_image = InspectorKit.card_image(WIDTH)
	column.add_child(_image)
	var notes := MarginContainer.new()
	notes.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side: String in ["left", "right", "top", "bottom"]:
		notes.add_theme_constant_override("margin_" + side, 12 if side != "top" else 8)
	column.add_child(notes)
	_notes = VBoxContainer.new()
	_notes.add_theme_constant_override("separation", 4)
	_notes.custom_minimum_size = Vector2(WIDTH - 24, 0)
	notes.add_child(_notes)


## Mostra a carta (o FCard do estado) ao lado do mouse, depois da espera; `url` é a imagem que a mesa já usa nela.
func show_card(card: Dictionary, ctx: Dictionary, url: String) -> void:
	_pending_card = card
	_pending_ctx = ctx
	_pending_url = url
	_hide_left = -1.0
	_show_left = 0.0 if visible else SHOW_DELAY


## Só a imagem (a pilha e outras listas que têm a textura e não o FCard).
func show_texture(tex: Texture2D) -> void:
	_pending_card = {}
	_show_left = -1.0
	_hide_left = -1.0
	_url = ""
	_image.texture = tex
	_clear_notes()
	_notes.visible = false
	visible = true
	_place()


func hide_card(immediate: bool = false) -> void:
	_show_left = -1.0
	if immediate:
		_hide_left = -1.0
		visible = false
	elif visible:
		_hide_left = HIDE_DELAY


## A prévia está à mostra (ou para aparecer).
func showing() -> bool:
	return visible or _show_left >= 0.0


func on_texture_ready(url: String, tex: Texture2D) -> void:
	if url == _url:
		_image.texture = tex


func _process(delta: float) -> void:
	if _show_left >= 0.0:
		_show_left -= delta
		if _show_left < 0.0:
			_fill()
	if _hide_left >= 0.0:
		_hide_left -= delta
		if _hide_left < 0.0:
			visible = false
	if visible:
		_place()


func _fill() -> void:
	var ctx: Dictionary = _pending_ctx.duplicate()
	ctx["lookup"] = CardFaces.lookup(catalog, _pending_ctx.get("lookup", Callable()))
	var details: Dictionary = CardDetails.build(_pending_card, ctx)
	_url = _pending_url
	# A dupla face transformada: a imagem da face à mostra (a mesa pode ter só a da frente).
	var sides: Dictionary = CardFaces.sides(_pending_card, catalog)
	if Txt.of(sides.get("kind")) == "dfc":
		_url = (sides["urls"] as PackedStringArray)[int(sides["shown"])]
	_image.texture = catalog.texture(_url) if catalog else null
	_clear_notes()
	var lines: PackedStringArray = []
	if Txt.of(details["type_change"]) != "":
		lines.append("Tipo mudado: %s." % details["type_change"])
	if Txt.of(details["base"]) != "" or int(details["damage"]) > 0:
		lines.append(_strength_text(details))
	if not (details["counters"] as PackedStringArray).is_empty():
		lines.append("Marcadores: " + ", ".join(details["counters"] as PackedStringArray))
	lines.append_array(details["notes"] as PackedStringArray)
	for line: String in lines:
		var text_label := InspectorKit.rich(15, InspectorKit.MUTED)
		# Largura fixa: com quebra de linha e sem largura, o texto pediria uma letra por linha e a prévia cresceria.
		text_label.custom_minimum_size = Vector2(WIDTH - 24, 0)
		ManaSymbols.append_rich(text_label, line, 15)
		_notes.add_child(text_label)
	_notes.visible = not lines.is_empty()
	visible = true
	reset_size()
	_place()


func _clear_notes() -> void:
	for child: Node in _notes.get_children():
		_notes.remove_child(child)
		child.queue_free()


## Ao lado do mouse: à direita se couber, senão à esquerda; centrada na altura dele, sem sair da tela.
func _place() -> void:
	var screen: Vector2 = get_viewport_rect().size
	reset_size()
	var box: Vector2 = size
	var x: float = mouse.x + GAP if mouse.x + GAP + box.x <= screen.x - MARGIN else maxf(MARGIN, mouse.x - GAP - box.x)
	var y: float = clampf(mouse.y - box.y / 2.0, MARGIN, maxf(MARGIN, screen.y - box.y - MARGIN))
	position = Vector2(x, y).round()


static func _strength_text(details: Dictionary) -> String:
	var text: String = "%s/%s" % [details["power"], details["toughness"]] if Txt.of(details["power"]) != "" else ""
	if Txt.of(details["base"]) != "":
		text += " (base %s)" % details["base"]
	if int(details["damage"]) > 0:
		text += (" · " if text != "" else "") + "%d de dano marcado" % int(details["damage"])
	return text
