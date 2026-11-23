# Testes da janela das perguntas: todos os exemplos montam, as respostas saem no formato da mesa do navegador, o teclado
# (Enter, Esc, números), os contadores do Confirmar, o "Ver a mesa" e a mesma pergunta que volta depois de respondida.
extends "res://tests/test_case.gd"

const PreviewQuestion := preload("res://tools/preview_question.gd")
const PURPOSES := ["triggers", "play-mode", "combat-damage", "commander-zone", "dungeon-room", "vote", "library", "card-name",
	"piles-split", "piles-choose", "replacement-order", "modes", "creature-type", "optional-costs", "split-destinations"]

var _sent: Array = []


## Uma janela na árvore com o catálogo fora dela (sem rede: as cartas mostram o nome).
func _dialog() -> QuestionDialog:
	var tree: SceneTree = Engine.get_main_loop()
	var dialog := QuestionDialog.new()
	dialog.catalog = CardCatalog.new()
	tree.root.add_child(dialog)
	_sent = []
	dialog.answered.connect(func(message: Dictionary) -> void: _sent.append(message))
	return dialog


func _free(dialog: QuestionDialog) -> void:
	var catalog: CardCatalog = dialog.catalog
	dialog.free()
	catalog.free()


func _sample(name: String) -> Dictionary:
	return (PreviewQuestion.samples()[name] as Dictionary).duplicate(true)


func _key(dialog: QuestionDialog, code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	dialog._unhandled_key_input(event)


func test_every_sample_builds_with_a_title_and_something_to_press() -> void:
	var all: Dictionary = PreviewQuestion.samples()
	check(all.size() >= 30, "há exemplos para as telas (%d)" % all.size())
	var covered: Dictionary = {}
	for name: String in all.keys():
		covered[Txt.of((all[name] as Dictionary).get("purpose"))] = true
		var dialog := _dialog()
		dialog.show_question((all[name] as Dictionary).duplicate(true))
		check(dialog.visible, "%s: a janela abre" % name)
		var title: RichTextLabel = dialog.find_child("Title", true, false)
		check(title != null and title.get_parsed_text().strip_edges() != "", "%s: tem título" % name)
		var pressable: int = dialog.find_children("*", "Button", true, false).size() + dialog.find_children("*", "ChoiceCard", true, false).size() + dialog.find_children("*", "ChoiceOption", true, false).size()
		check(pressable > 1, "%s: tem o que apertar" % name)
		_free(dialog)
	for purpose: String in PURPOSES:
		check(covered.has(purpose), "há exemplo da finalidade %s" % purpose)


func test_triggers_order_with_number_keys_and_enter() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("triggers"))
	check_eq(dialog.hotkeys.size(), 3, "uma tecla por gatilho")
	_key(dialog, KEY_2)
	_key(dialog, KEY_1)
	var cards: Array[Node] = dialog.find_children("*", "ChoiceCard", true, false)
	var badges: PackedStringArray = []
	for card: Node in cards:
		badges.append((card as ChoiceCard).badge_text())
	check(badges.has("1") and badges.has("3"), "os selos numeram as cartas")
	_key(dialog, KEY_ENTER)
	check_eq(_sent, [{"type": "answer", "id": 7, "indices": [1, 0, 2]}], "a ordem tocada vai na resposta")
	_free(dialog)


func test_pick_two_cards_counts_and_explains_the_disabled_confirm() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("cards"))
	var status: Label = dialog.find_child("Status", true, false)
	check(dialog.primary != null and dialog.primary.disabled, "Confirmar desligado sem escolha")
	check_eq(status.text, "Escolha 2 para confirmar.", "diz por que não dá para confirmar")
	_key(dialog, KEY_ENTER)
	check(_sent.is_empty(), "Enter não confirma desligado")
	_key(dialog, KEY_1)
	check_eq(status.text, "Escolha mais 1 para confirmar.", "conta o que falta")
	_key(dialog, KEY_3)
	check(not dialog.primary.disabled, "com duas, liga")
	check_eq(status.text, "2 de 2 escolhidas.", "contador")
	_key(dialog, KEY_ENTER)
	check_eq(_sent, [{"type": "answer", "id": 30, "indices": [0, 2]}], "as escolhidas na resposta")
	_free(dialog)


func test_single_pick_answers_on_the_key() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("one-card"))
	_key(dialog, KEY_2)
	_key(dialog, KEY_3)
	check_eq(_sent, [{"type": "answer", "id": 31, "indices": [1]}], "a tecla escolhe e responde uma vez só")
	_free(dialog)


func test_number_x_with_total_cost() -> void:
	check_eq(QuestionScreens.total_cost("{R}", "{1}", 3), "{3}{R}", "custo total soma as genéricas")
	check_eq(QuestionScreens.total_cost("{1}{G}", "{1}{G}", 2), "{3}{G}{G}{G}", "custo total do multikicker pago duas vezes")
	check_eq(QuestionScreens.mana_value("{2}{W}{X}"), 3, "valor de mana sem o X")
	var dialog := _dialog()
	dialog.show_question(_sample("number"))
	_key(dialog, KEY_4)
	check_eq(dialog.primary.text, "Confirmar X = 4", "o botão diz o X")
	_key(dialog, KEY_KP_ENTER)
	check_eq(_sent, [{"type": "answer", "id": 25, "number": 4}], "o número na resposta")
	_free(dialog)


func test_color_choice_in_portuguese_with_symbols() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("color"))
	var names: PackedStringArray = []
	for label: Node in dialog.find_children("*", "Label", true, false):
		names.append((label as Label).text)
	check(names.has("Branco") and names.has("Verde"), "as cores em português")
	_key(dialog, KEY_4)
	check_eq(_sent, [{"type": "answer", "id": 35, "indices": [3]}], "a quarta cor é o vermelho (índice da opção)")
	_free(dialog)


func test_combat_damage_and_library() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("combat"))
	check(not dialog.primary.disabled, "a divisão sugerida já vale")
	dialog.primary.pressed.emit()
	check_eq(_sent, [{"type": "answer", "id": 10, "amounts": [1, 2, 3]}], "o dano dividido")
	dialog.show_question(_sample("library"))
	_key(dialog, KEY_2)
	_key(dialog, KEY_ENTER)
	check_eq(_sent[1], {"type": "answer", "id": 9, "indices": [1]}, "a segunda carta para o fundo")
	_free(dialog)


func test_walker_loyalty_is_not_repeated() -> void:
	var dialog := _dialog()
	dialog.show_question(_sample("walker"))
	var texts: PackedStringArray = []
	for option: Node in dialog.find_children("*", "ChoiceOption", true, false):
		texts.append((option as ChoiceOption).text())
	check_eq(texts[0], "Cada jogador compra um card.", "o custo de lealdade fica no selo, não no texto")
	_free(dialog)


func test_peek_and_same_question_after_answer() -> void:
	done = false
	var dialog := _dialog()
	dialog.show_question(_sample("confirm"))
	_key(dialog, KEY_ESCAPE)
	check(dialog.is_minimized(), "Esc esconde a escolha")
	check((dialog.get_node("Restore") as Control).visible, "a pílula para voltar aparece")
	_key(dialog, KEY_ENTER)
	check(_sent.is_empty(), "escondida, Enter não responde")
	_key(dialog, KEY_ESCAPE)
	check(not dialog.is_minimized() and not (dialog.get_node("Restore") as Control).visible, "Esc de novo volta")
	_key(dialog, KEY_ENTER)
	check_eq(_sent, [{"type": "answer", "id": 24, "value": true}], "Enter é o Sim")
	dialog.show_question(_sample("confirm"))
	_key(dialog, KEY_ENTER)
	check_eq(_sent.size(), 1, "a mesma pergunta logo depois da resposta não responde de novo")
	dialog.show_question({})
	var tree: SceneTree = Engine.get_main_loop()
	await tree.create_timer(0.4).timeout
	check(not dialog.visible, "sem pergunta, a janela fecha depois da animação")
	_free(dialog)
	done = true
