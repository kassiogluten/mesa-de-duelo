# Rastro nas cartas da mesa que voam rápido entre as zonas (da mão para o campo ou a pilha, do grimório para a mão, de
# volta para a mão): uma fita fraca e curta na cor da carta, ou do verso quando ela vem de costas. Só olha onde as cartas
# estão a cada quadro (a física de papel continua dona do voo); os ajustes no tampo e na mão não deixam rastro.
class_name CardTrails
extends Node3D

## A partir desta velocidade (unidades/s) a carta ganha rastro; abaixo de STOP_SPEED ele para de crescer.
const MIN_SPEED := 4.5
const STOP_SPEED := 2.2
## A força da fita (soma luz: fraca de propósito) e quanto ela dura.
const STRENGTH := 0.3
const LIFE := 0.15

var table: TableView
var _last: Dictionary = {}
var _trails: Dictionary = {}


## Liga o rastro nas cartas de `director.table` (filho do diretor, morre com ele).
static func attach(director: Node3D, view: TableView) -> CardTrails:
	var trails := CardTrails.new()
	trails.name = "CardTrails"
	trails.table = view
	director.add_child(trails)
	return trails


func _process(delta: float) -> void:
	if table == null or not is_instance_valid(table) or delta <= 0.0:
		return
	if Fx.quality == 0:
		_last.clear()
		return
	var now: Dictionary = {}
	for key: Variant in table.card_keys():
		var node: CardNode = table.card_node(key)
		if node == null or not node.visible:
			continue
		var pos: Vector3 = node.global_position
		now[key] = pos
		var trail: TrailRibbon = (_trails[key] as WeakRef).get_ref() as TrailRibbon if _trails.has(key) else null
		if trail == null:
			_trails.erase(key)
		if not _last.has(key):
			continue
		var speed: float = pos.distance_to(_last[key]) / delta
		if trail == null and speed > MIN_SPEED and travelling(node) and speed < TrailRibbon.TELEPORT / delta:
			trail = TrailRibbon.card(self, node, tint(node), STRENGTH, LIFE)
			trail.min_speed = STOP_SPEED
			_trails[key] = weakref(trail)
		elif trail and (speed < STOP_SPEED * 0.5 or not travelling(node)):
			trail.emitting = false
			_trails.erase(key)
	_last = now


## A carta está mudando de zona: voo em arco da física de papel, ou a chegada à mão (que não usa o voo de papel). Os
## escorregões no tampo (a arrumação do campo), o virar e a arrumação da mão ficam sem rastro.
static func travelling(node: CardNode) -> bool:
	var flight: Variant = node.get("_flight")
	if flight is PaperPhysics.Flight:
		return (flight as PaperPhysics.Flight).kind == PaperPhysics.Kind.ARC
	return true


## A cor do rastro: a da carta (pelo custo de mana) se ela está de face, senão a do verso, clareada.
static func tint(node: CardNode) -> Color:
	var data: Dictionary = node.data
	if data.has("name") and not bool(data.get("faceDown", false)):
		return Fx.card_color(data)
	var material: ShaderMaterial = CardDressing.material_of(node)
	var sleeve: Variant = material.get_shader_parameter("sleeve_color") if material else null
	return (sleeve as Color).lightened(0.35) if sleeve is Color else Color(0.7, 0.8, 1.0)
