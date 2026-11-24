# O valor que a carta conta (Terror Tolariano, as Lições de Combustion Technique, a devoção dos deuses de Theros): a frase
# do inspetor e o número do selo, como src/ui/cardCounts.ts (porte conferido pelos fixtures dourados, tests/golden/).
class_name CardCounts
extends RefCounted

const COLOR_NAME := {"W": "branco", "U": "azul", "B": "preto", "R": "vermelho", "G": "verde"}
## Nome no plural e gênero. Tipos de carta fora do campo viram "cartas de criatura" (ver _noun).
const NOUN := {
	"Card": ["cartas", "f"], "Permanent": ["permanentes", "f"], "Creature": ["criaturas", "f"], "Land": ["terrenos", "m"], "Artifact": ["artefatos", "m"],
	"Enchantment": ["encantamentos", "m"], "Planeswalker": ["planeswalkers", "m"], "Battle": ["batalhas", "f"], "Instant": ["mágicas instantâneas", "f"], "Sorcery": ["feitiços", "m"],
	"Lesson": ["Lições", "f"], "Forest": ["Florestas", "f"], "Island": ["Ilhas", "f"], "Swamp": ["Pântanos", "m"], "Mountain": ["Montanhas", "f"], "Plains": ["Planícies", "f"],
	"Equipment": ["Equipamentos", "m"], "Aura": ["Auras", "f"], "Vehicle": ["Veículos", "m"], "Saga": ["Sagas", "f"], "Treasure": ["Tesouros", "m"], "Food": ["Comidas", "f"],
	"Clue": ["Pistas", "f"], "Gate": ["Portões", "m"], "Shrine": ["Santuários", "m"], "Desert": ["Desertos", "m"], "Cave": ["Cavernas", "f"], "Elf": ["Elfos", "m"],
	"Goblin": ["Goblins", "m"], "Zombie": ["Zumbis", "m"], "Human": ["Humanos", "m"], "Wizard": ["Magos", "m"], "Dragon": ["Dragões", "m"], "Merfolk": ["Tritões", "m"],
	"Vampire": ["Vampiros", "m"], "Spirit": ["Espíritos", "m"], "Soldier": ["Soldados", "m"], "Angel": ["Anjos", "m"], "Cleric": ["Clérigos", "m"], "Warrior": ["Guerreiros", "m"],
	"Knight": ["Cavaleiros", "m"], "Beast": ["Feras", "f"], "Dinosaur": ["Dinossauros", "m"], "Cat": ["Gatos", "m"], "Myr": ["Myr", "m"], "Rat": ["Ratos", "m"],
	"Faerie": ["Fadas", "f"], "Rogue": ["Ladinos", "m"], "Pirate": ["Piratas", "m"], "Ninja": ["Ninjas", "m"], "Giant": ["Gigantes", "m"], "Insect": ["Insetos", "m"],
	"Squirrel": ["Esquilos", "m"], "Wolf": ["Lobos", "m"], "Demon": ["Demônios", "m"], "Horror": ["Horrores", "m"], "Eldrazi": ["Eldrazi", "m"], "Sliver": ["Fractius", "m"],
	"Construct": ["Constructos", "m"], "Thopter": ["Topteros", "m"], "Ally": ["Aliados", "m"], "Snake": ["Serpentes", "f"],
}
## Tipos de carta no singular, para "cartas de criatura" e "não terreno".
const CARD_TYPE := {
	"Creature": "criatura", "Land": "terreno", "Artifact": "artefato", "Enchantment": "encantamento", "Planeswalker": "planeswalker", "Battle": "batalha",
	"Instant": "mágica instantânea", "Sorcery": "feitiço",
}
const KEYWORD := {
	"Flying": "voar", "Trample": "atropelar", "Defender": "defensor", "Haste": "ímpeto", "Vigilance": "vigilância", "Lifelink": "vínculo com a vida",
	"Deathtouch": "toque mortífero", "Reach": "alcance", "Menace": "ameaça", "Flash": "lampejo", "Hexproof": "resistência a magia", "Indestructible": "indestrutível",
}
## Adjetivos no plural (masculino, feminino).
const ADJECTIVE := {
	"untapped": ["desvirados", "desviradas"], "tapped": ["virados", "viradas"], "attacking": ["atacando", "atacando"],
	"white": ["brancos", "brancas"], "blue": ["azuis", "azuis"], "black": ["pretos", "pretas"], "red": ["vermelhos", "vermelhas"], "green": ["verdes", "verdes"],
	"colorless": ["incolores", "incolores"], "multicolor": ["multicoloridos", "multicoloridas"], "legendary": ["lendários", "lendárias"], "snow": ["da neve", "da neve"], "basic": ["básicos", "básicas"],
}
const NUMBER_WORD := {"power": "poder", "toughness": "resistência", "cmc": "valor de mana"}
const MEASURE := {
	"power": ["poder total", "de"], "greatestPower": ["maior poder", "entre"], "toughness": ["resistência total", "de"], "greatestToughness": ["maior resistência", "entre"],
	"manaValue": ["valor de mana total", "de"], "greatestManaValue": ["maior valor de mana", "entre"], "cardTypes": ["tipos de carta", "entre"],
	"names": ["nomes diferentes", "entre"], "colors": ["cores", "entre"],
}


## "Lições no seu cemitério: 3. Causa 5 de dano (2 + 3)." `owner`: o nome de quem controla a carta, quando não é você.
static func count_label(count: Dictionary, owner: Variant = null) -> String:
	var entering: String = ""
	if count.get("entering") != null and int(count["entering"]) != int(count.get("value", 0)):
		entering = "; %d quando ela entrar" % int(count["entering"])
	var effects: PackedStringArray = []
	for use: Variant in count.get("uses", []):
		var text: String = _use_text(use as Dictionary, count)
		if text != "":
			effects.append(text)
	var tail: String = (" " + ". ".join(effects) + ".") if not effects.is_empty() else ""
	return "%s: %d%s.%s" % [_capital(count_subject(count, owner)), int(count.get("value", 0)), entering, tail]


## O que é contado: "Lições no seu cemitério", "poder total das criaturas que você controla", "devoção ao azul".
static func count_subject(count: Dictionary, owner: Variant = null) -> String:
	var who: String = Txt.of(owner) if owner != null else ""
	match Txt.of(count.get("of")):
		"devotion":
			var colors: Array = []
			for k: Variant in (count["colors"] if count.get("colors") is Array else []):
				colors.append(COLOR_NAME.get(Txt.of(k), Txt.of(k)))
			return "devoção%s ao %s" % [(" de " + who) if who != "" else "", _list(colors)]
		"hand":
			if Txt.of(count.get("whose")) == "opponents":
				return ("cartas nas mãos dos oponentes de " + who) if who != "" else "cartas nas mãos dos seus oponentes"
			return ("cartas na mão de " + who) if who != "" else "cartas na sua mão"
		"life":
			return ("pontos de vida de " + who) if who != "" else "seus pontos de vida"
		"domain":
			return "tipos básicos de terreno entre os terrenos %s" % (("que %s controla" % who) if who != "" else "que você controla")
	var q: Array = _qualified(count)
	var what: String = q[0]
	var gender: String = q[1]
	var place: String = _whose(count, who)
	var measure: Variant = MEASURE.get(Txt.of(count.get("measure")))
	if measure == null:
		return "%s %s" % [what, place]
	var article: String
	if measure[1] == "de":
		article = "das" if gender == "f" else "dos"
	else:
		article = "entre as" if gender == "f" else "entre os"
	return "%s %s %s %s" % [measure[0], article, what, place]


## O número que importa: o de agora ou, num "quando entra" visto da mão, o de quando ela estiver no campo.
static func shown(count: Dictionary) -> int:
	return int(count["entering"]) if count.get("entering") != null else int(count.get("value", 0))


## O mínimo que liga um efeito (Accumulate Wisdom, o deus de Theros); -1 sem mínimo.
static func minimum(count: Dictionary) -> int:
	for use: Variant in count.get("uses", []):
		var kind: String = Txt.of((use as Dictionary).get("use"))
		if kind == "threshold" or kind == "creature":
			return int((use as Dictionary).get("min", 0))
	return -1


## As contagens de uma carta para os selos: [{text ("3", "2/3"), met, devotion, colors, label}]. Uma carta no campo não
## mostra a redução ou o aumento do próprio custo (Terror Tolariano já foi conjurado: o número não muda mais nada nela).
static func seals(card: Dictionary, owner: Variant = null, on_field: bool = false) -> Array:
	var out: Array = []
	if bool(card.get("faceDown", false)) or not card.get("counts") is Array:
		return out
	for raw: Variant in card["counts"]:
		var count: Dictionary = raw
		if on_field and _only_own_cost(count):
			continue
		var n: int = shown(count)
		var least: int = minimum(count)
		out.append({"text": str(n) + ("/%d" % least if least >= 0 else ""), "met": least >= 0 and n >= least,
			"devotion": Txt.of(count.get("of")) == "devotion", "colors": count.get("colors", []) if count.get("colors") is Array else [],
			"label": count_label(count, owner)})
	return out


## A contagem só muda o custo da própria carta (sem outro uso).
static func _only_own_cost(count: Dictionary) -> bool:
	var uses: Array = count.get("uses", []) if count.get("uses") is Array else []
	if uses.is_empty():
		return false
	for use: Variant in uses:
		var kind: String = Txt.of((use as Dictionary).get("use"))
		if not (kind == "costLess" or kind == "costMore") or bool((use as Dictionary).get("others", false)):
			return false
	return true


static func _use_text(use: Dictionary, count: Dictionary) -> String:
	var n: int = shown(count)
	var amount: int = int(use.get("amount", 0))
	match Txt.of(use.get("use")):
		"pt":
			var power: Variant = use.get("power")
			var toughness: Variant = use.get("toughness")
			if power != null and toughness != null:
				return "%s %s/%s" % ["Dá" if _signed(power) else "Fica", Txt.of(power), Txt.of(toughness)]
			if power != null:
				return ("Dá %s de poder" % Txt.of(power)) if _signed(power) else ("Poder %s" % Txt.of(power))
			return ("Dá %s de resistência" % Txt.of(toughness)) if _signed(toughness) else ("Resistência %s" % Txt.of(toughness))
		"threshold":
			var least: int = int(use.get("min", 0))
			if n >= least:
				return "Com %d ou mais, o efeito extra já vale" % least
			var missing: int = least - n
			return "O efeito extra vale com %d ou mais (falta%s %d)" % [least, "m" if missing > 1 else "", missing]
		"creature":
			var least: int = int(use.get("min", 0))
			if n >= least:
				return "Com %d ou mais, é criatura" % least
			var missing: int = least - n
			return "Só é criatura com %d (falta%s %d)" % [least, "m" if missing > 1 else "", missing]
		"damage":
			return "Causa %d de dano%s" % [amount, (" (%d + %d)" % [int(use["plus"]), n]) if use.get("plus") != null else ""]
		"costLess":
			return ("As mágicas afetadas custam %d a menos" if bool(use.get("others", false)) else "Custa %d a menos") % amount
		"costMore":
			return ("As mágicas afetadas custam %d a mais" if bool(use.get("others", false)) else "Custa %d a mais") % amount
		"lifeGain":
			return "Faz ganhar %d de vida" % amount
		"lifeLoss":
			return "Faz perder %d de vida" % amount
		"life":
			return "%d de vida" % amount
		"draw":
			return "Compra %s" % _plural(amount, "carta", "cartas")
		"mill":
			return "Põe %s do grimório no cemitério" % _plural(amount, "carta", "cartas")
		"discard":
			return "Faz descartar %s" % _plural(amount, "carta", "cartas")
		"pick":
			return "Põe %s na mão" % _plural(amount, "carta", "cartas")
		"tokens":
			return "Cria %s" % _plural(amount, "ficha", "fichas")
		"counters":
			return "Põe %s" % _plural(amount, "marcador", "marcadores")
		"mana":
			return "Gera %d de mana" % amount
	return ""


static func _signed(v: Variant) -> bool:
	var t: String = Txt.of(v)
	return t.begins_with("+") or t.begins_with("-")


## "criaturas", "cartas de criatura" (fora do campo), "Lições", ou "permanentes do tipo Kor".
static func _noun(type: String, on_field: bool) -> Array:
	if not on_field and CARD_TYPE.has(type):
		return ["cartas de %s" % CARD_TYPE[type], "f"]
	if NOUN.has(type):
		return NOUN[type]
	return ["%s do tipo %s" % ["permanentes" if on_field else "cartas", type], "f"]


static func _qualified(count: Dictionary) -> Array:
	var on_field: bool = Txt.of(count.get("zone")) == "battlefield"
	var types: Array = count["types"] if count.get("types") is Array and not (count["types"] as Array).is_empty() else ["Card"]
	var nouns: Array = types.map(func(t: Variant) -> Array: return _noun(Txt.of(t), on_field))
	var gender: String = nouns[0][1]
	var fem: int = 1 if gender == "f" else 0
	var q: Array = count["qualities"] if count.get("qualities") is Array else []
	var before: String = ("outras " if gender == "f" else "outros ") if q.has("other") else ""
	var after: PackedStringArray = []
	var compare := RegEx.create_from_string("^(power|toughness|cmc)(GE|LE|GT|LT|EQ)(\\d+)$")
	for raw: Variant in q:
		var quality: String = Txt.of(raw)
		if ADJECTIVE.has(quality):
			after.append(ADJECTIVE[quality][fem])
		elif quality.begins_with("non:"):
			var t: String = quality.substr(4)
			var word: String = Txt.of(CARD_TYPE.get(t, ""))
			if word == "":
				var adj: Variant = ADJECTIVE.get(t.to_lower())
				word = adj[fem] if adj != null else t
			after.append("não " + word)
		elif quality.begins_with("with:"):
			after.append("com " + Txt.of(KEYWORD.get(quality.substr(5), quality.substr(5))))
		elif quality == "token":
			after.append("que são fichas")
		elif quality == "nontoken":
			after.append("que não são fichas")
		else:
			var m: RegExMatch = compare.search(quality)
			if m:
				after.append("com %s %s" % [NUMBER_WORD[m.get_string(1)], _compare(m.get_string(2), m.get_string(3))])
	var names: Array = nouns.map(func(n: Array) -> String: return n[0])
	return ["%s%s%s" % [before, _list(names, "ou"), (" " + " ".join(after)) if not after.is_empty() else ""], gender]


static func _compare(op: String, n: String) -> String:
	match op:
		"GE": return "%s ou mais" % n
		"LE": return "%s ou menos" % n
		"GT": return "maior que %s" % n
		"LT": return "menor que %s" % n
	return "igual a %s" % n


## De quem é a contagem: "que você controla", "no cemitério de Ana", "em todos os cemitérios".
static func _whose(count: Dictionary, owner: String) -> String:
	var zone: String = Txt.of(count.get("zone")) if count.get("zone") != null else "battlefield"
	var who: String = Txt.of(count.get("whose")) if count.get("whose") != null else "all"
	if zone == "battlefield":
		if who == "you":
			return ("que %s controla" % owner) if owner != "" else "que você controla"
		if who == "opponents":
			return ("que os oponentes de %s controlam" % owner) if owner != "" else "que seus oponentes controlam"
		return "no campo, de todos os jogadores"
	var place: Array = ["cemitério", "cemitérios"] if zone == "graveyard" else ["exílio", "exílios"]
	if who == "you":
		return ("no %s de %s" % [place[0], owner]) if owner != "" else "no seu %s" % place[0]
	if who == "opponents":
		return ("nos %s dos oponentes de %s" % [place[1], owner]) if owner != "" else "nos %s dos seus oponentes" % place[1]
	return "em todos os cemitérios" if zone == "graveyard" else "no exílio, de todos os jogadores"


static func _list(names: Array, last: String = "e") -> String:
	if names.size() > 1:
		var head: PackedStringArray = []
		for i: int in names.size() - 1:
			head.append(Txt.of(names[i]))
		return "%s %s %s" % [", ".join(head), last, Txt.of(names[-1])]
	return Txt.of(names[0]) if not names.is_empty() else ""


static func _plural(n: int, one: String, many: String) -> String:
	return "%d %s" % [n, one if n == 1 else many]


static func _capital(t: String) -> String:
	return t.left(1).to_upper() + t.substr(1)
