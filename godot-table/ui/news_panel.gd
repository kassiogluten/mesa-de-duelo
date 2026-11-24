# Janela Novidades da tela inicial: as versões do CHANGELOG-PC.md (só o que muda na mesa no PC), da mais nova à mais antiga.
class_name NewsPanel
extends MenuModal

const WIDTH := 700.0
## Quantas versões aparecem de cada vez (como no navegador): as mais recentes primeiro, o resto pelo botão no fim.
const PAGE := 5
const TEXT := Color(0.86, 0.89, 0.95)

## Abre um endereço no navegador (os testes trocam).
var opener: Callable = func(url: String) -> void: OS.shell_open(url)

var _status: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _more: Button
var _releases: Array = []
var _shown: int = 0


func _init() -> void:
	super("Novidades", WIDTH)
	_status = ModalStyle.wrap(15, ModalStyle.MUTED, "", WIDTH)
	_status.name = "Status"
	body.add_child(_status)
	_scroll = ScrollContainer.new()
	_scroll.custom_minimum_size = Vector2(WIDTH, 520)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	# Folga à direita para o texto não correr por baixo da barra de rolagem.
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_theme_constant_override("margin_right", 18)
	_scroll.add_child(margin)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 6)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_child(_list)
	_more = ModalStyle.button("", ModalStyle.Kind.GHOST, 0, 40)
	_more.name = "More"
	_more.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_more.pressed.connect(_show_more)
	var visual := ModalStyle.button("Ver as novidades em imagens", ModalStyle.Kind.GHOST, 0, 46)
	visual.pressed.connect(func() -> void: opener.call(NewsFeed.visual_url()))
	var close_button := ModalStyle.button("Fechar", ModalStyle.Kind.PRIMARY, 160, 46)
	close_button.pressed.connect(close)
	buttons([visual, close_button])


func _ready() -> void:
	super()
	# Numa janela baixa, a lista encolhe para o painel caber.
	_scroll.custom_minimum_size.y = clampf(get_viewport_rect().size.y - 330.0, 240.0, 560.0)


## Mostra as novidades (o formato de NewsFeed.parse) e uma linha de situação (vazia: nenhuma).
func show_feed(feed: Dictionary, note: String = "") -> void:
	_releases = feed.get("releases", [])
	_status.text = note
	_status.visible = note != ""
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	_shown = 0
	_list.add_child(_more)
	_show_more()
	_scroll.visible = not _releases.is_empty()


func _show_more() -> void:
	var first: int = _shown
	_shown = mini(_shown + PAGE, _releases.size())
	for i: int in range(first, _shown):
		var section: Control = _release(_releases[i])
		_list.add_child(section)
		_list.move_child(section, _more.get_index())
	var left: int = _releases.size() - _shown
	_more.visible = left > 0
	_more.text = "Mostrar versões anteriores (%d %s)" % [left, "restante" if left == 1 else "restantes"]


func _release(release: Dictionary) -> VBoxContainer:
	var section := VBoxContainer.new()
	section.add_theme_constant_override("separation", 8)
	if _list.get_child_count() > 1:
		var line := ColorRect.new()
		line.color = Color(1, 1, 1, 0.08)
		line.custom_minimum_size = Vector2(0, 1)
		section.add_child(line)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	var title := ModalStyle.label(22, ModalStyle.GOLD, Txt.of(release.get("title")))
	title.add_theme_font_override("font", HudStyle.bold_font())
	head.add_child(title)
	var date := ModalStyle.label(14, ModalStyle.FAINT, Txt.of(release.get("date")))
	date.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(date)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(spacer)
	if bool(release.get("visual", false)):
		var link := LinkButton.new()
		link.text = "ver em imagens"
		link.underline = LinkButton.UNDERLINE_MODE_ON_HOVER
		link.focus_mode = Control.FOCUS_NONE
		link.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		link.add_theme_font_size_override("font_size", 14)
		link.add_theme_color_override("font_color", ModalStyle.BLUE)
		link.add_theme_color_override("font_hover_color", Color.WHITE)
		var version: String = Txt.of(release.get("version"))
		link.pressed.connect(func() -> void: opener.call(NewsFeed.visual_url(version)))
		head.add_child(link)
	section.add_child(head)
	for group: Dictionary in release.get("groups", []):
		if Txt.of(group.get("name")) != "":
			var name_label := ModalStyle.label(13, ModalStyle.MUTED, Txt.of(group["name"]).to_upper())
			name_label.add_theme_constant_override("outline_size", 0)
			section.add_child(name_label)
		for item: Dictionary in group.get("items", []):
			section.add_child(_item(item))
	return section


func _item(item: Dictionary) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	var title: String = Txt.of(item.get("title"))
	if title != "":
		var title_label := ModalStyle.wrap(17, ModalStyle.INK, title, 0.0, false)
		title_label.add_theme_font_override("font", HudStyle.bold_font())
		title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		box.add_child(title_label)
	var text: String = Txt.of(item.get("text"))
	if text != "":
		var rich := RichTextLabel.new()
		rich.bbcode_enabled = true
		rich.fit_content = true
		rich.scroll_active = false
		rich.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		rich.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rich.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		rich.add_theme_font_size_override("normal_font_size", 15)
		rich.add_theme_font_size_override("bold_font_size", 15)
		rich.add_theme_font_override("bold_font", HudStyle.bold_font())
		rich.add_theme_color_override("default_color", TEXT if title != "" else ModalStyle.MUTED)
		rich.text = NewsFeed.to_bbcode(text)
		box.add_child(rich)
	return box

