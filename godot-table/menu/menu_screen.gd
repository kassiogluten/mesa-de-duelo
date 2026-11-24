# Tela inicial da mesa no PC: a arte do seu deck em destaque, a fileira para trocar de deck e a coluna com Jogar contra o
# computador, Jogar online, Meus decks e o painel da partida (formato e deck do computador).
class_name MenuScreen
extends Control

## Pedido de partida pronto ({type:"start", ...}).
signal play(start_message: Dictionary)
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
## A versão no canto de baixo, com o botão de atualizar (main.gd liga os botões à conferência de versão).
var version_badge: VersionBadge
var _mode: OptionButton
var _theirs: OptionButton
var _start: Button
## Os decks prontos do formato (os do computador).
var _decks: Array = []
## Os decks da fileira: os de Meus decks do formato e depois os prontos.
var _choices: Array = []
var _selected: int = -1
## O deck escolhido por último (o id), para continuar escolhido quando a lista é refeita.
var _chosen_id: String = ""
var _sync: DeckSync
var _deck_screen: DeckScreen
var _art: DeckArt
var _cover: HomeCover
var _strip: DeckStrip
var _column: HomeColumn
var _options: HomeOptions
var _news: NewsButton
var _showcase: HomeShowcase
## A conferência dos decks de Meus decks (criada só quando um deles é o escolhido).
var _checker: DeckCheck
## O endereço da arte da capa à mostra e o de cada ladrilho, para encaixar a arte quando ela chega.
var _cover_url: String = ""
var _tile_urls: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_art = DeckArt.new()
	add_child(_art)
	_art.info_changed.connect(_on_info)
	_art.art_ready.connect(_on_art)
	_cover = HomeCover.new()
	_cover.drift = Txt.of(Prefs.load_all().get("effects", "auto")) != "leve"
	add_child(_cover)
	_strip = DeckStrip.new()
	_strip.name = "Decks"
	add_child(_strip)
	_strip.picked.connect(pick)
	_strip.more_pressed.connect(open_decks)
	_strip.view_changed.connect(_load_visible_art)

	var labels: Array = []
	for mode: Array in MODES:
		labels.append(Txt.of(mode[0]))
	_column = HomeColumn.new(labels, SavedSession.current())
	add_child(_column)
	_mode = _column.mode
	_theirs = _column.theirs
	_start = _column.start
	if OS.get_environment("MESA_COMMANDER") == "1":
		_mode.select(1)
	_mode.item_selected.connect(func(_i: int) -> void: _fill_decks())
	_start.pressed.connect(_on_play)
	_column.online_button.pressed.connect(func() -> void: online.emit())
	_column.my_decks.pressed.connect(open_decks)
	if _column.resume:
		var saved: Dictionary = SavedSession.current()
		_column.resume.pressed.connect(func() -> void: play.emit(RoomMessages.rejoin(saved)))
	_options = HomeOptions.new()
	add_child(_options)
	_options.report.connect(func() -> void: report.emit())
	_options.my_reports.connect(func() -> void: my_reports.emit())
	_options.effects_changed.connect(func(level: String) -> void: _cover.drift = level != "leve")

	_sync = DeckSync.new()
	add_child(_sync)
	_sync.decks_changed.connect(_fill_decks)
	if AccountSession.signed_in():
		_sync.run()
	_fill_decks()

	# A conta, no canto de cima (entrar pelo site, a conta ligada e Sair), com os avisos dela no meio da tela.
	var account := AccountPanel.new()
	add_child(account)
	var toasts := ToastStack.new()
	add_child(toasts)
	account.toast.connect(toasts.show_toast)
	AccountSession.notifier().changed.connect(_on_account_changed)
	# Novidades no canto de cima, à esquerda: o painel da mesa no PC, com o ponto da versão ainda não vista; e a vitrine
	# na coluna, com os itens da versão mais nova (abre o mesmo painel).
	_news = NewsButton.new()
	add_child(_news)
	_showcase = HomeShowcase.new()
	add_child(_showcase)
	_showcase.open_news.connect(func() -> void: _news.open())
	_showcase.show_feed(_news.feed.feed)
	_news.feed.updated.connect(func() -> void:
		_showcase.show_feed(_news.feed.feed)
		_place_showcase())
	# Depois de cada arrumação da coluna (os botões mudam de lugar sem a coluna mudar de tamanho).
	_column.sort_children.connect(func() -> void: _place_showcase.call_deferred())

	# A versão no canto de baixo, com o botão de atualizar (Atualizar para X, ou Procurar atualização).
	version_badge = VersionBadge.new()
	version_badge.name = "Version"
	version_badge.version_text = version_text
	version_badge.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	version_badge.offset_left = -900
	version_badge.offset_top = -56
	version_badge.offset_right = -24
	version_badge.offset_bottom = -14
	add_child(version_badge)
	resized.connect(_layout)
	_layout()


## As proporções da capa: a coluna à direita com largura quase fixa (no ultrawide sobra mais arte), a fileira embaixo à esquerda.
func _layout() -> void:
	var view: Vector2 = size
	var column_w: float = clampf(view.x * 0.28, 470.0, 540.0)
	var right: float = maxf(64.0, view.x * 0.045)
	var column_x: float = view.x - right - column_w
	_column.position = Vector2(column_x, maxf(110.0, view.y * 0.14))
	_column.size = Vector2(column_w, 0)
	var left: float = maxf(56.0, view.x * 0.03)
	var strip_h: float = DeckTile.SIZE.y + DeckStrip.PAD * 2
	_strip.position = Vector2(left - DeckStrip.PAD, view.y - view.y * 0.05 - DeckTile.SIZE.y - DeckStrip.PAD)
	_strip.size = Vector2(maxf(DeckTile.SIZE.x * 2.0, column_x - 48.0 - left + DeckStrip.PAD * 2), strip_h)
	var options_h: float = _options.get_combined_minimum_size().y
	_options.position = Vector2(column_x, view.y - view.y * 0.05 - DeckTile.SIZE.y * 0.5 - options_h * 0.5 + DeckTile.LIFT * 0.5)
	_options.size = Vector2(column_w, options_h)
	_place_showcase()


## A vitrine de novidades no vão entre a coluna e o pé (some quando não cabe, como numa janela baixa), depois de a
## coluna se arrumar (o texto que quebra em linhas só se mede com a largura certa).
func _place_showcase() -> void:
	if _showcase == null or _column == null or _options == null:
		return
	# Pelo fim do último botão: a coluna em si pode ter ficado mais alta numa arrumação anterior, mais estreita.
	var last: Control = _column.get_child(_column.get_child_count() - 1) as Control
	var top: float = _column.position.y + last.position.y + last.size.y + 28.0
	_showcase.place(Vector2(_column.position.x, top), _column.size.x, _options.position.y - 24.0 - top)


## Os decks do formato escolhido: na fileira, os de Meus decks e depois os prontos; no do computador, só os prontos.
func _fill_decks() -> void:
	var format: String = _format()
	_decks = StarterDecks.of_format(format)
	var mine: Array = DeckLibrary.load_all().filter(func(d: Dictionary) -> bool: return d.get("format") == format)
	_choices = mine + _decks
	_theirs.clear()
	for deck: Dictionary in _decks:
		_theirs.add_item(Txt.of(deck.get("name", "")))
	if _decks.size() > 1:
		_theirs.select(1)
	# O último escolhido nesta abertura; senão o lembrado do formato; senão o primeiro da lista.
	var index: int = -1
	for wanted: String in [_chosen_id, Txt.of(Prefs.load_all().get("deck_" + format, ""))]:
		index = _index_of(wanted)
		if index >= 0:
			break
	if index < 0 and not _choices.is_empty():
		index = 0
	var tiles: Array = []
	for deck: Dictionary in _choices:
		tiles.append({"name": Txt.of(deck.get("name")), "colors": _art.colors(deck)})
	_tile_urls.clear()
	_strip.set_decks(tiles, index)
	_art.request_covers(_choices)
	_select(index)


func _index_of(id: String) -> int:
	if id == "":
		return -1
	for i: int in _choices.size():
		if Txt.of((_choices[i] as Dictionary).get("id")) == id:
			return i
	return -1


## O jogador escolheu um deck da fileira (clique ou as setas): vira o seu deck e fica lembrado no formato.
func pick(index: int) -> void:
	if index < 0 or index >= _choices.size() or index == _selected:
		return
	_select(index)
	DeckChoices.remember(_format(), {"id": _chosen_id})


func _select(index: int) -> void:
	_selected = index
	_strip.select(index)
	var deck: Dictionary = _your_deck()
	if not deck.is_empty():
		_chosen_id = Txt.of(deck.get("id"))
		_art.request_all(deck)
		if not bool(deck.get("builtin", false)):
			_check(deck)
	_start.disabled = _decks.is_empty() or deck.is_empty()
	_update_cover()


## O deck escolhido na capa: nome, "60 cartas · Standard · Válido", as cores e a arte (o fundo provisório até ela chegar).
func _update_cover() -> void:
	var deck: Dictionary = _your_deck()
	if deck.is_empty():
		_cover.show_deck("", "Nenhum deck", "Importe um deck em Meus decks", PackedStringArray())
		_cover_url = ""
		return
	var total: int = DeckList.total_size(deck)
	var parts: PackedStringArray = ["%d %s" % [total, "carta" if total == 1 else "cartas"], DeckList.format_label(Txt.of(deck.get("format", _format())))]
	var status: String = _status(deck)
	if status != "":
		parts.append(status)
	var key: String = "%d:%s" % [_selected, Txt.of(deck.get("id"))]
	_cover.show_deck(key, Txt.of(deck.get("name")), " · ".join(parts), _art.colors(deck))
	_cover_url = _art.art_url(deck)
	var texture: Texture2D = _art.texture(_cover_url)
	if texture:
		_cover.set_art(key, texture)


## Os prontos valem (o servidor confere todos nos testes); os de Meus decks, pela conferência do servidor.
func _status(deck: Dictionary) -> String:
	if bool(deck.get("builtin", false)):
		return "Válido"
	if _checker == null:
		return ""
	match Txt.of(_checker.result(deck).get("status")):
		"valid":
			return "Válido"
		"invalid":
			return "Com problemas"
	return ""


func _check(deck: Dictionary) -> void:
	if _checker == null:
		_checker = DeckCheck.new()
		add_child(_checker)
		_checker.checked.connect(func(_key: String, _result: Dictionary) -> void: _update_cover())
	_checker.check(deck)


## Chegaram dados de cartas: a capa e as artes da fileira podem ter mudado.
func _on_info() -> void:
	_update_cover()
	_load_visible_art()


func _on_art(url: String, texture: Texture2D) -> void:
	if url == _cover_url:
		_cover.set_art(_cover.current_key(), texture)
	for index: int in _tile_urls:
		if _tile_urls[index] == url and _strip.tile(index):
			_strip.tile(index).set_art(texture)


## Baixa só as artes dos ladrilhos à mostra (no Commander são mais de cem decks).
func _load_visible_art() -> void:
	for index: int in _strip.visible_indices():
		if index >= _choices.size():
			continue
		var url: String = _art.art_url(_choices[index])
		if url == "":
			continue
		_tile_urls[index] = url
		var texture: Texture2D = _art.texture(url)
		if texture:
			_strip.tile(index).set_art(texture)


func _format() -> String:
	return Txt.of((MODES[maxi(_mode.selected, 0)] as Array)[1])


## Entrou pela conta no canto de cima: os decks da conta vêm para a lista (ao sair, os daqui ficam).
func _on_account_changed() -> void:
	if AccountSession.signed_in():
		_sync.run()


## O seu deck escolhido ({} sem nenhum).
func _your_deck() -> Dictionary:
	return _choices[_selected] if _selected >= 0 and _selected < _choices.size() else {}


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
	_options.close()
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
	DeckChoices.remember(_format(), {"id": _chosen_id})
	_fill_decks()


## Alguma janela por cima (Meus decks, Novidades, Opções) fica com as teclas.
func _covered() -> bool:
	if (_deck_screen and is_instance_valid(_deck_screen)) or _options.is_open():
		return true
	return not find_children("*", "NewsPanel", false, false).is_empty()


## As setas trocam de deck na fileira; Enter começa a partida.
func _unhandled_input(event: InputEvent) -> void:
	if not event is InputEventKey or not (event as InputEventKey).pressed or not is_visible_in_tree() or _covered():
		return
	match (event as InputEventKey).keycode:
		KEY_LEFT:
			pick(maxi(_selected - 1, 0))
		KEY_RIGHT:
			pick(mini(_selected + 1, _choices.size() - 1))
		KEY_ENTER, KEY_KP_ENTER:
			if _start.disabled or (event as InputEventKey).echo:
				return
			_on_play()
		_:
			return
	get_viewport().set_input_as_handled()


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
