# As permanentes no campo (FieldLayout): fileiras, montes de cópias, anexos em leque, as exiladas saindo por baixo, a linha
# entre os grupos e a pose do combate (o atacante avança e inclina para quem ataca; o bloqueador anda até a frente do
# atacante). Parte da TableView.
class_name FieldPlacement
extends RefCounted

const TAP_ANGLE := -PI / 2.0
## Altura das permanentes sobre o tampo: a carta tem espessura, e a face de baixo não pode encostar no tampo.
const FIELD_Y := CardNode.THICKNESS + 0.004
## Quanto o atacante avança para o meio da mesa, quanto sobe e quanto inclina no máximo para o lado de quem ataca.
const ATTACK_ADVANCE := 0.6
const ATTACK_RISE := 0.05
const ATTACK_MAX_TILT := deg_to_rad(9.0)
## Quanto do caminho até o atacante o bloqueador anda, e no máximo quanto (unidades da mesa); como src/ui/combatPose.ts.
const BLOCK_REACH := 0.32
const BLOCK_MAX := 0.95
## "Atacar com tudo": os atacantes saem um depois do outro, com este intervalo.
const ATTACK_STAGGER := 0.07

var view: TableView
## Linha fina entre os grupos de uma fileira (criaturas | planeswalkers; artefatos | terrenos): "sep:<jogador>:<fileira>" → nó.
var _separators: Dictionary = {}
## Quem estava atacando no estado anterior (para o avanço em sequência de quem acabou de entrar no ataque).
var _attacking_before: Dictionary = {}
## Atacantes esperando a vez de avançar: id → a pose final.
var _staggered: Dictionary = {}


func _init(table: TableView) -> void:
	view = table


# — Regras da pose (sem cena, para os testes) —

## A inclinação (radianos, em torno do eixo vertical) do atacante com o defensor a (dx, dz) dele. `side` é 1 para as
## suas cartas (atacam para cima na tela) e -1 para as do oponente: o alto da carta (ou o pé, no oponente) aponta para
## o defensor, só um pouco (35% do ângulo), como attackTilt de src/ui/combatPose.ts.
static func attack_tilt(dx: float, dz: float, side: int) -> float:
	var raw: float = atan2(dx, maxf(absf(dz), 0.001))
	return clampf(raw * 0.35, -ATTACK_MAX_TILT, ATTACK_MAX_TILT) * (-1.0 if side > 0 else 1.0)


## Quanto o bloqueador anda na direção do atacante a `delta` dele (no plano do tampo).
static func block_offset(delta: Vector3) -> Vector3:
	var flat := Vector3(delta.x, 0, delta.z)
	var dist: float = flat.length()
	if dist < 0.01:
		return Vector3.ZERO
	return flat * (minf(dist * BLOCK_REACH, BLOCK_MAX) / dist)


# — Na mesa —

## As permanentes de todos os jogadores: primeiro o lugar de cada uma, depois a pose do combate, e só então cada carta
## vai para o lugar (assim a carta no combate não vai e volta a cada estado).
func place_all(players: Array, frames: Dictionary, seen: Dictionary, names: PackedStringArray) -> void:
	var placements: Array = []
	for raw: Variant in players:
		var player: Dictionary = raw
		_layout_player(player, frames[int(player["id"])], placements)
	var by_id: Dictionary = {}
	for p: Dictionary in placements:
		by_id[int((p["card"] as Dictionary)["id"])] = p
	var delays: Dictionary = _combat_pose(by_id, frames)
	for p: Dictionary in placements:
		var card: Dictionary = p["card"]
		var id: int = int(card["id"])
		var t: Transform3D = p["t"]
		var delay: float = float(delays.get(id, 0.0))
		if delay > 0.0 or _staggered.has(id):
			# Ainda não é a vez dele: fica onde estava (o lugar sem combate) e avança no tempo dele.
			if not _staggered.has(id):
				_schedule_advance(id, delay)
			_staggered[id] = t
			t = p["base"]
		if p.has("exiled_key"):
			_put_exiled(p, t, seen, names)
		else:
			_put_permanent(card, t, p["sleeve"], seen, names, p["badges"], float(p["boost"]))


func _layout_player(player: Dictionary, frame: Dictionary, out: Array) -> void:
	var ctx: Dictionary = view.badge_context()
	var sleeve: Color = view.sleeve_of(int(player["id"]))
	var scale: float = frame["scale"]
	var rows: Dictionary = FieldLayout.rows(player, ctx, float(frame["width"]) / scale)
	for row: String in ["front", "back"]:
		var z: float = float(frame["others_z"] if row == "front" else frame["lands_z"])
		_place_separator("sep:%d:%s" % [int(player["id"]), row], rows[row], frame, z)
		# Os selos crescem um pouco nas cartas menores e mais longe da câmera, para continuarem legíveis.
		var boost: float = (1.0 + maxf(0.0, -z) * 0.07) / sqrt(scale)
		for raw: Variant in rows[row]:
			var item: Dictionary = raw
			var cards: Array = item["cards"]
			var squeeze: float = item["squeeze"]
			for k: int in cards.size():
				var card: Dictionary = cards[k]
				var tapped: bool = bool(card.get("tapped", false))
				var x: float = float(frame["cx"]) + (float(item["x"]) + k * FieldLayout.copy_step(cards.size(), tapped) * squeeze) * scale
				var t := Transform3D(field_basis(tapped, scale), Vector3(x, FIELD_Y + 0.004 * k + 0.008, z))
				var top: bool = k == cards.size() - 1
				out.append({"card": card, "t": t, "base": t, "sleeve": sleeve, "side": int(frame["side"]), "boost": boost,
					"badges": BadgeSpec.for_pile(cards, ctx) if top else {}})
				if k == 0:
					_layout_attachments(card, t, scale, squeeze, out)
					_layout_exiled(card, t, scale, squeeze, out)


## Auras e equipamentos presos a `host`: atrás dela, cada um um pouco mais para a direita e para o alto, menores.
func _layout_attachments(host: Dictionary, host_t: Transform3D, scale: float, squeeze: float, out: Array) -> void:
	var atts: Array = (view.badge_context()["attachments"] as Dictionary).get(int(host["id"]), [])
	var rise: float = FieldLayout.ATTACH_RISE * FieldLayout.CARD.y * minf(1.0, 1.5 / maxf(atts.size(), 1))
	for i: int in atts.size():
		var card: Dictionary = atts[i]
		var n: int = i + 1
		var offset := Vector3(FieldLayout.ATTACH_STEP * FieldLayout.CARD.x * n * squeeze, -0.003 * n, -rise * n) * scale
		var att_scale: float = scale * FieldLayout.ATTACH_SCALE
		var t := Transform3D(field_basis(bool(card.get("tapped", false)), att_scale), host_t.origin + offset)
		t.origin.y = maxf(t.origin.y, FIELD_Y)
		out.append({"card": card, "t": t, "base": t, "sleeve": view.sleeve_of(int(card.get("controller", 0))), "side": 0, "boost": 1.0,
			"badges": {}, "host": int(host["id"])})


## As cartas exiladas por `host` (Oblivion Ring) e pelo que está preso a ela: por baixo dela, saindo pela borda de baixo,
## um pouco para a esquerda, esmaecidas. São cópias de vista (a chave é "exu:<id>"): a carta mesmo continua no exílio.
func _layout_exiled(host: Dictionary, host_t: Transform3D, scale: float, squeeze: float, out: Array) -> void:
	var under: Array = (view.badge_context().get("exiled_under", {}) as Dictionary).get(int(host["id"]), [])
	var tapped: bool = bool(host.get("tapped", false))
	var usable: Dictionary = view.badge_context().get("usable", {})
	for j: int in mini(under.size(), FieldLayout.EXILED_SHOWN):
		var card: Dictionary = (under[j] as Dictionary)["card"]
		var off: Vector2 = FieldLayout.exiled_offset(j, under.size())
		# Virada, a carta de baixo vira junto e a faixa que aparece é a da altura da carta deitada.
		if tapped:
			off.y *= FieldLayout.CARD.x / FieldLayout.CARD.y
		var offset := Vector3(off.x * squeeze, -0.003 * (j + 1), off.y) * scale
		var t := Transform3D(field_basis(tapped, scale * FieldLayout.EXILED_SCALE), host_t.origin + offset)
		t.origin.y = maxf(t.origin.y, FIELD_Y)
		# A que acabou de ser exilada sai de baixo da permanente.
		var from := Transform3D(t.basis, Vector3(host_t.origin.x, t.origin.y, host_t.origin.z))
		out.append({"card": card, "t": t, "base": t, "from": from, "sleeve": view.sleeve_of(int(card.get("owner", card.get("controller", 0)))),
			"side": 0, "boost": 1.0, "badges": {}, "host": int(host["id"]), "exiled_key": "exu:%d" % int(card["id"]),
			"usable": usable.has(int(card["id"]))})


## A pose do combate sobre os lugares já calculados (muda `t` das cartas no combate). Devolve id → atraso do avanço
## dos atacantes que acabaram de entrar no ataque (vários de uma vez: um depois do outro, da esquerda para a direita).
func _combat_pose(by_id: Dictionary, frames: Dictionary) -> Dictionary:
	var attacking: Dictionary = {}
	var state: Dictionary = view.current_state()
	for raw: Variant in state.get("combat", []):
		attacking[int((raw as Dictionary).get("attacker", -1))] = raw
	for id: Variant in by_id:
		var card: Dictionary = (by_id[id] as Dictionary)["card"]
		if bool(card.get("attacking", false)) and not attacking.has(int(id)):
			attacking[int(id)] = {}
	# Atacantes: avançam, sobem um pouco e inclinam para quem atacam (os anexos vão junto).
	var fresh: Array = []
	for id: int in attacking:
		if not by_id.has(id):
			continue
		var p: Dictionary = by_id[id]
		var side: int = int(p["side"])
		var t: Transform3D = p["t"]
		t.origin.z -= side * ATTACK_ADVANCE
		t.origin.y += ATTACK_RISE
		var defender: Variant = _defender_position(attacking[id], by_id)
		if defender is Vector3:
			var tilt: float = attack_tilt((defender as Vector3).x - t.origin.x, (defender as Vector3).z - t.origin.z, side)
			t.basis = Basis(Vector3.UP, tilt) * t.basis
		_shift_attachments(by_id, id, t.origin - (p["t"] as Transform3D).origin)
		p["t"] = t
		if not _attacking_before.has(id):
			fresh.append(id)
	# Bloqueadores: andam até a frente do atacante que bloqueiam e ficam lá até o dano.
	for id: int in attacking:
		var entry: Variant = attacking[id]
		if not entry is Dictionary or not by_id.has(id):
			continue
		var attacker_at: Vector3 = ((by_id[id] as Dictionary)["t"] as Transform3D).origin
		for raw_blocker: Variant in (entry as Dictionary).get("blockers", []):
			var blocker: int = int(raw_blocker)
			if not by_id.has(blocker):
				continue
			var b: Dictionary = by_id[blocker]
			var bt: Transform3D = b["t"]
			var offset: Vector3 = block_offset(attacker_at - bt.origin)
			bt.origin += offset + Vector3(0, 0.02, 0)
			_shift_attachments(by_id, blocker, offset)
			b["t"] = bt
	_attacking_before = {}
	for id: int in attacking:
		_attacking_before[id] = true
	var delays: Dictionary = {}
	if fresh.size() > 1:
		fresh.sort_custom(func(a: int, b: int) -> bool: return ((by_id[a] as Dictionary)["t"] as Transform3D).origin.x < ((by_id[b] as Dictionary)["t"] as Transform3D).origin.x)
		for i: int in fresh.size():
			if i > 0:
				delays[fresh[i]] = i * ATTACK_STAGGER
	return delays


## Onde está quem o atacante ataca: o retrato do jogador (levado para a mesa) ou a permanente atacada.
func _defender_position(entry: Variant, by_id: Dictionary) -> Variant:
	if not entry is Dictionary or (entry as Dictionary).get("defender") == null:
		return null
	var e: Dictionary = entry
	var id: int = int(e["defender"])
	if Txt.of(e.get("defenderKind", "player")) == "card":
		return ((by_id[id] as Dictionary)["t"] as Transform3D).origin if by_id.has(id) else view.anchor(id)
	var at: Variant = view.anchor("player:%d" % id)
	if at is Vector3:
		return at
	var frame: Dictionary = view.frame_of(id)
	return frame.get("portrait") if not frame.is_empty() and int(frame["side"]) < 0 else null


func _shift_attachments(by_id: Dictionary, host: int, offset: Vector3) -> void:
	for id: Variant in by_id:
		var p: Dictionary = by_id[id]
		if int(p.get("host", -1)) == host:
			var t: Transform3D = p["t"]
			t.origin += offset
			p["t"] = t


## O atacante que espera a vez avança depois de `delay` (para a pose guardada em _staggered, a mais nova).
func _schedule_advance(id: int, delay: float) -> void:
	var weak: WeakRef = weakref(self)
	var view_ref: WeakRef = weakref(view)
	view.get_tree().create_timer(delay).timeout.connect(func() -> void:
		var me: FieldPlacement = weak.get_ref() as FieldPlacement
		var table: TableView = view_ref.get_ref() as TableView
		if me == null or table == null or not me._staggered.has(id):
			return
		var t: Transform3D = me._staggered[id]
		me._staggered.erase(id)
		var node: CardNode = table.card_node(id)
		if node:
			node.move_to(t))


static func field_basis(tapped: bool, scale: float) -> Basis:
	var basis := Basis.from_scale(Vector3(scale, scale, scale))
	if tapped:
		basis = Basis(Vector3.UP, TAP_ANGLE).scaled(Vector3(scale, scale, scale))
	return basis


## Põe uma permanente na mesa com os selos dela.
func _put_permanent(card: Dictionary, t: Transform3D, sleeve: Color, seen: Dictionary, names: PackedStringArray, badges: Dictionary, boost: float = 1.0) -> void:
	var id: int = int(card["id"])
	view.put_card(id, card, "battlefield", t, sleeve, seen, names)
	var node: CardNode = view.card_node(id)
	if node:
		node.set_badges(badges, bool(card.get("tapped", false)), bool(card.get("faceDown", false)), boost)


## Põe a cópia de vista de uma carta exilada por baixo da permanente. O nó responde como a carta exilada (o clique abre
## o exílio, ou a usa se dá para usar; o mouse mostra a carta); esmaecido por um véu, menos quando dá para usar.
func _put_exiled(p: Dictionary, t: Transform3D, seen: Dictionary, names: PackedStringArray) -> void:
	var key: String = p["exiled_key"]
	var card: Dictionary = p["card"]
	var fresh: bool = view.card_node(key) == null
	view.put_card(key, card, "exiled_under", p["from"] if fresh else t, p["sleeve"], seen, names)
	var node: CardNode = view.card_node(key)
	if node == null:
		return
	node.card_id = int(card["id"])
	if fresh:
		node.move_to(t)
	var veil: MeshInstance3D = node.get_node_or_null("ExileVeil") as MeshInstance3D
	if veil == null:
		veil = exile_veil()
		node.add_child(veil)
	veil.visible = not bool(p.get("usable", false)) and not bool(card.get("faceDown", false))


## O véu da carta exilada por baixo de uma permanente: azul-escuro translúcido, com os cantos da carta e um fio azulado
## na borda (como o filtro e o contorno de .exu no navegador).
static func exile_veil() -> MeshInstance3D:
	var veil := MeshInstance3D.new()
	veil.name = "ExileVeil"
	var quad := PlaneMesh.new()
	quad.size = CardNode.SIZE
	veil.mesh = quad
	var w: int = 126
	var h: int = 176
	var svg: String = '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d"><rect x="1.5" y="1.5" width="%d" height="%d" rx="6" fill="#0a0f22" fill-opacity=".5" stroke="#8fa6ff" stroke-opacity=".55" stroke-width="2"/></svg>' % [w, h, w - 3, h - 3]
	var material := StandardMaterial3D.new()
	material.albedo_texture = CardIcons.svg_texture("exile-veil", svg)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	veil.material_override = material
	veil.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	veil.position = Vector3(0, 0.0015, 0)
	return veil


## A linha entre o primeiro e o segundo grupo de uma fileira, no meio do vão entre eles (escondida com um grupo só).
func _place_separator(key: String, items: Array, frame: Dictionary, z: float) -> void:
	var line: MeshInstance3D = _separators.get(key)
	var at: float = INF
	for i: int in range(1, items.size()):
		var a: Dictionary = items[i - 1]
		var b: Dictionary = items[i]
		if int(a["group"]) != int(b["group"]):
			var squeeze: float = b["squeeze"]
			var a_right: float = float(a["x"]) + (float(a["width"]) - (FieldLayout.CARD.y if bool(a["tapped"]) else FieldLayout.CARD.x) / 2.0) * squeeze
			var b_left: float = float(b["x"]) - (FieldLayout.CARD.y if bool(b["tapped"]) else FieldLayout.CARD.x) / 2.0 * squeeze
			at = (a_right + b_left) / 2.0
	if at == INF:
		if line:
			line.visible = false
		return
	if line == null:
		line = MeshInstance3D.new()
		var quad := PlaneMesh.new()
		quad.size = Vector2(0.014, FieldLayout.CARD.y * 0.8)
		line.mesh = quad
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.albedo_color = Color(0.95, 0.71, 0.3, 0.28)
		line.material_override = material
		line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		view.add_child(line)
		_separators[key] = line
	var scale: float = frame["scale"]
	line.visible = true
	line.scale = Vector3(scale, 1, scale)
	line.position = Vector3(float(frame["cx"]) + at * scale, -0.006, z)
