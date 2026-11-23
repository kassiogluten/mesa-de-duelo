# Peças das cenas dos momentos grandes: o corte de lâmina, o título que bate na mesa, a coroa e o placar do comandante, a coluna de energia, a espiral de faíscas e a câmera.
class_name MomentPieces
extends RefCounted

## A que distância da câmera ficam os títulos e placares.
const TEXT_DEPTH := 8.0
## Quanto da tela (fração da largura e da altura) os títulos e os placares deixam livre nas bordas.
## Os títulos ficam sempre no meio da tela na horizontal (largos demais para caber ao lado de um retrato no canto).
const TITLE_MARGIN := Vector2(0.5, 0.22)
const SCORE_MARGIN := Vector2(0.1, 0.16)

static var _slash_shader: Shader
static var _solid_shader: Shader
static var _crown_mesh: ArrayMesh
static var _beam_shader: Shader
static var _title_font: SystemFont


## Um ponto ao lado de `at` na tela, `pixels` na direção do meio da tela, sempre à mesma distância da câmera: os
## títulos e placares saem do mesmo tamanho onde quer que esteja o retrato. `margin`: quanto da tela (fração da largura e
## da altura) fica livre nas bordas, para o texto não sair por elas.
static func beside(table: TableView, at: Vector3, pixels: float, margin: Vector2 = TITLE_MARGIN) -> Vector3:
	var camera: Camera3D = table.camera
	var size: Vector2 = camera.get_viewport().get_visible_rect().size
	var screen: Vector2 = camera.unproject_position(at)
	var toward: Vector2 = size * Vector2(0.5, 0.42) - screen
	var step: Vector2 = toward.normalized() * minf(pixels, toward.length()) if toward.length() > 1.0 else Vector2.ZERO
	var spot: Vector2 = (screen + step).clamp(size * margin, size * (Vector2.ONE - margin))
	return camera.project_position(spot, TEXT_DEPTH)


## Para cima na tela (o alto da câmera), para empilhar textos de frente para ela.
static func screen_up(node: Node3D) -> Vector3:
	var camera: Camera3D = node.get_viewport().get_camera_3d()
	return camera.global_basis.y if camera else Vector3.UP


## Roda `fn` daqui a `seconds`, se os efeitos ainda estiverem na mesa.
static func after(parent: Node3D, seconds: float, fn: Callable) -> void:
	if seconds <= 0.0:
		fn.call()
		return
	var ref: WeakRef = weakref(parent)
	parent.get_tree().create_timer(seconds).timeout.connect(func() -> void:
		if ref.get_ref() != null:
			fn.call())


## Um corte de lâmina de frente para a câmera, na diagonal `angle`: a ponta risca rápido, a cauda vem atrás e some.
static func slash(parent: Node3D, pos: Vector3, color: Color, angle: float, length: float, width: float, delay: float) -> void:
	after(parent, delay, func() -> void:
		var cut := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2(length, width)
		cut.mesh = quad
		var material := ShaderMaterial.new()
		material.shader = _slash_material()
		material.set_shader_parameter("color", color)
		material.set_shader_parameter("angle", angle)
		material.set_shader_parameter("head", 0.0)
		material.set_shader_parameter("tail", 0.0)
		cut.material_override = material
		cut.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		cut.extra_cull_margin = length
		cut.position = pos
		parent.add_child(cut)
		var set_head: Callable = func(v: float) -> void: material.set_shader_parameter("head", v)
		var set_tail: Callable = func(v: float) -> void: material.set_shader_parameter("tail", v)
		var tween := cut.create_tween()
		tween.tween_method(set_head, 0.0, 1.0, 0.11).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.tween_interval(0.12)
		tween.tween_method(set_tail, 0.0, 1.0, 0.32).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tween.tween_callback(cut.queue_free))


## Título grande que bate na mesa (cresce para trás), fica um instante com um risco de luz embaixo, sobe e some.
static func title(parent: Node3D, pos: Vector3, text: String, color: Color, outline: Color, size: int, duration: float, delay: float) -> void:
	after(parent, delay, func() -> void:
		var label := Label3D.new()
		label.text = text
		label.font = _font()
		label.font_size = size
		label.pixel_size = 0.0034
		label.outline_size = maxi(12, size / 7)
		label.modulate = Color(color, 0.0)
		label.outline_modulate = Color(outline, 0.0)
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.render_priority = 30
		label.outline_render_priority = 29
		label.position = pos
		label.scale = Vector3.ONE * 2.2
		parent.add_child(label)
		var flare_width: float = text.length() * size * 0.0034 * 0.62
		slash(parent, pos - screen_up(parent) * size * 0.0034 * 0.5, color, 0.0, flare_width, 0.12, 0.08)
		var tween := label.create_tween()
		tween.tween_property(label, "scale", Vector3.ONE, 0.2).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(label, "modulate:a", 1.0, 0.12)
		tween.parallel().tween_property(label, "outline_modulate:a", 0.9, 0.12)
		tween.tween_property(label, "scale", Vector3.ONE * 1.06, duration * 0.6)
		tween.tween_property(label, "position:y", pos.y + 0.5, duration * 0.3).set_ease(Tween.EASE_IN)
		tween.parallel().tween_property(label, "modulate:a", 0.0, duration * 0.3).set_ease(Tween.EASE_IN)
		tween.parallel().tween_property(label, "outline_modulate:a", 0.0, duration * 0.3).set_ease(Tween.EASE_IN)
		tween.tween_callback(label.queue_free))


## A coroa do comandante, de frente para a câmera: desce grande, se estampa e sobe sumindo; no golpe letal treme, fica
## vermelha e se parte em faíscas.
static func crown(parent: Node3D, pos: Vector3, color: Color, size: float, lethal: bool) -> void:
	var holder := Node3D.new()
	holder.position = pos
	holder.scale = Vector3.ONE * size * 1.9
	parent.add_child(holder)
	var shadow: ShaderMaterial = _solid(Color(0.08, 0.0, 0.12), 1.0, 28)
	var back := MeshInstance3D.new()
	back.mesh = _crown_shape()
	back.material_override = shadow
	back.scale = Vector3.ONE * 1.18
	back.position = Vector3(0, -0.04, 0)
	holder.add_child(back)
	var face: ShaderMaterial = _solid(color, 1.6, 29)
	var front := MeshInstance3D.new()
	front.mesh = _crown_shape()
	front.material_override = face
	holder.add_child(front)
	var set_alpha: Callable = func(a: float) -> void:
		face.set_shader_parameter("alpha", a)
		shadow.set_shader_parameter("alpha", a * 0.85)
	set_alpha.call(0.0)
	var tween := holder.create_tween()
	tween.tween_property(holder, "scale", Vector3.ONE * size * 0.92, 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(set_alpha, 0.0, 1.0, 0.12)
	tween.tween_callback(func() -> void: Fx.burst(parent, pos, color, 24, 1.6, 0.45, 0.06))
	tween.tween_property(holder, "scale", Vector3.ONE * size, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if lethal:
		tween.tween_method(func(c: Color) -> void: face.set_shader_parameter("color", c), color, Moments.BLOOD, 0.2)
		for i: int in 6:
			tween.tween_property(holder, "position:x", pos.x + (0.06 if i % 2 == 0 else -0.06), 0.045)
		tween.tween_callback(func() -> void:
			Fx.burst(parent, pos, Moments.BLOOD, 70, 2.8, 0.8, 0.08)
			Fx.burst(parent, pos, Moments.GOLD, 30, 2.0, 0.6, 0.06))
		tween.tween_property(holder, "scale", Vector3(size * 1.5, size * 0.2, size), 0.12)
		tween.parallel().tween_method(set_alpha, 1.0, 0.0, 0.12)
	else:
		tween.tween_interval(0.55)
		tween.tween_property(holder, "position:y", pos.y + 0.4, 0.4).set_ease(Tween.EASE_IN)
		tween.parallel().tween_method(set_alpha, 1.0, 0.0, 0.4)
	tween.tween_callback(holder.queue_free)


## O placar "X/21" do dano de comandante: rola do total de antes até o de agora e pulsa (mais vezes e mais rápido perto de
## 21), com "Dano de comandante" embaixo.
static func score(parent: Node3D, pos: Vector3, before: int, total: int, color: Color, near: bool, critical: bool) -> void:
	var holder := Node3D.new()
	holder.position = pos
	parent.add_child(holder)
	var number := Label3D.new()
	number.font = _font()
	number.font_size = 120 if critical else (104 if near else 88)
	number.pixel_size = 0.0034
	number.outline_size = 18
	number.modulate = color.lightened(0.25)
	number.outline_modulate = Color(0.1, 0.0, 0.14, 0.95)
	number.text = "%d/%d" % [before, Moments.COMMANDER_LIMIT]
	var caption := Label3D.new()
	caption.text = "Dano de comandante"
	caption.font_size = 40
	caption.pixel_size = 0.0034
	caption.outline_size = 10
	caption.modulate = Color(0.92, 0.85, 1.0)
	caption.outline_modulate = Color(0.08, 0.0, 0.12, 0.9)
	caption.position = screen_up(parent) * (-0.27 if near else -0.24)
	for label: Label3D in [number, caption]:
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.render_priority = 30
		label.outline_render_priority = 29
		holder.add_child(label)
	holder.scale = Vector3.ONE * 0.3
	var tween := holder.create_tween()
	tween.tween_property(holder, "scale", Vector3.ONE * 1.1, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(holder, "scale", Vector3.ONE, 0.1)
	var steps: int = maxi(1, total - before)
	tween.tween_method(func(v: float) -> void: number.text = "%d/%d" % [roundi(v), Moments.COMMANDER_LIMIT], float(before), float(total), minf(0.07 * steps, 0.4))
	var beats: int = 3 if critical else (2 if near else 0)
	var beat: float = 0.16 if critical else 0.22
	for i: int in beats:
		tween.tween_property(holder, "scale", Vector3.ONE * (1.22 if critical else 1.14), beat * 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.tween_property(holder, "scale", Vector3.ONE, beat * 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_interval(0.9 if near else 0.7)
	tween.tween_property(holder, "position:y", pos.y + 0.35, 0.45).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(number, "modulate:a", 0.0, 0.45)
	tween.parallel().tween_property(number, "outline_modulate:a", 0.0, 0.45)
	tween.parallel().tween_property(caption, "modulate:a", 0.0, 0.45)
	tween.parallel().tween_property(caption, "outline_modulate:a", 0.0, 0.45)
	tween.tween_callback(holder.queue_free)


## Coluna de energia que nasce da carta: abre de um fio, corre em listras para cima e se fecha.
static func beam(parent: Node3D, pos: Vector3, color: Color, duration: float) -> void:
	var beam := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.42
	cylinder.bottom_radius = 0.42
	cylinder.height = 9.0
	cylinder.cap_top = false
	cylinder.cap_bottom = false
	beam.mesh = cylinder
	if _beam_shader == null:
		_beam_shader = Shader.new()
		_beam_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 0.0;
void fragment() {
	float face = abs(dot(NORMAL, VIEW));
	float core = pow(face, 3.0);
	float stripes = 0.65 + 0.35 * sin(UV.y * 40.0 + TIME * 14.0 + UV.x * 18.85);
	// Forte embaixo (na carta), sumindo no alto.
	float fade = smoothstep(0.0, 0.85, UV.y) * mix(1.0, 0.4, smoothstep(0.9, 1.0, UV.y));
	ALBEDO = mix(color.rgb, vec3(1.0), core * 0.4) * 2.2;
	ALPHA = clamp((core * 0.9 + face * 0.25) * stripes * fade * alpha, 0.0, 1.0);
}
"""
	var material := ShaderMaterial.new()
	material.shader = _beam_shader
	material.set_shader_parameter("color", color)
	beam.material_override = material
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam.position = pos + Vector3(0, 4.5, 0)
	beam.scale = Vector3(0.05, 1, 0.05)
	parent.add_child(beam)
	var set_alpha: Callable = func(a: float) -> void: material.set_shader_parameter("alpha", a)
	var tween := beam.create_tween()
	tween.tween_property(beam, "scale", Vector3.ONE, duration * 0.18).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_method(set_alpha, 0.0, 1.0, duration * 0.12)
	tween.tween_interval(duration * 0.4)
	tween.tween_property(beam, "scale", Vector3(0.02, 1, 0.02), duration * 0.42).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_method(set_alpha, 1.0, 0.0, duration * 0.42)
	tween.tween_callback(beam.queue_free)


## Faíscas que sobem em espiral em volta de `pos`, cada uma com rastro, e se fecham no alto.
static func spiral(parent: Node3D, pos: Vector3, color: Color, count: int, height: float, duration: float) -> void:
	for i: int in count:
		var orb := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.035
		sphere.height = 0.07
		orb.mesh = sphere
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.albedo_color = color.lightened(0.6)
		orb.material_override = material
		orb.position = pos
		parent.add_child(orb)
		var trail := GPUParticles3D.new()
		trail.amount = 48 if Fx.quality > 0 else 16
		trail.lifetime = 0.5
		trail.local_coords = false
		var process := ParticleProcessMaterial.new()
		process.spread = 180.0
		process.initial_velocity_min = 0.05
		process.initial_velocity_max = 0.25
		process.gravity = Vector3(0, -0.4, 0)
		process.scale_min = 0.025
		process.scale_max = 0.06
		var ramp := Gradient.new()
		ramp.set_color(0, Color(color.lightened(0.3), 1.0))
		ramp.set_color(1, Color(color, 0.0))
		var ramp_tex := GradientTexture1D.new()
		ramp_tex.gradient = ramp
		process.color_ramp = ramp_tex
		trail.process_material = process
		trail.draw_pass_1 = Fx._spark()
		orb.add_child(trail)
		var start: float = TAU * i / count
		var tween := orb.create_tween()
		tween.tween_method(func(t: float) -> void:
			var radius: float = lerpf(1.0, 0.12, t)
			var turn: float = start + t * TAU * 1.6
			orb.position = pos + Vector3(cos(turn) * radius, 0.1 + t * height, sin(turn) * radius * 0.8), 0.0, 1.0, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tween.tween_callback(func() -> void:
			trail.emitting = false
			orb.visible = false)
		tween.tween_interval(0.6)
		tween.tween_callback(orb.queue_free)


## Tremor pelo deslocamento da lente (não mexe na posição, que o foco do diretor também anima).
static func shake(camera: Camera3D, strength: float, duration: float) -> void:
	if camera == null or Fx.quality == 0:
		return
	var tween := camera.create_tween()
	tween.tween_method(func(t: float) -> void:
		var fade: float = (1.0 - t) * strength
		camera.h_offset = sin(t * 61.0) * fade
		camera.v_offset = cos(t * 47.0) * fade * 0.8, 0.0, 1.0, duration)
	tween.tween_callback(func() -> void:
		camera.h_offset = 0.0
		camera.v_offset = 0.0)


## A câmera se aproxima de `target` (fração `amount` do caminho) e volta para o lugar de sempre da mesa, não para onde
## estava: assim um foco do diretor no meio do caminho não a deixa torta.
static func dolly(camera: Camera3D, target: Vector3, amount: float, duration: float, delay: float) -> void:
	if camera == null or Fx.quality == 0:
		return
	var ref: WeakRef = weakref(camera)
	camera.get_tree().create_timer(delay).timeout.connect(func() -> void:
		var cam: Camera3D = ref.get_ref() as Camera3D
		if cam == null:
			return
		var home: Vector3 = TableView.CAMERA_POS
		var tween := cam.create_tween()
		tween.tween_property(cam, "position", home.lerp(target, amount), duration * 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_interval(duration * 0.3)
		tween.tween_property(cam, "position", home, duration * 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT))


static func _font() -> SystemFont:
	if _title_font == null:
		_title_font = SystemFont.new()
		_title_font.font_names = PackedStringArray(["Segoe UI", "Arial", "Helvetica", "sans-serif"])
		_title_font.font_weight = 800
	return _title_font


## Material de cor chapada, de frente para a câmera (a coroa e a sombra dela).
static func _solid(color: Color, energy: float, priority: int) -> ShaderMaterial:
	if _solid_shader == null:
		_solid_shader = Shader.new()
		_solid_shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float energy = 1.0;
uniform float alpha = 1.0;
void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
}
void fragment() {
	// Um brilho de cima para baixo dá volume à coroa.
	float shade = mix(0.75, 1.25, UV.y);
	ALBEDO = color.rgb * energy * shade;
	ALPHA = alpha;
}
"""
	var material := ShaderMaterial.new()
	material.shader = _solid_shader
	material.set_shader_parameter("color", color)
	material.set_shader_parameter("energy", energy)
	material.render_priority = priority
	return material


## A silhueta da coroa (cinco pontas sobre uma faixa), no plano XY, com UV.y subindo para o alto.
static func _crown_shape() -> ArrayMesh:
	if _crown_mesh == null:
		var outline := PackedVector2Array([Vector2(-1.0, -0.42), Vector2(1.0, -0.42), Vector2(1.12, 0.62), Vector2(0.55, 0.12),
			Vector2(0.0, 0.8), Vector2(-0.55, 0.12), Vector2(-1.12, 0.62)])
		var band := PackedVector2Array([Vector2(-1.0, -0.72), Vector2(1.0, -0.72), Vector2(1.0, -0.52), Vector2(-1.0, -0.52)])
		var vertices := PackedVector3Array()
		var uvs := PackedVector2Array()
		for shape: PackedVector2Array in [outline, band]:
			var indices: PackedInt32Array = Geometry2D.triangulate_polygon(shape)
			for index: int in indices:
				var p: Vector2 = shape[index]
				vertices.append(Vector3(p.x, p.y, 0))
				uvs.append(Vector2((p.x + 1.2) / 2.4, (p.y + 0.72) / 1.52))
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = vertices
		arrays[Mesh.ARRAY_TEX_UV] = uvs
		_crown_mesh = ArrayMesh.new()
		_crown_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return _crown_mesh


static func _slash_material() -> Shader:
	if _slash_shader == null:
		_slash_shader = Shader.new()
		_slash_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, depth_test_disabled, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float head = 1.0;
uniform float tail = 0.0;
uniform float angle = 0.0;
uniform float energy = 3.0;
void vertex() {
	float c = cos(angle);
	float s = sin(angle);
	VERTEX.xy = mat2(vec2(c, s), vec2(-s, c)) * VERTEX.xy;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
}
void fragment() {
	float x = UV.x;
	float span = max(head - tail, 0.001);
	float local = clamp((x - tail) / span, 0.0, 1.0);
	float visible = step(tail, x) * step(x, head);
	// A lâmina: fina nas pontas, mais grossa e mais quente perto da ponta que corre.
	float thick = sin(x * PI) * mix(0.25, 1.0, local);
	float d = abs(UV.y - 0.5) * 2.0;
	float core = smoothstep(thick * 0.3, 0.0, d);
	float halo = smoothstep(thick, 0.0, d);
	ALBEDO = mix(color.rgb, vec3(1.0, 0.95, 0.9), core) * energy;
	ALPHA = visible * (halo * 0.55 + core);
}
"""
	return _slash_shader
