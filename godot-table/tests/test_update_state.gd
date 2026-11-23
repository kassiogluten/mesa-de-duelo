# Testes do estado do atualizador (boot/update_state.gd): promover, tentar, voltar à anterior, confirmar e o pacote do zip.
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


func test_is_newer_compares_numbers() -> void:
	check(UpdateState.is_newer("0.240.0", "0.239.9"), "0.240.0 é mais nova que 0.239.9")
	check(UpdateState.is_newer("0.10.0", "0.9.0"), "compara número, não texto")
	check(not UpdateState.is_newer("1.0.0", "1.0.0"), "igual não é mais nova")
	check(UpdateState.is_newer("1.0.0", ""), "qualquer versão é mais nova que nenhuma")


func test_bundled_pack_is_adopted_once() -> void:
	var dir: String = OS.get_user_data_dir().path_join("teste-zip")
	DirAccess.make_dir_recursive_absolute(dir)
	for v: String in ["1.0.0", "1.2.0"]:
		FileAccess.open(dir.path_join("game-%s.pck" % v), FileAccess.WRITE).store_string("pacote " + v)
	var bundled: Dictionary = UpdateState.bundled_pack(dir)
	check_eq(bundled.get("version"), "1.2.0", "o pacote mais novo da pasta")
	var state: Dictionary = UpdateState.adopt_bundled(_fresh(), bundled)
	check_eq(state["current"], "1.2.0", "sem pacote nenhum, o do zip vira o atual")
	check_eq(FileAccess.get_file_as_string(UpdateState.pck_path("1.2.0")), "pacote 1.2.0", "copiado para as atualizações")
	state = UpdateState.promote(state, "1.3.0")
	FileAccess.open(UpdateState.pck_path("1.3.0"), FileAccess.WRITE).store_string("baixado")
	state = UpdateState.adopt_bundled(state, bundled)
	check_eq(state["current"], "1.3.0", "zip mais velho que a versão baixada não volta atrás")
	for path: String in [UpdateState.pck_path("1.2.0"), UpdateState.pck_path("1.3.0"), dir.path_join("game-1.0.0.pck"), dir.path_join("game-1.2.0.pck")]:
		DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(dir)
	DirAccess.remove_absolute(UpdateState.STATE_PATH)
