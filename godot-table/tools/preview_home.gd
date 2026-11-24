# Prints da tela inicial com as artes de verdade (pelo catálogo das cartas), em 1920×1080, 2560×1080 e 1366×768, para conferir o visual.
# npm run godot -- --resolution 1920x1080 --position 0,0 --script res://tools/preview_home.gd -- <pasta> [tamanhos] [commander] [opcoes] [procurar|atualizar]
# tamanhos: "1920x1080,2560x1080,1366x768" (o padrão). Cada tamanho é desenhado num viewport à parte, com a mesma conta do
# canvas_items/expand do projeto (a janela maximizada não muda de tamanho).
extends SceneTree

const SIZES := "1920x1080,2560x1080,1366x768"
const BASE := Vector2(1920, 1080)
const ART_TIMEOUT_S := 30.0


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if not args.is_empty() else "user://preview-home"
	DirAccess.make_dir_recursive_absolute(out)
	var sizes: PackedStringArray = (args[1] if args.size() > 1 and args[1].contains("x") else SIZES).split(",")
	var commander: bool = args.has("commander")
	var options: bool = args.has("opcoes")
	# procurar / atualizar: a versão no canto com o botão Procurar atualização, ou com uma versão nova à espera.
	var badge: String = "atualizar" if args.has("atualizar") else ("procurar" if args.has("procurar") else "")
	# Sem Meus decks nem a partida guardada do jogador: só os prontos e uma sala de exemplo para o Voltar à partida.
	DeckLibrary.path = "user://preview-home-decks.json"
	SavedSession.path = "user://preview-home-partida.json"
	SavedSession.save("K7QM", "t", true, "standard")
	var tag: String = ("-commander" if commander else "") + ("-opcoes" if options else "") + ("-" + badge if badge != "" else "")
	for size_text: String in sizes:
		var parts: PackedStringArray = size_text.split("x")
		var pixels := Vector2i(int(parts[0]), int(parts[1]))
		var viewport := SubViewport.new()
		viewport.size = pixels
		# canvas_items/expand: a altura (ou a largura) base de 1920×1080 e o resto do lado que sobra.
		var scale: float = minf(pixels.x / BASE.x, pixels.y / BASE.y)
		viewport.size_2d_override = Vector2i(roundi(pixels.x / scale), roundi(pixels.y / scale))
		viewport.size_2d_override_stretch = true
		viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		viewport.msaa_2d = Viewport.MSAA_4X
		root.add_child(viewport)
		var menu := MenuScreen.new()
		menu.version_text = "Versão de desenvolvimento" if badge == "" else "Versão 0.243.0"
		viewport.add_child(menu)
		await process_frame
		if badge != "":
			menu.version_badge.updater = true
			menu.version_badge.set_update({"version": "0.244.0", "reinstall": false, "download": ""} if badge == "atualizar" else {})
		if commander:
			menu._mode.select(1)
			menu._fill_decks()
		await _wait_for_art(menu)
		if options:
			(menu.find_children("*", "HomeOptions", true, false)[0] as HomeOptions).toggle()
			await create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var image: Image = viewport.get_texture().get_image()
		var path: String = "%s/home-%s%s.png" % [out, size_text, tag]
		image.save_png(path)
		print("print: %s (%dx%d)" % [path, image.get_width(), image.get_height()])
		viewport.queue_free()
		await process_frame
	SavedSession.clear()
	quit()


## Espera a arte da capa e as dos ladrilhos à mostra chegarem (ou desiste depois de um tempo, sem rede).
func _wait_for_art(menu: MenuScreen) -> void:
	var waited: float = 0.0
	while waited < ART_TIMEOUT_S:
		await create_timer(0.25).timeout
		waited += 0.25
		var strip: DeckStrip = menu.find_children("*", "DeckStrip", true, false)[0]
		var cover: HomeCover = menu.find_children("*", "HomeCover", true, false)[0]
		var missing: int = 0
		for index: int in strip.visible_indices():
			if strip.tile(index) and not strip.tile(index).has_art():
				missing += 1
		if cover.art_texture() != null and missing == 0:
			break
	# O esmaecer da arte que acabou de chegar.
	await create_timer(0.8).timeout
