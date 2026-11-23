# Prints das telas do relato e do aviso de versão sobre uma mesa de partida gravada, para conferir o visual sem servidor.
# npm run godot -- --resolution 1600x900 --script res://tools/preview_reports.gd -- <cena> <saída.png>
# Cenas: relato (formulário na partida), enviado, meus (Meus relatos), menu (menu da partida aberto), aviso (versão nova
# na tela inicial), reinstalar, atualizar (protocolo mais novo no servidor).
extends SceneTree

const TABLE_STATE := "res://tests/fixtures/abertura.json"


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var scene: String = args[0]
	var out: String = args[1]
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var states: Array = JSON.parse_string(FileAccess.get_file_as_string(TABLE_STATE))
	var state: Dictionary = states[-3]
	var layer := CanvasLayer.new()
	if scene in ["aviso", "reinstalar"]:
		var menu := MenuScreen.new()
		menu.version_text = "Versão 0.238.0"
		root.add_child(menu)
	else:
		var table := TableView.new()
		table.catalog = catalog
		root.add_child(table)
		catalog.texture_ready.connect(table.on_texture_ready)
		root.add_child(layer)
		var hud := Hud.new()
		hud.catalog = catalog
		layer.add_child(hud)
		table.player_screen_position = hud.portrait_center
		hud.portrait_slot = table.portrait_slot
		hud.player_count = table.player_count
		table.apply_state(state)
		hud.apply_state(state)
		await create_timer(1.5).timeout
		table.refresh_textures()
		if scene == "menu":
			UpdateCheck.pending = {"version": "0.239.0", "reinstall": false, "download": ""}
			var menu_button: MatchMenu = hud.find_children("*", "MatchMenu", true, false)[0]
			menu_button.set_open(true)
	var overlay := CanvasLayer.new()
	overlay.layer = 60
	root.add_child(overlay)
	var client := ReportClient.new()
	overlay.add_child(client)
	match scene:
		"relato", "enviado":
			var recorder := MatchRecorder.new()
			for s: Dictionary in states:
				var msg: Dictionary = s.duplicate()
				msg["type"] = "state"
				recorder.received(msg)
			var dialog := ReportDialog.new()
			dialog.client = client
			overlay.add_child(dialog)
			dialog.open({"from": "partida", "recorder": recorder})
			await create_timer(0.6).timeout
			dialog.set_description("Ataquei com o Dragão e o bloqueador sumiu da mesa antes do dano. O oponente não perdeu vida.")
			if scene == "enviado":
				dialog.get("_done_title").text = "Relato K7Q2 enviado. Obrigado!"
				(dialog.get("_form") as Control).visible = false
				(dialog.get("_done") as Control).visible = true
		"meus":
			var panel := MyReportsPanel.new()
			overlay.add_child(panel)
			panel.visible = true
			(panel.get_node("Backdrop") as ModalBackdrop).amount = 1.0
			var now: int = int(Time.get_unix_time_from_system() * 1000.0)
			panel.show_reports([
				{"code": "K7Q2", "kind": "erro", "summary": "Ataquei com o Dragão e o bloqueador sumiu da mesa antes do dano.", "at": now - 3600000, "status": "analise"},
				{"code": "H3M9", "kind": "sugestao", "summary": "Seria bom poder girar a mesa para ver o campo do oponente de frente.", "at": now - 86400000 * 2, "status": "resolvido", "reply": "Boa ideia! Entrou na versão 0.239.0: Ctrl + roda do mouse gira a mesa."},
				{"code": "B8TT", "kind": "erro", "summary": "A carta da pilha ficou atrás do inspetor.", "at": now - 86400000 * 6, "status": "recebido"},
			], "")
		"aviso", "reinstalar":
			var notice := UpdateNotice.new()
			overlay.add_child(notice)
			notice.set_update("0.239.0", scene == "reinstalar", "https://mesao.online/baixar")
			notice.show_if_pending(true)
		"atualizar":
			var outdated := OutdatedScreen.new()
			overlay.add_child(outdated)
			outdated.open()
	await create_timer(1.2).timeout
	root.get_texture().get_image().save_png(out)
	print("print: ", out)
	quit()
