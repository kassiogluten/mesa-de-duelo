# Abre o laboratório de efeitos e grava uma sequência de quadros de cada botão em câmera lenta (para montar a folha de
# antes e depois e a soma dos quadros, que mostra o caminho e o rastro de cada voo).
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_trails.gd -- <pasta> "Cascata@2.4|Moer 4@1.2"
# Grava <pasta>/<botão>/0000.jpg, 0001.jpg… (a cada quadro, em tempo do jogo a 1/4 da velocidade).
extends SceneTree

const SLOW := 0.25

var _folder: String = "user://rastros"
var _buttons: PackedStringArray = ["Cascata@2.4"]


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.size() > 0:
		_folder = args[0]
	if args.size() > 1:
		_buttons = args[1].split("|", false)
	var lab := EffectsLab.new()
	root.add_child(lab)
	await create_timer(3.0).timeout
	for node: Node in lab.find_children("*", "PanelContainer", true, false):
		(node as Control).visible = false
	for entry: String in _buttons:
		var parts: PackedStringArray = entry.split("@")
		var length: float = float(parts[1]) if parts.size() > 1 else 1.5
		var dir: String = "%s/%s" % [_folder, parts[0].replace(" ", "_").replace("/", "-")]
		DirAccess.make_dir_recursive_absolute(dir)
		lab.reset()
		await create_timer(0.9).timeout
		Engine.time_scale = SLOW
		lab.press(parts[0])
		var elapsed: float = 0.0
		var index: int = 0
		while elapsed < length:
			await process_frame
			elapsed += root.get_process_delta_time()
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_jpg("%s/%04d.jpg" % [dir, index], 0.9)
			index += 1
		Engine.time_scale = 1.0
		print("RASTROS %s: %d quadros" % [parts[0], index])
		await create_timer(1.5).timeout
	quit()
