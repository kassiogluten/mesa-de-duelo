# A versão da mesa no canto de baixo da tela inicial, com o botão de atualizar: "Atualizar para X" quando há versão nova,
# "Procurar atualização" quando não há (confere na hora e diz se a mesa está em dia).
class_name VersionBadge
extends HBoxContainer

## Atualizar agora (a mesa reinicia e baixa a versão nova na abertura).
signal update_pressed
## A versão nova precisa ser baixada no site (outro motor ou outro boot).
signal download_pressed(url: String)
## Procurar atualização agora.
signal check_pressed

const UpdateState := preload("res://boot/update_state.gd")
const REFRESH := "<path d=\"M20 12a8 8 0 1 1-2.3-5.7L20 8.5\"/><path d=\"M20 4v4.5h-4.5\"/>"
const DOWNLOAD := "<path d=\"M12 4v11M7 10.5l5 5 5-5M5 20h14\"/>"
## Quanto tempo o "A mesa está em dia" fica antes de voltar ao Procurar atualização.
const RESULT_S := 5.0

var version_text: String = ""
## A mesa tem atualizador (instalada pelo zip); rodando do projeto, só a versão aparece.
var updater: bool = UpdateState.current_version() != ""

var _label: Label
var _status: Label
var _button: Button
## A versão nova encontrada ({version, reinstall, download}), ou {}.
var _update: Dictionary = {}
var _checking: bool = false
var _status_timer: SceneTreeTimer


func _ready() -> void:
	add_theme_constant_override("separation", 14)
	alignment = BoxContainer.ALIGNMENT_END
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_status = ModalStyle.label(15, ModalStyle.MUTED)
	_status.add_theme_constant_override("outline_size", 0)
	_status.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_status.visible = false
	add_child(_status)
	_label = ModalStyle.label(15, Color(1, 1, 1, 0.35), version_text)
	_label.add_theme_constant_override("outline_size", 0)
	_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(_label)
	_button = ModalStyle.button("", ModalStyle.Kind.GHOST, 0, 36)
	_button.name = "Update"
	_button.add_theme_constant_override("icon_max_width", 18)
	_button.add_theme_constant_override("h_separation", 8)
	_button.pressed.connect(_on_pressed)
	_button.visible = updater
	add_child(_button)
	set_update(UpdateCheck.pending)


## A versão nova ({version, reinstall, download}) ou {} quando não há: troca o botão entre Atualizar e Procurar atualização.
func set_update(update: Dictionary) -> void:
	_update = update
	if not is_node_ready():
		return
	_paint()


## Uma conferência terminou ("nova", "em_dia" ou "falhou"): diz o resultado ao lado da versão, por alguns segundos.
func show_result(result: String) -> void:
	_checking = false
	if not is_node_ready():
		return
	match result:
		"em_dia":
			_flash("A mesa está em dia.", ModalStyle.GOOD)
		"falhou":
			_flash("Não deu para procurar agora. Confira a internet.", ModalStyle.WARN)
		_:
			_status.visible = false
	_paint()


func _on_pressed() -> void:
	if _update.is_empty():
		if _checking:
			return
		_checking = true
		_status.visible = false
		_paint()
		check_pressed.emit()
	elif bool(_update.get("reinstall", false)):
		download_pressed.emit(Txt.of(_update.get("download")))
	else:
		_button.disabled = true
		_button.text = "Reiniciando…"
		update_pressed.emit()


func _paint() -> void:
	_button.visible = updater
	_button.disabled = false
	if _update.is_empty():
		_style(ModalStyle.Kind.GHOST)
		_button.text = "Procurando…" if _checking else "Procurar atualização"
		_button.disabled = _checking
		_button.icon = HudIcons.texture(REFRESH, 36)
		_button.tooltip_text = "Confere agora se saiu uma versão nova da mesa."
		return
	_style(ModalStyle.Kind.PRIMARY)
	var number: String = UpdateState.display_version(Txt.of(_update.get("version")))
	if bool(_update.get("reinstall", false)):
		_button.text = "Baixar a versão %s no site" % number
		_button.icon = HudIcons.texture(DOWNLOAD, 36)
		_button.visible = updater and Txt.of(_update.get("download")) != ""
		_button.tooltip_text = "Esta versão precisa ser baixada de novo no site."
	else:
		_button.text = "Atualizar para %s" % number
		_button.icon = HudIcons.texture(REFRESH, 36)
		_button.tooltip_text = "A mesa fecha e abre de novo, já com a versão nova."


## Pinta o botão no estilo e o ícone na cor do texto (o ícone branco some no dourado).
func _style(kind: int) -> void:
	ModalStyle.style_button(_button, kind)
	var ink: Color = _button.get_theme_color("font_color")
	for slot: String in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color"]:
		_button.add_theme_color_override(slot, ink)
	_button.add_theme_color_override("icon_disabled_color", _button.get_theme_color("font_disabled_color"))


func _flash(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
	_status.visible = true
	var timer: SceneTreeTimer = get_tree().create_timer(RESULT_S)
	_status_timer = timer
	timer.timeout.connect(func() -> void:
		if _status_timer == timer:
			_status.visible = false)
