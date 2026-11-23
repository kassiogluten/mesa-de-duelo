# Percorre a tela Jogar online de verdade, com o servidor local: abre a lista, entra na primeira sala pública, manda uma
# mensagem pronta, troca o deck na sala (room-deck) e toca em Pronto; imprime cada passo e salva um print da sala de espera.
# npm run godot -- --resolution 1600x900 --script res://tools/online_check.gd -- <saída.png>
extends SceneTree


func _initialize() -> void:
	OS.set_environment("MESA_ONLINE", "1")
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	var online: OnlineScreen = await _wait_for(main, "OnlineScreen", 10.0)
	if online == null:
		return _fail("a tela Jogar online não abriu")
	var join: Button = null
	for i: int in 40:
		await create_timer(0.25).timeout
		var buttons: Array = online.find_children("Join_*", "Button", true, false)
		if not buttons.is_empty():
			join = buttons[0]
			break
	if join == null:
		return _fail("nenhuma sala pública na lista")
	print("LISTA entrando em %s" % join.name.trim_prefix("Join_"))
	join.pressed.emit()
	var panel: RoomPanel = null
	for i: int in 60:
		await create_timer(0.25).timeout
		var found: Array = root.find_children("*", "RoomPanel", true, false)
		if not found.is_empty() and (found[0] as RoomPanel).visible:
			panel = found[0]
			break
	if panel == null:
		return _fail("a sala de espera não apareceu")
	print("SALA %s · %s" % [(panel.find_child("Code", true, false) as Label).text, (panel.find_child("Progress", true, false) as Label).text])
	(panel.find_child("Say_hello", true, false) as Button).pressed.emit()
	var deck: DeckPicker = panel.find_child("Deck", true, false)
	for index: int in deck.item_count:
		if deck.get_item_metadata(index) is int and int(deck.get_item_metadata(index)) == 1:
			deck.select(index)
			deck.item_selected.emit(index)
			break
	await create_timer(2.0).timeout
	print("DECK %s · %s" % [deck.get_item_text(deck.selected), (panel.find_child("Status", true, false) as Label).text])
	(panel.find_child("Ready", true, false) as Button).pressed.emit()
	await create_timer(1.5).timeout
	print("PRONTO %s" % (panel.find_child("Ready", true, false) as Button).text)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if not args.is_empty():
		root.get_texture().get_image().save_png(args[0])
	# A conexão cai na sala de espera: o cliente volta sozinho ao lugar (o assento veio na mensagem da sala).
	var match_screen: MatchScreen = root.find_children("*", "MatchScreen", true, false)[0]
	(match_screen.get("_client") as RefCounted).call("simulate_drop")
	await create_timer(3.0).timeout
	print("QUEDA de volta à sala: %s" % str((match_screen.get("_client") as RefCounted).call("is_open")))
	# A mesa "fecha" sem sair da sala: a tela inicial oferece voltar, e voltar abre a mesma sala.
	main.call("_show_menu")
	await create_timer(0.5).timeout
	var resume: Button = root.find_child("Resume", true, false)
	if resume == null:
		return _fail("a tela inicial não ofereceu voltar à partida")
	print("MENU %s" % resume.text)
	resume.pressed.emit()
	panel = null
	for i: int in 40:
		await create_timer(0.25).timeout
		var found: Array = root.find_children("*", "RoomPanel", true, false)
		if not found.is_empty() and (found[0] as RoomPanel).visible:
			panel = found[0]
			break
	if panel == null:
		return _fail("voltar à partida não abriu a sala")
	print("VOLTOU à sala %s" % (panel.find_child("Code", true, false) as Label).text)
	(panel.find_child("Leave", true, false) as Button).pressed.emit()
	await create_timer(0.5).timeout
	print("SAIU, de volta ao início: %s" % str(root.find_children("*", "MenuScreen", true, false).size() == 1))
	quit(0)


func _wait_for(from: Node, type: String, seconds: float) -> Node:
	var left: float = seconds
	while left > 0.0:
		var found: Array = from.find_children("*", type, true, false)
		if not found.is_empty():
			return found[0]
		await create_timer(0.2).timeout
		left -= 0.2
	return null


func _fail(text: String) -> void:
	printerr("FALHOU: %s" % text)
	quit(1)
