# A coluna da direita da tela inicial: a marca da Mesa de Duelo, Jogar contra o computador, Jogar online e Meus decks,
# o painel da partida (formato e deck do computador) e o Voltar à partida quando há uma guardada.
class_name HomeColumn
extends VBoxContainer

var mode: OptionButton
var theirs: OptionButton
var start: Button
var online_button: Button
var my_decks: Button
## O Voltar à partida (null sem partida guardada).
var resume: Button


## `modes` são os rótulos dos jeitos de jogar; `saved` a partida guardada (SavedSession.current()).
func _init(modes: Array, saved: Dictionary) -> void:
	add_theme_constant_override("separation", 16)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_brand())
	var subtitle := ModalStyle.label(19, HomeStyle.DIM, "Partidas de Magic contra o computador ou com amigos")
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.add_theme_constant_override("outline_size", 0)
	add_child(subtitle)
	add_child(_gap(10))
	start = HomeStyle.action_button("Jogar contra o computador", true, 64)
	start.name = "Play"
	start.tooltip_text = "Começar a partida com o seu deck (Enter)."
	add_child(start)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	add_child(row)
	# Partida em rede, com a mesa do navegador ou outra mesa no PC: a tela Jogar online (menu/online_screen.gd).
	online_button = HomeStyle.action_button("Jogar online", false)
	online_button.name = "Online"
	online_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(online_button)
	my_decks = HomeStyle.action_button("Meus decks", false)
	my_decks.name = "MyDecks"
	my_decks.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(my_decks)
	add_child(_gap(2))
	add_child(_match_panel(modes))
	# Partida ou sala em andamento guardada (a mesa fechou ou a conexão caiu): volta ao mesmo assento.
	if not saved.is_empty():
		var room: String = " · sala %s" % Txt.of(saved.get("code")) if bool(saved.get("room", false)) else ""
		resume = HomeStyle.action_button("Voltar à partida" + room, false)
		resume.name = "Resume"
		add_child(resume)


func _brand() -> HBoxContainer:
	var brand := HBoxContainer.new()
	brand.add_theme_constant_override("separation", 18)
	brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mark := TextureRect.new()
	mark.texture = HomeStyle.mark_texture()
	mark.custom_minimum_size = Vector2(62, 62)
	mark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	mark.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	brand.add_child(mark)
	var title := ModalStyle.label(48, Color("#f3f5fa"), "Mesa de Duelo")
	title.name = "Title"
	title.add_theme_font_override("font", HomeStyle.display_font())
	title.add_theme_constant_override("outline_size", 0)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5))
	title.add_theme_constant_override("shadow_offset_y", 3)
	brand.add_child(title)
	return brand


## O painel compacto da partida: o formato e o deck do computador.
func _match_panel(modes: Array) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := ModalStyle.box(HomeStyle.PANEL, 16, HomeStyle.LINE, 1)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 18
	panel.add_theme_stylebox_override("panel", style)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 6)
	panel.add_child(body)
	body.add_child(_caption("Formato"))
	mode = OptionButton.new()
	mode.name = "Mode"
	HomeStyle.style_field(mode)
	for caption: String in modes:
		mode.add_item(caption)
	body.add_child(mode)
	body.add_child(_gap(6))
	body.add_child(_caption("Deck do computador"))
	theirs = OptionButton.new()
	theirs.name = "Opponent"
	HomeStyle.style_field(theirs)
	body.add_child(theirs)
	return panel


func _caption(text: String) -> Label:
	var out := ModalStyle.label(15, HomeStyle.DIM, text)
	out.add_theme_constant_override("outline_size", 0)
	return out


func _gap(height: float) -> Control:
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, height)
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return gap
