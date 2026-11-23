# Nomes dos marcadores e das palavras-chave das cartas do campo, e quais aparecem em cada carta (como src/ui/cardLabels.ts).
class_name CardLabels
extends RefCounted

const CARD_COUNTERS := {
	"P1P1": "+1/+1", "M1M1": "−1/−1", "LOYALTY": "Lealdade", "DEFENSE": "Defesa", "SHIELD": "Escudo", "STUN": "Atordoamento",
	"TIME": "Tempo", "CHARGE": "Carga", "LORE": "Saga", "OIL": "Óleo", "AGE": "Idade", "FADE": "Desvanecer", "FLOOD": "Inundação",
	"DIVINITY": "Divindade", "QUEST": "Missão", "LEVEL": "Nível", "FINALITY": "Finalidade", "BOUNTY": "Recompensa",
}

## Palavras-chave que aparecem como selo na carta do campo (os nomes do enum do Forge).
const KEYWORD_LABEL := {
	"FLYING": "Voar", "REACH": "Alcance", "TRAMPLE": "Atropelar", "MENACE": "Ameaçar", "FIRST_STRIKE": "Iniciativa",
	"DOUBLE_STRIKE": "Golpe duplo", "DEATHTOUCH": "Toque mortífero", "LIFELINK": "Vínculo com a vida", "VIGILANCE": "Vigilância",
	"HASTE": "Ímpeto", "DEFENDER": "Defensor", "HEXPROOF": "Resistência à magia", "SHROUD": "Manto", "WARD": "Proteção contra alvos",
	"INDESTRUCTIBLE": "Indestrutível", "PROTECTION": "Proteção", "INTIMIDATE": "Intimidar", "FEAR": "Medo", "SHADOW": "Sombra",
	"SKULK": "Sorrateiro", "HORSEMANSHIP": "Equitação", "LANDWALK": "Travessia",
}

## As que protegem a permanente: valem em qualquer uma (planeswalker, artefato), não só nas criaturas.
const PROTECTIVE := ["HEXPROOF", "SHROUD", "WARD", "INDESTRUCTIBLE", "PROTECTION"]

## Marcadores de palavra-chave que não aparecem como palavra-chave no campo.
const OTHER_KEYWORD_COUNTERS := {"EXALTED": "Exaltado"}


## A palavra-chave de um marcador de palavra-chave ("Flying", "First Strike", "Hexproof:Card.Black:black" → FLYING…), ou "".
static func counter_keyword(type: String) -> String:
	var key: String = type.split(":")[0].strip_edges().to_upper().replace(" ", "_")
	return key if KEYWORD_LABEL.has(key) or OTHER_KEYWORD_COUNTERS.has(key) else ""


## Nome de um marcador de permanente, em português.
static func counter_name(type: String) -> String:
	if CARD_COUNTERS.has(type):
		return CARD_COUNTERS[type]
	var keyword: String = counter_keyword(type)
	if keyword != "":
		return KEYWORD_LABEL.get(keyword, OTHER_KEYWORD_COUNTERS.get(keyword, keyword))
	return type.capitalize()


## O ícone de um marcador: o próprio, o da palavra-chave que ele dá, ou o disco.
static func counter_icon(type: String) -> String:
	if CardIcons.has_icon(type):
		return type
	var keyword: String = counter_keyword(type)
	return keyword if keyword != "" and CardIcons.has_icon(keyword) else "disc"


static func keyword_name(keyword: String) -> String:
	return KEYWORD_LABEL.get(keyword, keyword)


## Palavras-chave mostradas no campo: todas numa criatura; nas outras permanentes, só as de proteção (Voar não muda nada nelas).
static func field_keywords(card: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	var creature: bool = bool(card.get("creature", false))
	var raw: Variant = card.get("keywords", [])
	if not raw is Array:
		return out
	for k: Variant in raw:
		var key: String = Txt.of(k)
		if KEYWORD_LABEL.has(key) and (creature or PROTECTIVE.has(key)) and not out.has(key):
			out.append(key)
	return out


## Enjoo de invocação: criatura que chegou neste turno e não tem ímpeto.
static func dizzy(card: Dictionary) -> bool:
	var keywords: Variant = card.get("keywords", [])
	return bool(card.get("creature", false)) and bool(card.get("sick", false)) and not (keywords is Array and (keywords as Array).has("HASTE"))


## Planeswalker ou batalha que não é criatura (são atacados, como os jogadores).
static func is_attackable(card: Dictionary) -> bool:
	return not bool(card.get("creature", false)) and (bool(card.get("planeswalker", false)) or Txt.of(card.get("typeLine", "")).contains("Battle"))


## Fileira de trás: terrenos e artefatos/encantamentos que não são criaturas (nem planeswalkers ou batalhas).
static func is_back_row(card: Dictionary) -> bool:
	if bool(card.get("creature", false)) or bool(card.get("planeswalker", false)):
		return false
	var type_line: String = Txt.of(card.get("typeLine", ""))
	return bool(card.get("land", false)) or type_line.contains("Artifact") or type_line.contains("Enchantment")
