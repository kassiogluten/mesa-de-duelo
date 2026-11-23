# Momentos grandes da partida: acha nos eventos o primeiro sangue, a eliminação de vários de uma vez, cada golpe de comandante e o ultimate, e toca a cena 3D de cada um.
class_name Moments
extends RefCounted

## Dano de comandante: o limite que derrota, a partir de quanto o placar fica mais forte e a partir de quanto fica vermelho.
const COMMANDER_LIMIT := 21
const COMMANDER_NEAR := 15
const COMMANDER_CRITICAL := 18
const BLOOD := Color(1.0, 0.1, 0.14)
const GOLD := Color(1.0, 0.76, 0.28)
const VIOLET := Color(0.62, 0.28, 1.0)
const DUSK := Color(0.42, 0.1, 0.62)
## O meio da mesa (o que a câmera olha), onde ficam os momentos que não são de um jogador só.
const MIDDLE := Vector3(0, 0, 0.6)

## A partida e o jogo de agora ("matchId#gameNumber"): mudou, tudo recomeça.
var _game_key: String = "?"
var _last_seq: int = -1
## Já houve golpe de combate num jogador neste jogo.
var _bloodied: bool = false
## Jogadores já contados como fora do jogo (id → true), para não contar de novo no estado seguinte.
var _out: Dictionary = {}


## Esquece tudo (partida nova).
func reset() -> void:
	_last_seq = -1
	_bloodied = false
	_out = {}


## Chamar com cada estado (com os eventos): devolve os momentos novos, na ordem em que aconteceram. Cada um tem `kind`
## ("first-blood", "multi-kill", "commander-hit" ou "ultimate"), o `seq` do evento que o causou e os campos do tipo.
func observe(state: Dictionary) -> Array:
	var match_id: String = Txt.of(state.get("matchId"))
	var series: Dictionary = state.get("match", {}) if state.get("match") is Dictionary else {}
	var key: String = "%s#%d" % [match_id, int(series.get("gameNumber", 1))]
	if key != _game_key:
		var same_match: bool = _game_key.get_slice("#", 0) == match_id
		var seq: int = _last_seq
		reset()
		if same_match:
			# Outro jogo da mesma série: os eventos continuam numerados de onde pararam.
			_last_seq = seq
		_game_key = key
		# Quem já estava fora quando a mesa chegou (reconexão) não vira momento.
		for raw: Variant in state.get("players", []):
			if raw is Dictionary and bool((raw as Dictionary).get("eliminated", false)):
				_out[int((raw as Dictionary).get("id", -1))] = true
	var moments: Array = []
	var knocked: Array = []
	var last_lethal: int = -1
	for raw: Variant in state.get("events", []):
		if not raw is Dictionary:
			continue
		var event: Dictionary = raw
		var seq: int = int(event.get("seq", -1))
		if seq <= _last_seq:
			continue
		_last_seq = seq
		var type: String = Txt.of(event.get("type"))
		if type == "turn" and int(event.get("turn", 0)) == 1:
			# O turno 1 começa outro jogo (melhor de três sem gameNumber).
			_bloodied = false
			_out = {}
		elif type == "damage":
			var players: Array = _target_players(event)
			if players.is_empty() or bool(event.get("prevented", false)):
				continue
			var source: int = _source_of(event)
			if bool(event.get("combat", false)) and not _bloodied:
				_bloodied = true
				moments.append({"kind": "first-blood", "player": players[0], "source": source, "seq": seq})
			if bool(event.get("commander", false)):
				var commander: int = int(event.get("commanderId", source))
				for player: int in players:
					var total: int = _commander_total(event, state, player, commander)
					moments.append({"kind": "commander-hit", "player": player, "commander": commander, "total": total,
						"hit": absi(int(event.get("delta", 0))), "lethal": total >= COMMANDER_LIMIT, "seq": seq})
			if bool(event.get("lethal", false)):
				for player: int in players:
					if not knocked.has(player):
						knocked.append(player)
				last_lethal = seq
		elif type == "ability-activated" and _is_ultimate(event, state):
			moments.append({"kind": "ultimate", "source": _source_of(event), "player": int(event.get("actor", -1)), "seq": seq})
	# Fora do jogo: os golpes letais deste lote e quem o estado marca como eliminado agora.
	for raw: Variant in state.get("players", []):
		if raw is Dictionary and bool((raw as Dictionary).get("eliminated", false)):
			var id: int = int((raw as Dictionary).get("id", -1))
			if not knocked.has(id):
				knocked.append(id)
	var fresh: Array = []
	for player: int in knocked:
		if not _out.has(player):
			fresh.append(player)
			_out[player] = true
	if fresh.size() >= 2:
		moments.append({"kind": "multi-kill", "count": fresh.size(), "players": fresh, "seq": last_lethal})
	return moments


## O nome da eliminação de `count` jogadores de uma vez ("" para menos de dois).
static func multi_kill_title(count: int) -> String:
	if count < 2:
		return ""
	if count == 2:
		return "Eliminação dupla"
	return "Eliminação tripla" if count == 3 else "Eliminação de %d" % count


static func _target_players(event: Dictionary) -> Array:
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var players: Array = []
	for raw: Variant in targets.get("players", []) if targets.get("players") is Array else []:
		players.append(int(raw))
	return players


static func _source_of(event: Dictionary) -> int:
	if event.get("sourceId") != null:
		return int(event["sourceId"])
	if event.get("card") is Dictionary and (event["card"] as Dictionary).has("id"):
		return int((event["card"] as Dictionary)["id"])
	return -1


## O total de dano desse comandante no jogador, com este golpe: o do evento, ou o do estado (pontes sem o total).
static func _commander_total(event: Dictionary, state: Dictionary, player: int, commander: int) -> int:
	if event.get("commanderTotal") != null:
		return int(event["commanderTotal"])
	for raw: Variant in state.get("players", []):
		var p: Dictionary = raw
		if int(p.get("id", -1)) != player:
			continue
		for entry: Variant in p.get("commanderDamage", []) if p.get("commanderDamage") is Array else []:
			if int((entry as Dictionary).get("commanderId", -2)) == commander:
				return int((entry as Dictionary).get("damage", 0))
	return absi(int(event.get("delta", 0)))


## A habilidade de lealdade é o ultimate: dito no evento ou no item da pilha que ele criou.
static func _is_ultimate(event: Dictionary, state: Dictionary) -> bool:
	if bool(event.get("ultimate", false)):
		return true
	if event.get("stackId") == null:
		return false
	for raw: Variant in state.get("stack", []):
		var item: Dictionary = raw
		if int(item.get("id", -1)) == int(event["stackId"]) and item.get("loyalty") is Dictionary:
			return bool((item["loyalty"] as Dictionary).get("ultimate", false))
	return false


# — Cenas —

## Toca a cena de um momento sobre a mesa (`parent` é o nó dos efeitos, na origem).
static func play(moment: Dictionary, parent: Node3D, table: TableView) -> void:
	if parent == null or table == null or not parent.is_inside_tree():
		return
	match Txt.of(moment.get("kind")):
		"first-blood":
			_first_blood(moment, parent, table)
		"multi-kill":
			_multi_kill(moment, parent, table)
		"commander-hit":
			_commander_hit(moment, parent, table)
		"ultimate":
			_ultimate(moment, parent, table)


## Primeiro sangue: um corte carmesim atravessa o retrato atingido, um clarão, respingos e faíscas vermelhas, o título que
## sobe e um tremor.
static func _first_blood(moment: Dictionary, parent: Node3D, table: TableView) -> void:
	var at: Vector3 = _player_at(table, int(moment.get("player", -1)))
	MomentPieces.slash(parent, at, BLOOD, deg_to_rad(28.0), 3.4, 0.36, 0.0)
	MomentPieces.after(parent, 0.1, func() -> void:
		Fx.burst(parent, at, BLOOD, 70, 3.4, 0.8, 0.06)
		Fx.burst(parent, at, Color(1.0, 0.55, 0.4), 24, 1.8, 0.5, 0.04)
		MomentExtras.flare(parent, at + Vector3(0, 0.2, 0), BLOOD.lightened(0.2), 2.2, 0.45)
		MomentExtras.shards(parent, at + Vector3(0, 0.15, 0), Color(0.7, 0.0, 0.05, 0.95), 26, 2.2, 0.7, 0.07, 0.15)
		Fx.light(parent, at, BLOOD, 6.0, 5.0, 0.6)
		MomentPieces.shake(table.camera, 0.09, 0.4))
	MomentPieces.title(parent, MomentPieces.beside(table, at, 230.0), "Primeiro sangue", Color(1.0, 0.3, 0.28), Color(0.25, 0.0, 0.02), 150, 2.0, 0.06)


## Eliminação de vários: cada retrato derrubado ganha um X de cortes, uma onda enorme corre a mesa, fogos escuros e
## dourados estouram, o título aparece no meio e a câmera se aproxima.
static func _multi_kill(moment: Dictionary, parent: Node3D, table: TableView) -> void:
	var players: Array = moment.get("players", []) if moment.get("players") is Array else []
	var count: int = maxi(int(moment.get("count", players.size())), 2)
	var focus: Vector3 = MIDDLE
	for i: int in players.size():
		var at: Vector3 = _player_at(table, int(players[i]))
		focus += (at - MIDDLE) / players.size() * 0.6
		var delay: float = 0.15 + i * 0.28
		MomentPieces.slash(parent, at, BLOOD, deg_to_rad(35.0), 2.8, 0.3, delay)
		MomentPieces.slash(parent, at, BLOOD, deg_to_rad(-35.0), 2.8, 0.3, delay + 0.09)
		MomentPieces.after(parent, delay + 0.12, func() -> void:
			Fx.burst(parent, at, DUSK, 60, 2.8, 1.0, 0.06)
			Fx.burst(parent, at, BLOOD, 30, 2.0, 0.6, 0.04)
			Fx.light(parent, at, BLOOD, 4.0, 4.0, 0.6))
	MomentPieces.after(parent, 0.25, func() -> void:
		Fx.ring(parent, MIDDLE, GOLD, 9.0, 1.3, 0.035)
		Fx.light(parent, MIDDLE, GOLD, 6.0, 9.0, 0.9)
		MomentPieces.shake(table.camera, 0.14, 0.5))
	MomentPieces.after(parent, 0.45, func() -> void: Fx.ring(parent, MIDDLE, VIOLET, 7.0, 1.4, 0.05))
	var shots: int = 7 + count * 2
	for i: int in shots:
		var pos := Vector3(randf_range(-5.5, 5.5), randf_range(1.2, 3.0), randf_range(-3.2, 1.6))
		var gold: bool = i % 2 == 0
		MomentPieces.after(parent, 0.4 + i * 0.16, func() -> void:
			Fx.burst(parent, pos, GOLD if gold else DUSK, 90, 3.4, 1.3, 0.045)
			Fx.burst(parent, pos, Color(1.0, 0.95, 0.8) if gold else VIOLET, 24, 1.5, 0.6, 0.03)
			Fx.light(parent, pos, GOLD if gold else VIOLET, 3.0, 5.0, 0.6))
	MomentPieces.title(parent, MomentPieces.beside(table, MIDDLE, 0.0), multi_kill_title(count), GOLD.lightened(0.15), Color(0.3, 0.02, 0.08), 170, 2.6, 0.2)
	MomentPieces.dolly(table.camera, focus, 0.16, 2.2, 0.25)


## Golpe de comandante: impacto roxo-dourado no retrato (clarão em estrela), a coroa se estampa e o placar "X/21" rola até o total, mais forte a
## partir de 15, vermelho a partir de 18; no golpe que chega a 21 a coroa treme e se parte.
static func _commander_hit(moment: Dictionary, parent: Node3D, table: TableView) -> void:
	var at: Vector3 = _player_at(table, int(moment.get("player", -1)))
	var total: int = int(moment.get("total", 0))
	var lethal: bool = total >= COMMANDER_LIMIT
	var near: bool = total >= COMMANDER_NEAR
	var critical: bool = total >= COMMANDER_CRITICAL
	var tone: Color = BLOOD if critical else (Color(1.0, 0.6, 0.2) if near else GOLD)
	Fx.burst(parent, at, VIOLET, 50, 2.4, 0.7, 0.05)
	Fx.burst(parent, at, tone, 40 if near else 26, 2.0, 0.7, 0.04)
	MomentExtras.flare(parent, at + Vector3(0, 0.2, 0), VIOLET.lerp(tone, 0.3), 2.0 if near else 1.6, 0.45, 1.2)
	Fx.light(parent, at, VIOLET.lerp(tone, 0.5), 4.0 if near else 3.0, 4.0, 0.6)
	# A coroa e o placar ficam ao lado do retrato, para dentro da mesa: em cima dele, o HUD os cobriria.
	var spot: Vector3 = MomentPieces.beside(table, at, 230.0, MomentPieces.SCORE_MARGIN)
	# A coroa e o placar juntos ocupam uma faixa: um título no mesmo lugar (o primeiro sangue do mesmo golpe) vai para outra.
	spot = MomentPieces.claim(parent, spot, Vector2(1.6, 1.5), 0.0, 2.2)
	MomentPieces.crown(parent, spot + MomentPieces.screen_up(parent) * 0.42, tone if critical else GOLD, 0.3 if near else 0.25, lethal)
	var before: int = maxi(0, total - int(moment.get("hit", 0)))
	MomentPieces.score(parent, spot - Vector3(0, 0.05, 0), before, total, tone, near, critical)
	if critical:
		MomentPieces.shake(table.camera, 0.12 if lethal else 0.06, 0.5 if lethal else 0.3)


## Ultimate: uma coluna de energia na carta, faíscas subindo em espiral, um anel enorme e a câmera foca na carta.
static func _ultimate(moment: Dictionary, parent: Node3D, table: TableView) -> void:
	var source: int = int(moment.get("source", -1))
	var found: Variant = table.anchor(source) if source >= 0 else null
	var at: Vector3 = found if found is Vector3 else MIDDLE
	var color: Color = Fx.card_color(table.card_data(source)).lerp(GOLD, 0.12) if source >= 0 else GOLD
	var node: CardNode = table.card_node(source) if source >= 0 else null
	if node:
		node.flash_color(color, 0.45)
		node.jolt(0.1)
	MomentPieces.beam(parent, at, color, 1.8)
	MomentPieces.spiral(parent, at, color.lightened(0.2), 6, 2.6, 1.3)
	Fx.light(parent, at, color, 3.0, 6.0, 1.4)
	MomentPieces.after(parent, 0.35, func() -> void:
		Fx.ring(parent, at, color, 7.5, 1.3, 0.025)
		Fx.ring(parent, at, GOLD, 4.5, 0.9, 0.03)
		Fx.burst(parent, at + Vector3(0, 0.2, 0), color, 70, 3.2, 1.0, 0.05)
		MomentPieces.shake(table.camera, 0.08, 0.4))
	MomentPieces.after(parent, 1.25, func() -> void: Fx.burst(parent, at + Vector3(0, 2.4, 0), color.lightened(0.4), 60, 2.4, 0.9, 0.045))
	MomentPieces.title(parent, MomentPieces.beside(table, at, 200.0), "Ultimate", GOLD.lightened(0.2), Color(0.12, 0.05, 0.0), 140, 1.9, 0.3)
	MomentPieces.dolly(table.camera, at, 0.2, 1.8, 0.2)


## Onde fica o retrato do jogador na mesa (o meio da mesa se ele não está à vista).
static func _player_at(table: TableView, player: int) -> Vector3:
	var pos: Variant = table.anchor("player:%d" % player)
	return pos if pos is Vector3 else MIDDLE
