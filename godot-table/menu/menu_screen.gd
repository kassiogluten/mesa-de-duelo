# Tela inicial da mesa no PC: escolher o seu deck (Meus decks ou um pronto) e o do computador e começar a partida.
class_name MenuScreen
extends Control

## Pedido de partida pronto ({type:"start", ...}).
signal play(start_message: Dictionary)
## Abrir o laboratório de efeitos.
signal lab
## Abrir a tela Jogar online (salas públicas, código, criar sala).
signal online
## Relatar um problema e Meus relatos (as janelas ficam em main.gd).
signal report
signal my_reports

const StarterDecks := preload("res://cards/starter_decks.gd")
## Os jeitos de jogar contra o computador: rótulo, formato e quantos jogadores.
const MODES := [
	["Standard · 1 contra 1", "standard", 2], ["Commander · 4 jogadores", "commander", 4], ["Pauper · 1 contra 1", "pauper", 2],
	["Sacola 50 · 1 contra 1", "sacola50", 2], ["Oathbreaker · 1 contra 1", "oathbreaker", 2], ["Livre · 1 contra 1", "free", 2],
]

var version_text: String = ""
var _mode: OptionButton
var _yours: OptionButton
var _theirs: OptionButton
var _start: Button
var _decks: Array = []
## O deck de Meus decks escolhido por último (o id), para continuar escolhido quando a lista é refeita.
var _chosen_id: String = ""
var _sync: DeckSync
var _deck_screen: DeckScreen


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
	# "Meus decks" ao lado da escolha do seu deck.
	var yours_row := HBoxContainer.new()
	yours_row.add_theme_constant_override("separation", 10)
	column.add_child(yours_row)
	_yours.reparent(yours_row)
	_yours.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_yours.item_selected.connect(func(i: int) -> void:
		var picked: Variant = _yours.get_item_metadata(i)
		_chosen_id = Txt.of((picked as Dictionary).get("id")) if picked is Dictionary and not bool((picked as Dictionary).get("builtin", false)) else "")
	var my_decks := Hud._button("Meus decks", false)
	my_decks.name = "MyDecks"
	my_decks.custom_minimum_size = Vector2(150, 46)
	my_decks.pressed.connect(open_decks)
	yours_row.add_child(my_decks)
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
	_sync = DeckSync.new()
	add_child(_sync)
	_sync.decks_changed.connect(_fill_decks)
	if AccountSession.signed_in():
		_sync.run()
	var lab_button := Hud._button("Laboratório de efeitos", false)
	lab_button.pressed.connect(func() -> void: lab.emit())
	column.add_child(lab_button)
	var reports := HBoxContainer.new()
	reports.add_theme_constant_override("separation", 10)
	for entry: Array in [["Relatar um problema", report], ["Meus relatos", my_reports]]:
		var button := Hud._button(Txt.of(entry[0]), false)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var target: Signal = entry[1]
		button.pressed.connect(func() -> void: target.emit())
		reports.add_child(button)
	column.add_child(reports)
	_fill_decks()

	# A conta, no canto de cima (entrar pelo site, a conta ligada e Sair), com os avisos dela no meio da tela.
	var account := AccountPanel.new()
	add_child(account)
	var toasts := ToastStack.new()
	add_child(toasts)
	account.toast.connect(toasts.show_toast)
	AccountSession.notifier().changed.connect(_on_account_changed)

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


## Os decks do formato escolhido: no seu, os de Meus decks e depois os prontos; no do computador, só os prontos.
func _fill_decks() -> void:
	var format: String = Txt.of((MODES[_mode.selected] as Array)[1])
	_decks = StarterDecks.of_format(format)
	var mine: Array = DeckLibrary.load_all().filter(func(d: Dictionary) -> bool: return d.get("format") == format)
	_yours.clear()
	if not mine.is_empty():
		_yours.add_separator("Meus decks")
		for deck: Dictionary in mine:
			_add_deck_item(_yours, deck)
		_yours.add_separator("Decks prontos")
	for deck: Dictionary in _decks:
		_add_deck_item(_yours, deck)
	_select_first(_yours, _chosen_id)
	_theirs.clear()
	for deck: Dictionary in _decks:
		_add_deck_item(_theirs, deck)
	if _decks.size() > int(_theirs.get_meta("initial")):
		_theirs.select(int(_theirs.get_meta("initial")))
	_start.disabled = _decks.is_empty() or _your_deck().is_empty()


static func _add_deck_item(picker: OptionButton, deck: Dictionary) -> void:
	picker.add_item(Txt.of(deck.get("name", "")))
	picker.set_item_metadata(picker.item_count - 1, deck)


## Escolhe o deck com o id dado, ou o primeiro deck da lista (pulando os títulos).
static func _select_first(picker: OptionButton, id: String) -> void:
	var first: int = -1
	for i: int in picker.item_count:
		if picker.is_item_separator(i):
			continue
		if first < 0:
			first = i
		if id != "" and Txt.of((picker.get_item_metadata(i) as Dictionary).get("id")) == id:
			picker.select(i)
			return
	if first >= 0:
		picker.select(first)


## Entrou pela conta no canto de cima: os decks da conta vêm para a lista (ao sair, os daqui ficam).
func _on_account_changed() -> void:
	if AccountSession.signed_in():
		_sync.run()


## O seu deck escolhido ({} sem nenhum).
func _your_deck() -> Dictionary:
	var picked: Variant = _yours.get_item_metadata(_yours.selected) if _yours.selected >= 0 else null
	return picked if picked is Dictionary else {}


## O seu deck no formato da partida e, com a conta, a ligação da partida a ela e ao deck (matchOwner).
func _your_seat() -> Dictionary:
	var deck: Dictionary = _your_deck()
	var out: Dictionary = {"deck": DeckList.forge_deck(deck)}
	if AccountSession.signed_in() and not bool(deck.get("builtin", false)):
		out["conta"] = AccountSession.token()
		out["deckId"] = deck.get("id")
	return out


## Abre Meus decks por cima da tela inicial.
func open_decks() -> DeckScreen:
	if _deck_screen and is_instance_valid(_deck_screen):
		return _deck_screen
	_deck_screen = DeckScreen.new()
	_deck_screen.sync = _sync
	_deck_screen.chosen.connect(func(deck: Dictionary) -> void:
		choose_deck(deck)
		_close_decks())
	_deck_screen.closed.connect(_close_decks)
	add_child(_deck_screen)
	return _deck_screen


func _close_decks() -> void:
	if _deck_screen and is_instance_valid(_deck_screen):
		_deck_screen.queue_free()
	_deck_screen = null
	_fill_decks()


## Escolhe um deck de Meus decks para jogar: o modo do formato dele e ele como o seu deck.
func choose_deck(deck: Dictionary) -> void:
	_chosen_id = Txt.of(deck.get("id"))
	for i: int in MODES.size():
		if (MODES[i] as Array)[1] == deck.get("format"):
			_mode.select(i)
	_fill_decks()


func _on_play() -> void:
	var mode: Array = MODES[_mode.selected]
	var players: int = int(mode[2])
	var message: Dictionary = {
		"type": "start",
		"you": DeckList.forge_deck(_your_deck()),
		"opponent": StarterDecks.forge_deck(_decks[_theirs.selected]),
		"config": {"format": mode[1], "matchLength": "bo1", "playerCount": players},
	}
	var seat: Dictionary = _your_seat()
	if seat.has("conta"):
		message["conta"] = seat["conta"]
		message["deckId"] = seat["deckId"]
	if players > 2:
		# O deck escolhido para um computador e os outros sorteados pelo servidor.
		var opponents: Array = [message["opponent"]]
		for i: int in players - 2:
			opponents.append(null)
		message["opponents"] = opponents
		message["opponent"] = null
	play.emit(message)
