# Efeitos contínuos nas permanentes com a mesa parada: a criatura que voa paira e balança, o vínculo com a vida bate como
# um coração, o indestrutível brilha em dourado… Uma camada de shader por carta (material único, os efeitos de cada uma
# nos parâmetros da instância), partículas só no caprichado e dentro do orçamento; tudo apaga nos momentos grandes.
class_name AmbientFx
extends Node

const SHADER := preload("res://fx/ambient_card.gdshader")
## Margem da camada em volta da carta (unidades da carta): curta, para não passar por cima das vizinhas.
const PAD := 0.08
## A camada logo acima da face da carta (os selos ficam mais acima e são desenhados depois).
const LAYER_Y := 0.0025
## Voar: quanto o desenho paira acima do lugar, quanto balança e em quanto tempo vai e volta.
const HOVER_HEIGHT := 0.08
const BOB := 0.018
const BOB_TIME := 3.6
## Força nos momentos grandes (pilha, combate, limpa-campo) e com o mouse em cima.
const QUIET_GAIN := 0.3
const HOVER_GAIN := 1.4
## A carta que acabou de entrar espera o efeito de entrada antes de o efeito contínuo acender.
const FADE_DELAY := 0.9
const FADE_TIME := 1.4
## Limpa-campo: saíram pelo menos tantas permanentes de uma vez, a mesa fica quieta por este tempo.
const WIPE_COUNT := 3
const WIPE_QUIET := 2.5
## Orçamento de partículas por lado da mesa: o seu, o oponente do duelo, os oponentes do Commander (longe e pequenos).
const EMITTERS_MINE := 6
const EMITTERS_DUEL := 3
const EMITTERS_FAR := 0
## Olhadas por segundo no escurecer da carta (o prompt escurece o resto do campo).
const POLL_RATE := 10.0
const PREF_KEY := "ambientEffects"

## A opção "Efeitos contínuos nas permanentes" (ligada por padrão); vale na hora.
static var enabled: bool = true
static var _pref_loaded: bool = false
static var _material: ShaderMaterial
static var _mesh: PlaneMesh

var table: TableView
## id da carta → Entry
var _entries: Dictionary = {}
var _gain_now: float = 1.0
var _gain_goal: float = 1.0
var _quiet_until: float = 0.0
var _field_count: int = -1
var _poll: float = 0.0
var _quality: int = -1
var _enabled_seen: bool = true


## O que cada carta com efeito tem agora.
class Entry:
	var node: WeakRef
	var layer: MeshInstance3D
	var motes: GPUParticles3D
	var holder: Node3D
	var modes: Array[int] = []
	var hovers: bool = false
	var seed: float = 0.0
	## A força: o que já está aceso e aonde vai (entrada, escurecida pelo prompt, mouse em cima).
	var gain: float = 0.0
	var goal: float = 1.0
	var born: float = 0.0
	var rise: float = 0.0
	var hovered: bool = false
	var dim: float = 0.0
	var on_hover: Callable


## Chamado pela mesa a cada estado, depois de pôr as permanentes no lugar: cria o diretor na primeira vez.
static func sync(view: TableView) -> void:
	var ambient: AmbientFx = view.get_node_or_null("AmbientFx") as AmbientFx
	if ambient == null:
		ambient = AmbientFx.new()
		ambient.name = "AmbientFx"
		ambient.table = view
		view.add_child(ambient)
	ambient.refresh()


## Lê a opção salva (uma vez por sessão).
static func load_pref() -> void:
	if _pref_loaded:
		return
	_pref_loaded = true
	enabled = bool(Prefs.load_all().get(PREF_KEY, true))


## Liga ou desliga a opção e a salva; a mesa aberta atende no quadro seguinte.
static func set_enabled(on: bool) -> void:
	_pref_loaded = true
	enabled = on
	Prefs.save(PREF_KEY, on)


## 0: desligado (opção ou efeitos leves), 1: só o shader e o pairar, 2: com as partículas.
static func level() -> int:
	load_pref()
	if not enabled:
		return 0
	return clampi(Fx.quality, 0, 2)


## O material compartilhado por todas as camadas (cada carta muda só os parâmetros da instância).
static func shared_material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = SHADER
		_material.set_shader_parameter("card", CardNode.SIZE)
		_material.set_shader_parameter("pad", PAD)
		_material.set_shader_parameter("corner", CardNode.CORNER)
		# Antes dos selos (que são desenhados com prioridade maior) e de qualquer outro transparente da carta.
		_material.render_priority = -2
	return _material


static func _plane() -> PlaneMesh:
	if _mesh == null:
		_mesh = PlaneMesh.new()
		_mesh.size = CardNode.SIZE + Vector2(PAD, PAD) * 2.0
	return _mesh


# — Estado → efeitos —

## Refaz quem mostra o quê a partir do estado que a mesa acabou de pôr.
func refresh() -> void:
	if table == null:
		return
	var state: Dictionary = table.current_state()
	var ctx: Dictionary = table.badge_context()
	_quality = level()
	_enabled_seen = enabled
	_update_quiet(state)
	if _quality == 0:
		clear()
		return
	var seen: Dictionary = {}
	var now: float = _now()
	for raw: Variant in state.get("players", []):
		var player: Dictionary = raw
		var frame: Dictionary = table.frame_of(int(player["id"]))
		if frame.is_empty():
			continue
		var mine: bool = int(frame["side"]) > 0
		var far: bool = float(frame["scale"]) < 1.0
		var budget: int = EMITTERS_MINE if mine else (EMITTERS_FAR if far else EMITTERS_DUEL)
		var shown: Dictionary = AmbientTraits.visible_cards(player, ctx)
		var tops: Dictionary = shown["tops"]
		var attached: Dictionary = shown["attached"]
		var hosts: Dictionary = ctx.get("attachments", {})
		for c: Variant in player.get("battlefield", []):
			var card: Dictionary = c
			var id: int = int(card["id"])
			var node: CardNode = table.card_node(id)
			if node == null or not (tops.has(id) or attached.has(id)):
				continue
			var modes: Array[int] = []
			if not attached.has(id):
				modes = AmbientTraits.pick(card, ctx)
			# Os oponentes do Commander ficam longe e pequenos: um efeito só, para não virar ruído.
			if far and modes.size() > 1:
				modes = modes.slice(0, 1)
			var link := Color(0, 0, 0, 0)
			if attached.has(id):
				link = _link_color(card)
				link.a = -1.0
			elif hosts.has(id):
				link = _link_color((hosts[id] as Array)[0])
				link.a = 1.0
			var hovers: bool = tops.has(id) and AmbientTraits.hovers(card)
			if modes.is_empty() and not hovers and link.a == 0.0:
				continue
			var particle: int = AmbientTraits.particle_mode(modes) if _quality >= 2 and budget > 0 else AmbientTraits.Mode.NONE
			if particle != AmbientTraits.Mode.NONE:
				budget -= 1
			_apply(id, node, modes, hovers, link, Fx.card_color(card), AmbientTraits.loyalty(card), particle, now)
			seen[id] = true
	for id: Variant in _entries.keys():
		if not seen.has(id):
			_remove(id)


## Apaga tudo (opção desligada, efeitos leves).
func clear() -> void:
	for id: Variant in _entries.keys():
		_remove(id)


## Quantas cartas mostram efeito e quantos emissores de partícula estão vivos (para os testes e a medição).
func stats() -> Dictionary:
	var emitters: int = 0
	var hovering: int = 0
	for e: Entry in _entries.values():
		if e.motes:
			emitters += 1
		if e.hovers:
			hovering += 1
	return {"cards": _entries.size(), "emitters": emitters, "hovering": hovering}


## Os efeitos de luz de uma carta ([] sem ela).
func modes_of(id: int) -> Array[int]:
	var e: Entry = _entries.get(id)
	return e.modes if e else ([] as Array[int])


func global_gain() -> float:
	return _gain_goal


## Pilha com algo, combate em andamento ou limpa-campo: os efeitos contínuos baixam para não brigar com o momento.
func _update_quiet(state: Dictionary) -> void:
	var count: int = 0
	for raw: Variant in state.get("players", []):
		count += ((raw as Dictionary).get("battlefield", []) as Array).size()
	if _field_count >= 0 and _field_count - count >= WIPE_COUNT:
		_quiet_until = _now() + WIPE_QUIET
	_field_count = count
	var stack: Variant = state.get("stack", [])
	var combat: Variant = state.get("combat", [])
	var busy: bool = (stack is Array and not (stack as Array).is_empty()) or (combat is Array and not (combat as Array).is_empty())
	_gain_goal = QUIET_GAIN if busy or _now() < _quiet_until else 1.0


func _link_color(card: Dictionary) -> Color:
	if Txt.of(card.get("typeLine", "")).contains("Equipment"):
		return Color(0.8, 0.86, 0.95)
	return Fx.card_color(card)


func _apply(id: int, node: CardNode, modes: Array[int], hovers: bool, link: Color, color: Color, loyalty: int, particle: int, now: float) -> void:
	var e: Entry = _entries.get(id)
	if e and e.node.get_ref() != node:
		_remove(id)
		e = null
	if e == null:
		e = Entry.new()
		e.node = weakref(node)
		e.seed = fposmod(float(id) * 0.6180339, 1.0)
		e.born = now
		e.holder = node.float_node()
		e.layer = MeshInstance3D.new()
		e.layer.name = "Ambient"
		e.layer.mesh = _plane()
		e.layer.material_override = shared_material()
		e.layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		e.layer.position = Vector3(0, LAYER_Y, 0)
		e.holder.add_child(e.layer)
		e.on_hover = _on_hover.bind(id)
		node.hover_changed.connect(e.on_hover)
		e.hovered = node.hovered
		_entries[id] = e
	e.modes = modes
	e.hovers = hovers
	var a: int = modes[0] if modes.size() > 0 else 0
	var b: int = modes[1] if modes.size() > 1 else 0
	e.layer.set_instance_shader_parameter("slots", Vector4(a, b, e.seed, e.gain))
	e.layer.set_instance_shader_parameter("tint", Vector4(color.r, color.g, color.b, loyalty))
	e.layer.set_instance_shader_parameter("link", Vector4(link.r, link.g, link.b, link.a * 0.8 if link.a != 0.0 else 0.0))
	e.layer.visible = a != 0 or link.a != 0.0
	if not hovers:
		_settle_float(e)
	_set_motes(e, particle)


func _set_motes(e: Entry, particle: int) -> void:
	var current: int = int(e.motes.get_meta("mode")) if e.motes else AmbientTraits.Mode.NONE
	if current == particle:
		return
	if e.motes:
		e.motes.queue_free()
		e.motes = null
	if particle != AmbientTraits.Mode.NONE:
		e.motes = AmbientMotes.emitter(particle)
		e.motes.set_meta("mode", particle)
		e.holder.add_child(e.motes)


func _remove(id: Variant) -> void:
	var e: Entry = _entries.get(id)
	_entries.erase(id)
	if e == null:
		return
	var node: CardNode = e.node.get_ref() as CardNode
	if node and is_instance_valid(node):
		if node.hover_changed.is_connected(e.on_hover):
			node.hover_changed.disconnect(e.on_hover)
		node.set_shadow_spread(1.0)
	if e.holder and is_instance_valid(e.holder):
		e.holder.position.y = 0.0
	if e.layer and is_instance_valid(e.layer):
		e.layer.queue_free()
	if e.motes and is_instance_valid(e.motes):
		e.motes.queue_free()


## A carta deixou de voar: o desenho volta ao lugar.
func _settle_float(e: Entry) -> void:
	if e.rise > 0.0 and is_instance_valid(e.holder):
		e.rise = 0.0
		e.holder.position.y = 0.0
		var node: CardNode = e.node.get_ref() as CardNode
		if node:
			node.set_shadow_spread(1.0)


func _on_hover(_card: CardNode, on: bool, id: int) -> void:
	var e: Entry = _entries.get(id)
	if e:
		e.hovered = on
		_aim(e, _now())


## Recalcula aonde vai a força da carta (entrada, escurecida pelo prompt, mouse em cima).
func _aim(e: Entry, now: float) -> void:
	var entering: float = clampf((now - e.born - FADE_DELAY) / FADE_TIME, 0.0, 1.0)
	e.goal = entering * (1.0 - e.dim * 0.85) * (HOVER_GAIN if e.hovered else 1.0)


# — A cada quadro —

## Barato com o campo cheio: a cada quadro só andam as cartas que estão mudando de força e as que pairam; o resto (o
## escurecer do prompt, a entrada) é olhado POLL_RATE vezes por segundo. A animação em si roda toda no shader.
func _process(delta: float) -> void:
	if table == null:
		return
	if level() != _quality or enabled != _enabled_seen:
		refresh()
	if _entries.is_empty():
		return
	var now: float = _now()
	if _gain_goal < 1.0 and now >= _quiet_until:
		_update_quiet(table.current_state())
	# Os momentos grandes chegam rápido; a volta é devagar.
	if not is_equal_approx(_gain_now, _gain_goal):
		var rate: float = 3.0 if _gain_goal < _gain_now else 0.8
		_gain_now = move_toward(_gain_now, _gain_goal, delta * rate)
		shared_material().set_shader_parameter("gain_all", _gain_now)
	_poll -= delta
	var polled: bool = _poll <= 0.0
	if polled:
		_poll = 1.0 / POLL_RATE
	var bob_phase: float = now * TAU / BOB_TIME
	for e: Entry in _entries.values():
		if polled:
			var node: CardNode = e.node.get_ref() as CardNode
			if node == null:
				continue
			e.dim = node.dim_goal()
			_aim(e, now)
			if e.motes:
				e.motes.emitting = e.gain > 0.3 and _gain_now > 0.6
		if e.gain != e.goal:
			e.gain = move_toward(e.gain, e.goal, delta * 2.0)
			e.layer.set_instance_shader_parameter("slots", Vector4(e.modes[0] if e.modes.size() > 0 else 0, e.modes[1] if e.modes.size() > 1 else 0, e.seed, e.gain))
		if e.hovers:
			_bob(e, now, delta, bob_phase)


## Voar: sobe devagar depois da entrada e então balança; a sombra fica no tampo e se espalha um pouco.
func _bob(e: Entry, now: float, delta: float, bob_phase: float) -> void:
	var target: float = clampf((now - e.born - FADE_DELAY) / FADE_TIME, 0.0, 1.0)
	if e.rise != target:
		e.rise = move_toward(e.rise, target, delta * 1.2)
		var node: CardNode = e.node.get_ref() as CardNode
		if node:
			node.set_shadow_spread(1.0 + e.rise * 0.18)
	if is_instance_valid(e.holder):
		e.holder.position.y = e.rise * (HOVER_HEIGHT + sin(bob_phase + e.seed * TAU) * BOB)


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0
