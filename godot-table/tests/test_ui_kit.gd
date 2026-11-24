# Testes do kit da interface na direção Nítido (ui/ui_theme.gd, ui/ui_kit.gd), dos sons da interface (ui/ui_sounds.gd) e
# das Opções em abas (menu/options_screen.gd).
extends "res://tests/test_case.gd"


func _root() -> Window:
	return (Engine.get_main_loop() as SceneTree).root


func test_theme_gives_every_field_the_nitido_look() -> void:
	UiTheme.install()
	var field := LineEdit.new()
	_root().add_child(field)
	var box: StyleBoxFlat = field.get_theme_stylebox("normal") as StyleBoxFlat
	check(box != null, "o campo de texto usa a caixa do tema")
	if box:
		check_eq(box.corner_radius_top_left, ModalStyle.RADIUS, "com os cantos quase retos")
	var focus: StyleBoxFlat = field.get_theme_stylebox("focus") as StyleBoxFlat
	check(focus != null and focus.border_color.is_equal_approx(Color(ModalStyle.GOLD, 0.85)), "com o foco, o filete dourado")
	var tick := CheckBox.new()
	_root().add_child(tick)
	check(tick.get_theme_icon("checked") != null, "a caixa de marcar tem o quadrado desenhado")
	field.queue_free()
	tick.queue_free()


func test_stepper_walks_the_values_without_wrapping() -> void:
	var seen: Array = []
	var row: HBoxContainer = UiKit.stepper([["a", "Um"], ["b", "Dois"], ["c", "Três"]], "b", func(value: String) -> void: seen.append(value))
	var value: Label = row.get_node("Value")
	var next: Button = row.get_node("Next")
	var previous: Button = row.get_node("Previous")
	check_eq(value.text, "Dois", "começa no valor guardado")
	next.pressed.emit()
	check_eq(value.text, "Três", "a seta da direita passa para o próximo")
	check(next.disabled, "no último, a seta da direita apaga")
	next.pressed.emit()
	previous.pressed.emit()
	previous.pressed.emit()
	check_eq(seen, ["c", "b", "a"], "cada passo avisa o valor, sem dar a volta")
	check(previous.disabled, "no primeiro, a da esquerda apaga")
	row.free()


func test_side_tabs_and_segmented_mark_only_one() -> void:
	var picked: Array = []
	var tabs: VBoxContainer = UiKit.side_tabs([["x", "X"], ["y", "Y"]], "x", func(key: String) -> void: picked.append(key))
	(tabs.get_node("Tab_y") as Button).pressed.emit()
	check_eq(picked, ["y"], "a aba escolhida avisa")
	check(bool(tabs.get_node("Tab_y").get_meta("chosen")) and not bool(tabs.get_node("Tab_x").get_meta("chosen")), "só ela fica marcada")
	var row: HBoxContainer = UiKit.segmented([["p", "P"], ["q", "Q"]], "p", func(_v: String) -> void: pass)
	(row.get_node("Option_q") as Button).pressed.emit()
	check(bool(row.get_node("Option_q").get_meta("chosen")) and not bool(row.get_node("Option_p").get_meta("chosen")), "escolhas lado a lado: só uma marcada")
	tabs.free()
	row.free()


func test_ui_sounds_are_short_tones() -> void:
	for kind: String in UiSounds.SHAPES:
		var stream: AudioStreamWAV = UiSounds.stream(kind)
		var shape: Array = UiSounds.SHAPES[kind]
		check_eq(stream.data.size(), int(UiSounds.RATE * float(shape[2])) * int(shape[4]) * 2, "%s: 16 bits, o tamanho certo" % kind)
		check(stream.get_length() < 0.2, "%s: curto" % kind)
	UiSounds.play("nenhum")
	check(true, "som desconhecido não quebra")


func test_options_screen_has_every_tab() -> void:
	var screen := OptionsScreen.new()
	_root().add_child(screen)
	check(screen.find_child("Effects", true, false) != null, "Imagem: a qualidade dos efeitos com setas")
	check(screen.find_child("OwnArt", true, false) is CheckBox, "Imagem: Cartas da mesa")
	screen.show_tab("som")
	check(screen.find_child("Volume", true, false) != null, "Som: o volume")
	check(screen.find_child("UiSounds", true, false) is CheckBox, "Som: os sons da interface")
	screen.show_tab("mesa")
	check(screen.find_child("CameraAngle", true, false) != null, "Mesa: o ângulo da câmera")
	screen.show_tab("teclado")
	check(screen.find_child("Body", true, false).get_child_count() >= 2, "Teclado: a lista dos atalhos")
	screen.show_tab("conta")
	check(screen.find_child("Report", true, false) is Button, "Conta e relatos: Relatar um problema")
	screen.queue_free()
