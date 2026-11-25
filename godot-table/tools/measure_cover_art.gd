# Mede na placa de vídeo quanto a tela inicial leva para desenhar com a capa pintada, e quanto custa pintar uma arte.
# npm run godot -- --disable-vsync --resolution 640x360 --script res://tools/measure_cover_art.gd -- [tamanhos] [rodadas]
# Desenha a tela inicial num viewport do tamanho pedido e imprime o tempo médio de GPU por quadro (e o pior), com a deriva
# ligada e desligada (o nível de efeitos leve); depois troca de deck algumas vezes e mede o quadro em que a arte nova é
# pintada (o viewport da pintura, à parte) e o pior quadro da tela nessa hora.
extends SceneTree

const BASE := Vector2(1920, 1080)
const WARM_S := 1.0
const SAMPLE_S := 3.0


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var sizes: PackedStringArray = (args[0] if args.size() > 0 else "1920x1080").split(",")
	var rounds: int = int(args[1]) if args.size() > 1 else 2
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
		viewport.msaa_2d = Viewport.MSAA_2X
		root.add_child(viewport)
		RenderingServer.viewport_set_measure_render_time(viewport.get_viewport_rid(), true)
		var menu := MenuScreen.new()
		viewport.add_child(menu)
		var cover: HomeCover = menu.find_children("*", "HomeCover", true, false)[0]
		await _wait_for_art(cover)
		print("== %s (GPU da tela inicial inteira, ms por quadro: média / pior; FPS sem vsync)" % size_text)
		for drift: bool in [true, false]:
			cover.drift = drift
			var line: String = ""
			for r: int in rounds:
				await create_timer(WARM_S).timeout
				var m: Array = await _sample(viewport)
				line += "  %.2f / %.2f ms, %.0f FPS" % m
			print("%-8s%s" % ["deriva" if drift else "leve", line])
		cover.drift = true
		# Troca de deck: decks ainda não pintados (a pintura é medida no viewport dela, no quadro em que desenha).
		for index: int in [1, 5, 7]:
			menu._select(index)
			# O pior intervalo entre quadros (relógio) enquanto a arte chega, é pintada e esmaece.
			var gap: float = 0.0
			var last: int = Time.get_ticks_usec()
			var since: int = last
			while Time.get_ticks_usec() - since < 2500000:
				await RenderingServer.frame_post_draw
				var now: int = Time.get_ticks_usec()
				gap = maxf(gap, (now - last) / 1000.0)
				last = now
			print("deck %d: pior intervalo entre quadros na troca: %.1f ms" % [index, gap])
			await _wait_for_art(cover)
			if cover.get("_bakery") == null:
				continue
			var bakes: Array = (cover.get("_bakery") as Node).get_children()
			var bake: SubViewport = bakes[-1]
			RenderingServer.viewport_set_measure_render_time(bake.get_viewport_rid(), true)
			# (Com UPDATE_ONCE a medida volta zerada: pinta de novo por alguns quadros só para medir, e para.)
			bake.render_target_update_mode = SubViewport.UPDATE_ALWAYS
			var paint_ms: Array = []
			for i: int in 5:
				await RenderingServer.frame_post_draw
				paint_ms.append(snappedf(RenderingServer.viewport_get_measured_render_time_gpu(bake.get_viewport_rid()), 0.1))
			bake.render_target_update_mode = SubViewport.UPDATE_DISABLED
			print("pintar a arte do deck %d (%s): %s ms de GPU por vez (na capa, uma vez por arte)" % [index, bake.size, paint_ms])
		viewport.queue_free()
		await process_frame
	quit()


## [média de GPU em ms, pior quadro em ms, FPS] da tela ao longo de SAMPLE_S.
func _sample(viewport: SubViewport) -> Array:
	var total: float = 0.0
	var worst: float = 0.0
	var frames: int = 0
	var start: int = Time.get_ticks_usec()
	while Time.get_ticks_usec() - start < SAMPLE_S * 1000000.0:
		await RenderingServer.frame_post_draw
		var gpu: float = RenderingServer.viewport_get_measured_render_time_gpu(viewport.get_viewport_rid())
		total += gpu
		worst = maxf(worst, gpu)
		frames += 1
	return [total / frames, worst, frames / ((Time.get_ticks_usec() - start) / 1000000.0)]


func _wait_for_art(cover: HomeCover) -> void:
	var waited: float = 0.0
	while cover.art_texture() == null and waited < 30.0:
		await create_timer(0.25).timeout
		waited += 0.25
	await create_timer(0.5).timeout
