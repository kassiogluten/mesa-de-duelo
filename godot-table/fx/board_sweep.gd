# Limpa-campo (Wrath of God, Evacuation, Pyroclasm): acha as saídas do campo da mesma mágica ou habilidade, e o mesmo dano
# atingindo várias criaturas sem mirar nelas, e toca a onda grande na cor da mágica varrendo a mesa; cada carta sai do
# jeito dela quando a frente da onda chega nela. Como boardSweep.ts da mesa do navegador.
class_name BoardSweep
extends RefCounted

## A partir de quantas permanentes (ou criaturas atingidas pelo mesmo dano) a jogada vira limpa-campo.
const SWEEP_MIN := 3
## Quanto a onda leva para atravessar a mesa e até onde ela vai (unidades da mesa, a partir do meio).
const WAVE_TIME := 1.15
const REACH := 11.0
## O que pode acontecer entre a mágica resolver e a criatura sair (ações baseadas no estado).
const AFTERMATH := ["left", "damage", "life-changed", "entered", "mill", "discard", "draw", "counters", "survived"]
const PLURAL := [["destroyed", "destruídas"], ["sacrificed", "sacrificadas"], ["Exile", "exiladas"], ["Hand", "devolvidas à mão"], ["Library", "postas no grimório"]]

static var _front_shader: Shader

## Fontes que miraram cartas (o dano dividido entre alvos escolhidos continua com os projéteis, sem onda).
var _targeted: Dictionary = {}


## Os limpa-campos nos eventos novos: [{events, cause, color, text, damage, wave}]. `on_field(id)`: a carta está no campo da mesa.
func observe(events: Array, on_field: Callable) -> Array:
	var groups: Dictionary = {}
	var order: Array = []
	var resolved: Dictionary = {}
	var combat_hit: Dictionary = {}
	var damage_runs: Array = []
	for raw: Variant in events:
		var event: Dictionary = raw
		var type: String = Txt.of(event.get("type"))
		var id: int = _card_id(event)
		var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
		if type in ["spell-cast", "ability-activated"] and not (targets.get("cards", []) as Array).is_empty():
			_targeted[id] = true
		if type == "resolved":
			resolved = event
			combat_hit = {}
			continue
		if type == "damage":
			if bool(event.get("combat", false)):
				for hit: Variant in targets.get("cards", []):
					combat_hit[int(hit)] = true
			else:
				_add_damage(damage_runs, event)
		if type == "left" and (Txt.of(event.get("from")) == "Battlefield" or (on_field.is_valid() and bool(on_field.call(id)))):
			var key: String = ""
			var cause: Dictionary = {}
			if event.get("stackId") != null:
				key = "s%d" % int(event["stackId"])
				cause = _cause_of(events, int(event["stackId"]))
			elif not resolved.is_empty() and not combat_hit.has(id):
				key = "s%d" % int(resolved.get("stackId", resolved.get("seq", -1)))
				cause = resolved.get("card", {}) if resolved.get("card") is Dictionary else {}
			if key != "":
				if not groups.has(key):
					groups[key] = {"events": [], "cause": cause}
					order.append(key)
				(groups[key]["events"] as Array).append(event)
		elif not type in AFTERMATH:
			resolved = {}
	var out: Array = []
	for run: Variant in damage_runs:
		var events_of_run: Array = (run as Dictionary)["events"]
		var first: Dictionary = events_of_run[0]
		if _hit_cards(events_of_run) >= SWEEP_MIN and not _targeted.has(_card_id(first)):
			var wither: bool = bool(first.get("wither", false))
			out.append({"events": events_of_run, "cause": first.get("card", {}) if first.get("card") is Dictionary else {}, "damage": true,
				"color": Color(0.68, 0.4, 0.95) if wither else Color(1.0, 0.45, 0.16), "text": "%d criaturas atingidas" % _hit_cards(events_of_run), "wave": true})
	for key: String in order:
		var group: Dictionary = groups[key]
		var removed: Array = group["events"]
		if removed.size() < SWEEP_MIN:
			continue
		var cause: Dictionary = group["cause"]
		# Depois de um limpa-campo de dano, as mortes que ele causou saem sem outra onda.
		out.append({"events": removed, "cause": cause, "damage": false, "color": color_of(cause), "text": outcome(removed), "wave": out.is_empty()})
	return out


## A cor da onda pelo custo da carta que causou: uma cor, a dela; várias, dourado; nenhuma (ou sem carta), prata.
static func color_of(card: Dictionary) -> Color:
	var cost: String = Txt.of(card.get("manaCost"))
	if cost == "":
		return Color(0.87, 0.9, 0.93)
	return Fx.card_color(card)


## O que aconteceu com as permanentes, quando foi o mesmo para todas ("3 permanentes destruídas"); senão, "saíram do campo".
static func outcome(events: Array) -> String:
	var n: int = events.size()
	for pair: Array in PLURAL:
		var all_same: bool = true
		for raw: Variant in events:
			var event: Dictionary = raw
			if Txt.of(event.get("reason")) != Txt.of(pair[0]) and Txt.of(event.get("to")) != Txt.of(pair[0]):
				all_same = false
				break
		if all_same:
			return "%d permanentes %s" % [n, Txt.of(pair[1])]
	return "%d permanentes saíram do campo" % n


## Quando a frente da onda chega a `distance` do meio (segundos desde o começo, com a velocidade 1).
static func arrival(distance: float) -> float:
	var k: float = clampf(distance / REACH, 0.0, 1.0)
	return WAVE_TIME * (1.0 - sqrt(1.0 - k))


## A onda: um muro de luz na cor que abre a partir de `origin` e atravessa a mesa, com faíscas na frente, um anel no tampo,
## um clarão no começo e a mesa tremendo de leve. `speed` é a velocidade dos efeitos (câmera lenta no laboratório).
static func wave(parent: Node3D, origin: Vector3, color: Color, speed: float = 1.0) -> void:
	var duration: float = WAVE_TIME / speed
	var front := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 1.0
	cylinder.bottom_radius = 1.0
	cylinder.height = 1.0
	cylinder.radial_segments = 96
	cylinder.rings = 1
	cylinder.cap_top = false
	cylinder.cap_bottom = false
	front.mesh = cylinder
	var material := ShaderMaterial.new()
	material.shader = _front()
	material.set_shader_parameter("color", color)
	front.material_override = material
	front.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	front.position = origin + Vector3(0, 0.45, 0)
	front.scale = Vector3(0.2, 0.9, 0.2)
	parent.add_child(front)
	var radius: Callable = func(t: float) -> void:
		var r: float = REACH * (1.0 - (1.0 - t) * (1.0 - t))
		front.scale = Vector3(maxf(r, 0.05), 0.9 * (1.0 - t * 0.5), maxf(r, 0.05))
		material.set_shader_parameter("alpha", clampf(t * 8.0, 0.0, 1.0) * (1.0 - t * t))
	var tween := front.create_tween()
	tween.tween_method(radius, 0.0, 1.0, duration)
	tween.tween_callback(front.queue_free)
	# O rastro no tampo: um anel largo que segue a frente e um fino mais rápido na frente dele.
	Fx.ring(parent, origin, color, REACH * 1.02, duration * 1.05, 0.06)
	Fx.ring(parent, origin, color.lerp(Color.WHITE, 0.4), REACH * 0.55, duration * 0.6, 0.12)
	Fx.light(parent, origin, color, 6.0, 9.0, 0.6 / speed)
	Fx.burst(parent, origin + Vector3(0, 0.2, 0), color.lerp(Color.WHITE, 0.3), 70, 4.0, 0.7, 0.1)
	_front_sparks(parent, origin, color, duration)


## Faíscas soltas pela frente da onda: o anel de onde elas saem cresce junto com ela.
static func _front_sparks(parent: Node3D, origin: Vector3, color: Color, duration: float) -> void:
	if Fx.quality == 0:
		return
	var sparks := GPUParticles3D.new()
	sparks.amount = 260 if Fx.quality >= 2 else 140
	sparks.lifetime = 0.55
	sparks.local_coords = false
	sparks.visibility_aabb = AABB(Vector3(-14, -1, -10), Vector3(28, 5, 20))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	process.emission_ring_axis = Vector3.UP
	process.emission_ring_height = 0.1
	process.emission_ring_radius = 0.3
	process.emission_ring_inner_radius = 0.2
	process.direction = Vector3(0, 1, 0)
	process.spread = 35.0
	process.initial_velocity_min = 0.6
	process.initial_velocity_max = 1.8
	process.gravity = Vector3(0, -1.5, 0)
	process.scale_min = 0.05
	process.scale_max = 0.12
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lerp(Color.WHITE, 0.5), 0.8))
	ramp.set_color(1, Color(color, 0.0))
	var ramp_tex := GradientTexture1D.new()
	ramp_tex.gradient = ramp
	process.color_ramp = ramp_tex
	sparks.process_material = process
	sparks.draw_pass_1 = Fx._spark()
	sparks.position = origin + Vector3(0, 0.08, 0)
	parent.add_child(sparks)
	sparks.emitting = true
	var tween := sparks.create_tween()
	tween.tween_method(func(t: float) -> void:
		var r: float = REACH * (1.0 - (1.0 - t) * (1.0 - t))
		process.emission_ring_radius = maxf(r, 0.3)
		process.emission_ring_inner_radius = maxf(r - 0.15, 0.1), 0.0, 1.0, duration)
	tween.tween_callback(func() -> void: sparks.emitting = false)
	tween.tween_interval(0.7)
	tween.tween_callback(sparks.queue_free)


static func _add_damage(runs: Array, event: Dictionary) -> void:
	if bool(event.get("fight", false)) or bool(event.get("self", false)) or bool(event.get("prevented", false)):
		return
	var source: int = _card_id(event)
	if not runs.is_empty() and int((runs[runs.size() - 1] as Dictionary)["source"]) == source:
		((runs[runs.size() - 1] as Dictionary)["events"] as Array).append(event)
		return
	runs.append({"source": source, "events": [event]})


static func _hit_cards(events: Array) -> int:
	var hit: Dictionary = {}
	for raw: Variant in events:
		var targets: Dictionary = (raw as Dictionary).get("targets", {}) if (raw as Dictionary).get("targets") is Dictionary else {}
		for id: Variant in targets.get("cards", []):
			hit[int(id)] = true
	return hit.size()


static func _cause_of(events: Array, stack_id: int) -> Dictionary:
	for raw: Variant in events:
		var event: Dictionary = raw
		if event.get("stackId") != null and int(event["stackId"]) == stack_id and Txt.of(event.get("type")) in ["resolved", "spell-cast", "ability-activated"] and event.get("card") is Dictionary:
			return event["card"]
	return {}


static func _card_id(event: Dictionary) -> int:
	if event.get("card") is Dictionary and (event["card"] as Dictionary).has("id"):
		return int((event["card"] as Dictionary)["id"])
	return int(event.get("sourceId", -1)) if event.get("sourceId") != null else -1


static func _front() -> Shader:
	if _front_shader == null:
		_front_shader = Shader.new()
		_front_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(1.0);
uniform float alpha = 1.0;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void fragment() {
	// UV.y 0 no alto do muro, 1 no tampo: forte embaixo, esfumando para cima, com chamas que sobem.
	float h = 1.0 - UV.y;
	float flames = noise(vec2(UV.x * 60.0, h * 3.0 - TIME * 4.0)) * 0.6 + noise(vec2(UV.x * 140.0, h * 6.0 - TIME * 7.0)) * 0.4;
	float body = pow(1.0 - h, 2.2) * (0.55 + 0.9 * flames);
	float base = smoothstep(0.12, 0.0, h);
	ALBEDO = mix(color.rgb, vec3(1.0), base * 0.6) * (1.4 + base * 2.0);
	ALPHA = clamp(body + base, 0.0, 1.0) * alpha * 0.6;
}
"""
	return _front_shader
