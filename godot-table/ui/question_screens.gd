# As telas especiais das perguntas, com as respostas no formato da mesa do navegador (src/ui/questionView.ts e vizinhos):
# modos, jeito de jogar, vidência, montes, dano de combate, quantidades, número, voto, masmorra, substituição, nomes e destinos.
class_name QuestionScreens
extends RefCounted

const ZONES_PT := {"hand": "a mão", "graveyard": "o cemitério", "battlefield": "o campo", "library": "o grimório", "exile": "o exílio"}


## Monta a tela pela finalidade; false quando é uma pergunta genérica (o QuestionDialog cuida).
static func build(d: QuestionDialog) -> bool:
	var q: Dictionary = d.question
	var purpose: String = Txt.of(q.get("purpose"))
	var kind: String = Txt.of(q.get("kind"))
	if purpose == "combat-damage":
		amounts(d, true)
	elif purpose == "triggers":
		order(d)
	elif purpose == "play-mode" or q.get("method") == "getAbilityToPlay":
		_play_mode(d)
	elif purpose == "library" and q.get("library") != null and not d.options().is_empty():
		_library(d)
	elif purpose == "vote":
		_vote(d)
	elif purpose == "piles-split":
		_piles_split(d)
	elif purpose == "piles-choose" and (q.get("piles", []) as Array).size() == 2:
		_piles_choose(d)
	elif purpose == "replacement-order":
		_replacement(d)
	elif purpose == "optional-costs":
		_optional_costs(d)
	elif purpose == "creature-type":
		_search(d, true)
	elif purpose == "modes":
		_modes(d)
	elif kind == "number":
		number(d)
	elif purpose == "dungeon-room" or purpose == "dungeon-choice":
		_dungeon(d)
	elif purpose == "card-name" and d.options().size() >= 100:
		_search(d, false)
	elif purpose == "split-destinations" and (q.get("destinations", []) as Array).size() == 2:
		_split_destinations(d)
	elif purpose == "commander-zone":
		var zone: String = "Exílio" if Txt.of(q.get("zone")) == "Exile" else "Cemitério"
		d.source_card()
		d.button_row([[zone, {"value": false}, false], ["Zona de comando", {"value": true}, true]])
	else:
		return false
	return true


# — Seleção comum —

## Cartas lado a lado (as `revealed` apagadas, sem índice): com um só a escolher, o toque responde; senão marca e confirma.
static func pick_cards(d: QuestionDialog, indices: Array, revealed: Array, done: Callable) -> void:
	var max_pick: int = int(d.question.get("max", 1))
	var min_pick: int = int(d.question.get("min", 1))
	var chosen: Array = []
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(min(indices.size() + revealed.size(), 5) * (QuestionDialog.CARD_SIZE.x + 14), QuestionDialog.CARD_SIZE.y + 90)
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	scroll.add_child(row)
	d.column.add_child(scroll)
	var confirm: Button = Hud._button("Confirmar", true)
	var tiles: Dictionary = {}
	for i: Variant in indices:
		var index: int = int(i)
		var tile: Control = d.card_tile(d.option_card(index), d.option_label(index) if d.option_card(index) == null else "", "", false)
		tiles[index] = tile
		tile.gui_input.connect(func(event: InputEvent) -> void:
			if not QuestionDialog.clicked(event):
				return
			if max_pick <= 1 and min_pick >= 1:
				done.call([index])
				return
			if chosen.has(index):
				chosen.erase(index)
			elif chosen.size() < max_pick:
				chosen.append(index)
			for k: Variant in tiles.keys():
				QuestionDialog.set_marked(tiles[k], chosen.has(k))
			confirm.disabled = chosen.size() < min_pick)
		row.add_child(tile)
	for card: Variant in revealed:
		var gone: Control = d.card_tile(card, "", "", false)
		gone.modulate = Color(1, 1, 1, 0.35)
		gone.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(gone)
	if max_pick > 1 or min_pick < 1:
		d.hint("Escolha %s." % ("até %d" % max_pick if min_pick < max_pick else str(max_pick)))
		confirm.disabled = min_pick > 0
		confirm.pressed.connect(func() -> void: done.call(chosen.duplicate()))
		d.column.add_child(confirm)
	if min_pick == 0:
		d.button_row([["Nenhuma", {"indices": []}, false]])


## Opções em lista de botões, com as mesmas regras de mínimo e máximo.
static func pick_list(d: QuestionDialog, done: Callable, labels: Array = [], disabled: Dictionary = {}) -> void:
	var max_pick: int = int(d.question.get("max", 1))
	var min_pick: int = int(d.question.get("min", 1))
	var chosen: Array = []
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 8)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var scroll := ScrollContainer.new()
	var count: int = labels.size() if not labels.is_empty() else d.options().size()
	scroll.custom_minimum_size = Vector2(680, min(count * 60, 440))
	scroll.add_child(list)
	d.column.add_child(scroll)
	var confirm: Button = Hud._button("Confirmar", true)
	for i: int in count:
		var text: String = Txt.of(labels[i]) if not labels.is_empty() else d.option_label(i)
		var button := Hud._button(text, false)
		button.toggle_mode = max_pick > 1
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		if disabled.has(i):
			button.disabled = true
			button.text = "%s · %s" % [text, disabled[i]]
		button.pressed.connect(func() -> void:
			if max_pick <= 1:
				done.call([i])
				return
			if button.button_pressed and chosen.size() < max_pick:
				chosen.append(i)
			elif not button.button_pressed:
				chosen.erase(i)
			else:
				button.set_pressed_no_signal(false)
			confirm.disabled = chosen.size() < min_pick)
		list.add_child(button)
	if max_pick > 1:
		confirm.disabled = min_pick > 0
		confirm.pressed.connect(func() -> void: done.call(chosen.duplicate()))
		d.column.add_child(confirm)
	elif min_pick == 0:
		d.button_row([["Nenhuma", {"indices": []}, false]])


# — Ordem —

## Ordem (gatilhos e outras): cartas lado a lado; um toque leva a carta à próxima posição livre.
static func order(d: QuestionDialog) -> void:
	var q: Dictionary = d.question
	var st: Dictionary = {"order": range(d.options().size()), "placed": 0, "history": [], "remember": false}
	var triggers: bool = q.get("purpose") == "triggers"
	if triggers:
		d.hint("A da esquerda resolve primeiro. Toque nas cartas na ordem que quiser.")
	else:
		d.hint("Toque na ordem desejada (a primeira fica %s)." % ("embaixo" if q.get("firstAt") == "bottom" else "em cima"))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	d.column.add_child(row)
	var fill: Callable = func(self_call: Callable) -> void:
		for child: Node in row.get_children():
			child.queue_free()
		var list: Array = st["order"]
		for pos: int in list.size():
			var option: int = list[pos]
			var caption: String = "%dº · %s" % [pos + 1, "resolve primeiro" if pos == 0 else ("resolve por último" if pos == list.size() - 1 else "resolve em %dº" % (pos + 1))] if triggers else "%dº" % (pos + 1)
			var tile: Control = d.card_tile(d.option_card(option), d.option_label(option), caption, pos < int(st["placed"]))
			tile.gui_input.connect(func(event: InputEvent) -> void:
				if not QuestionDialog.clicked(event):
					return
				var at: int = (st["order"] as Array).find(option)
				if at >= int(st["placed"]):
					(st["history"] as Array).append([(st["order"] as Array).duplicate(), st["placed"]])
					(st["order"] as Array).remove_at(at)
					(st["order"] as Array).insert(int(st["placed"]), option)
					st["placed"] = int(st["placed"]) + 1
					self_call.call(self_call))
			row.add_child(tile)
	fill.call(fill)
	if triggers and bool(q.get("canRemember", false)):
		var remember := CheckBox.new()
		remember.text = "Lembrar esta ordem até o fim da partida"
		remember.toggled.connect(func(on: bool) -> void: st["remember"] = on)
		d.column.add_child(remember)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 12)
	var undo := Hud._button("Desfazer", false)
	undo.custom_minimum_size = Vector2(180, 52)
	undo.pressed.connect(func() -> void:
		if not (st["history"] as Array).is_empty():
			var last: Array = (st["history"] as Array).pop_back()
			st["order"] = last[0]
			st["placed"] = last[1]
			fill.call(fill))
	actions.add_child(undo)
	var confirm := Hud._button("Confirmar ordem", true)
	confirm.custom_minimum_size = Vector2(240, 52)
	confirm.pressed.connect(func() -> void:
		var reply: Dictionary = {"indices": (st["order"] as Array).duplicate()}
		if bool(st["remember"]):
			reply["remember"] = true
		d.send(reply))
	actions.add_child(confirm)
	d.column.add_child(actions)


# — Números —

## number: os números soltos como botões; senão um contador entre min e max (sem max, sem teto), e o desistir.
static func number(d: QuestionDialog) -> void:
	var q: Dictionary = d.question
	d.source_card()
	var values: Array = q.get("values", []) if q.get("values") is Array else []
	if not values.is_empty():
		var buttons: Array = []
		for v: Variant in values:
			buttons.append([str(int(v)), {"number": int(v)}, false])
		d.button_row(buttons)
	else:
		var spin := SpinBox.new()
		spin.min_value = int(q.get("min", 0)) if q.get("min") != null else 0
		spin.max_value = int(q["max"]) if q.get("max") != null else 9999
		spin.value = spin.min_value
		spin.custom_minimum_size = Vector2(220, 48)
		var holder := CenterContainer.new()
		holder.add_child(spin)
		d.column.add_child(holder)
		var cost: Variant = q.get("cost")
		if cost is Dictionary:
			d.hint("Custo: %s + %s por unidade%s." % [Txt.of((cost as Dictionary).get("base")), Txt.of((cost as Dictionary).get("each")), (" · mana disponível: %d" % int((cost as Dictionary)["available"])) if (cost as Dictionary).get("available") != null else ""])
		var ok := Hud._button("Confirmar", true)
		var unit: String = Txt.of(q.get("unit"))
		var relabel: Callable = func(n: float) -> void:
			ok.text = "Confirmar X = %d" % int(n) if unit == "x" else (("Pagar %d %s" % [int(n), "vez" if int(n) == 1 else "vezes"]) if int(n) > 0 else "Não pagar") if unit == "times" else "Confirmar"
		relabel.call(spin.value)
		spin.value_changed.connect(relabel)
		ok.pressed.connect(func() -> void: d.send({"number": int(spin.value)}))
		d.column.add_child(ok)
	if q.get("cancel") != null:
		d.button_row([["Cancelar mágica" if q["cancel"] == "spell" else "Cancelar habilidade", {"indices": []}, false]])


## amount (e dano de combate): −/+ por opção, a soma tem que dar o total; no combate, letal e a ordem dos bloqueadores.
static func amounts(d: QuestionDialog, combat: bool) -> void:
	var q: Dictionary = d.question
	var total: int = int(q.get("total", 0))
	var options: Array = d.options()
	var values: Array = []
	var suggested: Array = q.get("suggested", []) if q.get("suggested") is Array else []
	for i: int in options.size():
		values.append(int(suggested[i]) if i < suggested.size() else 0)
	if suggested.is_empty() and not combat and not options.is_empty():
		for i: int in total:
			values[i % options.size()] += 1
	var what: String = {"damage": "dano", "shield": "prevenção", "counters": "marcadores"}.get(Txt.of(q.get("amountOf")), "")
	var summary: Label = d.hint("")
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 8)
	d.column.add_child(rows)
	var confirm := Hud._button("Confirmar", true)
	var limits: Callable = func(i: int) -> Vector2i:
		var option: Dictionary = options[i] if options[i] is Dictionary else {}
		return Vector2i(int(option.get("min", 0)), mini(int(option.get("max", total)), total))
	var labels: Array[Label] = []
	var valid: Callable = func() -> bool:
		var sum: int = 0
		for v: Variant in values:
			sum += int(v)
		if sum != total:
			return false
		if not combat:
			return true
		var blockers_lethal: bool = true
		for i: int in options.size():
			var option: Dictionary = options[i] if options[i] is Dictionary else {}
			if bool(option.get("defender", false)):
				if int(values[i]) > 0 and not bool(q.get("free", false)) and not blockers_lethal:
					return false
				continue
			var lethal: int = int(option.get("lethal", 0))
			if bool(q.get("ordered", false)) and not blockers_lethal and int(values[i]) > 0:
				return false
			if int(values[i]) < lethal:
				blockers_lethal = false
		return true
	var refresh: Callable = func() -> void:
		var sum: int = 0
		for i: int in values.size():
			sum += int(values[i])
			labels[i].text = str(int(values[i]))
		summary.text = "Distribua %d de %s: falta %d." % [total, what if what != "" else "pontos", total - sum] if sum != total else "Total distribuído: %d." % total
		confirm.disabled = not bool(valid.call())
	for i: int in options.size():
		var option: Dictionary = options[i] if options[i] is Dictionary else {}
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var name := Hud._label(18, Color.WHITE)
		var lethal_text: String = " · morre com %d" % int(option["lethal"]) if combat and option.get("lethal") != null else ""
		name.text = ("Jogador ou planeswalker atacado" if bool(option.get("defender", false)) else d.option_label(i)) + lethal_text
		name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name.custom_minimum_size = Vector2(420, 0)
		row.add_child(name)
		var minus := Hud._button("−", false)
		minus.custom_minimum_size = Vector2(52, 44)
		var value := Hud._label(22, Hud.GOLD)
		value.custom_minimum_size = Vector2(44, 0)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		labels.append(value)
		var plus := Hud._button("+", false)
		plus.custom_minimum_size = Vector2(52, 44)
		minus.pressed.connect(func() -> void:
			values[i] = maxi(int(values[i]) - 1, (limits.call(i) as Vector2i).x)
			refresh.call())
		plus.pressed.connect(func() -> void:
			values[i] = mini(int(values[i]) + 1, (limits.call(i) as Vector2i).y)
			refresh.call())
		row.add_child(minus)
		row.add_child(value)
		row.add_child(plus)
		if combat and option.get("lethal") != null and not bool(option.get("defender", false)):
			var lethal := Hud._button("Letal", false)
			lethal.custom_minimum_size = Vector2(90, 44)
			lethal.pressed.connect(func() -> void:
				values[i] = mini(int(option["lethal"]), (limits.call(i) as Vector2i).y)
				refresh.call())
			row.add_child(lethal)
		var rest := Hud._button("Todo o resto", false)
		rest.custom_minimum_size = Vector2(130, 44)
		rest.pressed.connect(func() -> void:
			var others: int = 0
			for j: int in values.size():
				if j != i:
					others += int(values[j])
			values[i] = clampi(total - others, (limits.call(i) as Vector2i).x, (limits.call(i) as Vector2i).y)
			refresh.call())
		row.add_child(rest)
		rows.add_child(row)
	if not combat:
		var even := Hud._button("Dividir igual", false)
		even.pressed.connect(func() -> void:
			for j: int in values.size():
				values[j] = 0
			for k: int in total:
				values[k % values.size()] += 1
			refresh.call())
		d.column.add_child(even)
	confirm.pressed.connect(func() -> void: d.send({"amounts": values.duplicate()}))
	d.column.add_child(confirm)
	refresh.call()


# — Finalidades —

## Modos de uma mágica modal: os indisponíveis apagados com o motivo (não entram na resposta).
static func _modes(d: QuestionDialog) -> void:
	d.source_card()
	var labels: Array = []
	for i: int in d.options().size():
		labels.append(d.option_label(i))
	pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}), labels)
	for raw: Variant in d.question.get("unavailableModes", []):
		var mode: Dictionary = raw
		var gone := Hud._label(16, Color(1, 1, 1, 0.4))
		gone.text = "%s · %s" % [Txt.of(mode.get("label")), "Sem alvo possível agora" if mode.get("reason") == "target" else "Já escolhido antes"]
		gone.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		gone.custom_minimum_size = Vector2(680, 0)
		d.column.add_child(gone)
	if int(d.question.get("min", 1)) == 0 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Nenhum modo", {"indices": []}, false]])


## Jeito de jogar a carta: a carta grande e um botão por jeito (conjurar, ciclar, aventura…), com o custo.
static func _play_mode(d: QuestionDialog) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	d.column.add_child(row)
	var card: Variant = d.question.get("card")
	if card == null and not d.options().is_empty():
		card = d.option_card(0)
	if card is Dictionary:
		row.add_child(d.card_tile(card, "", "", false))
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 10)
	list.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(list)
	for i: int in d.options().size():
		var option: Dictionary = d.options()[i] if d.options()[i] is Dictionary else {"label": d.options()[i]}
		var text: String = d.option_label(i)
		if Txt.of(option.get("cost")) != "":
			text += "  ·  %s" % option["cost"]
		if Txt.of(option.get("loyalty")) != "":
			text = "%s  %s" % [option["loyalty"], text]
		var button := Hud._button(text, i == 0)
		button.custom_minimum_size = Vector2(420, 56)
		button.pressed.connect(func() -> void: d.send({"indices": [i]}))
		list.add_child(button)
	var cancel := Hud._button("Cancelar", false)
	cancel.pressed.connect(func() -> void: d.send({"indices": []}))
	list.add_child(cancel)


## Vidência e vigilância: a da esquerda é o topo; cada carta fica no topo ou vai para o fundo/cemitério; "top" reordena.
static func _library(d: QuestionDialog) -> void:
	var where: String = Txt.of(d.question.get("library"))
	var away: String = "Cemitério" if where == "graveyard" else "Fundo"
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 14)
	d.column.add_child(row)
	var st: Dictionary = {"leaving": [], "order": range(d.options().size())}
	d.hint("A da esquerda é o topo do grimório." + (" Use as setas para mudar a ordem." if where == "top" else " Toque para mandar a carta para %s." % ("o cemitério" if where == "graveyard" else "o fundo")))
	var fill: Callable = func(self_call: Callable) -> void:
		for child: Node in row.get_children():
			child.queue_free()
		var list: Array = st["order"]
		for pos: int in list.size():
			var index: int = list[pos]
			var leaving: bool = (st["leaving"] as Array).has(index)
			var holder := VBoxContainer.new()
			var tile: Control = d.card_tile(d.option_card(index), "", away if leaving else ("Topo" if where != "top" else "%dº" % (pos + 1)), not leaving, QuestionDialog.SMALL_CARD)
			if leaving:
				tile.modulate = Color(1, 1, 1, 0.5)
			holder.add_child(tile)
			if where == "top":
				var arrows := HBoxContainer.new()
				for step: int in [-1, 1]:
					var arrow := Hud._button("←" if step < 0 else "→", false)
					arrow.custom_minimum_size = Vector2(60, 40)
					arrow.pressed.connect(func() -> void:
						var to: int = clampi(pos + step, 0, list.size() - 1)
						list.remove_at(pos)
						list.insert(to, index)
						self_call.call(self_call))
					arrows.add_child(arrow)
				holder.add_child(arrows)
			else:
				tile.gui_input.connect(func(event: InputEvent) -> void:
					if QuestionDialog.clicked(event):
						if leaving:
							(st["leaving"] as Array).erase(index)
						else:
							(st["leaving"] as Array).append(index)
						self_call.call(self_call))
			row.add_child(holder)
	fill.call(fill)
	var confirm := Hud._button("Confirmar", true)
	confirm.pressed.connect(func() -> void:
		if where == "top":
			d.send({"indices": (st["order"] as Array).duplicate()})
		else:
			var out: Array = (st["leaving"] as Array).duplicate()
			out.sort()
			d.send({"indices": out}))
	d.column.add_child(confirm)


## Votação do conselho: a carta que vota, o placar e um botão por opção.
static func _vote(d: QuestionDialog) -> void:
	d.source_card()
	var votes: Array = d.question.get("votes", []) if d.question.get("votes") is Array else []
	if not votes.is_empty():
		var tally: PackedStringArray = []
		for raw: Variant in votes:
			tally.append(Txt.of((raw as Dictionary).get("label")))
		d.hint("Votos até agora: %s" % ", ".join(tally))
	pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))
	if int(d.question.get("min", 1)) == 0 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Não votar", {"indices": []}, false]])


## Separar em dois montes: tocar na carta a troca de monte; a resposta são as do monte 1.
static func _piles_split(d: QuestionDialog) -> void:
	var pile_one: Array = range(d.options().size())
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 10)
	d.column.add_child(rows)
	var chosen_to: String = Txt.of(ZONES_PT.get(Txt.of(d.question.get("chosenTo")).to_lower(), ""))
	var other_to: String = Txt.of(ZONES_PT.get(Txt.of(d.question.get("otherTo")).to_lower(), ""))
	if chosen_to != "":
		d.hint("O monte escolhido vai para %s%s." % [chosen_to, "; o outro, para %s" % other_to if other_to != "" else ""])
	var fill: Callable = func(self_call: Callable) -> void:
		for child: Node in rows.get_children():
			child.queue_free()
		for pile: int in 2:
			var title := Hud._label(18, Hud.GOLD)
			title.text = "Monte %d" % (pile + 1)
			rows.add_child(title)
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 10)
			row.custom_minimum_size = Vector2(0, QuestionDialog.SMALL_CARD.y + 10)
			for i: int in d.options().size():
				if pile_one.has(i) != (pile == 0):
					continue
				var tile: Control = d.card_tile(d.option_card(i), "", "", false, QuestionDialog.SMALL_CARD)
				tile.gui_input.connect(func(event: InputEvent) -> void:
					if QuestionDialog.clicked(event):
						if pile_one.has(i):
							pile_one.erase(i)
						else:
							pile_one.append(i)
						self_call.call(self_call))
				row.add_child(tile)
			rows.add_child(row)
	fill.call(fill)
	var confirm := Hud._button("Confirmar montes", true)
	confirm.pressed.connect(func() -> void:
		var out: Array = pile_one.duplicate()
		out.sort()
		d.send({"indices": out}))
	d.column.add_child(confirm)


## Escolher um de dois montes: cada monte com as cartas (o virado para baixo mostra só versos) e o botão dele.
static func _piles_choose(d: QuestionDialog) -> void:
	var piles: Array = d.question["piles"]
	for p: int in piles.size():
		var pile: Dictionary = piles[p]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var pick := Hud._button("Monte %d (%d)" % [p + 1, int(pile.get("size", 0))], p == 0)
		pick.custom_minimum_size = Vector2(170, 56)
		pick.pressed.connect(func() -> void: d.send({"indices": [int(pile["option"])]}))
		row.add_child(pick)
		var cards: Array = pile.get("cards", [])
		for index: Variant in cards:
			row.add_child(d.card_tile(d.option_card(int(index)), "", "", false, QuestionDialog.SMALL_CARD))
		for k: int in maxi(0, int(pile.get("size", 0)) - cards.size()):
			row.add_child(d.card_tile({"faceDown": true}, "", "", false, QuestionDialog.SMALL_CARD))
		d.column.add_child(row)


## Qual efeito de substituição vem primeiro, com "usar a mesma escolha" quando vale para o resto do efeito.
static func _replacement(d: QuestionDialog) -> void:
	var st: Dictionary = {"all": true}
	if bool(d.question.get("applyToAll", false)):
		var same := CheckBox.new()
		same.text = "Usar a mesma escolha no resto deste efeito"
		same.button_pressed = true
		same.toggled.connect(func(on: bool) -> void: st["all"] = on)
		d.column.add_child(same)
	pick_list(d, func(picked: Array) -> void:
		var reply: Dictionary = {"indices": picked}
		if bool(d.question.get("applyToAll", false)):
			reply["all"] = bool(st["all"])
		d.send(reply))


## Custos opcionais (reforço, oferenda…): com um só, "Sem" e "Com"; com vários, marcar e conjurar.
static func _optional_costs(d: QuestionDialog) -> void:
	d.source_card()
	var cost: Variant = d.question.get("cost")
	if cost is Dictionary:
		d.hint("Custo sem os opcionais: %s%s." % [Txt.of((cost as Dictionary).get("base")), (" · mana disponível: %d" % int((cost as Dictionary)["available"])) if (cost as Dictionary).get("available") != null else ""])
	if d.options().size() == 1 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Sem", {"indices": []}, false], ["Com %s" % d.option_label(0), {"indices": [0]}, true]])
		return
	pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))
	d.button_row([["Sem custos opcionais", {"indices": []}, false]])


## Masmorra: as salas (ou as masmorras) como botões, com a carta quando há.
static func _dungeon(d: QuestionDialog) -> void:
	if range(d.options().size()).all(func(i: int) -> bool: return d.option_card(i) != null):
		pick_cards(d, range(d.options().size()), [], func(picked: Array) -> void: d.send({"indices": picked}))
	else:
		pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))


## Nomear uma carta (centenas de nomes) ou escolher um tipo de criatura: busca e até 40 resultados.
static func _search(d: QuestionDialog, creature_types: bool) -> void:
	var labels: Array = []
	for i: int in d.options().size():
		labels.append(d.option_label(i))
	var order: Array = range(labels.size())
	if creature_types:
		# Os tipos que o deck mais tem vêm primeiro (option.count).
		order.sort_custom(func(a: int, b: int) -> bool:
			var ca: int = int((d.options()[a] as Dictionary).get("count", 0)) if d.options()[a] is Dictionary else 0
			var cb: int = int((d.options()[b] as Dictionary).get("count", 0)) if d.options()[b] is Dictionary else 0
			return ca > cb)
	var field := LineEdit.new()
	field.placeholder_text = "Buscar tipo" if creature_types else "Buscar o nome da carta"
	field.custom_minimum_size = Vector2(520, 48)
	d.column.add_child(field)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 6)
	d.column.add_child(list)
	var fill: Callable = func(text: String) -> void:
		for child: Node in list.get_children():
			child.queue_free()
		var needle: String = text.strip_edges().to_lower()
		var shown: int = 0
		for i: Variant in order:
			if shown >= (8 if needle == "" else 40):
				break
			if needle != "" and not Txt.of(labels[i]).to_lower().contains(needle):
				continue
			var button := Hud._button(Txt.of(labels[i]), false)
			button.custom_minimum_size = Vector2(520, 42)
			button.pressed.connect(func() -> void: d.send({"indices": [int(i)]}))
			list.add_child(button)
			shown += 1
	field.text_changed.connect(fill)
	field.text_submitted.connect(func(_t: String) -> void:
		if list.get_child_count() > 0:
			(list.get_child(0) as Button).pressed.emit())
	fill.call("")
	if int(d.question.get("min", 1)) == 0:
		d.button_row([["Não escolher" if creature_types else "Nenhum", {"indices": []}, false]])
	field.grab_focus.call_deferred()


## Dois destinos das cartas buscadas (Cultivate): as primeiras tocadas vão para o primeiro lugar, o resto para o segundo.
static func _split_destinations(d: QuestionDialog) -> void:
	var destinations: Array = d.question["destinations"]
	var first: Dictionary = destinations[0]
	var second: Dictionary = destinations[1]
	var max_pick: int = int(d.question.get("max", 2))
	var first_count: int = mini(int(first.get("count", 1)), max_pick)
	var name: Callable = func(dest: Dictionary) -> String:
		var zone: String = Txt.of(ZONES_PT.get(Txt.of(dest.get("zone")).to_lower(), Txt.of(dest.get("zone"))))
		return zone + (" (virada)" if bool(dest.get("tapped", false)) else "")
	d.hint("As %d primeiras vão para %s; as outras, para %s." % [first_count, name.call(first), name.call(second)] if first_count != 1 else "A primeira vai para %s; a outra, para %s." % [name.call(first), name.call(second)])
	var chosen: Array = []
	var tiles: Dictionary = {}
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	d.column.add_child(row)
	var confirm := Hud._button("Confirmar", true)
	confirm.disabled = int(d.question.get("min", 1)) > 0
	for i: int in d.options().size():
		var tile: Control = d.card_tile(d.option_card(i), "", "", false, QuestionDialog.SMALL_CARD)
		var caption := Hud._label(15, Hud.GOLD)
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tile.add_child(caption)
		tiles[i] = caption
		tile.gui_input.connect(func(event: InputEvent) -> void:
			if not QuestionDialog.clicked(event):
				return
			if chosen.has(i):
				chosen.erase(i)
			elif chosen.size() < max_pick:
				chosen.append(i)
			for k: Variant in tiles.keys():
				var at: int = chosen.find(k)
				(tiles[k] as Label).text = "" if at < 0 else ("→ %s" % name.call(first if at < first_count else second))
			confirm.disabled = chosen.size() < int(d.question.get("min", 1)))
		row.add_child(tile)
	confirm.pressed.connect(func() -> void: d.send({"indices": chosen.duplicate()}))
	d.column.add_child(confirm)
	if int(d.question.get("min", 1)) == 0:
		d.button_row([["Não procurar", {"indices": []}, false]])
