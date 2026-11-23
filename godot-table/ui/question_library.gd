# As escolhas que movem cartas entre lugares: vidência e vigilância (topo ou fundo, e a ordem do topo), separar e escolher
# montes e os dois destinos das cartas buscadas, com as respostas no formato da mesa do navegador (src/ui/libraryChoice.ts).
class_name QuestionLibrary
extends RefCounted

const ZONES_PT := QuestionPurposes.ZONES_PT


## Vidência e vigilância: a da esquerda é o topo; cada carta fica no topo ou vai para o fundo/cemitério; "top" reordena.
static func library(d: QuestionDialog) -> void:
	var where: String = Txt.of(d.question.get("library"))
	var away: String = "Cemitério" if where == "graveyard" else "Fundo"
	var count: int = d.options().size()
	var st: Dictionary = {"leaving": [], "order": range(count)}
	if where == "top":
		d.hint("A da esquerda fica no topo do grimório. Use as setas para mudar a ordem.")
	else:
		d.hint("A da esquerda é a do topo. Toque numa carta (ou em %s) para mandá-la para %s." % [away, "o cemitério" if where == "graveyard" else "o fundo"])
	d.column.add_child(QuestionScreens._ribbon("TOPO DO GRIMÓRIO", "MAIS ABAIXO"))
	var row := d.card_row()
	var width: float = d.card_width(count, 220.0)
	var tiles: Dictionary = {}
	var toggles: Dictionary = {}
	var status: Label = d.add_status()
	var refresh: Callable = func(slide: bool) -> void:
		var list: Array = st["order"]
		var old: Dictionary = {}
		for index: Variant in list:
			old[index] = (tiles[index] as Control).global_position.x
		for pos: int in list.size():
			var index: int = list[pos]
			var holder: Control = tiles[index]
			row.move_child(holder, pos)
			var tile: ChoiceCard = holder.get_child(0)
			var leaving: bool = (st["leaving"] as Array).has(index)
			tile.set_badge(str(pos + 1), not leaving)
			tile.modulate = Color(1, 1, 1, 0.5) if leaving else Color.WHITE
			if toggles.has(index):
				var pair: Array = toggles[index]
				ModalStyle.style_button(pair[0], ModalStyle.Kind.SECONDARY if leaving else ModalStyle.Kind.PRIMARY)
				ModalStyle.style_button(pair[1], ModalStyle.Kind.PRIMARY if leaving else ModalStyle.Kind.SECONDARY)
		if slide and row.is_inside_tree():
			row.sort_children.connect(func() -> void:
				for index: Variant in old.keys():
					if is_instance_valid(tiles[index]):
						((tiles[index] as Control).get_child(0) as ChoiceCard).slide_from(float(old[index])), CONNECT_ONE_SHOT)
		var out: int = (st["leaving"] as Array).size()
		if where == "top":
			status.text = "A ordem fica como está na tela."
		elif out == 0:
			status.text = "Todas ficam no topo."
		elif out == list.size():
			status.text = "Todas vão para %s." % ("o cemitério" if where == "graveyard" else "o fundo")
		else:
			status.text = "%d para %s, %d no topo." % [out, "o cemitério" if where == "graveyard" else "o fundo", list.size() - out]
		status.add_theme_color_override("font_color", ModalStyle.MUTED)
	for index: int in count:
		var holder := VBoxContainer.new()
		holder.add_theme_constant_override("separation", 8)
		var tile: ChoiceCard = d.card(d.option_card(index), width)
		holder.add_child(tile)
		tiles[index] = holder
		row.add_child(holder)
		if where == "top":
			var arrows := HBoxContainer.new()
			arrows.alignment = BoxContainer.ALIGNMENT_CENTER
			arrows.add_theme_constant_override("separation", 8)
			for step: int in [-1, 1]:
				var arrow := ModalStyle.button("←" if step < 0 else "→", ModalStyle.Kind.SECONDARY, 64, 40)
				arrow.pressed.connect(func() -> void:
					var list: Array = st["order"]
					var pos: int = list.find(index)
					var to: int = clampi(pos + step, 0, list.size() - 1)
					list.remove_at(pos)
					list.insert(to, index)
					refresh.call(true))
				arrows.add_child(arrow)
			holder.add_child(arrows)
			tile.interactive = false
			tile.mouse_default_cursor_shape = Control.CURSOR_ARROW
			continue
		var flip: Callable = func(go: bool) -> void:
			var leaving: Array = st["leaving"]
			if go and not leaving.has(index):
				leaving.append(index)
			elif not go:
				leaving.erase(index)
			refresh.call(false)
		var pair := HBoxContainer.new()
		pair.alignment = BoxContainer.ALIGNMENT_CENTER
		pair.add_theme_constant_override("separation", 6)
		var stay := ModalStyle.button("Topo", ModalStyle.Kind.PRIMARY, width / 2.0 - 3.0, 40)
		var go := ModalStyle.button(away, ModalStyle.Kind.SECONDARY, width / 2.0 - 3.0, 40)
		stay.pressed.connect(func() -> void: flip.call(false))
		go.pressed.connect(func() -> void: flip.call(true))
		pair.add_child(stay)
		pair.add_child(go)
		holder.add_child(pair)
		toggles[index] = [stay, go]
		var toggle: Callable = func() -> void: flip.call(not (st["leaving"] as Array).has(index))
		tile.pressed.connect(toggle)
		tile.set_key(str(index + 1) if index < 9 else "")
		d.hotkeys.append(toggle)
	d.column.move_child(status, d.column.get_child_count() - 1)
	refresh.call(false)
	var confirm := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 220)
	confirm.pressed.connect(func() -> void:
		if where == "top":
			d.send({"indices": (st["order"] as Array).duplicate()})
		else:
			var out: Array = (st["leaving"] as Array).duplicate()
			out.sort()
			d.send({"indices": out}))
	d.actions([confirm])
	d.primary = confirm


## Uma caixa de monte: o título, para onde vai e as cartas.
static func _pile_box(title: String, note: String, lit: bool) -> Array:
	var panel := PanelContainer.new()
	var style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.55), 16, Color(ModalStyle.GOLD, 0.55) if lit else Color(1, 1, 1, 0.12), 1)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 12
	style.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	head.add_child(ModalStyle.label(18, ModalStyle.GOLD, title))
	if note != "":
		head.add_child(ModalStyle.label(15, ModalStyle.MUTED, note))
	column.add_child(head)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	column.add_child(row)
	return [panel, row]


## Separar em dois montes: tocar na carta a troca de monte; a resposta são as do monte 1.
static func piles_split(d: QuestionDialog) -> void:
	var pile_one: Array = range(d.options().size())
	var holder := VBoxContainer.new()
	holder.add_theme_constant_override("separation", 12)
	var chosen_to: String = Txt.of(ZONES_PT.get(Txt.of(d.question.get("chosenTo")).to_lower(), ""))
	var other_to: String = Txt.of(ZONES_PT.get(Txt.of(d.question.get("otherTo")).to_lower(), ""))
	if chosen_to != "":
		d.hint("Toque numa carta para trocá-la de monte. O monte escolhido vai para %s%s." % [chosen_to, "; o outro, para %s" % other_to if other_to != "" else ""])
	else:
		d.hint("Toque numa carta para trocá-la de monte.")
	d.column.add_child(holder)
	var width: float = d.card_width(d.options().size(), 150.0, 2)
	var fill: Callable = func(self_call: Callable) -> void:
		for child: Node in holder.get_children():
			child.queue_free()
		for pile: int in 2:
			var size: int = pile_one.size() if pile == 0 else d.options().size() - pile_one.size()
			var box: Array = _pile_box("Monte %d" % (pile + 1), "%d %s" % [size, "carta" if size == 1 else "cartas"], pile == 0)
			holder.add_child(box[0])
			var row: HBoxContainer = box[1]
			row.custom_minimum_size = Vector2(0, width * ChoiceCard.ASPECT + ChoiceCard.LIFT_ROOM)
			for i: int in d.options().size():
				if pile_one.has(i) != (pile == 0):
					continue
				var tile: ChoiceCard = d.card(d.option_card(i), width)
				tile.pressed.connect(func() -> void:
					if pile_one.has(i):
						pile_one.erase(i)
					else:
						pile_one.append(i)
					self_call.call(self_call))
				row.add_child(tile)
			if size == 0:
				row.add_child(ModalStyle.label(15, ModalStyle.FAINT, "Vazio"))
	fill.call(fill)
	var confirm := ModalStyle.button("Confirmar montes", ModalStyle.Kind.PRIMARY, 240)
	confirm.pressed.connect(func() -> void:
		var out: Array = pile_one.duplicate()
		out.sort()
		d.send({"indices": out}))
	d.actions([confirm])
	d.primary = confirm


## Escolher um de dois montes: cada monte numa caixa com as cartas (o virado para baixo mostra só versos) e o botão dele.
static func piles_choose(d: QuestionDialog) -> void:
	var piles: Array = d.question["piles"]
	var biggest: int = 1
	for raw: Variant in piles:
		biggest = maxi(biggest, int((raw as Dictionary).get("size", 0)))
	var width: float = d.card_width(biggest * 2, 150.0)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 24)
	d.column.add_child(row)
	for p: int in piles.size():
		var pile: Dictionary = piles[p]
		var box: Array = _pile_box("Monte %d" % (p + 1), "%d %s" % [int(pile.get("size", 0)), "carta" if int(pile.get("size", 0)) == 1 else "cartas"], false)
		var column: VBoxContainer = (box[0] as PanelContainer).get_child(0)
		var cards: HBoxContainer = box[1]
		row.add_child(box[0])
		for index: Variant in pile.get("cards", []):
			cards.add_child(d.card(d.option_card(int(index)), width))
		for k: int in maxi(0, int(pile.get("size", 0)) - (pile.get("cards", []) as Array).size()):
			cards.add_child(d.card({"faceDown": true}, width))
		var pick := ModalStyle.button("Escolher o monte %d" % (p + 1), ModalStyle.Kind.PRIMARY if p == 0 else ModalStyle.Kind.SECONDARY, 0, 46)
		var act: Callable = func() -> void: d.send({"indices": [int(pile["option"])]})
		pick.pressed.connect(act)
		d.hotkeys.append(act)
		column.add_child(pick)


## Dois destinos das cartas buscadas (Cultivate): as primeiras tocadas vão para o primeiro lugar, o resto para o segundo.
static func split_destinations(d: QuestionDialog) -> void:
	var destinations: Array = d.question["destinations"]
	var first: Dictionary = destinations[0]
	var second: Dictionary = destinations[1]
	var max_pick: int = int(d.question.get("max", 2))
	var min_pick: int = int(d.question.get("min", 1))
	var first_count: int = mini(int(first.get("count", 1)), max_pick)
	var name: Callable = func(dest: Dictionary) -> String:
		var zone: String = Txt.of(ZONES_PT.get(Txt.of(dest.get("zone")).to_lower(), Txt.of(dest.get("zone"))))
		return zone + (" (virada)" if bool(dest.get("tapped", false)) else "")
	d.hint("As %d primeiras vão para %s; as outras, para %s." % [first_count, name.call(first), name.call(second)] if first_count != 1 else "A primeira vai para %s; a outra, para %s." % [name.call(first), name.call(second)])
	var chosen: Array = []
	var tiles: Dictionary = {}
	var holder: Container = QuestionScreens._card_holder(d, d.options().size())
	var width: float = minf(float(holder.get_meta("card_width")), 200.0)
	var confirm := ModalStyle.button("Confirmar", ModalStyle.Kind.PRIMARY, 220)
	var refresh: Callable = func() -> void:
		for k: Variant in tiles.keys():
			var at: int = chosen.find(k)
			var tile: ChoiceCard = tiles[k]
			tile.set_selected(at >= 0, false)
			tile.set_badge(str(at + 1) if at >= 0 else "")
			tile.set_caption("" if at < 0 else ("→ %s" % name.call(first if at < first_count else second)), at >= 0)
		var status: Array = QuestionDialog.count_text(chosen.size(), min_pick, max_pick)
		d.set_status(status[0], status[1])
		confirm.disabled = chosen.size() < min_pick
	for i: int in d.options().size():
		var tile: ChoiceCard = d.card(d.option_card(i), width)
		tile.set_caption("")
		if i < 9:
			tile.set_key(str(i + 1))
		tiles[i] = tile
		var act: Callable = func() -> void:
			if chosen.has(i):
				chosen.erase(i)
			elif chosen.size() < max_pick:
				chosen.append(i)
			refresh.call()
		tile.pressed.connect(act)
		d.hotkeys.append(act)
		holder.add_child(tile)
	d.add_status()
	confirm.pressed.connect(func() -> void: d.send({"indices": chosen.duplicate()}))
	var buttons: Array = []
	if min_pick == 0:
		var none := ModalStyle.button("Não procurar", ModalStyle.Kind.SECONDARY, 180)
		none.pressed.connect(func() -> void: d.send({"indices": []}))
		buttons.append(none)
	buttons.append(confirm)
	d.actions(buttons)
	d.primary = confirm
	refresh.call()
