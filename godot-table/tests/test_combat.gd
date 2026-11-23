# Combate: a pausa do impacto sempre devolve o tempo, os golpes de cada atacante viram uma troca por etapa (iniciativa e
# normal em ondas separadas), a vida que o combate mostra não se repete e o clima de combate entra e sai devagar.
extends "res://tests/test_case.gd"


func _damage(seq: int, source: int, target: Variant, amount: int, step: String = "regular", extra: Dictionary = {}) -> Dictionary:
	var targets: Dictionary = {"players": [int(Txt.of(target).substr(7))]} if target is String else {"cards": [int(target)]}
	var event: Dictionary = {"type": "damage", "seq": seq, "combat": true, "sourceId": source, "delta": -amount, "step": step,
		"targets": targets, "card": {"id": source, "controller": 0}}
	event.merge(extra, true)
	return event


func _stage() -> CombatStage:
	var stage := CombatStage.new()
	stage.observe({"you": 0, "combat": [
		{"attacker": 1, "defender": 1, "defenderKind": "player", "blockers": [2]},
		{"attacker": 3, "defender": 1, "defenderKind": "player", "blockers": []},
		{"attacker": 5, "defender": 1, "defenderKind": "player", "blockers": []}]})
	return stage


func _free(stage: CombatStage) -> void:
	stage.camera_rig.free()
	stage.screen.free()
	stage.links.free()
	stage.free()


func test_hit_stop_always_gives_the_time_back() -> void:
	done = false
	var quality: int = Fx.quality
	Fx.quality = 2
	Engine.time_scale = 1.0
	var tree: SceneTree = Engine.get_main_loop()
	CombatCamera.hit_stop(tree, 0.05)
	CombatCamera.hit_stop(tree, 0.08)
	check(Engine.time_scale < 0.2, "o tempo quase para no impacto (%.2f)" % Engine.time_scale)
	await tree.create_timer(0.2, true, false, true).timeout
	check_eq(Engine.time_scale, 1.0, "as duas pausas devolvem a escala de antes")
	check(not CombatCamera.stopped(), "nenhuma pausa aberta")
	Fx.quality = 0
	CombatCamera.hit_stop(tree, 0.08)
	check_eq(Engine.time_scale, 1.0, "no leve não há pausa")
	CombatCamera.release_all()
	Engine.time_scale = 1.0
	Fx.quality = quality
	done = true


func test_blows_of_an_exchange_play_together_and_strike_waves_apart() -> void:
	var stage := _stage()
	var fresh: Array = [
		_damage(10, 1, 2, 4), _damage(11, 2, 1, 2),
		_damage(12, 3, "player:1", 1, "first-strike", {"doubleStrike": true}), _damage(13, 3, "player:1", 1, "regular", {"doubleStrike": true}),
	]
	stage.plan(fresh, {})
	check(stage.event_time(10) > 0.0, "a troca ocupa o tempo no primeiro golpe")
	check_eq(stage.event_time(11), 0.0, "o golpe do bloqueador toca junto, sem tempo próprio")
	check(stage.absorbed(11), "o golpe do bloqueador fica com a troca")
	check(not stage.absorbed(10), "o primeiro golpe toca a troca")
	check(stage.event_time(12) > 0.0 and stage.event_time(13) > 0.0, "golpe duplo: iniciativa e normal em duas ondas")
	check(stage.lead_in(11) > 0.0, "o momento do golpe do bloqueador espera o impacto")
	_free(stage)


func test_life_shown_by_combat_is_not_repeated() -> void:
	var stage := _stage()
	var fresh: Array = [
		_damage(20, 3, "player:1", 3), _damage(21, 5, "player:1", 2, "regular", {"lifelink": true}),
		{"type": "life-changed", "seq": 22, "actor": 1, "delta": -5},
		{"type": "life-changed", "seq": 23, "actor": 0, "delta": 2},
		{"type": "life-changed", "seq": 24, "actor": 0, "delta": -1},
	]
	stage.plan(fresh, {})
	check(stage.absorbed(22), "a perda de quem levou o golpe pulsa no golpe")
	check(stage.absorbed(23), "o ganho do vínculo com a vida aparece com as luzes")
	check(not stage.absorbed(24), "outra perda de vida segue com o efeito dela")
	var gain: int = 0
	for raw: Variant in (stage._groups[21] as Dictionary)["blows"]:
		gain += int((raw as Dictionary).get("gain", 0))
	check_eq(gain, 2, "o golpe com vínculo leva o ganho para mostrar quando as luzes chegam")
	_free(stage)


func test_combat_mood_comes_in_fast_and_breathes_out() -> void:
	var quality: int = Fx.quality
	Fx.quality = 2
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	var mood := TableMood.new()
	mood.attach(table)
	mood.set_combat(true)
	for i: int in 30:
		mood.advance(1.0 / 60.0)
	check(mood.combat_level() > 0.9, "o clima de combate entra em meio segundo (%.2f)" % mood.combat_level())
	mood.set_combat(false)
	for i: int in 18:
		mood.advance(1.0 / 60.0)
	check(mood.combat_level() > 0.5, "e sai devagar, sem corte (%.2f)" % mood.combat_level())
	for i: int in 60:
		mood.advance(1.0 / 60.0)
	check_eq(mood.combat_level(), 0.0, "até apagar")
	Fx.quality = quality
	mood.free()
	catalog.queue_free()
	table.queue_free()
