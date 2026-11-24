# Monta a partida sem servidor nos momentos de pagar (mágica com nada pago, pago em parte, habilidade de uma permanente,
# descarte como custo, pagando com a pilha aberta, desistindo) e salva um print de cada um. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_payment.gd -- <caminho base> [cena]
extends SceneTree

var _next_id: int = 1000
var _screen: MatchScreen


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var base: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("pagamento")
	var only: String = args[1] if args.size() > 1 else ""
	for scene: String in ["conjurando", "pago-em-parte", "habilidade", "descarte", "com-pilha", "desistindo"]:
		if only != "" and not scene.contains(only):
			continue
		_next_id = 1000
		_screen = MatchScreen.new()
		_screen.offline = true
		root.add_child(_screen)
		await process_frame
		match scene:
			"conjurando": await _show(_paying("{2}{G}", ""))
			"pago-em-parte": await _scene_partial()
			"habilidade": await _scene_ability()
			"descarte": await _scene_discard()
			"com-pilha": await _scene_stack()
			"desistindo": await _scene_cancel()
		root.get_texture().get_image().save_png("%s-%s.png" % [base, scene])
		print("%s-%s.png" % [base, scene])
		root.remove_child(_screen)
		_screen.free()
	quit()


## Aplica o estado duas vezes (a segunda com os nomes e as imagens que chegaram) e espera as cartas pousarem.
func _show(state: Dictionary, wait: float = 4.0) -> void:
	_screen.call("_on_message", state)
	await create_timer(wait).timeout
	_screen.call("_on_message", state)
	await create_timer(0.8).timeout


func _card(name: String, type_line: String, owner: int, extra: Dictionary = {}) -> Dictionary:
	_next_id += 1
	var card: Dictionary = {"id": _next_id, "name": name, "typeLine": type_line, "controller": owner, "owner": owner, "tapped": false,
		"token": false, "creature": type_line.contains("Creature"), "land": type_line.contains("Land"), "damage": 0}
	card.merge(extra, true)
	return card


func _input(extra: Dictionary) -> Dictionary:
	var input: Dictionary = {"gen": _next_id, "message": "", "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}, "selectable": [], "actionable": []}
	input.merge(extra, true)
	return input


## Duelo: você com terras (`tapped` viradas) e duas criaturas; o oponente com um dragão e montanhas.
func _duel(tapped: int = 0) -> Dictionary:
	var mine: Array = [_card("Llanowar Elves", "Creature — Elf Druid", 0, {"power": 1, "toughness": 1}),
		_card("Rogue's Passage", "Land", 0, {"text": "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn."})]
	for i: int in 4:
		mine.append(_card("Forest", "Basic Land — Forest", 0, {"tapped": i < tapped}))
	mine.append(_card("Island", "Basic Land — Island", 0))
	var theirs: Array = [_card("Shivan Dragon", "Creature — Dragon", 1, {"power": 5, "toughness": 5, "keywords": ["FLYING"]})]
	for i: int in 3:
		theirs.append(_card("Mountain", "Basic Land — Mountain", 1))
	var hand: Array = [_card("Giant Growth", "Instant", 0), _card("Counterspell", "Instant", 0), _card("Lightning Axe", "Instant", 0)]
	var players: Array = [
		{"id": 0, "seat": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 40, "handCount": hand.size(), "hand": hand, "battlefield": mine, "graveyard": [], "exile": []},
		{"id": 1, "seat": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 40, "handCount": 5, "hand": [], "battlefield": theirs, "graveyard": [], "exile": []},
	]
	return {"type": "state", "you": 0, "turn": 6, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": _input({}), "events": [], "gameOver": false, "log": []}


## Pagando Cultivo ({2}{G}): a carta saiu da mão e está só no pedido; `total` diz o custo de quando o pagamento abriu.
func _paying(remaining: String, total: String, tapped: int = 0) -> Dictionary:
	var s: Dictionary = _duel(tapped)
	var spell: Dictionary = _card("Cultivate", "Sorcery", 0, {"manaCost": "{2}{G}"})
	var cost: Dictionary = {"remaining": remaining}
	if total != "":
		cost["total"] = total
	s["input"] = _input({"paying": true, "payingFor": "spell", "canAutoPay": true, "card": spell, "manaCost": cost,
		"message": "Pay Mana Cost: %s" % remaining, "ok": {"label": "Auto", "enabled": true}, "cancel": {"label": "Cancel", "enabled": true}})
	return s


func _scene_partial() -> void:
	await _show(_paying("{2}{G}", ""))
	# Virou duas florestas: o {G} e um dos {2} já pagos.
	_screen.call("_on_message", _paying("{1}", "{2}{G}", 2))
	await create_timer(1.2).timeout


## Ativando a habilidade da Passagem dos Ladinos ({4}, {T}): sem cópia junto da caixa, a terra acende no campo.
func _scene_ability() -> void:
	var s: Dictionary = _duel()
	var passage: Dictionary = ((s["players"] as Array)[0] as Dictionary)["battlefield"][1]
	s["input"] = _input({"paying": true, "payingFor": "ability", "canAutoPay": true, "card": passage, "manaCost": {"remaining": "{4}"},
		"message": "Pay Mana Cost: {4}", "ok": {"label": "Auto", "enabled": true}, "cancel": {"label": "Cancel", "enabled": true}})
	await _show(s)


## Machado Relâmpago pede descartar uma carta como custo adicional: a carta fica à vista enquanto se escolhe.
func _scene_discard() -> void:
	var s: Dictionary = _duel()
	var me: Dictionary = (s["players"] as Array)[0]
	var hand: Array = me["hand"]
	var axe: Dictionary = hand.pop_back()
	me["handCount"] = hand.size()
	s["input"] = _input({"card": axe, "selectable": hand.map(func(c: Dictionary) -> int: return int(c["id"])), "selection": {"cards": [], "min": 1, "max": 1},
		"message": "Lightning Axe - Discard a card", "cancel": {"label": "Cancel", "enabled": true}})
	await _show(s)


## Respondendo a uma mágica do oponente com Contramágica: a pilha aberta à direita, a carta à esquerda dela.
func _scene_stack() -> void:
	var s: Dictionary = _duel()
	var me: Dictionary = (s["players"] as Array)[0]
	var hand: Array = me["hand"]
	var counter: Dictionary = hand[1]
	hand.remove_at(1)
	me["handCount"] = hand.size()
	var bolt: Dictionary = _card("Lightning Bolt", "Instant", 1, {"manaCost": "{R}"})
	s["activePlayer"] = 1
	s["stack"] = [{"id": 900, "text": "Lightning Bolt deals 3 damage to any target.", "kind": "spell", "controller": 1, "source": bolt, "targets": {"players": [0]}}]
	s["input"] = _input({"paying": true, "payingFor": "spell", "canAutoPay": true, "card": counter, "manaCost": {"remaining": "{U}", "total": "{U}{U}"},
		"message": "Pay Mana Cost: {U}", "ok": {"label": "Auto", "enabled": true}, "cancel": {"label": "Cancel", "enabled": true}})
	await _show(s)


## Desistiu de Cultivo: a carta volta voando de junto da caixa para o lugar dela na mão (print no meio do voo).
func _scene_cancel() -> void:
	var paying: Dictionary = _paying("{2}{G}", "")
	await _show(paying)
	# As mesmas cartas (os mesmos ids) de antes, agora com Cultivo de volta na mão.
	_next_id = 1000
	var back: Dictionary = _duel()
	var spell: Dictionary = (paying["input"] as Dictionary)["card"]
	var me: Dictionary = (back["players"] as Array)[0]
	(me["hand"] as Array).append(spell)
	me["handCount"] = (me["hand"] as Array).size()
	back["input"] = _input({"priority": true, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "End Turn", "enabled": true}})
	_screen.call("_on_message", back)
	await create_timer(PaymentCard.FLY_HOME_TIME * 0.5).timeout
