# Aquecimento dos efeitos: quando a mesa abre, desenha uma vez, minúsculos e invisíveis na frente da câmera, os materiais
# e as partículas dos efeitos, para a placa compilar tudo antes do jogo (sem isso, o primeiro limpa-campo, a primeira
# cúpula ou o primeiro halo travavam a mesa por ~140 ms).
class_name FxWarmup
extends Node3D

## Quantos quadros os materiais ficam desenhados antes de sumir.
const FRAMES := 4

var camera: Camera3D
var _coin_task: int = -1
var _coin_images: Array[Image] = []


func _ready() -> void:
	if camera == null:
		queue_free()
		return
	var holder := Node3D.new()
	camera.add_child(holder)
	holder.position = Vector3(0, 0, -1.5)
	var shaders: Array[Material] = []
	for shader: Shader in [Fx._ring(), Fx._pillar(), BoardSweep._front(), PermanentFx._dome(), CardDressing._halo(),
			ArrivalFx._bloom(), ArrivalFx._dim_material(), MomentPieces._slash_material(), CardGlow.SHADER, CombatFx._flash(),
			SpellMissile.CORE_SHADER, SpellMissile.TRAIL_SHADER, StackPresence.AURA_SHADER, StackPresence.HAZE_SHADER,
			ExilePortal.SHADER, TrailRibbon.SHADER, EnergyBeam.SHADER]:
		var material := ShaderMaterial.new()
		material.shader = shader
		shaders.append(material)
	shaders.append(MomentPieces._solid(Color.WHITE, 1.0, 1))
	shaders.append(Medallions._metal(Color.WHITE, 0.9, 0.25, 0.5))
	shaders.append(ArrivalFx._material(Color(1, 1, 1, 0.5), 0.0, 0.1, 0.2))
	shaders.append(ArrivalFx._material(Color.WHITE, 0.85, 0.28, 0.0))
	# A moeda do Tesouro (metal com brilho próprio): sem ela, o primeiro Tesouro travava ~30 ms.
	shaders.append(ArrivalFx._material(Color.WHITE, 0.85, 0.28, 0.15))
	shaders.append(Critters._mat(Color.WHITE))
	shaders.append(Fx._glow_material(Color.WHITE))
	# Os efeitos contínuos das permanentes (o material compartilhado) e o ponto de luz das partículas deles.
	shaders.append(AmbientFx.shared_material())
	shaders.append(AmbientMotes.draw_mesh().material)
	# As estrelinhas e os brilhos dos selos e o giro do selo do enjoo (fx/state_badges.gd, fx/sickness_fx.gd).
	shaders.append(BadgeFx.star_material())
	shaders.append(SicknessFx.orbit_material())
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE * 0.001
	for material: Material in shaders:
		var mesh := MeshInstance3D.new()
		mesh.mesh = quad
		mesh.material_override = material
		# Com sombra: a passada da sombra também compila o material dela.
		holder.add_child(mesh)
	# As partículas (faíscas, rastro, faíscas da frente da onda): pretas no modo de somar luz, não aparecem.
	var spot: Vector3 = camera.global_transform * Vector3(0, 0, -1.5)
	Fx.burst(self, spot, Color(0, 0, 0, 0), 4, 0.01, 0.2, 0.001)
	BoardSweep._front_sparks(self, spot, Color(0, 0, 0, 0), 0.2)
	SpellMissile.warm(self, spot)
	CombatFx.sparks(self, spot, Vector3.FORWARD, Color(0, 0, 0, 0), 4, 0.01)
	TouchFx.dust(self, spot, Color(0, 0, 0, 0), 1.0)
	# As gotas de mana (núcleo, cometa e faíscas) e os fiapos de luz que saem do grimório.
	ManaOrb.warm(self, spot)
	FlightPieces.flutter(self, spot, Color(0, 0, 0, 0), 3)
	# Os números do dano e os textos (com contorno, na fonte dos títulos e na comum), já com os algarismos.
	for font: Font in [MomentPieces._font(), null]:
		var label := Label3D.new()
		label.text = "Aquecendo -0123456789+ veneno"
		if font:
			label.font = font
		label.font_size = 120
		label.outline_size = 26
		label.no_depth_test = true
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.pixel_size = 0.00001
		holder.add_child(label)
	# As luzes de verdade (clarão, holofote do Game Changer): a primeira de cada tipo recompila os materiais da mesa.
	var omni := OmniLight3D.new()
	omni.light_energy = 0.001
	omni.omni_range = 0.01
	holder.add_child(omni)
	var spot_light := SpotLight3D.new()
	spot_light.light_energy = 0.001
	spot_light.spot_range = 0.01
	holder.add_child(spot_light)
	# Os objetos montados na hora (dados, fichas): a primeira montagem gera as malhas e compila os materiais deles.
	var objects := Node3D.new()
	objects.scale = Vector3.ONE * 0.001
	holder.add_child(objects)
	for sides: int in [6, 20]:
		objects.add_child(Dice3D._make_die(sides, 1, Color.WHITE))
	for kind: String in ArrivalFx.TOKENS.values():
		var object: Node3D = ArrivalFx._token_object(kind)
		if object:
			objects.add_child(object)
	_coin_task = WorkerThreadPool.add_task(_draw_coin)
	ManaPoolFx.warm(self)
	for mode: int in AmbientTraits.PARTICLE_MODES:
		var motes: GPUParticles3D = AmbientMotes.emitter(mode)
		motes.scale = Vector3.ONE * 0.001
		holder.add_child(motes)
	_free_later(holder)


## As faces da moeda, desenhadas fora da linha principal; as texturas saem quando ficam prontas (em _process).
func _draw_coin() -> void:
	var images: Array[Image] = []
	for heads: bool in [true, false]:
		images.append_array(Dice3D.coin_images(heads))
	_coin_images = images


func _process(_delta: float) -> void:
	if _coin_task >= 0 and WorkerThreadPool.is_task_completed(_coin_task):
		WorkerThreadPool.wait_for_task_completion(_coin_task)
		_coin_task = -1
		Dice3D.set_coin_images(_coin_images)
		# Com as faces prontas, a moeda inteira aparece uns quadros (compila o ouro com relevo).
		var coin: Node3D = Dice3D._make_coin()
		coin.position = Vector3(0, 0, -1.5)
		coin.scale = Vector3.ONE * 0.001
		camera.add_child(coin)
		_free_later(coin)


func _free_later(holder: Node3D) -> void:
	var ref: WeakRef = weakref(holder)
	for i: int in FRAMES:
		await get_tree().process_frame
	var node: Node3D = ref.get_ref() as Node3D
	if node:
		node.queue_free()
	if holder.name == "Coin3D":
		return
	await get_tree().create_timer(1.0).timeout
	# A moeda ainda desenhando: espera terminar (a tarefa usa este nó) e a moeda aparecer antes de sair.
	while _coin_task >= 0:
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	queue_free()
