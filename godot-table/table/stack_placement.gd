# A pilha na mesa 3D: cada item é uma carta de pé, de frente para a câmera, no vão do painel da pilha (o topo na frente e as
# de baixo aparecendo por trás), e de onde cada item novo sai (a mão, a mão do oponente, a permanente). Parte da TableView.
class_name StackPlacement
extends RefCounted

## Distância da câmera até a carta do topo da pilha (as de baixo ficam um pouco atrás).
const STACK_DEPTH := 7.0

var view: TableView
## As cartas que estão na pilha flutuando no painel: sem sombra no tampo (a sombra volta quando saem da pilha).
var _floating_keys: Dictionary = {}


func _init(table: TableView) -> void:
	view = table


## A mágica da sua mão voa até lá em arco; a do oponente sai da mão dele, virando; a habilidade e o gatilho saem da
## permanente que os gerou.
func place(stack: Array, you: int, seen: Dictionary, names: PackedStringArray) -> void:
	var floating: bool = view.stack_slot.call(0).size.y > 0.0
	var now: Dictionary = {}
	for i: int in stack.size():
		var item: Dictionary = stack[i]
		var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
		var spell: bool = Txt.of(item.get("kind", "spell")) == "spell" and source.has("id")
		var key: Variant = int(source["id"]) if spell else "stack:%d" % int(item["id"])
		var controller: int = int(item.get("controller", you))
		var card: Dictionary = source.duplicate()
		card["stackId"] = int(item["id"])
		var t: Transform3D = transform_at(i, stack.size())
		var fresh: bool = view.card_node(key) == null
		var from: Variant = _origin(source, controller, spell) if fresh else null
		view.put_card(key, card, "stack", from if from is Transform3D else t, view.sleeve_of(controller), seen, names)
		var node: CardNode = view.card_node(key)
		if from is Transform3D:
			node.move_to(t, true)
		if floating:
			now[key] = true
			cast_shadow(node, false)
	for key: Variant in _floating_keys:
		if not now.has(key) and view.card_node(key) != null:
			cast_shadow(view.card_node(key), true)
	_floating_keys = now


static func cast_shadow(node: Node3D, on: bool) -> void:
	for child: Node in node.find_children("*", "GeometryInstance3D", true, false):
		(child as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## O lugar da camada `depth` da pilha: no vão do painel, ou (sem painel) o monte inclinado no tampo, à direita.
func transform_at(depth: int, count: int) -> Transform3D:
	var rect: Rect2 = view.stack_slot.call(depth)
	if rect.size.y <= 0.0:
		var d: int = count - 1 - depth
		return Transform3D(Basis(Vector3.RIGHT, deg_to_rad(28.0)), Vector3(4.6 + d * 0.18, 0.9 + d * 0.05, -0.2 + d * 0.25))
	# As camadas além da terceira ficam exatamente atrás dela (o painel mostra até três por trás do topo).
	var camera: Camera3D = view.camera
	var distance: float = STACK_DEPTH + 0.12 * depth
	var pos: Vector3 = camera.project_position(rect.get_center(), distance)
	var view_h: float = camera.get_viewport().get_visible_rect().size.y
	var pixels_per_unit: float = view_h / (2.0 * distance * tan(deg_to_rad(camera.fov) / 2.0))
	var s: float = rect.size.y / pixels_per_unit / CardNode.SIZE.y
	return Transform3D(view.hand_basis(pos).scaled(Vector3(s, s, s)), pos)


## De onde vem um item novo da pilha: a habilidade da permanente que a gerou, a mágica do oponente da mão dele (de
## costas); null para nascer já no lugar (a sua mágica já existe: voa da sua mão).
func _origin(source: Dictionary, controller: int, spell: bool) -> Variant:
	if not spell and source.has("id") and view.card_node(int(source["id"])) != null:
		var origin: CardNode = view.card_node(int(source["id"]))
		return Transform3D(origin.global_transform.basis.orthonormalized().scaled(Vector3(0.6, 0.6, 0.6)), origin.global_position + Vector3(0, 0.2, 0))
	var frame: Dictionary = view.frame_of(controller)
	if frame.is_empty():
		return null
	var scale: float = frame["scale"]
	var at: Vector3 = HandPlacement.HAND_CENTER if int(frame["side"]) > 0 else frame["hand"]
	return Transform3D(Basis(Vector3.FORWARD, PI).scaled(Vector3(scale, scale, scale)), at + Vector3(0, 0.1, 0))
