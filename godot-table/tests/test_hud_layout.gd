# O acabamento do HUD: símbolos de mana na caixa de ação, a espera calma, o atalho no botão principal, os avisos
# empilhados, a escolha do nível de passar, os selos do oponente longe da mão dele e a coluna da direita acima da sua mão.
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/abertura.json"


func _tree() -> SceneTree:
	return Engine.get_main_loop()


func _paying_state() -> Dictionary:
	return {
		"you": 0, "activePlayer": 0, "turn": 3, "phase": "MAIN1", "stack": [],
		"players": [{"id": 0, "name": "Você", "life": 20, "hand": [], "battlefield": [], "pool": {}}, {"id": 1, "name": "Oponente", "life": 20}],
		"input": {"gen": 5, "paying": true, "payingFor": "spell", "canAutoPay": true, "message": "Pay Mana Cost: {1}{W}",
			"ok": {"label": "OK", "enabled": true}, "cancel": {"label": "Cancel", "enabled": true}},
	}


func _waiting_state() -> Dictionary:
	return {
		"you": 0, "activePlayer": 1, "turn": 3, "phase": "MAIN1", "stack": [],
		"players": [{"id": 0, "name": "Você", "life": 20}, {"id": 1, "name": "Ana", "life": 20}],
		"deciding": [{"player": 1, "kind": "attack"}],
		"input": {"gen": 6, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}},
	}


func _panel() -> ActionPanel:
	var panel := ActionPanel.new()
	_tree().root.add_child(panel)
	return panel


func test_mana_costs_become_icons_in_the_action_box() -> void:
	var panel := _panel()
	panel.apply(_paying_state(), "")
	for node: RichTextLabel in [panel._short, panel._detail]:
		if node.visible:
			check(not node.get_parsed_text().contains("{"), "sem custo cru na caixa (veio %s)" % node.get_parsed_text())
	check(panel._detail.visible or panel._short.visible, "a caixa mostra o pagamento")
	check_eq(panel.primary_message(), {"type": "ok", "gen": 5}, "o principal paga")
	panel.free()


func test_waiting_shows_a_spinner_with_who_decides() -> void:
	var panel := _panel()
	panel.apply(_waiting_state(), "")
	check(panel._wait_row.visible, "a espera aparece como uma linha calma")
	check_eq(panel._wait_label.text, "Aguardando Ana declarar atacantes…", "com o nome de quem decide")
	check(not panel._buttons_box.visible, "sem botão apagado fazendo as vezes de aviso")
	check(not panel._active, "a borda fica apagada esperando")
	check(panel.primary_message().is_empty(), "o Espaço não manda nada")
	panel.free()


func test_primary_button_shows_the_space_key() -> void:
	var panel := _panel()
	var state: Dictionary = (JSON.parse_string(FileAccess.get_file_as_string(FIXTURE)) as Array)[2]
	panel.apply(state, "")
	var caps: Array = panel._buttons_box.find_children("*", "PanelContainer", true, false)
	var found: bool = false
	for cap: Variant in caps:
		for label: Node in (cap as Node).get_children():
			if label is Label and (label as Label).text == "Espaço":
				found = true
	check(found, "o botão principal mostra a tecla Espaço")
	check(panel._active, "com a vez sua a borda acende")
	panel.free()


func test_long_primary_label_never_widens_the_box() -> void:
	var button: Button = ActionPanel.make_button("Pagar automaticamente", true)
	ActionPanel._add_keycap(button)
	check(button.get_combined_minimum_size().x <= ActionPanel.INNER + 0.5, "o botão cabe na caixa (veio %s)" % button.get_combined_minimum_size().x)
	button.free()


func test_toasts_stack_up_to_three_and_dedupe() -> void:
	var toasts := ToastStack.new()
	_tree().root.add_child(toasts)
	for text: String in ["um", "dois", "três", "quatro"]:
		toasts.show_toast(text, "info")
	check_eq(toasts.count(), 3, "no máximo três avisos")
	check_eq(toasts.texts(), PackedStringArray(["dois", "três", "quatro"]), "os mais novos ficam")
	toasts.show_toast("quatro", "error")
	check_eq(toasts.count(), 3, "o mesmo texto só renova o aviso")
	toasts.free()


func test_pass_level_picker_emits_the_choice() -> void:
	var picker := PassLevelPicker.new()
	_tree().root.add_child(picker)
	picker.set_level("respostas")
	check_eq(picker.text, "Passar: Respostas", "a pílula mostra o nível")
	var chosen: Array = []
	picker.level_chosen.connect(func(level: String) -> void: chosen.append(level))
	picker.set_open(true)
	check(picker.is_open(), "o painel abre")
	check_eq(picker._list.get_child_count(), 4, "os quatro níveis")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	(picker._list.get_child(3) as Control).gui_input.emit(click)
	check_eq(chosen, ["afeta"], "escolher manda o nível")
	check(not picker.is_open(), "e fecha o painel")
	picker.free()


func test_opponent_badges_stay_away_from_their_hand() -> void:
	var seat := SeatPanel.new()
	seat.setup(1, false)
	_tree().root.add_child(seat)
	var opponent: Dictionary = {"id": 1, "name": "Ana", "life": 20, "handCount": 7, "graveyard": [], "counters": {"POISON": 2}}
	var state: Dictionary = {"you": 0, "activePlayer": 1, "players": [opponent], "input": {"gen": 1}}
	seat.place(Vector2(800, 77), 130.0, 460.0, "left")
	seat.apply(opponent, state, false, false, func(n: String) -> String: return n)
	seat._layout_column()
	check(seat._column.position.x + seat._column.size.x <= 0.0, "no duelo, os selos ficam à esquerda do retrato")
	seat.place(Vector2(150, 77), 100.0, 300.0, "below")
	seat.apply(opponent, state, false, false, func(n: String) -> String: return n)
	seat._layout_column()
	check(seat._column.position.y >= 100.0, "no Commander, os selos ficam embaixo do nome")
	seat.free()


func test_right_column_rises_above_a_wide_hand() -> void:
	var hud := Hud.new()
	_tree().root.add_child(hud)
	var view: Vector2 = hud.get_viewport_rect().size
	hud.hand_rect = func() -> Rect2: return Rect2(300, view.y - 280, view.x - 300, 280)
	hud._track.visible = true
	hud._layout_right_column(10.0)
	check(hud._track.position.y + Hud.TRACK_H <= view.y - 280, "a trilha sobe acima da mão")
	check(hud._action.corner.y < hud._track.position.y, "a caixa fica acima da trilha")
	hud.hand_rect = func() -> Rect2: return Rect2(500, view.y - 280, 600, 280)
	hud._layout_right_column(10.0)
	check_eq(hud._track.position.y + Hud.TRACK_H, view.y - HudStyle.MARGIN, "mão estreita: a coluna volta ao canto")
	check(hud.hand_area().end.x <= view.x - Hud.RIGHT_COLUMN, "a faixa da mão termina antes da coluna")
	hud.free()
