# As mensagens de sala iguais às da mesa do navegador (host, join, room-deck, watch, rejoin) e a leitura do código digitado ou colado.
class_name RoomMessages
extends RefCounted

## Código de sala: 4 letras ou números (ROOM_CODE de src/ui/lobby.ts).
const ROOM_CODE_LENGTH := 4
## Partida contra o computador aberta para assistir: 8 caracteres (WATCH_CODE de src/ui/lobby.ts).
const WATCH_CODE_LENGTH := 8
## Os sites da mesa do navegador: o link de convite abre a tela inicial já na sala (?sala=CÓDIGO).
const SITE := "https://mesao.online"
const LOCAL_SITE := "http://localhost:5173"
## Rótulos dos formatos (FORMAT_LABEL de src/decks.ts).
const FORMAT_LABEL := {"standard": "Standard", "pauper": "Pauper", "sacola50": "Sacola 50", "free": "Livre", "commander": "Commander", "oathbreaker": "Oathbreaker", "precon": "Commander Precon"}
## A ordem dos formatos na criação de sala (DECK_FORMATS de src/decks.ts).
const FORMATS: PackedStringArray = ["standard", "pauper", "sacola50", "free", "commander", "oathbreaker", "precon"]


## Formatos com zona de comando: de 2 a 4 jogadores e uma partida só (hasCommandZone de src/decks.ts).
static func has_command_zone(format: String) -> bool:
	return format in ["commander", "oathbreaker", "precon"]


static func format_label(format: String) -> String:
	return Txt.of(FORMAT_LABEL.get(format, format))


## A configuração da sala como o navegador manda (config() de src/ui/lobby.ts): bo3 e mais jogadores só onde cabem.
static func config(format: String, match_length: String, players: int) -> Dictionary:
	var command: bool = has_command_zone(format)
	return {"format": format, "matchLength": "bo1" if command or match_length != "bo3" else "bo3", "playerCount": clampi(players, 2, 4) if command else 2}


## Criar sala. `seat_deck` é o deck do lugar (DeckChoices.seat_deck), ou {} para criar sem deck e escolher lá dentro.
## `code` vazio: o servidor sorteia.
static func host(name: String, seat_deck: Dictionary, room_config: Dictionary, public: bool, code: String = "") -> Dictionary:
	var msg: Dictionary = {"type": "host", "name": name}
	msg.merge(_deck_fields(seat_deck))
	msg["config"] = room_config
	msg["visibility"] = "public" if public else "private"
	if code != "":
		msg["code"] = code
	return msg


## Entrar na sala do código, com o deck do lugar ou sem deck ({}).
static func join(code: String, name: String, seat_deck: Dictionary) -> Dictionary:
	var msg: Dictionary = {"type": "join", "code": code, "name": name}
	msg.merge(_deck_fields(seat_deck))
	return msg


## Escolher ou trocar o deck dentro da sala (o requestId o ForgeClient.request põe).
static func room_deck(seat_deck: Dictionary) -> Dictionary:
	var msg: Dictionary = {"type": "room-deck"}
	msg.merge(_deck_fields(seat_deck))
	return msg


## Assistir sem ocupar lugar; sem nome, os jogadores veem "Espectador".
static func watch(code: String, name: String) -> Dictionary:
	return {"type": "watch", "code": code, "name": name if name != "" else "Espectador"}


## Voltar ao assento guardado ({code, token}).
static func rejoin(seat: Dictionary) -> Dictionary:
	return {"type": "rejoin", "code": Txt.of(seat.get("code")), "token": Txt.of(seat.get("token"))}


## O deck, a capa, o bracket e a conta, ou só deck: null (seatDeck de src/app/matchDecks.ts).
static func _deck_fields(seat_deck: Dictionary) -> Dictionary:
	return seat_deck.duplicate() if seat_deck.has("deck") else {"deck": null}


## O código de um texto digitado ou colado: o código solto ("k7qm") ou o link de convite do site
## ("https://mesao.online/?sala=K7QM"). Devolve "" quando não há código que sirva.
static func code_from_text(text: String) -> String:
	var raw: String = text.strip_edges()
	var at: int = raw.find("sala=")
	if at >= 0:
		raw = raw.substr(at + 5)
		for stop: String in ["&", "#", "/"]:
			if raw.contains(stop):
				raw = raw.substr(0, raw.find(stop))
		raw = raw.uri_decode()
	var code: String = clean_code(raw)
	return code if code.length() == ROOM_CODE_LENGTH or code.length() == WATCH_CODE_LENGTH else ""


## Só letras e números, em maiúsculas (o campo do código faz isso enquanto se digita, como o do navegador).
static func clean_code(text: String) -> String:
	var out: String = ""
	for ch: String in text.to_upper():
		if (ch >= "A" and ch <= "Z") or (ch >= "0" and ch <= "9"):
			out += ch
	return out


## O link de convite da sala na mesa do navegador (roomLink de src/ui/roomLobby.ts): o do site, ou o local com o servidor local.
static func invite_link(code: String, forge_url: String = GameConfig.forge_url()) -> String:
	var local: bool = forge_url.contains("127.0.0.1") or forge_url.contains("localhost")
	return "%s/?sala=%s" % [LOCAL_SITE if local else SITE, code.uri_encode()]
