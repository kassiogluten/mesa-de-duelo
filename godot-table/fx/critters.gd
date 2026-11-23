# Os bichos que atravessam a mesa: quando entra uma criatura do tipo deles (o esquilo correndo aos pulos pela borda de
# baixo, o rato disparando e parando para farejar, a aranha descendo num fio, o morcego voando no alto) e, raramente, de
# vez em quando na virada do turno. E a mesa rangendo com o campo lotado. Bichos feitos de formas simples, de brinquedo.
class_name Critters
extends RefCounted

## Subtipo da criatura (como o Forge escreve) → bicho.
const KINDS := {"Squirrel": "squirrel", "Rat": "rat", "Spider": "spider", "Bat": "bat"}
const ALL: PackedStringArray = ["squirrel", "rat", "spider", "bat"]
## Um bicho por vez: o próximo só depois deste tempo (segundos).
const COOLDOWN := 20.0
## Sem criatura do tipo, na virada do turno: a chance de um bicho passar e o tempo mínimo desde o último.
const IDLE_CHANCE := 0.06
const IDLE_GAP := 180.0
## Os bichos são de brinquedo, mas maiores que um bicho de verdade ao lado das cartas, para se verem da câmera.
const SIZE := 1.9

var _last: float = -1000.0


## O bicho da criatura que entrou ("" se ela não tem um), pelos subtipos da face à mostra.
static func kind_for(card: Dictionary) -> String:
	if not bool(card.get("creature", false)) or bool(card.get("faceDown", false)):
		return ""
	for subtype: String in CreatureSounds.subtypes(Txt.of(card.get("typeLine"))):
		if KINDS.has(subtype):
			return KINDS[subtype]
	return ""


## Entrou uma criatura: o bicho dela, se já passou o tempo desde o último ("" se não).
func on_entered(card: Dictionary, now: float) -> String:
	var kind: String = kind_for(card)
	if kind == "" or now - _last < COOLDOWN:
		return ""
	_last = now
	return kind


## Virada de turno: um bicho qualquer de vez em quando (`roll` de 0 a 1 decide a chance e qual), ou "".
func on_turn(now: float, roll: float) -> String:
	if now - _last < IDLE_GAP or roll >= IDLE_CHANCE:
		return ""
	_last = now
	return ALL[mini(int(roll / IDLE_CHANCE * ALL.size()), ALL.size() - 1)]


## Solta o bicho na mesa. Cada um tem o caminho dele e some sozinho.
static func spawn(parent: Node3D, kind: String, speed: float = 1.0) -> void:
	match kind:
		"squirrel":
			_squirrel(parent, speed)
		"rat":
			_rat(parent, speed)
		"spider":
			_spider(parent, speed)
		"bat":
			_bat(parent, speed)


## A mesa range com o campo lotado: a câmera balança de leve, como madeira cedendo ao peso, e sobe uma poeira do lado de quem lotou.
static func creak(parent: Node3D, camera: Camera3D, side: Vector3) -> void:
	if camera and Fx.quality > 0:
		var home: Vector3 = camera.rotation
		var tween := camera.create_tween()
		for i: int in 5:
			var fade: float = 1.0 - i / 5.0
			tween.tween_property(camera, "rotation:z", home.z + deg_to_rad(0.45) * fade * (1.0 if i % 2 == 0 else -1.0), 0.11).set_trans(Tween.TRANS_SINE)
		tween.tween_property(camera, "rotation:z", home.z, 0.12)
	for i: int in 4:
		var at: Vector3 = side + Vector3(randf_range(-3.0, 3.0), 0.05, randf_range(-0.6, 0.6))
		MomentPieces.after(parent, i * 0.08, func() -> void: Fx.burst(parent, at, Color(0.6, 0.52, 0.42), 14, 0.7, 0.8, 0.12))


static func _squirrel(parent: Node3D, speed: float) -> void:
	var fur := _mat(Color(0.65, 0.35, 0.15))
	var belly := _mat(Color(0.93, 0.82, 0.65))
	var body := Node3D.new()
	_ball(body, Vector3(0, 0.12, 0), Vector3(0.2, 0.14, 0.13), fur)
	_ball(body, Vector3(0.05, 0.1, 0), Vector3(0.12, 0.08, 0.1), belly)
	_ball(body, Vector3(0.17, 0.2, 0), Vector3(0.1, 0.09, 0.09), fur)
	_ball(body, Vector3(0.21, 0.29, 0.04), Vector3(0.025, 0.04, 0.02), fur)
	_ball(body, Vector3(0.21, 0.29, -0.04), Vector3(0.025, 0.04, 0.02), fur)
	_ball(body, Vector3(0.24, 0.22, 0.05), Vector3(0.018, 0.018, 0.018), _mat(Color(0.05, 0.03, 0.02)))
	_ball(body, Vector3(-0.2, 0.28, 0), Vector3(0.09, 0.2, 0.08), fur)
	_ball(body, Vector3(-0.15, 0.44, 0), Vector3(0.1, 0.1, 0.08), _mat(Color(0.78, 0.48, 0.22)))
	body.scale = Vector3.ONE * SIZE
	parent.add_child(body)
	var z: float = 3.05
	var from := Vector3(-8.5, 0, z)
	var to := Vector3(8.5, 0, z)
	var hops: int = 14
	var duration: float = 3.6 / speed
	body.position = from
	var tween := body.create_tween()
	tween.tween_method(func(t: float) -> void:
		var hop: float = absf(sin(t * hops * PI))
		body.position = from.lerp(to, t) + Vector3(0, hop * 0.22, 0)
		body.rotation.z = (0.5 - fmod(t * hops, 1.0)) * 0.5, 0.0, 1.0, duration)
	tween.tween_callback(body.queue_free)


static func _rat(parent: Node3D, speed: float) -> void:
	var grey := _mat(Color(0.45, 0.43, 0.47))
	var pink := _mat(Color(0.85, 0.55, 0.58))
	var body := Node3D.new()
	_ball(body, Vector3(0, 0.07, 0), Vector3(0.17, 0.08, 0.09), grey)
	_ball(body, Vector3(0.16, 0.07, 0), Vector3(0.09, 0.055, 0.06), grey)
	_ball(body, Vector3(0.25, 0.06, 0), Vector3(0.02, 0.02, 0.02), pink)
	_ball(body, Vector3(0.13, 0.13, 0.04), Vector3(0.035, 0.035, 0.012), pink)
	_ball(body, Vector3(0.13, 0.13, -0.04), Vector3(0.035, 0.035, 0.012), pink)
	var tail := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 0.004
	cylinder.bottom_radius = 0.012
	cylinder.height = 0.32
	tail.mesh = cylinder
	tail.material_override = pink
	tail.position = Vector3(-0.3, 0.05, 0)
	tail.rotation_degrees = Vector3(0, 0, 80)
	body.add_child(tail)
	body.scale = Vector3.ONE * SIZE
	parent.add_child(body)
	# Da direita para a esquerda: dispara, para no meio farejando, dispara de novo.
	body.rotation.y = PI
	var z: float = 3.2
	var stop := Vector3(randf_range(-1.5, 1.5), 0, z)
	body.position = Vector3(8.5, 0, z)
	var tween := body.create_tween()
	tween.tween_property(body, "position", stop, 1.1 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	for i: int in 3:
		tween.tween_property(body, "rotation:z", 0.12, 0.09 / speed)
		tween.tween_property(body, "rotation:z", 0.0, 0.09 / speed)
	tween.tween_interval(0.25 / speed)
	tween.tween_property(body, "position", Vector3(-8.5, 0, z), 1.0 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(body.queue_free)


static func _spider(parent: Node3D, speed: float) -> void:
	var black := _mat(Color(0.06, 0.05, 0.07))
	var body := Node3D.new()
	_ball(body, Vector3(0, 0, 0), Vector3(0.11, 0.1, 0.13), black)
	_ball(body, Vector3(0, -0.02, 0.12), Vector3(0.06, 0.055, 0.06), black)
	_ball(body, Vector3(0, 0.07, -0.05), Vector3(0.03, 0.02, 0.03), _mat(Color(0.75, 0.08, 0.08)))
	for side: int in [1, -1]:
		for i: int in 4:
			var leg := MeshInstance3D.new()
			var cylinder := CylinderMesh.new()
			cylinder.top_radius = 0.008
			cylinder.bottom_radius = 0.008
			cylinder.height = 0.26
			leg.mesh = cylinder
			leg.material_override = black
			leg.position = Vector3(side * 0.13, -0.02, -0.08 + i * 0.06)
			leg.rotation_degrees = Vector3(0, (i - 1.5) * 20.0 * side, side * 60.0)
			body.add_child(leg)
	var thread := MeshInstance3D.new()
	var line := CylinderMesh.new()
	line.top_radius = 0.004
	line.bottom_radius = 0.004
	line.height = 6.0
	thread.mesh = line
	var silk := _mat(Color(0.9, 0.92, 0.95))
	silk.emission_enabled = true
	silk.emission = Color(0.8, 0.85, 0.9)
	silk.emission_energy_multiplier = 0.4
	thread.material_override = silk
	thread.position = Vector3(0, 3.0, 0)
	body.add_child(thread)
	body.scale = Vector3.ONE * SIZE
	parent.add_child(body)
	var x: float = randf_range(3.5, 5.5) * (1.0 if randf() < 0.5 else -1.0)
	var top := Vector3(x, 9.5, 1.8)
	var low := Vector3(x, 1.6, 1.8)
	body.position = top
	var tween := body.create_tween()
	tween.tween_property(body, "position", low, 1.2 / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(body, "rotation:y", 0.5, 0.4 / speed).set_trans(Tween.TRANS_SINE)
	tween.tween_property(body, "rotation:y", -0.5, 0.6 / speed).set_trans(Tween.TRANS_SINE)
	tween.tween_property(body, "rotation:y", 0.0, 0.4 / speed).set_trans(Tween.TRANS_SINE)
	tween.tween_property(body, "position", top, 0.9 / speed).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_callback(body.queue_free)


static func _bat(parent: Node3D, speed: float) -> void:
	var dark := _mat(Color(0.12, 0.08, 0.14))
	var body := Node3D.new()
	_ball(body, Vector3(0, 0, 0), Vector3(0.07, 0.06, 0.12), dark)
	_ball(body, Vector3(0, 0.02, 0.12), Vector3(0.05, 0.05, 0.05), dark)
	var wings: Array[Node3D] = []
	for side: int in [1, -1]:
		var pivot := Node3D.new()
		pivot.position = Vector3(side * 0.05, 0.01, 0)
		body.add_child(pivot)
		var wing := MeshInstance3D.new()
		var prism := PrismMesh.new()
		prism.size = Vector3(0.36, 0.2, 0.01)
		wing.mesh = prism
		wing.material_override = dark
		wing.rotation_degrees = Vector3(90, 0, 0)
		wing.position = Vector3(side * 0.18, 0, -0.02)
		pivot.add_child(wing)
		wings.append(pivot)
	body.scale = Vector3.ONE * SIZE
	parent.add_child(body)
	var from := Vector3(-9.0, 2.2, -1.5)
	var to := Vector3(9.0, 3.0, -2.2)
	var duration: float = 3.2 / speed
	body.position = from
	body.rotation.y = -PI / 2.0
	var tween := body.create_tween()
	tween.tween_method(func(t: float) -> void:
		body.position = from.lerp(to, t) + Vector3(0, sin(t * 9.0) * 0.35, sin(t * 5.0) * 0.6)
		var flap: float = sin(t * duration * speed * 28.0) * 0.9
		wings[0].rotation.z = flap
		wings[1].rotation.z = -flap, 0.0, 1.0, duration)
	tween.tween_callback(body.queue_free)


static func _ball(parent: Node3D, pos: Vector3, size: Vector3, material: Material) -> void:
	var ball := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 16
	sphere.rings = 8
	ball.mesh = sphere
	ball.material_override = material
	ball.position = pos
	ball.scale = size
	parent.add_child(ball)


static func _mat(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.7
	material.rim_enabled = true
	material.rim = 0.3
	return material
