# Efeitos nos selos das permanentes: acha as peças de um selo (CardBadges.parts_of) e o centro dele, faz o selo saltar,
# acender por trás, contar o número (marcadores), virar algarismo por algarismo (lealdade) e soltar o "+2/+2" do P/T.
class_name BadgeFx
extends RefCounted

const STAR_SHADER := preload("res://fx/state_star.gdshader")
const GREEN := Color(0.45, 1.0, 0.55)
const RED := Color(1.0, 0.42, 0.36)
const GOLD := Color(1.0, 0.84, 0.42)
## Prioridade das peças que passam por cima dos selos (o chip voando, o texto do P/T).
const ABOVE := 16

static var _material: ShaderMaterial
static var _quad: QuadMesh


## Os selos da carta (o nó CardBadges dentro dela); null sem carta.
static func badges_of(node: CardNode) -> CardBadges:
	if node == null or not is_instance_valid(node) or node.is_queued_for_deletion():
		return null
	return node.get("_badges") as CardBadges


## As peças de um selo da carta (fundo primeiro); [] se ela não o mostra agora.
static func parts(node: CardNode, key: String) -> Array[GeometryInstance3D]:
	var badges: CardBadges = badges_of(node)
	return badges.parts_of(key) if badges else ([] as Array[GeometryInstance3D])


## O selo ainda está inteiro na mesa (a carta pode ter refeito os selos no meio do efeito).
static func alive(list: Array) -> bool:
	if list.is_empty():
		return false
	for part: Variant in list:
		if not is_instance_valid(part) or (part as Node).is_queued_for_deletion() or not (part as Node).is_inside_tree():
			return false
	return true


## O deslocamento de uma peça no plano da tela, em unidades do mundo (antes da escala da região).
static func offset_of(part: GeometryInstance3D) -> Vector2:
	return (part.get("offset") as Vector2) * float(part.get("pixel_size"))


## O centro do selo no mundo: a peça de fundo (a primeira), de frente para a câmera, com o deslocamento dela.
static func center(list: Array, camera: Camera3D) -> Vector3:
	var part: GeometryInstance3D = list[0]
	var t: Transform3D = part.global_transform
	var off: Vector2 = offset_of(part)
	return t.origin + camera.global_basis.x * off.x * t.basis.x.length() + camera.global_basis.y * off.y * t.basis.y.length()


## O tamanho do fundo do selo no mundo (largura, altura), com a escala da região.
static func size_of(list: Array) -> Vector2:
	var part: GeometryInstance3D = list[0]
	var scale: float = part.global_transform.basis.x.length()
	if part is Sprite3D and (part as Sprite3D).texture:
		return (part as Sprite3D).texture.get_size() * (part as Sprite3D).pixel_size * scale
	return Vector2(0.15, 0.15) * scale


## O material das estrelinhas e dos brilhos (um só para todas; cada uma muda os parâmetros da instância).
static func star_material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = STAR_SHADER
	return _material


## Uma estrelinha (shape 0) ou um brilho macio (shape 1) de `size` de lado, de frente para a câmera.
static func star(parent: Node3D, size: float, tint: Color, shape: float = 0.0) -> MeshInstance3D:
	if _quad == null:
		_quad = QuadMesh.new()
		_quad.size = Vector2.ONE
	var mesh := MeshInstance3D.new()
	mesh.mesh = _quad
	mesh.material_override = star_material()
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.scale = Vector3.ONE * size
	mesh.set_instance_shader_parameter("tint", tint)
	mesh.set_instance_shader_parameter("shape", shape)
	parent.add_child(mesh)
	return mesh


## Um brilho atrás do selo (preso na mesma região: anda com a carta), que acende e apaga em `duration`.
static func glow(list: Array, color: Color, reach: float = 1.7, duration: float = 0.5, strength: float = 0.8) -> void:
	if not alive(list):
		return
	var part: GeometryInstance3D = list[0]
	var region: Node3D = part.get_parent() as Node3D
	var local: Vector2 = Vector2.ONE * 0.15
	if part is Sprite3D and (part as Sprite3D).texture:
		local = (part as Sprite3D).texture.get_size() * (part as Sprite3D).pixel_size
	var size: float = maxf(local.x, local.y) * reach
	var light: MeshInstance3D = star(region, size, Color(color, 0.0), 1.0)
	light.set_instance_shader_parameter("center", offset_of(part) / size)
	var tween := light.create_tween()
	tween.tween_method(func(a: float) -> void: light.set_instance_shader_parameter("tint", Color(color, a)), 0.0, strength, duration * 0.25)
	tween.tween_method(func(a: float) -> void: light.set_instance_shader_parameter("tint", Color(color, a)), strength, 0.0, duration * 0.75).set_ease(Tween.EASE_IN)
	tween.tween_callback(light.queue_free)


## O selo salta: cresce em volta do centro dele de `from` até `peak` e assenta em 1 (aparecer: from < 1).
static func pop(list: Array, from: float = 1.0, peak: float = 1.2, duration: float = 0.32) -> void:
	if not alive(list):
		return
	var bases: Array = _bases(list)
	var apply: Callable = func(k: float) -> void: _scale_parts(list, bases, k)
	apply.call(from)
	var tween := (list[0] as Node).create_tween()
	tween.tween_method(apply, from, peak, duration * 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_method(apply, peak, 1.0, duration * 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void: _restore(list, bases))


## O número do selo anda de `from` até `to`, um passo por vez com um saltinho (o marcador chegando).
static func tick(list: Array, from: int, to: int, step: float = 0.075) -> void:
	var label: Label3D = _label_of(list)
	if label == null or from == to:
		return
	# O selo novo não mostra "0": começa no 1.
	if from == 0 and to > 0:
		from = 1
	if from == to:
		label.text = str(to)
		pop(list, 1.0, 1.15, step * 2.0)
		return
	var steps: int = absi(to - from)
	var jump: int = maxi(1, int(ceil(steps / 8.0)))
	label.text = str(from)
	var tween := label.create_tween()
	var value: int = from
	while value != to:
		value = mini(value + jump, to) if to > from else maxi(value - jump, to)
		var shown: int = value
		tween.tween_interval(step)
		tween.tween_callback(func() -> void:
			label.text = str(shown)
			pop(list, 1.0, 1.12, step * 1.6))


## A lealdade vira algarismo por algarismo: cada passo dobra o número para trás e o próximo cai no lugar, piscando na cor.
static func flip(list: Array, from: int, to: int, color: Color, step: float = 0.15) -> void:
	var label: Label3D = _label_of(list)
	if label == null or from == to:
		return
	var steps: int = absi(to - from)
	var jump: int = maxi(1, int(ceil(steps / 6.0)))
	var base_offset: Vector2 = label.offset
	var base_color: Color = label.modulate
	var fold: Callable = func(s: float) -> void:
		var sy: float = maxf(s, 0.02)
		label.scale = Vector3(1.0, sy, 1.0)
		label.offset = Vector2(base_offset.x, base_offset.y / sy)
	label.text = str(from)
	var tween := label.create_tween()
	var value: int = from
	while value != to:
		value = mini(value + jump, to) if to > from else maxi(value - jump, to)
		var shown: int = value
		tween.tween_method(fold, 1.0, 0.0, step * 0.45).set_ease(Tween.EASE_IN)
		tween.tween_callback(func() -> void:
			label.text = str(shown)
			label.modulate = color.lerp(Color.WHITE, 0.25))
		tween.tween_method(fold, 0.0, 1.0, step * 0.55).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate", base_color, 0.3)
	tween.tween_callback(func() -> void:
		label.scale = Vector3.ONE
		label.offset = base_offset)


## P/T mudou (bônus, encolher): o selo pulsa com um brilho verde (subiu) ou vermelho (caiu) e o "+2/+2" sobe dele.
static func pt_pulse(parent: Node3D, node: CardNode, power: int, toughness: int, camera: Camera3D) -> void:
	var list: Array[GeometryInstance3D] = parts(node, "pt")
	if not alive(list) or (power == 0 and toughness == 0):
		return
	var sum: int = power + toughness
	var color: Color = GREEN if sum > 0 else (RED if sum < 0 else GOLD)
	glow(list, color, 2.0, 0.6, 0.9)
	pop(list, 1.0, 1.24 if sum >= 0 else 1.14, 0.36)
	var text: String = "%s/%s" % [_signed(power), _signed(toughness)]
	delta_text(parent, center(list, camera), text, color, camera, sum < 0)


## O número pequeno que sai do selo (o "+2/+2", o "−3" da lealdade): sobe (menos, no que caiu) e some.
static func delta_text(parent: Node3D, at: Vector3, text: String, color: Color, camera: Camera3D, sinks: bool = false) -> void:
	var label := Label3D.new()
	label.text = text
	label.font = CardBadges.font()
	label.font_size = 44
	label.pixel_size = CardBadges.PX
	label.outline_size = 10
	label.modulate = color.lerp(Color.WHITE, 0.2)
	label.outline_modulate = Color(0.02, 0.03, 0.06, 0.85)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.render_priority = ABOVE
	label.outline_render_priority = ABOVE - 1
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var up: Vector3 = camera.global_basis.y
	label.position = at + up * 0.15
	label.scale = Vector3.ONE * 0.6
	parent.add_child(label)
	# Sempre para cima (descendo, ele cobriria o próprio selo); o que caiu sobe menos e mais devagar.
	var travel: Vector3 = up * (0.14 if sinks else 0.22)
	var tween := label.create_tween()
	tween.tween_property(label, "scale", Vector3.ONE * 1.05, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(label, "position", label.position + travel, 0.95).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(label, "modulate:a", 0.0, 0.45).set_delay(0.5)
	tween.parallel().tween_property(label, "outline_modulate:a", 0.0, 0.45).set_delay(0.5)
	tween.tween_callback(label.queue_free)


## Um selo que apareceu numa carta que já estava na mesa (palavra-chave ganha, Portador do Anel, virou criatura): salta
## do pequeno para o lugar com um brilho rápido.
static func arrive(list: Array, color: Color) -> void:
	glow(list, color, 1.9, 0.5, 0.75)
	pop(list, 0.35, 1.18, 0.38)


static func _signed(n: int) -> String:
	return "+%d" % n if n >= 0 else "−%d" % absi(n)


static func _label_of(list: Array) -> Label3D:
	if not alive(list):
		return null
	for part: Variant in list:
		if part is Label3D:
			return part as Label3D
	return null


## O lugar e o tamanho de cada peça antes do salto (guardados na peça: dois saltos seguidos voltam ao mesmo ponto).
static func _bases(list: Array) -> Array:
	var out: Array = []
	for part: Variant in list:
		var node: GeometryInstance3D = part
		if not node.has_meta("pop_base"):
			node.set_meta("pop_base", [node.get("offset"), float(node.get("pixel_size"))])
		out.append(node.get_meta("pop_base"))
	return out


## Cresce as peças `k` vezes em volta do centro do fundo: cada uma anda para longe do centro e aumenta junto.
static func _scale_parts(list: Array, bases: Array, k: float) -> void:
	var first: Array = bases[0]
	var middle: Vector2 = (first[0] as Vector2) * float(first[1])
	for i: int in list.size():
		var node: Variant = list[i]
		if not is_instance_valid(node):
			continue
		var base: Array = bases[i]
		var at: Vector2 = (base[0] as Vector2) * float(base[1])
		var size: float = float(base[1]) * k
		(node as GeometryInstance3D).set("pixel_size", size)
		(node as GeometryInstance3D).set("offset", (middle + (at - middle) * k) / size)


static func _restore(list: Array, bases: Array) -> void:
	_scale_parts(list, bases, 1.0)
	for part: Variant in list:
		if is_instance_valid(part):
			(part as Node).remove_meta("pop_base")
