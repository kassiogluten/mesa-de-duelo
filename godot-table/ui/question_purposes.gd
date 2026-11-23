# As telas de uma finalidade só, com as respostas no formato da mesa do navegador: modos, jeito de jogar, vidência, montes,
# voto, masmorra, substituição, custos opcionais, nomes e tipos, dois destinos, zona de comando e cores.
class_name QuestionPurposes
extends RefCounted

const ZONES_PT := {"hand": "a mão", "graveyard": "o cemitério", "battlefield": "o campo", "library": "o grimório", "exile": "o exílio"}
## Jeito de jogar → nome e a frase que explica (MODES de src/ui/choiceScreens.ts).
const MODES := {
	"cast": ["Conjurar", "Pague o custo normal."], "land": ["Jogar terreno", "Usa a jogada de terreno do turno."],
	"cycling": ["Reciclar", "Descarte esta carta e compre uma carta."],
	"plot": ["Tramar", "Exile a carta. Num turno seu mais adiante, conjure sem pagar o custo de mana."],
	"plotted": ["Conjurar tramada", "Conjure do exílio sem pagar o custo de mana."],
	"foretell": ["Prever", "Exile virada para baixo e conjure depois pelo custo previsto."],
	"foretold": ["Conjurar prevista", "Conjure do exílio pelo custo previsto."],
	"flashback": ["Flashback", "Conjure do cemitério. Depois a carta é exilada."],
	"escape": ["Fuga", "Conjure do cemitério exilando outras cartas de lá."],
	"harmonize": ["Harmonizar", "Conjure do cemitério. Depois a carta é exilada."],
	"evoke": ["Evocar", "Custo menor, mas a criatura é sacrificada ao entrar."],
	"dash": ["Dash", "Entra com ímpeto e volta para a mão no fim do turno."],
	"blitz": ["Blitz", "Entra com ímpeto, compra uma carta ao morrer e é sacrificada no fim do turno."],
	"madness": ["Loucura", "Conjure pelo custo de loucura ao descartá-la."], "overload": ["Sobrecarga", "Afeta cada alvo possível em vez de um só."],
	"bestow": ["Agraciar", "Conjure como aura presa a uma criatura."], "disturb": ["Perturbar", "Conjure transformada a partir do cemitério."],
	"adventure": ["Aventura", "Conjure a aventura. Depois, do exílio, a criatura pode ser conjurada."],
	"omen": ["Presságio", "Conjure o presságio. Depois a carta volta embaralhada ao grimório."],
	"aftermath": ["Consequência", "Conjure esta metade a partir do cemitério."],
	"facedown": ["Virada para baixo", "Conjure como criatura 2/2 sem nome, virada para baixo."],
	"prowl": ["Rondar", "Custo menor depois de causar dano de combate com o tipo certo."],
	"spectacle": ["Espetáculo", "Custo menor se um oponente perdeu vida neste turno."],
	"surge": ["Surto", "Custo menor se você já conjurou outra mágica neste turno."],
	"emerge": ["Emergir", "Sacrifique uma criatura para pagar menos."], "mutate": ["Mutação", "Junte a uma criatura sua que não seja Humano."],
	"awaken": ["Despertar", "Também transforma um terreno seu em criatura."],
	"warp": ["Dobra", "Custo menor; volta ao exílio no fim do turno e pode ser conjurada depois."],
	"ninjutsu": ["Ninjutsu", "Troque por um atacante não bloqueado seu."], "equip": ["Equipar", "Prenda a uma criatura sua."],
	"crew": ["Tripular", "Vire criaturas para transformar o veículo em criatura."],
}
## Cor (ou terreno básico) como o Forge escreve → símbolo, nome e ordem (src/ui/colorChoice.ts).
const COLORS := {"white": ["W", "Branco", 0], "blue": ["U", "Azul", 1], "black": ["B", "Preto", 2], "red": ["R", "Vermelho", 3],
	"green": ["G", "Verde", 4], "colorless": ["C", "Incolor", 5], "artifact": ["A", "Artefatos", 6], "artifacts": ["A", "Artefatos", 6]}
const LANDS := {"plains": ["W", "Planície", 0], "island": ["U", "Ilha", 1], "swamp": ["B", "Pântano", 2], "mountain": ["R", "Montanha", 3], "forest": ["G", "Floresta", 4]}


## Monta a tela pela finalidade; false quando é uma pergunta genérica.
static func build(d: QuestionDialog) -> bool:
	var q: Dictionary = d.question
	var purpose: String = Txt.of(q.get("purpose"))
	var kind: String = Txt.of(q.get("kind"))
	if purpose == "play-mode" or q.get("method") == "getAbilityToPlay":
		_play_mode(d)
	elif purpose == "library" and q.get("library") != null and not d.options().is_empty():
		QuestionLibrary.library(d)
	elif purpose == "vote":
		_vote(d)
	elif purpose == "piles-split":
		QuestionLibrary.piles_split(d)
	elif purpose == "piles-choose" and (q.get("piles", []) as Array).size() == 2:
		QuestionLibrary.piles_choose(d)
	elif purpose == "replacement-order":
		_replacement(d)
	elif purpose == "optional-costs":
		_optional_costs(d)
	elif purpose == "creature-type":
		_search(d, true)
	elif purpose == "modes":
		_modes(d)
	elif kind == "number":
		QuestionScreens.number(d)
	elif purpose == "dungeon-room" or purpose == "dungeon-choice":
		_dungeon(d)
	elif purpose == "card-name" and d.options().size() >= 100:
		_search(d, false)
	elif purpose == "split-destinations" and (q.get("destinations", []) as Array).size() == 2:
		QuestionLibrary.split_destinations(d)
	elif purpose == "commander-zone":
		var zone: String = "Exílio" if Txt.of(q.get("zone")) == "Exile" else "Cemitério"
		d.split_with_source()
		d.hint("Seu comandante iria para o %s. Para onde ele vai?" % zone.to_lower())
		d.button_row([[zone, {"value": false}, false], ["Zona de comando", {"value": true}, true]])
	else:
		return false
	return true


## Modos de uma mágica modal: a carta à esquerda e os modos em lista; os indisponíveis apagados com o motivo (não entram na resposta).
static func _modes(d: QuestionDialog) -> void:
	d.split_with_source()
	var labels: Array = []
	for i: int in d.options().size():
		labels.append(d.option_label(i))
	QuestionScreens.pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}), labels)
	for raw: Variant in d.question.get("unavailableModes", []):
		var mode: Dictionary = raw
		var gone := ChoiceOption.new().setup(Txt.of(mode.get("label")), "Sem alvo possível agora" if mode.get("reason") == "target" else "Já escolhido antes")
		gone.set_disabled(true)
		d.column.add_child(gone)
	if int(d.question.get("min", 1)) == 0 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Nenhum modo", {"indices": []}, false]])


## Jeito de jogar a carta: a carta grande à esquerda e um cartão por jeito (conjurar, reciclar, aventura…), com o custo em ícones.
static func _play_mode(d: QuestionDialog) -> void:
	var source: Variant = d.question.get("card")
	if not (source is Dictionary) and not d.options().is_empty():
		source = d.option_card(0)
	d.split_with_source(240.0, source)
	for i: int in d.options().size():
		var option: Dictionary = d.options()[i] if d.options()[i] is Dictionary else {"label": d.options()[i]}
		var mode: String = Txt.of(option.get("mode"))
		var known: Array = MODES.get(mode, [])
		var title: String = d.option_label(i)
		var detail: String = ""
		if not known.is_empty():
			title = Txt.of(known[0])
			detail = Txt.of(known[1])
			if option.get("face") is Dictionary:
				title += ": %s" % d.catalog.label(Txt.of((option["face"] as Dictionary).get("name"))) if d.catalog else ""
		var side: Control = null
		var loyalty: String = Txt.of(option.get("loyalty"))
		if loyalty != "":
			title = d.option_label(i)
			if title.begins_with(loyalty + ":"):
				title = title.substr(loyalty.length() + 1).strip_edges()
			side = _loyalty_chip(loyalty)
		var extra: Array = option.get("extra", []) if option.get("extra") is Array else []
		if not extra.is_empty() and side == null:
			side = ModalStyle.label(13, ModalStyle.WARN, ", ".join(PackedStringArray(extra.map(func(e: Variant) -> String: return Txt.of(e)))))
		var row := ChoiceOption.new().setup(title, detail, Txt.of(option.get("cost")), str(i + 1) if i < 9 else "", side)
		var act: Callable = func() -> void: d.send({"indices": [i]})
		row.pressed.connect(act)
		d.hotkeys.append(act)
		d.column.add_child(row)
	d.button_row([["Cancelar", {"indices": []}, false]])


## O custo de lealdade num selo: verde para subir, vermelho para descer.
static func _loyalty_chip(loyalty: String) -> PanelContainer:
	var up: bool = loyalty.begins_with("+")
	var down: bool = loyalty.begins_with("-")
	var color: Color = ModalStyle.GOOD if up else (ModalStyle.BAD if down else ModalStyle.MUTED)
	var chip := PanelContainer.new()
	var style := ModalStyle.box(Color(color, 0.16), 8, Color(color, 0.7), 1)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 2
	style.content_margin_bottom = 2
	chip.add_theme_stylebox_override("panel", style)
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_child(ModalStyle.label(18, color, loyalty.replace("-", "−")))
	return chip


## Votação do conselho: a carta que vota à esquerda, o placar e uma opção por voto.
static func _vote(d: QuestionDialog) -> void:
	d.split_with_source()
	var votes: Array = d.question.get("votes", []) if d.question.get("votes") is Array else []
	if not votes.is_empty():
		var tally: PackedStringArray = []
		for raw: Variant in votes:
			tally.append(Txt.of((raw as Dictionary).get("label")))
		d.hint("Votos até agora: %s" % ", ".join(tally))
	QuestionScreens.pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))
	if int(d.question.get("min", 1)) == 0 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Não votar", {"indices": []}, false]])


## Qual efeito de substituição vem primeiro (as cartas, quando há), com "usar a mesma escolha" quando vale para o resto do efeito.
static func _replacement(d: QuestionDialog) -> void:
	var st: Dictionary = {"all": true}
	var done: Callable = func(picked: Array) -> void:
		var reply: Dictionary = {"indices": picked}
		if bool(d.question.get("applyToAll", false)):
			reply["all"] = bool(st["all"])
		d.send(reply)
	var all_cards: bool = not d.options().is_empty() and range(d.options().size()).all(func(i: int) -> bool: return d.option_card(i) != null)
	if all_cards:
		var row := d.card_row()
		var width: float = d.card_width(d.options().size(), 220.0)
		for i: int in d.options().size():
			var tile: ChoiceCard = d.card(d.option_card(i), width, d.option_label(i))
			tile.set_key(str(i + 1))
			var act: Callable = func() -> void: done.call([i])
			tile.pressed.connect(act)
			d.hotkeys.append(act)
			row.add_child(tile)
	else:
		QuestionScreens.pick_list(d, done)
	if bool(d.question.get("applyToAll", false)):
		var same := ModalStyle.checkbox("Usar a mesma escolha no resto deste efeito", true)
		same.toggled.connect(func(on: bool) -> void: st["all"] = on)
		d.column.add_child(same)


## Custos opcionais (reforço, oferenda…): com um só, "Sem" e "Com"; com vários, marcar e conjurar.
static func _optional_costs(d: QuestionDialog) -> void:
	d.split_with_source()
	var cost: Variant = d.question.get("cost")
	if cost is Dictionary:
		d.hint("Custo sem os opcionais: %s%s." % [Txt.of((cost as Dictionary).get("base")), (" · mana disponível: %d" % int((cost as Dictionary)["available"])) if (cost as Dictionary).get("available") != null else ""])
	if d.options().size() == 1 and int(d.question.get("max", 1)) <= 1:
		d.button_row([["Sem", {"indices": []}, false], ["Com %s" % d.option_label(0), {"indices": [0]}, true]])
		return
	QuestionScreens.pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))
	d.button_row([["Sem custos opcionais", {"indices": []}, false]])


## Masmorra: as salas (ou as masmorras) como cartas quando há imagem, senão em lista.
static func _dungeon(d: QuestionDialog) -> void:
	if range(d.options().size()).all(func(i: int) -> bool: return d.option_card(i) != null):
		QuestionScreens.pick_cards(d, range(d.options().size()), [], func(picked: Array) -> void: d.send({"indices": picked}))
	else:
		QuestionScreens.pick_list(d, func(picked: Array) -> void: d.send({"indices": picked}))


## Nomear uma carta (centenas de nomes) ou escolher um tipo de criatura: busca e até 40 resultados (Enter escolhe o primeiro).
static func _search(d: QuestionDialog, creature_types: bool) -> void:
	d.split_with_source()
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
	field.custom_minimum_size = Vector2(520, 50)
	field.add_theme_font_size_override("font_size", 19)
	field.add_theme_stylebox_override("normal", QuestionDialog._field_style(false))
	field.add_theme_stylebox_override("focus", QuestionDialog._field_style(true))
	d.column.add_child(field)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 6)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(520, 380)
	scroll.add_child(list)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	d.column.add_child(scroll)
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
			var count: int = int((d.options()[i] as Dictionary).get("count", 0)) if creature_types and d.options()[i] is Dictionary else 0
			var row := ChoiceOption.new().setup(Txt.of(labels[i]), "%d no seu deck" % count if count > 0 else "")
			row.set_meta("option", int(i))
			row.pressed.connect(func() -> void: d.send({"indices": [int(i)]}))
			list.add_child(row)
			shown += 1
		if shown == 0:
			list.add_child(ModalStyle.wrap(16, ModalStyle.FAINT, "Nenhum resultado.", 0.0))
	field.text_changed.connect(fill)
	field.text_submitted.connect(func(_t: String) -> void:
		for child: Node in list.get_children():
			if child is ChoiceOption and not child.is_queued_for_deletion():
				d.send({"indices": [int(child.get_meta("option"))]})
				return)
	fill.call("")
	if int(d.question.get("min", 1)) == 0:
		d.button_row([["Não escolher" if creature_types else "Nenhum", {"indices": []}, false]])
	field.grab_focus.call_deferred()


## Cor, proteção contra uma cor ou tipo de terreno básico (escolha de uma opção, sem finalidade): os símbolos grandes, com o nome em português.
static func colors(d: QuestionDialog) -> bool:
	var q: Dictionary = d.question
	if Txt.of(q.get("kind")) != "choose" or Txt.of(q.get("purpose")) != "" or int(q.get("max", 1)) != 1 or d.options().size() < 2:
		return false
	var keys: Array = []
	for raw: Variant in d.options():
		keys.append((Txt.of(raw) if raw is String else Txt.of((raw as Dictionary).get("label"))).strip_edges().to_lower())
	var table: Dictionary = LANDS if keys.all(func(k: String) -> bool: return LANDS.has(k)) else COLORS
	if not keys.all(func(k: String) -> bool: return table.has(k)):
		return false
	var items: Array = range(keys.size())
	items.sort_custom(func(a: int, b: int) -> bool: return int(table[keys[a]][2]) < int(table[keys[b]][2]))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 22)
	d.column.add_child(row)
	for k: int in items.size():
		var i: int = items[k]
		var entry: Array = table[keys[i]]
		var symbol: String = Txt.of(entry[0])
		var pick := Button.new()
		pick.focus_mode = Control.FOCUS_NONE
		pick.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		pick.custom_minimum_size = Vector2(118, 150)
		pick.flat = true
		for state_name: String in ["normal", "hover", "pressed", "focus"]:
			var style := ModalStyle.box(Color(1, 1, 1, 0.07) if state_name == "hover" else Color(0, 0, 0, 0), 18, Color(ModalStyle.BLUE, 0.7) if state_name == "hover" else Color(0, 0, 0, 0), 2)
			pick.add_theme_stylebox_override(state_name, style)
		var stack := VBoxContainer.new()
		stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		stack.alignment = BoxContainer.ALIGNMENT_CENTER
		stack.add_theme_constant_override("separation", 10)
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		pick.add_child(stack)
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(symbol if symbol != "A" else "C", 160)
		icon.custom_minimum_size = Vector2(80, 80)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.add_child(icon)
		var name := ModalStyle.label(17, ModalStyle.INK, Txt.of(entry[1]))
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		stack.add_child(name)
		var key := ModalStyle.keycap(str(k + 1))
		key.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		stack.add_child(key)
		var act: Callable = func() -> void: d.send({"indices": [i]})
		pick.pressed.connect(act)
		d.hotkeys.append(act)
		row.add_child(pick)
	if int(q.get("min", 1)) == 0:
		d.button_row([["Não escolher", {"indices": []}, false]])
	return true
