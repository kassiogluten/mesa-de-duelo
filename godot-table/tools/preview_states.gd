# Folhas de quadros dos efeitos dos estados das permanentes (enjoo, marcadores, lealdade, desvirar, P/T, selos novos):
# abre o laboratório, aperta cada botão de lab/lab_states.gd e junta os quadros recortados em volta da carta numa folha.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_states.gd -- <pasta> [botão|botão…]
extends SceneTree

## Cada botão: a carta no meio do recorte (ou "player:0", o seu retrato), de quanto em quanto tempo e quantos quadros.
const PLAN := {
	"Enjoo chegando": [103, 0.1, 18], "Enjoo passando": [103, 0.08, 30], "Desvirar": [105, 0.06, 24],
	"Virar para mana": [105, 0.05, 12], "Marcadores +1/+1": [103, 0.06, 18], "Marcadores −1/−1": [202, 0.06, 18],
	"Lealdade": [801, 0.12, 36], "Veneno": ["seat", 0.06, 18], "Energia": ["seat", 0.06, 18],
	"P/T sobe": [103, 0.06, 15], "P/T cai": [101, 0.06, 15], "Selos novos": [103, 0.05, 15],
}
const CROP := Vector2i(280, 210)
## Os quadros entram na folha ampliados (a carta na mesa é pequena).
const ZOOM := 2
const COLUMNS := 6


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var folder: String = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("estados")
	var names: PackedStringArray = args[1].split("|", false) if args.size() > 1 else PackedStringArray(PLAN.keys())
	DirAccess.make_dir_recursive_absolute(folder)
	var lab := EffectsLab.new()
	root.add_child(lab)
	await create_timer(4.0).timeout
	(lab.get("_panel_node") as Control).visible = false
	for name: String in names:
		var plan: Array = PLAN.get(name, [103, 0.08, 18])
		lab.reset()
		await create_timer(1.0).timeout
		lab.press(name)
		# Lealdade e o enjoo passando têm um estado antes do efeito: a folha começa quando ele chega.
		if name in ["Enjoo passando", "Desvirar"]:
			await create_timer(1.0 if name == "Desvirar" else 1.6).timeout
		elif name == "Lealdade":
			await create_timer(1.0).timeout
		var frames: Array[Image] = []
		for i: int in int(plan[2]):
			await create_timer(float(plan[1])).timeout
			await RenderingServer.frame_post_draw
			var shot: Image = root.get_texture().get_image()
			frames.append(shot.get_region(_crop(lab, plan[0], shot.get_size())))
			if i == 0 or i == int(plan[2]) / 2:
				shot.save_png("%s/%s_%02d.png" % [folder, _file(name), i])
		_sheet(frames).save_png("%s/%s_folha.png" % [folder, _file(name)])
		print("%s/%s_folha.png" % [folder, _file(name)])
	quit()


## O recorte em volta da carta (ou do seu assento, no canto de baixo à esquerda).
func _crop(lab: EffectsLab, focus: Variant, screen: Vector2i) -> Rect2i:
	var center := Vector2(screen) * Vector2(0.1, 0.8)
	if focus is int:
		var at: Variant = lab.table.anchor(focus)
		if at is Vector3:
			# A tela de referência do projeto pode ser maior que a janela: o ponto vem nela e o print tem o tamanho da janela.
			center = lab.table.camera.unproject_position(at) * Vector2(screen) / root.get_visible_rect().size
	if OS.get_environment("MESA_DEBUG_CROP") != "":
		print("crop ", focus, " ", center, " ", screen, " ", root.get_visible_rect().size)
	var corner := Vector2i(center) - CROP / 2
	corner.x = clampi(corner.x, 0, screen.x - CROP.x)
	corner.y = clampi(corner.y, 0, screen.y - CROP.y)
	return Rect2i(corner, CROP)


func _sheet(frames: Array[Image]) -> Image:
	var rows: int = int(ceil(frames.size() / float(COLUMNS)))
	var sheet := Image.create(CROP.x * ZOOM * COLUMNS, CROP.y * ZOOM * rows, false, Image.FORMAT_RGBA8)
	for i: int in frames.size():
		var frame: Image = frames[i]
		frame.convert(Image.FORMAT_RGBA8)
		frame.resize(CROP.x * ZOOM, CROP.y * ZOOM, Image.INTERPOLATE_LANCZOS)
		sheet.blit_rect(frame, Rect2i(Vector2i.ZERO, CROP * ZOOM), Vector2i((i % COLUMNS) * CROP.x, (i / COLUMNS) * CROP.y) * ZOOM)
	return sheet


func _file(name: String) -> String:
	return name.replace(" ", "_").replace("/", "-").replace("−", "menos").replace("+", "mais")
