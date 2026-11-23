# As telas das perguntas que várias finalidades usam (escolher cartas ou opções, ordenar, número, quantidades e dano de combate),
# com as respostas no formato da mesa do navegador (src/ui/questionView.ts e vizinhos); as de uma finalidade só ficam em question_purposes.gd.
class_name QuestionScreens
extends RefCounted


## Monta a tela pela finalidade; false quando é uma pergunta genérica (o QuestionDialog cuida).
static func build(d: QuestionDialog) -> bool:
	var q: Dictionary = d.question
	var purpose: String = Txt.of(q.get("purpose"))
	if purpose == "combat-damage":
		amounts(d, true)
	elif purpose == "triggers":
		order(d)
	else:
		return QuestionPurposes.build(d)
	return true


# — Seleção comum —

## Cartas lado a lado (as `revealed` apagadas, sem índice): com um só a escolher, o toque responde; senão marca e confirma.
static func pick_cards(d: QuestionDialog, indices: Array, revealed: Array, done: Callable) -> void:
	var max_pick: int = int(d.question.get("max", 1))
	var min_pick: int = int(d.question.get("min", 1))
	var single: bool = max_pick <= 1 and min_pick >= 1
	var total: int = indices.size() + revealed.size()
	var holder: Container = _card_holder(d, total)
	var width: float = float(holder.get_meta("card_width"))
	var chosen: Array = []
	var tiles: Dictionary = {}
	var confirm := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 220)
	var refresh: Callable = func() -> void:
		for k: Variant in tiles.keys():
			(tiles[k] as ChoiceCard).set_selected(chosen.has(k))
		var status: Array = QuestionDialog.count_text(chosen.size(), min_pick, max_pick)
		d.set_status(status[0], status[1])
		confirm.disabled = chosen.size() < min_pick
	for k: int in indices.size():
		var index: int = int(indices[k])
		var data: Variant = d.option_card(index)
		var tile: ChoiceCard = d.card(data, width, d.option_label(index) if data == null else "")
		if k < 9:
			tile.set_key(str(k + 1))
		tiles[index] = tile
		var act: Callable = func() -> void:
			if single:
				done.call([index])
				return
			if chosen.has(index):
				chosen.erase(index)
			elif chosen.size() < max_pick:
				chosen.append(index)
			elif max_pick == 1:
				chosen = [index]
			refresh.call()
		tile.pressed.connect(act)
		d.hotkeys.append(act)
		holder.add_child(tile)
	for card: Variant in revealed:
		var gone: ChoiceCard = d.card(card, width)
		gone.set_dimmed(true)
		holder.add_child(gone)
	if single:
		return
	d.add_status()
	var buttons: Array = []
	if min_pick == 0:
		var none := ModalStyle.button("Nenhuma", ModalStyle.Kind.SECONDARY, 170)
		none.pressed.connect(func() -> void: done.call([]))
		buttons.append(none)
	confirm.pressed.connect(func() -> void: done.call(chosen.duplicate()))
	buttons.append(confirm)
	d.actions(buttons)
	d.primary = confirm
	refresh.call()


## Onde ficam as cartas: uma fileira quando cabem grandes o bastante; senão uma grade com rolagem.
static func _card_holder(d: QuestionDialog, total: int) -> Container:
	var screen: Vector2 = d.get_viewport_rect().size if d.is_inside_tree() else Vector2(1600, 900)
	var width: float = d.card_width(total)
	if total <= 7 or width > 150.0:
		var row := d.card_row()
		row.set_meta("card_width", width)
		return row
	width = 150.0
	var columns: int = maxi(1, mini(total, int((screen.x * 0.84 - 80.0) / (width + QuestionDialog.CARD_GAP))))
	var rows: int = ceili(float(total) / columns)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var row_height: float = width * ChoiceCard.ASPECT + ChoiceCard.LIFT_ROOM + 16.0
	scroll.custom_minimum_size = Vector2(columns * (width + QuestionDialog.CARD_GAP), minf(rows * row_height, screen.y * 0.56))
	scroll.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	d.column.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = columns
	grid.add_theme_constant_override("h_separation", int(QuestionDialog.CARD_GAP))
	grid.add_theme_constant_override("v_separation", 10)
	scroll.add_child(grid)
	grid.set_meta("card_width", width)
	return grid


## Opções em lista, com as mesmas regras de mínimo e máximo; `details` é o texto menor de cada uma e `disabled` o motivo das apagadas.
static func pick_list(d: QuestionDialog, done: Callable, labels: Array = [], disabled: Dictionary = {}, details: Array = []) -> void:
	var max_pick: int = int(d.question.get("max", 1))
	var min_pick: int = int(d.question.get("min", 1))
	var multi: bool = max_pick > 1
	var chosen: Array = []
	var count: int = labels.size() if not labels.is_empty() else d.options().size()
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 10)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if count > 6:
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(640, 440)
		scroll.add_child(list)
		d.column.add_child(scroll)
	else:
		d.column.add_child(list)
	var confirm := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 220)
	var rows: Array[ChoiceOption] = []
	var refresh: Callable = func() -> void:
		for i: int in rows.size():
			if rows[i].selected != chosen.has(i):
				rows[i].set_selected(chosen.has(i))
		var status: Array = QuestionDialog.count_text(chosen.size(), min_pick, max_pick)
		d.set_status(status[0], status[1])
		confirm.disabled = chosen.size() < min_pick
	for i: int in count:
		var text: String = Txt.of(labels[i]) if not labels.is_empty() else d.option_label(i)
		var detail: String = Txt.of(details[i]) if i < details.size() else ""
		var row := ChoiceOption.new().setup(text, detail, "", str(i + 1) if i < 9 else "")
		rows.append(row)
		list.add_child(row)
		if disabled.has(i):
			row.set_disabled(true, Txt.of(disabled[i]))
			d.hotkeys.append(func() -> void: pass)
			continue
		var act: Callable = func() -> void:
			if not multi:
				done.call([i])
				return
			if chosen.has(i):
				chosen.erase(i)
			elif chosen.size() < max_pick:
				chosen.append(i)
			refresh.call()
		row.pressed.connect(act)
		d.hotkeys.append(act)
	if multi:
		d.add_status()
		var buttons: Array = []
		if min_pick == 0:
			var none := ModalStyle.button("Nenhuma", ModalStyle.Kind.SECONDARY, 170)
			none.pressed.connect(func() -> void: done.call([]))
			buttons.append(none)
		confirm.pressed.connect(func() -> void: done.call(chosen.duplicate()))
		buttons.append(confirm)
		d.actions(buttons)
		d.primary = confirm
		refresh.call()
	elif min_pick == 0:
		d.button_row([["Nenhuma", {"indices": []}, false]])


# — Ordem —

## Ordem (gatilhos e outras): cartas lado a lado com o número de cada uma; um toque leva a carta à próxima posição livre.
static func order(d: QuestionDialog) -> void:
	var q: Dictionary = d.question
	var triggers: bool = q.get("purpose") == "triggers"
	var count: int = d.options().size()
	var st: Dictionary = {"order": range(count), "placed": 0, "history": [], "remember": false}
	if triggers:
		d.hint("A da esquerda resolve primeiro. Toque nas cartas na ordem em que devem resolver.")
	else:
		d.hint("Toque na ordem desejada (a primeira fica %s)." % ("embaixo" if q.get("firstAt") == "bottom" else "em cima"))
	if count > 1:
		d.column.add_child(_ribbon("RESOLVE PRIMEIRO" if triggers else ("PRIMEIRA, EMBAIXO" if q.get("firstAt") == "bottom" else "PRIMEIRA, EM CIMA"), "RESOLVE POR ÚLTIMO" if triggers else "ÚLTIMA"))
	var row := d.card_row()
	var width: float = d.card_width(count, 230.0)
	var tiles: Dictionary = {}
	var status: Label = d.add_status()
	var refresh: Callable = func(placed_now: int) -> void:
		var list: Array = st["order"]
		var old: Dictionary = {}
		for option: Variant in list:
			old[option] = (tiles[option] as ChoiceCard).global_position.x
		for pos: int in list.size():
			var tile: ChoiceCard = tiles[list[pos]]
			row.move_child(tile, pos)
			var placed: bool = pos < int(st["placed"])
			tile.set_badge(str(pos + 1), placed)
			tile.set_selected(placed, false)
			var caption: String = ("Resolve primeiro" if pos == 0 else ("Resolve por último" if pos == list.size() - 1 else "Resolve em %dº" % (pos + 1))) if triggers else "%dº" % (pos + 1)
			tile.set_caption(caption, placed)
			tile.set_key(str(pos + 1) if not placed and pos < 9 else "")
		if placed_now >= 0 and row.is_inside_tree():
			row.sort_children.connect(func() -> void:
				for option: Variant in old.keys():
					if is_instance_valid(tiles[option]):
						(tiles[option] as ChoiceCard).slide_from(float(old[option])), CONNECT_ONE_SHOT)
		var done: int = int(st["placed"])
		status.text = "Ordem atual: da esquerda para a direita." if done == 0 else ("Ordem pronta." if done >= list.size() - 1 else "%d de %d na ordem." % [done, list.size()])
		status.add_theme_color_override("font_color", ModalStyle.GOOD if done >= list.size() - 1 else ModalStyle.MUTED)
	var place: Callable = func(option: int) -> void:
		var at: int = (st["order"] as Array).find(option)
		if at < int(st["placed"]):
			return
		(st["history"] as Array).append([(st["order"] as Array).duplicate(), st["placed"]])
		(st["order"] as Array).remove_at(at)
		(st["order"] as Array).insert(int(st["placed"]), option)
		st["placed"] = int(st["placed"]) + 1
		refresh.call(option)
	for option: int in count:
		var data: Variant = d.option_card(option)
		var tile: ChoiceCard = d.card(data, width, d.option_label(option) if triggers or data == null else "")
		tiles[option] = tile
		row.add_child(tile)
		tile.pressed.connect(place.bind(option))
		# A tecla é a da posição na tela (a carta que está ali agora), não a da carta.
		d.hotkeys.append(func() -> void:
			if option < (st["order"] as Array).size():
				place.call(int((st["order"] as Array)[option])))
	refresh.call(-1)
	if triggers and bool(q.get("canRemember", false)):
		var remember := ModalStyle.checkbox("Lembrar esta ordem até o fim da partida")
		remember.toggled.connect(func(on: bool) -> void: st["remember"] = on)
		d.column.add_child(remember)
	var undo := ModalStyle.button("Desfazer", ModalStyle.Kind.SECONDARY, 170)
	undo.pressed.connect(func() -> void:
		if not (st["history"] as Array).is_empty():
			var last: Array = (st["history"] as Array).pop_back()
			st["order"] = last[0]
			st["placed"] = last[1]
			refresh.call(0))
	var confirm := ModalStyle.button("Confirmar ordem", ModalStyle.Kind.PRIMARY, 240)
	confirm.pressed.connect(func() -> void:
		var reply: Dictionary = {"indices": (st["order"] as Array).duplicate()}
		if bool(st["remember"]):
			reply["remember"] = true
		d.send(reply))
	d.actions([undo, confirm])
	d.primary = confirm


## A faixa "primeiro ——→ último" em cima das cartas ordenadas.
static func _ribbon(first: String, last: String) -> HBoxContainer:
	var ribbon := HBoxContainer.new()
	ribbon.alignment = BoxContainer.ALIGNMENT_CENTER
	ribbon.add_theme_constant_override("separation", 14)
	ribbon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ribbon.add_child(ModalStyle.label(14, ModalStyle.GOLD, first))
	var line := ColorRect.new()
	line.color = Color(ModalStyle.GOLD, 0.45)
	line.custom_minimum_size = Vector2(300, 2)
	line.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ribbon.add_child(line)
	ribbon.add_child(ModalStyle.label(14, ModalStyle.MUTED, last + "  ›"))
	return ribbon


# — Números —

## number: os números soltos como botões; senão o número grande entre − e +, com o custo total, e o desistir.
static func number(d: QuestionDialog) -> void:
	var q: Dictionary = d.question
	d.split_with_source()
	var values: Array = q.get("values", []) if q.get("values") is Array else []
	var cancel: Array = [["Cancelar mágica" if q.get("cancel") == "spell" else "Cancelar habilidade", {"indices": []}, false]] if q.get("cancel") != null else []
	if not values.is_empty():
		var buttons: Array = []
		for k: int in values.size():
			var v: int = int(values[k])
			var chip := ModalStyle.button(str(v), ModalStyle.Kind.SECONDARY, 84, 64)
			chip.add_theme_font_size_override("font_size", 28)
			chip.pressed.connect(func() -> void: d.send({"number": v}))
			d.hotkeys.append(func() -> void: d.send({"number": v}))
			buttons.append(chip)
		d.actions(buttons)
		if not cancel.is_empty():
			d.button_row(cancel)
		return
	var unit: String = Txt.of(q.get("unit"))
	var low: int = int(q.get("min", 0)) if q.get("min") != null else 0
	var high: int = int(q["max"]) if q.get("max") != null else 9999
	var cost: Dictionary = q.get("cost") if q.get("cost") is Dictionary else {}
	var affordable: int = -1
	if cost.has("available") and cost.get("available") != null:
		var each: int = mana_value(Txt.of(cost.get("each")))
		affordable = clampi((int(cost["available"]) - mana_value(Txt.of(cost.get("base")))) / maxi(each, 1), low, high) if each > 0 else high
	var st: Dictionary = {"n": low}
	var heading := ModalStyle.label(14, ModalStyle.GOLD, "VALOR DE X" if unit == "x" else ("QUANTAS VEZES" if unit == "times" else "NÚMERO"))
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	d.column.add_child(heading)
	var dial := HBoxContainer.new()
	dial.alignment = BoxContainer.ALIGNMENT_CENTER
	dial.add_theme_constant_override("separation", 18)
	d.column.add_child(dial)
	var minus := ModalStyle.button("−", ModalStyle.Kind.SECONDARY, 60, 60)
	minus.add_theme_font_size_override("font_size", 28)
	dial.add_child(minus)
	var box := PanelContainer.new()
	var box_style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.9), 16, Color(ModalStyle.GOLD, 0.45), 1)
	box_style.content_margin_left = 26
	box_style.content_margin_right = 26
	box.add_theme_stylebox_override("panel", box_style)
	box.custom_minimum_size = Vector2(140, 100)
	dial.add_child(box)
	var value := ModalStyle.label(60, ModalStyle.GOLD_LIGHT, str(low))
	value.name = "Value"
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	box.add_child(value)
	var plus := ModalStyle.button("+", ModalStyle.Kind.SECONDARY, 60, 60)
	plus.add_theme_font_size_override("font_size", 28)
	dial.add_child(plus)
	var chips := HBoxContainer.new()
	chips.alignment = BoxContainer.ALIGNMENT_CENTER
	chips.add_theme_constant_override("separation", 10)
	d.column.add_child(chips)
	var line := ModalStyle.rich("", 17, ModalStyle.MUTED, true)
	line.custom_minimum_size = Vector2(440, 0)
	d.column.add_child(line)
	var ok := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 230)
	var set_n: Callable = func(n: int) -> void:
		var next: int = clampi(n, low, high)
		var changed: bool = next != int(st["n"])
		st["n"] = next
		value.text = str(next)
		if changed:
			ModalStyle.pop(value, 0.75)
		minus.disabled = next <= low
		plus.disabled = next >= high
		ok.text = "Confirmar X = %d" % next if unit == "x" else ((("Pagar %d %s" % [next, "vez" if next == 1 else "vezes"]) if next > 0 else "Não pagar") if unit == "times" else "Confirmar")
		if not cost.is_empty():
			var text: String = "Custo total: %s" % total_cost(Txt.of(cost.get("base")), Txt.of(cost.get("each")), next)
			if affordable >= 0 and next > affordable:
				text += "  ·  mais do que a mana disponível (%d)" % int(cost["available"])
			ModalStyle.set_rich(line, text, 17, true)
	minus.pressed.connect(func() -> void: set_n.call(int(st["n"]) - 1))
	plus.pressed.connect(func() -> void: set_n.call(int(st["n"]) + 1))
	var chip_list: Array = [["Mín %d" % low, low]]
	if affordable >= 0:
		chip_list.append(["O que dá para pagar (%d)" % affordable, affordable])
	elif q.get("max") != null:
		chip_list.append(["Máx %d" % high, high])
	for entry: Array in chip_list:
		var chip := ModalStyle.button(Txt.of(entry[0]), ModalStyle.Kind.GHOST, 0, 34)
		var target: int = int(entry[1])
		chip.pressed.connect(func() -> void: set_n.call(target))
		chips.add_child(chip)
	for k: int in 9:
		d.hotkeys.append(func() -> void: set_n.call(k + 1))
	set_n.call(low)
	ok.pressed.connect(func() -> void: d.send({"number": int(st["n"])}))
	var buttons: Array = []
	if not cancel.is_empty():
		var back := ModalStyle.button(Txt.of(cancel[0][0]), ModalStyle.Kind.SECONDARY, 190)
		back.pressed.connect(func() -> void: d.send({"indices": []}))
		buttons.append(back)
	buttons.append(ok)
	d.actions(buttons)
	d.primary = ok


## Valor de mana de um custo ("{1}{G}" → 2; X vale 0).
static func mana_value(cost: String) -> int:
	var total: int = 0
	for symbol: String in ManaSymbols.parse(cost):
		if symbol.is_valid_int():
			total += int(symbol)
		elif symbol not in ["X", "Y", "Z"]:
			total += 1
	return total


## O custo base mais `times` vezes o de cada unidade, com as genéricas somadas: ("{R}", "{1}", 3) → "{3}{R}".
static func total_cost(base: String, each: String, times: int) -> String:
	var generic: int = 0
	var colored: PackedStringArray = []
	var symbols: PackedStringArray = ManaSymbols.parse(base)
	for k: int in times:
		symbols.append_array(ManaSymbols.parse(each))
	for symbol: String in symbols:
		if symbol.is_valid_int():
			generic += int(symbol)
		else:
			colored.append("{%s}" % symbol)
	var out: String = ("{%d}" % generic if generic > 0 else "") + "".join(colored)
	return out if out != "" else "{0}"


## amount (e dano de combate): o painel de quantidades (question_amounts.gd).
static func amounts(d: QuestionDialog, combat: bool) -> void:
	QuestionAmounts.build(d, combat)
