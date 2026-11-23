# O que o assento de um jogador mostra, sem desenhar: selos (marcadores, monarca, terrenos…), dano de comandante, reserva de mana, previsão do combate, motivo da derrota e as cartas de cada zona.
class_name SeatInfo
extends RefCounted

## O dano de um mesmo comandante que elimina; de quanto em diante o contador pulsa e de quanto em diante treme.
const COMMANDER_LIMIT := 21
const COMMANDER_NEAR := 15
const COMMANDER_CRITICAL := 18
const POISON_LIMIT := 10
## Veneno que já acende o alerta.
const POISON_DANGER := 7
## Vida que já conta como baixa e quanto falta dos limites para a previsão avisar.
const LOW_LIFE := 5
const NEAR_LIMIT := 2
## Ordem das cores na reserva (a mesma do servidor).
const POOL_ORDER := ["W", "U", "B", "R", "G", "C"]

## Marcadores de jogador conhecidos: nome, ícone (SeatIcons), cor e o que fazem (playerCounters.ts).
const COUNTERS := {
	"POISON": {"name": "Veneno", "icon": "poison", "tone": "#7fd65a"},
	"RAD": {"name": "Radiação", "icon": "rad", "tone": "#d8e04a"},
	"ENERGY": {"name": "Energia", "icon": "energy", "tone": "#ffd34d"},
	"EXPERIENCE": {"name": "Experiência", "icon": "experience", "tone": "#b9a4ff"},
	"TICKET": {"name": "Tíquete", "icon": "ticket", "tone": "#ff9fc7"},
	"CONTRACT": {"name": "Contrato", "icon": "contract", "tone": "#d9c39a"},
}
## O Anel: as habilidades que ele ganha a cada vez que tenta o jogador, da primeira à quarta.
const RING_ABILITIES := [
	"Seu Portador do Anel é lendário e não pode ser bloqueado por criaturas com poder maior.",
	"Sempre que seu Portador do Anel atacar, compre um card e depois descarte um card.",
	"Sempre que seu Portador do Anel ficar bloqueado por uma criatura, o controlador dela a sacrifica no fim do combate.",
	"Sempre que seu Portador do Anel causar dano de combate a um jogador, cada oponente perde 3 pontos de vida.",
]
const MONARCH_HINT := "Monarca: no começo da etapa final, compra um card. Quem causar dano de combate ao monarca passa a ser o monarca."
const INITIATIVE_HINT := "Dianteira: quem a toma, e quem a tem no começo da própria manutenção, se aventura na Undercity. Quem causar dano de combate a esse jogador toma a dianteira."
const BLESSING_HINT := "Bênção da cidade: vem do Ascend, quando o jogador controla dez permanentes, e dura até o fim da partida, mesmo que ele perca permanentes depois."
const MANA_NAMES := {"W": "branca", "U": "azul", "B": "preta", "R": "vermelha", "G": "verde", "C": "incolor"}


## "1:05" ou "1:02:03": tempo de um turno (clock.ts).
static func turn_time_text(ms: float) -> String:
	var total: int = maxi(0, int(floor(ms / 1000.0)))
	var h: int = total / 3600
	var m: int = (total / 60) % 60
	var s: int = total % 60
	return "%d:%02d:%02d" % [h, m, s] if h > 0 else "%d:%02d" % [m, s]


## Nome em português de um marcador de jogador; os desconhecidos com o nome do Forge ("Shield", "Acorn").
static func counter_name(key: String) -> String:
	if COUNTERS.has(key):
		return Txt.of((COUNTERS[key] as Dictionary)["name"])
	return key.substr(0, 1) + key.substr(1).to_lower().replace("_", " ")


static func _counter_hint(key: String, n: int) -> String:
	match key:
		"POISON":
			return "Com 10 marcadores de veneno, o jogador perde." + ("" if n >= 10 else " Faltam %d." % (10 - n))
		"RAD":
			return "No começo da fase principal antes do combate, o jogador coloca %s do grimório no cemitério. Para cada uma que não for terreno, perde 1 de vida e tira 1 marcador de radiação." % ("a carta do topo" if n == 1 else "as %d cartas do topo" % n)
		"ENERGY":
			return "Gasta para pagar custos com o símbolo de energia."
		"EXPERIENCE":
			return "Fica com o jogador para sempre; algumas cartas ficam mais fortes com ela."
		"TICKET":
			return "Gasta para pagar custos com o símbolo de tíquete."
		"CONTRACT":
			return "Marcador de contrato no jogador."
	return ""


## Quantas vezes o Anel tentou e o que ele já faz (as habilidades acumulam até a quarta).
static func ring_text(tempted: int) -> String:
	var times: String = "1 vez" if tempted == 1 else "%d vezes" % tempted
	return "O Anel tentou %s. %s" % [times, " ".join(PackedStringArray(RING_ABILITIES.slice(0, mini(tempted, 4))))]


## Total de mágicas conjuradas no turno, só quando alguma carta à vista as conta (Tempestade); senão -1 (playerStatus.ts).
static func spells_total(players: Array) -> int:
	var counts: bool = false
	var total: int = 0
	for raw: Variant in players:
		var p: Dictionary = raw
		total += int(p.get("spellsCast", 0))
		for zone: String in ["battlefield", "hand", "commandZone"]:
			for card: Variant in _list(p, zone):
				if bool((card as Dictionary).get("countsSpells", false)):
					counts = true
	return total if counts else -1


## "0 de 1" ou "2, sem limite": terrenos jogados no turno e quantos pode jogar.
static func lands_text(p: Dictionary) -> String:
	var played: int = int(p.get("landsPlayed", 0))
	return "%d, sem limite" % played if int(p.get("maxLands", 1)) == -1 else "%d de %d" % [played, int(p.get("maxLands", 1))]


## Os selos do jogador, na ordem da mesa do navegador: marcadores (veneno, radiação, o resto), o Anel, proteções,
## monarca, dianteira, bênção, velocidade, terrenos (só no turno dele), mágicas do turno e o tempo do turno.
## Cada selo: {key, icon, text, sub, tone, hint, danger, done}. `elapsed_ms`: quanto o turno atual já durou.
static func badges(p: Dictionary, state: Dictionary, elapsed_ms: float = -1.0) -> Array:
	var out: Array = []
	var counters: Dictionary = p.get("counters", {}) if p.get("counters") is Dictionary else {}
	var keys: Array = counters.keys().filter(func(k: Variant) -> bool: return int(counters[k]) > 0)
	var rank: Callable = func(k: Variant) -> int: return 0 if k == "POISON" else (1 if k == "RAD" else 2)
	# sort_custom não é estável: o índice original desempata para os outros manterem a ordem em que vieram.
	var original: Array = keys.duplicate()
	keys.sort_custom(func(a: Variant, b: Variant) -> bool:
		return rank.call(a) < rank.call(b) or (rank.call(a) == rank.call(b) and original.find(a) < original.find(b)))
	for raw_key: Variant in keys:
		var key: String = Txt.of(raw_key)
		var n: int = int(counters[raw_key])
		var known: Dictionary = COUNTERS.get(key, {})
		var limit: String = "/10" if key == "POISON" else ""
		var hint: String = ("%s: %d%s. %s" % [counter_name(key), n, " de 10" if key == "POISON" else "", _counter_hint(key, n)]).strip_edges()
		out.append(_badge(key, Txt.of(known.get("icon", "disc")), str(n), limit, Txt.of(known.get("tone", "#c9c3b5")), hint, key == "POISON" and n >= POISON_DANGER))
	var ring: int = int(p.get("ringTempted", 0))
	if ring > 0:
		out.append(_badge("RING", "ring", str(ring), "", "#f0c75e", ring_text(ring)))
	for raw: Variant in _list(p, "protections"):
		var prot: Dictionary = raw
		var kind: String = Txt.of(prot.get("kind"))
		var title: String = "Resistência à magia" if kind == "hexproof" else ("Manto" if kind == "shroud" else "Proteção")
		var from: String = Txt.of(prot.get("from"))
		var source: String = Txt.of(prot.get("source"))
		var hint: String = title + (" contra tudo" if from == "everything" else (" contra " + from if from != "" else "")) + ("" if source == "" else " (de %s)" % source) + "."
		out.append(_badge("PROTECTION:" + kind, "shield", "", "", "#dfe8f5" if kind == "protection" else "#9fd3ff", hint))
	if bool(p.get("monarch", false)):
		out.append(_badge("MONARCH", "monarch", "Monarca", "", "#f0b84a", MONARCH_HINT))
	if bool(p.get("initiative", false)):
		out.append(_badge("INITIATIVE", "initiative", "Dianteira", "", "#e8a15c", INITIATIVE_HINT))
	if bool(p.get("blessing", false)):
		out.append(_badge("BLESSING", "blessing", "Bênção", "", "#f3e2a0", BLESSING_HINT))
	var speed: int = int(p.get("speed", 0))
	if speed > 0:
		var speed_hint: String = "Velocidade %d de 4. %s" % [speed, "Velocidade máxima: as habilidades de velocidade máxima estão ligadas." if speed >= 4 else "Sobe 1, no máximo uma vez por turno, quando um oponente perde vida no turno deste jogador. Com 4, ligam as habilidades de velocidade máxima."]
		out.append(_badge("SPEED", "speed", str(speed), "/4", "#ff8a5c" if speed >= 4 else "#9fd3ff", speed_hint))
	var active: Variant = state.get("activePlayer")
	var is_active: bool = active != null and int(active) == int(p.get("id", -1)) and not bool(state.get("gameOver", false))
	if is_active and p.has("maxLands"):
		var played: int = int(p.get("landsPlayed", 0))
		var max_lands: int = int(p.get("maxLands", 1))
		var done: bool = max_lands != -1 and played >= max_lands
		var lands: Dictionary = _badge("LANDS", "land", str(played), "/∞" if max_lands == -1 else "/%d" % max_lands, "#a7d08c",
			"Terrenos jogados neste turno: %s.%s" % [lands_text(p), " Não dá para jogar outro terreno neste turno." if done else ""])
		lands["done"] = done
		out.append(lands)
	var total: int = spells_total(state.get("players", []))
	var mine_spells: int = int(p.get("spellsCast", 0))
	if total >= 0 and mine_spells > 0:
		var spells_hint: String = ("1 mágica conjurada" if mine_spells == 1 else "%d mágicas conjuradas" % mine_spells) + " neste turno." + (" Na mesa, %d no total, a conta da Tempestade." % total if total > mine_spells else "")
		out.append(_badge("SPELLS", "spells", str(mine_spells), "", "#8fc8ff", spells_hint))
	if is_active and elapsed_ms >= 0.0:
		out.append(_badge("TURN", "hourglass", turn_time_text(elapsed_ms), "", "#f0b84a", "Turno atual: %s." % turn_time_text(elapsed_ms)))
	elif not is_active and p.get("lastTurnMs") != null and p.has("lastTurnMs"):
		var last: String = turn_time_text(float(p["lastTurnMs"]))
		out.append(_badge("LASTTURN", "hourglass", last, "", "#b8b2a6", "Último turno: durou %s." % last))
	return out


static func _badge(key: String, icon: String, text: String, sub: String, tone: String, hint: String, danger: bool = false) -> Dictionary:
	return {"key": key, "icon": icon, "text": text, "sub": sub, "tone": tone, "hint": hint, "danger": danger, "done": false}


## O maior dano de comandante recebido: {highest, text ("Dano 12/21", vazio sem dano), level (0, 1 pulsa, 2 treme)}.
static func commander_damage(p: Dictionary) -> Dictionary:
	var highest: int = 0
	for raw: Variant in _list(p, "commanderDamage"):
		highest = maxi(highest, int((raw as Dictionary).get("damage", 0)))
	var level: int = 2 if highest >= COMMANDER_CRITICAL else (1 if highest >= COMMANDER_NEAR else 0)
	return {"highest": highest, "text": "Dano %d/%d" % [highest, COMMANDER_LIMIT] if highest > 0 else "", "level": level}


## Uma linha por comandante que causou dano: {name, owner, damage, text}, o nome pelo `name_of` (já em português).
static func commander_lines(state: Dictionary, p: Dictionary, name_of: Callable) -> Array:
	var out: Array = []
	var you: int = int(state.get("you", -1))
	for raw: Variant in _list(p, "commanderDamage"):
		var hit: Dictionary = raw
		var id: int = int(hit.get("commanderId", -1))
		var owner: String = ""
		var name: String = ""
		for other: Variant in state.get("players", []):
			for c: Variant in _list(other as Dictionary, "commanders"):
				if int((c as Dictionary).get("id", -2)) == id:
					owner = "você" if int((other as Dictionary)["id"]) == you else Txt.of((other as Dictionary).get("name"))
					name = Txt.of((c as Dictionary).get("name"))
		name = Txt.of(name_of.call(name)) if name != "" else "Comandante %d" % id
		var damage: int = int(hit.get("damage", 0))
		out.append({"name": name, "owner": owner, "damage": damage, "text": "%d / %d" % [damage, COMMANDER_LIMIT]})
	return out


## A reserva de mana: um pip por cor com mana, {color, count, label, message}; pagando um custo (só na sua), cada pip
## leva a mensagem que gasta uma mana dela ({type:"mana", color, gen}).
static func pool_pips(p: Dictionary, state: Dictionary) -> Array:
	var pool: Dictionary = p.get("pool", {}) if p.get("pool") is Dictionary else {}
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var spend: bool = int(p.get("id", -1)) == int(state.get("you", -2)) and bool(input.get("paying", false))
	var out: Array = []
	var colors: Array = POOL_ORDER.duplicate()
	for key: Variant in pool.keys():
		if not colors.has(key):
			colors.append(key)
	for color: Variant in colors:
		var n: int = int(pool.get(color, 0))
		if n <= 0:
			continue
		var name: String = Txt.of(MANA_NAMES.get(color, color))
		var pip: Dictionary = {"color": Txt.of(color), "count": n, "label": "×%d" % n if n > 1 else "", "message": {},
			"hint": "Mana %s na reserva: %d." % [name, n]}
		if spend:
			pip["message"] = {"type": "mana", "color": Txt.of(color), "gen": int(input.get("gen", 0))}
			pip["hint"] = "Usar mana %s da reserva (%d disponíve%s)." % [name, n, "is" if n > 1 else "l"]
		out.append(pip)
	return out


## A previsão do combate do jogador (state.forecast), ou {}.
static func forecast_of(state: Dictionary, player_id: int) -> Dictionary:
	for raw: Variant in _list(state, "forecast"):
		if int((raw as Dictionary).get("player", -1)) == player_id:
			return raw
	return {}


static func _commander_hits(f: Dictionary) -> Array:
	return _list(f, "commander").filter(func(c: Dictionary) -> bool: return int(c.get("after", 0)) > int(c.get("damage", 0)))


## O selo da previsão ao lado da vida: {text, level ("lethal", "low", "safe" ou "")} (combatForecast.ts); `compact`
## (o seu retrato) mostra só o que pesa mais.
static func forecast_badge(f: Dictionary, compact: bool = false) -> Dictionary:
	var life_loss: bool = int(f.get("lifeAfter", 0)) < int(f.get("life", 0))
	var poison_gain: bool = int(f.get("poisonAfter", 0)) > int(f.get("poison", 0))
	var hits: Array = _commander_hits(f)
	if not life_loss and not poison_gain and hits.is_empty():
		return {"text": "Sem dano", "level": "safe"}
	var near_commander: bool = hits.any(func(c: Dictionary) -> bool: return int(c["after"]) >= COMMANDER_LIMIT - NEAR_LIMIT)
	var reason: String = Txt.of(f.get("lethal"))
	if reason == "":
		if life_loss and int(f["lifeAfter"]) <= LOW_LIFE:
			reason = "life"
		elif poison_gain and int(f["poisonAfter"]) >= POISON_LIMIT - NEAR_LIMIT:
			reason = "poison"
		elif near_commander:
			reason = "commander"
		else:
			reason = "life" if life_loss else ("poison" if poison_gain else "commander")
	var level: String = "lethal" if Txt.of(f.get("lethal")) != "" else ""
	if level == "":
		var low: bool = (life_loss and int(f["lifeAfter"]) <= LOW_LIFE) if reason == "life" else ((int(f.get("poisonAfter", 0)) >= POISON_LIMIT - NEAR_LIMIT) if reason == "poison" else near_commander)
		level = "low" if low else ""
	var parts: PackedStringArray = []
	if life_loss and (not compact or reason == "life"):
		parts.append("→ %d" % int(f["lifeAfter"]))
	if poison_gain and (not compact or reason == "poison"):
		parts.append("Veneno %d/%d" % [int(f["poisonAfter"]), POISON_LIMIT])
	if not hits.is_empty() and (not compact or reason == "commander"):
		var worst: int = 0
		for c: Variant in hits:
			worst = maxi(worst, int((c as Dictionary)["after"]))
		parts.append("Comandante %d/%d" % [worst, COMMANDER_LIMIT])
	if level == "lethal":
		parts.append("Letal!")
	return {"text": "  ".join(parts), "level": level}


## O motivo da derrota, para vir depois de "Eliminado:" (lossReason.ts); vazio sem motivo conhecido.
static func loss_reason_text(state: Dictionary, p: Dictionary, mine: bool, name_of: Callable) -> String:
	match Txt.of(p.get("lossReason")):
		"LifeReachedZero":
			return "sua vida chegou a 0" if mine else "a vida chegou a 0"
		"CommanderDamage":
			var best: Dictionary = {}
			for line: Variant in commander_lines(state, p, name_of):
				if int((line as Dictionary)["damage"]) >= COMMANDER_LIMIT and int((line as Dictionary)["damage"]) > int(best.get("damage", 0)):
					best = line
			return "%d de dano de comandante de %s" % [int(best["damage"]), Txt.of(best["name"])] if not best.is_empty() else "21 de dano de comandante"
		"Poisoned":
			var counters: Dictionary = p.get("counters", {}) if p.get("counters") is Dictionary else {}
			return "%d marcadores de veneno" % maxi(10, int(counters.get("POISON", 0)))
		"Milled":
			return "você tentou comprar uma carta sem cartas no grimório" if mine else "tentou comprar uma carta sem cartas no grimório"
		"SpellEffect":
			return "efeito de %s" % Txt.of(name_of.call(Txt.of(p["lossCard"]))) if Txt.of(p.get("lossCard")) != "" else "efeito de uma carta"
		"OpponentWon":
			var who: String = Txt.of(p.get("lossWinner")) if Txt.of(p.get("lossWinner")) != "" else "outro jogador"
			return "%s venceu com %s" % [who, Txt.of(name_of.call(Txt.of(p["lossCard"])))] if Txt.of(p.get("lossCard")) != "" else "%s venceu a partida" % who
		"Conceded":
			return "você desistiu" if mine else "desistiu"
		"IntentionalDraw":
			return "empate combinado"
	return ""


## O jogador caiu da sala (state.room.players com connected false), pelo id, pelo assento ou pelo nome.
static func offline(state: Dictionary, p: Dictionary) -> bool:
	var room: Variant = state.get("room")
	if not room is Dictionary:
		return false
	for raw: Variant in _list(room as Dictionary, "players"):
		var rp: Dictionary = raw
		var same: bool = false
		if rp.get("playerId") != null and rp.has("playerId"):
			same = int(rp["playerId"]) == int(p.get("id", -1))
		elif rp.has("seat") and p.has("seat"):
			same = int(rp["seat"]) == int(p["seat"])
		else:
			same = Txt.of(rp.get("name")) == Txt.of(p.get("name"))
		if same:
			return rp.has("connected") and not bool(rp["connected"])
	return false


## As cartas de uma zona do jogador para a janela ("graveyard", "exile", "command", "hand"), a de cima primeiro.
## Cada uma: {card, tag, note, usable}; na zona de comando o comandante leva a taxa (tag) e as conjurações (note).
static func zone_cards(state: Dictionary, p: Dictionary, zone: String) -> Array:
	var out: Array = []
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var usable_ids: Array = []
	for list: String in ["actionable", "selectable"]:
		usable_ids.append_array(input.get(list, []) if input.get(list) is Array else [])
	var suspended: Array = state.get("suspendedExile", []) if state.get("suspendedExile") is Array else []
	var playable: Array = []
	for list: String in ["castable", "playableExile"]:
		playable.append_array(state.get(list, []) if state.get(list) is Array else [])
	var cards: Array = []
	match zone:
		"graveyard", "exile":
			cards = _list(p, zone).duplicate()
			cards.reverse()
		"hand":
			cards = _list(p, "revealedHand")
		"command":
			cards = _list(p, "commandZone").duplicate()
			if p.get("companion") is Dictionary:
				cards.append(p["companion"])
			cards.append_array(_list(p, "emblems"))
	for raw: Variant in cards:
		var card: Dictionary = raw
		var id: int = int(card.get("id", -1))
		var tag: String = ""
		var note: String = ""
		if zone == "command":
			for c: Variant in _list(p, "commanders"):
				if int((c as Dictionary).get("id", -2)) == id:
					var casts: int = int((c as Dictionary).get("casts", 0))
					tag = "Taxa +%d" % int((c as Dictionary).get("tax", 0))
					note = "Nunca conjurado" if casts == 0 else ("Conjurado 1 vez" if casts == 1 else "Conjurado %d vezes" % casts)
			if tag == "" and bool(card.get("emblem", false)):
				tag = "Emblema"
			elif tag == "" and p.get("companion") is Dictionary and int((p["companion"] as Dictionary).get("id", -2)) == id:
				tag = "Companheiro"
		elif suspended.has(id):
			var counters: Dictionary = card.get("counters", {}) if card.get("counters") is Dictionary else {}
			var time: int = int(counters.get("TIME", 0))
			tag = "Suspensa · %d" % time if time > 0 else "Na pilha"
		elif bool(card.get("plotted", false)):
			tag = "Tramada"
		elif bool(card.get("foretold", false)):
			tag = "Prevista" + (" " + Txt.of(card["foretellCost"]) if Txt.of(card.get("foretellCost")) != "" else "")
		elif Txt.of(card.get("preparedFrom")) != "":
			tag = "Preparado"
		elif card.get("returns") is Dictionary:
			var step: String = Txt.of((card["returns"] as Dictionary).get("step"))
			tag = "Volta" + (" na etapa final" if step == "end" else (" na manutenção" if step == "upkeep" else ""))
		if tag == "" and playable.has(id) and zone != "hand":
			tag = "Jogar"
		out.append({"card": card, "tag": tag, "note": note, "usable": zone != "hand" and usable_ids.has(id)})
	return out


## A zona de onde vem uma carta do cemitério, do exílio ou do comando: {player, zone}, ou {} se não está em nenhuma.
static func owner_zone(state: Dictionary, card_id: int) -> Dictionary:
	for raw: Variant in state.get("players", []):
		var p: Dictionary = raw
		for zone: String in ["graveyard", "exile", "commandZone"]:
			for c: Variant in _list(p, zone):
				if int((c as Dictionary).get("id", -1)) == card_id:
					return {"player": int(p["id"]), "zone": "command" if zone == "commandZone" else zone}
	return {}


static func _list(d: Dictionary, key: String) -> Array:
	return d.get(key, []) if d.get(key) is Array else []
