# A arte padrão da mesa no PC: os terrenos básicos na série Nyx de Theros Beyond Death e, com "Cartas da mesa" ligada nas
# Opções, os terrenos e as staples com a arte feita para a mesa, embutida no aplicativo (como withDefaultArt de src/scryfallCards.ts).
class_name DefaultArt
extends RefCounted

## A preferência guardada (Prefs): "Cartas da mesa", desligada de começo.
const PREF_KEY := "ownArt"
## A série Nyx de arte cheia de Sam Burley (THB 250–254): vale também no lugar da impressão em português.
const BASIC_NUMBERS := {"plains": "250", "island": "251", "swamp": "252", "mountain": "253", "forest": "254"}
## As cartas com arte própria da mesa, na ordem da série (a mesma lista de src/own-art.json).
const OWN_ART: PackedStringArray = [
	"Plains", "Island", "Swamp", "Mountain", "Forest", "Sol Ring", "Command Tower", "Arcane Signet", "Swiftfoot Boots",
	"Lightning Greaves", "Rhystic Study", "Commander's Sphere",
]
## As imagens copiadas de public/cartas/<nome>-normal.webp e -small.webp (importadas como arquivo, sem conversão).
const OWN_DIR := "res://cards/own_art/"

static var _enabled: bool = false
static var _loaded: bool = false


## "Cartas da mesa" ligada (lê a preferência uma vez por sessão).
static func own_art_enabled() -> bool:
	if not _loaded:
		_loaded = true
		_enabled = bool(Prefs.load_all().get(PREF_KEY, false))
	return _enabled


## Liga ou desliga "Cartas da mesa" e guarda; vale nas cartas que forem desenhadas depois disso.
static func set_own_art_enabled(on: bool) -> void:
	_loaded = true
	_enabled = on
	Prefs.save(PREF_KEY, on)


## O endereço da imagem padrão da carta ("normal" ou "small"), ou "" quando ela usa a imagem de sempre.
static func url_for(name: String, version: String = "normal") -> String:
	var lower: String = name.to_lower()
	if own_art_enabled() and _own_names().has(lower):
		return "%s%s-%s.webp" % [OWN_DIR, slug(lower), "small" if version == "small" else "normal"]
	if BASIC_NUMBERS.has(lower):
		return GameConfig.image_url("%scards/thb/%s?format=image&version=%s" % [GameConfig.SCRYFALL_API, BASIC_NUMBERS[lower], version])
	return ""


## O nome do arquivo da carta ("Commander's Sphere" → "commander-s-sphere"), como em src/scryfallCards.ts.
static func slug(name: String) -> String:
	var out: String = ""
	var dash: bool = false
	for ch: String in name.to_lower():
		var ok: bool = (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9")
		if ok:
			if dash and out != "":
				out += "-"
			out += ch
			dash = false
		else:
			dash = true
	return out


static var _names: Dictionary = {}


static func _own_names() -> Dictionary:
	if _names.is_empty():
		for name: String in OWN_ART:
			_names[name.to_lower()] = true
	return _names
