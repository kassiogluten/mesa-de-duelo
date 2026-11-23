# Quais efeitos contínuos uma permanente mostra com a mesa parada (voar, vínculo com a vida, indestrutível…): no máximo
# dois por carta, os mais fortes, para a mesa não virar um show de luzes. Só decide; quem desenha é AmbientFx.
class_name AmbientTraits
extends RefCounted

## Os efeitos do shader (fx/ambient_card.gdshader): o número de cada um é o `mode` de lá.
enum Mode {
	NONE, FLYING, LIFELINK, INDESTRUCTIBLE, DEATHTOUCH, HEXPROOF, SHROUD, WARD, MENACE, HASTE, FIRST_STRIKE,
	DOUBLE_STRIKE, VIGILANCE, TRAMPLE, REACH, DEFENDER, LEGENDARY, COMMANDER, TOKEN, PLANESWALKER, P1P1,
}

## Quantos efeitos de luz cabem numa carta.
const MAX_SLOTS := 2

## A ordem de força: o que mais muda o jogo vem antes (indestrutível e toque mortífero mudam o combate; ficha e lendária
## só contam quem a carta é). Voar tem o pairar além do vento, então ele fica bem visível mesmo sem a vaga de luz.
const PRIORITY: Array[int] = [
	Mode.INDESTRUCTIBLE, Mode.DEATHTOUCH, Mode.LIFELINK, Mode.FLYING, Mode.HEXPROOF, Mode.SHROUD, Mode.WARD,
	Mode.COMMANDER, Mode.PLANESWALKER, Mode.MENACE, Mode.DOUBLE_STRIKE, Mode.FIRST_STRIKE, Mode.HASTE, Mode.TRAMPLE,
	Mode.REACH, Mode.VIGILANCE, Mode.DEFENDER, Mode.P1P1, Mode.LEGENDARY, Mode.TOKEN,
]

## Palavra-chave do Forge → efeito.
const KEYWORD_MODE := {
	"FLYING": Mode.FLYING, "LIFELINK": Mode.LIFELINK, "INDESTRUCTIBLE": Mode.INDESTRUCTIBLE, "DEATHTOUCH": Mode.DEATHTOUCH,
	"HEXPROOF": Mode.HEXPROOF, "SHROUD": Mode.SHROUD, "WARD": Mode.WARD, "MENACE": Mode.MENACE, "HASTE": Mode.HASTE,
	"FIRST_STRIKE": Mode.FIRST_STRIKE, "DOUBLE_STRIKE": Mode.DOUBLE_STRIKE, "VIGILANCE": Mode.VIGILANCE,
	"TRAMPLE": Mode.TRAMPLE, "REACH": Mode.REACH, "DEFENDER": Mode.DEFENDER,
}

## Os que têm partículas no modo caprichado (as faíscas que sobem da carta), dentro do orçamento de cada lado da mesa.
const PARTICLE_MODES: Array[int] = [Mode.LIFELINK, Mode.MENACE]


## Tudo o que a carta tem, na ordem de força, sem cortar: [Mode, ...]. Virada para baixo, nada (ninguém sabe o que é).
static func candidates(card: Dictionary, ctx: Dictionary = {}) -> Array[int]:
	var found: Dictionary = {}
	if card.is_empty() or bool(card.get("faceDown", false)):
		return []
	var creature: bool = bool(card.get("creature", false))
	# As mesmas palavras-chave dos selos: numa criatura todas, nas outras só as de proteção.
	for k: String in CardLabels.field_keywords(card):
		if KEYWORD_MODE.has(k):
			found[KEYWORD_MODE[k]] = true
	# Ímpeto só importa no turno em que a criatura entrou (é quando ele deixa atacar).
	if found.has(Mode.HASTE) and not (creature and bool(card.get("sick", false))):
		found.erase(Mode.HASTE)
	# Golpe duplo já inclui a iniciativa: um brilho só.
	if found.has(Mode.DOUBLE_STRIKE):
		found.erase(Mode.FIRST_STRIKE)
	if found.has(Mode.SHROUD):
		found.erase(Mode.HEXPROOF)
	var id: int = int(card.get("id", -1))
	if bool(card.get("commander", false)) or (ctx.get("commanders", {}) as Dictionary).has(id):
		found[Mode.COMMANDER] = true
	elif Txt.of(card.get("typeLine", "")).contains("Legendary"):
		found[Mode.LEGENDARY] = true
	if bool(card.get("planeswalker", false)) and not creature:
		found[Mode.PLANESWALKER] = true
	if bool(card.get("token", false)):
		found[Mode.TOKEN] = true
	var counters: Variant = card.get("counters")
	if creature and counters is Dictionary and int((counters as Dictionary).get("P1P1", 0)) > 0:
		found[Mode.P1P1] = true
	var out: Array[int] = []
	for mode: int in PRIORITY:
		if found.has(mode):
			out.append(mode)
	return out


## Os efeitos que a carta mostra: os dois mais fortes ([] sem nenhum).
static func pick(card: Dictionary, ctx: Dictionary = {}) -> Array[int]:
	var all: Array[int] = candidates(card, ctx)
	return all.slice(0, MAX_SLOTS)


## Criatura com Voar: paira um pouco acima do tampo (mesmo quando o vento não coube nas duas vagas de luz).
static func hovers(card: Dictionary) -> bool:
	return not bool(card.get("faceDown", false)) and bool(card.get("creature", false)) and CardLabels.field_keywords(card).has("FLYING")


## A lealdade do planeswalker (o pulso acelera e acende mais com ela).
static func loyalty(card: Dictionary) -> int:
	var counters: Variant = card.get("counters")
	return int((counters as Dictionary).get("LOYALTY", 0)) if counters is Dictionary else 0


## A primeira dos efeitos escolhidos que solta partículas no modo caprichado, ou NONE.
static func particle_mode(modes: Array[int]) -> int:
	for mode: int in modes:
		if PARTICLE_MODES.has(mode):
			return mode
	return Mode.NONE


## As cartas de cima de cada monte de cópias de um jogador (só elas mostram efeito: as de baixo ficam cobertas) e os anexos:
## {tops: {id: true}, attached: {id: id do hospedeiro}}. Mesma regra de FieldLayout.stack_key.
static func visible_cards(player: Dictionary, ctx: Dictionary) -> Dictionary:
	var attached: Dictionary = {}
	for host: Variant in ctx.get("attachments", {}):
		for c: Variant in ctx["attachments"][host]:
			attached[int((c as Dictionary)["id"])] = int(host)
	var last_of: Dictionary = {}
	for raw: Variant in player.get("battlefield", []):
		var card: Dictionary = raw
		var id: int = int(card["id"])
		if attached.has(id):
			continue
		last_of[FieldLayout.stack_key(card, ctx)] = id
	var tops: Dictionary = {}
	for key: Variant in last_of:
		tops[last_of[key]] = true
	return {"tops": tops, "attached": attached}
