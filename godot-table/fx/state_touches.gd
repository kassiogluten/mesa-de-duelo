# O toque de virar e desvirar: na etapa de desvirar, uma faixa de luz fraca atravessa a face da permanente que se
# endireita; virar para mana (ou para uma habilidade) acende a borda de leve e espirra um tico de faíscas, sem bola de
# mana (a gota que voa até a reserva é da reserva no HUD).
class_name TapFx
extends RefCounted

## A luz da faixa de desvirar: um branco morno, quase sem cor.
const UNTAP := Color(1.0, 0.95, 0.82)
## Poeira das viradas que não dão mana (habilidade com {T}).
const NEUTRAL := Color(0.86, 0.84, 0.78)
## A carta gira em ~0,32 s: a faixa corre enquanto ela termina de se endireitar, a poeira quando ela encosta de lado.
const SWEEP_DELAY := 0.12
const SWEEP_TIME := 0.5
const CLICK_DELAY := 0.24


## Desvirou na etapa de desvirar: a faixa de luz na diagonal, presa na carta (gira junto com ela).
static func untap_sweep(node: CardNode, delay: float = 0.0) -> void:
	if not CardGlow._usable(node) or Fx.quality == 0:
		return
	var ref: WeakRef = weakref(node)
	node.get_tree().create_timer(SWEEP_DELAY + delay).timeout.connect(func() -> void:
		var card: CardNode = ref.get_ref() as CardNode
		if card == null or card.is_queued_for_deletion() or not card.is_inside_tree():
			return
		var top: ShaderMaterial = CardGlow._layer(card, UNTAP, 0.005, SWEEP_TIME + 0.05)
		top.set_shader_parameter("sweep_alpha", 0.75)
		var tween := CardGlow._tween_of(top)
		tween.tween_method(func(v: float) -> void: top.set_shader_parameter("sweep", v), -0.15, 1.15, SWEEP_TIME).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline_alpha", v), 0.35, 0.0, SWEEP_TIME * 0.8)
		top.set_shader_parameter("outline", 0.006))


## Virou: quando a carta encosta deitada, a borda acende fraco na cor da mana que ela dá (ou neutra) e um tico de
## faíscas curtas espirra rente ao feltro, como um clique.
static func tap_click(parent: Node3D, node: CardNode, color: Color, strength: float = 1.0) -> void:
	if not CardGlow._usable(node) or Fx.quality == 0:
		return
	var ref: WeakRef = weakref(node)
	var holder: WeakRef = weakref(parent)
	node.get_tree().create_timer(CLICK_DELAY).timeout.connect(func() -> void:
		var card: CardNode = ref.get_ref() as CardNode
		var at: Node3D = holder.get_ref() as Node3D
		if card == null or at == null or card.is_queued_for_deletion() or not card.is_inside_tree():
			return
		var edge: ShaderMaterial = CardGlow._layer(card, color, 0.004, 0.32)
		var tween := CardGlow._tween_of(edge)
		tween.tween_method(func(v: float) -> void: edge.set_shader_parameter("outline", v), 0.0, 0.012, 0.25).set_ease(Tween.EASE_OUT)
		tween.tween_method(func(v: float) -> void: edge.set_shader_parameter("outline_alpha", v), 0.45 * strength, 0.0, 0.28).set_ease(Tween.EASE_IN)
		var spot: Vector3 = card.global_position
		Fx.burst(at, spot + Vector3(0, 0.02, 0), color, int(5 * strength), 0.55, 0.28, 0.028, -2.5))


## A cor da poeira de uma carta virada: a da mana que ela dá (a primeira), ou a neutra.
static func click_color(card: Dictionary) -> Color:
	var colors: String = ManaPoolFx.produces(card)
	return ManaPoolFx.tint(colors.substr(0, 1)) if colors.length() > 0 else NEUTRAL
