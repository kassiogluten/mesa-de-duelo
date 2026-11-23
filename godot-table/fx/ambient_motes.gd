# As poucas partículas dos efeitos contínuos (luzinhas verdes do vínculo com a vida, brasas do ameaçar), com material e
# malha compartilhados entre todas as cartas; só no modo caprichado e dentro do orçamento de cada lado da mesa.
class_name AmbientMotes
extends RefCounted

## Partículas vivas por emissor: bem poucas, é só um toque.
const AMOUNT := 4
const LIFE := 2.6

static var _process_materials: Dictionary = {}
static var _draw_mesh: QuadMesh


## Um emissor preso na carta (`local_coords`: acompanha quando ela vira, paira ou vai atacar).
static func emitter(mode: int) -> GPUParticles3D:
	var particles := GPUParticles3D.new()
	particles.amount = AMOUNT
	particles.lifetime = LIFE
	particles.preprocess = LIFE
	particles.local_coords = true
	particles.process_material = process_material(mode)
	particles.draw_pass_1 = draw_mesh()
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Cabe na carta e um pouco acima: a caixa de visibilidade pequena deixa a placa cortar o emissor fora da tela.
	particles.visibility_aabb = AABB(Vector3(-0.4, -0.05, -0.5), Vector3(0.8, 0.5, 1.0))
	particles.position = Vector3(0, 0.01, 0)
	return particles


## O movimento das partículas de um efeito (um por efeito, compartilhado).
static func process_material(mode: int) -> ParticleProcessMaterial:
	if _process_materials.has(mode):
		return _process_materials[mode]
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.direction = Vector3(0, 1, 0)
	process.spread = 18.0
	process.gravity = Vector3.ZERO
	var ramp := Gradient.new()
	if mode == AmbientTraits.Mode.MENACE:
		# Brasas: saem dos cantos de baixo e de cima, sobem tremendo, vermelho-escuras.
		process.emission_box_extents = Vector3(0.3, 0.0, 0.42)
		process.initial_velocity_min = 0.05
		process.initial_velocity_max = 0.1
		process.turbulence_enabled = true
		process.turbulence_noise_strength = 0.4
		process.turbulence_noise_scale = 2.0
		process.scale_min = 0.012
		process.scale_max = 0.022
		ramp.set_color(0, Color(1.0, 0.35, 0.08, 0.0))
		ramp.add_point(0.2, Color(1.0, 0.3, 0.06, 0.9))
		ramp.set_color(ramp.get_point_count() - 1, Color(0.4, 0.04, 0.02, 0.0))
	else:
		# Vínculo com a vida: luzinhas verde-claras que sobem devagar da carta e se apagam.
		process.emission_box_extents = Vector3(0.26, 0.0, 0.38)
		process.initial_velocity_min = 0.06
		process.initial_velocity_max = 0.12
		process.scale_min = 0.016
		process.scale_max = 0.028
		ramp.set_color(0, Color(0.7, 1.0, 0.75, 0.0))
		ramp.add_point(0.3, Color(0.75, 1.0, 0.8, 0.8))
		ramp.set_color(ramp.get_point_count() - 1, Color(0.5, 1.0, 0.6, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	_process_materials[mode] = process
	return process


## Um ponto de luz redondo e macio, virado para a câmera, somando luz (o mesmo para todos os emissores).
static func draw_mesh() -> QuadMesh:
	if _draw_mesh:
		return _draw_mesh
	_draw_mesh = QuadMesh.new()
	_draw_mesh.size = Vector2.ONE
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	material.billboard_keep_scale = true
	material.vertex_color_use_as_albedo = true
	material.no_depth_test = false
	var dot := GradientTexture2D.new()
	dot.fill = GradientTexture2D.FILL_RADIAL
	dot.fill_from = Vector2(0.5, 0.5)
	dot.fill_to = Vector2(0.5, 0.0)
	dot.width = 32
	dot.height = 32
	var fall := Gradient.new()
	fall.set_color(0, Color(1, 1, 1, 1))
	fall.set_color(1, Color(1, 1, 1, 0))
	dot.gradient = fall
	material.albedo_texture = dot
	_draw_mesh.material = material
	return _draw_mesh
