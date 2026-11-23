# Textos da trilha de fases e do turno (porte de src/ui/phaseHud.ts e opponentStops.ts): grupos, etapas, paradas e dia/noite.
class_name PhaseText
extends RefCounted

## Cinco grupos como no Arena: chave, nome e o desenho do ícone (os mesmos traços SVG da mesa do navegador).
const GROUPS := [
	["start", "Início", "<path d=\"M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4\"/>"],
	["main1", "Principal 1", "<rect x=\"7\" y=\"4\" width=\"10\" height=\"16\" rx=\"2\"/>"],
	["combat", "Combate", "<path d=\"m5 5 14 14M19 5 5 19M5 15v4h4M19 15v4h-4\"/>"],
	["main2", "Principal 2", "<rect x=\"7\" y=\"4\" width=\"10\" height=\"16\" rx=\"2\"/><path d=\"M10 9h4M10 13h4\"/>"],
	["end", "Final", "<path d=\"M17 15.5A7 7 0 0 1 8.5 7a7 7 0 1 0 8.5 8.5z\"/>"],
]
## Etapa do Forge → grupo e o nome por extenso.
const STEPS := {
	"UNTAP": ["start", "Desvirar"], "UPKEEP": ["start", "Manutenção"], "DRAW": ["start", "Compra"],
	"MAIN1": ["main1", "Fase principal antes do combate"],
	"COMBAT_BEGIN": ["combat", "Início do combate"], "COMBAT_DECLARE_ATTACKERS": ["combat", "Declaração de atacantes"],
	"COMBAT_DECLARE_BLOCKERS": ["combat", "Declaração de bloqueadores"], "COMBAT_FIRST_STRIKE_DAMAGE": ["combat", "Dano de iniciativa"],
	"COMBAT_DAMAGE": ["combat", "Dano de combate"], "COMBAT_END": ["combat", "Fim do combate"],
	"MAIN2": ["main2", "Fase principal depois do combate"],
	"END_OF_TURN": ["end", "Etapa final"], "CLEANUP": ["end", "Limpeza"],
}
## Etapas que dão prioridade, na ordem do turno, com o grupo da trilha (STOP_STEPS de opponentStops.ts).
const STOP_STEPS := [
	["UPKEEP", "Manutenção", "start"], ["DRAW", "Compra", "start"], ["MAIN1", "Principal 1", "main1"],
	["COMBAT_BEGIN", "Início do combate", "combat"], ["COMBAT_DECLARE_ATTACKERS", "Atacantes", "combat"],
	["COMBAT_DECLARE_BLOCKERS", "Bloqueadores", "combat"], ["COMBAT_DAMAGE", "Dano de combate", "combat"],
	["COMBAT_END", "Fim do combate", "combat"], ["MAIN2", "Principal 2", "main2"], ["END_OF_TURN", "Etapa final", "end"],
]


## O grupo da trilha de uma etapa ("" se não é uma etapa conhecida).
static func step_group(phase: Variant) -> String:
	var step: Variant = STEPS.get(Txt.of(phase))
	return Txt.of((step as Array)[0]) if step is Array else ""


## O nome por extenso da etapa ("" se não é conhecida).
static func step_detail(phase: Variant) -> String:
	var step: Variant = STEPS.get(Txt.of(phase))
	return Txt.of((step as Array)[1]) if step is Array else ""


## Posição do grupo na trilha (0 a 4), ou -1.
static func group_index(group: String) -> int:
	for i: int in GROUPS.size():
		if (GROUPS[i] as Array)[0] == group:
			return i
	return -1


## Nome do grupo da trilha, para o título do menu de paradas.
static func phase_group_label(group: Variant) -> String:
	var i: int = group_index(Txt.of(group))
	return Txt.of((GROUPS[i] as Array)[1]) if i >= 0 else ""


## O turno é de quem vê a mesa (quem só assiste não tem turno).
static func _yours(state: Dictionary, id: Variant) -> bool:
	return id != null and state.get("you") != null and int(id) == int(state.get("you")) and not bool(state.get("watching", false))


static func _by_name(state: Dictionary) -> bool:
	return (state.get("players", []) as Array).size() > 2 or bool(state.get("watching", false))


static func _name_of(state: Dictionary, id: Variant) -> Variant:
	if id == null:
		return null
	for p: Variant in state.get("players", []):
		if (p as Dictionary).get("id") != null and int((p as Dictionary)["id"]) == int(id):
			return Txt.of((p as Dictionary).get("name"))
	return null


## "Seu turno", "Turno de Ana", "Jogo encerrado".
static func owner_text(state: Dictionary) -> String:
	var extra: String = " extra" if bool(state.get("extraTurn", false)) else ""
	var name: Variant = _name_of(state, state.get("activePlayer"))
	if bool(state.get("gameOver", false)):
		return "Jogo encerrado"
	if _yours(state, state.get("activePlayer")):
		return "Seu turno%s" % extra
	if name == "Oponente":
		return "Turno%s do oponente" % extra
	return "Turno%s de %s" % [extra, name] if name != null and name != "" else "Preparando o jogo"


## A faixa de troca de turno: "Seu turno", "Turno extra de Ana".
static func turn_banner_text(state: Dictionary) -> String:
	var mine: bool = _yours(state, state.get("activePlayer"))
	var name: Variant = _name_of(state, state.get("activePlayer"))
	if bool(state.get("extraTurn", false)):
		if mine:
			return "Turno extra"
		return "Turno extra de %s" % name if _by_name(state) and name != null and name != "" else "Turno extra do oponente"
	if mine:
		return "Seu turno"
	return "Turno de %s" % (name if name != null else "outro jogador") if _by_name(state) else "Turno do oponente"


## Turnos extras que vêm depois deste ("Depois: 2 turnos extras seu").
static func upcoming_turns_text(state: Dictionary) -> String:
	var queue: Array = state.get("extraTurns", []) if state.get("extraTurns") is Array else []
	if queue.is_empty():
		return ""
	var next: Variant = queue[0]
	var who: Callable = func(id: Variant) -> String:
		if _yours(state, id):
			return "seu"
		if _by_name(state):
			var n: Variant = _name_of(state, id)
			return "de %s" % (n if n != null else "outro jogador")
		return "do oponente"
	var first: String = who.call(next)
	if queue.size() == 1:
		return "Depois: turno extra %s" % first
	if queue.all(func(id: Variant) -> bool: return id == next):
		return "Depois: %d turnos extras %s" % [queue.size(), first]
	return "Depois: %d turnos extras, o próximo %s" % [queue.size(), first]


## Nome do combate atual e quantos ainda vêm neste turno.
static func combat_text(state: Dictionary) -> String:
	var n: int = int(state.get("combatNumber", 0)) if state.get("combatNumber") != null else 0
	var more: int = int(state.get("extraCombats", 0)) if state.get("extraCombats") != null else 0
	var parts: PackedStringArray = []
	if n > 1:
		parts.append("Combate extra" + (" (%dº combate)" % n if n > 2 else ""))
	if more > 0:
		parts.append(("mais um combate" if more == 1 else "mais %d combates" % more) + " neste turno")
	return " · ".join(parts)


## Quantos combates o turno tem até agora, contando os que ainda vêm (o selo "×N" do combate; 1 = sem selo).
static func combat_count(state: Dictionary) -> int:
	var n: int = int(state.get("combatNumber", 0)) if state.get("combatNumber") != null else 0
	var more: int = int(state.get("extraCombats", 0)) if state.get("extraCombats") != null else 0
	return maxi(n, 1) + more


## A regra de troca do dia e da noite para quem joga o turno, e se já está decidido pelas mágicas até agora.
static func day_night_text(state: Dictionary) -> String:
	var day_time: String = Txt.of(state.get("dayTime"))
	if day_time == "":
		return ""
	var name: Variant = _name_of(state, state.get("activePlayer"))
	var who: String = "você" if _yours(state, state.get("activePlayer")) else (name if _by_name(state) and name != null and name != "" else "o oponente")
	var known: bool = state.get("activeSpells") != null
	var spells: int = int(state.get("activeSpells")) if known else 0
	if day_time == "day":
		var rule: String = "Dia. Se %s não conjurar mágicas neste turno, vira noite no próximo turno." % who
		if not known:
			return rule
		if spells > 0:
			return "%s Já %s: continua dia." % [rule, "foi conjurada 1 mágica" if spells == 1 else "foram conjuradas %d mágicas" % spells]
		return "%s Nenhuma mágica até agora." % rule
	var night: String = "Noite. Se %s conjurar 2 mágicas ou mais neste turno, vira dia no próximo turno." % who
	if not known:
		return night
	if spells >= 2:
		return "%s Já foram conjuradas %d: vira dia." % [night, spells]
	return "%s %s até agora." % [night, "1 mágica" if spells > 0 else "Nenhuma mágica"]


## As etapas válidas, sem repetição e na ordem do turno; null se o valor não é uma lista de etapas.
static func normalize_stops(value: Variant) -> Variant:
	if not value is Array:
		return null
	var order: Array = STOP_STEPS.map(func(s: Array) -> String: return s[0])
	for step: Variant in value:
		if not step is String or not order.has(step):
			return null
	return order.filter(func(step: String) -> bool: return (value as Array).has(step))


## Grupos da trilha com alguma etapa marcada → os nomes delas.
static func stops_by_group(stops: Array) -> Dictionary:
	var groups: Dictionary = {}
	for entry: Array in STOP_STEPS:
		if stops.has(entry[0]):
			if not groups.has(entry[2]):
				groups[entry[2]] = []
			(groups[entry[2]] as Array).append(entry[1])
	return groups


## As etapas de um grupo da trilha: [etapa, nome].
static func stops_of_group(group: String) -> Array:
	return STOP_STEPS.filter(func(s: Array) -> bool: return s[2] == group).map(func(s: Array) -> Array: return [s[0], s[1]])


## Liga ou desliga uma etapa nas paradas (mantendo a ordem do turno).
static func toggle_stop(stops: Array, step: String) -> Array:
	var next: Array = stops.duplicate()
	if next.has(step):
		next.erase(step)
	else:
		next.append(step)
	var normal: Variant = normalize_stops(next)
	return normal if normal is Array else stops


## O jogo está segurando a prioridade para você: numa etapa marcada, com a pilha vazia.
static func holding_stop(state: Dictionary, stops: Array) -> bool:
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	return state.get("activePlayer") != null and stack.is_empty() and Txt.of(state.get("phase")) != "" and stops.has(Txt.of(state.get("phase")))


## A dica de um grupo da trilha: nome (com a etapa atual), combates e paradas marcadas.
static func group_tip(state: Dictionary, group: String, stops: Array) -> String:
	var label: String = phase_group_label(group)
	var current: bool = step_group(state.get("phase")) == group and not bool(state.get("gameOver", false))
	var parts: PackedStringArray = [("%s · %s" % [label, current_detail(state)]) if current else label]
	if group == "combat" and not bool(state.get("gameOver", false)) and combat_text(state) != "":
		parts.append(combat_text(state))
	var held: Variant = stops_by_group(stops).get(group)
	if held is Array:
		parts.append("Parada marcada: %s" % ", ".join(PackedStringArray(held)))
	return " · ".join(parts)


## A etapa de agora por extenso, com "Combate extra" no segundo combate em diante.
static func current_detail(state: Dictionary) -> String:
	if bool(state.get("gameOver", false)):
		return "Jogo concluído"
	var detail: String = step_detail(state.get("phase"))
	if detail == "":
		return "Aguardando o início do turno"
	var n: int = int(state.get("combatNumber", 0)) if state.get("combatNumber") != null else 0
	return detail + (" · Combate extra" if step_group(state.get("phase")) == "combat" and n > 1 else "")
