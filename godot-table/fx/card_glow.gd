# Brilhos no formato da carta (contorno que se abre, faixa de luz na face, luz correndo pela borda), no lugar dos anéis redondos.
class_name CardGlow
extends RefCounted

const SHADER := preload("res://fx/card_glow.gdshader")
## Margem da malha em volta da carta, para o contorno ter onde se abrir.
const PAD := 0.3


## Entrada no campo: o contorno se abre a partir da borda, uma faixa de luz atravessa a face e um halo acende embaixo.
## Na lendária, a luz também corre pela borda, em dourado.
static func entered(node: CardNode, color: Color, legendary: bool = false, speed: float = 1.0) -> void:
	if not _usable(node):
		return
	var top: ShaderMaterial = _layer(node, color, 0.004, 0.8 / speed)
	var tween := _tween_of(top)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline", v), 0.0, 0.05, 0.55 / speed).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline_alpha", v), 1.0, 0.0, 0.6 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("sweep", v), -0.15, 1.15, 0.5 / speed).set_delay(0.06 / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	top.set_shader_parameter("sweep_alpha", 1.0)
	var below: ShaderMaterial = _layer(node, color, -CardNode.THICKNESS - 0.004, 0.7 / speed)
	_tween_of(below).tween_method(func(v: float) -> void: below.set_shader_parameter("under", v), 1.0, 0.0, 0.7 / speed).set_ease(Tween.EASE_IN)
	if legendary:
		trace(node, Hud.GOLD, 0.7, speed)


## Habilidade, gatilho ou mágica na pilha: duas luzes dão a volta na borda da carta e se apagam.
static func trace(node: CardNode, color: Color, duration: float = 0.5, speed: float = 1.0) -> void:
	if not _usable(node):
		return
	var top: ShaderMaterial = _layer(node, color, 0.005, duration / speed + 0.05)
	var tween := _tween_of(top)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("trace", v), 0.0, 1.0, duration / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("trace_alpha", v), 1.2, 0.0, duration / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


## Uma faixa de luz atravessa a face da carta na diagonal (a carta que se fecha inteira de novo, a vitória).
static func sweep(node: CardNode, color: Color, duration: float = 0.5, speed: float = 1.0) -> void:
	if not _usable(node):
		return
	var top: ShaderMaterial = _layer(node, color, 0.005, duration / speed + 0.05)
	top.set_shader_parameter("sweep_alpha", 1.3)
	_tween_of(top).tween_method(func(v: float) -> void: top.set_shader_parameter("sweep", v), -0.15, 1.15, duration / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Terreno pousando: só a poça de luz na cor da mana sai de baixo dele e a borda acende de leve, rápido.
static func settle(node: CardNode, color: Color, speed: float = 1.0) -> void:
	if not _usable(node):
		return
	var below: ShaderMaterial = _layer(node, color, -CardNode.THICKNESS - 0.004, 0.55 / speed)
	_tween_of(below).tween_method(func(v: float) -> void: below.set_shader_parameter("under", v), 0.7, 0.0, 0.5 / speed).set_ease(Tween.EASE_IN)
	var top: ShaderMaterial = _layer(node, color, 0.004, 0.4 / speed)
	var tween := _tween_of(top)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline", v), 0.0, 0.02, 0.35 / speed).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline_alpha", v), 0.55, 0.0, 0.35 / speed).set_ease(Tween.EASE_IN)


## Pulso do contorno (bloqueio, anulada): a borda acende e se afasta um pouco.
static func pulse(node: CardNode, color: Color, reach: float = 0.05, speed: float = 1.0) -> void:
	if not _usable(node):
		return
	var top: ShaderMaterial = _layer(node, color, 0.004, 0.5 / speed)
	var tween := _tween_of(top)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline", v), 0.0, reach, 0.42 / speed).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(v: float) -> void: top.set_shader_parameter("outline_alpha", v), 1.0, 0.0, 0.42 / speed).set_ease(Tween.EASE_IN)


static func _usable(node: CardNode) -> bool:
	return node != null and is_instance_valid(node) and node.is_inside_tree()


## Uma camada presa na carta (acompanha quando ela vira ou se mexe), que se apaga sozinha depois de `life`.
static func _layer(node: CardNode, color: Color, y: float, life: float) -> ShaderMaterial:
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = CardNode.SIZE + Vector2(PAD, PAD) * 2.0
	mesh.mesh = plane
	var material := ShaderMaterial.new()
	material.shader = SHADER
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("card", CardNode.SIZE)
	material.set_shader_parameter("pad", PAD)
	mesh.material_override = material
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = Vector3(0, y, 0)
	node.add_child(mesh)
	mesh.get_tree().create_timer(life).timeout.connect(mesh.queue_free)
	material.set_meta("mesh", weakref(mesh))
	return material


## Tween paralelo preso na malha da camada (morre com ela).
static func _tween_of(material: ShaderMaterial) -> Tween:
	var mesh: MeshInstance3D = (material.get_meta("mesh") as WeakRef).get_ref() as MeshInstance3D
	return mesh.create_tween().set_parallel(true)
