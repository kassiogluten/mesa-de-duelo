# Desenha o feltro do tampo numa textura uma vez só (a primeira mesa da abertura) e a entrega ao tampo, que passa a
# ler a textura em vez de calcular o feltro a cada pixel e a cada quadro (o que custava um terço do quadro numa placa
# integrada). As partidas seguintes reaproveitam a mesma textura.
class_name FeltBake
extends Node

const SHADER := preload("res://table/felt_bake.gdshader")
## Tamanho da textura: o tampo tem 30 × 18 unidades, então cada pixel cobre ~0,012 (as fibras têm ~0,05).
const SIZE := Vector2i(2560, 1536)

## A textura pronta, guardada para as próximas mesas.
static var cached: Texture2D

## O material do tampo (table/table_top.gdshader) que recebe a textura.
var material: ShaderMaterial


func _ready() -> void:
	if cached == null and DisplayServer.get_name() != "headless":
		await _bake()
	if cached != null and material != null:
		material.set_shader_parameter("felt_map", cached)
		material.set_shader_parameter("felt_baked", true)
	queue_free()


## Desenha o feltro num viewport fora da tela, lê a imagem de volta, gera as reduções (para o feltro longe não
## cintilar) e guarda.
func _bake() -> void:
	var viewport := SubViewport.new()
	viewport.size = SIZE
	viewport.disable_3d = true
	viewport.transparent_bg = false
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	var rect := ColorRect.new()
	rect.size = Vector2(SIZE)
	var paint := ShaderMaterial.new()
	paint.shader = SHADER
	rect.material = paint
	viewport.add_child(rect)
	add_child(viewport)
	# O viewport desenha no quadro seguinte ao de entrar na árvore.
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var image: Image = viewport.get_texture().get_image()
	viewport.queue_free()
	if image == null or image.is_empty():
		return
	image.convert(Image.FORMAT_RGB8)
	image.generate_mipmaps()
	cached = ImageTexture.create_from_image(image)
