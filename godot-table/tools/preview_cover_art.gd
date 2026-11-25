# Prints da capa da tela inicial com a arte de vários decks (a deriva parada no mesmo ponto), para conferir a pintura.
# npm run godot -- --resolution 1920x1080 --position 0,0 --script res://tools/preview_cover_art.gd -- <pasta> [tamanhos] [decks]
# tamanhos: "1920x1080,2560x1080,1366x768" (o padrão: só 1920x1080); decks: índices na fileira do Standard ("0,1,5,7").
# Grava <pasta>/<tamanho>-d<deck>.png e imprime a carta da capa de cada deck.
extends SceneTree

const BASE := Vector2(1920, 1080)
const ART_TIMEOUT_S := 30.0
## O momento da deriva lenta em que todos os prints são tirados (o mesmo zoom em todos).
const DRIFT_T := 9.0


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if not args.is_empty() else "user://preview-cover"
	var sizes: PackedStringArray = (args[1] if args.size() > 1 else "1920x1080").split(",")
	var decks: PackedStringArray = (args[2] if args.size() > 2 else "0").split(",")
	DirAccess.make_dir_recursive_absolute(out)
	DeckLibrary.path = "user://preview-home-decks.json"
	SavedSession.path = "user://preview-home-partida.json"
	SavedSession.clear()
	for size_text: String in sizes:
		var parts: PackedStringArray = size_text.split("x")
		var pixels := Vector2i(int(parts[0]), int(parts[1]))
		var viewport := SubViewport.new()
		viewport.size = pixels
		var scale: float = minf(pixels.x / BASE.x, pixels.y / BASE.y)
		viewport.size_2d_override = Vector2i(roundi(pixels.x / scale), roundi(pixels.y / scale))
		viewport.size_2d_override_stretch = true
		viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		viewport.msaa_2d = Viewport.MSAA_4X
		root.add_child(viewport)
		var menu := MenuScreen.new()
		menu.version_text = "Versão de desenvolvimento"
		viewport.add_child(menu)
		await process_frame
		var cover: HomeCover = menu.find_children("*", "HomeCover", true, false)[0]
		for deck_text: String in decks:
			var index: int = int(deck_text)
			menu._select(index)
			await _wait_for_art(cover)
			var deck: Dictionary = menu._your_deck()
			print("deck %d: %s · capa: %s" % [index, deck.get("name"), DeckArt.cover_name(deck, menu._art.catalog.info)])
			cover.set_process(false)
			cover._time = DRIFT_T
			for layer: Control in cover._layers:
				cover._apply_drift(layer.get_node("Art") as TextureRect)
			await create_timer(0.3).timeout
			await RenderingServer.frame_post_draw
			var path: String = "%s/%s-d%d.png" % [out, size_text, index]
			viewport.get_texture().get_image().save_png(path)
			print("print: " + path)
			cover.set_process(true)
		viewport.queue_free()
		await process_frame
	quit()


## Espera a arte da capa chegar e terminar de esmaecer.
func _wait_for_art(cover: HomeCover) -> void:
	var waited: float = 0.0
	while waited < ART_TIMEOUT_S:
		await create_timer(0.25).timeout
		waited += 0.25
		if cover.art_texture() != null:
			break
	await create_timer(0.8).timeout
