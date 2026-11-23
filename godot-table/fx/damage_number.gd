# O número do dano (e da vida ganha): estoura grande com um clarão branco, assenta, sobe num arco curto para o lado e
# some; a cor diz o tipo (combate, mágica na cor dela, veneno, vida) e o tamanho cresce com o golpe.
class_name DamageNumber
extends RefCounted

## A que distância da câmera o número fica: o mesmo tamanho na tela perto ou longe (os oponentes ficam lá no fundo).
const DEPTH := 6.0
const PIXEL := 0.0026
## Quantos pixels o número do jogador sai do retrato para o meio da tela (em cima do retrato, o HUD o cobriria).
const BESIDE_PORTRAIT := 165.0
const COMBAT := Color(1.0, 0.42, 0.22)
const POISON := Color(0.55, 1.0, 0.35)
const LIFE := Color(0.5, 1.0, 0.6)


## A cor do número: combate em laranja-vermelho, veneno em verde ácido, mágica puxando para a cor dela (sempre quente o
## bastante para ler como dano).
static func color_for(event: Dictionary, card_color: Color) -> Color:
	if bool(event.get("infect", false)):
		return POISON
	if bool(event.get("combat", false)):
		return COMBAT
	return card_color.lerp(Color(1.0, 0.3, 0.25), 0.35).lightened(0.15)


## O texto do número ("-3", "3 veneno", "+4").
static func text_for(event: Dictionary, amount: int) -> String:
	if bool(event.get("infect", false)):
		return "%d veneno" % amount
	return "-%d" % amount


## Mostra `text` sobre `target` (uma carta, ou o retrato com `player`); `amount` dá o tamanho e o peso.
static func pop(parent: Node3D, target: Vector3, text: String, color: Color, amount: int, player: bool = false, lethal: bool = false) -> void:
	var camera: Camera3D = parent.get_viewport().get_camera_3d() if parent.is_inside_tree() else null
	if camera == null:
		Fx.float_text(parent, target, text, color, 72)
		return
	var view: Vector2 = camera.get_viewport().get_visible_rect().size
	var screen: Vector2 = camera.unproject_position(target + Vector3(0, 0.15, 0))
	# Para que lado o arco corre: para o meio da tela (no jogador, também sai do retrato para lá).
	var inward: Vector2 = (view * Vector2(0.5, 0.45) - screen)
	var side: float = signf(inward.x) if absf(inward.x) > 40.0 else (1.0 if randf() < 0.5 else -1.0)
	if player:
		screen += inward.normalized() * BESIDE_PORTRAIT
	screen = screen.clamp(Vector2(60, 60), view - Vector2(60, 60))
	var weight: float = clampf(float(amount) / 8.0, 0.0, 1.0)
	var font_size: int = int(lerpf(96.0, 132.0, weight) * (1.1 if lethal else 1.0))
	# O texto inteiro na tela, mesmo no tamanho do estouro (o "-" do "-12" saía pela esquerda).
	var pos: Vector3 = Fx.inside_screen(parent, camera.project_position(screen, DEPTH), text.length() * font_size * PIXEL * 0.62 * 1.3, 24.0)
	var label := Label3D.new()
	label.text = text
	label.font = MomentPieces._font()
	label.font_size = font_size
	label.pixel_size = PIXEL
	label.outline_size = 26
	label.modulate = Color(1, 1, 1, 1)
	label.outline_modulate = Color(color.darkened(0.8), 0.95)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.render_priority = 22
	label.outline_render_priority = 21
	label.position = pos
	label.scale = Vector3.ONE * 0.25
	parent.add_child(label)
	var right: Vector3 = camera.global_basis.x * side
	var up: Vector3 = camera.global_basis.y
	var life: float = lerpf(0.95, 1.25, weight)
	var peak: float = lerpf(1.4, 1.6, weight)
	# Estouro: cresce além do tamanho com o clarão branco, assenta, e a cor entra.
	var pop_tween := label.create_tween()
	pop_tween.tween_property(label, "scale", Vector3.ONE * peak, 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	pop_tween.tween_property(label, "scale", Vector3.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	pop_tween.parallel().tween_property(label, "modulate", Color(color.lightened(0.1), 1.0), 0.09)
	# Arco: sobe e corre para o lado, desacelerando; no fim cai um pouco enquanto some.
	var arc := label.create_tween()
	arc.tween_interval(0.06)
	arc.tween_method(func(t: float) -> void:
		var drift: float = 0.38 * t
		var lift: float = 0.55 * (1.0 - (1.0 - t) * (1.0 - t)) - 0.12 * maxf(0.0, t - 0.7) / 0.3
		label.position = pos + right * drift + up * lift, 0.0, 1.0, life)
	var fade := label.create_tween()
	fade.tween_interval(life * 0.62)
	fade.tween_property(label, "modulate:a", 0.0, life * 0.38).set_ease(Tween.EASE_IN)
	fade.parallel().tween_property(label, "outline_modulate:a", 0.0, life * 0.38).set_ease(Tween.EASE_IN)
	fade.tween_callback(label.queue_free)
