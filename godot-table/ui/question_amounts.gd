# Dividir uma quantidade entre as opções (dano, prevenção, marcadores) e o dano de combate entre os bloqueadores: uma coluna por
# opção com a carta, o letal, − e + e os atalhos; a resposta é {amounts}, como na mesa do navegador (src/ui/amountChoice.ts).
class_name QuestionAmounts
extends RefCounted


static func build(d: QuestionDialog, combat: bool) -> void:
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
	if combat:
		d.split_with_source(200.0)
		if bool(q.get("ordered", false)):
			d.hint("Na ordem dos bloqueadores: o próximo só recebe dano depois que o anterior tem dano letal.")
	var limits: Callable = func(i: int) -> Vector2i:
		var option: Dictionary = options[i] if options[i] is Dictionary else {}
		return Vector2i(int(option.get("min", 0)), mini(int(option.get("max", total)), total))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	if options.size() > 5:
		var scroll := ScrollContainer.new()
		scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(5 * 172, 0)
		scroll.add_child(row)
		d.column.add_child(scroll)
	else:
		d.column.add_child(row)
	var width: float = d.card_width(options.size() + (2 if combat else 0), 150.0)
	var numbers: Array[Label] = []
	var lethal_labels: Dictionary = {}
	var status: Label = d.add_status()
	var confirm := ModalStyle.button("Confirmar dano" if combat else "Confirmar", ModalStyle.Kind.PRIMARY, 220)
	var sum_of: Callable = func() -> int:
		var sum: int = 0
		for v: Variant in values:
			sum += int(v)
		return sum
	var valid: Callable = func() -> bool:
		if int(sum_of.call()) != total:
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
		for i: int in values.size():
			if numbers[i].text != str(int(values[i])):
				numbers[i].text = str(int(values[i]))
				ModalStyle.pop(numbers[i], 0.7)
			if lethal_labels.has(i):
				var lethal: int = int((options[i] as Dictionary)["lethal"])
				var enough: bool = int(values[i]) >= lethal
				(lethal_labels[i] as Label).text = "Letal: %d%s" % [lethal, " ✓" if enough else ""]
				(lethal_labels[i] as Label).add_theme_color_override("font_color", ModalStyle.GOOD if enough else ModalStyle.WARN)
		var sum: int = sum_of.call()
		var ok: bool = valid.call()
		if sum < total:
			status.text = "Distribua %d de %s: falta %d." % [total, what if what != "" else "pontos", total - sum]
		elif sum > total:
			status.text = "Passou do total (%d): tire %d." % [total, sum - total]
		elif not ok:
			status.text = "O próximo só recebe dano depois que o anterior tem dano letal."
		else:
			status.text = "Tudo distribuído."
		status.add_theme_color_override("font_color", ModalStyle.GOOD if ok else ModalStyle.WARN)
		confirm.disabled = not ok
	for i: int in options.size():
		var option: Dictionary = options[i] if options[i] is Dictionary else {}
		var defender: bool = bool(option.get("defender", false))
		var name: String = "Jogador ou planeswalker atacado" if defender else d.option_label(i)
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 6)
		col.alignment = BoxContainer.ALIGNMENT_BEGIN
		row.add_child(col)
		var tile: ChoiceCard = d.card(d.option_card(i), width)
		if d.option_card(i) == null:
			var shown: String = Txt.of(option.get("label"))
			tile.set_texture(null, shown if shown != "" else ("Oponente" if defender else name))
		tile.interactive = false
		tile.mouse_default_cursor_shape = Control.CURSOR_ARROW
		col.add_child(tile)
		col.add_child(ModalStyle.wrap(15, ModalStyle.INK, name, width))
		if combat and option.get("lethal") != null and not defender:
			var lethal_label := ModalStyle.wrap(15, ModalStyle.WARN, "", width)
			lethal_labels[i] = lethal_label
			col.add_child(lethal_label)
		elif defender:
			col.add_child(ModalStyle.wrap(14, ModalStyle.MUTED, "Excesso por atropelar" if bool(q.get("trample", false)) else "", width))
		var dial := HBoxContainer.new()
		dial.alignment = BoxContainer.ALIGNMENT_CENTER
		dial.add_theme_constant_override("separation", 8)
		col.add_child(dial)
		var minus := ModalStyle.button("−", ModalStyle.Kind.SECONDARY, 44, 44)
		var number := ModalStyle.label(30, ModalStyle.GOLD_LIGHT, str(int(values[i])))
		number.custom_minimum_size = Vector2(46, 0)
		number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		numbers.append(number)
		var plus := ModalStyle.button("+", ModalStyle.Kind.SECONDARY, 44, 44)
		minus.pressed.connect(func() -> void:
			values[i] = maxi(int(values[i]) - 1, (limits.call(i) as Vector2i).x)
			refresh.call())
		plus.pressed.connect(func() -> void:
			values[i] = mini(int(values[i]) + 1, (limits.call(i) as Vector2i).y)
			refresh.call())
		dial.add_child(minus)
		dial.add_child(number)
		dial.add_child(plus)
		var quick := HBoxContainer.new()
		quick.alignment = BoxContainer.ALIGNMENT_CENTER
		quick.add_theme_constant_override("separation", 6)
		col.add_child(quick)
		if combat and option.get("lethal") != null and not defender:
			var lethal := ModalStyle.button("Letal", ModalStyle.Kind.GHOST, 0, 32)
			lethal.pressed.connect(func() -> void:
				values[i] = mini(int(option["lethal"]), (limits.call(i) as Vector2i).y)
				refresh.call())
			quick.add_child(lethal)
		var rest := ModalStyle.button("Todo o resto", ModalStyle.Kind.GHOST, 0, 32)
		rest.pressed.connect(func() -> void:
			var others: int = 0
			for j: int in values.size():
				if j != i:
					others += int(values[j])
			values[i] = clampi(total - others, (limits.call(i) as Vector2i).x, (limits.call(i) as Vector2i).y)
			refresh.call())
		quick.add_child(rest)
	d.column.move_child(status, d.column.get_child_count() - 1)
	var buttons: Array = []
	if not combat:
		var even := ModalStyle.button("Dividir igual", ModalStyle.Kind.SECONDARY, 190)
		even.pressed.connect(func() -> void:
			for j: int in values.size():
				values[j] = 0
			for k: int in total:
				values[k % values.size()] += 1
			refresh.call())
		buttons.append(even)
	elif not suggested.is_empty():
		var auto := ModalStyle.button("Distribuição sugerida", ModalStyle.Kind.SECONDARY, 220)
		auto.pressed.connect(func() -> void:
			for j: int in values.size():
				values[j] = int(suggested[j]) if j < suggested.size() else 0
			refresh.call())
		buttons.append(auto)
	confirm.pressed.connect(func() -> void: d.send({"amounts": values.duplicate()}))
	buttons.append(confirm)
	d.actions(buttons)
	d.primary = confirm
	refresh.call()
