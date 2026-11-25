# Testes da vitrine de novidades da tela inicial (os itens da versão mais nova com o print) e da capa (as luzinhas e a
# arte pintada).
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/novidades.json"


static func _fixture() -> Dictionary:
	return NewsFeed.parse(JSON.parse_string(FileAccess.get_file_as_string(FIXTURE)))


static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree


static func _feed(items: Array, version: String = "1.2.0") -> Dictionary:
	return {"version": version, "releases": [{"version": version, "title": "Versão " + version, "groups": [{"name": "Novo", "items": items}]}]}


func test_feed_keeps_the_prints_of_each_item() -> void:
	var items: Array = (((_fixture()["releases"] as Array)[1] as Dictionary)["groups"] as Array)[0]["items"]
	check_eq((items[1] as Dictionary).get("images"), [{"src": "/novidades/0.239.0/zip.webp", "caption": "O zip."}], "o print do item, com o endereço no site")
	check(not (items[0] as Dictionary).has("images"), "o item sem print fica sem")
	var odd: Dictionary = NewsFeed.parse(_feed([{"title": "A", "text": "B", "images": [{"src": "https://fora/x.webp"}, "solto", {"src": "/novidades/1/a.webp"}]}]))
	check_eq((((odd["releases"] as Array)[0] as Dictionary)["groups"] as Array)[0]["items"][0]["images"], [{"src": "/novidades/1/a.webp", "caption": ""}], "só endereço do próprio site")


func test_slides_come_from_the_newest_release_with_prints_first() -> void:
	var slides: Array = HomeShowcase.pick_slides(_fixture())
	check_eq(slides.map(func(s: Dictionary) -> String: return s["title"]), ["Novidades na mesa no PC"], "a Próxima versão vem antes da publicada")
	var feed: Dictionary = _feed([
		{"title": "Sem print", "text": "O botão **Novidades** em `/baixar`."},
		{"title": "Com print", "text": "Texto.", "images": [{"src": "/novidades/1/antes.webp", "caption": "Antes: assim."}, {"src": "/novidades/1/depois.webp", "caption": "Agora: assado."}]},
		{"title": "", "text": "Parágrafo solto."},
	])
	slides = HomeShowcase.pick_slides(feed)
	check_eq(slides.map(func(s: Dictionary) -> String: return s["title"]), ["Com print", "Sem print"], "o com print primeiro; o parágrafo sem título fica de fora")
	check_eq((slides[0] as Dictionary)["image"], "/novidades/1/depois.webp", "o print do resultado, não o do antes")
	check_eq((slides[1] as Dictionary)["text"], "O botão Novidades em /baixar.", "sem o Markdown")
	check_eq((slides[0] as Dictionary)["release"], "Versão 1.2.0", "o nome da versão")
	var many: Array = []
	for i: int in 9:
		many.append({"title": "Item %d" % i, "text": "."})
	check_eq(HomeShowcase.pick_slides(_feed(many)).size(), HomeShowcase.MAX_SLIDES, "no máximo alguns itens")
	check_eq(HomeShowcase.pick_slides({}), [], "sem novidades, nada")


func test_showcase_rotates_pauses_on_hover_and_opens_the_news() -> void:
	done = false
	var showcase := HomeShowcase.new()
	var asked: Array = []
	showcase.fetcher = func(path: String) -> Texture2D:
		asked.append(path)
		return null
	_tree().root.add_child(showcase)
	showcase.show_feed(_feed([
		{"title": "Um", "text": "1.", "images": [{"src": "/novidades/1/um.webp", "caption": ""}]},
		{"title": "Dois", "text": "2."},
	]))
	showcase.place(Vector2(10, 10), 520, 180)
	check(showcase.visible, "com espaço e itens, aparece")
	check_eq(showcase.current, 0, "começa no primeiro")
	check_eq(asked, ["/novidades/1/um.webp"], "pede o print do item à mostra")
	check_eq((showcase.find_child("Dots", true, false) as Node).get_child_count(), 2, "um ponto por item")
	showcase._process(HomeShowcase.SLIDE_S + 0.1)
	check_eq(showcase.current, 1, "passa sozinha para o próximo")
	showcase._set_hover(true)
	showcase._process(HomeShowcase.SLIDE_S + 0.1)
	check_eq(showcase.current, 1, "com o mouse em cima, fica parada")
	showcase._set_hover(false)
	var opened: Array = []
	showcase.open_news.connect(func() -> void: opened.append(true))
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	showcase._gui_input(click)
	check_eq(opened.size(), 1, "clicar abre as Novidades")
	showcase.place(Vector2(10, 10), 520, HomeShowcase.MIN_HEIGHT - 1)
	check(not showcase.visible, "sem espaço, some")
	showcase.place(Vector2(10, 10), 520, 400)
	check_eq(showcase.size.y, HomeShowcase.MAX_HEIGHT, "com espaço de sobra, não passa da altura dela")
	# A tela diminuiu: a vitrine encolhe junto, sem ficar presa na altura de antes (e sem cobrir o pé).
	showcase.place(Vector2(10, 10), 520, 160)
	await _tree().process_frame
	check_eq(showcase.size.y, 160.0, "encolhe quando o espaço diminui")
	showcase.show_feed({})
	check(not showcase.visible, "sem novidades, some")
	showcase.queue_free()
	done = true


func test_menu_shows_the_showcase_between_the_column_and_the_footer() -> void:
	done = false
	var previous: String = DeckLibrary.path
	DeckLibrary.path = "user://teste-vitrine-decks.json"
	var cache: String = NewsFeed.cache_path
	NewsFeed.cache_path = "user://teste-vitrine-novidades.json"
	NewsFeed.save_cache(_fixture(), "")
	var remembered: Variant = Prefs.load_all().get("deck_standard")
	var menu := MenuScreen.new()
	_tree().root.add_child(menu)
	# O tamanho da tela base (o projeto escala para 1920×1080); a janela dos testes é outra.
	menu.set_anchors_preset(Control.PRESET_TOP_LEFT)
	menu.size = Vector2(1920, 1080)
	menu._layout()
	# A coluna se arruma no quadro seguinte, e a vitrine vai para baixo dela.
	await _tree().process_frame
	await _tree().process_frame
	var showcase: HomeShowcase = menu.find_child("Showcase", true, false)
	check(showcase != null and showcase.visible, "a vitrine aparece com as novidades guardadas")
	var column: HomeColumn = menu.find_children("*", "HomeColumn", true, false)[0]
	var options: HomeOptions = menu.find_children("*", "HomeOptions", true, false)[0]
	var last: Control = column.get_child(column.get_child_count() - 1)
	check(showcase.position.y > column.position.y + last.position.y + last.size.y, "abaixo do último botão da coluna")
	check(showcase.position.y + showcase.size.y < options.position.y, "acima do pé")
	menu.queue_free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(NewsFeed.cache_path))
	NewsFeed.cache_path = cache
	DeckLibrary.path = previous
	Prefs.save("deck_standard", remembered)
	done = true


func test_cover_motes_follow_the_effects_level() -> void:
	var cover := HomeCover.new()
	cover.size = Vector2(1920, 1080)
	_tree().root.add_child(cover)
	var motes: CPUParticles2D = cover.find_child("Motes", true, false)
	check(motes != null and motes.emitting and motes.visible, "as luzinhas sobem sobre a capa")
	check(motes.amount <= 30, "poucas")
	cover.drift = false
	check(not motes.emitting and not motes.visible, "no nível de efeitos leve, somem junto com a deriva")
	cover.drift = true
	check(motes.emitting, "e voltam")
	cover.queue_free()


func test_cover_shows_the_art_painted_once_and_keeps_the_last_ones() -> void:
	done = false
	var cover := HomeCover.new()
	cover.size = Vector2(1920, 1080)
	_tree().root.add_child(cover)
	var image := Image.create(64, 48, false, Image.FORMAT_RGB8)
	image.fill(Color(0.4, 0.5, 0.6))
	var art := ImageTexture.create_from_image(image)
	cover.show_deck("a", "Deck A", "60 cartas", PackedStringArray(["U"]))
	cover.set_art("a", art)
	var shown: TextureRect = cover.find_child("Art", true, false).get_child(0).get_node("Art")
	check(shown.texture == null, "a arte original não aparece sem a pintura (nada de piscar sem o filtro)")
	check_eq(cover.art_texture(), art as Texture2D, "a capa sabe qual é a arte do deck")
	await RenderingServer.frame_post_draw
	await _tree().process_frame
	check(shown.texture is ViewportTexture, "no quadro seguinte, a arte pintada")
	check_eq(Vector2i(shown.texture.get_size()), Vector2i(96, 72), "pintada com 1,5 vez o tamanho da original")
	var painters: Node = cover.find_child("Paintings", true, false)
	check_eq(painters.get_child_count(), 1, "um viewport pinta a arte")
	check_eq((painters.get_child(0) as SubViewport).render_target_update_mode, SubViewport.UPDATE_ONCE, "e desenha um quadro só")
	# Outro deck e a volta ao primeiro: a pintura guardada vale de novo, sem pintar outra vez.
	var other := ImageTexture.create_from_image(image)
	cover.show_deck("b", "Deck B", "60 cartas", PackedStringArray(["R"]))
	cover.set_art("b", other)
	await RenderingServer.frame_post_draw
	cover.show_deck("a", "Deck A", "60 cartas", PackedStringArray(["U"]))
	cover.set_art("a", art)
	var back: TextureRect = (cover.find_child("Art", true, false).get_children().filter(func(n: Node) -> bool: return n.has_node("Art"))[-1] as Control).get_node("Art")
	check(back.texture is ViewportTexture, "voltar a um deck mostra a pintura guardada na hora")
	check_eq(painters.get_child_count(), 2, "sem pintar a mesma arte de novo")
	for i: int in HomeCover.PAINT_CACHE + 2:
		var extra := ImageTexture.create_from_image(image)
		cover.show_deck("x%d" % i, "Deck", "", PackedStringArray())
		cover.set_art("x%d" % i, extra)
		await RenderingServer.frame_post_draw
	await _tree().process_frame
	await _tree().process_frame
	check(painters.get_child_count() <= HomeCover.PAINT_CACHE + 1, "guarda só as últimas artes pintadas")
	cover.queue_free()
	done = true
