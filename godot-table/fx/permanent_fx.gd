# Efeitos numa permanente: a cúpula do ward (sobe, segura ou trinca), a aura ou o equipamento que se prende, a mudança
# de controle, a carta que transforma (gira e troca de face), as rachaduras que fecham de quem sobreviveu, os dois cortes do
# golpe duplo e a mana que voa dos terrenos para a mágica conjurada.
class_name PermanentFx
extends RefCounted

const CONTROL := Color(0.72, 0.42, 1.0)


## A cúpula do ward sobre a carta em `pos` ("rise", "hold" ou "break"): fica em fx/shield_fx.gd.
static func ward(parent: Node3D, pos: Vector3, outcome: String, speed: float = 1.0) -> void:
	ShieldFx.ward(parent, pos, outcome, speed)


## A aura ou o equipamento se prende: uma corrente de luz corre dela até a carta (ou o jogador), e o contorno da carta
## que a recebe acende.
static func attach(parent: Node3D, from: Vector3, to: Vector3, color: Color, speed: float = 1.0, host: CardNode = null) -> void:
	var links: int = 9
	var lift: float = clampf(from.distance_to(to) * 0.3, 0.3, 1.2)
	for i: int in links:
		var t: float = (i + 1.0) / (links + 1.0)
		var at: Vector3 = from.lerp(to, t) + Vector3(0, sin(t * PI) * lift + 0.1, 0)
		MomentPieces.after(parent, t * 0.28 / speed, func() -> void:
			Fx.burst(parent, at, color.lerp(Color.WHITE, 0.4), 10, 0.4, 0.5, 0.14)
			Fx.burst(parent, at, Color(1.0, 0.9, 0.6), 4, 0.15, 0.35, 0.2))
	MomentPieces.after(parent, 0.3 / speed, func() -> void:
		if host:
			CardGlow.trace(host, color.lerp(Color(1.0, 0.85, 0.45), 0.4), 0.45, speed)
		Fx.burst(parent, to + Vector3(0, 0.1, 0), color, 26, 1.2, 0.5, 0.07))


## Mudou de controle: um rastro roxo do lugar antigo até o novo, um redemoinho e o contorno da carta acendendo.
static func control(parent: Node3D, from: Variant, to: Vector3, speed: float = 1.0, node: CardNode = null) -> void:
	if from is Vector3:
		Fx.bolt(parent, from as Vector3, to, CONTROL, 0.4 / speed)
	MomentPieces.after(parent, 0.3 / speed, func() -> void:
		MomentPieces.spiral(parent, to, CONTROL, 14, 0.9, 0.7 / speed)
		CardGlow.pulse(node, CONTROL, 0.06, speed)
		Fx.float_text(parent, to + Vector3(0, 0.2, 0), "Mudou de lado", CONTROL.lightened(0.35), 54))


## A carta transforma: sobe um pouco, gira de lado mostrando a face antiga, troca no meio do giro e volta com a nova;
## `old_tex` é a imagem de antes (a mesa já pôs a nova). Na desvirada (metamorfose), o texto muda.
static func flip(parent: Node3D, node: CardNode, old_tex: Texture2D, face_up: bool, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node):
		return
	var visual: Node3D = CardDressing.visual_of(node)
	var material: ShaderMaterial = CardDressing.material_of(node)
	var pos: Vector3 = node.global_position
	var new_tex: Variant = material.get_shader_parameter("front_tex") if material else null
	if material and old_tex:
		material.set_shader_parameter("front_tex", old_tex)
		material.set_shader_parameter("has_front", true)
	var half: float = 0.22 / speed
	var tween := visual.create_tween()
	tween.tween_property(visual, "position:y", 0.35, half).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "rotation:z", PI / 2.0, half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		if material:
			# Se a imagem nova chegou durante o giro, ela já está no material: vale a mais nova.
			var current: Variant = material.get_shader_parameter("front_tex")
			var face: Variant = current if current != old_tex else new_tex
			material.set_shader_parameter("front_tex", face)
			material.set_shader_parameter("has_front", face != null)
		visual.rotation.z = -PI / 2.0
		Fx.burst(parent, pos + Vector3(0, 0.35, 0), Color(1.0, 0.9, 0.6), 40, 1.8, 0.6, 0.08)
		Fx.light(parent, pos, Color(1.0, 0.85, 0.6), 4.0, 4.0, 0.5 / speed))
	tween.tween_property(visual, "rotation:z", 0.0, half * 1.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "position:y", 0.0, half * 1.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void:
		CardGlow.pulse(node, Color(1.0, 0.85, 0.5), 0.06, speed)
		node.flash_color(Color(1.0, 0.9, 0.7), 0.4)
		Fx.float_text(parent, pos + Vector3(0, 0.2, 0), "Desvirada" if face_up else "Transformou", Color(1.0, 0.9, 0.65), 54))


## Sobreviveu (indestrutível ou regenerada): as rachaduras que fecham ficam em fx/shield_fx.gd.
static func survive(parent: Node3D, node: CardNode, regenerated: bool, speed: float = 1.0) -> void:
	ShieldFx.survive(parent, node, regenerated, speed)


## Golpe duplo: no primeiro golpe um corte; no segundo, outro cruzando, e o "Golpe duplo".
static func double_strike(parent: Node3D, at: Vector3, second: bool) -> void:
	var color := Color(1.0, 0.78, 0.4)
	MomentPieces.slash(parent, at + Vector3(0, 0.3, 0), color, -0.65 if second else 0.65, 1.5, 0.22, 0.0)
	if second:
		MomentPieces.slash(parent, at + Vector3(0, 0.3, 0), color.lightened(0.3), 0.65, 1.5, 0.18, 0.0)
		Fx.float_text(parent, at + Vector3(0, 0.55, 0), "Golpe duplo", color.lightened(0.2), 56, 0.9)


## A mana dos terrenos virados voa até a mágica: uma esfera na cor de cada terreno, uma depois da outra.
static func mana(parent: Node3D, sources: Array, to: Vector3, speed: float = 1.0) -> float:
	var gap: float = minf(0.07, 0.4 / maxf(sources.size(), 1))
	var i: int = 0
	for raw: Variant in sources:
		var source: Dictionary = raw
		var from: Vector3 = source["at"]
		var color: Color = source["color"]
		var delay: float = i * gap / speed
		MomentPieces.after(parent, delay, func() -> void:
			Fx.burst(parent, from + Vector3(0, 0.1, 0), color, 10, 0.6, 0.35, 0.07)
			Fx.bolt(parent, from + Vector3(0, 0.1, 0), to, color, 0.42 / speed, func() -> void:
				Fx.burst(parent, to, color.lerp(Color.WHITE, 0.3), 14, 0.9, 0.35, 0.07), 0.5))
		i += 1
	return (i * gap + 0.42) / speed
