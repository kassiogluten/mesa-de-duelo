# Sons da mesa no PC: os mesmos arquivos e o mesmo mapa de evento para som da mesa do navegador (soundForEvent de
# src/ui/audio.ts), tocados no ponto da mesa em que o efeito acontece (o lado esquerdo soa à esquerda).
class_name Sounds
extends Node3D

const DIR := "res://data/audio"
const FILES := {
	"draw": "01-card-draw.mp3", "play": "02-card-play.mp3", "land": "03-land.mp3", "cast": "04-cast.mp3",
	"impact": "05-impact.mp3", "player-hit": "08-player-hit.mp3", "turn-self": "06-turn.mp3", "wing": "07-wing.mp3",
	"turn-opponent": "09-opponent-turn.mp3", "ability": "10-ability.mp3", "resolved": "11-resolved.mp3",
	"countered": "12-countered.mp3", "attack": "13-attack.mp3", "block": "14-block.mp3",
	"heal": "15-heal.mp3", "poison": "16-poison.mp3", "shield": "17-shield.mp3", "shatter": "18-shatter.mp3",
	"untap": "19-untap.mp3", "sneak": "20-sneak.mp3", "blink": "21-blink.mp3", "bounce": "22-bounce.mp3", "exile": "23-exile.mp3",
	"sacrifice": "24-sacrifice.mp3", "life-loss": "25-life-loss.mp3", "shuffle": "26-shuffle.mp3",
	"victory": "27-victory.mp3", "defeat": "28-defeat.mp3", "counter": "29-counter.mp3", "counter-bad": "30-counter-bad.mp3",
	"walker": "31-walker.mp3", "loyalty": "32-loyalty.mp3", "graveyard": "35-graveyard.mp3", "equip": "36-equip.mp3", "dice": "37-dice.mp3",
	"creak": "mesa/rangido.mp3",
}
const VOICES := 6
const HURTS := ["M1M1", "POISON", "TIME", "AGE", "DOOM"]

## 0 a 1; 0 é mudo.
var volume: float = 0.8
var _streams: Dictionary = {}
var _players: Array[AudioStreamPlayer3D] = []
var _next: int = 0


func _ready() -> void:
	volume = float(Prefs.load_all().get("volume", 0.8))
	for i: int in VOICES:
		var player := AudioStreamPlayer3D.new()
		# Volume quase igual em toda a mesa: o lugar só muda o lado (esquerda/direita), não some com a distância.
		player.unit_size = 40.0
		player.max_db = 3.0
		player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_LOGARITHMIC
		add_child(player)
		_players.append(player)


## O som de um evento (null se ele não tem som), pelas mesmas regras da mesa do navegador.
static func cue_for(event: Dictionary, you: int) -> String:
	var targets: Dictionary = event.get("targets", {}) if event.get("targets") is Dictionary else {}
	var card: Dictionary = event.get("card", {}) if event.get("card") is Dictionary else {}
	match Txt.of(event.get("type")):
		"draw", "scry", "cascade":
			return "draw"
		"discard", "mill":
			return "graveyard"
		"shuffle":
			return "shuffle"
		"attached":
			return "equip"
		"survived":
			return "shield"
		"phased":
			return "blink"
		"coin", "die", "starting-roll":
			return "dice"
		"control-changed":
			return "sneak"
		"land-played":
			return "land"
		"spell-cast":
			return "cast"
		"ability-activated":
			return "loyalty" if bool(event.get("loyalty", false)) else "ability"
		"resolved":
			return "resolved"
		"countered":
			return "countered"
		"entered":
			if event.get("from") == "Exile":
				return "blink"
			if bool(card.get("planeswalker", false)):
				return "walker"
			if bool(card.get("land", false)):
				return "land"
			if event.get("from") == "Hand" or event.get("reason") == "sneak":
				return "sneak"
			return "wing" if (card.get("keywords", []) as Array).has("FLYING") else "play"
		"attackers":
			return "attack"
		"blockers":
			return "block"
		"damage":
			if bool(event.get("prevented", false)):
				return "shield"
			if bool(event.get("wither", false)) or (bool(event.get("infect", false)) and not (targets.get("players", []) as Array).is_empty()):
				return "poison"
			return "player-hit" if not (targets.get("players", []) as Array).is_empty() else "impact"
		"life-changed":
			var delta: int = int(event.get("delta", 0))
			return "heal" if delta > 0 else ("life-loss" if delta < 0 else "")
		"left":
			match Txt.of(event.get("reason")):
				"destroyed":
					return "shatter"
				"sacrificed":
					return "sacrifice"
				"ninjutsu", "sneak":
					return "sneak"
			if event.get("to") == "Exile":
				return "exile"
			return "bounce" if event.get("to") in ["Hand", "Library"] else ""
		"counters":
			if bool(event.get("entering", false)):
				return ""
			var hurts: bool = HURTS.has(Txt.of(event.get("counter"))) or int(event.get("delta", 0)) < 0
			return "counter-bad" if hurts else "counter"
		"turn":
			if event.get("actor") == null:
				return ""
			return "turn-self" if int(event["actor"]) == you else "turn-opponent"
	return ""


## Toca o som em `pos` (no meio da mesa, sem posição); ignora se o arquivo não existe.
func play(cue: String, pos: Vector3 = Vector3.ZERO, pitch: float = 1.0) -> void:
	if cue == "" or volume <= 0.0 or not FILES.has(cue):
		return
	var stream: AudioStream = _stream(cue)
	if stream == null:
		return
	var player: AudioStreamPlayer3D = _players[_next]
	_next = (_next + 1) % _players.size()
	player.stream = stream
	player.position = Vector3(pos.x, 1.0, pos.z)
	player.volume_db = linear_to_db(volume)
	player.pitch_scale = pitch * randf_range(0.97, 1.03)
	player.play()


func _stream(cue: String) -> AudioStream:
	if _streams.has(cue):
		return _streams[cue]
	var path: String = "%s/%s" % [DIR, FILES[cue]]
	var stream: AudioStream = load(path) if ResourceLoader.exists(path) else null
	_streams[cue] = stream
	return stream
