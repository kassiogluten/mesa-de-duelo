# Monta uma mesa mínima, lança os dados e a moeda 3D lado a lado e salva prints, para conferir o visual e se o resultado se lê.
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_dice3d.gd -- <saída.png>
# Grava <saída>.png (em movimento), <saída>-fim.png (parados), <saída>-coroa.png e <saída>-partida.png (d6 de quem começa).
extends SceneTree


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://dado.png"
	var world := Node3D.new()
	root.add_child(world)
	_stage(world)
	Dice3D.roll(world, Vector3(-2.1, 0, -0.3), 4, 3)
	Dice3D.roll(world, Vector3(-0.7, 0, -0.3), 8, 6)
	Dice3D.roll(world, Vector3(0.7, 0, -0.3), 10, 10)
	Dice3D.roll(world, Vector3(2.1, 0, -0.3), 12, 9)
	Dice3D.roll(world, Vector3(-1.6, 0, 1.4), 6, 5)
	Dice3D.roll(world, Vector3(0, 0, 1.4), 20, 20)
	Dice3D.coin(world, Vector3(1.6, 0, 1.4), true)
	await create_timer(0.75).timeout
	_save(out, "")
	await create_timer(1.0).timeout
	_save(out, "-fim")
	await create_timer(1.6).timeout
	Dice3D.roll(world, Vector3(-1.6, 0, 1.4), 6, 1)
	Dice3D.roll(world, Vector3(0, 0, 1.4), 100, 57)
	Dice3D.coin(world, Vector3(1.6, 0, 1.4), false)
	Dice3D.roll(world, Vector3(-0.7, 0, -0.3), 20, 13)
	Dice3D.roll(world, Vector3(0.7, 0, -0.3), 20, 8)
	await create_timer(1.75).timeout
	_save(out, "-coroa")
	await create_timer(1.6).timeout
	Dice3D.starting_roll(world, {0: Vector3(0, 0, 1.6), 1: Vector3(0, 0, -1.2)}, [[{"player": 0, "roll": 4}, {"player": 1, "roll": 4}], [{"player": 0, "roll": 6}, {"player": 1, "roll": 2}]])
	await create_timer(1.55).timeout
	_save(out, "-empate")
	await create_timer(2.35).timeout
	_save(out, "-partida")
	quit()


## Câmera, luzes, ambiente e tampo como os da mesa (table/table_view.gd).
func _stage(world: Node3D) -> void:
	var camera := Camera3D.new()
	camera.fov = 42.0
	world.add_child(camera)
	camera.look_at_from_position(TableView.CAMERA_POS, TableView.CAMERA_LOOK)
	camera.current = true
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-62, -28, 0)
	sun.light_energy = 1.05
	sun.shadow_enabled = true
	sun.shadow_blur = 2.0
	world.add_child(sun)
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(0, 6.5, 1.0)
	lamp.omni_range = 16.0
	lamp.light_energy = 0.9
	lamp.light_color = Color(1.0, 0.92, 0.8)
	world.add_child(lamp)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.03, 0.04, 0.07)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.45, 0.5, 0.65)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 0.9
	var sky := WorldEnvironment.new()
	sky.environment = env
	world.add_child(sky)
	var top := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(30, 18)
	top.mesh = plane
	top.material_override = ShaderMaterial.new()
	(top.material_override as ShaderMaterial).shader = preload("res://table/table_top.gdshader")
	top.position = Vector3(0, -0.01, 0)
	world.add_child(top)


func _save(out: String, suffix: String) -> void:
	var path: String = out.get_basename() + suffix + "." + out.get_extension()
	root.get_texture().get_image().save_png(path)
	print("print salvo em ", path)
