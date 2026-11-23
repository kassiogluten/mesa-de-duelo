# O cabeçalho do painel da pilha: "Pilha" com "N itens" (o número salta quando muda), o nome do topo quando a pilha está
# recolhida, o botão da galeria em tela cheia e o de recolher/expandir.
class_name StackHeader
extends PanelContainer

signal gallery_pressed
signal toggle_pressed

var _count_bg: PanelContainer
var _count: Label
var _top_name: Label
var _toggle: Button
var _title: Label
var _spacer: Control


func _init() -> void:
	var style := StackPanel._style(Color(0.05, 0.07, 0.12, 0.94), 22, 14, 1)
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 8
	add_theme_stylebox_override("panel", style)
	# Segura o clique (não vaza para a carta da mesa atrás).
	mouse_filter = Control.MOUSE_FILTER_STOP
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(head)
	_title = Hud._label(22, Color(1, 0.97, 0.9))
	_title.text = "Pilha"
	head.add_child(_title)
	_count = Hud._label(16, Color(0.12, 0.08, 0.02))
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_count.custom_minimum_size = Vector2(30, 30)
	_count.add_theme_constant_override("outline_size", 0)
	_count_bg = PanelContainer.new()
	_count_bg.add_theme_stylebox_override("panel", StackPanel._style(StackStyle.GOLD, 15, 9, 0))
	_count_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_count_bg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_count_bg.add_child(_count)
	head.add_child(_count_bg)
	# Recolhida: o nome do topo ao lado do número, na cor do item.
	_top_name = Hud._label(14, Color(1, 1, 1, 0.85))
	_top_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_top_name.clip_text = true
	_top_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_top_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_top_name.size_flags_vertical = Control.SIZE_FILL
	head.add_child(_top_name)
	_spacer = Control.new()
	_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(_spacer)
	var open := _button("Ver a pilha inteira, em tela cheia (clicar na carta também abre)")
	open.icon = HudIcons.texture(StackStyle.GALLERY_ICON, 40, 1.8)
	open.expand_icon = true
	open.add_theme_constant_override("icon_max_width", 20)
	open.pressed.connect(func() -> void: gallery_pressed.emit())
	head.add_child(open)
	_toggle = _button("")
	_toggle.add_theme_font_size_override("font_size", 20)
	_toggle.pressed.connect(func() -> void: toggle_pressed.emit())
	head.add_child(_toggle)


## "1 item", "3 itens": o número do cabeçalho.
static func count_label(count: int) -> String:
	return "1 item" if count == 1 else "%d itens" % count


## Pinta para a pilha: quantos itens (com um salto se mudou e `animate`), a cor do topo e o nome dele quando recolhida.
func paint(count: int, top_name: String, color: Color, trigger: bool, collapsed: bool, animate: bool) -> void:
	var text: String = count_label(count)
	if _count.text != text and animate:
		ModalStyle.pop(_count_bg, 1.4)
	_count.text = text
	(_count_bg.get_theme_stylebox("panel") as StyleBoxFlat).bg_color = StackStyle.GOLD if trigger else color.lerp(StackStyle.GOLD, 0.35).lightened(0.15)
	_toggle.text = "+" if collapsed else "−"
	_toggle.tooltip_text = "Expandir a pilha" if collapsed else "Recolher a pilha para ver o campo"
	_top_name.text = top_name
	_top_name.add_theme_color_override("font_color", color.lightened(0.45))
	_top_name.visible = collapsed
	# Recolhida, a pílula é estreita: o número já diz que é a pilha, e o nome do topo fica no lugar do título.
	_title.visible = not collapsed
	_spacer.visible = not collapsed


## O texto do número ("3 itens"), para os testes.
func count_text() -> String:
	return _count.text


func top_name_shown() -> bool:
	return _top_name.visible


func _button(tip: String) -> Button:
	var button := Button.new()
	button.custom_minimum_size = Vector2(34, 30)
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.tooltip_text = tip
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_color_override("font_color", Color(1, 1, 1, 0.8))
	button.add_theme_color_override("icon_normal_color", Color(1, 1, 1, 0.75))
	button.add_theme_color_override("icon_hover_color", StackStyle.GOLD.lightened(0.3))
	return button
