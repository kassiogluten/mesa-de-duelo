# Aquecimento dos efeitos: quando a mesa abre, desenha uma vez, minúsculos e invisíveis na frente da câmera, os materiais
# e as partículas dos efeitos, para a placa compilar tudo antes do jogo (sem isso, o primeiro limpa-campo, a primeira
# cúpula ou o primeiro halo travavam a mesa por ~140 ms).
class_name FxWarmup
extends Node3D

## Quantos quadros os materiais ficam desenhados antes de sumir.
const FRAMES := 4

var camera: Camera3D


func _ready() -> void:
	if camera == null:
		queue_free()
		return
	var holder := Node3D.new()
	camera.add_child(holder)
	holder.position = Vector3(0, 0, -1.5)
	var shaders: Array[Material] = []
	for shader: Shader in [Fx._ring(), Fx._pillar(), BoardSweep._front(), PermanentFx._dome(), CardDressing._halo(),
			ArrivalFx._bloom(), ArrivalFx._dim_material(), MomentPieces._slash_material(), CardGlow.SHADER,
			SpellMissile.CORE_SHADER, SpellMissile.TRAIL_SHADER, StackPresence.AURA_SHADER, StackPresence.HAZE_SHADER]:
		var material := ShaderMaterial.new()
		material.shader = shader
		shaders.append(material)
	shaders.append(MomentPieces._solid(Color.WHITE, 1.0, 1))
	shaders.append(Medallions._metal(Color.WHITE, 0.9, 0.25, 0.5))
	shaders.append(ArrivalFx._material(Color(1, 1, 1, 0.5), 0.0, 0.1, 0.2))
	shaders.append(ArrivalFx._material(Color.WHITE, 0.85, 0.28, 0.0))
	shaders.append(Critters._mat(Color.WHITE))
	# Os efeitos contínuos das permanentes (o material compartilhado) e o ponto de luz das partículas deles.
	shaders.append(AmbientFx.shared_material())
	shaders.append(AmbientMotes.draw_mesh().material)
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
	for mode: int in AmbientTraits.PARTICLE_MODES:
		var motes: GPUParticles3D = AmbientMotes.emitter(mode)
		motes.position = Vector3(0, 0, 0)
		motes.scale = Vector3.ONE * 0.001
		holder.add_child(motes)
	var label := Label3D.new()
	label.text = "Aquecendo 0123456789"
	label.font = MomentPieces._font()
	label.font_size = 96
	label.pixel_size = 0.00001
	holder.add_child(label)
	_free_later(holder)


func _free_later(holder: Node3D) -> void:
	var ref: WeakRef = weakref(holder)
	for i: int in FRAMES:
		await get_tree().process_frame
	var node: Node3D = ref.get_ref() as Node3D
	if node:
		node.queue_free()
	await get_tree().create_timer(1.0).timeout
	queue_free()
