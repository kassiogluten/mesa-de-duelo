# Testes do estado do atualizador (boot/update_state.gd): promover, tentar, voltar à anterior e confirmar.
extends "res://tests/test_case.gd"

const UpdateState := preload("res://boot/update_state.gd")


func _fresh() -> Dictionary:
	DirAccess.remove_absolute(UpdateState.STATE_PATH)
	return UpdateState.load_state()


func test_promote_keeps_previous() -> void:
	var state: Dictionary = UpdateState.promote(_fresh(), "1.0.0")
	state = UpdateState.promote(state, "1.0.1")
	check_eq(state["current"], "1.0.1", "atual")
	check_eq(state["previous"], "1.0.0", "anterior")
	check_eq(UpdateState.load_state()["current"], "1.0.1", "gravado no disco")


func test_two_unconfirmed_tries_fall_back() -> void:
	var state: Dictionary = UpdateState.promote(UpdateState.promote(_fresh(), "1.0.0"), "1.0.1")
	UpdateState.mark_trying(state, "1.0.1")
	check_eq(UpdateState.recover(state)["current"], "1.0.1", "uma tentativa ainda não volta")
	UpdateState.mark_trying(state, "1.0.1")
	state = UpdateState.recover(state)
	check_eq(state["current"], "1.0.0", "duas tentativas voltam à anterior")
	check((state["bad"] as Array).has("1.0.1"), "a versão fica marcada como quebrada")


func test_confirm_clears_tries() -> void:
	var state: Dictionary = UpdateState.promote(_fresh(), "2.0.0")
	UpdateState.mark_trying(state, "2.0.0")
	UpdateState.confirm()
	state = UpdateState.load_state()
	check_eq(state["trying"], "", "sem tentativa pendente")
	check_eq(int(state["tries"]), 0, "tentativas zeradas")
	DirAccess.remove_absolute(UpdateState.STATE_PATH)
