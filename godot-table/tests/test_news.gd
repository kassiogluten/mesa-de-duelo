# Testes das Novidades da mesa no PC: o /novidades.json (o mesmo fixture que tests/newsFeed.test.mjs confere), a cópia guardada, o ponto de versão não vista e o painel.
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/novidades.json"
const TEST_CACHE := "user://test-novidades.json"


static func _fixture() -> Dictionary:
	return NewsFeed.parse(JSON.parse_string(FileAccess.get_file_as_string(FIXTURE)))


static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree


func test_parse_keeps_versions_groups_and_items() -> void:
	var feed: Dictionary = _fixture()
	check_eq(Txt.of(feed.get("version")), "0.239.0", "a versão mais nova com número")
	var releases: Array = feed["releases"]
	check_eq(releases.map(func(r: Dictionary) -> String: return r["title"]), ["Próxima versão", "Versão 0.239.0", "Versão 0.238.0"], "da mais nova à mais antiga")
	var release: Dictionary = releases[1]
	check_eq(release["date"], "24/11/2026", "a data")
	check(bool(release["visual"]), "a versão com prints")
	var items: Array = ((release["groups"] as Array)[0] as Dictionary)["items"]
	check_eq(items[1], {"title": "Zip da mesa no PC", "text": "Baixe em `/baixar` e extraia onde quiser."}, "o título e o texto")
	check_eq(((releases[2] as Dictionary)["groups"] as Array).size(), 1, "item sem grupo e parágrafo solto num grupo sem nome")


func test_parse_drops_what_is_not_in_the_format() -> void:
	check_eq(NewsFeed.parse(null), {}, "nada")
	check_eq(NewsFeed.parse({"releases": "x"}), {}, "versões que não são lista")
	check_eq(NewsFeed.parse({"version": "1.0.0", "releases": [{"title": "sem versão"}]}), {}, "versão sem número")
	var feed: Dictionary = NewsFeed.parse({"version": "1.0.0", "releases": [
		{"version": "1.0.0", "groups": [{"name": "Novo", "items": [{"title": "Certo", "text": "Sim.", "pc": true}, "solto", {"title": "", "text": ""}]}, "x"]},
	]})
	var release: Dictionary = (feed["releases"] as Array)[0]
	check_eq(release["title"], "Versão 1.0.0", "título que faltava")
	check_eq(((release["groups"] as Array)[0] as Dictionary)["items"], [{"title": "Certo", "text": "Sim."}], "só o item com texto (o selo antigo, pc, fica de fora)")


func test_markdown_becomes_bbcode_with_the_brackets_escaped() -> void:
	check_eq(NewsFeed.to_bbcode("O botão **Novidades** abre [Mesa] em `/baixar`."), "O botão [b]Novidades[/b] abre [lb]Mesa] em [code]/baixar[/code].", "negrito, código e colchete")


func test_cache_keeps_the_last_copy_for_offline() -> void:
	var path: String = NewsFeed.cache_path
	NewsFeed.cache_path = TEST_CACHE
	NewsFeed.save_cache(_fixture(), "\"abc\"")
	var cached: Dictionary = NewsFeed.load_cache()
	check_eq(cached["etag"], "\"abc\"", "a etiqueta para perguntar se mudou")
	check_eq(cached["feed"], _fixture(), "as mesmas novidades")
	var node := NewsFeed.new()
	check_eq(Txt.of(node.feed.get("version")), "0.239.0", "a mesa abre com a cópia guardada")
	node.free()
	var file: FileAccess = FileAccess.open(TEST_CACHE, FileAccess.WRITE)
	file.store_string("{estragado")
	file.close()
	check_eq(NewsFeed.load_cache(), {"feed": {}, "etag": ""}, "arquivo estragado: nada")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(TEST_CACHE))
	NewsFeed.cache_path = path
	check_eq(NewsFeed.header(PackedStringArray(["Content-Type: application/json", "ETag: \"x1\""]), "etag"), "\"x1\"", "o cabeçalho sem diferença de maiúsculas")


func test_dot_until_the_panel_opens_and_the_panel_links_the_pc_tab() -> void:
	done = false
	check(NewsFeed.has_unseen(_fixture(), "0.238.0"), "versão nova: ponto")
	check(not NewsFeed.has_unseen(_fixture(), "0.239.0"), "a mesma versão: sem ponto")
	check(not NewsFeed.has_unseen(_fixture(), "0.242.1"), "vista uma versão mais nova (do painel com as duas mesas): sem ponto")
	check(NewsFeed.has_unseen(_fixture(), "x"), "vista fora do formato: ponto")
	check(not NewsFeed.has_unseen({}, ""), "sem novidades: sem ponto")
	var seen_before: String = NewsFeed.seen()
	Prefs.save(NewsFeed.SEEN_KEY, "0.238.0")
	var path: String = NewsFeed.cache_path
	NewsFeed.cache_path = TEST_CACHE
	NewsFeed.save_cache(_fixture(), "")
	var screen := Control.new()
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_tree().root.add_child(screen)
	var button := NewsButton.new()
	button.auto_refresh = false
	screen.add_child(button)
	await _tree().process_frame
	check(button.has_dot(), "o ponto da versão não vista")
	var opened: Array = []
	var panel: NewsPanel = button.open()
	panel.opener = func(url: String) -> void: opened.append(url)
	await _tree().process_frame
	check(not button.has_dot(), "abriu: o ponto some")
	check_eq(NewsFeed.seen(), "0.239.0", "a versão fica vista")
	var more: Button = panel.find_child("More", true, false)
	check(not more.visible, "três versões cabem numa página")
	var links: Array = panel.find_children("*", "LinkButton", true, false)
	check_eq(links.size(), 1, "ver em imagens só na versão com prints")
	(links[0] as LinkButton).pressed.emit()
	check(opened.size() == 1 and Txt.of(opened[0]).ends_with("/novidades?mesa=pc#v0.239.0"), "abre a versão na aba da mesa no PC da página Novidades em imagens: %s" % [opened])
	screen.queue_free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(TEST_CACHE))
	NewsFeed.cache_path = path
	Prefs.save(NewsFeed.SEEN_KEY, seen_before)
	done = true


func test_panel_pages_five_versions_at_a_time() -> void:
	done = false
	var releases: Array = []
	for i: int in 12:
		releases.append({"version": "0.%d.0" % (100 - i), "title": "Versão 0.%d.0" % (100 - i), "date": "", "visual": false, "groups": [{"name": "Novo", "items": [{"title": "Item %d" % i, "text": "Texto."}]}]})
	var panel := NewsPanel.new()
	_tree().root.add_child(panel)
	panel.show_feed({"version": "0.100.0", "releases": releases})
	await _tree().process_frame
	var more: Button = panel.find_child("More", true, false)
	check(more.visible and more.text == "Mostrar versões anteriores (7 restantes)", "cinco primeiro: %s" % more.text)
	more.pressed.emit()
	more.pressed.emit()
	check(not more.visible, "doze cabem em três páginas")
	panel.show_feed({}, "Não deu para buscar as novidades agora.")
	check((panel.find_child("Status", true, false) as Label).visible, "a situação sem novidades")
	panel.queue_free()
	done = true
