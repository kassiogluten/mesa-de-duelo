# Texto e botões da caixa de ação (porte de boardPrompt em src/ui/tableActionBox.ts, de buttons em src/ui/actionPanel.ts,
# de passLabel em src/ui/phaseHud.ts e de cardDecision em src/ui/decisionPrompt.ts): o que pedir e o que cada botão manda.
class_name ActionBox
extends RefCounted

## Grupo de cada etapa (STEPS de src/ui/phaseHud.ts).
const GROUPS := {
	"UNTAP": "start", "UPKEEP": "start", "DRAW": "start", "MAIN1": "main1",
	"COMBAT_BEGIN": "combat", "COMBAT_DECLARE_ATTACKERS": "combat", "COMBAT_DECLARE_BLOCKERS": "combat",
	"COMBAT_FIRST_STRIKE_DAMAGE": "combat", "COMBAT_DAMAGE": "combat", "COMBAT_END": "combat",
	"MAIN2": "main2", "END_OF_TURN": "end", "CLEANUP": "end",
}
const NEXT_LABEL := {
	"UNTAP": "Para o início extra", "UPKEEP": "Para a manutenção extra", "DRAW": "Comprar", "MAIN1": "Para a principal 1",
	"COMBAT_BEGIN": "Para o combate extra", "MAIN2": "Para a principal 2", "END_OF_TURN": "Para a etapa final", "CLEANUP": "Para a etapa final",
}
const COMBAT_CLOSING: PackedStringArray = ["COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"]
const ZONE_NAMES := {"Hand": "Mão", "Library": "Grimório", "Graveyard": "Cemitério", "Exile": "Exílio"}
const ZONE_WITH_ARTICLE := {"Hand": "a mão", "Library": "o grimório", "Graveyard": "o cemitério", "Exile": "o exílio"}
## Improvisar, convocar e dobrar água (src/ui/decisionPrompt.ts): título, explicação e o que já foi escolhido.
const TAP_TITLES := {"improvise": "Improvisar", "convoke": "Convocar", "waterbend": "Dobrar água"}
const TAP_HOW := {
	"improvise": "Toque nos artefatos que vão ajudar a pagar: cada um virado paga {1}.",
	"convoke": "Toque nas criaturas que vão ajudar a pagar: cada uma virada paga {1} ou um símbolo de mana da cor dela.",
	"waterbend": "Toque nos artefatos e criaturas que vão ajudar a pagar: cada um virado paga {1}.",
}
const TAPPED := {
	"improvise": ["Nenhum artefato escolhido", "artefato escolhido", "artefatos escolhidos"],
	"convoke": ["Nenhuma criatura escolhida", "criatura escolhida", "criaturas escolhidas"],
	"waterbend": ["Nenhuma permanente escolhida", "permanente escolhida", "permanentes escolhidas"],
}


static func _input(state: Dictionary) -> Dictionary:
	return state.get("input", {}) if state.get("input") is Dictionary else {}


static func _list(value: Variant) -> Array:
	return value if value is Array else []


static func _button(input: Dictionary, key: String) -> Dictionary:
	var b: Dictionary = input.get(key, {}) if input.get(key) is Dictionary else {}
	return {"label": Txt.of(b.get("label")), "enabled": bool(b.get("enabled", false))}


static func _me(state: Dictionary) -> Dictionary:
	for raw: Variant in _list(state.get("players")):
		if raw is Dictionary and (raw as Dictionary).get("id") == state.get("you"):
			return raw
	return {}


## Pedido já respondido: os dois botões apagados e nada para tocar, pagar ou escolher.
static func _answered(input: Dictionary) -> bool:
	return not _button(input, "ok")["enabled"] and not _button(input, "cancel")["enabled"] and not bool(input.get("priority", false)) \
		and not bool(input.get("paying", false)) and input.get("opening") == null and input.get("targeting") == null and input.get("selection") == null \
		and input.get("tapToPay") == null and _list(input.get("selectable")).is_empty() and _list(input.get("selectableStacks")).is_empty() \
		and _list(input.get("selectablePlayers")).is_empty()


## Escolha de cartas no campo ou na mão (descartar, sacrificar…): {in_hand, progress, instruction}, ou {}.
static func decision(state: Dictionary) -> Dictionary:
	var input: Dictionary = _input(state)
	var selection: Variant = input.get("selection")
	if not selection is Dictionary or bool(state.get("gameOver", false)) or state.get("question") != null or input.get("opening") != null or bool(input.get("priority", false)):
		return {}
	var low: int = int((selection as Dictionary).get("min", 0))
	var high: int = int((selection as Dictionary).get("max", 0))
	var count: int = _list((selection as Dictionary).get("cards")).size()
	var tap: Variant = input.get("tapToPay")
	if tap is Dictionary:
		var words: Array = TAPPED.get(Txt.of((tap as Dictionary).get("kind")), TAPPED["convoke"])
		var unpaid: bool = not Re.test(r"^(\{0\}|0)?$", Txt.of((tap as Dictionary).get("remaining")).strip_edges())
		return {
			"in_hand": false,
			"progress": words[0] if count == 0 else "%d %s" % [count, words[1] if count == 1 else words[2]],
			"instruction": "Confirme para pagar o resto com mana." if unpaid else "Confirme para conjurar.",
		}
	var remaining: int = maxi(0, low - count)
	var hand: Array = _list(_me(state).get("hand")).map(func(c: Dictionary) -> Variant: return c.get("id"))
	var candidates: Array = _list(input.get("selectable")) + _list((selection as Dictionary).get("cards"))
	var in_hand: bool = not candidates.is_empty() and candidates.all(func(id: Variant) -> bool: return hand.has(id))
	var progress: String
	if low == high:
		progress = "%d de %d %s" % [count, high, "carta selecionada" if high == 1 else "cartas selecionadas"]
	else:
		progress = "%d %s · mínimo %d, máximo %d" % [count, "carta selecionada" if count == 1 else "cartas selecionadas", low, high]
	var instruction: String
	if remaining > 0:
		instruction = "Escolha %s." % ("mais uma carta" if remaining == 1 else "mais %d cartas" % remaining)
	else:
		instruction = "Você pode confirmar a seleção." if _button(input, "ok")["enabled"] else "Selecione as cartas indicadas."
	return {"in_hand": in_hand, "progress": progress, "instruction": instruction}


static func _plural_cards(text: String) -> String:
	var out: String = text
	for m: RegExMatch in Re.compile(r"(\d+)\s+carta\(s\)").search_all(text):
		out = out.replace(m.get_string(), "%s %s" % [m.get_string(1), "carta" if int(m.get_string(1)) == 1 else "cartas"])
	return out


## O pedido antes de virar frase curta (boardPrompt): vazio quando os botões e a mesa já dizem tudo.
static func prompt(state: Dictionary, blocker_name: String) -> String:
	var input: Dictionary = _input(state)
	var opening: Variant = input.get("opening")
	if bool(state.get("gameOver", false)):
		return ""
	if input.get("attacking") != null:
		return "Escolha as criaturas que vão atacar." if _list(state.get("players")).size() <= 2 else "Selecione suas criaturas e escolha quem atacar."
	var move: Variant = input.get("commanderMove")
	if move is Dictionary:
		var to: String = Txt.of((move as Dictionary).get("to"))
		var where: String = Txt.of(ZONE_WITH_ARTICLE.get(to, to))
		return "Seu comandante %s%s. Para onde vai?" % ["está n" if bool((move as Dictionary).get("stays", false)) else "iria para ", where]
	if input.get("suspendCast") != null:
		return "Suspender: conjure agora sem pagar o custo de mana ou deixe a carta no exílio."
	if input.get("blocking") != null:
		return "%s: escolha o atacante. Se já estiver bloqueando esse atacante, o clique remove o bloqueio." % blocker_name if blocker_name != "" else "Escolha uma criatura sua e depois o atacante que ela vai bloquear."
	if bool(input.get("priority", false)) and not bool(input.get("paying", false)) and input.get("targeting") == null:
		return ""
	if input.get("openingWait") != null:
		return ""
	if opening in ["starting-player", "play-draw", "mulligan"] or (opening == "mulligan-bottom" and input.get("openingReturnCount") != null):
		return ""
	if _answered(input):
		return ""
	if opening == "mulligan-bottom":
		return _plural_cards(Txt.of(input.get("message")))
	var tap: Variant = input.get("tapToPay")
	if tap is Dictionary:
		return tap_to_pay_message(tap, Txt.of(ShortInstruction.dig(input, "card", "name")))
	return Txt.of(input.get("message"))


## Improvisar, convocar e dobrar água: o pedido do Forge em inglês vira título e explicação (tapToPayMessage).
static func tap_to_pay_message(tap: Dictionary, card_name: String) -> String:
	var kind: String = Txt.of(tap.get("kind"))
	var remaining: String = Txt.of(tap.get("remaining"))
	var unpaid: bool = not Re.test(r"^(\{0\}|0)?$", remaining.strip_edges())
	return "%s%s\n%s %s" % [TAP_TITLES.get(kind, "Convocar"), ": %s" % card_name if card_name != "" else "", TAP_HOW.get(kind, ""), "Falta pagar %s." % remaining if unpaid else "O custo já está todo pago."]


## Tira os números de carta do Forge ("Raio (12) - ..." → "Raio - ...").
static func without_card_ids(text: String) -> String:
	return Re.replace_all(r" \(\d+\)", text, "")


## O que a caixa mostra: {short (frase em português, ou ""), detail (texto do Forge consertado), progress, instruction}.
static func text(state: Dictionary, blocker_name: String, translate: Callable) -> Dictionary:
	var input: Dictionary = _input(state)
	var asked: String = prompt(state, blocker_name)
	var choice: Dictionary = decision(state)
	var short: Variant = null
	if not choice.is_empty() and input.get("tapToPay") == null:
		var request: Variant = ForgeRequest.selection_request(asked)
		short = (request as Dictionary)["text"] if request is Dictionary else null
	elif choice.is_empty() and asked != "":
		var data: Dictionary = input.duplicate()
		if bool(input.get("paying", false)):
			data["reserve"] = ShortInstruction.pool_cost(_me(state).get("pool"))
			data["counters"] = ShortInstruction.countered_unless_paid(input, state.get("stack", []), state.get("you"), translate)
		short = ShortInstruction.short_instruction(data, translate)
	var names: Array = _list(state.get("players")).map(func(p: Dictionary) -> String: return Txt.of(p.get("name")))
	var detail: String = without_card_ids(ForgeText.fix_possessives(_plural_cards(asked), names)).strip_edges()
	var forecast: String = ""
	if input.get("blocking") != null:
		for raw: Variant in _list(state.get("forecast")):
			if (raw as Dictionary).get("player") == state.get("you"):
				forecast = forecast_text(raw, "", translate, state)
	return {
		"short": Txt.of(short),
		"detail": detail,
		"forecast": forecast,
		"progress": Txt.of(choice.get("progress")),
		"instruction": Txt.of(choice.get("instruction")),
	}


## Para onde vai o botão de passar a prioridade (passLabel).
static func pass_label(state: Dictionary) -> String:
	if not _list(state.get("stack")).is_empty():
		return "Resolver"
	if state.get("activePlayer") != state.get("you"):
		return "Passar"
	var phase: String = Txt.of(state.get("phase"))
	var group: String = Txt.of(GROUPS.get(phase, ""))
	var closing: bool = COMBAT_CLOSING.has(phase)
	var extra_after: Dictionary = state.get("extraPhaseAfter", {}) if state.get("extraPhaseAfter") is Dictionary else {}
	var next: Variant = (extra_after.get("COMBAT_END") if closing else null) if group == "combat" else extra_after.get(phase)
	if next != null and NEXT_LABEL.has(Txt.of(next)):
		return NEXT_LABEL[Txt.of(next)]
	if phase == "UPKEEP":
		return "Comprar"
	var after: Array = _list(state.get("extraCombatAfter"))
	if (closing and after.has("COMBAT_END")) or (group == "main1" and after.has("MAIN1")) or (group == "main2" and after.has("MAIN2")):
		return "Para o combate extra"
	var attacking: bool = _list(state.get("combat")).size() > 0 if state.has("combat") else true
	if phase == "COMBAT_BEGIN":
		var can_attack: bool = _list(_me(state).get("battlefield")).any(func(c: Dictionary) -> bool: return bool(c.get("creature", false)) and not bool(c.get("tapped", false)) and not bool(c.get("sick", false)))
		return "Para o ataque" if can_attack else "Para a principal 2"
	if phase == "COMBAT_DECLARE_ATTACKERS" and attacking:
		return "Para os bloqueios"
	if phase == "COMBAT_DECLARE_BLOCKERS" and attacking:
		return "Para o dano"
	return {"start": "Para a principal 1", "main1": "Para o combate", "combat": "Para a principal 2", "main2": "Para a etapa final"}.get(group, "Passar")


static func block_confirm_label(state: Dictionary) -> String:
	var mine: Array = _list(_me(state).get("battlefield")).map(func(c: Dictionary) -> Variant: return c.get("id"))
	var blockers: Dictionary = {}
	for entry: Variant in _list(state.get("combat")):
		for id: Variant in _list((entry as Dictionary).get("blockers")):
			if mine.has(id):
				blockers[id] = true
	var n: int = blockers.size()
	return "Confirmar %d %s" % [n, "bloqueador" if n == 1 else "bloqueadores"] if n > 0 else "Sem bloqueio"


static func attack_confirm_label(attackers: int) -> String:
	return "Confirmar %d %s" % [attackers, "atacante" if attackers == 1 else "atacantes"] if attackers > 0 else "Não atacar"


## Por quem a mesa espera (waitingOnText de src/ui/awaitingDecision.ts).
static func waiting_on(state: Dictionary) -> String:
	if bool(state.get("gameOver", false)):
		return ""
	for raw: Variant in _list(state.get("deciding")):
		var entry: Dictionary = raw
		if entry.get("player") == state.get("you"):
			continue
		var name: String = "Oponente"
		for p: Variant in _list(state.get("players")):
			if (p as Dictionary).get("id") == entry.get("player"):
				name = Txt.of((p as Dictionary).get("name"))
		match Txt.of(entry.get("kind")):
			"attack":
				return "Aguardando %s declarar atacantes…" % name
			"block":
				return "Aguardando %s declarar bloqueadores…" % name
			_:
				return "Aguardando %s escolher…" % name
	return ""


## O jogo espera a escolha de um jogador e nada mais (o oponente que decide, quem começa).
static func choosing_player(input: Dictionary) -> bool:
	return not _list(input.get("selectablePlayers")).is_empty() and _list(input.get("selectable")).is_empty() and _list(input.get("selectableStacks")).is_empty() \
		and not bool(input.get("priority", false)) and input.get("opening") == null and input.get("targeting") == null and not bool(input.get("paying", false)) \
		and input.get("attacking") == null and input.get("blocking") == null and input.get("vote") == null and input.get("selection") == null


## Os botões, na ordem da mesa do navegador (o principal por último): [{label, enabled, primary, message}].
## `message` vazio é um rótulo de espera, sem ação.
static func buttons(state: Dictionary, translate: Callable) -> Array:
	var input: Dictionary = _input(state)
	var gen: int = int(input.get("gen", 0))
	if bool(state.get("gameOver", false)) or state.get("question") != null:
		return []
	if bool(state.get("spectating", false)):
		return [_waiting("Você foi eliminado. Acompanhando a partida.")]
	if bool(state.get("watching", false)):
		return [_waiting("Assistindo à partida.")]
	var you: Variant = state.get("you")
	if input.get("opening") == "starting-player" or choosing_player(input):
		var out: Array = []
		for p: Variant in _list(state.get("players")):
			var player: Dictionary = p
			if _list(input.get("selectablePlayers")).has(player.get("id")):
				var mine: bool = player.get("id") == you
				out.append({"label": "%s%s" % [Txt.of(player.get("name")), " · Você" if mine else ""], "enabled": true, "primary": mine or input.get("opening") == null, "message": {"type": "player", "id": player.get("id"), "gen": gen}})
		if out.is_empty():
			return [_waiting("Aguardando a escolha de quem começa…")]
		var cancel_choice: Dictionary = _button(input, "cancel")
		if input.get("opening") == null and cancel_choice["enabled"] and cancel_choice["label"] != "":
			out.push_front({"label": cancel_choice["label"], "enabled": true, "primary": false, "message": {"type": "cancel", "gen": gen}})
		return out
	var choice: Dictionary = decision(state)
	var hand_count: int = _list(_me(state).get("hand")).size()
	var move: Variant = input.get("commanderMove")
	var paying: bool = bool(input.get("paying", false))
	var payment: Dictionary = {}
	if paying:
		var data: Dictionary = input.duplicate()
		data["counters"] = ShortInstruction.countered_unless_paid(input, state.get("stack", []), you, translate)
		payment = ShortInstruction.payment_button_labels(data)
	var ok: Dictionary = _button(input, "ok")
	var cancel: Dictionary = _button(input, "cancel")
	var opening: Variant = input.get("opening")
	if not payment.is_empty() and ok["label"] != "":
		ok["label"] = payment["ok"]
	elif move is Dictionary:
		ok["label"] = "Zona de comando"
	elif input.get("suspendCast") != null:
		ok["label"] = "Conjurar agora"
	elif input.get("blocking") != null:
		ok["label"] = block_confirm_label(state)
	elif input.get("attacking") != null:
		ok["label"] = attack_confirm_label(_list(state.get("combat")).size())
	elif opening == "play-draw":
		ok["label"] = "Eu jogo"
	elif opening == "mulligan":
		ok["label"] = "Manter %d" % (hand_count - int(input.get("openingReturnCount", 0) if input.get("openingReturnCount") != null else 0))
	elif opening == "mulligan-bottom" and int(input.get("openingReturnCount", 0) if input.get("openingReturnCount") != null else 0) > 0:
		var n: int = int(input["openingReturnCount"])
		ok["label"] = "Devolver 1 carta" if n == 1 else "Devolver %d cartas" % n
	elif not choice.is_empty():
		var request: Variant = ForgeRequest.selection_request(Txt.of(input.get("message"))) if input.get("tapToPay") == null else null
		ok["label"] = (request as Dictionary)["ok"] if request is Dictionary else "Confirmar seleção"
	if not payment.is_empty() and cancel["label"] != "":
		cancel["label"] = payment["cancel"]
	elif move is Dictionary:
		cancel["label"] = Txt.of(ZONE_NAMES.get(Txt.of((move as Dictionary).get("to")), (move as Dictionary).get("to")))
	elif input.get("suspendCast") != null:
		cancel["label"] = "Deixar no exílio"
	elif opening == "play-draw":
		cancel["label"] = "Oponente joga"
	elif opening == "mulligan-bottom" and cancel["label"] != "":
		cancel["label"] = "Escolher por mim" if cancel["enabled"] else ""
	var targeting: Variant = input.get("targeting") if not paying else null
	var message_last: PackedStringArray = Txt.of(input.get("message")).strip_edges().split("\n")
	var stack_pick: bool = input.get("targeting") == null and not paying and not bool(input.get("priority", false)) and not _list(input.get("selectableStacks")).is_empty() \
		and Re.test(r"(?im)^Select target", message_last[message_last.size() - 1])
	var kind: Variant = ShortInstruction.dig(targeting, "kind")
	var give_up: String = "Desistir da mágica" if kind == "spell" or stack_pick else ("Desistir da habilidade" if kind == "ability" else "")
	if give_up != "" and cancel["label"] != "":
		cancel["label"] = give_up
	if stack_pick and not ok["enabled"]:
		ok["label"] = ""
	var mine_turn: bool = state.get("activePlayer") == you
	if not ok["enabled"] and not cancel["enabled"]:
		if not choice.is_empty():
			return []
		var wait_text: String = "Aguardando confirmação…" if opening != null else waiting_on(state)
		if wait_text == "":
			wait_text = "Aguardando o jogo…" if mine_turn else ("Oponente jogando…" if _list(state.get("players")).size() <= 2 else "%s jogando…" % _name_of(state, state.get("activePlayer")))
		return [_waiting(wait_text)]
	var priority: bool = bool(input.get("priority", false))
	var stack_size: int = _list(state.get("stack")).size()
	var extra_combat: bool = mine_turn and int(state.get("extraCombats", 0) if state.get("extraCombats") != null else 0) > 0
	var end_turn: bool = priority and ok["enabled"] and mine_turn and stack_size == 0 and input.get("targeting") == null and not paying and not extra_combat
	var out: Array = []
	var hide_cancel: bool = (end_turn or (extra_combat and priority)) and Re.test(r"(?i)fim de turno|end turn", cancel["label"])
	var main: Dictionary = {"label": pass_label(state) if priority else ok["label"], "enabled": ok["enabled"], "primary": true, "message": {"type": "ok", "gen": gen}}
	var cancel_button: Dictionary = {"label": cancel["label"], "enabled": cancel["enabled"], "primary": false, "message": {"type": "cancel", "gen": gen}}
	var life_enabled: bool = paying and input.get("phyrexianLife") != null
	var life: Dictionary = {"label": "Pagar 2 de vida", "enabled": true, "primary": false, "message": {"type": "player", "id": you, "gen": gen}}
	# Sem mana para o automático, a vida vira o destaque; sem ela, só sobra desistir ou não pagar.
	if paying and input.get("canAutoPay") == false and cancel["enabled"]:
		main["primary"] = false
		if life_enabled:
			life["primary"] = true
			return _visible([main, cancel_button, life])
		cancel_button["primary"] = true
		return _visible([main, cancel_button])
	# Gatilho opcional: Não e Sim, e "Sempre não"/"Sempre sim" até o fim da partida.
	if bool(input.get("triggerChoice", false)) and ok["enabled"] and cancel["enabled"]:
		return _visible([
			{"label": "Sempre não", "enabled": true, "primary": false, "small": true, "message": {"type": "cancel", "gen": gen, "always": true}},
			{"label": "Sempre sim", "enabled": true, "primary": false, "small": true, "message": {"type": "ok", "gen": gen, "always": true}},
			cancel_button, main])
	if not hide_cancel:
		out.append(cancel_button)
	if life_enabled:
		out.append(life)
	if priority and ok["enabled"] and stack_size >= 2 and input.get("targeting") == null and not paying:
		out.append({"label": "Resolver todos (%d)" % stack_size, "enabled": true, "primary": false, "message": {"type": "resolve-all", "gen": gen}})
	if end_turn:
		out.append({"label": "Fim de turno", "enabled": true, "primary": false, "message": {"type": "pass-turn", "gen": gen}})
	out.append(main)
	return _visible(out)


## Previsão do combate de um jogador atacado (forecastText de src/ui/combatForecast.ts); `name` "" é você.
static func forecast_text(f: Dictionary, name: String, translate: Callable, state: Dictionary) -> String:
	var life: int = int(f.get("life", 0))
	var after: int = int(f.get("lifeAfter", life))
	var poison_gain: bool = int(f.get("poisonAfter", 0) if f.get("poisonAfter") != null else 0) > int(f.get("poison", 0) if f.get("poison") != null else 0)
	var hits: Array = _list(f.get("commander")).filter(func(c: Dictionary) -> bool: return int(c.get("after", 0)) > int(c.get("damage", 0)))
	var parts: PackedStringArray = ["%d de vida" % after]
	if poison_gain:
		parts.append("%d de veneno" % int(f["poisonAfter"]))
	for c: Variant in hits:
		parts.append("%d de dano de %s" % [int((c as Dictionary)["after"]), _card_name(state, (c as Dictionary).get("commanderId"), translate)])
	var who: String = name if name != "" else "você"
	var changes: bool = after < life or poison_gain or not hits.is_empty()
	var list: String = ", ".join(parts.slice(0, -1)) + " e " + parts[parts.size() - 1] if parts.size() > 1 else parts[0]
	var out: PackedStringArray = ["Depois do combate, %s fica com %s." % [who, list] if changes else ("%s não toma dano neste combate." % name if name != "" else "Você não toma dano neste combate.")]
	for raw: Variant in _list(f.get("planeswalkers")):
		var w: Dictionary = raw
		if int(w.get("after", 0)) < int(w.get("loyalty", 0)):
			var card: String = _card_name(state, w.get("id"), translate)
			out.append("%s morre." % card if int(w["after"]) <= 0 else "%s fica com %d de lealdade." % [card, int(w["after"])])
	if f.get("lethal") != null:
		out.append("Letal!")
	elif (after < life and after <= 5) or (poison_gain and int(f["poisonAfter"]) >= 8) or hits.any(func(c: Dictionary) -> bool: return int(c["after"]) >= 19):
		out.append("Perto de perder.")
	return " ".join(out)


static func _card_name(state: Dictionary, id: Variant, translate: Callable) -> String:
	for p: Variant in _list(state.get("players")):
		for zone: String in ["battlefield", "commandZone", "graveyard", "exile"]:
			for c: Variant in _list((p as Dictionary).get(zone)):
				if (c as Dictionary).get("id") == id:
					return translate.call(Txt.of((c as Dictionary).get("name")))
	return "o comandante"


static func _name_of(state: Dictionary, id: Variant) -> String:
	for p: Variant in _list(state.get("players")):
		if (p as Dictionary).get("id") == id:
			return Txt.of((p as Dictionary).get("name"))
	return "Oponente"


static func _waiting(label: String) -> Dictionary:
	return {"label": label, "enabled": false, "primary": false, "message": {}}


static func _visible(list: Array) -> Array:
	return list.filter(func(b: Dictionary) -> bool: return Txt.of(b.get("label")) != "")
