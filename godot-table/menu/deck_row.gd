# Uma linha de Meus decks: as cores em símbolos de mana, o nome, quantas cartas, a marca de válido e as ações do deck.
class_name DeckRow
extends PanelContainer

## "play", "rename", "duplicate" ou "delete".
signal action(kind: String, deck: Dictionary)

var deck: Dictionary = {}
var _colors: HBoxContainer
var _mark: Label
var _play: Button


func _init(source: Dictionary) -> void:
	deck = source
	add_theme_stylebox_override("panel", _style(false))
	mouse_entered.connect(func() -> void: add_theme_stylebox_override("panel", _style(true)))
	mouse_exited.connect(func() -> void: add_theme_stylebox_override("panel", _style(false)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	add_child(row)
	_colors = HBoxContainer.new()
	_colors.add_theme_constant_override("separation", 2)
	_colors.custom_minimum_size = Vector2(118, 0)
	_colors.alignment = BoxContainer.ALIGNMENT_END
	row.add_child(_colors)
	var text := VBoxContainer.new()
	text.add_theme_constant_override("separation", 2)
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(text)
	var title := ModalStyle.label(19, ModalStyle.INK, Txt.of(deck.get("name")))
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title.clip_text = true
	text.add_child(title)
	text.add_child(ModalStyle.label(14, ModalStyle.MUTED, DeckRow.size_text(deck)))
	_mark = ModalStyle.label(14, ModalStyle.FAINT, "")
	_mark.mouse_filter = Control.MOUSE_FILTER_PASS
	_mark.custom_minimum_size = Vector2(132, 0)
	_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row.add_child(_mark)
	_play = _button(row, "Jogar", ModalStyle.Kind.PRIMARY, "play")
	_play.tooltip_text = "Escolher este deck para a partida."
	_button(row, "Renomear", ModalStyle.Kind.SECONDARY, "rename")
	_button(row, "Duplicar", ModalStyle.Kind.SECONDARY, "duplicate")
	_button(row, "Excluir", ModalStyle.Kind.DANGER, "delete")


func _button(row: HBoxContainer, text: String, kind: int, name: String) -> Button:
	var button := ModalStyle.button(text, kind, 0.0, 40.0)
	button.name = name.capitalize()
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.pressed.connect(func() -> void: action.emit(name, deck))
	row.add_child(button)
	return button


static func _style(hover: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = UiKit.row_box(hover)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


## "60 cartas · 15 no sideboard"; no Commander, o total já conta os comandantes.
static func size_text(source: Dictionary) -> String:
	var total: int = DeckList.total_size(source)
	var text: String = "%d %s" % [total, "carta" if total == 1 else "cartas"]
	var side: int = DeckList.count_entries(source.get("sideboard"))
	if side > 0:
		text += " · %d no sideboard" % side
	return text


## As cores do deck (as dos comandantes e do deck principal, em WUBRG), pelos dados das cartas.
func set_colors(colors: PackedStringArray) -> void:
	for child: Node in _colors.get_children():
		_colors.remove_child(child)
		child.queue_free()
	for color: String in colors:
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture(color, 44)
		icon.custom_minimum_size = Vector2(22, 22)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_colors.add_child(icon)
	if colors.is_empty():
		var icon := TextureRect.new()
		icon.texture = ManaSymbols.texture("C", 44)
		icon.custom_minimum_size = Vector2(22, 22)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.modulate.a = 0.35
		_colors.add_child(icon)


## A marca da conferência ({} ainda não conferido); `problems` vira a dica do "Com problemas".
func set_check(result: Dictionary, problems: PackedStringArray) -> void:
	match Txt.of(result.get("status")):
		"valid":
			_mark.text = "Válido"
			_mark.add_theme_color_override("font_color", ModalStyle.GOOD)
			_mark.tooltip_text = "O servidor conferiu: o deck vale no %s." % DeckList.format_label(Txt.of(deck.get("format")))
		"invalid":
			_mark.text = "Com problemas"
			_mark.add_theme_color_override("font_color", ModalStyle.BAD)
			_mark.tooltip_text = "\n".join(problems)
		"offline":
			_mark.text = "Não conferido"
			_mark.add_theme_color_override("font_color", ModalStyle.FAINT)
			_mark.tooltip_text = "Sem conexão com o servidor para conferir o deck."
		_:
			_mark.text = "Conferindo…"
			_mark.add_theme_color_override("font_color", ModalStyle.FAINT)
			_mark.tooltip_text = ""
	_play.disabled = Txt.of(result.get("status")) == "invalid"
	_play.tooltip_text = "Ajuste o deck antes de jogar: %s" % (problems[0] if not problems.is_empty() else "") if _play.disabled else "Escolher este deck para a partida."
