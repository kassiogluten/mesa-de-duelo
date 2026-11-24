# Onde fica cada zona de cada jogador na mesa 3D: você embaixo; um oponente em cima, ou até três em colunas lado a lado
# (como no Commander da mesa do navegador), com as cartas um pouco menores.
class_name SeatLayout
extends RefCounted

## Largura da faixa dos oponentes quando há mais de um (unidades da mesa; a carta tem 0,63).
const OPPONENTS_WIDTH := 16.0

## O comandante na zona de comando fica fora do campo, junto do retrato, menor que as permanentes e um pouco inclinado,
## como uma carta em exposição: girado no tampo e com a ponta de cima um pouco erguida (radianos).
const COMMAND_YAW := 0.14
const COMMAND_PITCH := 0.3
## O tamanho do comandante dos oponentes, em relação às cartas do campo deles.
const COMMAND_SCALE := 0.85
## O filete dourado da sua metade (my_half de table/table_top.gdshader): z de onde começa a onde termina e meia largura.
const MY_HALF := Vector3(0.2, 2.75, 6.6)
## O seu retrato no HUD (Hud.MY_PORTRAIT e MY_SIDE): centro a partir do canto de baixo à esquerda e o raio, em pixels da
## tela de 1080 de altura (a medida da interface e da câmera, com a tela esticada).
const MY_PORTRAIT := Vector2(99, -119)
const MY_PORTRAIT_RADIUS := 65.0
## A altura na tela do seu comandante: a maior que cabe acima do retrato sem entrar na borda dourada, até o limite; numa
## tela 16:9 cabe pouco (a borda passa logo acima do retrato), numa larga ele fica maior, à esquerda do campo.
const MY_COMMAND_MAX_PX := 124.0
const MY_COMMAND_MIN_PX := 52.0
## O vão entre o retrato e a carta: o selo de coroa e taxa, colado embaixo dela, ocupa a metade de baixo dele.
const MY_COMMAND_GAP_PX := 22.0
## A folga da carta para a borda dourada (unidades da mesa).
const BORDER_ROOM := 0.05


## As zonas de quem recebe o estado.
static func mine() -> Dictionary:
	return {
		"side": 1, "cx": 0.0, "width": 7.4, "scale": 1.0, "lands_z": 2.2, "others_z": 0.95,
		# Lotada, a fileira se estica até esta largura para a direita, o lado sem as pilhas (FieldPlacement).
		"wide_width": 9.3, "wide_shift": 0.95,
		"library": Vector3(-5.05, 0, 2.25), "graveyard": Vector3(-4.25, 0, 2.25),
		"exile": Vector3(-5.05, 0, 1.1),
		# Fora da borda, acima do seu retrato (o lugar de uma tela 16:9; a mesa o refaz para a tela: my_command_spot).
		"command": Vector3(-5.4, 0, 3.02), "command_scale": 0.5,
		"hand": Vector3.ZERO, "hand_spread": 0.0, "portrait": Vector3.ZERO,
	}


## As zonas do oponente `index` (0 é o primeiro depois de você na ordem dos assentos) entre `count` oponentes.
static func opponent(index: int, count: int) -> Dictionary:
	if count <= 1:
		return {
			"side": -1, "cx": 0.0, "width": 7.4, "scale": 1.0, "lands_z": -2.2, "others_z": -0.95,
			# Lotada, a fileira se estica para a esquerda: as pilhas do oponente ficam à direita.
			"wide_width": 9.3, "wide_shift": -0.95,
			"library": Vector3(5.05, 0, -2.25), "graveyard": Vector3(4.25, 0, -2.25),
			"exile": Vector3(5.05, 0, -1.1),
			# À direita do retrato, entre ele e o leque da mão (os selos dele ficam à esquerda).
			"command": Vector3(1.1, 0, -4.5), "command_scale": COMMAND_SCALE,
			"hand": Vector3(3.5, 0, -4.0), "hand_spread": 0.36, "portrait": Vector3(0, 0, -4.7),
		}
	var column: float = OPPONENTS_WIDTH / count
	var cx: float = -OPPONENTS_WIDTH / 2.0 + column * (index + 0.5)
	var right: float = cx + column / 2.0 - 0.5
	var left: float = cx - column / 2.0 + 0.6
	return {
		"side": -1, "cx": cx - 0.25, "width": column - 1.7, "scale": 0.8, "lands_z": -3.05, "others_z": -1.7,
		"library": Vector3(right, 0, -3.2), "graveyard": Vector3(right, 0, -2.3),
		"exile": Vector3(right, 0, -1.4),
		# À direita do retrato, entre ele e o leque da mão (os selos ficam embaixo do nome).
		"command": Vector3(left + 1.15, 0, -4.3), "command_scale": 0.8 * COMMAND_SCALE,
		"hand": Vector3(cx + 0.9, 0, -4.45), "hand_spread": 0.2, "portrait": Vector3(left, 0, -4.4),
	}


## Os oponentes na ordem dos assentos depois de você (quem joga depois de você fica à esquerda).
static func opponents_in_order(players: Array, you: int) -> Array:
	var my_seat: int = 0
	for raw: Variant in players:
		if int((raw as Dictionary)["id"]) == you:
			my_seat = int((raw as Dictionary).get("seat", (raw as Dictionary)["id"]))
	var others: Array = players.filter(func(p: Dictionary) -> bool: return int(p["id"]) != you)
	var total: int = players.size()
	others.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var sa: int = posmod(int(a.get("seat", a["id"])) - my_seat, total)
		var sb: int = posmod(int(b.get("seat", b["id"])) - my_seat, total)
		return sa < sb)
	return others


## A carta `index` de `count` na zona de comando, com o tamanho `scale` (uma dupla de parceiros fica lado a lado): em
## volta de `spot` (`centered`, o seu, acima do retrato) ou a partir dele para a direita (os oponentes, afastando-se do
## retrato). Girada no tampo, a ponta de cima erguida, a de baixo rente ao tampo.
static func command_pose(spot: Vector3, scale: float, index: int, count: int, centered: bool = true) -> Transform3D:
	var size: Vector2 = CardNode.SIZE * scale
	var offset: float = (index - ((count - 1) / 2.0 if centered else 0.0)) * size.x * 1.12
	var basis: Basis = (Basis(Vector3.UP, COMMAND_YAW) * Basis(Vector3.RIGHT, COMMAND_PITCH)).scaled(Vector3.ONE * scale)
	var lift: float = sin(COMMAND_PITCH) * size.y / 2.0 + 0.02
	return Transform3D(basis, spot + Vector3(offset, lift, -offset * sin(COMMAND_YAW)))


## O lugar e o tamanho do seu comandante para a tela: acima do seu retrato (`portrait`, o centro dele na tela; (-1, -1)
## usa o do HUD), o maior que cabe sem entrar na borda dourada da sua metade. Numa tela larga, a carta fica à esquerda do
## campo; numa 16:9, entre a borda e o retrato. Volta {pos, scale}; {} sem câmera.
static func my_command_spot(camera: Camera3D, portrait: Vector2, count: int) -> Dictionary:
	if camera == null or not camera.is_inside_tree():
		return {}
	var view: Vector2 = camera.get_viewport().get_visible_rect().size
	var center: Vector2 = portrait if portrait.x >= 0.0 else Vector2(MY_PORTRAIT.x, view.y + MY_PORTRAIT.y)
	var bottom: float = center.y - MY_PORTRAIT_RADIUS - MY_COMMAND_GAP_PX
	var aspect: float = CardNode.SIZE.x / CardNode.SIZE.y
	var height: float = MY_COMMAND_MIN_PX
	var h: float = MY_COMMAND_MAX_PX
	while h >= MY_COMMAND_MIN_PX:
		var half_w: float = h * aspect * (1.0 + 1.12 * (maxi(count, 1) - 1)) / 2.0 + 6.0
		var corners: Array = [Vector2(center.x - half_w, bottom - h), Vector2(center.x + half_w, bottom - h),
			Vector2(center.x - half_w, bottom), Vector2(center.x + half_w, bottom)]
		var fits: bool = true
		for corner: Vector2 in corners:
			var hit: Variant = _ground(camera, corner)
			if not (hit is Vector3) or inside_my_border(hit as Vector3, BORDER_ROOM):
				fits = false
				break
		if fits:
			height = h
			break
		h -= 4.0
	var top_hit: Variant = _ground(camera, Vector2(center.x, bottom - height))
	var bottom_hit: Variant = _ground(camera, Vector2(center.x, bottom))
	if not (top_hit is Vector3 and bottom_hit is Vector3):
		return {}
	var top: Vector3 = top_hit
	var low: Vector3 = bottom_hit
	# A ponta de cima erguida faz a carta parecer mais alta na tela do que a sombra dela no tampo: desconta.
	var scale: float = absf(low.z - top.z) / CardNode.SIZE.y * 0.9
	var pos: Vector3 = (top + low) / 2.0
	return {"pos": Vector3(pos.x, 0, pos.z + scale * 0.06), "scale": scale}


## O ponto está dentro da borda dourada da sua metade (com `room` de folga para fora)?
static func inside_my_border(point: Vector3, room: float = 0.0) -> bool:
	return absf(point.x) <= MY_HALF.z + room and point.z >= MY_HALF.x - room and point.z <= MY_HALF.y + room


## O ponto do tampo debaixo de um ponto da tela; null se o raio não chega nele.
static func _ground(camera: Camera3D, screen: Vector2) -> Variant:
	return Plane(Vector3.UP, 0.0).intersects_ray(camera.project_ray_origin(screen), camera.project_ray_normal(screen))
