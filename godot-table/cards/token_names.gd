# As fichas como o jogador as lê: o nome sem o "Token" do Forge e em português ("Soldier Token" → "Soldado"), a linha de
# tipo ("Criatura Ficha — Goblin") e a cor provável pelo tipo de criatura, para a ficha desenhada quando não há arte.
class_name TokenNames
extends RefCounted

## Os tipos das fichas mais comuns, em português (os que ficam iguais, como Goblin e Elemental, nem precisam estar aqui).
const SUBTYPES := {
	"Soldier": "Soldado", "Zombie": "Zumbi", "Spirit": "Espírito", "Beast": "Fera", "Wolf": "Lobo", "Elf": "Elfo",
	"Warrior": "Guerreiro", "Knight": "Cavaleiro", "Angel": "Anjo", "Dragon": "Dragão", "Bird": "Ave", "Cat": "Gato",
	"Insect": "Inseto", "Human": "Humano", "Vampire": "Vampiro", "Rat": "Rato", "Squirrel": "Esquilo", "Snake": "Serpente",
	"Bear": "Urso", "Treasure": "Tesouro", "Clue": "Pista", "Food": "Comida", "Blood": "Sangue", "Thopter": "Tóptero",
	"Construct": "Constructo", "Plant": "Planta", "Faerie": "Fada", "Drake": "Draco", "Ox": "Boi", "Demon": "Demônio",
	"Giant": "Gigante", "Dinosaur": "Dinossauro", "Pirate": "Pirata", "Cleric": "Clérigo", "Wizard": "Mago", "Rogue": "Ladino",
	"Monk": "Monge", "Shaman": "Xamã", "Scout": "Batedor", "Devil": "Diabo", "Spawn": "Cria", "Scion": "Rebento",
	"Germ": "Germe", "Illusion": "Ilusão", "Boar": "Javali", "Elk": "Alce", "Dog": "Cão", "Fish": "Peixe", "Octopus": "Polvo",
	"Spider": "Aranha", "Pegasus": "Pégaso", "Griffin": "Grifo", "Unicorn": "Unicórnio", "Fox": "Raposa", "Rabbit": "Coelho",
	"Skeleton": "Esqueleto", "Shade": "Sombra", "Bat": "Morcego", "Imp": "Diabrete", "Assassin": "Assassino", "Ally": "Aliado",
	"Citizen": "Cidadão", "Mercenary": "Mercenário", "Hippo": "Hipopótamo", "Lizard": "Lagarto", "Frog": "Sapo", "Horse": "Cavalo",
}
## A cor provável de uma ficha pelo tipo dela (o estado não traz a cor; a ficha desenhada precisa de uma).
const COLOR_OF := {
	"Goblin": "R", "Dragon": "R", "Devil": "R", "Elemental": "R", "Ogre": "R", "Lizard": "R",
	"Soldier": "W", "Spirit": "W", "Angel": "W", "Knight": "W", "Human": "W", "Cat": "W", "Cleric": "W", "Pegasus": "W",
	"Griffin": "W", "Unicorn": "W", "Citizen": "W", "Ally": "W", "Monk": "W", "Bird": "W",
	"Zombie": "B", "Vampire": "B", "Rat": "B", "Skeleton": "B", "Horror": "B", "Demon": "B", "Bat": "B", "Imp": "B",
	"Shade": "B", "Assassin": "B", "Germ": "B", "Pirate": "B", "Rogue": "B",
	"Elf": "G", "Saproling": "G", "Beast": "G", "Wolf": "G", "Insect": "G", "Squirrel": "G", "Snake": "G", "Bear": "G",
	"Plant": "G", "Elk": "G", "Boar": "G", "Spider": "G", "Ox": "G", "Dinosaur": "G", "Hippo": "G", "Frog": "G", "Fox": "G",
	"Faerie": "U", "Drake": "U", "Illusion": "U", "Fish": "U", "Octopus": "U", "Kraken": "U", "Wizard": "U",
}


## O nome sem o " Token" que o Forge põe no fim ("Goblin Token" → "Goblin"); os outros voltam como vieram.
static func base(name: String) -> String:
	return name.trim_suffix(" Token") if name.ends_with(" Token") and name.length() > 6 else name


## O nome da ficha em português, sem "Token": cada palavra conhecida traduzida ("Soldier Token" → "Soldado").
static func label(name: String) -> String:
	var words: PackedStringArray = []
	for word: String in base(name).split(" ", false):
		words.append(Txt.of(SUBTYPES.get(word, word)))
	return " ".join(words)


## A linha de tipo em português com "Ficha" ("Token Creature — Goblin Soldier" → "Criatura Ficha — Goblin Soldado").
## Sem `token`, só traduz os tipos ("Legendary Creature — Elf" → "Criatura Lendária — Elf").
static func type_line(line: String, token: bool) -> String:
	var parts: PackedStringArray = line.split("—", true, 1)
	var types: PackedStringArray = []
	for word: String in parts[0].split(" ", false):
		if word != "Token":
			types.append(word)
	var out: String = TypeChange.types_text(types)
	if token:
		out = (out + " Ficha").strip_edges()
	if parts.size() > 1 and parts[1].strip_edges() != "":
		var subs: PackedStringArray = []
		for word: String in parts[1].strip_edges().split(" ", false):
			subs.append(Txt.of(SUBTYPES.get(word, word)) if token else word)
		out += " — " + " ".join(subs)
	return out


## As cores prováveis da ficha pelos tipos de criatura (["R"], ["W", "G"]…); [] quando nenhum diz (incolor).
static func colors(line: String) -> Array:
	var out: Array = []
	var parts: PackedStringArray = line.split("—", true, 1)
	if parts.size() < 2:
		return out
	for word: String in parts[1].strip_edges().split(" ", false):
		var color: String = Txt.of(COLOR_OF.get(word, ""))
		if color != "" and not out.has(color):
			out.append(color)
	return out
