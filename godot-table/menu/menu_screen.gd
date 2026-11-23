# Tela inicial da mesa no PC: escolher o seu deck e o do computador entre os decks prontos e começar a partida.
class_name MenuScreen
extends Control

## Pedido de partida pronto ({type:"start", ...}).
signal play(start_message: Dictionary)
## Abrir o laboratório de efeitos.
signal lab
## Abrir a tela Jogar online (salas públicas, código, criar sala).
signal online

const StarterDecks := preload("res://cards/starter_decks.gd")
## Os jeitos de jogar contra o computador: rótulo, formato e quantos jogadores.
const MODES := [["Standard · 1 contra 1", "standard", 2], ["Commander · 4 jogadores", "commander", 4]]

var version_text: String = ""
var _mode: OptionButton
var _yours: OptionButton
var _theirs: OptionButton
var _start: Button
var _decks: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var background := ColorRect.new()
	background.color = Color(0.04, 0.05, 0.09)
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER)
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	column.custom_minimum_size = Vector2(520, 0)
	column.add_theme_constant_override("separation", 16)
	add_child(column)

	var title := Hud._label(56, Hud.GOLD)
	title.text = "Mesa de Duelo"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	var subtitle := Hud._label(20, Color(1, 1, 1, 0.6))
	subtitle.text = "Prévia da mesa no PC · contra o computador"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(subtitle)

	var mode_label := Hud._label(18, Color(1, 1, 1, 0.75))
	mode_label.text = "Partida"
	column.add_child(mode_label)
	_mode = OptionButton.new()
	_mode.custom_minimum_size = Vector2(0, 46)
	_mode.add_theme_font_size_override("font_size", 19)
	for mode: Array in MODES:
		_mode.add_item(Txt.of(mode[0]))
	if OS.get_environment("MESA_COMMANDER") == "1":
		_mode.select(1)
	_mode.item_selected.connect(func(_i: int) -> void: _fill_decks())
	column.add_child(_mode)
	_yours = _deck_picker(column, "Seu deck", 0)
	_theirs = _deck_picker(column, "Deck do computador", 1)

	_start = Hud._button("Jogar contra o computador", true)
	_start.custom_minimum_size = Vector2(0, 60)
	_start.pressed.connect(_on_play)
	column.add_child(_start)

	# Partida em rede, com a mesa do navegador ou outra mesa no PC: a tela Jogar online (menu/online_screen.gd).
	var online_button := Hud._button("Jogar online", false)
	online_button.name = "Online"
	online_button.custom_minimum_size = Vector2(0, 52)
	online_button.pressed.connect(func() -> void: online.emit())
	column.add_child(online_button)
	# Partida ou sala em andamento guardada (a mesa fechou ou a conexão caiu): volta ao mesmo assento.
	var saved: Dictionary = SavedSession.current()
	if not saved.is_empty():
		var resume := Hud._button("Voltar à partida" + (" · sala %s" % Txt.of(saved.get("code")) if bool(saved.get("room", false)) else ""), true)
		resume.name = "Resume"
		resume.pressed.connect(func() -> void: play.emit(RoomMessages.rejoin(saved)))
		column.add_child(resume)
	var options := HBoxContainer.new()
	options.add_theme_constant_override("separation", 10)
	var prefs: Dictionary = Prefs.load_all()
	var effects := OptionButton.new()
	effects.custom_minimum_size = Vector2(0, 42)
	effects.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var levels: Array = [["auto", "Efeitos: automático"], ["alto", "Efeitos: alto"], ["medio", "Efeitos: médio"], ["leve", "Efeitos: leve"]]
	for i: int in levels.size():
		effects.add_item(Txt.of((levels[i] as Array)[1]))
		if (levels[i] as Array)[0] == Txt.of(prefs.get("effects", "auto")):
			effects.select(i)
	effects.tooltip_text = "No automático, os efeitos ficam mais leves sozinhos quando os quadros caem."
	effects.item_selected.connect(func(i: int) -> void: Prefs.save("effects", (levels[i] as Array)[0]))
	options.add_child(effects)
	var volume_label := Hud._label(16, Color(1, 1, 1, 0.75))
	volume_label.text = "Som"
	options.add_child(volume_label)
	var volume := HSlider.new()
	volume.min_value = 0.0
	volume.max_value = 1.0
	volume.step = 0.05
	volume.value = float(prefs.get("volume", 0.8))
	volume.custom_minimum_size = Vector2(150, 0)
	volume.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	volume.value_changed.connect(func(v: float) -> void: Prefs.save("volume", v))
	options.add_child(volume)
	column.add_child(options)
	AmbientFx.load_pref()
	var ambient: CheckBox = ModalStyle.checkbox("Efeitos contínuos nas permanentes", AmbientFx.enabled)
	ambient.tooltip_text = "Voar, vínculo com a vida, indestrutível e outras qualidades aparecem de leve nas cartas com a mesa parada."
	ambient.toggled.connect(func(on: bool) -> void: AmbientFx.set_enabled(on))
	column.add_child(ambient)
	var lab_button := Hud._button("Laboratório de efeitos", false)
	lab_button.pressed.connect(func() -> void: lab.emit())
	column.add_child(lab_button)
	_fill_decks()

	var version := Hud._label(16, Color(1, 1, 1, 0.4))
	version.text = version_text
	version.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	version.offset_left = -400
	version.offset_top = -40
	version.offset_right = -16
	version.offset_bottom = -12
	version.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	add_child(version)


func _deck_picker(parent: Control, caption: String, initial: int) -> OptionButton:
	var label := Hud._label(18, Color(1, 1, 1, 0.75))
	label.text = caption
	parent.add_child(label)
	var picker := OptionButton.new()
	picker.custom_minimum_size = Vector2(0, 46)
	picker.add_theme_font_size_override("font_size", 19)
	picker.set_meta("initial", initial)
	parent.add_child(picker)
	return picker


## Os decks prontos do formato escolhido nas duas listas.
func _fill_decks() -> void:
	_decks = StarterDecks.of_format(Txt.of((MODES[_mode.selected] as Array)[1]))
	for picker: OptionButton in [_yours, _theirs]:
		picker.clear()
		for deck: Dictionary in _decks:
			picker.add_item(Txt.of(deck.get("name", "")))
		var initial: int = int(picker.get_meta("initial"))
		if _decks.size() > initial:
			picker.select(initial)
	_start.disabled = _decks.size() < 2


func _on_play() -> void:
	var mode: Array = MODES[_mode.selected]
	var players: int = int(mode[2])
	var message: Dictionary = {
		"type": "start",
		"you": StarterDecks.forge_deck(_decks[_yours.selected]),
		"opponent": StarterDecks.forge_deck(_decks[_theirs.selected]),
		"config": {"format": mode[1], "matchLength": "bo1", "playerCount": players},
	}
	if players > 2:
		# O deck escolhido para um computador e os outros sorteados pelo servidor.
		var opponents: Array = [message["opponent"]]
		for i: int in players - 2:
			opponents.append(null)
		message["opponents"] = opponents
		message["opponent"] = null
	play.emit(message)
