# Onde fica cada zona de cada jogador na mesa 3D: você embaixo; um oponente em cima, ou até três em colunas lado a lado
# (como no Commander da mesa do navegador), com as cartas um pouco menores.
class_name SeatLayout
extends RefCounted

## Largura da faixa dos oponentes quando há mais de um (unidades da mesa; a carta tem 0,63).
const OPPONENTS_WIDTH := 16.0


## As zonas de quem recebe o estado.
static func mine() -> Dictionary:
	return {
		"side": 1, "cx": 0.0, "width": 7.4, "scale": 1.0, "lands_z": 2.2, "others_z": 0.95,
		"library": Vector3(-5.05, 0, 2.25), "graveyard": Vector3(-4.25, 0, 2.25),
		"exile": Vector3(-5.05, 0, 1.1), "command": Vector3(-4.25, 0, 1.1),
		"hand": Vector3.ZERO, "hand_spread": 0.0, "portrait": Vector3.ZERO,
	}


## As zonas do oponente `index` (0 é o primeiro depois de você na ordem dos assentos) entre `count` oponentes.
static func opponent(index: int, count: int) -> Dictionary:
	if count <= 1:
		return {
			"side": -1, "cx": 0.0, "width": 7.4, "scale": 1.0, "lands_z": -2.2, "others_z": -0.95,
			"library": Vector3(5.05, 0, -2.25), "graveyard": Vector3(4.25, 0, -2.25),
			"exile": Vector3(5.05, 0, -1.1), "command": Vector3(4.25, 0, -1.1),
			"hand": Vector3(2.9, 0, -4.0), "hand_spread": 0.36, "portrait": Vector3(0, 0, -4.7),
		}
	var column: float = OPPONENTS_WIDTH / count
	var cx: float = -OPPONENTS_WIDTH / 2.0 + column * (index + 0.5)
	var right: float = cx + column / 2.0 - 0.5
	var left: float = cx - column / 2.0 + 0.6
	return {
		"side": -1, "cx": cx - 0.25, "width": column - 1.7, "scale": 0.8, "lands_z": -3.05, "others_z": -1.7,
		"library": Vector3(right, 0, -3.2), "graveyard": Vector3(right, 0, -2.3),
		"exile": Vector3(right, 0, -1.4), "command": Vector3(left, 0, -1.7),
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
