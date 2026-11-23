# Aviso discreto de versão nova na tela inicial: uma faixa embaixo, com "Reiniciar agora" (ou "Baixar no site" quando precisa baixar o zip de novo).
class_name UpdateNotice
extends PanelContainer

signal restart_pressed
signal download_pressed(url: String)

var _text: Label
var _restart: Button
var _later: Button
var _download_url: String = ""
## O jogador fechou o aviso desta versão: não volta até sair outra.
var _dismissed: String = ""
var _version: String = ""


func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	var style := ModalStyle.box(Color(0.055, 0.088, 0.155, 0.95), 14, Color(ModalStyle.GOLD, 0.45), 1)
	style.content_margin_left = 18
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 18
	add_theme_stylebox_override("panel", style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	add_child(row)
	_text = ModalStyle.label(16, ModalStyle.INK)
	_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_text)
	_restart = ModalStyle.button("Reiniciar agora", ModalStyle.Kind.PRIMARY, 0, 38)
	_restart.pressed.connect(func() -> void:
		if _download_url != "":
			download_pressed.emit(_download_url)
		else:
			restart_pressed.emit())
	row.add_child(_restart)
	_later = ModalStyle.button("Depois", ModalStyle.Kind.GHOST, 0, 38)
	_later.pressed.connect(func() -> void:
		_dismissed = _version
		visible = false)
	row.add_child(_later)


## Prepara o aviso da versão; `reinstall` troca o botão por "Baixar no site".
func set_update(version: String, reinstall: bool, download: String) -> void:
	_version = version
	_download_url = download if reinstall else ""
	if reinstall:
		_text.text = "A versão nova da mesa precisa ser baixada de novo no site."
		_restart.text = "Baixar no site"
		_restart.visible = download != ""
	else:
		_text.text = "Nova versão disponível. Ela entra na próxima vez que você abrir a mesa."
		_restart.text = "Reiniciar agora"
		_restart.visible = true


## Mostra (na tela inicial) ou esconde (na partida: o aviso nunca interrompe uma partida).
func show_if_pending(on_menu: bool) -> void:
	var was: bool = visible
	visible = on_menu and _version != "" and _dismissed != _version
	if visible:
		reset_size()
		set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_MINSIZE, 22)
	if visible and not was:
		modulate.a = 0.0
		create_tween().tween_property(self, "modulate:a", 1.0, 0.3)
