# A lista de salas públicas que o servidor manda ({type:"list-rooms"}): as que têm lugar, as em andamento e o texto de cada uma (src/ui/publicRooms.ts).
class_name PublicRooms
extends RefCounted


## As que ainda dá para entrar (caso o servidor mande alguma cheia ou começada).
static func joinable(rooms: Array) -> Array:
	return rooms.filter(func(room: Dictionary) -> bool: return not bool(room.get("started", false)) and int(room.get("players", 0)) < int(room.get("capacity", 2)))


## As que já começaram: dá para assistir.
static func watchable(rooms: Array) -> Array:
	return rooms.filter(func(room: Dictionary) -> bool: return bool(room.get("started", false)))


static func _format(room: Dictionary) -> String:
	return Txt.of(((room.get("config", {}) as Dictionary).get("format", "")))


## "Partida única" ou "Melhor de três"; nada nos formatos com zona de comando.
static func length_label(room: Dictionary) -> String:
	if RoomMessages.has_command_zone(_format(room)):
		return ""
	return "Melhor de três" if Txt.of((room.get("config", {}) as Dictionary).get("matchLength")) == "bo3" else "Partida única"


## "Bracket 3", ou "Brackets 2 a 4" quando os lugares ocupados diferem.
static func brackets_label(room: Dictionary) -> String:
	var brackets: Array = room.get("brackets", []) if room.get("brackets") is Array else []
	if brackets.is_empty():
		return ""
	var low: int = int(brackets.min())
	var high: int = int(brackets.max())
	return "Bracket %d" % low if low == high else "Brackets %d a %d" % [low, high]


## O título da linha: "Sala de Ana", ou "Ana contra o computador" numa partida contra o computador.
static func title(room: Dictionary) -> String:
	var host: String = Txt.of(room.get("host"))
	return "%s contra o computador" % host if bool(room.get("computer", false)) else "Sala de %s" % host


## Os detalhes da linha: formato, bracket, duração e lugares (ou jogadores e quem assiste, na em andamento).
static func details(room: Dictionary) -> String:
	var parts: PackedStringArray = [RoomMessages.format_label(_format(room)), brackets_label(room)]
	if bool(room.get("started", false)):
		if not bool(room.get("computer", false)):
			parts.append("%d jogadores" % int(room.get("players", 0)))
		if int(room.get("spectators", 0)) > 0:
			parts.append("%d assistindo" % int(room.get("spectators", 0)))
	else:
		parts.append(length_label(room))
		parts.append("%d/%d jogadores" % [int(room.get("players", 0)), int(room.get("capacity", 2))])
	return " · ".join(Array(parts).filter(func(p: String) -> bool: return p != ""))


## O resumo acima da lista (publicRoomsStatusText de src/ui/lobbyView.ts, em frases curtas).
static func status_text(rooms: Array) -> String:
	var open: int = joinable(rooms).size()
	var live: int = watchable(rooms).size()
	if open == 0 and live == 0:
		return "Nenhuma sala pública aberta."
	var parts: PackedStringArray = []
	if open > 0:
		parts.append("1 sala esperando jogadores" if open == 1 else "%d salas esperando jogadores" % open)
	if live > 0:
		parts.append("1 partida para assistir" if live == 1 else "%d partidas para assistir" % live)
	return " e ".join(parts) + "."
