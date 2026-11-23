# Os lugares da sala de espera em ordem de assento (seatsHTML de src/ui/roomLobby.ts): quem é o anfitrião, você, o comandante,
# o bracket, a situação de cada um (escolhendo o deck, pronto, reconectando) e o balão da mensagem pronta que a pessoa mandou.
class_name RoomSeats
extends GridContainer

## As mensagens prontas da sala (SAYINGS de src/ui/roomLobby.ts); o servidor recusa qualquer outra.
const SAYINGS := [["hello", "Oi, pessoal!"], ["back", "Já volto"], ["invite", "Vou chamar mais gente"], ["glhf", "Boa partida!"]]
## Quanto tempo o balão fica sobre o lugar.
const SAID_S := 6.0

var _room: Dictionary = {}
## Lugar → chave da mensagem que está no balão.
var _said: Dictionary = {}
var _said_serial: int = 0


func _init() -> void:
	columns = 2
	add_theme_constant_override("h_separation", 10)
	add_theme_constant_override("v_separation", 10)


static func saying_text(key: String) -> String:
	for saying: Array in SAYINGS:
		if saying[0] == key:
			return saying[1]
	return ""


## O jogador sentado no lugar (o `seat` dele, ou a posição na lista em servidores antigos); {} se o lugar está livre.
static func player_at(room: Dictionary, seat: int) -> Dictionary:
	var players: Array = room.get("players", [])
	for i: int in players.size():
		var p: Dictionary = players[i]
		if int(p.get("seat", i)) == seat:
			return p
	return {}


## A situação escrita do lugar, como na mesa do navegador.
static func state_text(player: Dictionary, me: bool) -> String:
	var choosing: bool = player.get("ready") == false
	if not bool(player.get("connected", true)):
		return "Reconectando…"
	if choosing:
		return "Escolha seu deck abaixo" if me else "Escolhendo o deck…"
	if player.get("confirmed") == true:
		return "✓ Pronto"
	if player.get("confirmed") == false:
		return "Toque em Pronto para começar" if me else "Ainda não está pronto"
	return "Na sala"


func render(room: Dictionary) -> void:
	_room = room
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	var capacity: int = int(room.get("capacity", (room.get("config", {}) as Dictionary).get("playerCount", 2)))
	for seat: int in capacity:
		add_child(_seat_card(room, seat))


## Mostra o balão no lugar de quem mandou e o tira depois de alguns segundos.
func say(seat: int, key: String) -> void:
	_said[seat] = key
	_said_serial += 1
	var serial: int = _said_serial
	render(_room)
	var seats: WeakRef = weakref(self)
	get_tree().create_timer(SAID_S).timeout.connect(func() -> void:
		var me: RoomSeats = seats.get_ref() as RoomSeats
		if me and me._said_serial == serial:
			me._said.clear()
			me.render(me._room))


func _seat_card(room: Dictionary, seat: int) -> PanelContainer:
	var player: Dictionary = player_at(room, seat)
	var free: bool = player.is_empty()
	var me: bool = not free and seat == int(room.get("seat", -1))
	var confirmed: bool = not free and player.get("ready") != false and player.get("confirmed") == true
	var choosing: bool = not free and player.get("ready") == false
	var away: bool = not free and not bool(player.get("connected", true))
	var card := PanelContainer.new()
	card.name = "Seat%d" % seat
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var border: Color = Color(ModalStyle.GOLD, 0.6) if me else (Color(ModalStyle.GOOD, 0.45) if confirmed else Color(1, 1, 1, 0.08 if free else 0.14))
	var style := ModalStyle.box(Color(0.085, 0.125, 0.21, 0.35 if free else 0.9), 12, border, 2 if me or confirmed else 1)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	card.add_theme_stylebox_override("panel", style)
	if away:
		card.modulate.a = 0.6
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	card.add_child(line)
	line.add_child(_badge(seat, free, confirmed, choosing))
	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_theme_constant_override("separation", 1)
	line.add_child(text)
	var tags: PackedStringArray = []
	if not free and seat == 0:
		tags.append("Anfitrião")
	if me:
		tags.append("Você")
	if not tags.is_empty():
		text.add_child(ModalStyle.label(12, ModalStyle.GOLD, " · ".join(tags).to_upper()))
	var name_label := ModalStyle.label(19, Color(1, 1, 1, 0.4) if free else ModalStyle.INK, "Lugar livre" if free else Txt.of(player.get("name")))
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text.add_child(name_label)
	if free:
		text.add_child(ModalStyle.label(14, ModalStyle.FAINT, "Aguardando jogador…"))
		return card
	var commander: String = Txt.of(player.get("commander"))
	var bracket: int = int(player.get("bracket", 0)) if player.get("bracket") != null else 0
	if commander != "" or bracket > 0:
		var deck_line: String = commander
		if bracket > 0:
			deck_line += ("  ·  " if commander != "" else "") + "Bracket %d" % bracket
		var deck_label := ModalStyle.label(14, ModalStyle.MUTED, deck_line)
		deck_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		text.add_child(deck_label)
	var status_color: Color = ModalStyle.GOOD if confirmed else (ModalStyle.WARN if choosing or away else ModalStyle.MUTED)
	var status := ModalStyle.label(14, status_color, state_text(player, me))
	status.name = "State"
	text.add_child(status)
	if _said.has(seat):
		# O balão flutua sobre o canto do lugar, sem apertar o nome e o comandante.
		var anchor := Control.new()
		anchor.mouse_filter = Control.MOUSE_FILTER_IGNORE
		line.add_child(anchor)
		var bubble := _bubble(saying_text(Txt.of(_said[seat])))
		bubble.z_index = 2
		anchor.add_child(bubble)
		bubble.resized.connect(func() -> void: bubble.position = Vector2(-bubble.size.x + 4.0, -4.0))
	return card


## O número do lugar num círculo: verde com brilho se pronto, laranja escolhendo o deck, apagado se livre.
func _badge(seat: int, free: bool, confirmed: bool, choosing: bool) -> PanelContainer:
	var badge := PanelContainer.new()
	badge.custom_minimum_size = Vector2(38, 38)
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var color: Color = ModalStyle.GOOD if confirmed else (ModalStyle.WARN if choosing else (Color(1, 1, 1, 0.12) if free else ModalStyle.BLUE))
	var style := ModalStyle.box(Color(color, 0.18), 19, Color(color, 0.8), 2)
	if confirmed:
		style.shadow_color = Color(ModalStyle.GOOD, 0.45)
		style.shadow_size = 6
	badge.add_theme_stylebox_override("panel", style)
	var number := ModalStyle.label(17, Color(1, 1, 1, 0.45) if free else ModalStyle.INK, "+" if free else str(seat + 1))
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	number.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge.add_child(number)
	return badge


func _bubble(text: String) -> PanelContainer:
	var bubble := PanelContainer.new()
	bubble.name = "Bubble"
	bubble.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := ModalStyle.box(Color(ModalStyle.GOLD_LIGHT, 0.95), 12)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 4
	style.content_margin_bottom = 5
	bubble.add_theme_stylebox_override("panel", style)
	bubble.add_child(ModalStyle.label(14, Color(0.12, 0.08, 0.02), text))
	(bubble.get_child(0) as Label).add_theme_constant_override("outline_size", 0)
	return bubble
