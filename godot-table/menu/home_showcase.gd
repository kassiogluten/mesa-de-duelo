# A vitrine de novidades da tela inicial: os itens da versão mais nova, um de cada vez, com o print da página Novidades em
# imagens, o título e o começo do texto; troca sozinha, para com o mouse em cima e abre o painel Novidades ao clicar.
class_name HomeShowcase
extends PanelContainer

## Clicou na vitrine: abrir o painel Novidades.
signal open_news

## Quanto tempo cada item fica à mostra.
const SLIDE_S := 7.0
const FADE_S := 0.35
## No máximo tantos itens (os com print primeiro).
const MAX_SLIDES := 6
## Altura em que a vitrine ainda cabe inteira; abaixo disso ela some.
const MIN_HEIGHT := 150.0
const MAX_HEIGHT := 200.0
const PAD := 14.0
const IMAGE_SHARE := 0.42
## Onde ficam os prints já baixados, para abrir sem internet (os testes trocam).
static var cache_dir: String = "user://novidades-img"
static var _textures: Dictionary = {}

## Baixa o print do site (os testes trocam por uma função que não usa a rede): url → Texture2D ou null.
var fetcher: Callable

## Os itens à mostra: [{version, release, title, text, image}].
var slides: Array = []
var current: int = -1
var _content: HBoxContainer
var _frame: Control
var _picture: TextureRect
var _placeholder: TextureRect
var _caption: Label
var _title: Label
var _text: Label
var _dots: HBoxContainer
var _time: float = 0.0
var _hover: bool = false
var _style: StyleBoxFlat


func _init() -> void:
	fetcher = _download
	name = "Showcase"
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	tooltip_text = "Abrir as Novidades."
	clip_contents = true
	_style = ModalStyle.box(HomeStyle.PANEL, 16, HomeStyle.LINE, 1)
	_style.content_margin_left = PAD
	_style.content_margin_right = PAD + 4
	_style.content_margin_top = PAD
	_style.content_margin_bottom = PAD
	add_theme_stylebox_override("panel", _style)
	_content = HBoxContainer.new()
	_content.add_theme_constant_override("separation", 16)
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_content)
	# O print inteiro, centrado na moldura escura (enquanto ele chega, a marca da mesa apagada no lugar).
	_frame = Control.new()
	_frame.name = "Picture"
	_frame.clip_contents = true
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_frame)
	var back := ColorRect.new()
	back.color = Color(0.03, 0.045, 0.08)
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(back)
	_placeholder = TextureRect.new()
	_placeholder.texture = HomeStyle.mark_texture()
	_placeholder.modulate = Color(1, 1, 1, 0.18)
	_placeholder.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_placeholder.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_placeholder.set_anchors_preset(Control.PRESET_CENTER)
	_placeholder.custom_minimum_size = Vector2(44, 44)
	_placeholder.offset_left = -22
	_placeholder.offset_top = -22
	_placeholder.offset_right = 22
	_placeholder.offset_bottom = 22
	_placeholder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_placeholder)
	_picture = TextureRect.new()
	_picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_picture.set_anchors_preset(Control.PRESET_FULL_RECT)
	_picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_picture)
	# O texto: "NOVIDADES · VERSÃO X", o título do item, o começo do texto e os pontos dos itens.
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.add_theme_constant_override("separation", 4)
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(words)
	_caption = ModalStyle.label(12, ModalStyle.GOLD, "")
	_caption.name = "Caption"
	_caption.add_theme_font_override("font", HomeStyle.caps_font())
	_caption.add_theme_constant_override("outline_size", 0)
	words.add_child(_caption)
	_title = ModalStyle.label(18, ModalStyle.INK, "")
	_title.name = "Title"
	_title.add_theme_font_override("font", HudStyle.bold_font())
	_title.add_theme_constant_override("outline_size", 0)
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title.clip_text = true
	words.add_child(_title)
	_text = ModalStyle.label(14, HomeStyle.DIM, "")
	_text.name = "Text"
	_text.add_theme_constant_override("outline_size", 0)
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_text.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_text.max_lines_visible = 3
	_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	words.add_child(_text)
	_dots = HBoxContainer.new()
	_dots.name = "Dots"
	_dots.add_theme_constant_override("separation", 8)
	words.add_child(_dots)
	mouse_entered.connect(func() -> void: _set_hover(true))
	mouse_exited.connect(func() -> void: _set_hover(false))
	visible = false


## Monta os itens a partir das novidades (o formato de NewsFeed.parse) e mostra o primeiro; sem nenhum, a vitrine some.
func show_feed(feed: Dictionary) -> void:
	slides = pick_slides(feed)
	_rebuild_dots()
	current = -1
	_time = 0.0
	if slides.is_empty():
		visible = false
		return
	show_slide(0, false)


## Os itens da versão mais nova que tem algum: os com print primeiro, até MAX_SLIDES.
static func pick_slides(feed: Dictionary) -> Array:
	for release: Dictionary in feed.get("releases", []):
		var with_image: Array = []
		var without: Array = []
		for group: Dictionary in release.get("groups", []):
			for item: Dictionary in group.get("items", []):
				var title: String = Txt.of(item.get("title"))
				if title == "":
					continue
				var slide: Dictionary = {
					"version": Txt.of(release.get("version")), "release": Txt.of(release.get("title")), "title": title,
					"text": summary(Txt.of(item.get("text"))), "image": main_image(item.get("images", [])),
				}
				(with_image if slide["image"] != "" else without).append(slide)
		var all: Array = with_image + without
		if not all.is_empty():
			return all.slice(0, MAX_SLIDES)
	return []


## O print que mostra o resultado: o primeiro que não é o "Antes:" de um antes e depois.
static func main_image(images: Variant) -> String:
	var list: Array = images if images is Array else []
	for image: Dictionary in list:
		if not Txt.of(image.get("caption")).strip_edges().to_lower().begins_with("antes"):
			return Txt.of(image.get("src"))
	return Txt.of((list[0] as Dictionary).get("src")) if not list.is_empty() else ""


## O texto do item sem o Markdown (**negrito**, `código`): o rótulo corta em três linhas.
static func summary(text: String) -> String:
	return text.replace("**", "").replace("`", "").strip_edges()


func show_slide(index: int, fade: bool = true) -> void:
	if slides.is_empty():
		return
	current = posmod(index, slides.size())
	_time = 0.0
	visible = true
	var slide: Dictionary = slides[current]
	if fade:
		var out := create_tween()
		out.tween_property(_content, "modulate:a", 0.0, FADE_S * 0.5)
		await out.finished
		if not is_inside_tree() or slides.is_empty() or slides[current] != slide:
			return
	_caption.text = "NOVIDADES · %s" % Txt.of(slide["release"]).to_upper()
	_title.text = Txt.of(slide["title"])
	_text.text = Txt.of(slide["text"])
	_frame.visible = Txt.of(slide["image"]) != ""
	_picture.texture = null
	if _frame.visible:
		_load_image(Txt.of(slide["image"]), slide)
	for i: int in _dots.get_child_count():
		_paint_dot(_dots.get_child(i) as Button, i == current)
	if fade:
		var back := create_tween()
		back.tween_property(_content, "modulate:a", 1.0, FADE_S * 0.5)


func _process(delta: float) -> void:
	if not visible or slides.size() < 2 or _hover:
		return
	_time += delta
	if _time >= SLIDE_S:
		show_slide(current + 1)


func _gui_input(event: InputEvent) -> void:
	var click := event as InputEventMouseButton
	if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
		accept_event()
		open_news.emit()


## A altura que a vitrine ocupa (some sem espaço) e a largura da moldura do print.
func place(at: Vector2, width: float, room: float) -> void:
	var height: float = minf(room, MAX_HEIGHT)
	if room < MIN_HEIGHT or slides.is_empty():
		visible = false
		return
	# A moldura do print primeiro: ela entra no tamanho mínimo da vitrine, que senão ficaria preso na altura anterior.
	_fit_picture(width, height)
	position = at
	size = Vector2(width, height)
	visible = true


func _fit_picture(width: float, height: float) -> void:
	_frame.custom_minimum_size = Vector2(roundf((width - PAD * 2) * IMAGE_SHARE), maxf(height - PAD * 2, 0.0))


func _set_hover(on: bool) -> void:
	_hover = on
	_style.border_color = Color(ModalStyle.GOLD, 0.55) if on else HomeStyle.LINE
	queue_redraw()


func _rebuild_dots() -> void:
	for child: Node in _dots.get_children():
		_dots.remove_child(child)
		child.queue_free()
	if slides.size() < 2:
		return
	for i: int in slides.size():
		var dot := Button.new()
		dot.name = "Dot%d" % i
		dot.custom_minimum_size = Vector2(10, 10)
		dot.focus_mode = Control.FOCUS_NONE
		dot.tooltip_text = Txt.of((slides[i] as Dictionary)["title"])
		dot.pressed.connect(func() -> void: show_slide(i))
		_dots.add_child(dot)
		_paint_dot(dot, false)


static func _paint_dot(dot: Button, on: bool) -> void:
	var color: Color = ModalStyle.GOLD if on else Color(1, 1, 1, 0.22)
	for state: String in ["normal", "hover", "pressed", "focus"]:
		dot.add_theme_stylebox_override(state, ModalStyle.box(color.lightened(0.15) if state == "hover" else color, 99))


## O print do item: da memória, do disco (já baixado antes) ou do site; chega e entra se o item ainda está à mostra.
func _load_image(path: String, slide: Dictionary) -> void:
	var texture: Texture2D = _textures.get(path)
	if texture == null:
		texture = await fetcher.call(path)
		if texture:
			_textures[path] = texture
	if texture and is_inside_tree() and current >= 0 and current < slides.size() and slides[current] == slide:
		_picture.texture = texture
		_picture.modulate.a = 0.0
		create_tween().tween_property(_picture, "modulate:a", 1.0, FADE_S)


## Baixa pelo site (e guarda em disco, para a próxima vez sem internet); null se não deu.
func _download(path: String) -> Texture2D:
	var file: String = "%s/%s.img" % [cache_dir, path.md5_text()]
	if FileAccess.file_exists(file):
		var saved: Texture2D = AccountPanel.decode_image(FileAccess.get_file_as_bytes(file))
		if saved:
			return saved
	var http := HTTPRequest.new()
	http.timeout = 10.0
	add_child(http)
	if http.request(GameConfig.site_url(path)) != OK:
		http.queue_free()
		return null
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS or int(result[1]) != 200:
		return null
	var bytes: PackedByteArray = result[3]
	var texture: Texture2D = AccountPanel.decode_image(bytes)
	if texture:
		DirAccess.make_dir_recursive_absolute(cache_dir)
		var out: FileAccess = FileAccess.open(file, FileAccess.WRITE)
		if out:
			out.store_buffer(bytes)
	return texture
