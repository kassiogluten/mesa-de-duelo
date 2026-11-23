# O peso do combate: o atacante recua, avança e golpeia (com uma pausa curta no impacto), o clarão no ponto do golpe e as
# faíscas que voam na direção dele; a câmera só é empurrada nos golpes grandes.
class_name CombatFx
extends RefCounted

## Tempos do golpe: recuo, avanço até o impacto, pausa no impacto e volta.
const WIND_UP := 0.09
const STRIKE := 0.08
const HOLD := 0.05
const RECOVER := 0.24
## Quanto do caminho até o alvo o atacante percorre.
const REACH := 0.42
## No golpe no jogador, a carta salta mais longe, até perto do retrato.
const LEAP_REACH := 0.62

static var _flash_shader: Shader


## Quando o impacto acontece depois de chamar `strike` (para o dano tocar junto).
static func impact_delay() -> float:
	return WIND_UP + STRIKE


## O atacante golpeia `target`: recua um pouco erguendo a frente, avança inclinado e volta com uma mola. Mexe só no
## desenho da carta (não no lugar dela na mesa, que a mesa pode mudar no meio). Com `leap` (o golpe no jogador), salta
## mais longe e mais alto até o retrato; `trail` deixa imagens fantasmas na cor dada no caminho do avanço.
static func strike(node: CardNode, target: Vector3, speed: float = 1.0, leap: bool = false, trail: Color = Color(0, 0, 0, 0)) -> void:
	if node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var visual: Node3D = CardDressing.visual_of(node)
	if visual == node:
		node.lunge(target)
		return
	var flat: Vector3 = target - node.global_position
	flat.y = 0.0
	if flat.length() < 0.01:
		return
	var reach: float = minf(flat.length() * (LEAP_REACH if leap else REACH), 4.2 if leap else 2.6)
	# A direção no espaço da carta (a atacante virada de lado também avança para o alvo).
	var local_dir: Vector3 = (node.global_basis.inverse() * flat.normalized())
	local_dir.y = 0.0
	local_dir = local_dir.normalized()
	var scale: float = maxf(node.global_basis.get_scale().x, 0.01)
	var home: Vector3 = node.raise_offset()
	var back: Vector3 = home - local_dir * (0.18 if leap else 0.12) + Vector3(0, 0.12, 0)
	var hit: Vector3 = home + local_dir * reach / scale + Vector3(0, 0.22, 0)
	var arc: float = (0.55 if leap else 0.12) / scale
	# Inclinação: no recuo a frente sobe (o peso vai para trás); no avanço ela mergulha no alvo.
	var axis: Vector3 = Vector3.UP.cross(local_dir).normalized()
	var striking: Array = [true]
	node.set_meta("combat_striking", striking)
	var tween: Tween = _take(node, visual)
	tween.tween_property(visual, "position", back, WIND_UP / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "basis", Basis(axis, -0.22), WIND_UP / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	var time: float = (STRIKE * (1.5 if leap else 1.0)) / speed
	var ghosts: Array = [0]
	var ref: WeakRef = weakref(node)
	tween.tween_method(func(t: float) -> void:
		var eased: float = t * t
		visual.position = back.lerp(hit, eased) + Vector3(0, sin(t * PI) * arc, 0)
		visual.basis = Basis(axis, lerpf(-0.22, 0.2, t))
		# As imagens fantasmas ficam para trás em três pontos do caminho.
		if trail.a > 0.0 and int(ghosts[0]) < 3 and t >= (int(ghosts[0]) + 1) * 0.25:
			ghosts[0] = int(ghosts[0]) + 1
			CombatPieces.ghost(_fx_parent(node), ref.get_ref() as CardNode, trail, 0.5 - int(ghosts[0]) * 0.1, 0.18 / speed), 0.0, 1.0, time)
	tween.tween_interval(HOLD / speed)
	tween.tween_property(visual, "position", home, RECOVER / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "basis", Basis.IDENTITY, RECOVER / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func() -> void: striking[0] = false)


## Quando o golpe com salto chega no alvo (o salto leva mais tempo no ar).
static func leap_delay() -> float:
	return WIND_UP + STRIKE * 1.5


## O empurrão de quem leva o golpe: a carta tomba para longe de `from` e volta com uma mola; se ela não está golpeando
## ao mesmo tempo, também desliza um pouco para trás.
static func recoil(node: CardNode, from: Vector3, weight: float, speed: float = 1.0) -> void:
	if node == null or not is_instance_valid(node) or not node.is_inside_tree():
		return
	var visual: Node3D = CardDressing.visual_of(node)
	if visual == node:
		node.jolt(0.05)
		return
	var flat: Vector3 = node.global_position - from
	flat.y = 0.0
	if flat.length() < 0.01:
		flat = Vector3.FORWARD
	var local_dir: Vector3 = node.global_basis.inverse() * flat.normalized()
	local_dir.y = 0.0
	local_dir = local_dir.normalized()
	var axis: Vector3 = Vector3.UP.cross(local_dir).normalized()
	var w: float = clampf(weight, 0.0, 1.0)
	var tilt: float = lerpf(0.16, 0.42, w)
	var striking: Variant = node.get_meta("combat_striking") if node.has_meta("combat_striking") else null
	var busy: bool = striking is Array and bool((striking as Array)[0])
	if busy:
		var shiver := visual.create_tween()
		# Golpeando: só treme no lugar (o avanço dele cuida da posição).
		shiver.tween_property(visual, "scale", Vector3.ONE * 0.94, 0.04 / speed)
		shiver.tween_property(visual, "scale", Vector3.ONE, 0.2 / speed).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
		return
	var tween: Tween = _take(node, visual)
	var home: Vector3 = node.raise_offset()
	var push: Vector3 = home + local_dir * lerpf(0.1, 0.28, w) / maxf(node.global_basis.get_scale().x, 0.01) + Vector3(0, 0.06, 0)
	tween.tween_property(visual, "position", push, 0.05 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "basis", Basis(axis, tilt), 0.05 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(visual, "position", home, 0.42 / speed).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(visual, "basis", Basis.IDENTITY, 0.42 / speed).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)


## O movimento de combate da carta passa a ser este (o anterior, se ainda corre, para: a carta não briga consigo mesma).
static func _take(node: CardNode, visual: Node3D) -> Tween:
	var old: Variant = node.get_meta("combat_tween") if node.has_meta("combat_tween") else null
	if old is Tween and (old as Tween).is_valid():
		(old as Tween).kill()
	var tween := visual.create_tween()
	node.set_meta("combat_tween", tween)
	return tween


## Onde as peças soltas do golpe ficam: a mesa em que a carta está (ou a própria carta, fora dela).
static func _fx_parent(node: CardNode) -> Node3D:
	var table: Node = node.get_parent()
	while table and not table is TableView:
		table = table.get_parent()
	return (table as Node3D) if table else node


## O impacto em `at`, vindo de `from` (ou de cima): o clarão de luz que estoura e some num piscar, as faíscas que
## seguem o golpe e, nos grandes, o empurrão da câmera na direção dele.
static func impact(parent: Node3D, at: Vector3, from: Variant, color: Color, amount: int, camera: Camera3D, speed: float = 1.0) -> void:
	var direction: Vector3 = (at - (from as Vector3)) if from is Vector3 else Vector3(0, -1, 0.3)
	direction.y = maxf(direction.y, 0.0)
	direction = direction.normalized() if direction.length() > 0.001 else Vector3.FORWARD
	var weight: float = clampf(float(amount) / 8.0, 0.0, 1.0)
	flash(parent, at + Vector3(0, 0.25, 0), color.lerp(Color.WHITE, 0.55), lerpf(0.9, 1.7, weight), 0.16 / speed)
	sparks(parent, at + Vector3(0, 0.15, 0), direction, color, 18 + amount * 4, lerpf(2.4, 4.2, weight))
	if amount >= 5:
		Fx.nudge(camera, direction, lerpf(0.03, 0.06, weight))


## Clarão de impacto de frente para a câmera: um estouro de luz com raios, que abre e some em `duration`.
static func flash(parent: Node3D, pos: Vector3, color: Color, size: float, duration: float) -> void:
	var quad := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = Vector2.ONE
	quad.mesh = mesh
	var material := ShaderMaterial.new()
	material.shader = _flash()
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("seed", randf() * 10.0)
	quad.material_override = material
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.position = pos
	quad.scale = Vector3.ONE * size * 0.35
	parent.add_child(quad)
	var tween := quad.create_tween().set_parallel(true)
	tween.tween_property(quad, "scale", Vector3.ONE * size, duration).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.tween_method(func(a: float) -> void: material.set_shader_parameter("alpha", a), 1.0, 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(quad.queue_free)


## Faíscas que voam na direção do golpe (num cone), caindo com a gravidade.
static func sparks(parent: Node3D, pos: Vector3, direction: Vector3, color: Color, amount: int, speed: float) -> void:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 1.0
	particles.amount = maxi(4, int(amount * (0.5 if Fx.quality == 0 else 1.0)))
	particles.lifetime = 0.45
	particles.local_coords = false
	var process := ParticleProcessMaterial.new()
	process.direction = (direction + Vector3(0, 0.6, 0)).normalized()
	process.spread = 38.0
	process.initial_velocity_min = speed * 0.45
	process.initial_velocity_max = speed
	process.gravity = Vector3(0, -6.0, 0)
	process.damping_min = 2.0
	process.damping_max = 4.0
	process.scale_min = 0.03
	process.scale_max = 0.07
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.97, 0.85, 1.0))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	particles.process_material = process
	particles.draw_pass_1 = Fx._spark()
	particles.position = pos
	parent.add_child(particles)
	particles.emitting = true
	parent.get_tree().create_timer(0.8).timeout.connect(particles.queue_free)


static func _flash() -> Shader:
	if _flash_shader == null:
		_flash_shader = Shader.new()
		_flash_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 1.0;
uniform float seed = 0.0;
void vertex() {
	// De frente para a câmera.
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}
void fragment() {
	vec2 p = UV - 0.5;
	float r = length(p) * 2.0;
	float a = atan(p.y, p.x);
	// Núcleo quente, halo macio e raios finos de tamanhos diferentes.
	float core = exp(-r * r * 18.0);
	float halo = exp(-r * r * 4.0) * 0.45;
	float rays = pow(max(0.0, cos(a * 5.0 + seed) * cos(a * 3.0 - seed * 1.7)), 6.0) * smoothstep(1.0, 0.1, r);
	float v = core * 1.6 + halo + rays * 0.9;
	ALBEDO = mix(color.rgb, vec3(1.0), core) * 2.2;
	ALPHA = clamp(v, 0.0, 1.0) * alpha;
}
"""
	return _flash_shader
