# Lista oficial de Game Changers do Commander (a mesma de shared/commander-brackets.json; o teste confere) e a regra de
# quando a carta ganha a cena dela: conjurada ou jogada numa partida com as regras do Commander, sem ser ficha nem virada.
class_name GameChangers
extends RefCounted

const NAMES: PackedStringArray = [
	"Ad Nauseam", "Ancient Tomb", "Aura Shards", "Biorhythm", "Bolas's Citadel", "Braids, Cabal Minion", "Chrome Mox",
	"Coalition Victory", "Consecrated Sphinx", "Crop Rotation", "Cyclonic Rift", "Demonic Tutor", "Drannith Magistrate",
	"Enlightened Tutor", "Farewell", "Field of the Dead", "Fierce Guardianship", "Force of Will", "Gaea's Cradle",
	"Gamble", "Gifts Ungiven", "Glacial Chasm", "Grand Arbiter Augustin IV", "Grim Monolith", "Humility",
	"Imperial Seal", "Intuition", "Jeska's Will", "Lion's Eye Diamond", "Mana Vault", "Mishra's Workshop",
	"Mox Diamond", "Mystical Tutor", "Narset, Parter of Veils", "Natural Order", "Necropotence", "Notion Thief",
	"Opposition Agent", "Orcish Bowmasters", "Panoptic Mirror", "Rhystic Study", "Seedborn Muse", "Serra's Sanctum",
	"Smothering Tithe", "Survival of the Fittest", "Teferi's Protection", "Tergrid, God of Fright // Tergrid's Lantern",
	"Thassa's Oracle", "The One Ring", "The Tabernacle at Pendrell Vale", "Underworld Breach", "Vampiric Tutor",
	"Worldly Tutor"
]

static var _index: Dictionary = {}


## Carta da lista, pelo nome inteiro ou pelo da face da frente (a lista guarda "Boom // Bust", o estado pode trazer só "Boom").
static func listed(name: String) -> bool:
	if _index.is_empty():
		for entry: String in NAMES:
			_index[entry.to_lower()] = true
			_index[entry.split(" // ")[0].to_lower()] = true
	var key: String = name.strip_edges().to_lower()
	return _index.has(key) or _index.has(key.split(" // ")[0])


## O formato da partida tem as regras do Commander (commander e pré-montado).
static func commander_rules(state: Dictionary) -> bool:
	var config: Dictionary = state.get("config", {}) if state.get("config") is Dictionary else {}
	return Txt.of(config.get("format")) in ["commander", "precon"]


## O evento é um Game Changer chegando à mesa (conjurado ou jogado como terreno).
static func play(event: Dictionary, commander: bool) -> bool:
	if not commander or not Txt.of(event.get("type")) in ["spell-cast", "land-played"] or not event.get("card") is Dictionary:
		return false
	var card: Dictionary = event["card"]
	return not bool(card.get("token", false)) and not bool(card.get("faceDown", false)) and listed(Txt.of(card.get("name")))
