# Ver uma carta de perto: a prévia que acompanha o mouse (a imagem grande e os estados embaixo) e o inspetor fixo
# (clique direito ou "I"), com a imagem e, ao lado, nome, custo, tipo, texto, força, palavras-chave, marcadores e notas.
class_name CardInspector
extends Control

## A carta na prévia: largura em pixels da mesa (a altura segue a proporção da carta).
const PREVIEW_WIDTH := 300.0
const PREVIEW_GAP := 26.0
const MARGIN := 10.0
## Espera antes de mostrar a prévia (passar o mouse por cima de várias cartas não pisca uma por uma) e antes de escondê-la.
const SHOW_DELAY := 0.12
const HIDE_DELAY := 0.1
const CARD_ASPECT := 88.0 / 63.0
const IMAGE_WIDTH := 360.0
const BG := Color("#101a2e")
const LINE := Color("#3a4768")
const INK := Color("#eef1f8")
const MUTED := Color(0.78, 0.82, 0.9, 0.72)
const GOLD := Color("#f0b84a")
const DAMAGE := Color("#ff7a6b")
const IMAGE_SHADER := preload("res://ui/card_image.gdshader")

var catalog: CardCatalog

var _preview: PanelContainer
var _preview_image: TextureRect
var _preview_notes: VBoxContainer
var _preview_url: String = ""
var _pending_card: Dictionary = {}
var _pending_ctx: Dictionary = {}
var _pending_url: String = ""
var _show_left: float = -1.0
var _hide_left: float = -1.0

var _modal: Control
var _panel: PanelContainer
var _image: TextureRect
var _image_url: String = ""
var _name: Label
var _cost: HBoxContainer
var _details: VBoxContainer
var _bold: FontVariation
## Onde está o mouse, pelos eventos (não pela posição do sistema: assim os prints e os testes conseguem movê-lo).
var _mouse: Vector2 = Vector2(-1, -1)


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bold = FontVariation.new()
	_bold.base_font = ThemeDB.fallback_font
	_bold.variation_embolden = 0.7
	_build_preview()
	_build_modal()


# — Prévia —

## Mostra a prévia da carta (o FCard do estado) ao lado do mouse; `url` é a imagem que a mesa já usa nela.
func show_preview(card: Dictionary, ctx: Dictionary, url: String) -> void:
	if is_open() or url == "" or card.is_empty():
		hide_preview()
		return
	_pending_card = card
	_pending_ctx = ctx
	_pending_url = url
	_hide_left = -1.0
	_show_left = 0.0 if _preview.visible else SHOW_DELAY


func hide_preview(immediate: bool = false) -> void:
	_show_left = -1.0
	if immediate:
		_hide_left = -1.0
		_preview.visible = false
	elif _preview.visible:
		_hide_left = HIDE_DELAY


## A prévia está à mostra (ou para aparecer).
func previewing() -> bool:
	return _preview.visible or _show_left >= 0.0


func _fill_preview() -> void:
	var details: Dictionary = CardDetails.build(_pending_card, _pending_ctx)
	_preview_url = _pending_url
	_preview_image.texture = catalog.texture(_pending_url) if catalog else null
	for child: Node in _preview_notes.get_children():
		_preview_notes.remove_child(child)
		child.queue_free()
	var lines: PackedStringArray = []
	if Txt.of(details["base"]) != "" or int(details["damage"]) > 0:
		lines.append(_strength_text(details))
	if not (details["counters"] as PackedStringArray).is_empty():
		lines.append("Marcadores: " + ", ".join(details["counters"] as PackedStringArray))
	lines.append_array(details["notes"] as PackedStringArray)
	for line: String in lines:
		var label := _rich(15, MUTED)
		# Largura fixa: com quebra de linha e sem largura, o texto pediria uma letra por linha e a prévia cresceria.
		label.custom_minimum_size = Vector2(PREVIEW_WIDTH - 24, 0)
		ManaSymbols.append_rich(label, line, 15)
		_preview_notes.add_child(label)
	_preview_notes.visible = not lines.is_empty()
	_preview.visible = true
	_preview.reset_size()
	_place_preview()


## Ao lado do mouse: à direita se couber, senão à esquerda; centrada na altura dele, sem sair da tela.
func _place_preview() -> void:
	var mouse: Vector2 = _mouse
	var screen: Vector2 = get_viewport_rect().size
	_preview.reset_size()
	var box: Vector2 = _preview.size
	var x: float = mouse.x + PREVIEW_GAP if mouse.x + PREVIEW_GAP + box.x <= screen.x - MARGIN else maxf(MARGIN, mouse.x - PREVIEW_GAP - box.x)
	var y: float = clampf(mouse.y - box.y / 2.0, MARGIN, maxf(MARGIN, screen.y - box.y - MARGIN))
	_preview.position = Vector2(x, y).round()


func _process(delta: float) -> void:
	if _show_left >= 0.0:
		_show_left -= delta
		if _show_left < 0.0:
			_fill_preview()
	if _hide_left >= 0.0:
		_hide_left -= delta
		if _hide_left < 0.0:
			_preview.visible = false
	if _preview.visible:
		_place_preview()
	if _modal.visible:
		var rect: Rect2 = _image.get_global_rect()
		var mouse: Vector2 = _mouse
		var light: Vector2 = ((mouse - rect.position) / rect.size).clamp(Vector2(-0.4, -0.4), Vector2(1.4, 1.4)) if rect.size.x > 0 else Vector2(0.3, 0.2)
		var material := _image.material as ShaderMaterial
		var current: Vector2 = material.get_shader_parameter("light")
		material.set_shader_parameter("light", current.lerp(light, 1.0 - exp(-10.0 * delta)))


# — Inspetor fixo —

## Abre a carta de perto (o FCard do estado; `url` é a imagem).
func open(card: Dictionary, ctx: Dictionary, url: String = "") -> void:
	if card.is_empty():
		return
	hide_preview(true)
	var details: Dictionary = CardDetails.build(card, ctx)
	_fill_modal(details, url)
	_modal.visible = true
	_modal.modulate.a = 0.0
	_panel.pivot_offset = _panel.size / 2.0
	_panel.scale = Vector2(0.96, 0.96)
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_modal, "modulate:a", 1.0, 0.14)
	tween.tween_property(_panel, "scale", Vector2.ONE, 0.18)


func close() -> void:
	_modal.visible = false


func is_open() -> bool:
	return _modal.visible


## Os textos do inspetor aberto (para os testes): nome e cada linha dos detalhes, na ordem.
func open_text() -> PackedStringArray:
	var out: PackedStringArray = [_name.text]
	for node: Node in _details.find_children("*", "", true, false):
		if node is Label:
			out.append((node as Label).text)
		elif node is RichTextLabel:
			out.append((node as RichTextLabel).get_parsed_text())
	return out


## Chegou uma imagem: põe na prévia ou no inspetor que esperavam por ela.
func on_texture_ready(url: String, tex: Texture2D) -> void:
	if url == _preview_url:
		_preview_image.texture = tex
	if url == _image_url:
		_image.texture = tex


func _input(event: InputEvent) -> void:
	if event is InputEventMouse:
		_mouse = (event as InputEventMouse).position
	if not _modal.visible:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var key: Key = (event as InputEventKey).keycode
		if key == KEY_ESCAPE or key == KEY_I:
			close()
			get_viewport().set_input_as_handled()


func _fill_modal(details: Dictionary, url: String) -> void:
	_name.text = Txt.of(details["name"])
	for child: Node in _cost.get_children():
		child.queue_free()
	for symbol: String in ManaSymbols.parse(Txt.of(details["cost"])):
		var pip := TextureRect.new()
		pip.texture = ManaSymbols.texture(symbol, 56)
		pip.custom_minimum_size = Vector2(26, 26)
		pip.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pip.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_cost.add_child(pip)
	_cost.visible = _cost.get_child_count() > 0
	_image_url = url
	_image.texture = catalog.texture(url) if catalog and url != "" else null
	(_image.get_parent() as Control).visible = url != ""
	for child: Node in _details.get_children():
		_details.remove_child(child)
		child.queue_free()
	if Txt.of(details["type"]) != "":
		var type := _label(18, MUTED)
		type.text = Txt.of(details["type"])
		_details.add_child(type)
	if Txt.of(details["text"]) != "":
		var rules := _rich(19, INK)
		for i: int in Txt.of(details["text"]).split("\n").size():
			if i > 0:
				rules.add_text("\n")
				rules.push_font_size(8)
				rules.add_text("\n")
				rules.pop()
			ManaSymbols.append_rich(rules, Txt.of(details["text"]).split("\n")[i], 19)
		_details.add_child(rules)
	if Txt.of(details["power"]) != "":
		_details.add_child(_rule())
		var strength := _rich(18, MUTED)
		strength.push_font(_bold, 30)
		strength.push_color(INK)
		strength.add_text("%s / %s" % [details["power"], details["toughness"]])
		strength.pop()
		strength.pop()
		if Txt.of(details["base"]) != "":
			strength.add_text("    Base: %s" % details["base"])
		if int(details["damage"]) > 0:
			strength.push_color(DAMAGE)
			strength.add_text("    %d de dano marcado" % int(details["damage"]))
			strength.pop()
		_details.add_child(strength)
	var keywords: PackedStringArray = details["keywords"]
	if not keywords.is_empty():
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 8)
		flow.add_theme_constant_override("v_separation", 8)
		for keyword: String in keywords:
			flow.add_child(_chip(keyword))
		_details.add_child(flow)
	var counters: PackedStringArray = details["counters"]
	if not counters.is_empty():
		var line := _rich(17, INK)
		line.push_color(MUTED)
		line.add_text("Marcadores: ")
		line.pop()
		line.add_text(", ".join(counters))
		_details.add_child(line)
	for note: String in details["notes"] as PackedStringArray:
		_details.add_child(_note(note))


# — Peças —

func _build_preview() -> void:
	_preview = PanelContainer.new()
	_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_preview.add_theme_stylebox_override("panel", _style(BG, 14, 0))
	_preview.visible = false
	add_child(_preview)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	_preview.add_child(column)
	_preview_image = _card_image(PREVIEW_WIDTH)
	column.add_child(_preview_image)
	var notes := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		notes.add_theme_constant_override("margin_" + side, 12 if side != "top" else 8)
	column.add_child(notes)
	_preview_notes = VBoxContainer.new()
	_preview_notes.add_theme_constant_override("separation", 4)
	_preview_notes.custom_minimum_size = Vector2(PREVIEW_WIDTH - 24, 0)
	notes.add_child(_preview_notes)


func _build_modal() -> void:
	_modal = Control.new()
	_modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_modal.visible = false
	add_child(_modal)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.01, 0.02, 0.05, 0.66)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	backdrop.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close())
	_modal.add_child(backdrop)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_modal.add_child(center)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", _style(BG, 18, 1))
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	center.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	_panel.add_child(column)

	var head := MarginContainer.new()
	_margins(head, 28, 22, 22, 18)
	column.add_child(head)
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 16)
	head.add_child(head_row)
	var title := VBoxContainer.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_constant_override("separation", 6)
	head_row.add_child(title)
	_name = _label(30, INK)
	_name.add_theme_font_override("font", _bold)
	title.add_child(_name)
	_cost = HBoxContainer.new()
	_cost.add_theme_constant_override("separation", 3)
	title.add_child(_cost)
	var close_button := Button.new()
	close_button.text = "Fechar"
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.custom_minimum_size = Vector2(108, 46)
	close_button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	close_button.add_theme_font_size_override("font_size", 18)
	for state_name: String in ["normal", "hover", "pressed", "focus"]:
		var style := _style(Color("#16223a") if state_name != "hover" else Color("#20304f"), 12, 1)
		style.border_color = GOLD if state_name == "hover" else LINE
		style.content_margin_left = 16
		style.content_margin_right = 16
		close_button.add_theme_stylebox_override(state_name, style)
	close_button.add_theme_color_override("font_color", INK)
	close_button.add_theme_color_override("font_hover_color", INK)
	close_button.pressed.connect(close)
	head_row.add_child(close_button)
	var line := ColorRect.new()
	line.color = LINE
	line.custom_minimum_size = Vector2(0, 1)
	column.add_child(line)

	var body := MarginContainer.new()
	_margins(body, 26, 26, 26, 26)
	column.add_child(body)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 28)
	body.add_child(row)
	# A carta com uma sombra larga embaixo, como se estivesse levantada da mesa.
	var frame := PanelContainer.new()
	var shadow := _style(Color(0, 0, 0, 0), 16, 0)
	shadow.shadow_color = Color(0, 0, 0, 0.55)
	shadow.shadow_size = 22
	shadow.shadow_offset = Vector2(0, 10)
	frame.add_theme_stylebox_override("panel", shadow)
	frame.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(frame)
	_image = _card_image(IMAGE_WIDTH)
	(_image.material as ShaderMaterial).set_shader_parameter("sheen", 1.0)
	frame.add_child(_image)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(440, IMAGE_WIDTH * CARD_ASPECT)
	row.add_child(scroll)
	_details = VBoxContainer.new()
	_details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_details.add_theme_constant_override("separation", 14)
	scroll.add_child(_details)


func _card_image(width: float) -> TextureRect:
	var image := TextureRect.new()
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_SCALE
	image.custom_minimum_size = Vector2(width, round(width * CARD_ASPECT))
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = IMAGE_SHADER
	material.set_shader_parameter("aspect", CARD_ASPECT)
	material.set_shader_parameter("light", Vector2(0.3, 0.2))
	image.material = material
	return image


func _strength_text(details: Dictionary) -> String:
	var text: String = "%s/%s" % [details["power"], details["toughness"]] if Txt.of(details["power"]) != "" else ""
	if Txt.of(details["base"]) != "":
		text += " (base %s)" % details["base"]
	if int(details["damage"]) > 0:
		text += (" · " if text != "" else "") + "%d de dano marcado" % int(details["damage"])
	return text


## Palavra-chave num selo arredondado.
func _chip(text: String) -> PanelContainer:
	var chip := PanelContainer.new()
	var style := _style(Color("#1b2944"), 14, 1)
	style.border_color = Color("#4a5d88")
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 4
	style.content_margin_bottom = 5
	chip.add_theme_stylebox_override("panel", style)
	var label := _label(16, INK)
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	chip.add_child(label)
	return chip


## Nota com a barra dourada à esquerda.
func _note(text: String) -> PanelContainer:
	var box := PanelContainer.new()
	var style := _style(Color(0.94, 0.72, 0.29, 0.07), 6, 0)
	style.border_color = GOLD
	style.border_width_left = 3
	style.content_margin_left = 12
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 7
	box.add_theme_stylebox_override("panel", style)
	var label := _rich(16, INK)
	ManaSymbols.append_rich(label, text, 16)
	box.add_child(label)
	return box


func _rule() -> ColorRect:
	var line := ColorRect.new()
	line.color = Color(LINE, 0.7)
	line.custom_minimum_size = Vector2(0, 1)
	return line


func _label(size: int, color: Color) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _rich(size: int, color: Color) -> RichTextLabel:
	var label := RichTextLabel.new()
	label.fit_content = true
	label.scroll_active = false
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("normal_font_size", size)
	label.add_theme_color_override("default_color", color)
	label.add_theme_constant_override("line_separation", 3)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label


static func _margins(box: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	box.add_theme_constant_override("margin_left", left)
	box.add_theme_constant_override("margin_top", top)
	box.add_theme_constant_override("margin_right", right)
	box.add_theme_constant_override("margin_bottom", bottom)


static func _style(color: Color, radius: int, border: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.border_color = LINE
	style.set_border_width_all(border)
	style.shadow_color = Color(0, 0, 0, 0.5)
	style.shadow_size = 18 if border > 0 or radius >= 14 else 0
	style.shadow_offset = Vector2(0, 8)
	style.anti_aliasing = true
	return style
