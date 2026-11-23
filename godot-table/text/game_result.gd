# O que a tela de resultado diz (porte de src/ui/resultView.ts, gameEnding.ts, lossReason.ts, matchStats.ts e lifeChart.ts):
# título e tom, linha do turno e da duração, motivo da derrota, a virada e o "por um fio", os números e o gráfico de vida.
class_name GameResult
extends RefCounted

## A virada: chegar a esta vida (ou menos)…
const COMEBACK_LOW := 5
## …e depois voltar a esta (ou mais), e vencer.
const COMEBACK_HIGH := 15

## As linhas da tabela, em grupos; `sub` é uma parte da linha de cima (o dano de combate dentro do dano causado).
const GROUPS := [
	{"title": "Dano", "rows": [
		{"key": "damage", "label": "Dano causado"}, {"key": "combatDamage", "label": "em combate", "sub": true},
		{"key": "damageTaken", "label": "Dano recebido"}, {"key": "biggestTurn", "label": "Maior dano num turno"}]},
	{"title": "Remoções e anulações", "rows": [
		{"key": "removals", "label": "Remoções"}, {"key": "counters", "label": "Anulações"}, {"key": "countered", "label": "Mágicas anuladas"}]},
	{"title": "Combate", "rows": [
		{"key": "kills", "label": "Criaturas eliminadas em combate"}, {"key": "creaturesLost", "label": "Criaturas perdidas"}, {"key": "attackers", "label": "Ataques com criaturas"}]},
	{"title": "Ritmo", "rows": [
		{"key": "spells", "label": "Mágicas conjuradas"}, {"key": "abilities", "label": "Habilidades ativadas"}, {"key": "lands", "label": "Terrenos jogados"},
		{"key": "draws", "label": "Cartas compradas"}, {"key": "lifeGained", "label": "Vida ganha"}]},
]

## Os quatro destaques: o número e o rótulo no singular e no plural.
const HIGHLIGHTS := [
	{"key": "damage", "one": "dano causado", "many": "dano causado"},
	{"key": "removals", "one": "remoção", "many": "remoções"},
	{"key": "counters", "one": "anulação", "many": "anulações"},
	{"key": "draws", "one": "carta comprada", "many": "cartas compradas"},
]

## Cores das linhas do gráfico: você no dourado da mesa, os oponentes em azul, rosa e verde (o quarto tracejado).
const CHART_COLORS: Array[Color] = [Color("#e0a020"), Color("#3987e5"), Color("#d55181"), Color("#2fa32f")]


static func _dict(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


static func _list(value: Variant) -> Array:
	return value if value is Array else []


## Tempo no relógio da mesa: "0:07", "12:30" e, passando de uma hora, "1:02:05" (turnTimeText de src/ui/clock.ts).
static func time_text(ms: float) -> String:
	var total: int = maxi(0, int(floor(ms / 1000.0)))
	var h: int = total / 3600
	var m: int = (total / 60) % 60
	var s: int = total % 60
	return "%d:%02d:%02d" % [h, m, s] if h > 0 else "%d:%02d" % [m, s]


static func me(state: Dictionary) -> Dictionary:
	for raw: Variant in _list(state.get("players")):
		if int(_dict(raw).get("id", -1)) == int(state.get("you", -1)):
			return raw
	return {}


static func _wins(series: Dictionary) -> String:
	return " × ".join(PackedStringArray(_list(series.get("wins")).map(func(w: Variant) -> String: return str(int(w)))))


## {tone: "win"|"lose"|"draw", title, detail, reason}: quem venceu, a linha do turno e, na derrota, o motivo à parte.
static func result(state: Dictionary) -> Dictionary:
	var series: Dictionary = _dict(state.get("match"))
	var played: String = " · %s de jogo" % time_text(float(series["gameMs"])) if series.get("gameMs") != null else ""
	var watching: bool = bool(state.get("watching", false))
	var my: Dictionary = me(state)
	var winner: String = Txt.of(state.get("winner"))
	var quitter: String = Txt.of(series.get("concededBy")) if bool(series.get("abandoned", false)) else ""
	if quitter != "":
		var mine: bool = not watching and quitter == Txt.of(my.get("name"))
		var of_series: String = " da série" if Txt.of(_dict(state.get("config")).get("matchLength")) == "bo3" else ""
		var score: String = "Placar: " + _wins(series)
		if watching:
			return {"tone": "draw", "title": "%s desistiu%s" % [quitter, of_series], "detail": score, "reason": ""}
		return {"tone": "lose" if mine else "win", "title": "Derrota" if mine else "Vitória",
			"detail": "%s%s · %s" % ["Você desistiu" if mine else quitter + " desistiu", of_series, score], "reason": ""}
	var abandoned: bool = bool(series.get("abandoned", false))
	if watching:
		return {"tone": "draw", "title": "Partida encerrada" if abandoned else ("%s venceu" % winner if winner != "" else "Empate"),
			"detail": ("Placar: " + _wins(series) + played) if abandoned else "Turno %d%s" % [int(state.get("turn", 0)), played], "reason": ""}
	var won: bool = not abandoned and winner != "" and winner == Txt.of(my.get("name"))
	var reason: String = ""
	if not abandoned and not won and winner != "" and not my.is_empty():
		reason = loss_reason(state, my, true)
	var detail: String = "Placar: %s%s" % [_wins(series), played] if abandoned else "Turno %d%s%s" % [int(state.get("turn", 0)), played, (" · %s venceu" % ("Você" if won else winner)) if winner != "" else ""]
	return {
		"tone": "win" if won else ("lose" if not abandoned and winner != "" else "draw"),
		"title": "Partida encerrada" if abandoned else ("Vitória" if won else ("Derrota" if winner != "" else "Empate")),
		"detail": detail,
		"reason": "Eliminado: %s." % reason if reason != "" else "",
	}


## Por que o jogador perdeu, para vir depois de "Eliminado:"; `mine` muda a pessoa. "" sem motivo conhecido.
## `card_name` traduz o nome de uma carta (o comandante, a carta do efeito).
static func loss_reason(state: Dictionary, player: Dictionary, mine: bool, card_name: Callable = Callable()) -> String:
	var tr: Callable = card_name if card_name.is_valid() else func(n: String) -> String: return n
	match Txt.of(player.get("lossReason")):
		"LifeReachedZero":
			return "sua vida chegou a 0" if mine else "a vida chegou a 0"
		"CommanderDamage":
			var best: Dictionary = {}
			for raw: Variant in _list(player.get("commanderDamage")):
				var d: Dictionary = _dict(raw)
				if int(d.get("damage", 0)) >= 21 and (best.is_empty() or int(d["damage"]) > int(best["damage"])):
					best = d
			if best.is_empty():
				return "21 de dano de comandante"
			var name: String = "um comandante"
			for raw: Variant in _list(state.get("players")):
				for c: Variant in _list(_dict(raw).get("commanders")):
					if int(_dict(c).get("id", -1)) == int(best.get("commanderId", -2)):
						name = Txt.of(tr.call(Txt.of(_dict(c).get("name"))))
			return "%d de dano de comandante de %s" % [int(best["damage"]), name]
		"Poisoned":
			return "%d marcadores de veneno" % maxi(10, int(_dict(player.get("counters")).get("POISON", 0)))
		"Milled":
			return "você tentou comprar uma carta sem cartas no grimório" if mine else "tentou comprar uma carta sem cartas no grimório"
		"SpellEffect":
			return "efeito de %s" % tr.call(Txt.of(player["lossCard"])) if Txt.of(player.get("lossCard")) != "" else "efeito de uma carta"
		"OpponentWon":
			var who: String = Txt.of(player.get("lossWinner")) if Txt.of(player.get("lossWinner")) != "" else "outro jogador"
			return "%s venceu com %s" % [who, tr.call(Txt.of(player["lossCard"]))] if Txt.of(player.get("lossCard")) != "" else "%s venceu a partida" % who
		"Conceded":
			return "você desistiu" if mine else "desistiu"
		"IntentionalDraw":
			return "empate combinado"
	return ""


## Os títulos do jogo, de quem venceu: [{kind: "comeback"|"thread", title, detail}] ("Virada!", "Por um fio").
static func ending_titles(state: Dictionary) -> Array:
	var series: Dictionary = _dict(state.get("match"))
	var winner_name: String = Txt.of(state.get("winner"))
	if bool(series.get("abandoned", false)) or winner_name == "":
		return []
	var winner: Dictionary = {}
	for raw: Variant in _list(state.get("players")):
		if Txt.of(_dict(raw).get("name")) == winner_name:
			winner = raw
	if winner.is_empty():
		return []
	var id: int = int(winner["id"])
	var who: String = "Você" if id == int(state.get("you", -1)) and not bool(state.get("watching", false)) else winner_name
	var life: Array[int] = []
	for raw: Variant in _list(state.get("lifeHistory")):
		var value: Variant = _dict(_dict(raw).get("life")).get(str(id))
		if value != null:
			life.append(int(value))
	life.append(int(winner.get("life", 0)))
	var titles: Array = []
	var low: int = -1
	for i: int in life.size():
		if life[i] <= COMEBACK_LOW:
			low = i
			break
	if low >= 0:
		var high: int = -1
		for i: int in range(low + 1, life.size()):
			if life[i] >= COMEBACK_HIGH:
				high = i
				break
		if high >= 0:
			var lowest: int = life[0]
			for i: int in high:
				lowest = mini(lowest, life[i])
			titles.append({"kind": "comeback", "title": "Virada!", "detail": "%s chegou a %d de vida e virou o jogo." % [who, lowest]})
	if int(winner.get("life", 0)) == 1:
		titles.append({"kind": "thread", "title": "Por um fio", "detail": "%s venceu com 1 de vida." % who})
	return titles


static func _value(stats: Dictionary, key: String) -> int:
	return int(stats.get(key, 0)) if stats.get(key) != null else 0


## Os quatro números de quem joga: [{value, label}]; [] para quem assiste ou sem números (servidor antigo).
static func highlights(state: Dictionary) -> Array:
	var all: Dictionary = _dict(state.get("stats"))
	var my: Dictionary = me(state)
	if all.is_empty() or bool(state.get("watching", false)) or my.is_empty():
		return []
	var stats: Dictionary = _dict(all.get(str(int(my["id"]))))
	var out: Array = []
	for h: Dictionary in HIGHLIGHTS:
		var n: int = _value(stats, h["key"])
		out.append({"value": n, "label": h["one"] if n == 1 else h["many"]})
	return out


## Você primeiro, depois os outros na ordem da mesa (a mesma do gráfico de vida).
static func ordered_players(state: Dictionary) -> Array:
	var you: int = int(state.get("you", -1))
	var mine: Array = []
	var others: Array = []
	for raw: Variant in _list(state.get("players")):
		(mine if int(_dict(raw).get("id", -1)) == you else others).append(raw)
	return mine + others


static func _display_name(state: Dictionary, player: Dictionary) -> String:
	return "Você" if int(player.get("id", -1)) == int(state.get("you", -2)) and not bool(state.get("watching", false)) else Txt.of(player.get("name"))


## A tabela de todos os números: {players: [nomes], groups: [{title, rows: [{label, sub, values, top}]}]}, com `top` o
## índice do maior valor da linha quando é único e maior que zero (-1 senão). {} sem números.
static func stats_table(state: Dictionary) -> Dictionary:
	var all: Dictionary = _dict(state.get("stats"))
	if all.is_empty():
		return {}
	var players: Array = ordered_players(state)
	var groups: Array = []
	for g: Dictionary in GROUPS:
		var rows: Array = []
		for r: Dictionary in g["rows"]:
			var values: Array[int] = []
			for p: Variant in players:
				values.append(_value(_dict(all.get(str(int(_dict(p)["id"])))), r["key"]))
			rows.append({"label": r["label"], "sub": bool(r.get("sub", false)), "values": values, "top": _top(values)})
		groups.append({"title": g["title"], "rows": rows})
	if players.size() > 2:
		var rows: Array = []
		for target: Variant in players:
			var values: Array[int] = []
			for p: Variant in players:
				var to: Dictionary = _dict(_dict(all.get(str(int(_dict(p)["id"])))).get("damageTo"))
				values.append(-1 if p == target else int(to.get(str(int(_dict(target)["id"])), 0)))
			var name: String = _display_name(state, target)
			rows.append({"label": "em " + ("você" if name == "Você" else name), "sub": false, "values": values, "top": -1})
		groups.append({"title": "Dano em cada jogador", "rows": rows})
	return {"players": players.map(func(p: Variant) -> String: return _display_name(state, p)), "groups": groups}


static func _top(values: Array[int]) -> int:
	var best: int = 0
	var at: int = -1
	var unique: bool = false
	for i: int in values.size():
		if values[i] > best:
			best = values[i]
			at = i
			unique = true
		elif values[i] == best and best > 0:
			unique = false
	return at if unique else -1


## As séries do gráfico de vida: [{name, color, dashed, life: Array[float] (NAN onde falta)}], você primeiro, no máximo 4;
## [] com menos de dois pontos (sem histórico).
static func life_series(state: Dictionary) -> Array:
	var points: Array = _list(state.get("lifeHistory"))
	if points.size() < 2:
		return []
	var out: Array = []
	var players: Array = ordered_players(state)
	for i: int in mini(players.size(), CHART_COLORS.size()):
		var p: Dictionary = players[i]
		var life: Array[float] = []
		for raw: Variant in points:
			var value: Variant = _dict(_dict(raw).get("life")).get(str(int(p["id"])))
			life.append(float(value) if value != null else NAN)
		out.append({"name": "Você" if int(p["id"]) == int(state.get("you", -1)) else Txt.of(p.get("name")), "color": CHART_COLORS[i], "dashed": i == 3, "life": life})
	return out


## Os turnos do eixo de baixo (0 é o começo).
static func life_turns(state: Dictionary) -> Array[int]:
	var out: Array[int] = []
	for raw: Variant in _list(state.get("lifeHistory")):
		out.append(int(_dict(raw).get("turn", 0)))
	return out


## A escala do eixo da vida: [de baixo, de cima], de 5 em 5, sempre incluindo o 0.
static func life_range(series: Array) -> Vector2i:
	var low: float = 0.0
	var high: float = 1.0
	for s: Dictionary in series:
		for v: float in s["life"]:
			if not is_nan(v):
				low = minf(low, v)
				high = maxf(high, v)
	return Vector2i(int(floor(low / 5.0)) * 5, int(ceil(high / 5.0)) * 5)


## Marcas do eixo da vida: de 5 em 5, 10 em 10 ou 20 em 20, conforme o tamanho.
static func life_ticks(low: int, high: int) -> Array[int]:
	var step: int = 20 if high - low > 60 else (10 if high - low > 24 else 5)
	var out: Array[int] = []
	var v: int = int(ceil(float(low) / step)) * step
	while v <= high:
		out.append(v)
		v += step
	return out


## Afasta os nomes na ponta das linhas para não se encostarem (pelo menos `gap` entre eles, sem passar de `bottom`).
static func spread_labels(ys: Array[float], gap: float, bottom: float) -> Array[float]:
	var order: Array = []
	for i: int in ys.size():
		order.append({"y": ys[i], "i": i})
	order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["y"]) < float(b["y"]))
	for k: int in range(1, order.size()):
		order[k]["y"] = maxf(float(order[k]["y"]), float(order[k - 1]["y"]) + gap)
	var overflow: float = float(order[-1]["y"]) - bottom if not order.is_empty() else 0.0
	var out: Array[float] = []
	out.resize(ys.size())
	for o: Dictionary in order:
		out[int(o["i"])] = float(o["y"]) - maxf(overflow, 0.0)
	return out
