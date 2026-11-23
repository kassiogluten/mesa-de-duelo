# Ver uma carta de perto: a prévia que acompanha o mouse (CardPreview) e o inspetor fixo (clique direito ou "I"), com a
# imagem que inclina e brilha pela raridade e, ao lado, nome, custo, tipo, texto, força, palavras-chave, marcadores, notas
# e as cartas ligadas; virar a dupla face, apontar a carta para os outros jogadores e voltar à carta anterior.
class_name CardInspector
extends Control

const IMAGE_WIDTH := 360.0
const CARD_ASPECT := InspectorKit.CARD_ASPECT
## Quanto o desenho da carta pode passar da caixa ao inclinar e girar (fração da largura, de cada lado).
const OVERSCAN := 0.07
## Inclinação máxima seguindo o mouse (radianos, ~9°), o tempo de virar e o da luz que passa ao abrir uma carta com foil.
const TILT_MAX := 0.16
const FLIP_TIME := 0.44
const INTRO_TIME := 1.1

var catalog: CardCatalog:
	set(value):
		if catalog and catalog.info_ready.is_connected(_on_info_ready):
			catalog.info_ready.disconnect(_on_info_ready)
		catalog = value
		if catalog:
			catalog.info_ready.connect(_on_info_ready)
		if _preview:
			_preview.catalog = value

var _preview: CardPreview
var _modal: Control
var _panel: PanelContainer
var _frame: PanelContainer
var _image: TextureRect
var _image_url: String = ""
var _name: Label
var _cost: HBoxContainer
var _details: VBoxContainer
var _links: InspectorLinks
var _footer: HBoxContainer
var _back: Button
var _flip: Button
var _point: Button
## Onde está o mouse, pelos eventos (não pela posição do sistema: assim os prints e os testes conseguem movê-lo).
var _mouse: Vector2 = Vector2(-1, -1)

## A carta aberta: o FCard, o contexto, a imagem e os lados (CardFaces.sides); turned: mostrando a outra face.
var _card: Dictionary = {}
var _ctx: Dictionary = {}
var _url: String = ""
var _sides: Dictionary = {}
var _turned: bool = false
## As cartas abertas antes desta pelas miniaturas ({card, ctx, url}), para a seta de voltar.
var _history: Array = []
var _flip_tween: Tween
var _intro_left: float = -1.0
var _tilt: Vector2 = Vector2.ZERO
## Nomes que a carta aberta pediu ao catálogo e ainda esperam (quando chegam, o painel se refaz).
var _wanted: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_preview = CardPreview.new()
	_preview.catalog = catalog
	add_child(_preview)
	_build_modal()


# — Prévia —

## Mostra a prévia da carta (o FCard do estado) ao lado do mouse; `url` é a imagem que a mesa já usa nela.
func show_preview(card: Dictionary, ctx: Dictionary, url: String) -> void:
	if is_open() or url == "" or card.is_empty():
		hide_preview()
		return
	_preview.show_card(card, ctx, url)


## Prévia só com a imagem (a pilha e outras listas que têm a textura e não o FCard); null esconde.
func show_texture(tex: Texture2D) -> void:
	if tex == null or is_open():
		hide_preview()
		return
	_preview.show_texture(tex)


func hide_preview(immediate: bool = false) -> void:
	_preview.hide_card(immediate)


## A prévia está à mostra (ou para aparecer).
func previewing() -> bool:
	return _preview.showing()


# — Inspetor fixo —

## Abre a carta de perto (o FCard do estado; `url` é a imagem). `ctx`: o de CardDetails.build, mais state (o estado da
## partida, para as cartas ligadas e o Apontar) e point (id → avisa os outros jogadores), quando há.
func open(card: Dictionary, ctx: Dictionary, url: String = "") -> void:
	if card.is_empty():
		return
	hide_preview(true)
	_history.clear()
	_show(card, ctx, url)
	_modal.visible = true
	_modal.modulate.a = 0.0
	_panel.pivot_offset = _panel.size / 2.0
	_panel.scale = Vector2(0.96, 0.96)
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(_modal, "modulate:a", 1.0, 0.14)
	tween.tween_property(_panel, "scale", Vector2.ONE, 0.18)


func close() -> void:
	_modal.visible = false
	_history.clear()
	_stop_flip()


func is_open() -> bool:
	return _modal.visible


## Mostrando a outra face da carta (depois do botão de virar).
func turned() -> bool:
	return _turned


## Quantas cartas dá para voltar com a seta.
func back_depth() -> int:
	return _history.size()


## Os textos do inspetor aberto (para os testes): nome, cada linha dos detalhes e das cartas ligadas, os botões e o rodapé.
func open_text() -> PackedStringArray:
	var out: PackedStringArray = [_name.text]
	for root: Control in [_details, _links, _panel.get_child(0).get_child(0), _footer]:
		for node: Node in root.find_children("*", "", true, false):
			if not node is Control or not (node as Control).is_visible_in_tree():
				continue
			if node is Label and node != _name:
				out.append((node as Label).text)
			elif node is RichTextLabel:
				out.append((node as RichTextLabel).get_parsed_text())
			elif node is Button and (node as Button).text != "":
				out.append((node as Button).text)
	return out


## Chegou uma imagem: põe na prévia, no inspetor ou nas miniaturas que esperavam por ela.
func on_texture_ready(url: String, tex: Texture2D) -> void:
	_preview.on_texture_ready(url, tex)
	if url == _image_url:
		_image.texture = tex
	_links.on_texture_ready(url, tex)


## Vira a carta de duas faces (ou gira a flip), com o giro em perspectiva e a troca da face no meio.
func turn() -> void:
	if _sides.is_empty() or (_flip_tween and _flip_tween.is_running()):
		return
	_turned = not _turned
	_flip.text = _flip_label()
	var material := _image.material as ShaderMaterial
	var faces: Array = _sides["faces"]
	var shown: int = int(_sides["shown"])
	var target: int = 1 - shown if _turned else shown
	var dfc: bool = Txt.of(_sides["kind"]) == "dfc"
	var next_url: String = (_sides["urls"] as PackedStringArray)[target]
	if dfc and catalog:
		catalog.texture(next_url)
	var start_spin: float = float(material.get_shader_parameter("spin"))
	var swapped: Array = [false]
	var me: WeakRef = weakref(self)
	_flip_tween = create_tween()
	_flip_tween.tween_method(func(p: float) -> void:
		var inspector: CardInspector = me.get_ref()
		if inspector == null:
			return
		if p >= 0.5 and not swapped[0]:
			swapped[0] = true
			inspector._show_face(target, faces, next_url if dfc else "")
		if dfc:
			material.set_shader_parameter("turn", p * PI if p < 0.5 else (p - 1.0) * PI)
			inspector._frame.self_modulate.a = absf(cos(p * PI))
		else:
			material.set_shader_parameter("spin", lerpf(start_spin, PI if inspector._turned else 0.0, p))
		inspector._details.modulate.a = absf(cos(p * PI)) if dfc else 1.0 - sin(p * PI) * 0.85,
		0.0, 1.0, FLIP_TIME).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Avisa os outros jogadores desta carta (o botão Apontar) e fecha.
func point() -> void:
	if not _point.visible:
		return
	var send: Callable = _ctx.get("point", Callable())
	if send.is_valid():
		send.call(int(_card.get("id", -1)))
	close()


## Volta à carta aberta antes da miniatura.
func back() -> void:
	if _history.is_empty():
		return
	var last: Dictionary = _history.pop_back()
	_show(last["card"], last["ctx"], last["url"])
	_slide_in(-1.0)


## Abre uma carta ligada (miniatura), guardando esta para a seta de voltar.
func open_link(card: Dictionary) -> void:
	if card.is_empty() or not is_open():
		return
	_history.append({"card": _card, "ctx": _ctx, "url": _url})
	_show(card, _ctx, catalog.image_url_for(card) if catalog else "")
	_slide_in(1.0)


func _input(event: InputEvent) -> void:
	if event is InputEventMouse:
		_mouse = (event as InputEventMouse).position
		_preview.mouse = _mouse
	if not _modal.visible:
		return
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_XBUTTON1:
		back()
		get_viewport().set_input_as_handled()
		return
	if not event is InputEventKey or not (event as InputEventKey).pressed or (event as InputEventKey).echo:
		return
	var key := event as InputEventKey
	if key.ctrl_pressed or key.alt_pressed or key.meta_pressed:
		return
	match key.keycode:
		KEY_ESCAPE, KEY_I:
			close()
		KEY_V:
			turn()
		KEY_A:
			point()
		KEY_BACKSPACE:
			back()
		_:
			return
	get_viewport().set_input_as_handled()


func _process(delta: float) -> void:
	if not _modal.visible:
		return
	var material := _image.material as ShaderMaterial
	var rect: Rect2 = _image.get_global_rect()
	var light: Vector2 = ((_mouse - rect.position) / rect.size).clamp(Vector2(-0.4, -0.4), Vector2(1.4, 1.4)) if rect.size.x > 0 else Vector2(0.3, 0.2)
	var tilt := Vector2.ZERO
	if rect.grow(rect.size.x * OVERSCAN).has_point(_mouse):
		var off: Vector2 = ((_mouse - rect.get_center()) / (rect.size / 2.0)).clamp(Vector2(-1, -1), Vector2(1, 1))
		tilt = Vector2(-off.y, off.x) * TILT_MAX
	if _intro_left >= 0.0:
		# A luz passa uma vez pela carta ao abrir, inclinando de leve: o jogador vê que ela brilha sem mexer o mouse.
		_intro_left -= delta
		var p: float = clampf(1.0 - _intro_left / INTRO_TIME, 0.0, 1.0)
		light = Vector2(-0.2, -0.2).lerp(Vector2(1.2, 1.2), p)
		tilt = Vector2(0.5 - p, p - 0.5) * TILT_MAX * sin(p * PI)
	var current: Vector2 = material.get_shader_parameter("light")
	material.set_shader_parameter("light", current.lerp(light, 1.0 - exp(-10.0 * delta)))
	_tilt = _tilt.lerp(tilt, 1.0 - exp(-8.0 * delta))
	material.set_shader_parameter("tilt", _tilt)


## Põe a carta no painel aberto (abrir, miniatura, voltar): textos, imagem, foil, cartas ligadas, botões e rodapé.
func _show(card: Dictionary, ctx: Dictionary, url: String) -> void:
	_stop_flip()
	_card = card
	_ctx = ctx
	_url = url
	_turned = false
	var lookup: Callable = CardFaces.lookup(catalog, ctx.get("lookup", Callable()))
	var view: Dictionary = ctx.duplicate()
	view["lookup"] = lookup
	_sides = CardFaces.sides(card, catalog)
	if Txt.of(_sides.get("kind")) == "dfc":
		url = (_sides["urls"] as PackedStringArray)[int(_sides["shown"])]
		# O verso já vem baixando: virar não espera a imagem.
		if catalog:
			catalog.texture((_sides["urls"] as PackedStringArray)[1 - int(_sides["shown"])])
	_fill(CardDetails.build(card, view))
	_set_image(url)
	var material := _image.material as ShaderMaterial
	# O foil pela raridade (só aqui e na prévia; a mesa fica sem): a do estado ou a do catálogo.
	var foil: float = CardDressing.foil_level(CardDressing.rarity_of(card, catalog))
	material.set_shader_parameter("foil", foil)
	_intro_left = INTRO_TIME if foil > 0.0 else -1.0
	var state: Dictionary = ctx.get("state", {}) if ctx.get("state") is Dictionary else {}
	var links: Array = CardLinks.of(card, state, func(name: String) -> String: return Txt.of(lookup.call(name).get("label", name)))
	_links.show_links(links, lookup)
	_ask([card] + links.map(func(link: Dictionary) -> Dictionary: return link["card"]), lookup)
	_back.visible = not _history.is_empty()
	_flip.visible = not _sides.is_empty()
	_flip.text = _flip_label()
	_point.visible = (ctx.get("point", Callable()) as Callable).is_valid() and CardLinks.can_point(state, int(card.get("id", -1)))
	_fill_footer()


## Pede ao catálogo os nomes que ainda não chegaram (as cartas ligadas podem estar no exílio, que a mesa não pediu).
func _ask(cards: Array, lookup: Callable) -> void:
	_wanted.clear()
	if catalog == null:
		return
	var names: PackedStringArray = []
	for card: Dictionary in cards:
		var name: String = Txt.of(card.get("name"))
		if name != "" and (lookup.call(name) as Dictionary).is_empty():
			names.append(name)
			_wanted[name] = true
	if not names.is_empty():
		catalog.request(names)


func _on_info_ready(names: PackedStringArray) -> void:
	if not is_open() or _turned or (_flip_tween and _flip_tween.is_running()):
		return
	for name: String in names:
		if _wanted.has(name):
			_show(_card, _ctx, _url)
			return


## A outra face (ou a de volta) no meio do giro: a imagem e os textos dela.
func _show_face(index: int, faces: Array, url: String) -> void:
	if index == int(_sides["shown"]):
		var view: Dictionary = _ctx.duplicate()
		view["lookup"] = CardFaces.lookup(catalog, _ctx.get("lookup", Callable()))
		_fill(CardDetails.build(_card, view))
	else:
		var details: Dictionary = CardDetails.face(faces[index])
		details["notes"] = PackedStringArray(["Outra face desta carta: na mesa, ela está com a face %s à mostra." % ("da frente" if int(_sides["shown"]) == 0 else "de trás")])
		_fill(details)
	if url != "":
		_set_image(url)


func _set_image(url: String) -> void:
	_image_url = url
	_image.texture = catalog.texture(url) if catalog and url != "" else null
	_frame.visible = url != ""


func _stop_flip() -> void:
	if _flip_tween:
		_flip_tween.kill()
	_flip_tween = null
	var material := _image.material as ShaderMaterial
	material.set_shader_parameter("turn", 0.0)
	material.set_shader_parameter("spin", 0.0)
	_frame.self_modulate.a = 1.0
	_details.modulate.a = 1.0


func _flip_label() -> String:
	if Txt.of(_sides.get("kind")) == "flip":
		return "Desvirar a carta" if _turned else "Girar a carta"
	return "Ver a frente" if _turned else "Ver o verso"


## Ao abrir uma ligada (1) ou voltar (-1), o painel desliza um pouco desse lado.
func _slide_in(direction: float) -> void:
	var column: Control = _panel.get_child(0)
	column.modulate.a = 0.0
	column.position.x = 24.0 * direction
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(column, "modulate:a", 1.0, 0.16)
	tween.tween_property(column, "position:x", 0.0, 0.2)


func _fill(details: Dictionary) -> void:
	_name.text = Txt.of(details["name"])
	for child: Node in _cost.get_children():
		_cost.remove_child(child)
		child.queue_free()
	for symbol: String in ManaSymbols.parse(Txt.of(details["cost"])):
		var pip := TextureRect.new()
		pip.texture = ManaSymbols.texture(symbol, 56)
		pip.custom_minimum_size = Vector2(26, 26)
		pip.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		pip.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_cost.add_child(pip)
	_cost.visible = _cost.get_child_count() > 0
	InspectorKit.fill_details(_details, details)


## As teclas do inspetor aberto, num rodapé pequeno (só as que valem para esta carta).
func _fill_footer() -> void:
	for child: Node in _footer.get_children():
		_footer.remove_child(child)
		child.queue_free()
	var hints: Array = [["Esc", "fecha"]]
	if _flip.visible:
		hints.append(["V", "vira a carta"])
	if _point.visible:
		hints.append(["A", "aponta para os outros jogadores"])
	if _back.visible:
		hints.append(["Backspace", "volta à carta anterior"])
	if _links.has_links():
		hints.append(["Clique", "numa miniatura abre a carta"])
	for i: int in hints.size():
		if i > 0:
			_footer.add_child(ModalStyle.label(13, ModalStyle.FAINT, "   "))
		_footer.add_child(ModalStyle.keycap(Txt.of(hints[i][0])))
		_footer.add_child(ModalStyle.label(13, ModalStyle.FAINT, " " + Txt.of(hints[i][1])))


# — Peças —

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
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
			close())
	_modal.add_child(backdrop)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_modal.add_child(center)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", InspectorKit.box(InspectorKit.BG, 18, 1))
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	center.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	_panel.add_child(column)

	var head := MarginContainer.new()
	InspectorKit.margins(head, 28, 22, 22, 18)
	column.add_child(head)
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 12)
	head.add_child(head_row)
	_back = InspectorKit.button("←", 52)
	_back.tooltip_text = "Voltar à carta anterior"
	_back.pressed.connect(back)
	head_row.add_child(_back)
	var title := VBoxContainer.new()
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_constant_override("separation", 6)
	head_row.add_child(title)
	_name = InspectorKit.label(30, InspectorKit.INK)
	_name.add_theme_font_override("font", InspectorKit.bold())
	title.add_child(_name)
	_cost = HBoxContainer.new()
	_cost.add_theme_constant_override("separation", 3)
	title.add_child(_cost)
	_flip = InspectorKit.button("Ver o verso")
	_flip.pressed.connect(turn)
	head_row.add_child(_flip)
	_point = InspectorKit.button("Apontar")
	_point.tooltip_text = "Destaca a carta na mesa dos outros jogadores"
	_point.pressed.connect(point)
	head_row.add_child(_point)
	var close_button := InspectorKit.button("Fechar", 108)
	close_button.pressed.connect(close)
	head_row.add_child(close_button)
	var line := ColorRect.new()
	line.color = InspectorKit.LINE
	line.custom_minimum_size = Vector2(0, 1)
	column.add_child(line)

	var body := MarginContainer.new()
	InspectorKit.margins(body, 26, 26, 26, 18)
	column.add_child(body)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 28)
	body.add_child(row)
	# A carta com uma sombra larga embaixo, como se estivesse levantada da mesa.
	_frame = PanelContainer.new()
	var shadow := InspectorKit.box(Color(0, 0, 0, 0), 16, 0)
	shadow.shadow_color = Color(0, 0, 0, 0.55)
	shadow.shadow_size = 22
	shadow.shadow_offset = Vector2(0, 10)
	_frame.add_theme_stylebox_override("panel", shadow)
	_frame.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(_frame)
	_image = InspectorKit.card_image(IMAGE_WIDTH)
	var material := _image.material as ShaderMaterial
	material.set_shader_parameter("sheen", 1.0)
	material.set_shader_parameter("overscan", OVERSCAN)
	_frame.add_child(_image)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(440, IMAGE_WIDTH * CARD_ASPECT)
	row.add_child(scroll)
	var side := VBoxContainer.new()
	side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side.add_theme_constant_override("separation", 18)
	scroll.add_child(side)
	_details = VBoxContainer.new()
	_details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_details.add_theme_constant_override("separation", 14)
	side.add_child(_details)
	_links = InspectorLinks.new()
	_links.catalog_ref = func() -> CardCatalog: return catalog
	_links.opened.connect(open_link)
	side.add_child(_links)

	var foot := MarginContainer.new()
	InspectorKit.margins(foot, 26, 0, 26, 16)
	column.add_child(foot)
	_footer = HBoxContainer.new()
	_footer.alignment = BoxContainer.ALIGNMENT_CENTER
	_footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	foot.add_child(_footer)
