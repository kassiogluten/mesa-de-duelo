# O que o inspetor mostra de uma carta, em português: nome, custo, tipo (e o que um efeito mudou nele), texto, força,
# palavras-chave, marcadores e notas.
# Só monta os textos (sem desenhar), para o inspetor e a prévia usarem e os testes conferirem.
class_name CardDetails
extends RefCounted

## Marcadores que também existem no jogador (src/ui/playerCounters.ts); os da permanente e os de palavra-chave vêm de CardLabels.
const PLAYER_COUNTERS := {"POISON": "Veneno", "RAD": "Radiação", "ENERGY": "Energia", "EXPERIENCE": "Experiência", "TICKET": "Tíquete", "CONTRACT": "Contrato"}
## De que a proteção protege (PROTECTION_LABEL de src/ui/permanentEffects.ts).
const PROTECTION := {
	"white": "branco", "blue": "azul", "black": "preto", "red": "vermelho", "green": "verde", "artifact": "artefatos", "artifacts": "artefatos",
	"creature": "criaturas", "creatures": "criaturas", "multicolored": "multicoloridas", "monocolored": "monocoloridas", "everything": "tudo",
	"colorless": "incolores", "instant": "instantâneas", "sorcery": "feitiços", "enchantment": "encantamentos", "planeswalker": "planeswalkers",
}
## Tipo de terreno da travessia, como nas cartas em português.
const LAND := {"Swamp": "pântano", "Island": "ilha", "Forest": "floresta", "Mountain": "montanha", "Plains": "planície", "Desert": "deserto", "Land": "terreno"}
const LAND_TRAIT := {"Snow": "da neve", "Legendary": "lendário", "nonBasic": "não básico"}
## Como a permanente ficou virada para baixo.
const FACE_DOWN := {"morph": "Metamorfose", "disguise": "Disfarce", "manifest": "Manifestada", "cloak": "Encoberta"}


## Os textos de uma carta do estado. `ctx`: lookup (nome em inglês → CardCatalog.info), player_name (id → nome),
## card_name (id de outra carta → nome em português, "" se não está à mostra) e you (o seu id).
static func build(card: Dictionary, ctx: Dictionary) -> Dictionary:
	var lookup: Callable = ctx.get("lookup", func(_n: String) -> Dictionary: return {})
	var notes: PackedStringArray = []
	var shown: Dictionary = card
	var secret: bool = bool(card.get("faceDown", false)) and card.get("hiddenFace") is Dictionary and Txt.of((card["hiddenFace"] as Dictionary).get("name")) != ""
	if secret:
		shown = (card["hiddenFace"] as Dictionary).duplicate()
		notes.append("Virada para baixo: só você pode ver qual carta é.")
	var hidden: bool = not secret and (bool(card.get("faceDown", false)) or Txt.of(card.get("name")) == "")
	var out: Dictionary = {"hidden": hidden, "name": "", "cost": "", "type": "", "type_change": "", "text": "", "power": "", "toughness": "", "base": "",
		"damage": int(card.get("damage", 0)), "keywords": PackedStringArray(), "counters": PackedStringArray(), "notes": notes}
	if hidden:
		var kind: String = Txt.of(FACE_DOWN.get(Txt.of(card.get("faceDownKind")), ""))
		out["name"] = kind if kind != "" else "Carta virada para baixo"
		out["text"] = "Criatura 2/2 sem nome, cor nem habilidades. Só quem a controla sabe qual carta é." if card.has("power") else "As informações desta carta estão ocultas."
	else:
		var name: String = Txt.of(shown.get("name"))
		var info: Dictionary = lookup.call(name)
		out["name"] = Txt.of(info.get("label", name)) if Txt.of(info.get("label")) != "" else name
		out["cost"] = Txt.of(shown.get("manaCost"))
		out["type"] = _first([info.get("type_line"), card.get("printedType"), shown.get("typeLine")])
		var text: String = _first([info.get("text"), shown.get("text")])
		out["text"] = without_card_ids(text) if text != "" else ("Carregando informações da carta…" if info.is_empty() else "")
		out["type_change"] = TypeChange.permanent_text(card)
	if card.has("power") and card.has("toughness") and (bool(card.get("creature", false)) or hidden or secret):
		out["power"] = str(int(card["power"]))
		out["toughness"] = str(int(card["toughness"]))
		var bp: int = int(card.get("basePower", card["power"]))
		var bt: int = int(card.get("baseToughness", card["toughness"]))
		if card.has("basePower") and (bp != int(card["power"]) or bt != int(card["toughness"])):
			out["base"] = "%d/%d" % [bp, bt]
	for raw: Variant in card.get("keywords", []):
		out["keywords"].append(keyword_name(card, Txt.of(raw)))
	var counters: Variant = card.get("counters")
	if counters is Dictionary:
		for key: Variant in counters:
			if int(counters[key]) != 0:
				out["counters"].append("%s × %d" % [counter_name(Txt.of(key)), int(counters[key])])
	_notes(card, ctx, notes)
	return out


## Os textos de uma face da carta vista pelo botão de virar (a outra face de uma dupla face ou de uma flip): nome, custo,
## tipo, texto e a força impressa. `face_info` é uma das faces do catálogo (CardCatalog, campo faces).
static func face(face_info: Dictionary) -> Dictionary:
	var text: String = Txt.of(face_info.get("text"))
	return {"hidden": false, "name": Txt.of(face_info.get("label", face_info.get("name", ""))), "cost": Txt.of(face_info.get("cost")),
		"type": Txt.of(face_info.get("type_line")), "type_change": "", "text": without_card_ids(text), "power": Txt.of(face_info.get("power")),
		"toughness": Txt.of(face_info.get("toughness")), "base": "", "damage": 0, "keywords": PackedStringArray(), "counters": PackedStringArray(),
		"notes": PackedStringArray()}


## O nome de uma palavra-chave nesta carta: a travessia diz de quê, a proteção contra o quê; as desconhecidas como o Forge escreve.
static func keyword_name(card: Dictionary, key: String) -> String:
	if key == "LANDWALK" and not (card.get("landwalk", []) as Array).is_empty():
		var lands: PackedStringArray = []
		for spec: Variant in card["landwalk"]:
			lands.append(land_name(Txt.of(spec)))
		return "Travessia de " + _join(lands, "e de")
	if key == "PROTECTION" and not (card.get("protection", []) as Array).is_empty():
		var from: PackedStringArray = []
		for raw: Variant in card["protection"]:
			from.append(Txt.of(PROTECTION.get(Txt.of(raw), Txt.of(raw))))
		return "Proteção contra " + _join(from, "e")
	if key == "WARD" and Txt.of(card.get("ward")) != "":
		return "Proteção contra alvos — " + Txt.of(card["ward"])
	if CardLabels.KEYWORD_LABEL.has(key):
		return Txt.of(CardLabels.KEYWORD_LABEL[key])
	var plain: String = key.replace("_", " ").to_lower()
	return plain.substr(0, 1).to_upper() + plain.substr(1)


## O nome de um marcador: os da permanente e os de palavra-chave ("Flying") por CardLabels, os do jogador aqui.
static func counter_name(key: String) -> String:
	if PLAYER_COUNTERS.has(key):
		return Txt.of(PLAYER_COUNTERS[key])
	return CardLabels.counter_name(key)


## "Forest.Snow" → "floresta da neve".
static func land_name(spec: String) -> String:
	var parts: PackedStringArray = spec.split(".")
	if not LAND.has(parts[0]):
		return spec.to_lower()
	var words: PackedStringArray = [Txt.of(LAND[parts[0]])]
	for i: int in range(1, parts.size()):
		words.append(Txt.of(LAND_TRAIT.get(parts[i], parts[i].to_lower())))
	return " ".join(words)


## O Forge cita cartas como "Nome (id)"; o id é interno da partida e não diz nada ao jogador.
static func without_card_ids(text: String) -> String:
	var re := RegEx.create_from_string(" \\(\\d+\\)")
	return re.sub(text, "", true)


## Os estados da permanente por extenso (ficha, cópia, controle trocado, anexada, atiçada, enjoo…).
static func _notes(card: Dictionary, ctx: Dictionary, notes: PackedStringArray) -> void:
	var player: Callable = ctx.get("player_name", func(id: int) -> String: return "Jogador %d" % id)
	var other: Callable = ctx.get("card_name", func(_id: int) -> String: return "")
	var lookup: Callable = ctx.get("lookup", func(_n: String) -> Dictionary: return {})
	var label: Callable = func(name: String) -> String:
		var info: Dictionary = lookup.call(name)
		return Txt.of(info.get("label")) if Txt.of(info.get("label")) != "" else name
	if bool(card.get("commander", false)):
		notes.append("Comandante.")
	if bool(card.get("token", false)):
		notes.append("Ficha.")
	if Txt.of(card.get("copyOf")) != "":
		notes.append("Cópia de %s." % label.call(Txt.of(card["copyOf"])))
	if card.get("owner") != null and card.get("controller") != null and int(card["owner"]) != int(card["controller"]):
		var owner: String = player.call(int(card["owner"]))
		notes.append("Pertence a %s; quem a controla agora é %s. Volta para %s quando o efeito de controle acabar." % [owner, player.call(int(card["controller"])), owner])
	if card.get("attachedTo") != null:
		var host: String = other.call(int(card["attachedTo"]))
		notes.append("Anexada a %s." % host if host != "" else "Anexada a uma carta na mesa.")
	if card.get("attachedToPlayer") != null:
		notes.append("Encanta %s: os efeitos dela valem para esse jogador." % player.call(int(card["attachedToPlayer"])))
	if card.get("protector") != null:
		notes.append("Batalha defendida por %s: é quem bloqueia as criaturas que a atacam." % player.call(int(card["protector"])))
	var goaded: Array = card.get("goadedBy", []) if card.get("goadedBy") is Array else []
	if not goaded.is_empty():
		var by: PackedStringArray = []
		for id: Variant in goaded:
			by.append(player.call(int(id)))
		notes.append("Atiçada por %s: ataca em todo combate, se puder, e ataca um jogador que não seja %s, se puder." % [_join(by, "e"), _join(by, "e")])
	if int(card.get("shields", 0)) > 0:
		var n: int = int(card["shields"])
		notes.append(("%d escudos de regeneração" % n if n > 1 else "Escudo de regeneração") + ": da próxima vez que seria destruída neste turno, em vez disso é virada, sai do combate e perde o dano marcado.")
	for state: Variant in card.get("states", []):
		var text: String = _state_label(Txt.of(state), card)
		if text != "":
			notes.append(text)
	if bool(card.get("sick", false)) and bool(card.get("creature", false)):
		notes.append("Enjoo de invocação: entrou neste turno e ainda não pode atacar nem usar habilidades com {T}.")
	if bool(card.get("cantAttack", false)) and bool(card.get("cantBlock", false)):
		notes.append("Não pode atacar nem bloquear, por efeito de uma carta.")
	elif bool(card.get("cantAttack", false)):
		notes.append("Não pode atacar, por efeito de uma carta.")
	elif bool(card.get("cantBlock", false)):
		notes.append("Não pode bloquear, por efeito de uma carta.")
	if bool(card.get("unblockable", false)):
		notes.append("Não pode ser bloqueada.")
	if int(card.get("preventDamage", 0)) > 0:
		notes.append("Os próximos %d de dano que ela receberia são prevenidos." % int(card["preventDamage"]))
	if bool(card.get("phasedOut", false)):
		notes.append("Fora de fase: continua no campo, mas como se não existisse.")
	if bool(card.get("ringBearer", false)):
		notes.append("Portador do Anel de quem a controla.")
	if bool(card.get("prepared", false)):
		notes.append("Preparada" + (": quem a controla pode conjurar uma cópia de %s." % label.call(Txt.of(card["preparedSpell"])) if Txt.of(card.get("preparedSpell")) != "" else "."))
	if bool(card.get("foretold", false)):
		notes.append("Prevista: quem a previu pode conjurá-la do exílio%s, a partir do turno seguinte ao da previsão." % (" por " + Txt.of(card["foretellCost"]) if Txt.of(card.get("foretellCost")) != "" else ""))
	if bool(card.get("plotted", false)):
		notes.append("Tramada: quem a tramou pode conjurá-la do exílio sem pagar o custo, num turno seguinte, quando poderia conjurar um feitiço.")
	if card.get("classLevel") != null:
		var level: int = int(card["classLevel"])
		var top: int = int(card.get("classMaxLevel", 0))
		notes.append("Nível %d%s%s." % [level, " de %d" % top if top > 0 else "", " (nível máximo)" if top > 0 and level >= top else ""])
	var exiling: Array = card.get("exiling", []) if card.get("exiling") is Array else []
	if not exiling.is_empty():
		var names: PackedStringArray = []
		for id: Variant in exiling:
			var name: String = other.call(int(id))
			names.append(name if name != "" else "uma carta virada para baixo")
		notes.append("Exilando: %s." % _join(names, "e"))
	var merged: Array = card.get("merged", []) if card.get("merged") is Array else []
	if merged.size() > 1:
		var parts: PackedStringArray = []
		for raw: Variant in merged:
			var part: Dictionary = raw
			parts.append("uma carta virada para baixo" if bool(part.get("faceDown", false)) or Txt.of(part.get("name")) == "" else label.call(Txt.of(part["name"])))
		var under: PackedStringArray = parts.slice(1)
		notes.append("Mutada: %s por cima, %s embaixo. Nome, tipo e força vêm da carta de cima; a criatura tem as habilidades de todas." % [parts[0], _join(under, "e")])


static func _state_label(state: String, card: Dictionary) -> String:
	match state:
		"monstrous": return "Monstruosa: já usou a monstruosidade e não fica monstruosa de novo."
		"renowned": return "Renomada: ganhou o renome e não ganha de novo."
		"suspected": return "Suspeita: tem ameaçar e não pode bloquear enquanto estiver suspeita."
		"saddled": return "Selada neste turno%s." % _by(card.get("saddledBy"))
		"crewed": return "Tripulada neste turno%s." % _by(card.get("crewedBy"))
		"exerted": return "Exaurida: não desvira na próxima etapa de desvirar de quem a controla."
		"detained": return "Detida: não pode atacar nem bloquear, e as habilidades ativadas dela não podem ser ativadas, até o próximo turno de quem a deteve."
		"harnessed": return "Atrelada: o que depende de ela estar atrelada está ligado."
		"solved": return "Caso solucionado: a habilidade de Solucionado está ligada."
	return ""


static func _by(names: Variant) -> String:
	if not names is Array or (names as Array).is_empty():
		return ""
	var list: PackedStringArray = []
	for name: Variant in names:
		list.append(Txt.of(name))
	return " por " + _join(list, "e")


## "a, b e c".
static func _join(items: PackedStringArray, last: String) -> String:
	if items.size() <= 1:
		return items[0] if items.size() == 1 else ""
	return "%s %s %s" % [", ".join(items.slice(0, items.size() - 1)), last, items[items.size() - 1]]


static func _first(values: Array) -> String:
	for value: Variant in values:
		if Txt.of(value) != "":
			return Txt.of(value)
	return ""
