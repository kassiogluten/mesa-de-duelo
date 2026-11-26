# O toque de virar e desvirar: na etapa de desvirar, uma faixa de luz fraca atravessa a face da permanente que se
# endireita; virar para mana (ou para uma habilidade) acende a borda de leve e espirra um tico de faíscas, sem bola de
# mana (a gota que voa até a reserva é da reserva no HUD). Virar e desvirar soam como papel deslizando no feltro.
class_name TapFx
extends RefCounted

## A luz da faixa de desvirar: um branco morno, quase sem cor.
const UNTAP := Color(1.0, 0.95, 0.82)
## Poeira das viradas que não dão mana (habilidade com {T}).
const NEUTRAL := Color(0.86, 0.84, 0.78)
## A carta gira em PaperPhysics.TURN_TIME: a faixa corre enquanto ela termina de se endireitar, a poeira quando ela
## encosta de lado (aos 80% do giro, o touch_time do TURN).
const SWEEP_DELAY := PaperPhysics.TURN_TIME * 0.4
const SWEEP_TIME := 0.5
const CLICK_DELAY := PaperPhysics.TURN_TIME * 0.8
## O som de virar: o arrasto sobe até o encosto, que fica a SOUND_TOUCH do começo do arquivo; ele toca para o encosto
## cair junto com o da carta. Baixo (é um detalhe), e no máximo SOUND_MAX de uma vez quando várias viram juntas para
## pagar (cada uma um pouco depois da outra, para não somarem num som só mais alto).
const SOUND_TOUCH := 0.17
const SOUND_GAIN := 0.42
const SOUND_MAX := 3
const SOUND_STAGGER := 0.035
## Desvirar: um som só para o lote, um pouco mais grave.
const UNTAP_PITCH := 0.88


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


## O som de virar (`untap` = false) ou de desvirar as cartas `nodes` (CardNode), no ponto da mesa delas. Virar: um
## por carta, até SOUND_MAX; desvirar: um só, no meio do lote.
static func turn_sound(sounds: Sounds, nodes: Array, untap: bool) -> void:
	if sounds == null or nodes.is_empty() or not sounds.is_inside_tree():
		return
	var delay: float = maxf(0.0, CLICK_DELAY - SOUND_TOUCH)
	var spots: Array = []
	if untap:
		var sum := Vector3.ZERO
		for node: Variant in nodes:
			sum += (node as CardNode).target_transform().origin
		spots.append(sum / nodes.size())
	else:
		for i: int in mini(nodes.size(), SOUND_MAX):
			spots.append((nodes[i] as CardNode).target_transform().origin)
	var ref: WeakRef = weakref(sounds)
	for i: int in spots.size():
		var at: Vector3 = spots[i]
		var gain: float = SOUND_GAIN * (1.0 if i == 0 else 0.7)
		sounds.get_tree().create_timer(delay + i * SOUND_STAGGER).timeout.connect(func() -> void:
			var s: Sounds = ref.get_ref() as Sounds
			if s != null and s.is_inside_tree():
				s.play("tap", at, UNTAP_PITCH if untap else 1.0, gain))


## A cor da poeira de uma carta virada: a da mana que ela dá (a primeira), ou a neutra.
static func click_color(card: Dictionary) -> Color:
	var colors: String = ManaPoolFx.produces(card)
	return ManaPoolFx.tint(colors.substr(0, 1)) if colors.length() > 0 else NEUTRAL
