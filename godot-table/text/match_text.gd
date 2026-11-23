# Textos dos relógios e da barra da partida (porte de src/ui/clock.ts, matchBar.ts e waitAlert.ts): tempo, placar e espera.
class_name MatchText
extends RefCounted

const FORMATS := {"commander": "Commander", "standard": "Standard", "pauper": "Pauper", "sacola50": "Sacola 50", "free": "Livre", "oathbreaker": "Oathbreaker", "precon": "Commander Precon"}
## Esperas: 1 min (o relógio aparece), 1 min 30 s (aviso para quem demora), 2 min ("Demorando…" e votação).
const WAIT_STAGE_MS := [0, 60000, 90000, 120000]


## Tempo no relógio da mesa: "0:07", "12:30" e, passando de uma hora, "1:02:05".
static func turn_time_text(ms: float) -> String:
	var total: int = maxi(0, floori(ms / 1000.0))
	var h: int = total / 3600
	var m: int = (total / 60) % 60
	var s: int = total % 60
	return "%d:%02d:%02d" % [h, m, s] if h > 0 else "%d:%02d" % [m, s]


## Nome do formato da partida, para o menu.
static func match_format_name(state: Dictionary) -> String:
	var config: Variant = state.get("config")
	if not config is Dictionary or Txt.of((config as Dictionary).get("format")) == "":
		return ""
	return Txt.of(FORMATS.get(Txt.of((config as Dictionary)["format"]), ""))


## Placar da melhor de três ("Jogo 2 · 1 × 0"); vazio numa partida única.
static func series_text(state: Dictionary) -> String:
	var series: Variant = state.get("match")
	var config: Variant = state.get("config")
	if not series is Dictionary or not config is Dictionary or Txt.of((config as Dictionary).get("matchLength")) != "bo3":
		return ""
	return "Jogo %d · %s" % [int((series as Dictionary).get("gameNumber", 1)), _wins(series)]


static func _wins(series: Dictionary) -> String:
	return " × ".join(PackedStringArray((series.get("wins", []) as Array).map(func(w: Variant) -> String: return str(int(w)))))


## Os selos da barra: quem assiste, o placar da série e quem caiu ({kind, text, label}).
static func match_chips(state: Dictionary) -> Array:
	var chips: Array = []
	if bool(state.get("spectating", false)):
		chips.append({"kind": "spectating", "text": "Assistindo", "label": "Você está assistindo, sem jogar" if bool(state.get("watching", false)) else "Você está assistindo a partida"})
	var series: String = series_text(state)
	if series != "":
		var m: Dictionary = state["match"]
		chips.append({"kind": "series", "text": series, "label": "Jogo %d da melhor de três, placar %s" % [int(m.get("gameNumber", 1)), _wins(m)]})
	var room: Dictionary = state.get("room") if state.get("room") is Dictionary else {}
	var me: Variant = room.get("seat")
	var away: Array = []
	var players: Array = room.get("players", []) if room.get("players") is Array else []
	for i: int in players.size():
		var p: Dictionary = players[i]
		var seat: Variant = p.get("seat") if p.get("seat") != null else i
		var mine: bool = me != null and int(seat) == int(me)
		if not bool(p.get("connected", false)) and not bool(p.get("eliminated", false)) and not mine:
			away.append(p)
	if away.size() == 1:
		var name: String = Txt.of((away[0] as Dictionary).get("name"))
		chips.append({"kind": "offline", "text": "%s desconectado" % name, "label": "%s está desconectado" % name})
	elif away.size() > 1:
		var names: PackedStringArray = PackedStringArray(away.map(func(p: Dictionary) -> String: return Txt.of(p.get("name"))))
		chips.append({"kind": "offline", "text": "%d desconectados" % away.size(), "label": "%s estão desconectados" % ", ".join(names)})
	return chips


static func wait_stage(ms: float) -> int:
	return 3 if ms >= WAIT_STAGE_MS[3] else (2 if ms >= WAIT_STAGE_MS[2] else (1 if ms >= WAIT_STAGE_MS[1] else 0))


## Dica do relógio de espera: "A mesa espera Ana há 2:14".
static func wait_clock_tip(wait: Dictionary) -> String:
	return "A mesa espera %s há %s" % ["você" if bool(wait.get("mine", false)) else Txt.of(wait.get("name")), turn_time_text(float(wait.get("ms", 0)))]


## Aviso para quem está demorando, a partir de 1 min 30 s.
static func wait_nudge_text(wait: Variant) -> String:
	if not wait is Dictionary or not bool((wait as Dictionary).get("mine", false)) or int((wait as Dictionary).get("stage", 0)) < 2:
		return ""
	return "Sua vez já passa de 2 min: a mesa pode votar para pulá-la" if int((wait as Dictionary)["stage"]) >= 3 else "Sua vez já passa de 1 min 30 s"


## A espera mais longa agora ({player, name, mine, ms, stage}) a partir de `waiting` do estado e de quando cada uma
## começou no relógio local (`since`: jogador → ms); {} se a mesa não espera ninguém (ou só a IA).
static func longest_wait(state: Dictionary, since: Dictionary, now_ms: float) -> Dictionary:
	if bool(state.get("gameOver", false)):
		return {}
	var best: Dictionary = {}
	for player: Variant in since:
		var p: Dictionary = {}
		for raw: Variant in state.get("players", []):
			if int((raw as Dictionary).get("id", -1)) == int(player):
				p = raw
		if p.is_empty() or bool(p.get("ai", false)):
			continue
		var ms: float = maxf(0.0, now_ms - float(since[player]))
		if not best.is_empty() and float(best["ms"]) >= ms:
			continue
		var mine: bool = int(player) == int(state.get("you", -1)) and not bool(state.get("watching", false))
		best = {"player": int(player), "name": Txt.of(p.get("name")), "mine": mine, "ms": ms, "stage": wait_stage(ms)}
	return best


## Atualiza quando cada espera começou (relógio local) pelo `waiting` do estado: só reajusta se passar de 2 s.
static func sync_waits(state: Dictionary, since: Dictionary, now_ms: float) -> Dictionary:
	var next: Dictionary = {}
	if bool(state.get("gameOver", false)):
		return next
	for raw: Variant in state.get("waiting", []) if state.get("waiting") is Array else []:
		var entry: Dictionary = raw
		var id: int = int(entry.get("player", -1))
		var ai: bool = false
		for p: Variant in state.get("players", []):
			if int((p as Dictionary).get("id", -1)) == id:
				ai = bool((p as Dictionary).get("ai", false))
		if ai:
			continue
		var start: float = now_ms - maxf(0.0, float(entry.get("ms", 0)))
		var before: Variant = since.get(id)
		next[id] = float(before) if before != null and absf(float(before) - start) <= 2000.0 else start
	return next
