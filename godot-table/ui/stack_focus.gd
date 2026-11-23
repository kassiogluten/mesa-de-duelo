# O item da pilha sob o mouse (na lista do painel) aceso na mesa 3D: a luz corre pela borda da carta dele, os alvos
# pulsam e setas próprias saem da carta até cada alvo (cartas e retratos), enquanto o mouse fica no item.
class_name StackFocus
extends Node

## A cada quanto tempo a luz volta a correr pela carta e os alvos pulsam.
const BEAT := 0.75

var table: TableView
var _item: Dictionary = {}
var _arrows: Arrows
var _beat: float = 0.0


func _exit_tree() -> void:
	if is_instance_valid(_arrows):
		_arrows.queue_free()


## Acende um item ({} apaga).
func focus(item: Dictionary) -> void:
	if item.is_empty():
		_item = {}
		if is_instance_valid(_arrows):
			_arrows.arrows = []
		return
	if int(item.get("id", -1)) == int(_item.get("id", -2)):
		return
	_item = item
	_beat = 0.0


## O item aceso agora ({} sem nenhum).
func current() -> Dictionary:
	return _item


## A chave da carta 3D de um item da pilha na mesa: a mágica é a própria carta; habilidade e gatilho, "stack:<id>".
static func card_key(item: Dictionary) -> Variant:
	var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
	if Txt.of(item.get("kind", "spell")) == "spell" and source.has("id"):
		return int(source["id"])
	return "stack:%d" % int(item.get("id", -1))


## As pontas dos alvos do item: os ids das cartas e "player:<id>".
static func target_keys(item: Dictionary) -> Array:
	var targets: Dictionary = item.get("targets", {}) if item.get("targets") is Dictionary else {}
	var out: Array = []
	for id: Variant in targets.get("cards", []):
		out.append(int(id))
	for id: Variant in targets.get("players", []):
		out.append("player:%d" % int(id))
	return out


func _process(delta: float) -> void:
	if table == null or not is_instance_valid(table) or _item.is_empty():
		return
	if not is_instance_valid(_arrows):
		_arrows = Arrows.new()
		_arrows.name = "StackFocusArrows"
		table.add_child(_arrows)
	var color: Color = StackStyle.item_color(_item).lightened(0.25)
	var from: Variant = table.anchor(card_key(_item))
	var drawn: Array = []
	for key: Variant in target_keys(_item):
		var to: Variant = table.anchor(key)
		if from is Vector3 and to is Vector3:
			drawn.append({"from": from, "to": to, "color": color, "live": false})
	_arrows.arrows = drawn
	_beat -= delta
	if _beat > 0.0:
		return
	_beat = BEAT
	var node: CardNode = table.card_node(card_key(_item))
	if node != null:
		CardGlow.trace(node, color, 0.6)
	for key: Variant in target_keys(_item):
		var target: CardNode = table.card_node(key) if key is int else null
		if target != null:
			CardGlow.pulse(target, color, 0.06)
