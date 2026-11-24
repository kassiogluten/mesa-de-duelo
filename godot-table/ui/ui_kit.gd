# As peças montadas da interface na direção "Nítido" (roadmap 150, docs/direcao-visual-mesa-pc.md), para todas as
# telas usarem as mesmas: cabeçalho de tela, legenda, selo, linha de lista, escolhas lado a lado, valor com setas,
# deslizante com o nome e o valor, abas laterais e a entrada e a saída das telas e das janelas (com o som delas). O
# painel e os botões ficam no ModalStyle; os campos, caixas de marcar, deslizantes e abas de cima, no Theme (ui_theme.gd).
class_name UiKit
extends RefCounted

## Tempo da entrada de uma tela e de uma janela, e quanto elas sobem entrando.
const ENTER_TIME := 0.24
const RISE := 18.0
const MODAL_RISE := 10.0
## A escala de onde a janela parte (um "pop" curto, sem exagero).
const MODAL_FROM := 0.96
## Movimento reduzido (Opções): as telas e janelas só aparecem, sem subir nem crescer.
static var reduce_motion: bool = false


## Uma legenda pequena em caixa alta e espaçada (o nome de um grupo: "SOM", "SEU DECK").
static func caption(text: String, color: Color = ModalStyle.MUTED, size: int = 13) -> Label:
	var out := ModalStyle.label(size, color, text.to_upper())
	out.add_theme_font_override("font", HomeStyle.caps_font())
	out.add_theme_constant_override("outline_size", 0)
	return out


## Um selo de estado ("Esperando", "Em andamento"): fundo da cor bem leve, filete e letra da cor, cantos quase retos.
static func chip(text: String, color: Color) -> PanelContainer:
	var out := PanelContainer.new()
	out.name = "Chip"
	out.mouse_filter = Control.MOUSE_FILTER_IGNORE
	out.add_theme_stylebox_override("panel", UiTheme.flat(Color(color, 0.14), Color(color, 0.55), 1, 9, 1))
	out.add_child(caption(text, color, 12))
	return out


## A caixa de uma linha de lista (uma sala, um deck): azul-escuro chapado, filete fraco; com o mouse, o filete dourado.
static func row_box(hover: bool = false) -> StyleBoxFlat:
	var box := UiTheme.flat(Color(ModalStyle.SECONDARY_FILL, 0.8), Color(ModalStyle.GOLD_LIGHT, 0.6) if hover else Color(1, 1, 1, 0.08), 1, 18, 10)
	box.content_margin_right = 12
	return box


## Pinta um botão de escolha: o marcado com fundo e filete dourados e a letra acesa; o outro, discreto.
static func style_choice(out: Button, on: bool) -> void:
	ModalStyle.style_button(out, ModalStyle.Kind.GHOST)
	out.set_meta("chosen", on)
	if not on:
		return
	for state_name: String in ["normal", "hover", "pressed"]:
		var box: StyleBoxFlat = ModalStyle.button_box(ModalStyle.Kind.GHOST, state_name)
		box.bg_color = Color(ModalStyle.GOLD, 0.2 if state_name == "hover" else 0.14)
		box.border_color = ModalStyle.GOLD_LIGHT if state_name == "hover" else Color(ModalStyle.GOLD, 0.85)
		out.add_theme_stylebox_override(state_name, box)
	for slot: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		out.add_theme_color_override(slot, ModalStyle.GOLD_LIGHT)


## Escolhas lado a lado em que só uma fica marcada: `options` é [[valor, texto], ...]; cada botão se chama
## "Option_<valor>". `on_change` recebe o valor escolhido.
static func segmented(options: Array, current: String, on_change: Callable, height: float = 40.0) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var buttons: Array[Button] = []
	for option: Array in options:
		var value: String = option[0]
		var choice: Button = ModalStyle.button(Txt.of(option[1]), ModalStyle.Kind.GHOST, 0.0, height)
		choice.name = "Option_" + value
		choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		choice.set_meta("value", value)
		style_choice(choice, value == current)
		buttons.append(choice)
		choice.pressed.connect(func() -> void:
			for other: Button in buttons:
				style_choice(other, other == choice)
			on_change.call(value))
		row.add_child(choice)
	return row


## Um valor com setas dos lados ("‹ Automático ›"), como nas opções de um jogo: as setas passam pelos valores (sem dar
## a volta). `options` é [[valor, texto], ...]; `on_change` recebe o valor. O nó do texto se chama "Value".
static func stepper(options: Array, current: String, on_change: Callable, width: float = 260.0) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.name = "Stepper"
	row.add_theme_constant_override("separation", 4)
	row.custom_minimum_size = Vector2(width, 40)
	var index: Array[int] = [0]
	for i: int in options.size():
		if Txt.of((options[i] as Array)[0]) == current:
			index[0] = i
	var left: Button = ModalStyle.button("‹", ModalStyle.Kind.GHOST, 40.0, 40.0)
	left.name = "Previous"
	var right: Button = ModalStyle.button("›", ModalStyle.Kind.GHOST, 40.0, 40.0)
	right.name = "Next"
	for arrow: Button in [left, right]:
		arrow.add_theme_font_size_override("font_size", 22)
		for state_name: String in ["normal", "hover", "pressed", "disabled"]:
			var box: StyleBoxFlat = arrow.get_theme_stylebox(state_name)
			box.content_margin_left = 0
			box.content_margin_right = 0
	var value := ModalStyle.label(17, ModalStyle.INK)
	value.name = "Value"
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	value.add_theme_font_override("font", HudStyle.bold_font())
	value.add_theme_constant_override("outline_size", 0)
	var show: Callable = func() -> void:
		value.text = Txt.of((options[index[0]] as Array)[1])
		left.disabled = index[0] <= 0
		right.disabled = index[0] >= options.size() - 1
	var move: Callable = func(step: int) -> void:
		var next: int = clampi(index[0] + step, 0, options.size() - 1)
		if next == index[0]:
			return
		index[0] = next
		show.call()
		on_change.call(Txt.of((options[next] as Array)[0]))
	left.pressed.connect(func() -> void: move.call(-1))
	right.pressed.connect(func() -> void: move.call(1))
	row.add_child(left)
	row.add_child(value)
	row.add_child(right)
	show.call()
	return row


## Uma linha de opção: o nome (e a explicação embaixo, apagada) à esquerda e o controle à direita.
static func option_row(label: String, control: Control, hint: String = "") -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	var texts := VBoxContainer.new()
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.add_theme_constant_override("separation", 2)
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var name := ModalStyle.label(18, ModalStyle.INK, label)
	name.add_theme_constant_override("outline_size", 0)
	texts.add_child(name)
	if hint != "":
		var line: Label = ModalStyle.wrap(14, Color(ModalStyle.INK, 0.58), hint, 0.0, false)
		line.name = "Hint"
		line.add_theme_constant_override("outline_size", 0)
		texts.add_child(line)
	row.add_child(texts)
	control.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(control)
	return row


## Um deslizante com o valor ao lado ("80%"); `format` recebe o valor e devolve o texto. O deslizante se chama "Slider".
static func slider(value: float, from: float, to: float, step: float, on_change: Callable, format: Callable, width: float = 260.0) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.custom_minimum_size = Vector2(width, 40)
	var bar := HSlider.new()
	bar.name = "Slider"
	bar.min_value = from
	bar.max_value = to
	bar.step = step
	bar.value = value
	bar.focus_mode = Control.FOCUS_NONE
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var shown := ModalStyle.label(16, ModalStyle.GOLD_LIGHT, Txt.of(format.call(value)))
	shown.name = "Value"
	shown.custom_minimum_size = Vector2(52, 0)
	shown.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	shown.add_theme_constant_override("outline_size", 0)
	bar.value_changed.connect(func(v: float) -> void:
		shown.text = Txt.of(format.call(v))
		on_change.call(v))
	row.add_child(bar)
	row.add_child(shown)
	return row


## Pinta um botão de aba lateral: a marcada com o fundo azul-escuro, o filete dourado à esquerda e a letra acesa.
static func style_side_tab(out: Button, on: bool) -> void:
	for state_name: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		var box := UiTheme.flat(Color(0, 0, 0, 0), Color(0, 0, 0, 0), 0, 18, 10)
		if on and state_name != "focus":
			box.bg_color = ModalStyle.SECONDARY_FILL
			box.border_color = ModalStyle.GOLD
			box.border_width_left = ModalStyle.TOP_LINE
		elif state_name == "hover":
			box.bg_color = Color(1, 1, 1, 0.05)
			box.border_color = Color(ModalStyle.GOLD_LIGHT, 0.5)
			box.border_width_left = 1
		elif state_name == "focus":
			box.draw_center = false
		out.add_theme_stylebox_override(state_name, box)
	var ink: Color = ModalStyle.GOLD_LIGHT if on else ModalStyle.MUTED
	for slot: String in ["font_color", "font_pressed_color", "font_focus_color"]:
		out.add_theme_color_override(slot, ink)
	out.add_theme_color_override("font_hover_color", ModalStyle.GOLD_LIGHT if on else Color.WHITE)
	out.set_meta("chosen", on)


## As abas laterais: uma coluna de botões ("Tab_<chave>") em que só um fica marcado; `on_select` recebe a chave.
static func side_tabs(tabs: Array, current: String, on_select: Callable) -> VBoxContainer:
	var column := VBoxContainer.new()
	column.name = "Tabs"
	column.add_theme_constant_override("separation", 4)
	column.custom_minimum_size = Vector2(200, 0)
	var buttons: Array[Button] = []
	for tab: Array in tabs:
		var key: String = tab[0]
		var button := Button.new()
		button.name = "Tab_" + key
		button.text = Txt.of(tab[1])
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size = Vector2(0, 46)
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		button.add_theme_font_override("font", HudStyle.bold_font())
		button.add_theme_font_size_override("font_size", 18)
		style_side_tab(button, key == current)
		buttons.append(button)
		button.pressed.connect(func() -> void:
			for other: Button in buttons:
				style_side_tab(other, other == button)
			on_select.call(key))
		column.add_child(button)
	return column


## O cabeçalho de uma tela: Voltar (o botão "Back"), o título grande e uma linha de explicação embaixo. Quem usa liga
## o "Back" e pode pôr mais coisas à direita.
static func screen_header(text: String, subtitle: String = "", eyebrow: String = "") -> HBoxContainer:
	var head := HBoxContainer.new()
	head.name = "Header"
	head.add_theme_constant_override("separation", 24)
	var back: Button = ModalStyle.button("‹  Voltar", ModalStyle.Kind.GHOST, 120.0, 44.0)
	back.name = "Back"
	back.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(back)
	var titles := VBoxContainer.new()
	titles.name = "Titles"
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 2)
	head.add_child(titles)
	if eyebrow != "":
		titles.add_child(ModalStyle.eyebrow(eyebrow, false))
	var heading := ModalStyle.label(34, Color.WHITE, text)
	heading.name = "Title"
	heading.add_theme_font_override("font", HudStyle.bold_font())
	heading.add_theme_constant_override("outline_size", 0)
	titles.add_child(heading)
	if subtitle != "":
		var line := ModalStyle.label(17, ModalStyle.MUTED, subtitle)
		line.name = "Subtitle"
		line.add_theme_constant_override("outline_size", 0)
		titles.add_child(line)
	return head


## Um filete horizontal fraco, para separar grupos.
static func divider() -> HSeparator:
	var line := HSeparator.new()
	line.add_theme_constant_override("separation", 10)
	var style := StyleBoxLine.new()
	style.color = Color(1, 1, 1, 0.08)
	style.thickness = 1
	line.add_theme_stylebox_override("separator", style)
	return line


## A entrada de uma tela: aparece do escuro subindo um pouco. Devolve o tween (para soltar a tela de antes no fim).
static func enter(screen: Control, rise: float = RISE) -> Tween:
	screen.modulate.a = 0.0
	var tween: Tween = screen.create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(screen, "modulate:a", 1.0, ENTER_TIME)
	if rise != 0.0 and not reduce_motion:
		var rest: Vector2 = screen.position
		screen.position = rest + Vector2(0, rise)
		tween.tween_property(screen, "position", rest, ENTER_TIME)
	return tween


## Uma janela abrindo: o painel aparece crescendo um tico do meio e subindo, com o som de abrir. Chame com o painel já
## no lugar (depois do layout); `sound` falso para as que abrem sozinhas a toda hora.
static func open_modal(panel: Control, sound: bool = true) -> void:
	if sound:
		UiSounds.play("open")
	if not panel.is_inside_tree():
		return
	panel.modulate.a = 0.0
	var tween: Tween = panel.create_tween().set_parallel().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(panel, "modulate:a", 1.0, ModalStyle.ENTER_TIME).set_trans(Tween.TRANS_CUBIC)
	if reduce_motion:
		return
	panel.pivot_offset = panel.size / 2.0
	panel.scale = Vector2(MODAL_FROM, MODAL_FROM)
	tween.tween_property(panel, "scale", Vector2.ONE, ModalStyle.ENTER_TIME + 0.06)
	var rest: Vector2 = panel.position
	panel.position = rest + Vector2(0, MODAL_RISE)
	tween.tween_property(panel, "position", rest, ModalStyle.ENTER_TIME).set_trans(Tween.TRANS_CUBIC)


## Uma janela fechando: o painel some descendo um tico, e `done` roda no fim (esconder, apagar). `sound`: "close",
## "confirm", "cancel" ou "" (sem som).
static func close_modal(panel: Control, done: Callable = Callable(), sound: String = "close") -> void:
	if sound != "":
		UiSounds.play(sound)
	if not panel.is_inside_tree() or reduce_motion:
		if done.is_valid():
			done.call()
		return
	var rest: Vector2 = panel.position
	var tween: Tween = panel.create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tween.tween_property(panel, "modulate:a", 0.0, ModalStyle.EXIT_TIME)
	tween.tween_property(panel, "position", rest + Vector2(0, MODAL_RISE * 0.6), ModalStyle.EXIT_TIME)
	tween.chain().tween_callback(func() -> void:
		panel.position = rest
		panel.modulate.a = 1.0
		if done.is_valid():
			done.call())
