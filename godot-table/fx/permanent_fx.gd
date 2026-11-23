# Efeitos numa permanente: a cúpula do ward (sobe, segura ou trinca), a corrente de luz da aura ou do equipamento que se
# prende, o raio da mudança de controle, a carta que transforma (gira e troca de face), as rachaduras que fecham de quem
# sobreviveu, os dois cortes do golpe duplo e as gotas de mana que voam dos terrenos para a mágica conjurada.
class_name PermanentFx
extends RefCounted

const CONTROL := Color(0.72, 0.42, 1.0)


## A cúpula do ward sobre a carta em `pos` ("rise", "hold" ou "break"): fica em fx/shield_fx.gd.
static func ward(parent: Node3D, pos: Vector3, outcome: String, speed: float = 1.0) -> void:
	ShieldFx.ward(parent, pos, outcome, speed)


## A aura ou o equipamento se prende: uma corrente de elos de luz se estende dela até a carta (ou o jogador), um pulso
## corre pela corrente e o contorno da carta que a recebe acende quando a ponta chega.
static func attach(parent: Node3D, from: Vector3, to: Vector3, color: Color, speed: float = 1.0, host: CardNode = null) -> void:
	var metal: Color = color.lerp(Color(1.0, 0.86, 0.5), 0.45)
	var lift := Vector3(0, 0.08, 0)
	var ref: WeakRef = weakref(host) if host else null
	EnergyBeam.chain(parent, from + lift, to + lift, metal, 0.28 / speed, func() -> void:
		var node: CardNode = ref.get_ref() as CardNode if ref else null
		if node:
			CardGlow.trace(node, color.lerp(Color(1.0, 0.85, 0.45), 0.4), 0.45, speed)
		ManaOrb.flash(parent, to + lift, metal, 0.9, 0.22)
		Fx.burst(parent, to + Vector3(0, 0.1, 0), metal, 18, 0.9, 0.45, 0.05))


## Mudou de controle: um raio roxo corre do lugar antigo até o novo, um redemoinho e o contorno da carta acendendo. O
## novo é o destino do voo da carta (`node`), que ainda está saindo do lugar antigo quando o efeito começa.
static func control(parent: Node3D, from: Variant, to: Vector3, speed: float = 1.0, node: CardNode = null) -> void:
	if node and is_instance_valid(node) and node.get_parent() is Node3D:
		to = (node.get_parent() as Node3D).global_transform * node.target_transform().origin
	if from is Vector3:
		var start: Vector3 = (from as Vector3) + Vector3(0, 0.12, 0)
		ManaOrb.flash(parent, start, CONTROL, 0.9, 0.22)
		EnergyBeam.bolt(parent, start, to + Vector3(0, 0.12, 0), CONTROL, 0.3 / speed, 0.14 / speed)
	var ref: WeakRef = weakref(node) if node else null
	MomentPieces.after(parent, 0.3 / speed, func() -> void:
		ManaOrb.flash(parent, to + Vector3(0, 0.12, 0), CONTROL, 1.2, 0.26)
		MomentPieces.spiral(parent, to, CONTROL, 14, 0.9, 0.7 / speed)
		CardGlow.pulse(ref.get_ref() as CardNode if ref else null, CONTROL, 0.06, speed)
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


## A mana dos terrenos virados voa até a mágica: uma gota na cor de cada terreno (o núcleo do projétil em pequeno, com um
## cometa curto), uma depois da outra; cada uma se funde na carta com um clarão pequeno, e a última acende a luz.
static func mana(parent: Node3D, sources: Array, to: Vector3, speed: float = 1.0) -> float:
	var gap: float = minf(0.07, 0.4 / maxf(sources.size(), 1))
	var flight: float = 0.42 / speed
	var i: int = 0
	for raw: Variant in sources:
		var source: Dictionary = raw
		var from: Vector3 = (source["at"] as Vector3) + Vector3(0, 0.1, 0)
		var color: Color = source["color"]
		var last: bool = i == sources.size() - 1
		MomentPieces.after(parent, i * gap / speed, func() -> void:
			ManaOrb.flash(parent, from, color, 0.5, 0.16)
			ManaOrb.launch(parent, from, to, color, flight, func() -> void:
				if last:
					ManaOrb.flash(parent, to, color.lerp(Color.WHITE, 0.25), 1.5, 0.3)
					Fx.light(parent, to, color, 2.2, 3.0, 0.3 / speed)))
		i += 1
	return (i * gap + 0.42) / speed + ManaOrb.POP_TIME
