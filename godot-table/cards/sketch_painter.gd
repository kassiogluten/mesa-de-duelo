# Transforma a carta desenhada (CardSketch) em textura: monta os controles numa SubViewport reaproveitada, desenha uma
# vez, copia a imagem e guarda por chave; poucas por quadro, sem esperar nada (a mesa segue enquanto desenha).
class_name SketchPainter
extends Node

## Uma carta desenhada ficou pronta.
signal painted(key: String, texture: Texture2D)

const VIEWPORTS := 3
## Cartas desenhadas guardadas (as mais antigas saem; a imagem de verdade costuma chegar antes).
const MAX_CACHE := 160

var _cache: Dictionary = {}
var _order: PackedStringArray = []
## Esperando a vez: [{key, spec}]; e as chaves pedidas ainda sem textura.
var _queue: Array = []
var _busy: Dictionary = {}
## As SubViewports: {viewport, card, key, stage} (stage 0 livre, 1 montada, 2 desenhando).
var _slots: Array = []


## Sem tela (testes com --headless), não há como desenhar: a carta fica com o nome, como antes.
static func can_paint() -> bool:
	return DisplayServer.get_name() != "headless"


## A textura da carta desenhada, ou null enquanto desenha (painted avisa quando fica pronta).
func texture(key: String, data: Dictionary) -> Texture2D:
	if _cache.has(key):
		return _cache[key]
	if _busy.has(key) or not can_paint():
		return null
	_busy[key] = true
	_queue.append({"key": key, "spec": data})
	set_process(true)
	return null


func _ready() -> void:
	set_process(not _queue.is_empty())


func _process(_delta: float) -> void:
	for slot: Dictionary in _slots:
		match int(slot["stage"]):
			1:
				# Montada no quadro anterior (os controles já se arrumaram): desenha neste.
				(slot["viewport"] as SubViewport).render_target_update_mode = SubViewport.UPDATE_ONCE
				slot["stage"] = 2
			2:
				_collect(slot)
	while not _queue.is_empty():
		var slot: Dictionary = _free_slot()
		if slot.is_empty():
			break
		var job: Dictionary = _queue.pop_front()
		var card: Control = CardSketch.build(job["spec"])
		(slot["viewport"] as SubViewport).add_child(card)
		slot["card"] = card
		slot["key"] = job["key"]
		slot["stage"] = 1
	var idle: bool = _queue.is_empty()
	for slot: Dictionary in _slots:
		if int(slot["stage"]) != 0:
			idle = false
	if idle:
		set_process(false)


func _free_slot() -> Dictionary:
	for slot: Dictionary in _slots:
		if int(slot["stage"]) == 0:
			return slot
	if _slots.size() >= VIEWPORTS:
		return {}
	var viewport := SubViewport.new()
	viewport.size = CardSketch.SIZE
	viewport.disable_3d = true
	viewport.transparent_bg = false
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(viewport)
	var slot: Dictionary = {"viewport": viewport, "card": null, "key": "", "stage": 0}
	_slots.append(slot)
	return slot


## Copia o desenho para uma textura com mipmaps (a carta pequena na mesa fica lisa) e libera a SubViewport.
func _collect(slot: Dictionary) -> void:
	var key: String = slot["key"]
	var image: Image = (slot["viewport"] as SubViewport).get_texture().get_image()
	(slot["card"] as Control).queue_free()
	slot["card"] = null
	slot["stage"] = 0
	_busy.erase(key)
	if image == null or image.is_empty():
		return
	image.generate_mipmaps()
	var tex := ImageTexture.create_from_image(image)
	_cache[key] = tex
	_order.append(key)
	while _order.size() > MAX_CACHE:
		_cache.erase(_order[0])
		_order.remove_at(0)
	painted.emit(key, tex)
