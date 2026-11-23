# MESA_TESTE_PAINEL=1: na primeira declaração de ataque com vários defensores numa partida de verdade, passa pelo painel
# "Atacar quem?" com o mouse do motor (marcar, mirar, escolher, marcar outra, trocar, "Retirar do combate") e salva um
# print de cada passo em MESA_PRINT_PAINEL (o começo do caminho; sem ele, na pasta do usuário). Só para testar.
class_name AttackProbe
extends Node

var screen: MatchScreen
## O teste está andando: o jogar sozinho espera.
var busy: bool = false
var _done: bool = false
var _base: String = ""
var _singles: int = 0
var _single_gen: int = -1


func _ready() -> void:
	_base = OS.get_environment("MESA_PRINT_PAINEL")
	if _base == "":
		_base = OS.get_user_data_dir().path_join("painel")


## O jogar sozinho pergunta antes de cada passo: true enquanto o teste usa a mesa (e começa quando dá).
func claim(state: Dictionary) -> bool:
	if busy:
		return true
	if _done:
		return false
	var attackers: Array = AttackFlow.attackers(state)
	if attackers.is_empty() or AttackFlow.defenders_for(state, int(attackers[0])).size() < 2:
		return false
	# Prefere duas criaturas (para as setas de duas cores); depois de duas declarações com uma só, vai com uma.
	if attackers.size() < 2:
		var gen: int = AttackFlow.gen_of(state)
		if gen != _single_gen:
			_single_gen = gen
			_singles += 1
		if _singles <= 2:
			return false
	busy = true
	_run.call_deferred()
	return true


func _table() -> TableView:
	return screen.get("_table")


func _interaction() -> TableInteraction:
	return screen.get("_interaction")


func _run() -> void:
	var s: Dictionary = screen.current_state()
	var attackers: Array = AttackFlow.attackers(s)
	print("PAINEL: %d atacantes possíveis, %d defensores" % [attackers.size(), AttackFlow.defenders_for(s, int(attackers[0])).size()])
	var first: int = int(attackers[0])
	await _click_card(first)
	await _wait(1.2)
	_shot("1-marcada")
	await _hover_row(1)
	_shot("2-mira")
	await _press_row(1)
	await _wait_state()
	_shot("3-declarada")
	if attackers.size() > 1:
		await _click_card(int(attackers[1]))
		await _wait(1.0)
		await _press_row(0)
		await _wait_state()
		_shot("4-duas-cores")
	await _click_card(first)
	await _wait(1.0)
	_shot("5-retirar-painel")
	await _press_text("Retirar do combate")
	await _wait_state()
	_shot("6-retirada")
	# O defensor escolhido antes: clicar no retrato de um oponente o fixa (aceso no painel); "Limpar seleção" solta.
	var defenders: Array = AttackFlow.all_targets(screen.current_state()).filter(func(t: Dictionary) -> bool: return t["kind"] == "player")
	if not defenders.is_empty():
		var hud: Hud = screen.get("_hud")
		print("PAINEL: clicando no retrato de %d" % int((defenders[-1] as Dictionary)["id"]))
		await _click(hud.portrait_center(int((defenders[-1] as Dictionary)["id"])))
		await _wait(0.8)
		_shot("7-fixado")
		await _press_text("Limpar seleção")
		await _wait(0.6)
		_shot("8-limpo")
	print("PAINEL: fim")
	_done = true
	busy = false


func _shot(name: String) -> void:
	var path: String = "%s-%s.png" % [_base, name]
	get_viewport().get_texture().get_image().save_png(path)
	var panel: AttackPanel = _interaction().attack_panel
	var rows: Array = panel.find_children("*", "Button", true, false).map(func(b: Button) -> String: return Txt.of(b.get_meta("label", b.text)))
	print("PAINEL: print %s (painel %s: %s)" % [path, "à vista" if panel.showing() else "escondido", rows])


func _wait(seconds: float) -> void:
	await get_tree().create_timer(seconds).timeout


## Espera o estado novo do servidor (o gen muda) e as cartas pousarem.
func _wait_state() -> void:
	var before: int = AttackFlow.gen_of(screen.current_state())
	var waited: float = 0.0
	while AttackFlow.gen_of(screen.current_state()) == before and waited < 6.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	await _wait(1.2)


func _click_card(id: int) -> void:
	var node: CardNode = _table().card_node(id)
	if node == null:
		return
	print("PAINEL: clicando na carta %d" % id)
	await _click(_table().camera.unproject_position(node.global_position))


func _rows() -> Array:
	var panel: AttackPanel = _interaction().attack_panel
	return panel.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.has_meta("label"))


func _hover_row(index: int) -> void:
	var rows: Array = _rows()
	if rows.size() > index:
		_mouse(InputEventMouseMotion.new(), (rows[index] as Button).get_global_rect().get_center())
		await _wait(0.6)


func _press_row(index: int) -> void:
	var rows: Array = _rows()
	if rows.size() > index:
		print("PAINEL: escolhendo %s" % (rows[index] as Button).get_meta("label"))
		await _click((rows[index] as Button).get_global_rect().get_center())


func _press_text(text: String) -> void:
	for raw: Variant in _interaction().attack_panel.find_children("*", "Button", true, false):
		if (raw as Button).text == text:
			print("PAINEL: apertando %s" % text)
			await _click((raw as Button).get_global_rect().get_center())
			return
	print("PAINEL: sem o botão %s" % text)


## Move o mouse até o ponto (pixels da mesa), aperta e solta, pelo caminho real do motor.
func _click(at: Vector2) -> void:
	_mouse(InputEventMouseMotion.new(), at)
	await _wait(0.5)
	var press := InputEventMouseButton.new()
	press.pressed = true
	_mouse(press, at)
	await _wait(0.08)
	_mouse(InputEventMouseButton.new(), at)
	await _wait(0.1)


func _mouse(event: InputEventMouse, at: Vector2) -> void:
	var window: Vector2 = get_viewport().get_final_transform() * at
	if event is InputEventMouseButton:
		(event as InputEventMouseButton).button_index = MOUSE_BUTTON_LEFT
	event.position = window
	event.global_position = window
	Input.parse_input_event(event)
