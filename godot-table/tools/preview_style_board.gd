# Prancha do kit da direção "Angular" (roadmap 150, ui/ui_kit.gd): um modal, os botões em cada tipo e estado (com o
# foco do teclado) e a coluna da tela inicial, para conferir uma peça nova ou um ajuste antes de olhar as telas.
# npm run godot -- --resolution 1920x1080 --script res://tools/preview_style_board.gd -- <saída.png> [escala]
extends SceneTree

const BASE := Vector2(1920, 1080)


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if not args.is_empty() else "user://prancha-estilo.png"
	var scale: float = float(args[1]) if args.size() > 1 else 1.0
	var viewport := SubViewport.new()
	viewport.size = Vector2i(BASE * scale)
	viewport.size_2d_override = Vector2i(BASE)
	viewport.size_2d_override_stretch = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var board := Control.new()
	board.size = BASE
	viewport.add_child(board)
	var fill := ColorRect.new()
	fill.color = HomeStyle.BG
	fill.size = BASE
	board.add_child(fill)
	var side: Control = _side("Kit · Angular")
	side.size = BASE
	board.add_child(side)
	for i: int in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = viewport.get_texture().get_image()
	image.save_png(out)
	print("print: %s (%dx%d)" % [out, image.get_width(), image.get_height()])
	quit()


func _side(heading: String) -> Control:
	var side := MarginContainer.new()
	side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side.add_theme_constant_override("margin_top", 36)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 40)
	side.add_child(column)
	var tag := ModalStyle.label(15, Color(1, 1, 1, 0.55), heading.to_upper())
	tag.add_theme_font_override("font", HomeStyle.caps_font())
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(tag)
	column.add_child(_modal())
	column.add_child(_states())
	column.add_child(_home())
	return side


func _modal() -> Control:
	var box := PanelContainer.new()
	box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	box.add_theme_stylebox_override("panel", UiKit.panel())
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.custom_minimum_size = Vector2(500, 0)
	box.add_child(column)
	column.add_child(UiKit.title("Atualização necessária"))
	column.add_child(ModalStyle.wrap(18, ModalStyle.INK, "A mesa precisa ser atualizada para conversar com o servidor.", 500, false))
	column.add_child(ModalStyle.wrap(15, ModalStyle.MUTED, "Ela fecha e abre de novo, já com a versão nova. Leva poucos segundos.", 500, false))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 12)
	row.add_child(_button("Voltar", 1, 150, 48))
	row.add_child(_button("Atualizar agora", 0, 220, 48))
	column.add_child(row)
	return box


## Os estados de botão: parado, mouse em cima, apertado, desligado e o foco do teclado (só um botão o tem), nos quatro tipos.
func _states() -> Control:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 14)
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	for spec: Array in [
		["Principal", 0, "normal"], ["Mouse em cima", 0, "hover"], ["Apertado", 0, "pressed"], ["Desligado", 0, "disabled"],
		["Secundário", 1, "normal"], ["Mouse em cima", 1, "hover"], ["Apertado", 1, "pressed"], ["Teclado", 1, "focus"],
		["Conceder", 2, "normal"], ["Mouse em cima", 2, "hover"], ["Discreto", 3, "normal"], ["Mouse em cima", 3, "hover"],
	]:
		var button: Button = _button(String(spec[0]), int(spec[1]), 196, 44)
		var state_name: String = spec[2]
		if state_name == "disabled":
			button.disabled = true
		elif state_name == "focus":
			button.focus_mode = Control.FOCUS_ALL
			button.ready.connect(button.grab_focus)
		elif state_name != "normal":
			button.add_theme_stylebox_override("normal", button.get_theme_stylebox(state_name))
		grid.add_child(button)
	return grid


func _home() -> Control:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	column.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.custom_minimum_size = Vector2(540, 0)
	column.add_child(_button("Jogar contra o computador", 0, 540, 60))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	for text: String in ["Jogar online", "Meus decks"]:
		row.add_child(_button(text, 1, 264, 56))
	column.add_child(row)
	return column


## Um botão do kit: 0 principal, 1 secundário, 2 perigoso, 3 discreto.
static func _button(text: String, kind: int, width: float, height: float) -> Button:
	return UiKit.button(text, ([UiKit.Kind.PRIMARY, UiKit.Kind.SECONDARY, UiKit.Kind.DANGER, UiKit.Kind.GHOST] as Array)[kind], width, height)
