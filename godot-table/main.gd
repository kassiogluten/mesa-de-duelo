# Raiz do jogo (a cena que o boot abre depois de carregar o pacote): confirma a versão e alterna entre o início e a partida.
extends Node

const UpdateState := preload("res://boot/update_state.gd")
## Tempo aberta sem erro para o atualizador dar a versão por boa.
const CONFIRM_AFTER_S := 2.0

var _screen: Node
var _perf: PerfMeter
## Por cima de todas as telas: relato, Meus relatos, aviso de versão e a tela de atualização necessária.
var _overlay: CanvasLayer
var _reports: ReportClient
var _report: ReportDialog
var _my_reports: MyReportsPanel
var _toasts: ToastStack
var _updates: UpdateCheck
var _update_notice: UpdateNotice
var _outdated: OutdatedScreen


func _ready() -> void:
	ClientLog.install()
	var version: String = UpdateState.current_version()
	get_tree().create_timer(CONFIRM_AFTER_S).timeout.connect(UpdateState.confirm)
	print("Mesa aberta (%s)." % ("Versão %s" % version if version != "" else "Versão de desenvolvimento"))
	var layer := CanvasLayer.new()
	layer.layer = 50
	add_child(layer)
	_perf = PerfMeter.new()
	layer.add_child(_perf)
	_build_overlay()
	_show_menu()
	# MESA_PARTIDA_DIRETO=1 pula a tela inicial (para testar a mesa direto).
	if OS.get_environment("MESA_PARTIDA_DIRETO") == "1":
		(_screen as MenuScreen).call("_on_play")
	# MESA_LAB=<botão> abre o laboratório de efeitos e aperta o botão (para conferir um efeito): MESA_LAB=Destruída.
	if OS.get_environment("MESA_LAB") != "":
		_open_lab()
		var button_name: String = OS.get_environment("MESA_LAB")
		get_tree().create_timer(2.5).timeout.connect(func() -> void: (_screen as EffectsLab).press(button_name))
	# MESA_SAIR_APOS=<segundos> fecha a mesa sozinho (para testes sem janela, onde não há print).
	if OS.get_environment("MESA_SAIR_APOS") != "":
		get_tree().create_timer(float(OS.get_environment("MESA_SAIR_APOS"))).timeout.connect(func() -> void:
			print(_perf.summary())
			get_tree().quit())
	# MESA_PRINT=<arquivo.png> (e MESA_PRINT_APOS=<segundos>) salva um print da janela e fecha: para conferir o visual.
	var shot: String = OS.get_environment("MESA_PRINT")
	if shot != "":
		var wait: float = float(OS.get_environment("MESA_PRINT_APOS")) if OS.get_environment("MESA_PRINT_APOS") != "" else 8.0
		get_tree().create_timer(wait).timeout.connect(func() -> void:
			get_viewport().get_texture().get_image().save_png(shot)
			# MESA_DUMP=<arquivo.json>: guarda também o estado da partida desse momento (para abrir na mesa do navegador).
			if OS.get_environment("MESA_DUMP") != "" and _screen is MatchScreen:
				var file: FileAccess = FileAccess.open(OS.get_environment("MESA_DUMP"), FileAccess.WRITE)
				file.store_string(JSON.stringify((_screen as MatchScreen).current_state()))
			print(_perf.summary())
			get_tree().quit())


func _build_overlay() -> void:
	_overlay = CanvasLayer.new()
	_overlay.layer = 60
	add_child(_overlay)
	_reports = ReportClient.new()
	_overlay.add_child(_reports)
	_toasts = ToastStack.new()
	_overlay.add_child(_toasts)
	_update_notice = UpdateNotice.new()
	_overlay.add_child(_update_notice)
	_update_notice.restart_pressed.connect(func() -> void: UpdateCheck.relaunch(get_tree()))
	_update_notice.download_pressed.connect(func(url: String) -> void: OS.shell_open(url))
	_my_reports = MyReportsPanel.new()
	_my_reports.client = _reports
	_overlay.add_child(_my_reports)
	_report = ReportDialog.new()
	_report.client = _reports
	_overlay.add_child(_report)
	_report.sent.connect(func(code: String) -> void: _toasts.show_toast("Relato %s enviado. Obrigado!" % code, "success"))
	_report.my_reports_requested.connect(_my_reports.open)
	_outdated = OutdatedScreen.new()
	_overlay.add_child(_outdated)
	_outdated.update_pressed.connect(func() -> void: UpdateCheck.relaunch(get_tree()))
	_outdated.back_pressed.connect(func() -> void:
		_outdated.visible = false
		_show_menu())
	_updates = UpdateCheck.new()
	add_child(_updates)
	_updates.available.connect(func(version: String, reinstall: bool, download: String) -> void:
		_update_notice.set_update(version, reinstall, download)
		_update_notice.show_if_pending(_screen is MenuScreen))


func _show_menu() -> void:
	var menu := MenuScreen.new()
	var version: String = UpdateState.current_version()
	menu.version_text = "Versão %s" % version if version != "" else "Versão de desenvolvimento"
	menu.play.connect(_start_match)
	menu.lab.connect(_open_lab)
	# Da tela inicial, o relato leva a última partida desta abertura da mesa, se houve uma.
	menu.report.connect(func() -> void: _report.open({"from": "inicio", "recorder": MatchRecorder.last, "session": MatchRecorder.last.session if MatchRecorder.last else {}}))
	menu.my_reports.connect(_my_reports.open)
	_swap(menu)
	_updates.check_now()


func _open_lab() -> void:
	var lab := EffectsLab.new()
	lab.finished.connect(_show_menu)
	_swap(lab)


func _start_match(start_message: Dictionary) -> void:
	var match_screen := MatchScreen.new()
	match_screen.start_message = start_message
	match_screen.finished.connect(_show_menu)
	match_screen.report_requested.connect(_report.open)
	match_screen.outdated.connect(_outdated.open)
	_swap(match_screen)


func _swap(screen: Node) -> void:
	if _screen:
		_screen.queue_free()
	_screen = screen
	add_child(screen)
	# As janelas por cima recebem as teclas antes da tela (a ordem da árvore decide quem vê primeiro).
	move_child(_overlay, -1)
	_update_notice.show_if_pending(screen is MenuScreen)
