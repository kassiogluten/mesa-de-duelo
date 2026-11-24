# Luz, ambiente e pós-processamento da mesa 3D: câmera, sol quente com sombra macia, lâmpada, contraluz fria, céu só para
# os reflexos, brilho calibrado, vinheta e o tampo. O clima (TableMood) acha o sol, a lâmpada e o ambiente.
# Fica na mesa como um nó que acompanha a qualidade dos efeitos (no "leve", sem sombra) e leva a poça de luz do tampo
# para o lado de quem joga o turno.
class_name TableEnvironment
extends Node

const TOP_SHADER := preload("res://table/table_top.gdshader")
## Cor do fundo (quase nunca aparece: o tampo enche a tela) e da luz ambiente.
const BACKGROUND := Color(0.02, 0.026, 0.05)
const AMBIENT := Color(0.46, 0.52, 0.68)
## A poça de luz de quem joga o turno: quanto ela passa da área do jogador (unidades da mesa) e a velocidade com que vai
## de um lado para o outro (por segundo, aproximação exponencial).
const POOL_MARGIN := Vector2(0.9, 0.75)
const POOL_SPEED := 2.2

static var _vignette_shader: Shader

var sun: DirectionalLight3D
var env: Environment
var table: TableView
var felt: ShaderMaterial
var _quality: int = -1
## A poça agora (centro x, z e meia largura e profundidade) e a força dela.
var _pool := Vector4(0.0, 1.6, 4.4, 1.4)
var _pool_strength: float = 0.0


## Monta a cena em volta da mesa (filhos diretos dela, nesta ordem: o sol é o primeiro DirectionalLight3D e a lâmpada o
## primeiro OmniLight3D, que o clima procura) e devolve a câmera.
static func build(table: TableView) -> Camera3D:
	var camera := Camera3D.new()
	camera.fov = 42.0
	table.add_child(camera)
	camera.look_at_from_position(TableView.CAMERA_POS, TableView.CAMERA_LOOK)

	var key_light := DirectionalLight3D.new()
	# Quase de cima: a sombra da mão (perto da câmera) cai atrás dela, e a das cartas no ar ainda aparece embaixo delas.
	key_light.rotation_degrees = Vector3(-76, -25, 0)
	# Quente: a face da carta pega um tom de lâmpada, e a contraluz fria desenha as bordas (profundidade por contraste).
	key_light.light_energy = 0.86
	key_light.light_color = Color(1.0, 0.955, 0.89)
	key_light.shadow_enabled = true
	# Sombra macia por filtro (a sombra "de verdade", com o tamanho do sol, sai pontilhada sem o antisserrilhado temporal).
	key_light.shadow_blur = 2.5
	key_light.shadow_bias = 0.02
	key_light.shadow_normal_bias = 1.0
	key_light.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	key_light.directional_shadow_max_distance = 22.0
	table.add_child(key_light)

	# A lâmpada da sala: uma poça de luz quente no meio da mesa.
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(0, 6.0, 0.9)
	lamp.omni_range = 15.0
	lamp.omni_attenuation = 1.3
	lamp.light_energy = 0.9
	lamp.light_color = Color(1.0, 0.9, 0.76)
	lamp.light_specular = 0.6
	table.add_child(lamp)

	# Contraluz fria do lado do oponente: desenha o contorno das cartas e dos objetos no ar.
	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-25, 170, 0)
	rim.light_energy = 0.4
	rim.light_color = Color(0.5, 0.64, 1.0)
	rim.light_specular = 1.2
	table.add_child(rim)

	var world := WorldEnvironment.new()
	world.environment = environment()
	table.add_child(world)

	var top := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(30, 18)
	plane.subdivide_width = 0
	top.mesh = plane
	var felt := ShaderMaterial.new()
	felt.shader = TOP_SHADER
	top.material_override = felt
	# O feltro calculado uma vez numa textura (table/felt_bake.gd); até ela chegar, o tampo calcula a cada pixel.
	var bake := FeltBake.new()
	bake.material = felt
	table.add_child(bake)
	top.position = Vector3(0, -0.01, 0)
	top.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	table.add_child(top)

	table.add_child(vignette())
	# O halo das cartas acesas (fx/card_dressing.gd); o foil das raras fica só no inspetor.
	var dressing := CardDressing.new()
	dressing.table = table
	table.add_child(dressing)
	# Os materiais dos efeitos compilados logo na abertura (fx/fx_warmup.gd).
	var warmup := FxWarmup.new()
	warmup.camera = camera
	table.add_child(warmup)
	var keeper := TableEnvironment.new()
	keeper.name = "Ambiente"
	keeper.sun = key_light
	keeper.env = world.environment
	keeper.table = table
	keeper.felt = felt
	table.add_child(keeper)
	return camera


func _process(delta: float) -> void:
	if Fx.quality != _quality:
		_quality = Fx.quality
		apply_quality(_quality)
	_follow_turn(delta)


## A poça de luz do tampo vai devagar para a área de quem joga o turno (e apaga sem partida na mesa).
func _follow_turn(delta: float) -> void:
	if felt == null or table == null:
		return
	var target: Vector4 = pool_for(table.current_state(), table)
	var strength: float = 1.0 if target.z > 0.0 else 0.0
	var k: float = 1.0 - exp(-POOL_SPEED * delta)
	if strength > 0.0:
		# Sem poça acesa, ela já nasce no lugar certo (só a força sobe).
		_pool = target if _pool_strength < 0.02 else _pool.lerp(target, k)
	_pool_strength = lerpf(_pool_strength, strength, k)
	felt.set_shader_parameter("pool", _pool)
	felt.set_shader_parameter("pool_strength", _pool_strength)


## O retângulo da poça (centro x, z, meia largura, meia profundidade) de quem joga o turno; z da meia largura 0 sem ninguém.
static func pool_for(state: Dictionary, view: TableView) -> Vector4:
	var active: Variant = state.get("activePlayer")
	if not (active is int or active is float):
		return Vector4.ZERO
	var frame: Dictionary = view.frame_of(int(active))
	if frame.is_empty():
		return Vector4.ZERO
	var lands: float = float(frame["lands_z"])
	var others: float = float(frame["others_z"])
	var half_width: float = float(frame["width"]) * 0.5 + POOL_MARGIN.x * float(frame["scale"])
	var half_depth: float = absf(lands - others) * 0.5 + POOL_MARGIN.y * float(frame["scale"])
	return Vector4(float(frame["cx"]), (lands + others) * 0.5, half_width, half_depth)


## No "leve" (0) a mesa fica sem sombra e com o brilho mais curto; do médio para cima, tudo ligado.
func apply_quality(level: int) -> void:
	if env:
		env.set_glow_level(5, 0.25 if level >= 1 else 0.0)
	if sun:
		sun.shadow_enabled = level >= 1


## O ambiente: fundo escuro, céu procedural só para o que é metálico ou brilhante refletir, brilho que só pega o que
## emite de verdade (acima de 1) e uma correção de cor discreta.
static func environment() -> Environment:
	var result := Environment.new()
	result.background_mode = Environment.BG_COLOR
	result.background_color = BACKGROUND
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.1, 0.13, 0.24)
	sky_material.sky_horizon_color = Color(0.42, 0.36, 0.3)
	sky_material.ground_bottom_color = Color(0.03, 0.035, 0.05)
	sky_material.ground_horizon_color = Color(0.25, 0.22, 0.2)
	sky_material.sun_angle_max = 20.0
	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	sky.process_mode = Sky.PROCESS_MODE_QUALITY
	result.sky = sky
	result.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	result.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	result.ambient_light_color = AMBIENT
	result.ambient_light_energy = 0.5
	result.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	result.tonemap_exposure = 1.0
	result.tonemap_white = 6.0
	# Brilho: só o que passa de 1 (efeitos, bordas acesas) floresce; níveis largos dão um halo macio, não um borrão.
	result.glow_enabled = true
	result.glow_normalized = true
	result.glow_intensity = 1.0
	result.glow_strength = 1.0
	result.glow_bloom = 0.02
	result.glow_hdr_threshold = 1.4
	result.glow_hdr_scale = 1.6
	result.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	result.set_glow_level(0, 0.0)
	result.set_glow_level(1, 0.6)
	result.set_glow_level(2, 1.0)
	result.set_glow_level(3, 0.8)
	result.set_glow_level(4, 0.5)
	result.set_glow_level(5, 0.25)
	result.set_glow_level(6, 0.0)
	# Sem oclusão de ambiente (SSAO): com as cartas deitadas no tampo ela quase não aparece e custa ~20% do quadro.
	result.adjustment_enabled = true
	result.adjustment_contrast = 1.06
	result.adjustment_saturation = 1.06
	result.adjustment_brightness = 1.0
	return result


## Vinheta: escurece os cantos da tela, por cima da mesa e por baixo da interface (camada -1).
static func vignette() -> CanvasLayer:
	var layer := CanvasLayer.new()
	layer.layer = -1
	layer.name = "Vinheta"
	var rect := ColorRect.new()
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = _vignette()
	rect.material = material
	layer.add_child(rect)
	return layer


static func _vignette() -> Shader:
	if _vignette_shader == null:
		_vignette_shader = Shader.new()
		_vignette_shader.code = """
shader_type canvas_item;
uniform float strength = 0.55;
uniform vec3 tint : source_color = vec3(0.0, 0.01, 0.04);
void fragment() {
	vec2 p = (UV - 0.5) * vec2(1.25, 1.0);
	float v = smoothstep(0.38, 0.95, length(p));
	COLOR = vec4(tint, v * strength);
}
"""
	return _vignette_shader
