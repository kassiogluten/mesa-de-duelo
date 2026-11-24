# Quais selos uma permanente mostra no campo (P/T, marcadores, palavras-chave, combate, enjoo, ficha, cópia, comandante, mira…), como src/ui/permanentView.ts.
# Só decide o quê e com que cor; quem desenha é CardBadges.
class_name BadgeSpec
extends RefCounted

const RED := Color("#ec5a3f")
const GOLD := Color("#f2b54c")
const GOLD_LIGHT := Color("#ffe2a0")
const INK := Color("#eef1f8")
const DARK := Color(0.035, 0.05, 0.095, 0.92)
const PAPER := Color("#f3efe4")
const PAPER_INK := Color("#1b1a17")
const UP := Color("#1f8a3c")
const DOWN := Color("#c62f17")
const KEYWORD_INK := Color("#cfe6ff")
const MINE := Color("#59b5ff")
const THEIRS := Color("#ff8a3d")


## Selos de canto novos (src/style.css): mutada, preparada, Portador do Anel e Game Changer.
const MUTATED := Color("#b4462f")
const PREPARED := Color("#2f7d6b")
const RING := Color("#f2c14e")
## "Selecionada" na declaração de ataque e de bloqueio (.tag.block-pending).
const PENDING_BG := Color("#e9edf5")
const PENDING_INK := Color("#101b2f")
## O valor que a carta conta (.fx-seal.count e .devotion de src/ui/permanentEffects.css); verde quando o mínimo já vale.
const COUNT_INK := Color("#9fd8ff")
const DEVOTION_INK := Color("#d9c7f0")
const COUNT_MET := Color("#8fe0a2")


## O que vale para todas as cartas de um estado (o de FieldLayout.context e mais: quem é alvo, comandantes, quantos anexos
## e quantas exiladas por permanente, a previsão de lealdade dos planeswalkers atacados e se a partida é de Commander).
static func context(state: Dictionary) -> Dictionary:
	var ctx: Dictionary = FieldLayout.context(state)
	var targets: Dictionary = {}
	for raw: Variant in state.get("stack", []):
		var item: Dictionary = raw
		var t: Variant = item.get("targets")
		if t is Dictionary and (t as Dictionary).get("cards") is Array:
			for id: Variant in (t as Dictionary)["cards"]:
				if not targets.has(int(id)):
					targets[int(id)] = int(item.get("controller", -1))
	var commanders: Dictionary = {}
	var names: Dictionary = {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		names[int(player.get("id", -1))] = Txt.of(player.get("name"))
		if player.get("commanders") is Array:
			for c: Variant in player["commanders"]:
				if c is Dictionary:
					commanders[int((c as Dictionary).get("id", -1))] = true
	var attached: Dictionary = {}
	for host: Variant in ctx["attachments"]:
		attached[int(host)] = (ctx["attachments"][host] as Array).size()
	var exiled: Dictionary = {}
	for host: Variant in ctx["exiled_under"]:
		exiled[int(host)] = (ctx["exiled_under"][host] as Array).size()
	# Previsão do combate (walkerForecast): lealdade agora e depois do dano, por planeswalker.
	var walkers: Dictionary = {}
	if state.get("forecast") is Array:
		for raw: Variant in state["forecast"]:
			if raw is Dictionary and (raw as Dictionary).get("planeswalkers") is Array:
				for w: Variant in (raw as Dictionary)["planeswalkers"]:
					if w is Dictionary and not walkers.has(int((w as Dictionary).get("id", -1))):
						walkers[int((w as Dictionary)["id"])] = w
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var attackers: Dictionary = {}
	if input.get("attacking") is Dictionary and (input["attacking"] as Dictionary).get("attackers") is Array:
		for id: Variant in (input["attacking"] as Dictionary)["attackers"]:
			attackers[int(id)] = true
	ctx["targets"] = targets
	ctx["commanders"] = commanders
	ctx["names"] = names
	ctx["attached"] = attached
	ctx["exiled"] = exiled
	ctx["walkers"] = walkers
	ctx["can_attack"] = attackers
	ctx["commander_rules"] = GameChangers.commander_rules(state)
	return ctx


## Os selos do monte inteiro, na carta de cima: os dela, o "×N" e, num monte de atacantes iguais, o dano somado que vem
## se ninguém bloquear (como .stack-atk no navegador).
static func for_pile(cards: Array, ctx: Dictionary) -> Dictionary:
	var top: Dictionary = cards[cards.size() - 1]
	var spec: Dictionary = for_card(top, ctx, cards.size())
	if cards.size() > 1 and not FieldLayout.grouped_attack(top, ctx).is_empty():
		var damage: int = 0
		for c: Variant in cards:
			damage += FieldLayout.attack_damage(c)
		spec["bottom_mid"] = [{"icon": "sword", "text": str(damage), "bg": RED.darkened(0.18), "fg": Color.WHITE, "border": RED.lightened(0.45),
			"name": "%d atacam juntas: %d de dano se não houver bloqueio" % [cards.size(), damage]}]
	return spec


## Os selos de uma carta do campo. `copies` > 1 na carta de cima de um monte de cópias iguais.
## Volta {corner, tag, counters, keywords, pt, top_right, bottom_mid, aim, pending}; cada selo é {icon?, text?, bg, fg,
## border?, round?}. `pending` é o selo do alto que troca o de combate quando a carta está selecionada na sua declaração de
## ataque ou de bloqueio (a escolha é local: quem decide é a CardBadges, pelo destaque da mesa).
static func for_card(card: Dictionary, ctx: Dictionary, copies: int = 1) -> Dictionary:
	var corner: Array = []
	var tag: Dictionary = {}
	var chips: Array = []
	var keywords: Array = []
	var pt: Dictionary = {}
	var top_right: Array = []
	var aim: String = ""
	var id: int = int(card.get("id", -1))
	var face_down: bool = bool(card.get("faceDown", false))
	# Selos de canto: comandante (coroa), cópia, mutada, ficha e preparada à esquerda; o Anel e a gema à direita.
	if bool(card.get("commander", false)) or (ctx.get("commanders", {}) as Dictionary).has(id):
		corner.append({"icon": "crown", "bg": Color("#e3ad45"), "fg": Color("#2a1a04"), "border": Color("#f7d27a")})
	if Txt.of(card.get("copyOf", "")) != "":
		corner.append({"text": "CÓPIA", "bg": Color("#6a4bc4"), "fg": Color.WHITE})
	var merged: int = (card["merged"] as Array).size() if card.get("merged") is Array else 0
	if merged > 1:
		corner.append({"text": "MUTADA ×%d" % merged, "bg": MUTATED, "fg": Color.WHITE})
	if bool(card.get("token", false)):
		corner.append({"text": "FICHA", "bg": Color("#e8e2d0"), "fg": PAPER_INK})
	if bool(card.get("prepared", false)):
		corner.append({"text": "PREPARADA", "bg": PREPARED, "fg": Color.WHITE})
	if bool(card.get("ringBearer", false)):
		top_right.append({"icon": "ring", "round": true, "bg": Color("#2a1d06"), "fg": RING, "border": Color(RING, 0.7), "name": "Portador do Anel"})
	if game_changer(card, ctx):
		top_right.append({"icon": "gem", "round": true, "bg": Color("#13203a"), "fg": GOLD, "border": Color(GOLD, 0.8), "name": "Game Changer"})
	# Selo do alto, no meio: combate; senão o terreno virado que ainda devolve a mana; senão o enjoo.
	var combat: Array = ctx.get("combat", [])
	var attacked_by: PackedStringArray = []
	for i: int in combat.size():
		var entry: Dictionary = combat[i]
		if int(entry.get("attacker", -1)) == id:
			tag = {"icon": "sword", "text": str(i + 1), "bg": RED, "fg": Color.WHITE}
		elif (entry.get("blockers", []) as Array).has(id) and tag.is_empty():
			tag = {"icon": "shield", "text": str(i + 1), "bg": GOLD, "fg": Color("#2a1600")}
		elif Txt.of(entry.get("defenderKind", "player")) == "card" and int(entry.get("defender", -1)) == id:
			attacked_by.append(str(i + 1))
	if tag.is_empty():
		if not attacked_by.is_empty():
			tag = {"icon": "sword", "text": "Atacado " + ",".join(attacked_by), "bg": RED, "fg": Color.WHITE}
		elif (ctx.get("untappable", {}) as Dictionary).has(id):
			tag = {"icon": "untap", "bg": Color("#e9edf5"), "fg": Color("#101b2f")}
		elif bool(card.get("attacking", false)):
			tag = {"icon": "sword", "bg": RED, "fg": Color.WHITE}
		elif bool(card.get("blocking", false)):
			tag = {"icon": "shield", "bg": GOLD, "fg": Color("#2a1600")}
		elif CardLabels.dizzy(card):
			tag = {"icon": "dizzy", "bare": true, "fg": Color("#c8d4f0")}
	# Marcadores (a lealdade do planeswalker vai no selo de baixo, à direita).
	var counters: Dictionary = card.get("counters", {}) if card.get("counters") is Dictionary else {}
	var planeswalker: bool = bool(card.get("planeswalker", false))
	var counter_keywords: PackedStringArray = []
	var keys: Array = counters.keys()
	keys.sort()
	for k: Variant in keys:
		var key: String = Txt.of(k)
		var n: int = int(counters[k])
		if n <= 0 or (planeswalker and key == "LOYALTY"):
			continue
		var keyword: String = CardLabels.counter_keyword(key)
		if keyword != "":
			counter_keywords.append(keyword)
		var color: Color = UP.lightened(0.35) if key == "P1P1" else (DOWN.lightened(0.3) if key == "M1M1" else GOLD_LIGHT)
		chips.append({"icon": CardLabels.counter_icon(key), "text": str(n), "bg": DARK, "fg": color, "name": CardLabels.counter_name(key)})
	# Palavras-chave (a que vem de um marcador já aparece nele).
	if not face_down:
		for k: String in CardLabels.field_keywords(card):
			if not counter_keywords.has(k):
				keywords.append({"icon": k, "bg": DARK, "fg": KEYWORD_INK, "name": CardLabels.keyword_name(k)})
	# P/T (base x atual, dano em vermelho), lealdade ou nível de Classe.
	if bool(card.get("creature", false)) and card.has("power"):
		var power: int = int(card["power"])
		var toughness: int = int(card.get("toughness", 0))
		var damage: int = int(card.get("damage", 0))
		pt = {"kind": "pt", "power": power, "toughness": toughness - damage, "damage": damage,
			"pcolor": _delta_color(power, card.get("basePower")), "tcolor": DOWN if damage > 0 else _delta_color(toughness, card.get("baseToughness"))}
	elif planeswalker:
		pt = {"kind": "loyalty", "value": int(counters.get("LOYALTY", 0))}
		# Atacado, na declaração de bloqueadores: a lealdade prevista depois do combate ("3 → 1"), se ela cai.
		var walker: Dictionary = (ctx.get("walkers", {}) as Dictionary).get(id, {})
		if not walker.is_empty() and int(walker.get("after", 0)) < int(walker.get("loyalty", 0)):
			pt = {"kind": "loyalty", "value": int(walker["loyalty"]), "after": int(walker["after"]), "lethal": int(walker["after"]) <= 0}
	elif card.has("classLevel") and card["classLevel"] != null:
		pt = {"kind": "level", "value": int(card["classLevel"]), "max": int(card.get("classMaxLevel", 0)) if card.get("classMaxLevel") != null else 0}
	# Canto de cima à direita: o valor que a carta conta, cópias no monte, anexos e cartas exiladas por ela.
	top_right.append_array(count_chips(card, ctx, true))
	if copies > 1:
		top_right.append({"text": "×%d" % copies, "bg": DARK, "fg": INK, "border": Color(GOLD, 0.6)})
	var attached: int = int((ctx.get("attached", {}) as Dictionary).get(id, 0))
	if attached > 1:
		top_right.append({"icon": "clip", "text": str(attached), "bg": DARK, "fg": INK, "border": Color(GOLD, 0.6)})
	var exiled: int = int((ctx.get("exiled", {}) as Dictionary).get(id, 0))
	if exiled > 0:
		top_right.append({"icon": "exile", "text": str(exiled), "bg": DARK, "fg": INK, "border": Color(GOLD, 0.6)})
	# Mira: alvo de algo na pilha (azul se quem mira é você, laranja se é outro).
	var targets: Dictionary = ctx.get("targets", {})
	if targets.has(id):
		aim = "mine" if int(targets[id]) == int(ctx.get("you", 0)) else "theirs"
	# Na sua declaração: a criatura que pode atacar (ou bloquear), quando selecionada, mostra "Selecionada".
	var pending: Dictionary = {}
	if (ctx.get("can_attack", {}) as Dictionary).has(id):
		pending = {"icon": "sword", "text": "Selecionada", "bg": PENDING_BG, "fg": PENDING_INK, "small": true}
	elif (ctx.get("blockers", {}) as Dictionary).has(id):
		pending = {"icon": "shield", "text": "Selecionada", "bg": PENDING_BG, "fg": PENDING_INK, "small": true}
	return {"corner": corner, "tag": tag, "counters": chips, "keywords": keywords, "pt": pt, "top_right": top_right, "bottom_mid": [],
		"aim": aim, "pending": pending}


## Os selos do valor que a carta conta (Terror Tolariano, as Lições, a devoção): os risquinhos (ou o disco da cor da
## devoção) e o número, "2/3" quando há um mínimo, verde quando ele já vale. `name` leva a frase inteira do inspetor.
## `on_field`: no campo, a redução do próprio custo não aparece (a carta já foi conjurada).
static func count_chips(card: Dictionary, ctx: Dictionary, on_field: bool = false) -> Array:
	var controller: int = int(card.get("controller", -1)) if card.get("controller") != null else -1
	var you: int = int(ctx.get("you", -1))
	var owner: Variant = null
	if controller >= 0 and controller != you:
		owner = Txt.of((ctx.get("names", {}) as Dictionary).get(controller, ""))
		if owner == "":
			owner = null
	var out: Array = []
	for raw: Variant in CardCounts.seals(card, owner, on_field):
		var seal: Dictionary = raw
		var devotion: bool = bool(seal["devotion"])
		var icon: String = "tally"
		if devotion and not (seal["colors"] as Array).is_empty():
			icon = "mana_" + "".join(PackedStringArray((seal["colors"] as Array).slice(0, 2).map(func(c: Variant) -> String: return Txt.of(c))))
		var ink: Color = COUNT_MET if bool(seal["met"]) else (DEVOTION_INK if devotion else COUNT_INK)
		out.append({"icon": icon, "text": seal["text"], "bg": DARK, "fg": ink, "border": Color(ink, 0.55), "name": seal["label"]})
	return out


## O selo do comandante na zona de comando, colado embaixo dele: a coroa e a taxa ("+2", "+4"); sem taxa, só a coroa. Lá a
## coroa sai do canto da carta (ela fica no canto só para o comandante no campo).
static func command_seal(tax: int) -> Dictionary:
	var seal: Dictionary = {"icon": "crown", "bg": Color("#1b1300"), "fg": Color("#ffd166"), "border": Color("#c99a3b"),
		"name": "Comandante" if tax <= 0 else "Comandante: custa %d a mais para conjurar" % tax}
	if tax > 0:
		seal["text"] = "+%d" % tax
	return seal


## A taxa de comandante de `id` (commanders do jogador: [{id, name, casts, tax}]); 0 sem taxa.
static func commander_tax(player: Dictionary, id: int) -> int:
	if player.get("commanders") is Array:
		for c: Variant in player["commanders"]:
			if c is Dictionary and int((c as Dictionary).get("id", -1)) == id:
				return int((c as Dictionary).get("tax", 0))
	return 0


## Carta da lista de Game Changers numa partida com as regras do Commander, de frente para cima e que não é ficha.
static func game_changer(card: Dictionary, ctx: Dictionary) -> bool:
	var name: String = Txt.of(card.get("name", ""))
	return bool(ctx.get("commander_rules", false)) and name != "" and not bool(card.get("token", false)) \
		and not bool(card.get("faceDown", false)) and GameChangers.listed(name)


## Verde acima da base, vermelho abaixo, papel quando igual (ou sem base).
static func _delta_color(value: int, base: Variant) -> Color:
	if base == null or int(base) == value:
		return PAPER_INK
	return UP if value > int(base) else DOWN


## Os ícones de todos os selos de uma especificação, na ordem (para os testes conferirem de relance).
static func icons_of(spec: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	for group: String in ["corner", "counters", "keywords", "top_right", "bottom_mid"]:
		for chip: Variant in spec.get(group, []):
			out.append(Txt.of((chip as Dictionary).get("icon", (chip as Dictionary).get("text", ""))))
	if not (spec["tag"] as Dictionary).is_empty():
		out.append("tag:" + Txt.of((spec["tag"] as Dictionary).get("icon", "")))
	if Txt.of(spec["aim"]) != "":
		out.append("aim:" + Txt.of(spec["aim"]))
	return out
