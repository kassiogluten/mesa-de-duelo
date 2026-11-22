# A caixa de ação com estados gravados: os rótulos e as mensagens dos botões são os da mesa do navegador.
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/abertura.json"


func _labels(buttons: Array) -> PackedStringArray:
	var out: PackedStringArray = []
	for b: Variant in buttons:
		out.append(Txt.of((b as Dictionary)["label"]))
	return out


func _identity(name: String) -> String:
	return name


func test_mulligan_offers_keep_with_hand_size() -> void:
	var state: Dictionary = (JSON.parse_string(FileAccess.get_file_as_string(FIXTURE)) as Array)[2]
	var buttons: Array = ActionBox.buttons(state, _identity)
	check_eq(_labels(buttons), PackedStringArray(["Mulligan", "Manter 7"]), "botões da mão inicial")
	check_eq((buttons[1] as Dictionary)["message"], {"type": "ok", "gen": int(state["input"]["gen"])}, "Manter manda ok com o gen")


func test_own_main_phase_passes_to_combat_with_end_turn_shortcut() -> void:
	var state: Dictionary = (JSON.parse_string(FileAccess.get_file_as_string(FIXTURE)) as Array)[9]
	var labels: PackedStringArray = _labels(ActionBox.buttons(state, _identity))
	check(labels.has("Fim de turno"), "atalho Fim de turno (veio %s)" % labels)
	check_eq(labels[labels.size() - 1], "Para o combate", "o principal, por último, diz para onde o jogo vai")
	check_eq(ActionBox.text(state, "", _identity)["short"], "", "com a prioridade, a caixa não repete o texto do Forge")


func test_pass_label_follows_the_phase() -> void:
	var base: Dictionary = {"stack": [], "you": 0, "activePlayer": 0, "players": [], "combat": []}
	var cases: Dictionary = {"UPKEEP": "Comprar", "MAIN1": "Para o combate", "MAIN2": "Para a etapa final", "COMBAT_DECLARE_BLOCKERS": "Para a principal 2"}
	for phase: String in cases:
		var state: Dictionary = base.duplicate()
		state["phase"] = phase
		check_eq(ActionBox.pass_label(state), cases[phase], phase)
	var theirs: Dictionary = base.duplicate()
	theirs["activePlayer"] = 1
	check_eq(ActionBox.pass_label(theirs), "Passar", "no turno do outro")
	var stacked: Dictionary = base.duplicate()
	stacked["stack"] = [{"id": 1}]
	check_eq(ActionBox.pass_label(stacked), "Resolver", "com algo na pilha")


func test_convoke_prompt_is_portuguese() -> void:
	var text: String = ActionBox.tap_to_pay_message({"kind": "convoke", "remaining": "{3}{W}"}, "Tribunal do Conclave")
	check(text.begins_with("Convocar: Tribunal do Conclave\n"), text)
	check(text.ends_with("Falta pagar {3}{W}."), text)
