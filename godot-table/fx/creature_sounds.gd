# Som de cada tipo de criatura ao entrar no campo (o urso rosna, o elfo traz sininhos, o lobo uiva), com a mesma tabela e a
# mesma regra da mesa do navegador (CREATURE_TOUCHES e creatureTouch de src/ui/creatureTouches.ts).
class_name CreatureSounds
extends RefCounted

const DIR := "res://data/audio/criaturas"
## Tipo de criatura (como o Forge escreve, em inglês) → arquivo em DIR, sem a extensão. "" é tipo com toque mas sem som
## (a aranha só atravessa a tela na mesa do navegador): ele ainda vence os subtipos seguintes, como lá.
## Só tipos com cara de bicho ou de criatura fantástica: Human, Soldier, Wizard e os outros comuns demais ficam em silêncio.
const TOUCHES := {
	"Bear": "bear", "Elf": "elf", "Wolf": "wolf", "Werewolf": "wolf",
	"Cat": "cat", "Dog": "dog", "Bird": "bird", "Dragon": "dragon",
	"Zombie": "zombie", "Goblin": "goblin", "Frog": "frog", "Snake": "snake",
	"Insect": "insect", "Angel": "angel", "Merfolk": "merfolk", "Horse": "horse",
	"Unicorn": "horse", "Dinosaur": "dinosaur", "Skeleton": "skeleton", "Spirit": "spirit",
	"Ooze": "ooze", "Elephant": "elephant", "Demon": "demon",
	"Squirrel": "squirrel", "Rat": "rat", "Spider": "", "Bat": "bat",
}
## Como na mesa do navegador: um pouco mais baixo que o som da carta e logo depois dele.
const LEVEL := 0.8
const DELAY := 0.22

static var _streams: Dictionary = {}


## Os subtipos da face à mostra ("Creature — Elf Druid" → Elf, Druid).
static func subtypes(type_line: String) -> PackedStringArray:
	var face: String = type_line.split(" // ")[0]
	var dash: int = face.find("—")
	if dash < 0:
		return PackedStringArray()
	return face.substr(dash + 1).strip_edges().split(" ", false)


## O som de uma criatura entrando (res://data/audio/criaturas/<arquivo>.mp3, ou "" sem som): o do primeiro subtipo que
## tem toque, na ordem impressa. Não criatura e virada para baixo (sem tipo à mostra) não têm.
static func cue_for(card: Dictionary) -> String:
	var found: Variant = _touch(card)
	if found == null or Txt.of(found) == "":
		return ""
	return "%s/%s.mp3" % [DIR, Txt.of(found)]


## O som de um evento: só "entered"; fichas que entram juntas (`entries`) contam como uma entrada só, e vale a primeira
## delas que tem toque.
static func cue_for_event(event: Dictionary) -> String:
	if Txt.of(event.get("type")) != "entered":
		return ""
	var cards: Array = event.get("entries", []) if event.get("entries") is Array else []
	if cards.is_empty() and event.get("card") is Dictionary:
		cards = [event["card"]]
	for raw: Variant in cards:
		if not raw is Dictionary:
			continue
		var found: Variant = _touch(raw as Dictionary)
		if found != null:
			return "" if Txt.of(found) == "" else "%s/%s.mp3" % [DIR, Txt.of(found)]
	return ""


## Toca o som da criatura em `pos`, logo depois do som da carta chegando, no volume de `sounds` (mudo não toca).
static func play(sounds: Sounds, card: Dictionary, pos: Vector3) -> void:
	play_cue(sounds, cue_for(card), pos)


## Toca um caminho dado por cue_for/cue_for_event num tocador próprio, filho de `sounds`, que se apaga ao terminar.
static func play_cue(sounds: Sounds, path: String, pos: Vector3) -> void:
	if sounds == null or path == "" or sounds.volume <= 0.0 or not sounds.is_inside_tree():
		return
	var stream: AudioStream = stream_for(path)
	if stream == null:
		return
	var player := AudioStreamPlayer3D.new()
	# Os mesmos ajustes dos tocadores de Sounds: o lugar só muda o lado, não some com a distância.
	player.unit_size = 40.0
	player.max_db = 3.0
	player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_LOGARITHMIC
	player.stream = stream
	player.position = Vector3(pos.x, 1.0, pos.z)
	player.volume_db = linear_to_db(sounds.volume * LEVEL)
	player.pitch_scale = randf_range(0.97, 1.03)
	player.finished.connect(player.queue_free)
	sounds.add_child(player)
	sounds.get_tree().create_timer(DELAY).timeout.connect(func() -> void:
		if is_instance_valid(player):
			player.play())


## O som carregado (null se o arquivo não existe), guardado para a próxima vez.
static func stream_for(path: String) -> AudioStream:
	if _streams.has(path):
		return _streams[path]
	var stream: AudioStream = load(path) if ResourceLoader.exists(path) else null
	_streams[path] = stream
	return stream


## O arquivo do primeiro subtipo com toque ("" se ele não tem som), ou null se nenhum tem.
static func _touch(card: Dictionary) -> Variant:
	if not bool(card.get("creature", false)) or bool(card.get("faceDown", false)):
		return null
	for type: String in subtypes(Txt.of(card.get("typeLine"))):
		if TOUCHES.has(type):
			return TOUCHES[type]
	return null
