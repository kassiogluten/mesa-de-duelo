# A reserva de mana viva: de onde vem a mana (a permanente que virou e a cor que ela dá), o número que só sobe quando a
# gota chega, o gasto que voa até a pilha, a mana que se desfaz no fim da etapa e o aviso âmbar com a prioridade.
extends "res://tests/test_case.gd"


func _player(pool: Dictionary, tapped: Array = []) -> Dictionary:
	var field: Array = [
		{"id": 10, "name": "Forest", "typeLine": "Basic Land — Forest", "land": true, "tapped": tapped.has(10)},
		{"id": 11, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "tapped": tapped.has(11)},
		{"id": 12, "name": "Llanowar Elves", "typeLine": "Creature — Elf Druid", "text": "{T}: Add {G}.", "tapped": tapped.has(12)},
	]
	return {"id": 0, "name": "Kassio", "life": 20, "pool": pool, "battlefield": field}


func _state(player: Dictionary, extra: Dictionary = {}) -> Dictionary:
	var state: Dictionary = {"you": 0, "turn": 3, "phase": "MAIN1", "players": [player], "stack": [], "events": [],
		"input": {"gen": 2, "priority": true}}
	state.merge(extra, true)
	return state


## Uma reserva montada na árvore (os efeitos só tocam dentro dela), com a mesa respondendo pontos fixos.
func _view(points: Dictionary) -> Array:
	var tree: SceneTree = Engine.get_main_loop()
	var holder := Control.new()
	tree.root.add_child(holder)
	var portrait := Control.new()
	portrait.size = Vector2(100, 100)
	holder.add_child(portrait)
	var view := ManaPoolView.new()
	view.setup(true, portrait, holder)
	holder.add_child(view)
	view.table_point = func(key: Variant) -> Vector2: return points.get(key, Vector2(-1, -1))
	return [view, holder]


func _apply(view: ManaPoolView, player: Dictionary, state: Dictionary) -> void:
	view.apply(SeatInfo.pool_pips(player, state), player, state)


func _orbs(holder: Control) -> Array:
	return holder.get_children().filter(func(n: Node) -> bool: return n is ManaPoolOrb)


func test_mana_each_permanent_makes() -> void:
	check_eq(ManaPoolFx.produces({"typeLine": "Basic Land — Forest"}), "G", "Floresta dá verde")
	check_eq(ManaPoolFx.produces({"typeLine": "Land — Island Swamp"}), "UB", "terreno com dois tipos básicos")
	check_eq(ManaPoolFx.produces({"typeLine": "Artifact", "text": "{T}: Add {C}{C}."}), "C", "pelo texto da habilidade")
	check_eq(ManaPoolFx.produces({"typeLine": "Land", "text": "{T}: Add one mana of any color."}), "WUBRG", "qualquer cor")
	check_eq(ManaPoolFx.produces({"typeLine": "Creature — Bear"}), "", "não dá mana: não sabe")


func test_new_mana_flies_from_the_tapped_land_and_counts_on_arrival() -> void:
	done = false
	var parts: Array = _view({10: Vector2(600, 300), 11: Vector2(700, 300), 12: Vector2(500, 300)})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	_apply(view, _player({}), _state(_player({})))
	var after: Dictionary = _player({"G": 1, "U": 1}, [10, 11])
	_apply(view, after, _state(after))
	var green: ManaPoolPip = view.pip_of("G")
	check(green != null and green.count == 1, "o pip verde existe com 1")
	check_eq(green.shown_count() if green else -1, 0, "a mana ainda está voando: o número só sobe na chegada")
	var orbs: Array = _orbs(holder)
	check_eq(orbs.size(), 2, "uma gota por mana")
	var starts: Array = orbs.map(func(o: ManaPoolOrb) -> Vector2: return o.position)
	check(starts.has(Vector2(600, 300)), "a verde sai da Floresta")
	check(starts.has(Vector2(700, 300)), "a azul sai da Ilha")
	var tree: SceneTree = Engine.get_main_loop()
	await tree.create_timer(1.5).timeout
	check_eq(green.shown_count(), 1, "chegou: o número conta")
	check_eq(_orbs(holder).size(), 0, "as gotas somem depois de chegar")
	holder.free()
	done = true


func test_unknown_source_comes_from_the_portrait() -> void:
	var parts: Array = _view({})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	_apply(view, _player({}), _state(_player({})))
	var after: Dictionary = _player({"B": 3})
	_apply(view, after, _state(after))
	var orbs: Array = _orbs(holder)
	check_eq(orbs.size(), 3, "três manas, três gotas")
	check_eq((orbs[0] as ManaPoolOrb).position, Vector2(50, 50), "sem permanente virada: do retrato")
	holder.free()


func test_spent_mana_flies_to_the_top_of_the_stack() -> void:
	var parts: Array = _view({77: Vector2(900, 200)})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	var full: Dictionary = _player({"G": 2})
	_apply(view, full, _state(full))
	var green: ManaPoolPip = view.pip_of("G")
	var spent: Dictionary = _player({"G": 1})
	_apply(view, spent, _state(spent, {"stack": [{"id": 5, "kind": "spell", "source": {"id": 77}}],
		"events": [{"type": "spell-cast", "actor": 0}]}))
	var orbs: Array = _orbs(holder)
	check_eq(orbs.size(), 1, "uma gota para a mana gasta")
	if not orbs.is_empty():
		var orb: ManaPoolOrb = orbs[0]
		check_eq(orb.target.call(), Vector2(900, 200), "vai até a mágica no topo da pilha")
	check_eq(green.count, 1, "fica uma")
	var gone: Dictionary = _player({})
	_apply(view, gone, _state(gone, {"stack": [{"id": 6, "kind": "ability", "source": {"id": 12}}]}))
	check(view.pip_of("G") == null, "acabou a verde: o pip sai")
	check(holder.get_children().any(func(n: Node) -> bool: return n is TextureRect), "o fantasma do pip estoura no lugar")
	holder.free()


func test_unused_mana_dissipates_at_the_step_change() -> void:
	var parts: Array = _view({})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	var full: Dictionary = _player({"R": 1})
	_apply(view, full, _state(full))
	var empty: Dictionary = _player({})
	_apply(view, empty, _state(empty, {"phase": "COMBAT_BEGIN"}))
	check(view.pip_of("R") == null, "a reserva esvaziou")
	check_eq(_orbs(holder).size(), 0, "nada voa: a mana se desfaz no lugar")
	check(holder.get_children().any(func(n: Node) -> bool: return n is GPUParticles2D), "poeira de luz subindo")
	check(holder.get_children().any(func(n: Node) -> bool: return n is TextureRect), "o fantasma do pip sobe e apaga")
	check(not view.visible, "sem mana, a fileira some")
	holder.free()


func test_warning_only_with_your_priority_and_not_while_paying() -> void:
	var parts: Array = _view({})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	var me: Dictionary = _player({"U": 1})
	_apply(view, me, _state(me))
	check_eq(view.pip_of("U")._warn_target, 1.0, "com a prioridade e mana flutuando: aviso")
	_apply(view, me, _state(me, {"input": {"gen": 2, "priority": false}}))
	check_eq(view.pip_of("U")._warn_target, 0.0, "sem a prioridade: sem aviso")
	_apply(view, me, _state(me, {"input": {"gen": 3, "priority": true, "paying": true}}))
	var pip: ManaPoolPip = view.pip_of("U")
	check_eq(pip._warn_target, 0.0, "pagando: sem aviso")
	check(not pip.disabled, "pagando: o pip é botão")
	var sent: Array = []
	view.mana_pressed.connect(func(m: Dictionary) -> void: sent.append(m))
	pip.pressed.emit()
	check_eq(sent, [{"type": "mana", "color": "U", "gen": 3}], "o pip manda a mana com o gen")
	holder.free()


func test_first_state_has_no_effects() -> void:
	var parts: Array = _view({10: Vector2(1, 1)})
	var view: ManaPoolView = parts[0]
	var holder: Control = parts[1]
	var me: Dictionary = _player({"G": 2}, [10])
	_apply(view, me, _state(me))
	check_eq(_orbs(holder).size(), 0, "ao abrir a mesa a reserva já está lá, sem voos")
	check_eq(view.pip_of("G").shown_count(), 2, "e com o número certo")
	holder.free()
