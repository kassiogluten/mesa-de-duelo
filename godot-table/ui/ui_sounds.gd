# Os sons da interface (roadmap 150): passar o mouse num botão, clicar, abrir e fechar uma janela, confirmar e
# cancelar. Curtos e baixos, gerados aqui mesmo (tons com envelope, sem arquivo), no volume dos efeitos (Prefs
# "volume") e com a opção de desligar (Prefs "ui_sounds"). Todo botão de qualquer tela ganha o som sozinho (install).
class_name UiSounds
extends RefCounted

const RATE := 44100
## [frequência inicial, final (Hz), duração (s), força (0 a 1), notas]: cada som é um tom que desliza, com ataque rápido
## e queda suave; "notes" > 1 repete o tom subindo uma quinta (o confirmar).
const SHAPES := {
	"hover": [2400.0, 2600.0, 0.03, 0.10, 1],
	"click": [1250.0, 820.0, 0.05, 0.32, 1],
	"open": [520.0, 880.0, 0.14, 0.24, 1],
	"close": [760.0, 430.0, 0.12, 0.22, 1],
	"confirm": [660.0, 700.0, 0.07, 0.26, 2],
	"cancel": [440.0, 300.0, 0.10, 0.24, 1],
}
## Quantos sons tocam ao mesmo tempo, e o intervalo mínimo entre dois do mesmo (o mouse passando por uma fileira).
const VOICES := 4
const MIN_GAP_MS := 45

static var volume: float = -1.0
static var enabled: bool = true
static var _streams: Dictionary = {}
static var _players: Array[AudioStreamPlayer] = []
static var _next: int = 0
static var _last: Dictionary = {}
static var _installed: bool = false


## Liga o som de passar o mouse e de clicar em todo botão que entrar na árvore, e lê o volume e a opção guardados.
static func install(tree: SceneTree) -> void:
	if _installed:
		return
	_installed = true
	load_prefs()
	tree.node_added.connect(_on_node_added)
	_player(tree)


static func load_prefs() -> void:
	var prefs: Dictionary = Prefs.load_all()
	volume = float(prefs.get("volume", 0.8))
	enabled = bool(prefs.get("ui_sounds", true))


## O volume dos efeitos mudou (Opções, menu da partida): os sons da interface acompanham.
static func set_volume(value: float) -> void:
	volume = value


static func set_enabled(on: bool) -> void:
	enabled = on
	Prefs.save("ui_sounds", on)


static func _on_node_added(node: Node) -> void:
	if not node is BaseButton or node.has_meta("no_ui_sound"):
		return
	var button := node as BaseButton
	button.mouse_entered.connect(func() -> void:
		if not button.disabled:
			play("hover"))
	button.pressed.connect(func() -> void: play("click"))


## Toca um som ("hover", "click", "open", "close", "confirm", "cancel"); sem volume, desligado ou sem janela, nada.
static func play(kind: String) -> void:
	if volume < 0.0:
		load_prefs()
	if not enabled or volume <= 0.0 or not SHAPES.has(kind) or DisplayServer.get_name() == "headless":
		return
	var now: int = Time.get_ticks_msec()
	if now - int(_last.get(kind, -1000)) < MIN_GAP_MS:
		return
	_last[kind] = now
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree == null:
		return
	var player: AudioStreamPlayer = _player(tree)
	if player == null:
		return
	player.stream = stream(kind)
	player.volume_db = linear_to_db(volume) - 6.0
	player.play()


static func _player(tree: SceneTree) -> AudioStreamPlayer:
	_players = _players.filter(func(p: AudioStreamPlayer) -> bool: return is_instance_valid(p))
	if _players.is_empty():
		for i: int in VOICES:
			var player := AudioStreamPlayer.new()
			player.name = "UiSound%d" % i
			tree.root.add_child.call_deferred(player)
			_players.append(player)
	_next = (_next + 1) % _players.size()
	var chosen: AudioStreamPlayer = _players[_next]
	# Recém-criados, só entram na árvore no fim do quadro: o primeiro som se perde.
	return chosen if chosen.is_inside_tree() else null


## O som pronto (gerado uma vez e guardado).
static func stream(kind: String) -> AudioStreamWAV:
	if not _streams.has(kind):
		_streams[kind] = _make(SHAPES[kind])
	return _streams[kind]


## Gera o tom: seno com um pouco da segunda harmônica (mais "madeira" que apito), frequência deslizando, ataque de 4 ms
## e queda exponencial.
static func _make(shape: Array) -> AudioStreamWAV:
	var f0: float = shape[0]
	var f1: float = shape[1]
	var length: float = shape[2]
	var gain: float = shape[3]
	var notes: int = shape[4]
	var per: int = int(RATE * length)
	var data := PackedByteArray()
	data.resize(per * notes * 2)
	var phase: float = 0.0
	for n: int in notes:
		var ratio: float = pow(1.5, n)
		for i: int in per:
			var t: float = float(i) / per
			var freq: float = lerpf(f0, f1, t) * ratio
			phase += TAU * freq / RATE
			var envelope: float = minf(1.0, i / (RATE * 0.004)) * exp(-5.0 * t)
			var sample: float = (sin(phase) * 0.8 + sin(phase * 2.0) * 0.2) * envelope * gain
			data.encode_s16((n * per + i) * 2, int(clampf(sample, -1.0, 1.0) * 32767.0))
	var out := AudioStreamWAV.new()
	out.format = AudioStreamWAV.FORMAT_16_BITS
	out.mix_rate = RATE
	out.stereo = false
	out.data = data
	return out
