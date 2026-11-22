# Possessivo do Forge em português (porte de src/ui/forgeText.ts): "Procurar você's grimório" vira "Procurar seu grimório".
class_name ForgeText
extends RefCounted

const ZONES := {
	"grimório": "m", "mão": "f", "cemitério": "m", "exílio": "m", "campo de batalha": "m", "pilha": "f",
	"zona de comando": "f", "biblioteca": "f", "library": "m", "hand": "f", "graveyard": "m", "exile": "m", "battlefield": "m",
}
const MERGED := {
	"em": {"m": "no", "f": "na"}, "no": {"m": "no", "f": "na"}, "na": {"m": "no", "f": "na"},
	"de": {"m": "do", "f": "da"}, "do": {"m": "do", "f": "da"}, "da": {"m": "do", "f": "da"}, "para": {"m": "para o", "f": "para a"},
}


static func _zone_pattern() -> String:
	var keys: Array = ZONES.keys()
	keys.sort_custom(func(a: String, b: String) -> bool: return a.length() > b.length())
	var parts: PackedStringArray = []
	for key: String in keys:
		parts.append(key.replace(" ", r"\s+"))
	return "|".join(parts)


static func _gender(zone: String) -> String:
	return Txt.of(ZONES.get(Re.replace_all(r"\s+", zone.to_lower(), " "), "m"))


static func _capitalize(text: String) -> String:
	return text.substr(0, 1).to_upper() + text.substr(1)


## `names`: nomes dos jogadores da partida, para reconhecer nomes com mais de uma palavra ("IA vermelho's mão").
static func fix_possessives(text: Variant, names: Variant = null) -> String:
	var source: String = Txt.of(text)
	if source == "" or not Re.test(r"['’]s\s", source):
		return source
	var owners: Array = []
	if names is Array:
		for name: Variant in names:
			if Txt.of(name) != "":
				owners.append(Txt.of(name))
	owners.sort_custom(func(a: String, b: String) -> bool: return a.length() > b.length())
	var alternatives: PackedStringArray = []
	for owner: String in owners:
		alternatives.append(Re.escape(owner))
	alternatives.append("você")
	alternatives.append("[^\\s'’,.;:!?()\"]+")
	var pattern: String = r"(?i)(?:\b(em|de|do|da|no|na|para)\s+)?(" + "|".join(alternatives) + r")['’]s\s+(" + _zone_pattern() + r")\b"
	var out: String = ""
	var at: int = 0
	for m: RegExMatch in Re.compile(pattern).search_all(source):
		var prep: String = Re.group(m, 1)
		var who: String = m.get_string(2)
		var zone: String = m.get_string(3)
		var g: String = _gender(zone)
		var you: bool = who.to_lower() == "você"
		var object: String = ("sua " if g == "f" else "seu ") + zone if you else zone + " de " + who
		var piece: String
		if prep != "":
			piece = Txt.of((MERGED[prep.to_lower()] as Dictionary)[g]) + " " + object
		else:
			piece = object if you else ("a " if g == "f" else "o ") + object
		# Mantém a maiúscula de começo de frase.
		var lead: String = (prep if prep != "" else who).substr(0, 1)
		var offset: int = m.get_start()
		if lead == lead.to_upper() and (offset == 0 or Re.test(r"[.!?]\s*\z", source.substr(0, offset))):
			piece = _capitalize(piece)
		out += source.substr(at, offset - at) + piece
		at = m.get_end()
	return out + source.substr(at)
