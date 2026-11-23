# Monta uma mesa sem servidor e passa a reserva de mana pelos quatro momentos (chegar, flutuar, gastar e se perder), com
# prints quadro a quadro de cada um.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_mana_pool.gd -- <pasta>/mana [momento]
# Grava <base>-<momento>-<n>.png (a tela toda) e <base>-<momento>-<n>-perto.png (o assento, recortado). Com o momento
# "medir", não grava nada e só mede o tempo dos quadros (os prints travam a tela e estragariam a conta).
extends SceneTree

## Cartas: id → [nome, tipo, dono, criatura, terreno, texto].
const CARDS := {
	101: ["Llanowar Elves", "Creature — Elf Druid", 0, true, false, "{T}: Add {G}."],
	102: ["Forest", "Basic Land — Forest", 0, false, true, ""],
	103: ["Forest", "Basic Land — Forest", 0, false, true, ""],
	104: ["Island", "Basic Land — Island", 0, false, true, ""],
	105: ["Mountain", "Basic Land — Mountain", 0, false, true, ""],
	201: ["Shivan Dragon", "Creature — Dragon", 1, true, false, ""],
	202: ["Mountain", "Basic Land — Mountain", 1, false, true, ""],
	203: ["Swamp", "Basic Land — Swamp", 1, false, true, ""],
}

var _table: TableView
var _hud: Hud
var _base: String
var _shots: int = 0
## O momento que está passando (para dizer onde foi o quadro mais lento).
var _moment: String = "abertura"
var _step_at: int = 0


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_base = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("mana")
	var only: String = args[1] if args.size() > 1 else ""
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_mount(catalog)
	var start: Dictionary = _state([], {}, [], {})
	_table.apply_state(start)
	_hud.apply_state(start)
	# Espera as cartas pousarem e as imagens chegarem.
	await create_timer(3.0).timeout
	# O intervalo entre um quadro e outro (com vsync, ~16,7 ms; acima de 20 ms foi um soluço).
	var frame_ms: Array = []
	var last: Array = [Time.get_ticks_usec()]
	var watch := func() -> void:
		var now: int = Time.get_ticks_usec()
		frame_ms.append((now - int(last[0])) / 1000.0)
		if (now - int(last[0])) > 12000:
			print("quadro lento: %.1f ms em %s (+%d ms)" % [(now - int(last[0])) / 1000.0, _moment, Time.get_ticks_msec() - _step_at])
		last[0] = now
	process_frame.connect(watch)

	# Chegar: três terrenos e o elfo virados; a do oponente vem do Pântano.
	var added: Dictionary = _state([102, 103, 104, 101], {"G": 3, "U": 1}, [203], {"B": 1})
	await _step("chegar", added, [0.1, 0.22, 0.34, 0.48, 0.7, 1.1], only)
	# Flutuar: sem a prioridade (só respira) e com ela (o aviso âmbar).
	var idle: Dictionary = added.duplicate(true)
	(idle["input"] as Dictionary)["priority"] = false
	await _step("flutuar", idle, [1.4, 2.2], only)
	await _step("aviso", added, [0.6, 1.4, 2.0], only)
	# Pagando: os pips viram botões que brilham; o mouse por cima de um.
	var paying: Dictionary = added.duplicate(true)
	paying["input"] = {"gen": 5, "paying": true, "payingFor": "spell", "message": "Pague {2}{G}", "manaCost": {"remaining": "{2}{G}"},
		"ok": {"label": "", "enabled": false}, "cancel": {"label": "Cancelar", "enabled": true}, "selectable": []}
	await _step("pagando", paying, [0.5, 1.2], only, true)
	# Gastar: a mágica foi para a pilha e levou G, G e U.
	var spent: Dictionary = _state([102, 103, 104, 101], {"G": 1}, [203], {"B": 1})
	spent["stack"] = [{"id": 900, "kind": "spell", "text": "Primal Might", "controller": 0, "source": {"id": 601, "name": "Primal Might", "typeLine": "Sorcery", "manaCost": "{X}{G}"}}]
	spent["events"] = [{"type": "spell-cast", "seq": 50, "actor": 0, "card": {"id": 601, "name": "Primal Might"}}]
	await _step("gastar", spent, [0.05, 0.15, 0.28, 0.42, 0.65], only)
	# Se perder: a etapa acabou com mana sobrando (a sua e a do oponente).
	var lost: Dictionary = _state([102, 103, 104, 101], {}, [203], {})
	lost["phase"] = "COMBAT_BEGIN"
	lost["stack"] = []
	await _step("perder", lost, [0.08, 0.25, 0.45, 0.7, 1.0], only)
	process_frame.disconnect(watch)
	frame_ms.sort()
	if not frame_ms.is_empty():
		print("quadros: %d, pior %.1f ms, p95 %.1f ms, mediana %.1f ms, acima de 20 ms: %d" % [frame_ms.size(), frame_ms[-1], frame_ms[int(frame_ms.size() * 0.95)], frame_ms[frame_ms.size() / 2], frame_ms.filter(func(ms: float) -> bool: return ms > 20.0).size()])
	quit()


## Aplica o estado e tira um print em cada instante de `times` (segundos desde o estado).
func _step(name: String, state: Dictionary, times: Array, only: String, hover: bool = false) -> void:
	_moment = name
	var t0: int = Time.get_ticks_usec()
	_table.apply_state(state)
	var t1: int = Time.get_ticks_usec()
	_hud.apply_state(state)
	if only == "medir":
		print("%s: mesa %.1f ms, HUD (com a reserva) %.1f ms" % [name, (t1 - t0) / 1000.0, (Time.get_ticks_usec() - t1) / 1000.0])
	_step_at = Time.get_ticks_msec()
	if hover:
		await process_frame
		var pip: ManaPoolPip = _my_pool().pip_of("G")
		if pip:
			var motion := InputEventMouseMotion.new()
			motion.position = pip.get_global_rect().get_center() * _scale()
			Input.parse_input_event(motion)
	var elapsed: float = 0.0
	for i: int in times.size():
		var wait: float = float(times[i]) - elapsed
		if wait > 0.0:
			await create_timer(wait).timeout
		elapsed = float(times[i])
		if only != "" and not name.contains(only):
			continue
		if only == "medir":
			continue
		await RenderingServer.frame_post_draw
		_save("%s-%d" % [name, i + 1])


func _save(tag: String) -> void:
	var image: Image = root.get_texture().get_image()
	var path: String = "%s-%s.png" % [_base, tag]
	image.save_png(path)
	# O seu assento e o campo logo acima (por onde a mana voa), e o assento do oponente.
	var s: float = _scale()
	var mine := Rect2i(0, int(image.get_height() - 560 * s), int(1100 * s), int(560 * s))
	image.get_region(mine).save_png("%s-%s-perto.png" % [_base, tag])
	var portrait: Vector2 = _hud.portrait_center(1) * s
	var theirs := Rect2i(int(maxf(portrait.x - 560 * s, 0)), 0, int(760 * s), int(260 * s))
	image.get_region(theirs).save_png("%s-%s-oponente.png" % [_base, tag])
	_shots += 1
	print("print: ", path)


func _scale() -> float:
	return float(root.size.x) / root.get_visible_rect().size.x


func _my_pool() -> ManaPoolView:
	for child: Node in _hud.get_children():
		if child is SeatPanel and (child as SeatPanel).mine:
			return (child as SeatPanel).mana_pool()
	return null


func _mount(catalog: CardCatalog) -> void:
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var stack := StackPanel.new()
	stack.catalog = catalog
	layer.add_child(stack)
	_table.stack_slot = stack.layer_rect
	_hud = Hud.new()
	_hud.catalog = catalog
	layer.add_child(_hud)
	_table.player_screen_position = _hud.portrait_center
	_hud.portrait_slot = _table.portrait_slot
	_hud.player_count = _table.player_count
	_hud.hand_rect = _table.hand_rect
	_table.hand_area = _hud.hand_area
	_hud.table_point = func(key: Variant) -> Vector2: return ManaPoolFx.project(_table, key)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)


func _card(id: int, tapped: bool) -> Dictionary:
	var c: Array = CARDS[id]
	return {"id": id, "name": c[0], "typeLine": c[1], "controller": c[2], "creature": c[3], "land": c[4], "text": c[5], "tapped": tapped, "power": 2, "toughness": 2}


func _field(owner: int, tapped: Array) -> Array:
	var out: Array = []
	for id: Variant in CARDS:
		if int((CARDS[id] as Array)[2]) == owner:
			out.append(_card(int(id), tapped.has(int(id))))
	return out


## `my_tapped`/`their_tapped`: ids virados; `my_pool`/`their_pool`: a reserva de cada um.
func _state(my_tapped: Array, my_pool: Dictionary, their_tapped: Array, their_pool: Dictionary) -> Dictionary:
	if OS.get_environment("MESA_SEM_RESERVA") == "1":
		# Comparação: a mesma sequência sem mana nenhuma (o que sobra de custo é da mesa e do HUD, não da reserva).
		my_pool = {}
		their_pool = {}
	var me: Dictionary = {"id": 0, "seat": 0, "name": "Kassio", "life": 20, "sleeve": 1, "library": 52, "handCount": 2, "hand": [{"id": 700, "name": "Giant Growth"}, {"id": 701, "name": "Forest"}],
		"battlefield": _field(0, my_tapped), "graveyard": [], "exile": [], "pool": my_pool}
	var opp: Dictionary = {"id": 1, "seat": 1, "name": "Ana", "life": 18, "sleeve": 2, "library": 47, "handCount": 5, "hand": [],
		"battlefield": _field(1, their_tapped), "graveyard": [], "exile": [], "pool": their_pool}
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "turnElapsedMs": 30000, "players": [me, opp],
		"stack": [], "combat": [], "gameOver": false, "events": [],
		"input": {"gen": 5, "priority": true, "ok": {"label": "Passar", "enabled": true}, "cancel": {"label": "", "enabled": false}, "selectable": []}}
