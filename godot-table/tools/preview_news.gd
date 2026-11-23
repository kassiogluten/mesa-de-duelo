# Print da tela inicial com o botão Novidades (ponto aceso) e do painel aberto, com as novidades de um arquivo no formato do /novidades.json.
# npm run godot -- --resolution 1600x900 --script res://tools/preview_news.gd -- <botao|painel> <saída.png> [novidades.json]
extends SceneTree


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var scene: String = args[0]
	var out: String = args[1]
	var source: String = args[2] if args.size() > 2 else "res://tests/fixtures/novidades.json"
	var feed: Dictionary = NewsFeed.parse(JSON.parse_string(FileAccess.get_file_as_string(source)))
	# Uma cópia guardada só do print, e a versão vista de antes de volta no fim.
	var cache: String = NewsFeed.cache_path
	NewsFeed.cache_path = "user://preview-novidades.json"
	NewsFeed.save_cache(feed, "")
	var seen: String = NewsFeed.seen()
	Prefs.save(NewsFeed.SEEN_KEY, "")
	var menu := MenuScreen.new()
	menu.version_text = "Versão %s" % Txt.of(feed.get("version"))
	root.add_child(menu)
	await create_timer(0.4).timeout
	if scene == "painel":
		var button: NewsButton = menu.find_children("*", "NewsButton", true, false)[0]
		button.open()
	await create_timer(1.0).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out)
	print("print: ", out)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(NewsFeed.cache_path))
	NewsFeed.cache_path = cache
	Prefs.save(NewsFeed.SEEN_KEY, seen)
	quit()
