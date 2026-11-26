# A física de papel das cartas, só a conta (sem cena, testável): o voo com arraste do ar, o descolar da mesa, o pouso
# rente que escorrega uns milímetros, o virar no lugar, os montes com espessura e a bagunça arrumada de cada carta,
# sempre igual para o mesmo id.
class_name PaperPhysics
extends RefCounted

## Espessura de uma carta num monte (cemitério, exílio, grimório), em unidades da carta (a escala do jogador multiplica).
const PILE_STEP := 0.004
## Até quantas cartas o monte cresce; acima disso as cartas ficam mais finas, para o monte não virar uma torre.
const PILE_CAP := 60
## Altura da face de baixo da carta de baixo do monte (a mesma das permanentes: FieldPlacement.FIELD_Y − espessura).
const PILE_BASE := 0.004
## A bagunça arrumada do monte: quanto cada carta sai do lugar (unidades da carta) e quanto gira (radianos).
const PILE_JITTER := 0.022
const PILE_YAW := 0.075
## Onde fica a luz principal (TableEnvironment): a sombra de contato se afasta dela quando a carta sobe.
const LAMP := Vector3(0, 6.0, 0.9)

## Escorregão depois de encostar na mesa (unidades da carta: 0,63 = 63 mm, então 0,035 ≈ 3,5 mm).
const SLIDE := 0.035
## Descolar: quanto a borda da frente sobe antes de a carta sair (radianos) e quanto tempo isso leva.
const PEEL := 0.3
const PEEL_LEAD := 0.06
const PEEL_TIME := 0.2
## Inclinação pela velocidade (o ar levanta a borda da frente) e a velocidade (unidades/s) em que ela chega ao máximo.
const PITCH := 0.15
const SPEED_REF := 6.0
## Quanto a carta gira para o lado em que vai (fração do ângulo até o rumo, com o máximo em radianos).
const YAW_INTO := 0.22
const YAW_MAX := 0.16
## Balanço do ar nos voos longos (radianos) e a partir de que distância ele aparece.
const FLUTTER := 0.05
const FLUTTER_FROM := 2.2
## O tapa do pouso: quanto a carta afunda (amassa o ar embaixo) e balança, e quanto dura o fim depois do movimento.
const SLAP_DIP := 0.004
const SLAP_ROCK := 0.022
const SETTLE_TAIL := 0.2
## Virar (tap): a duração e o quanto a carta sobe no começo.
const TURN_TIME := 0.45
const TURN_LIFT := 0.018

enum Kind { ARC, SLIDE, TURN, AIR }


# — Sorteio fixo por carta —

## Um número de 0 a 1 que só depende do id e de `salt` (a mesma carta cai sempre do mesmo jeito).
static func hash01(id: int, salt: int) -> float:
	var h: int = (id * 73856093) ^ (salt * 19349663) ^ 0x5bd1e995
	h = (h ^ (h >> 13)) * 0x5bd1e995
	h = h ^ (h >> 15)
	return float(h & 0xffffff) / float(0x1000000)


## De −1 a 1, fixo por id e `salt`.
static func signed(id: int, salt: int) -> float:
	return hash01(id, salt) * 2.0 - 1.0


# — Montes —

## A espessura de cada carta num monte de `count` (unidades da carta): PILE_STEP até PILE_CAP, depois mais fina.
static func pile_step(count: int) -> float:
	return PILE_STEP * minf(1.0, float(PILE_CAP) / maxf(count, 1))


## O lugar da carta `index` (0 é a de baixo) num monte de `count` em `base` (no tampo), com a escala do jogador. A face
## de cima de cada carta fica sobre a de baixo (nada atravessa), com um pouco de bagunça fixa pelo id. `face_down` só
## acerta a altura (a carta virada tem a face embaixo); o giro de costas fica com quem põe.
static func pile_pose(base: Vector3, scale: float, id: int, index: int, count: int, face_down: bool = false) -> Transform3D:
	var step: float = pile_step(count) * scale
	var jitter := Vector3(signed(id, 1), 0, signed(id, 2)) * PILE_JITTER * scale
	var yaw: float = signed(id, 3) * PILE_YAW
	var basis: Basis = Basis(Vector3.UP, yaw).scaled(Vector3.ONE * scale)
	var y: float = PILE_BASE + step * (index + 1)
	if face_down:
		# Virada (quem põe gira a carta: TableView.put_card), a face fica embaixo e a espessura sobe a partir dela.
		y = PILE_BASE + step * index
	return Transform3D(basis, base + Vector3(jitter.x, y, jitter.z))


## A altura do alto de um monte de `count` cartas (onde a próxima pousa e de onde a comprada sai).
static func pile_top(base: Vector3, scale: float, count: int) -> Vector3:
	return base + Vector3(0, PILE_BASE + pile_step(count) * scale * count, 0)


## O grimório: um bloco só, virado para baixo, com a face (o verso de quem olha) no tampo e a espessura de `count` cartas.
## Devolve [transform, profundidade em unidades da carta] (CardNode.set_pile_depth).
static func library_pose(base: Vector3, scale: float, count: int) -> Array:
	var depth: float = pile_step(count) * mini(count, PILE_CAP)
	var t := Transform3D(Basis(Vector3.FORWARD, PI).scaled(Vector3.ONE * scale), base + Vector3(0, PILE_BASE, 0))
	return [t, depth]


# — Curvas —

## O avanço no caminho: sai rápido e o ar freia na chegada (velocidade zero só no fim).
static func travel(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return 1.0 - pow(1.0 - u, 3.0) * (1.0 + 3.0 * u)


## A velocidade de travel (derivada em u).
static func travel_speed(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return 12.0 * u * (1.0 - u) * (1.0 - u)


## O arco do voo (0 a 1, topo em 0,4): sobe depressa e plana na descida, encostando quase sem velocidade vertical
## (o colchão de ar).
static func glide(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return 5.379 * u * pow(1.0 - u, 1.5)


## Para a altura de descanso entre a saída e a chegada: chega devagar.
static func level(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return 1.0 - (1.0 - u) * (1.0 - u)


## A altura entre a saída e a chegada: acompanha o caminho (a carta que desce da mão não some atrás dela) e chega sem
## velocidade vertical (o colchão de ar).
static func descend(a: float) -> float:
	a = clampf(a, 0.0, 1.0)
	return a + a * a - a * a * a


## A carta deitada no tampo (de face ou de costas) e baixa: pousa com escorregão e tapa.
static func on_table(t: Transform3D) -> bool:
	var up: Vector3 = t.basis.y.normalized()
	return absf(up.y) > 0.97 and t.origin.y < 0.6


# — O voo —

## Um movimento planejado de `from` a `to`: chame pose(tempo) a cada quadro, de 0 até total.
class Flight:
	extends RefCounted
	var kind: int = Kind.AIR
	var from: Transform3D
	var to: Transform3D
	var q0: Quaternion
	var q1: Quaternion
	var s0: float = 1.0
	var s1: float = 1.0
	## Rumo no plano do tampo (unitário; zero se não anda) e a distância nesse plano.
	var dir := Vector3.ZERO
	var dist: float = 0.0
	var arc: float = 0.0
	var slide: float = 0.0
	var peel: float = 0.0
	var lead: float = 0.0
	var flutter: float = 0.0
	var phase: float = 0.0
	## Duração do movimento, o fim (com o assentar) e quando encosta na mesa (segundos).
	var duration: float = 0.3
	var total: float = 0.3
	var touch_time: float = 0.3
	var slap: float = 0.0
	var lands: bool = false
	var from_flat: bool = false
	var rock_axis := Vector3.RIGHT
	## Desvio do caminho no tampo (controle de uma curva, a partir de `to`): a aura que entra por baixo da criatura
	## passa por trás dela e chega deslizando de lá (tuck). Zero: reto.
	var bend := Vector3.ZERO
	## Em que parte do caminho a carta já chega à altura final (1 = no toque; menos na aura, que entra rente por baixo).
	var level_at: float = 1.0
	## O rumo de agora (a tangente do caminho), refeito a cada pose.
	var _heading := Vector3.ZERO

	## Chega por baixo de quem está em `host` (no tampo): o caminho passa por trás e entra deslizando de lá.
	func tuck_under(host: Vector3) -> void:
		var away := Vector3(to.origin.x - host.x, 0, to.origin.z - host.z)
		if not lands or kind == Kind.TURN or away.length() < 0.01:
			return
		bend = away.normalized() * (1.6 + away.length()) * s1
		level_at = 0.6
		var flat_from := Vector3(from.origin.x, 0, from.origin.z)
		var flat_to := Vector3(to.origin.x, 0, to.origin.z)
		var c: Vector3 = flat_to + bend
		dist = ((c - flat_from).length() + bend.length() + (flat_to - flat_from).length()) / 2.0
		dir = -bend.normalized()
		rock_axis = dir.cross(Vector3.UP).normalized()
		touch_time = lead + (duration - lead) * PaperPhysics._solve_travel(1.0 - slide / dist)

	## A pose no instante `time` (segundos); em `total` é exatamente `to`.
	func pose(time: float) -> Transform3D:
		if time >= total:
			return to
		if kind == Kind.TURN:
			return _turn_pose(time)
		var u: float = clampf((time - lead) / (duration - lead), 0.0, 1.0)
		var s: float = PaperPhysics.travel(u)
		var touch_s: float = 1.0 - (slide / dist if dist > 0.0001 else 0.0)
		var a: float = clampf(s / maxf(touch_s, 0.0001), 0.0, 1.0)
		var flat_from := Vector3(from.origin.x, 0, from.origin.z)
		var flat_to := Vector3(to.origin.x, 0, to.origin.z)
		var pos: Vector3 = flat_from.lerp(flat_to, s)
		_heading = dir
		if bend != Vector3.ZERO:
			var c: Vector3 = flat_to + bend
			pos = flat_from.lerp(c, s).lerp(c.lerp(flat_to, s), s)
			_heading = ((c - flat_from) * (1.0 - s) + (flat_to - c) * s).normalized()
		var v: float = clampf(a / level_at, 0.0, 1.0)
		pos.y = lerpf(from.origin.y, to.origin.y, (PaperPhysics.descend(v) if from_flat else smoothstep(0.0, 1.0, v))) + arc * PaperPhysics.glide(v)
		var rot: Quaternion = q0.slerp(q1, PaperPhysics.level(clampf(a * 1.08, 0.0, 1.0)))
		var basis := Basis(rot)
		# Rente ao pouso, a carta já vem nivelada: tudo o que inclina some antes de encostar.
		var air: float = 1.0 - smoothstep(0.72, 0.98, a)
		var speed: float = dist * PaperPhysics.travel_speed(u) / maxf(duration - lead, 0.01)
		var speed_k: float = clampf(speed / SPEED_REF, 0.0, 1.0)
		if dist > 0.0001:
			var side: Vector3 = _heading.cross(Vector3.UP).normalized()
			# Descolar: a borda da frente sobe primeiro, presa na de trás (a carta gira em torno da borda que fica).
			var peel_k: float = 0.0
			if peel > 0.0:
				var p: float = clampf(time / PEEL_TIME, 0.0, 1.0)
				peel_k = peel * sin(PI * p) * (1.0 if time < lead else 1.0 - p * 0.3)
			# Na mão (no ar, sem arco) só um aceno; no tampo, metade; no arco, inteiro.
			var dyn: float = 1.0 if kind == Kind.ARC else (0.4 if kind == Kind.SLIDE else 0.25)
			var pitch: float = peel_k + PITCH * speed_k * air * dyn
			var yaw: float = 0.0 if kind == Kind.AIR else clampf(_yaw_into(basis) * YAW_INTO * speed_k * air, -YAW_MAX, YAW_MAX)
			var roll: float = flutter * sin(phase + time * TAU * 2.1) * pow(sin(PI * a), 2.0) * air
			basis = Basis(Vector3.UP, yaw) * Basis(_heading, roll) * Basis(side, pitch) * basis
			if peel_k > 0.0:
				pos.y += _extent(basis) * sin(peel_k) * 0.9
		pos.y += _slap_dip(time)
		basis = _slap_rock(time) * basis
		return Transform3D(basis.scaled(Vector3.ONE * lerpf(s0, s1, PaperPhysics.level(a))), pos)

	## A sombra de contato no instante `time`, com a carta em `pose` e espessura `depth`: [opacidade 0 a 1, transform
	## no mundo]. Fica no tampo (ou no alto do monte) embaixo da carta, deitada; `keep` = a carta tem sombra parada (sem
	## ela, a do voo se apaga no assentar).
	func shadow(time: float, pose: Transform3D, depth: float, keep: bool) -> Array:
		var rest: float = rest_y(time)
		var s: float = pose.basis.get_scale().x
		var ground: float = rest - (0.0015 if to.basis.y.y < 0.0 else depth + 0.0015) * s
		var look: Array = PaperPhysics.contact_shadow(pose.origin, pose.origin.y - rest)
		var alpha: float = look[1]
		if not keep:
			alpha *= 1.0 - clampf((time - touch_time) / maxf(total - touch_time, 0.01), 0.0, 1.0)
		var z: Vector3 = pose.basis.z
		var yaw: float = atan2(z.x, z.z) if Vector2(z.x, z.z).length() > 0.05 * s else 0.0
		var away: Vector3 = look[2]
		var flat := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * s * float(look[0]))
		return [alpha, Transform3D(flat, Vector3(pose.origin.x + away.x, ground, pose.origin.z + away.z))]

	## A altura do descanso embaixo da carta no instante `time` (onde a sombra de contato fica).
	func rest_y(time: float) -> float:
		if kind == Kind.TURN or time >= total:
			return to.origin.y
		var u: float = clampf((time - lead) / (duration - lead), 0.0, 1.0)
		var start: float = from.origin.y if from_flat else to.origin.y
		var touch_s: float = 1.0 - (slide / dist if dist > 0.0001 else 0.0)
		var a: float = clampf(PaperPhysics.travel(u) / maxf(touch_s, 0.0001), 0.0, 1.0)
		return lerpf(start, to.origin.y, PaperPhysics.descend(a))

	## Virar no lugar: sobe um tico no começo, gira em volta do centro e o atrito freia no fim.
	func _turn_pose(time: float) -> Transform3D:
		var u: float = clampf(time / duration, 0.0, 1.0)
		var r: float = PaperPhysics.travel(u)
		var basis := Basis(q0.slerp(q1, r))
		var pos: Vector3 = from.origin.lerp(to.origin, r)
		pos.y += TURN_LIFT * s1 * PaperPhysics.glide(u) * (1.0 - u)
		pos.y += _slap_dip(time)
		basis = _slap_rock(time) * basis
		return Transform3D(basis.scaled(Vector3.ONE * lerpf(s0, s1, r)), pos)

	## O tapa: afunda um tico ao encostar (o ar sai de baixo) e volta.
	func _slap_dip(time: float) -> float:
		var tau: float = time - touch_time
		if slap <= 0.0 or tau < 0.0:
			return 0.0
		return -SLAP_DIP * slap * s1 * sin(PI * clampf(tau / 0.1, 0.0, 1.0))

	## E um balanço curto que o atrito apaga (sem quicar: papel não quica).
	func _slap_rock(time: float) -> Basis:
		var tau: float = time - touch_time
		if slap <= 0.0 or tau < 0.0:
			return Basis.IDENTITY
		var fade: float = exp(-tau / 0.06) * (1.0 - clampf(tau / maxf(total - touch_time, 0.01), 0.0, 1.0))
		return Basis(rock_axis, SLAP_ROCK * slap * fade * sin(tau * TAU / 0.11))

	## Meia largura da carta na direção do rumo (para girar em torno da borda de trás).
	func _extent(basis: Basis) -> float:
		var x: float = absf(basis.x.normalized().dot(_heading))
		var z: float = absf(basis.z.normalized().dot(_heading))
		return 0.5 * (x * CardNode.SIZE.x + z * CardNode.SIZE.y) * s0

	## O ângulo (em volta do eixo vertical) do comprimento da carta até o rumo, dobrado entre −90° e 90°.
	func _yaw_into(basis: Basis) -> float:
		var axis := Vector3(basis.z.x, 0, basis.z.z)
		if axis.length() < 0.3:
			return 0.0
		axis = axis.normalized()
		var angle: float = atan2(axis.cross(_heading).y, axis.dot(_heading))
		if angle > PI / 2.0:
			angle -= PI
		elif angle < -PI / 2.0:
			angle += PI
		return angle


## Planeja o movimento de `from` a `to`. `arc` é a mudança de zona (sobe em arco); `id` fixa o balanço e o tapa.
## `base_time` é a duração dos movimentos no ar sem arco (a mão); `can_peel` = false não descola (a carta já vem do alto).
static func plan(from: Transform3D, to: Transform3D, arc: bool, id: int, base_time: float = 0.32, can_peel: bool = true) -> Flight:
	var f := Flight.new()
	f.from = from
	f.to = to
	f.q0 = from.basis.get_rotation_quaternion()
	f.q1 = to.basis.get_rotation_quaternion()
	f.s0 = from.basis.get_scale().x
	f.s1 = to.basis.get_scale().x
	var flat := Vector3(to.origin.x - from.origin.x, 0, to.origin.z - from.origin.z)
	f.dist = flat.length()
	f.dir = flat / f.dist if f.dist > 0.0001 else Vector3.ZERO
	f.lands = on_table(to)
	f.from_flat = on_table(from)
	f.phase = hash01(id, 7) * TAU
	f.rock_axis = f.dir.cross(Vector3.UP).normalized() if f.dist > 0.0001 else Vector3(cos(f.phase), 0, sin(f.phase))
	var turned: float = f.q0.angle_to(f.q1)
	if f.lands and f.from_flat and not arc and f.dist < 0.05 and absf(from.origin.y - to.origin.y) < 0.05:
		# Virar ou desvirar (ou um ajuste mínimo): gira no lugar.
		f.kind = Kind.TURN
		f.duration = TURN_TIME if turned > 0.2 else 0.18
		f.slap = 0.35 if turned > 0.2 else 0.0
		f.touch_time = f.duration * 0.8
		f.total = f.duration + (SETTLE_TAIL * 0.6 if f.slap > 0.0 else 0.0)
		return f
	var drop: float = maxf(0.0, from.origin.y - to.origin.y)
	if arc:
		f.kind = Kind.ARC
		f.duration = clampf(0.4 + 0.04 * f.dist, 0.44, 0.64)
		# Da mão (no alto, perto da câmera) a carta sobe por cima do leque e só então desce, para não sumir atrás dele.
		f.arc = clampf(0.2 * f.dist, 0.3, 0.9) if f.from_flat else 1.0
		f.flutter = FLUTTER * clampf((f.dist - FLUTTER_FROM) / 3.0, 0.0, 1.0) * (1.0 if hash01(id, 8) > 0.5 else -1.0)
		f.peel = PEEL if f.from_flat and can_peel else 0.0
	elif f.lands:
		f.kind = Kind.SLIDE
		f.duration = clampf(0.26 + 0.05 * f.dist, 0.26, 0.42)
		f.arc = clampf(0.03 + 0.04 * f.dist, 0.03, 0.12) * clampf(1.0 - drop / 2.5, 0.3, 1.0)
		f.peel = PEEL * 0.4 if f.from_flat and can_peel else 0.0
	else:
		f.kind = Kind.AIR
		f.duration = base_time
	f.lead = PEEL_LEAD if f.peel > 0.0 else 0.0
	f.duration += f.lead
	if f.lands:
		f.slide = SLIDE * f.s1 * (1.0 if arc else 0.5)
		if f.dist < f.slide * 4.0:
			f.slide = 0.0
		f.slap = 1.0 if arc else 0.5
		f.touch_time = f.lead + (f.duration - f.lead) * _solve_travel(1.0 - (f.slide / f.dist if f.dist > 0.0001 else 0.0))
		f.total = f.duration + SETTLE_TAIL * f.slap
	else:
		f.touch_time = f.duration
		f.total = f.duration
	return f


## O u em que travel(u) chega a `s` (bisseção: travel só cresce).
static func _solve_travel(s: float) -> float:
	if s >= 1.0:
		return 1.0
	var lo: float = 0.0
	var hi: float = 1.0
	for i: int in 24:
		var mid: float = (lo + hi) / 2.0
		if travel(mid) < s:
			lo = mid
		else:
			hi = mid
	return hi


# — Sombra de contato —

## A sombra de contato de uma carta `height` acima do descanso: [quanto cresce, opacidade 0 a 1, deslocamento no tampo
## (para longe da luz)]. Rente, apertada e escura; subindo, abre e some.
static func contact_shadow(pos: Vector3, height: float) -> Array:
	var h: float = maxf(height, 0.0)
	var spread: float = 1.0 + h * 1.5
	var alpha: float = pow(clampf(1.0 - h / 0.85, 0.0, 1.0), 1.6)
	var away := Vector3(pos.x - LAMP.x, 0, pos.z - LAMP.z) * (h / maxf(LAMP.y - h, 0.5))
	return [spread, alpha, away]
