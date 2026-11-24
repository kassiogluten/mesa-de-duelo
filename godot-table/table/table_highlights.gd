# Os estados de destaque das cartas da mesa, iguais em toda zona: pode usar (borda azul e halo curto que respira), alvo
# válido (âmbar que respira), selecionada (contorno dourado e a carta sobe), atacando (vermelho), terreno virado para mana
# (azul); o resto escurece quando há uma escolha. O mouse sobre uma carta que responde acende mais, sobe um pouco e troca
# o cursor. Parte da TableView.
class_name TableHighlights
extends RefCounted

## Cores de cada estado (as janelas e o HUD podem usar as mesmas, para a mesa toda falar a mesma língua).
const SELECTED := Color(1.0, 0.8, 0.28)
const TARGET := Color(1.0, 0.84, 0.4)
const ACTIONABLE := Color(0.35, 0.78, 1.0)
const ATTACKING := Color(1.0, 0.3, 0.2)
const BLOCKING := Color(0.4, 0.72, 1.0)
const UNTAPPABLE := Color(0.3, 0.55, 1.0)
const MANA_ONLY := Color(0.45, 0.75, 1.0)
const FOCUS := Color(1.0, 0.95, 0.75)

## Força do brilho de cada estado e com o mouse em cima.
const STRENGTH := {
	"selected": 1.35, "target": 0.85, "attacking": 1.1, "untappable": 1.0, "actionable": 0.7, "mana": 0.5, "blocking": 0.7,
}
const HOVER_STRENGTH := {
	"selected": 1.6, "target": 1.65, "attacking": 1.35, "untappable": 1.3, "actionable": 0.88, "mana": 0.75, "blocking": 0.95,
}
## Quanto a carta selecionada (ou o alvo e a que dá para usar, sob o mouse) sai do lugar: no campo vem para a câmera; na
## mão sobe na tela (a da mão sob o mouse cresce com o CardNode.set_lifted).
const FIELD_RAISE := Vector3(0, 0.1, 0)
const FIELD_HOVER_RAISE := Vector3(0, 0.05, 0)
const HAND_RAISE := Vector3(0, 0.04, -0.16)
const DIM_OTHERS := 0.45

var view: TableView
## chave da carta → o estado dela agora ("selected", "target", ...; ausente sem destaque).
var _role: Dictionary = {}
## A carta escolhida pelo Tab (a seta mira nela e o Enter a escolhe); null sem foco.
var _focus: Variant = null
## O alvo em que a ponta da seta que segue o mouse grudou (acende como se o mouse estivesse em cima); null sem nenhum.
var _snapped: Variant = null
var _hovered: CardNode


func _init(table: TableView) -> void:
	view = table


# — Regras (sem cena, para os testes) —

## O estado de uma carta com os papéis do prompt: o mais forte vence (selecionada, alvo, atacando, mana, usar, bloqueando).
## `roles`: {selected, selectable, attacking, untappable, actionable, mana_only, blocking, stacks} (listas de ids; stacks
## são ids de itens da pilha, comparados com `stack_id`).
static func role_of(id: int, stack_id: int, roles: Dictionary) -> String:
	if stack_id >= 0 and (roles.get("stacks", []) as Array).has(stack_id):
		return "target"
	if id < 0:
		return ""
	for pair: Array in [["selected", "selected"], ["selectable", "target"], ["attacking", "attacking"], ["untappable", "untappable"],
			["mana_only", "mana"], ["actionable", "actionable"], ["blocking", "blocking"]]:
		if (roles.get(pair[0], []) as Array).has(id):
			return pair[1]
	return ""


static func color_of(role: String) -> Color:
	match role:
		"selected": return SELECTED
		"target": return TARGET
		"attacking": return ATTACKING
		"untappable": return UNTAPPABLE
		"actionable": return ACTIONABLE
		"mana": return MANA_ONLY
		"blocking": return BLOCKING
	return Color.BLACK


## Uma carta com esse estado responde ao clique (o mouse em cima troca o cursor pela mãozinha).
static func clickable(role: String) -> bool:
	return role in ["selected", "target", "attacking", "untappable", "actionable", "mana"]


# — Na mesa —

## Aplica os papéis do prompt a todas as cartas. `dim_others`: escurece no campo o que não é escolha agora.
func apply(roles: Dictionary, dim_others: bool) -> void:
	var next: Dictionary = {}
	for key: Variant in view.card_keys():
		var node: CardNode = view.card_node(key)
		if node == null:
			continue
		var id: int = key if key is int else -1
		var role: String = role_of(id, int(node.data.get("stackId", -1)), roles)
		if role != "":
			next[key] = role
		var zone: String = view.zone_of(key)
		var dim: bool = dim_others and role == "" and zone == "battlefield"
		if zone != "hand":
			node.fade_dim(DIM_OTHERS if dim else 0.0)
		_show(key, node, role)
	_role = next
	if _focus != null and not _role.has(_focus):
		_focus = null


## O destaque de uma carta pelo estado dela, com o mouse (ou o foco do Tab) em cima ou não.
func _show(key: Variant, node: CardNode, role: String) -> void:
	var over: bool = (node == _hovered and node.hovered) or TargetSnap.same(key, _focus) or TargetSnap.same(key, _snapped)
	var zone: String = view.zone_of(key)
	if role == "":
		node.fade_glow(Color.BLACK, 0.0)
		node.set_raise(Vector3.ZERO)
		return
	var strength: float = float((HOVER_STRENGTH if over else STRENGTH)[role])
	var color: Color = FOCUS.lerp(color_of(role), 0.35) if TargetSnap.same(key, _focus) else color_of(role)
	node.fade_glow(color, strength)
	# Dá para usar (ou tirar mana): a borda azul firme com o halo curto que respira; os outros estados, a borda que respira
	# com o brilho correndo.
	var material: ShaderMaterial = CardDressing.material_of(node)
	if material:
		material.set_shader_parameter("glow_style", 1 if role == "actionable" or role == "mana" else 0)
	var raise := Vector3.ZERO
	if role == "selected":
		raise = HAND_RAISE if zone == "hand" else FIELD_RAISE
	elif over and (role == "target" or role == "actionable" or role == "mana") and zone != "hand":
		raise = FIELD_HOVER_RAISE
	node.set_raise(raise)


## O mouse entrou ou saiu de uma carta: a que responde ao clique acende mais (o cursor é da TableInteraction).
func hover(node: CardNode, on: bool) -> void:
	if on:
		_hovered = node
	elif _hovered == node:
		_hovered = null
	var key: Variant = view.key_of(node)
	if key != null:
		_show(key, node, Txt.of(_role.get(key, "")))


## O estado de uma carta agora ("" sem destaque).
func role(key: Variant) -> String:
	return Txt.of(_role.get(key, ""))


## O alvo em que a seta viva grudou; null tira.
func set_snapped(key: Variant) -> void:
	if TargetSnap.same(key, _snapped) or (key == null and _snapped == null):
		return
	var before: Variant = _snapped
	_snapped = key
	for k: Variant in [before, key]:
		if k != null and view.card_node(k) != null:
			_show(k, view.card_node(k), role(k))


## O foco do Tab (a carta que a seta mira e o Enter escolhe); null tira.
func set_focus(key: Variant) -> void:
	if TargetSnap.same(key, _focus):
		return
	var before: Variant = _focus
	_focus = key
	for k: Variant in [before, key]:
		if k != null and view.card_node(k) != null:
			_show(k, view.card_node(k), role(k))
