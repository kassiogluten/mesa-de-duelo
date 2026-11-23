# Monta a mesa do laboratório e salva prints do clima da mesa: normal, no pico de uma mágica vermelha, azul e verde, com
# várias seguidas e de volta ao normal. Com janela (o print precisa da tela desenhada):
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_table_mood.gd -- <caminho base>
extends SceneTree

## Do pulso ao print: perto do pico do clima.
const PEAK := 0.4
## Entre uma cor e outra: o bastante para o clima voltar ao normal.
const REST := 3.4

var _base: String = ""
var _mood: TableMood


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_base = args[0] if args.size() > 0 else OS.get_user_data_dir().path_join("clima")
	Fx.quality = 2
	var lab := EffectsLab.new()
	root.add_child(lab)
	# Sem o painel de botões: só a mesa.
	for node: Node in lab.find_children("*", "PanelContainer", true, false):
		(node as Control).visible = false
	var table: TableView = lab.get("_table")
	_mood = TableMood.new()
	root.add_child(_mood)
	_mood.attach(table)
	# As imagens das cartas chegam do catálogo (cache em disco ou rede).
	await create_timer(4.0).timeout
	_shot("normal")
	for entry: Array in [["vermelho", Color(1.0, 0.38, 0.18)], ["azul", Color(0.35, 0.65, 1.0)], ["verde", Color(0.35, 0.95, 0.4)]]:
		_mood.pulse(entry[1])
		await create_timer(PEAK).timeout
		_shot(Txt.of(entry[0]))
		await create_timer(REST).timeout
	for i: int in 4:
		_mood.pulse(Color(0.68, 0.4, 0.95))
		await create_timer(0.25).timeout
	_shot("acumulado")
	await create_timer(REST).timeout
	_shot("volta")
	print("prints em %s-*.png" % _base)
	quit()


func _shot(name: String) -> void:
	var path: String = "%s-%s.png" % [_base, name]
	root.get_texture().get_image().save_png(path)
	print("%s (clima %.2f)" % [path, _mood.level()])
