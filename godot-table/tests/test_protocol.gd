# Testes das constantes geradas do protocolo e dos decks prontos que o jogo lê de res://data/.
extends "res://tests/test_case.gd"

const Protocol := preload("res://net/protocol.gd")
const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")


func test_protocol_lists_core_types() -> void:
	check(Protocol.SERVER_MESSAGES.has("state"), "state entre as mensagens do servidor")
	check(Protocol.CLIENT_MESSAGES.has("rejoin"), "rejoin entre as mensagens da mesa")
	check(Protocol.EVENT_TYPES.has("damage"), "damage entre os eventos")
	check(Protocol.QUESTION_KINDS.size() >= 7, "os 7 tipos de pergunta")


func test_starter_decks_load() -> void:
	var standard: Array = StarterDecks.of_format("standard")
	check(standard.size() >= 2, "decks prontos de standard")
	var deck: Dictionary = StarterDecks.forge_deck(standard[0])
	check(not (deck["cards"] as Array).is_empty(), "o deck tem cartas")
	check(deck.has("sideboard") and deck.has("commanders"), "formato do servidor")


## O JSON do Godot lê 31 como 31.0, e `[31.0].has(31)` é falso: sem converter, nenhum clique em carta era aceito
## (a carta jogável não estava em `actionable`), e não dava para lançar nem descartar.
func test_server_numbers_become_ints() -> void:
	var state: Dictionary = ForgeClient.normalize(JSON.parse_string('{"input": {"gen": 8, "actionable": [31, 40], "selection": {"cards": [12]}}, "life": 2.5}'))
	check((state["input"]["actionable"] as Array).has(31), "a carta 31 é achada em actionable")
	check_eq(state["input"]["gen"], 8, "gen inteiro")
	check(((state["input"]["selection"] as Dictionary)["cards"] as Array).has(12), "seleção com inteiros")
	check_eq(state["life"], 2.5, "número com fração continua decimal")
