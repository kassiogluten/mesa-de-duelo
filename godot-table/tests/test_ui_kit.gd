# Testes das peças da direção "Angular" (ui/ui_kit.gd e ui/cut_box.gd): cortes da caixa, estados dos botões, as letras
# em versalete e os modais (ModalStyle) usando o kit.
extends "res://tests/test_case.gd"


func test_cut_box_cuts_only_the_corners_asked() -> void:
	var box := CutBox.new()
	box.cuts = PackedFloat32Array([10.0, 0.0, 10.0, 0.0])
	var points: PackedVector2Array = box.shape(Rect2(0, 0, 100, 40))
	check_eq(points.size(), 6, "dois cantos cortados: seis pontas")
	check(points.has(Vector2(10, 0)) and points.has(Vector2(0, 10)), "corte em cima, à esquerda")
	check(points.has(Vector2(100, 0)), "canto de cima, à direita, reto")
	box.cuts = PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
	check_eq(box.shape(Rect2(0, 0, 100, 40)).size(), 4, "sem cortes: retângulo")
	box.cuts = PackedFloat32Array([80.0, 0.0, 0.0, 0.0])
	check(box.shape(Rect2(0, 0, 100, 40)).has(Vector2(20, 0)), "o corte não passa da metade da caixa")


func test_buttons_have_every_state() -> void:
	for kind: UiKit.Kind in [UiKit.Kind.PRIMARY, UiKit.Kind.SECONDARY, UiKit.Kind.DANGER, UiKit.Kind.GHOST]:
		var button: Button = UiKit.button("Jogar online", kind)
		check_eq(button.text, "Jogar online", "o texto fica como veio: a caixa alta vem da letra")
		for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
			check(button.get_theme_stylebox(state_name) is CutBox, "%d: caixa do estado %s" % [kind, state_name])
		button.free()
	var focus: CutBox = UiKit.button_box(UiKit.Kind.PRIMARY, "focus")
	check(focus.fill.a == 0.0 and focus.border.a > 0.5, "o foco é só um contorno, diferente do mouse em cima")
	check(UiKit.button_box(UiKit.Kind.PRIMARY, "hover").glow_size > 0.0, "mouse em cima brilha")
	check_eq(UiKit.button_box(UiKit.Kind.GHOST, "hover").glow_size, 0.0, "o discreto não brilha por dentro")


func test_fonts_load_in_small_caps() -> void:
	var face: FontVariation = UiKit.button_font()
	check(face.base_font != null, "letra dos botões")
	check((UiKit.title_font() as FontVariation).base_font != null, "letra dos títulos")
	var smcp: int = TextServerManager.get_primary_interface().name_to_tag("smcp")
	check(face.opentype_features.has(smcp), "versalete: o texto trocado depois também sai em caixa alta")


func test_size_grows_once() -> void:
	var button: Button = ModalStyle.button("Atualizar", ModalStyle.Kind.SECONDARY, 0, 48)
	check_eq(button.get_theme_font_size("font_size"), UiKit.caps_size(18), "o tamanho pedido vira o da maiúscula")
	ModalStyle.style_button(button, ModalStyle.Kind.PRIMARY)
	check_eq(button.get_theme_font_size("font_size"), UiKit.caps_size(18), "pintar de novo não cresce outra vez")
	button.free()


func test_modals_use_the_kit() -> void:
	check(ModalStyle.panel_style() is CutBox, "painel das janelas")
	var heading: HBoxContainer = ModalStyle.title("Sala de espera {W}")
	check(heading.get_node("Title") is RichTextLabel, "o título continua aceitando os símbolos de mana")
	heading.free()
	var danger: Button = ModalStyle.button("Conceder", ModalStyle.Kind.DANGER)
	check_eq((danger.get_theme_stylebox("normal") as CutBox).fill, UiKit.DANGER_FILL, "perigoso no vinho do kit")
	danger.free()
