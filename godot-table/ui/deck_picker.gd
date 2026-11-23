# Escolha do deck para uma sala: os decks do formato (DeckChoices), agrupados em "Meus decks" e "Decks prontos", numa lista suspensa.
class_name DeckPicker
extends OptionButton

## O jogador escolheu um deck da lista ({id, name, group, deck}).
signal picked(choice: Dictionary)

var format: String = ""
var _choices: Array = []
var _filling: bool = false


func _init() -> void:
	custom_minimum_size = Vector2(0, 46)
	add_theme_font_size_override("font_size", 18)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	focus_mode = Control.FOCUS_ALL
	fit_to_longest_item = false
	clip_text = true
	for state: String in ["normal", "hover", "pressed", "focus", "disabled"]:
		var style := ModalStyle.box(Color(0.03, 0.05, 0.1, 0.9) if state != "hover" else Color(0.07, 0.1, 0.18, 0.95), 10,
			Color(ModalStyle.GOLD, 0.55) if state in ["hover", "focus"] else Color(1, 1, 1, 0.16), 1)
		style.content_margin_left = 14
		style.content_margin_right = 14
		add_theme_stylebox_override(state, style)
	item_selected.connect(_on_selected)


## Preenche com os decks do formato e marca o `selected_id` (ou nenhum, com o `placeholder` no lugar).
## `placeholder`: o texto da linha sem deck marcado.
func set_format(new_format: String, selected_id: String = "", placeholder: String = "Escolha um deck") -> void:
	format = new_format
	_filling = true
	clear()
	_choices = DeckChoices.for_format(format)
	var group: String = ""
	var mark: int = -1
	var known: bool = selected_id != "" and _choices.any(func(c: Dictionary) -> bool: return Txt.of(c.get("id")) == selected_id)
	if not known:
		add_item(placeholder)
		set_item_metadata(item_count - 1, -1)
		set_item_disabled(item_count - 1, true)
		mark = 0
	for i: int in _choices.size():
		var choice: Dictionary = _choices[i]
		var choice_group: String = Txt.of(choice.get("group"))
		if choice_group != group:
			group = choice_group
			add_separator(group)
		add_item(Txt.of(choice.get("name")))
		set_item_metadata(item_count - 1, i)
		if Txt.of(choice.get("id")) == selected_id:
			mark = item_count - 1
	select(mark)
	_filling = false


## A escolha marcada; {} sem nenhuma.
func selected_choice() -> Dictionary:
	if selected < 0:
		return {}
	var index: Variant = get_item_metadata(selected)
	return _choices[int(index)] if index is int and int(index) >= 0 and int(index) < _choices.size() else {}


func choice_count() -> int:
	return _choices.size()


func _on_selected(_index: int) -> void:
	if _filling:
		return
	var choice: Dictionary = selected_choice()
	if not choice.is_empty():
		picked.emit(choice)
