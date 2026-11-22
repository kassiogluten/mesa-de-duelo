# Tela das perguntas do servidor (FQuestion) no estilo das escolhas da mesa do navegador: escolhe a tela pela finalidade
# (as especiais ficam em question_screens.gd) e traz as genéricas e as peças (carta, botões, contador) que todas usam.
class_name QuestionDialog
extends Control

## Resposta pronta para mandar: {type:"answer", id, ...}.
signal answered(message: Dictionary)

const CARD_SIZE := Vector2(200, 279)
const SMALL_CARD := Vector2(150, 209)

var catalog: CardCatalog
## A pergunta aberta ({} sem pergunta).
var question: Dictionary = {}
## Onde as telas põem as peças.
var column: VBoxContainer
var _panel: PanelContainer
var _restore: Button
## url da imagem → [TextureRect, Label] que esperam por ela
var _waiting: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	var backdrop := ColorRect.new()
	backdrop.name = "Backdrop"
	backdrop.color = Color(0.01, 0.015, 0.03, 0.72)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", Hud._panel_style(Color(0.04, 0.05, 0.09, 0.0), 18))
	_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	add_child(_panel)
	column = VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_panel.add_child(column)
	_restore = Hud._button("Voltar à escolha", true)
	_restore.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_restore.offset_top = -200
	_restore.offset_bottom = -148
	_restore.offset_left = -140
	_restore.offset_right = 140
	_restore.visible = false
	_restore.pressed.connect(func() -> void: _minimize(false))
	add_child(_restore)
	if catalog:
		catalog.texture_ready.connect(_on_texture)


## Mostra a pergunta (ou esconde, com {}); a mesma pergunta de novo não refaz a tela.
func show_question(next: Dictionary) -> void:
	if not next.is_empty() and not question.is_empty() and int(next.get("id", -1)) == int(question.get("id", -2)):
		return
	question = next
	visible = not next.is_empty()
	_minimize(false)
	rebuild()


## Monta a tela da pergunta aberta (as telas especiais chamam de novo quando mudam).
func rebuild() -> void:
	for child: Node in column.get_children():
		child.queue_free()
	_waiting.clear()
	if question.is_empty():
		return
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	var title := Hud._label(28, Hud.GOLD)
	title.text = ForgeRequest.pt_title(_title())
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.custom_minimum_size = Vector2(560, 0)
	head.add_child(title)
	var peek := Hud._button("Ver a mesa", false)
	peek.custom_minimum_size = Vector2(150, 40)
	peek.pressed.connect(func() -> void: _minimize(true))
	head.add_child(peek)
	column.add_child(head)
	if QuestionScreens.build(self):
		return
	match Txt.of(question.get("kind")):
		"order":
			QuestionScreens.order(self)
		"confirm":
			source_card()
			button_row([["Não", {"value": false}, false], ["Sim", {"value": true}, true]])
		"number":
			QuestionScreens.number(self)
		"amount":
			QuestionScreens.amounts(self, false)
		"text":
			_text()
		"reveal":
			_reveal()
		_:
			_choose()


func _title() -> String:
	match Txt.of(question.get("purpose")):
		"triggers":
			return "Ordene seus gatilhos"
		"modes":
			return "Escolha %s" % ("o modo" if int(question.get("max", 1)) <= 1 else "os modos") if Txt.of(question.get("title")) == "" else Txt.of(question["title"])
	return Txt.of(question.get("title")) if Txt.of(question.get("title")) != "" else "Escolha"


func options() -> Array:
	return question.get("options", []) if question.get("options") is Array else []


## A carta de uma opção, ou null.
func option_card(index: int) -> Variant:
	var raw: Variant = options()[index]
	return (raw as Dictionary).get("card") if raw is Dictionary and (raw as Dictionary).get("card") is Dictionary else null


## O texto de uma opção, com o nome da carta em português e sem os números de carta do Forge.
func option_label(index: int) -> String:
	var raw: Variant = options()[index]
	if raw is String:
		return ActionBox.without_card_ids(raw)
	var option: Dictionary = raw
	var text: String = Txt.of(option.get("label"))
	var card: Variant = option.get("card")
	if card is Dictionary and (card as Dictionary).has("name"):
		var name: String = Txt.of((card as Dictionary)["name"])
		text = text.replace(name, catalog.label(name)) if text != "" else catalog.label(name)
	if Txt.of(option.get("ability")) != "":
		text = Txt.of(option["ability"])
	return ActionBox.without_card_ids(text)


# — Telas genéricas —

## choose: cartas lado a lado quando todas as opções são cartas; senão, uma lista. Um toque responde quando é uma só.
func _choose() -> void:
	var all_cards: bool = not options().is_empty() and range(options().size()).all(func(i: int) -> bool: return option_card(i) != null)
	var revealed: Array = question.get("revealed", []) if question.get("revealed") is Array else []
	if not revealed.is_empty():
		var note := Hud._label(17, Color(1, 1, 1, 0.7))
		note.text = "%s As cartas apagadas não podem ser escolhidas." % Txt.of(question.get("revealedNote"))
		column.add_child(note)
	if all_cards or not revealed.is_empty():
		QuestionScreens.pick_cards(self, range(options().size()), revealed, func(picked: Array) -> void: send({"indices": picked}))
	else:
		QuestionScreens.pick_list(self, func(picked: Array) -> void: send({"indices": picked}))


func _reveal() -> void:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	for raw: Variant in question.get("revealed", []):
		row.add_child(card_tile(raw, catalog.label(Txt.of((raw as Dictionary).get("name"))), "", false))
	column.add_child(row)
	button_row([["Continuar", {"indices": []}, true]])


func _text() -> void:
	var field := LineEdit.new()
	field.text = Txt.of(question.get("initial"))
	field.custom_minimum_size = Vector2(420, 48)
	column.add_child(field)
	var ok := Hud._button("Confirmar", true)
	ok.pressed.connect(func() -> void: send({"text": field.text}))
	column.add_child(ok)


# — Peças —

## A carta que pergunta, grande, quando há uma.
func source_card() -> void:
	var card: Variant = question.get("card")
	if card is Dictionary and (card as Dictionary).has("name"):
		var holder := CenterContainer.new()
		holder.add_child(card_tile(card, "", "", false))
		column.add_child(holder)


## Uma fileira de botões: [[rótulo, resposta, principal]].
func button_row(list: Array, parent: Control = null) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	for entry: Array in list:
		var button := Hud._button(Txt.of(entry[0]), bool(entry[2]))
		button.custom_minimum_size = Vector2(200, 52)
		var payload: Dictionary = entry[1]
		button.pressed.connect(func() -> void: send(payload))
		row.add_child(button)
	(parent if parent else column).add_child(row)
	return row


## Um título pequeno no meio da tela.
func hint(text: String) -> Label:
	var label := Hud._label(17, Color(1, 1, 1, 0.72))
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(560, 0)
	column.add_child(label)
	return label


## Uma carta com a imagem (ou o nome enquanto a imagem não chega), a legenda e a marca de escolhida ("Mark").
func card_tile(card: Variant, text: String, caption: String, highlighted: bool, size: Vector2 = CARD_SIZE) -> Control:
	var tile := VBoxContainer.new()
	tile.mouse_filter = Control.MOUSE_FILTER_STOP
	tile.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	tile.add_theme_constant_override("separation", 6)
	var frame := Panel.new()
	frame.custom_minimum_size = size
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := Hud._panel_style(Color(0.12, 0.13, 0.18), 12)
	style.border_color = Hud.GOLD if highlighted else Color(1, 1, 1, 0.1)
	style.set_border_width_all(4 if highlighted else 1)
	frame.add_theme_stylebox_override("panel", style)
	tile.add_child(frame)
	var image := TextureRect.new()
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(image)
	var name_label := Hud._label(16, Color.WHITE)
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.add_child(name_label)
	if card is Dictionary:
		var face_down: bool = bool((card as Dictionary).get("faceDown", false)) or not (card as Dictionary).has("name")
		var url: String = "" if face_down else catalog.image_url_for(card)
		var tex: Texture2D = catalog.texture(url)
		image.texture = tex
		if face_down:
			name_label.text = "Virada para baixo"
		elif tex == null:
			name_label.text = catalog.label(Txt.of((card as Dictionary).get("name")))
			if url != "":
				if not _waiting.has(url):
					_waiting[url] = []
				(_waiting[url] as Array).append([image, name_label])
	var mark := Label.new()
	mark.name = "Mark"
	mark.text = "✓"
	mark.add_theme_font_size_override("font_size", 46)
	mark.add_theme_color_override("font_color", Color(0.4, 1.0, 0.5))
	mark.add_theme_color_override("font_outline_color", Color.BLACK)
	mark.add_theme_constant_override("outline_size", 10)
	mark.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	mark.visible = false
	frame.add_child(mark)
	if caption != "":
		var cap := Hud._label(16, Hud.GOLD if highlighted else Color(1, 1, 1, 0.75))
		cap.text = caption
		cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile.add_child(cap)
	if text != "":
		var body := Hud._label(14, Color(1, 1, 1, 0.8))
		body.text = text
		body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		body.custom_minimum_size = Vector2(size.x, 0)
		body.max_lines_visible = 4
		body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile.add_child(body)
	return tile


## Marca ou desmarca a carta (o ✓ por cima da imagem).
static func set_marked(tile: Control, on: bool) -> void:
	var mark: Control = tile.find_child("Mark", true, false)
	if mark:
		mark.visible = on


func _on_texture(url: String, tex: Texture2D) -> void:
	for pair: Variant in _waiting.get(url, []):
		if is_instance_valid((pair as Array)[0]):
			((pair as Array)[0] as TextureRect).texture = tex
			((pair as Array)[1] as Label).text = ""
	_waiting.erase(url)


static func clicked(event: InputEvent) -> bool:
	return event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT


## "Ver a mesa": esconde a escolha sem respondê-la, com um botão para voltar.
func _minimize(on: bool) -> void:
	_panel.visible = not on
	(get_node("Backdrop") as Control).visible = not on
	_restore.visible = on and not question.is_empty()


func send(payload: Dictionary) -> void:
	var message: Dictionary = {"type": "answer", "id": int(question["id"])}
	message.merge(payload)
	answered.emit(message)
