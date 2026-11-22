# Raiz do jogo (a cena que o boot abre depois de carregar o pacote): confirma a versão e alterna entre o início e a partida.
extends Node

const UpdateState := preload("res://boot/update_state.gd")
## Tempo aberta sem erro para o atualizador dar a versão por boa.
const CONFIRM_AFTER_S := 2.0

var _screen: Node
var _perf: PerfMeter


func _ready() -> void:
	var version: String = UpdateState.current_version()
	get_tree().create_timer(CONFIRM_AFTER_S).timeout.connect(UpdateState.confirm)
	print("Mesa aberta (%s)." % ("Versão %s" % version if version != "" else "Versão de desenvolvimento"))
	var layer := CanvasLayer.new()
	layer.layer = 50
	add_child(layer)
	_perf = PerfMeter.new()
	layer.add_child(_perf)
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
			print(_perf.summary())
			get_tree().quit())


func _show_menu() -> void:
	var menu := MenuScreen.new()
	var version: String = UpdateState.current_version()
	menu.version_text = "Versão %s" % version if version != "" else "Versão de desenvolvimento"
	menu.play.connect(_start_match)
	menu.lab.connect(_open_lab)
	_swap(menu)


func _open_lab() -> void:
	var lab := EffectsLab.new()
	lab.finished.connect(_show_menu)
	_swap(lab)


func _start_match(start_message: Dictionary) -> void:
	var match_screen := MatchScreen.new()
	match_screen.start_message = start_message
	match_screen.finished.connect(_show_menu)
	_swap(match_screen)


func _swap(screen: Node) -> void:
	if _screen:
		_screen.queue_free()
	_screen = screen
	add_child(screen)
