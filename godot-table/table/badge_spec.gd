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


## O que vale para todas as cartas de um estado (o de FieldLayout.context e mais: quem é alvo, comandantes, quantos anexos
## e quantas exiladas por permanente).
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
	var on_field: Dictionary = {}
	var exiled_ids: Dictionary = {}
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		if player.get("commanders") is Array:
			for c: Variant in player["commanders"]:
				if c is Dictionary:
					commanders[int((c as Dictionary).get("id", -1))] = true
		for c: Variant in player.get("battlefield", []):
			on_field[int((c as Dictionary)["id"])] = c
		if player.get("exile") is Array:
			for c: Variant in player["exile"]:
				exiled_ids[int((c as Dictionary)["id"])] = true
	var attached: Dictionary = {}
	for host: Variant in ctx["attachments"]:
		attached[int(host)] = (ctx["attachments"][host] as Array).size()
	var exiled: Dictionary = {}
	for id: Variant in on_field:
		var card: Dictionary = on_field[id]
		if card.get("exiling") is Array:
			var n: int = 0
			for x: Variant in card["exiling"]:
				if exiled_ids.has(int(x)):
					n += 1
			if n > 0:
				exiled[int(id)] = n
	ctx["targets"] = targets
	ctx["commanders"] = commanders
	ctx["attached"] = attached
	ctx["exiled"] = exiled
	return ctx


## Os selos de uma carta do campo. `copies` > 1 na carta de cima de um monte de cópias iguais.
## Volta {corner, tag, counters, keywords, pt, top_right, aim}; cada selo é {icon?, text?, bg, fg, border?}.
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
	# Selos de canto: comandante (coroa), cópia e ficha.
	if bool(card.get("commander", false)) or (ctx.get("commanders", {}) as Dictionary).has(id):
		corner.append({"icon": "crown", "bg": Color("#e3ad45"), "fg": Color("#2a1a04"), "border": Color("#f7d27a")})
	if Txt.of(card.get("copyOf", "")) != "":
		corner.append({"text": "CÓPIA", "bg": Color("#6a4bc4"), "fg": Color.WHITE})
	if bool(card.get("token", false)):
		corner.append({"text": "FICHA", "bg": Color("#e8e2d0"), "fg": PAPER_INK})
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
	elif card.has("classLevel") and card["classLevel"] != null:
		pt = {"kind": "level", "value": int(card["classLevel"]), "max": int(card.get("classMaxLevel", 0)) if card.get("classMaxLevel") != null else 0}
	# Canto de cima à direita: cópias no monte, anexos e cartas exiladas por ela.
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
	return {"corner": corner, "tag": tag, "counters": chips, "keywords": keywords, "pt": pt, "top_right": top_right, "aim": aim}


## Verde acima da base, vermelho abaixo, papel quando igual (ou sem base).
static func _delta_color(value: int, base: Variant) -> Color:
	if base == null or int(base) == value:
		return PAPER_INK
	return UP if value > int(base) else DOWN


## Os ícones de todos os selos de uma especificação, na ordem (para os testes conferirem de relance).
static func icons_of(spec: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	for group: String in ["corner", "counters", "keywords", "top_right"]:
		for chip: Variant in spec[group]:
			out.append(Txt.of((chip as Dictionary).get("icon", (chip as Dictionary).get("text", ""))))
	if not (spec["tag"] as Dictionary).is_empty():
		out.append("tag:" + Txt.of((spec["tag"] as Dictionary).get("icon", "")))
	if Txt.of(spec["aim"]) != "":
		out.append("aim:" + Txt.of(spec["aim"]))
	return out
