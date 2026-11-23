# As cartas ligadas no inspetor (exiladas pela permanente, as de baixo da mutação, a carta a que ela está anexada): cada
# uma com a miniatura, o que a liga, o nome e o texto; clicar na miniatura abre a carta no inspetor.
class_name InspectorLinks
extends VBoxContainer

## Pediu para abrir a carta ligada (a carta do estado, ou a parte da mutação com nome e imagem).
signal opened(card: Dictionary)

const THUMB_WIDTH := 76.0

## O catálogo de quem desenha (lido na hora: o inspetor pode recebê-lo depois de montar).
var catalog_ref: Callable
## url → as miniaturas que esperam aquela imagem.
var _waiting: Dictionary = {}


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false


## Mostra as ligadas ([{card, caption, hidden}] de CardLinks.of); `lookup` dá nome e texto em português.
func show_links(links: Array, lookup: Callable) -> void:
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	_waiting.clear()
	visible = not links.is_empty()
	if links.is_empty():
		return
	add_child(InspectorKit.rule())
	var title := InspectorKit.label(15, InspectorKit.MUTED)
	title.text = "Cartas ligadas" if links.size() > 1 else "Carta ligada"
	add_child(title)
	for link: Dictionary in links:
		add_child(_row(link, lookup))


func has_links() -> bool:
	return visible and get_child_count() > 0


func on_texture_ready(url: String, tex: Texture2D) -> void:
	for thumb: Variant in _waiting.get(url, []):
		if is_instance_valid(thumb):
			(thumb as TextureRect).texture = tex


func _row(link: Dictionary, lookup: Callable) -> HBoxContainer:
	var card: Dictionary = link["card"]
	var hidden: bool = bool(link["hidden"])
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	var name: String = Txt.of(card.get("name"))
	var info: Dictionary = lookup.call(name) if lookup.is_valid() and name != "" else {}
	row.add_child(_thumb(card, hidden, Txt.of(info.get("label", name))))
	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_theme_constant_override("separation", 3)
	row.add_child(text)
	var caption := InspectorKit.label(13, InspectorKit.GOLD)
	caption.text = Txt.of(link["caption"])
	text.add_child(caption)
	var title := InspectorKit.label(17, InspectorKit.INK)
	title.add_theme_font_override("font", InspectorKit.bold())
	title.text = "Carta virada para baixo" if hidden else (Txt.of(info.get("label")) if Txt.of(info.get("label")) != "" else name)
	text.add_child(title)
	var rules: String = "Só quem a controla sabe qual carta é." if hidden else CardDetails.without_card_ids(Txt.of(info.get("text", card.get("text", ""))))
	if rules == "" and not hidden:
		rules = "Carregando informações da carta…" if info.is_empty() else ""
	if rules != "":
		text.add_child(InspectorKit.rules(rules, 15, InspectorKit.MUTED))
	return row


## A miniatura: um botão com a imagem da carta (a virada para baixo é só o verso, sem clique).
func _thumb(card: Dictionary, hidden: bool, label: String) -> Control:
	var size := Vector2(THUMB_WIDTH, round(THUMB_WIDTH * InspectorKit.CARD_ASPECT))
	if hidden:
		var back := Panel.new()
		var style := InspectorKit.box(Color("#1c2a48"), 6, 1)
		style.shadow_size = 0
		back.add_theme_stylebox_override("panel", style)
		back.custom_minimum_size = size
		back.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		back.mouse_filter = Control.MOUSE_FILTER_IGNORE
		return back
	var button := Button.new()
	button.custom_minimum_size = size
	button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.tooltip_text = "Ver " + label if label != "" else ""
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0, 0, 0, 0)
		style.set_corner_radius_all(6)
		style.set_border_width_all(2 if state_name in ["hover", "pressed"] else 1)
		style.border_color = InspectorKit.GOLD if state_name in ["hover", "pressed"] else Color(1, 1, 1, 0.1)
		style.expand_margin_left = 2
		style.expand_margin_right = 2
		style.expand_margin_top = 2
		style.expand_margin_bottom = 2
		style.draw_center = false
		button.add_theme_stylebox_override(state_name, style)
	var image := InspectorKit.card_image(THUMB_WIDTH)
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image.show_behind_parent = true
	button.add_child(image)
	var catalog: CardCatalog = catalog_ref.call() if catalog_ref.is_valid() else null
	if catalog:
		var url: String = catalog.image_url_for(card)
		image.texture = catalog.texture(url)
		if image.texture == null and url != "":
			(_waiting.get_or_add(url, []) as Array).append(image)
	var me: WeakRef = weakref(self)
	button.pressed.connect(func() -> void:
		var links: InspectorLinks = me.get_ref()
		if links:
			links.opened.emit(card))
	return button
