# Grava, sem servidor, quadros de cenas fixas do movimento das cartas (mão para o campo, compra, cemitério, moer, terreno
# no monte ×N, virar e desvirar, aura), para comparar a física das cartas antes e depois de uma mudança. Com janela e
# tempo fixo, para os quadros saírem iguais a cada vez:
# npm run godot -- --resolution 1600x900 --position 0,0 --fixed-fps 60 --script res://tools/preview_physics.gd -- <pasta> [cena]
# Grava <pasta>/<cena>/f00.png, f01.png… (um quadro a cada STEP_FRAMES) e <pasta>/<cena>/info.txt com o tempo de cada um.
extends SceneTree

const NAMES: PackedStringArray = ["Island", "Forest", "Mountain", "Llanowar Elves", "Grizzly Bears", "Serra Angel", "Counterspell", "Lightning Bolt", "Shivan Dragon", "Rancor"]
## Um quadro a cada 3 (0,05 s a 60 quadros por segundo).
const STEP_FRAMES := 3

var _out: String = ""
var _catalog: CardCatalog
var _table: TableView


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("fisica")
	var only: String = args[1] if args.size() > 1 else ""
	Fx.quality = 2
	_catalog = CardCatalog.new()
	root.add_child(_catalog)
	# As imagens ficam no cache em disco depois da primeira vez: pede todas e espera chegarem.
	_catalog.request(NAMES)
	await create_timer(2.0).timeout
	for name: String in NAMES:
		_catalog.texture(_catalog.image_url_for({"name": name}))
	await create_timer(2.0).timeout
	var scenes: Array[Callable] = [_hand_to_field, _draw, _to_graveyard, _mill, _land_on_stack, _tap_untap, _aura]
	var names: PackedStringArray = ["mao-campo", "compra", "cemiterio", "moer", "terreno-monte", "virar", "aura"]
	for i: int in scenes.size():
		if only != "" and names[i] != only:
			continue
		await _fresh_table(_base())
		await scenes[i].call(names[i])
	quit()


# — Cenas —

## Uma criatura da mão para o campo.
func _hand_to_field(tag: String) -> void:
	var s: Dictionary = _base()
	_move(s, 150, "hand", "battlefield", {"creature": true, "power": 4, "toughness": 4})
	await _record(tag, [[0, s]], 1.0)


## Compra: o grimório perde uma carta e ela voa para a mão.
func _draw(tag: String) -> void:
	var s: Dictionary = _base()
	var me: Dictionary = s["players"][0]
	me["library"] = int(me["library"]) - 1
	(me["hand"] as Array).append({"id": 152, "name": "Lightning Bolt", "controller": 0})
	me["handCount"] = (me["hand"] as Array).size()
	await _record(tag, [[0, s]], 1.1)


## Uma criatura do campo para o cemitério, que já tem três cartas.
func _to_graveyard(tag: String) -> void:
	var s: Dictionary = _base()
	_move(s, 105, "battlefield", "graveyard", {})
	await _record(tag, [[0, s]], 1.0)


## Moer cinco, uma depois da outra: cada estado põe mais uma no alto do cemitério.
func _mill(tag: String) -> void:
	var steps: Array = []
	var s: Dictionary = _base()
	var milled: PackedStringArray = ["Lightning Bolt", "Counterspell", "Shivan Dragon", "Island", "Serra Angel"]
	for i: int in 5:
		s = s.duplicate(true)
		var me: Dictionary = s["players"][0]
		me["library"] = int(me["library"]) - 1
		(me["graveyard"] as Array).append({"id": 170 + i, "name": milled[i], "controller": 0})
		steps.append([i * 12, s])
	await _record(tag, steps, 1.5)


## Um terreno jogado ao lado do monte de três Florestas (entra no monte, como a quarta).
func _land_on_stack(tag: String) -> void:
	var s: Dictionary = _base()
	_move(s, 151, "hand", "battlefield", {"land": true})
	await _record(tag, [[0, s]], 1.0)


## Virar e desvirar o Elfo.
func _tap_untap(tag: String) -> void:
	var tapped: Dictionary = _base()
	_find(tapped, 104)["tapped"] = true
	await _record(tag, [[0, tapped], [36, _base()]], 1.3)


## Uma aura da mão presa ao Urso.
func _aura(tag: String) -> void:
	var s: Dictionary = _base()
	_move(s, 153, "hand", "battlefield", {"attachedTo": 105, "enchantment": true})
	# O gancho da aura (CardNode.tuck_under, que a arrumação do campo chama para os anexos): entra por baixo do Urso.
	var tuck: Callable = func() -> void:
		var aura: CardNode = _table.card_node(153)
		if aura and aura.has_method("tuck_under"):
			aura.call("tuck_under", _table.card_node(105))
	await _record(tag, [[0, s, tuck]], 1.0)


# — Peças —

## Mesa nova com o estado `state`, já com as imagens.
func _fresh_table(state: Dictionary) -> void:
	if _table:
		_table.queue_free()
		await process_frame
	_table = TableView.new()
	_table.catalog = _catalog
	root.add_child(_table)
	var table: TableView = _table
	_catalog.info_ready.connect(func(_n: PackedStringArray) -> void:
		if is_instance_valid(table):
			table.refresh_textures())
	_catalog.texture_ready.connect(func(url: String, tex: Texture2D) -> void:
		if is_instance_valid(table):
			table.on_texture_ready(url, tex))
	_table.apply_state(state)
	for i: int in 40:
		await process_frame
	_table.apply_state(state)
	for i: int in 30:
		await process_frame


## Aplica cada estado de `steps` ([quadro, estado, o que fazer logo depois (opcional)]) no quadro dele e grava um quadro a cada STEP_FRAMES por `seconds`.
func _record(tag: String, steps: Array, seconds: float) -> void:
	var dir: String = _out.path_join(tag)
	DirAccess.make_dir_recursive_absolute(dir)
	var total: int = int(seconds * 60.0)
	var info: PackedStringArray = []
	var shot: int = 0
	for frame: int in total + 1:
		for step: Array in steps:
			if int(step[0]) == frame:
				_table.apply_state(step[1])
				if step.size() > 2:
					(step[2] as Callable).call()
		if frame % STEP_FRAMES == 0:
			await RenderingServer.frame_post_draw
			var path: String = dir.path_join("f%02d.png" % shot)
			root.get_texture().get_image().save_png(path)
			info.append("f%02d %.3f" % [shot, frame / 60.0])
			shot += 1
		await process_frame
	var file := FileAccess.open(dir.path_join("info.txt"), FileAccess.WRITE)
	file.store_string("\n".join(info) + "\n")
	print("%s: %d quadros" % [tag, shot])


## Leva a carta `id` de uma zona para outra do jogador 0 (com os campos extras).
func _move(state: Dictionary, id: int, from: String, to: String, extra: Dictionary) -> void:
	var me: Dictionary = state["players"][0]
	var list: Array = me[from]
	for i: int in list.size():
		if int((list[i] as Dictionary)["id"]) == id:
			var card: Dictionary = list[i]
			list.remove_at(i)
			card.merge(extra, true)
			if to == "graveyard":
				card = {"id": id, "name": card["name"], "controller": 0}
			(me[to] as Array).append(card)
			break
	me["handCount"] = (me["hand"] as Array).size()


func _find(state: Dictionary, id: int) -> Dictionary:
	for raw: Variant in (state["players"][0] as Dictionary)["battlefield"]:
		if int((raw as Dictionary)["id"]) == id:
			return raw
	return {}


## A mesa de partida: três Florestas num monte, um Elfo e um Urso no campo, três cartas no cemitério e quatro na mão.
func _base() -> Dictionary:
	var field: Array = [
		{"id": 101, "name": "Forest", "land": true, "controller": 0},
		{"id": 102, "name": "Forest", "land": true, "controller": 0},
		{"id": 103, "name": "Forest", "land": true, "controller": 0},
		{"id": 104, "name": "Llanowar Elves", "creature": true, "power": 1, "toughness": 1, "controller": 0},
		{"id": 105, "name": "Grizzly Bears", "creature": true, "power": 2, "toughness": 2, "controller": 0},
	]
	var hand: Array = [
		{"id": 150, "name": "Serra Angel", "controller": 0},
		{"id": 151, "name": "Forest", "controller": 0},
		{"id": 153, "name": "Rancor", "controller": 0},
		{"id": 154, "name": "Counterspell", "controller": 0},
	]
	var grave: Array = [{"id": 160, "name": "Island", "controller": 0}, {"id": 161, "name": "Mountain", "controller": 0}, {"id": 162, "name": "Counterspell", "controller": 0}]
	var me: Dictionary = {"id": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": hand.size(), "hand": hand,
		"battlefield": field, "graveyard": grave, "exile": []}
	var them: Dictionary = {"id": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 40, "handCount": 4, "hand": [],
		"battlefield": [{"id": 201, "name": "Mountain", "land": true, "controller": 1}, {"id": 202, "name": "Shivan Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1}],
		"graveyard": [{"id": 260, "name": "Island", "controller": 1}], "exile": []}
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": [me, them], "stack": [], "combat": [], "events": [], "gameOver": false}
