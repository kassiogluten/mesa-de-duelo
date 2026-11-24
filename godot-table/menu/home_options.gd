# O pé da coluna da tela inicial: Opções (a janela de opções com abas, menu/options_screen.gd), Relatar um problema e
# Meus relatos, como links discretos.
class_name HomeOptions
extends HBoxContainer

signal report
signal my_reports
## O nível de efeitos mudou (a capa liga ou desliga a deriva da arte).
signal effects_changed(level: String)

var _toggle: Button
var _screen: OptionsScreen


func _ready() -> void:
	add_theme_constant_override("separation", 4)
	alignment = BoxContainer.ALIGNMENT_CENTER
	_toggle = HomeStyle.link("Opções")
	_toggle.name = "Options"
	_toggle.icon = HudIcons.texture(HudIcons.GEAR, 32)
	_toggle.add_theme_constant_override("icon_max_width", 16)
	_toggle.add_theme_constant_override("h_separation", 7)
	_toggle.add_theme_color_override("icon_normal_color", HomeStyle.DIM)
	_toggle.add_theme_color_override("icon_hover_color", HudStyle.GOLD_SOFT)
	_toggle.add_theme_color_override("icon_pressed_color", HudStyle.GOLD)
	_toggle.tooltip_text = "Imagem, som, a câmera da partida, os atalhos de teclado, a conta e os relatos."
	_toggle.pressed.connect(toggle)
	add_child(_toggle)
	add_child(_dot())
	var report_link := HomeStyle.link("Relatar um problema")
	report_link.name = "Report"
	report_link.pressed.connect(func() -> void: report.emit())
	add_child(report_link)
	add_child(_dot())
	var mine := HomeStyle.link("Meus relatos")
	mine.name = "MyReports"
	mine.pressed.connect(func() -> void: my_reports.emit())
	add_child(mine)


func _dot() -> Label:
	var dot := ModalStyle.label(15, Color(HomeStyle.DIM, 0.5), "·")
	dot.add_theme_constant_override("outline_size", 0)
	return dot


func is_open() -> bool:
	return _screen != null and is_instance_valid(_screen) and not _screen.is_queued_for_deletion()


## Abre ou fecha a janela das opções.
func toggle() -> void:
	if is_open():
		close()
		return
	_screen = OptionsScreen.new()
	_screen.report.connect(func() -> void: report.emit())
	_screen.my_reports.connect(func() -> void: my_reports.emit())
	_screen.effects_changed.connect(func(level: String) -> void: effects_changed.emit(level))
	add_child(_screen)


func close() -> void:
	if is_open():
		_screen.close()
	_screen = null
