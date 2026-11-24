# Janela "Meus relatos": os relatos enviados deste computador (e, com a conta, de qualquer aparelho), com o andamento e a resposta.
class_name MyReportsPanel
extends Control

const WIDTH := 620.0
const STATUS_TONE := {"recebido": ModalStyle.MUTED, "analise": ModalStyle.BLUE, "resolvido": ModalStyle.GOOD, "encerrado": ModalStyle.FAINT}

## Quem consulta o servidor (main.gd põe o da mesa).
var client: ReportClient

var _box: PanelContainer
var _status: Label
var _list: VBoxContainer
var _scroll: ScrollContainer
## Cada abertura tem um número: uma consulta antiga que volta depois não troca a lista.
var _ticket: int = 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	add_child(ModalBackdrop.new())
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	_box = PanelContainer.new()
	_box.add_theme_stylebox_override("panel", ModalStyle.panel_style())
	center.add_child(_box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.custom_minimum_size = Vector2(WIDTH, 0)
	_box.add_child(column)
	column.add_child(ModalStyle.title("Meus relatos", 28))
	_status = ModalStyle.wrap(15, ModalStyle.MUTED, "", WIDTH)
	column.add_child(_status)
	_scroll = ScrollContainer.new()
	_scroll.custom_minimum_size = Vector2(WIDTH, 380)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 10)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	var close_button := ModalStyle.button("Fechar", ModalStyle.Kind.PRIMARY, 160, 46)
	close_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	close_button.pressed.connect(close)
	column.add_child(close_button)


## Abre com o que está guardado e consulta o servidor.
func open() -> void:
	_ticket += 1
	var ticket: int = _ticket
	visible = true
	move_to_front()
	var backdrop: ModalBackdrop = get_node("Backdrop")
	backdrop.amount = 0.0
	backdrop.fade(1.0, 0.24)
	show_reports(MyReports.offline_view(MyReports.saved()), "Consultando o servidor…")
	if client == null:
		return
	var token: String = AccountSession.token()
	var result: Dictionary = await client.refresh(token)
	if ticket != _ticket or not is_inside_tree():
		return
	show_reports(result["reports"], "Sem conexão com o servidor: a lista mostra o que ficou guardado neste computador." if bool(result["offline"]) else "")


func close() -> void:
	_ticket += 1
	(get_node("Backdrop") as ModalBackdrop).fade(0.0, ModalStyle.EXIT_TIME)
	visible = false


## Mostra a lista (do mais novo ao mais antigo) e uma linha de situação.
func show_reports(reports: Array, note: String) -> void:
	for child: Node in _list.get_children():
		child.queue_free()
		_list.remove_child(child)
	if reports.is_empty() and note == "":
		note = "Nenhum relato enviado %s ainda. Use Relatar um problema na tela inicial ou no menu da partida." % ("pela sua conta nem deste computador" if AccountSession.signed_in() else "deste computador")
	_status.text = note
	_status.visible = note != ""
	for report: Dictionary in reports:
		_list.add_child(_row(report))


func _row(report: Dictionary) -> PanelContainer:
	var card := PanelContainer.new()
	var style := ModalStyle.box(Color(1, 1, 1, 0.04), 12, Color(1, 1, 1, 0.1), 1)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 10
	style.content_margin_bottom = 12
	card.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	card.add_child(column)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	top.add_child(ModalStyle.label(16, ModalStyle.GOLD_LIGHT, Txt.of(report.get("code"))))
	top.add_child(ModalStyle.label(14, ModalStyle.MUTED, "Algo deu errado" if Txt.of(report.get("kind")) == "erro" else "Sugestão"))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	var status: String = Txt.of(report.get("status"))
	if status != "":
		top.add_child(_pill(Txt.of(MyReports.STATUS_LABEL.get(status, "Recebido")), STATUS_TONE.get(status, ModalStyle.MUTED)))
	top.add_child(ModalStyle.label(14, ModalStyle.FAINT, _date(int(report.get("at", 0)))))
	column.add_child(top)
	column.add_child(ModalStyle.wrap(15, ModalStyle.INK, Txt.of(report.get("summary")), WIDTH - 60, false))
	if Txt.of(report.get("reply")) != "":
		var reply := PanelContainer.new()
		var reply_style := ModalStyle.box(Color(ModalStyle.GOLD, 0.08), 8, Color(ModalStyle.GOLD, 0.3), 1)
		reply_style.content_margin_left = 12
		reply_style.content_margin_right = 12
		reply_style.content_margin_top = 8
		reply_style.content_margin_bottom = 8
		reply.add_theme_stylebox_override("panel", reply_style)
		reply.add_child(ModalStyle.wrap(15, ModalStyle.INK, "Resposta: %s" % Txt.of(report["reply"]), WIDTH - 84, false))
		column.add_child(reply)
	return card


static func _pill(text: String, tone: Color) -> PanelContainer:
	var pill := PanelContainer.new()
	var style := ModalStyle.box(Color(tone, 0.14), ModalStyle.RADIUS, Color(tone, 0.5), 1)
	style.content_margin_left = 10
	style.content_margin_right = 10
	pill.add_theme_stylebox_override("panel", style)
	var label := ModalStyle.label(13, tone, text)
	label.add_theme_constant_override("outline_size", 0)
	pill.add_child(label)
	return pill


## "23/11 14:02", na hora do computador.
static func _date(ms: int) -> String:
	if ms <= 0:
		return ""
	var local: int = ms / 1000 + int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var d: Dictionary = Time.get_datetime_dict_from_unix_time(local)
	return "%02d/%02d %02d:%02d" % [int(d["day"]), int(d["month"]), int(d["hour"]), int(d["minute"])]


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()


func _unhandled_input(event: InputEvent) -> void:
	if visible and event is InputEventKey:
		get_viewport().set_input_as_handled()
