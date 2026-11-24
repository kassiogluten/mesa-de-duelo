# A pilha não passa rápido demais: quando a mágica do oponente chega e resolve no mesmo estado (você passou a prioridade
# sozinho), a mesa mostra antes o quadro daquele momento (a mágica na pilha, a seta no alvo) e só depois o resultado;
# e cada item da pilha fica à vista um tempo mínimo antes de sair. Só decide (o que mostrar e quanto esperar); quem
# aplica os estados é a MatchScreen. Como stateWithFrame e holdDecision de src/ui/presentationTimeline.ts.
class_name StackHold
extends RefCounted

## Quanto um item da pilha fica à vista, no mínimo, antes de sair (segundos): a mágica e a habilidade com alvo dos
## outros jogadores pedem tempo para ler; as suas você acabou de jogar, e só passam pela pilha.
const OTHERS_SPELL := 1.3
const OTHERS_ABILITY := 1.0
const YOUR_SPELL := 0.6
const YOUR_ABILITY := 0.45
## Com estados esperando na fila, o tempo encurta; a partir de SKIP_BACKLOG estados esperando, a mesa só alcança o jogo.
const SKIP_BACKLOG := 4
## As zonas de onde sai a carta que, no quadro, ainda está no campo ou na pilha (para ela não aparecer em dois lugares).
const ZONES := ["hand", "graveyard", "exile", "command", "revealedHand"]

## id do item da pilha → {at (segundos), min (segundos)}: quando ele apareceu na mesa e quanto deve ficar.
var _shown: Dictionary = {}
## O último evento já planejado (os quadros só saem dos eventos novos).
var _last_seq: int = -1


## Os estados a mostrar para a mensagem `state`, em ordem: um quadro para cada item que entrou e saiu da pilha dentro
## dela (mágica, ou habilidade e gatilho com alvo), e por último o próprio estado. `backlog`: estados esperando depois
## deste. No primeiro estado (abrir ou voltar à partida), no fim do jogo e no sideboard, só o estado.
func plan(state: Dictionary, backlog: int = 0, first: bool = false) -> Array:
	var fresh: Array = []
	for raw: Variant in state.get("events", []):
		if raw is Dictionary and int((raw as Dictionary).get("seq", -1)) > _last_seq:
			fresh.append(raw)
	var newest: int = _last_seq
	for event: Dictionary in fresh:
		newest = maxi(newest, int(event.get("seq", -1)))
	_last_seq = newest
	if first or backlog >= SKIP_BACKLOG or bool(state.get("gameOver", false)) or state.get("sideboarding") != null:
		return [state]
	var live: Dictionary = stack_ids(state)
	var you: int = int(state.get("you", 0))
	var out: Array = []
	for event: Dictionary in fresh:
		if not _passing(event, live, you):
			continue
		out.append(framed(state, event))
	out.append(state)
	return out


## O item entrou e saiu da pilha nesta mesma leva, sem nunca ter aparecido: merece um quadro.
func _passing(event: Dictionary, live: Dictionary, you: int) -> bool:
	if not event.get("frame") is Dictionary or event.get("stackId") == null:
		return false
	var id: int = int(event["stackId"])
	if live.has(id) or _shown.has(id):
		return false
	match Txt.of(event.get("type")):
		"spell-cast":
			return true
		"ability-activated":
			return _has_targets(event.get("targets"))
	return false


## Quanto esperar antes de mostrar `next`: o que falta para os itens que vão sair da pilha completarem o tempo mínimo.
func wait_before(next: Dictionary, now: float, backlog: int = 0) -> float:
	if backlog >= SKIP_BACKLOG or bool(next.get("gameOver", false)):
		return 0.0
	var stays: Dictionary = stack_ids(next)
	var wait: float = 0.0
	for id: Variant in _shown:
		if stays.has(id):
			continue
		var entry: Dictionary = _shown[id]
		wait = maxf(wait, float(entry["at"]) + float(entry["min"]) - now)
	return wait * pace(backlog)


## O estado `state` acabou de aparecer na mesa em `now`: anota os itens novos da pilha e esquece os que saíram.
func shown(state: Dictionary, now: float) -> void:
	var you: int = int(state.get("you", 0))
	var live: Dictionary = {}
	for raw: Variant in state.get("stack", []):
		var item: Dictionary = raw
		var id: int = int(item.get("id", -1))
		live[id] = true
		if not _shown.has(id):
			_shown[id] = {"at": now, "min": min_visible(item, you)}
	for id: Variant in _shown.keys():
		if not live.has(id):
			_shown.erase(id)


## Partida nova (ou de volta depois de cair): nada está à vista.
func reset() -> void:
	_shown.clear()
	_last_seq = -1


## O tempo mínimo de um item da pilha à vista: mágica ou habilidade com alvo; um gatilho sem alvo não segura a mesa.
static func min_visible(item: Dictionary, you: int) -> float:
	var mine: bool = int(item.get("controller", -1)) == you
	if Txt.of(item.get("kind", "spell")) == "spell":
		return YOUR_SPELL if mine else OTHERS_SPELL
	if not _has_targets(item.get("targets")):
		return 0.0
	return YOUR_ABILITY if mine else OTHERS_ABILITY


## Com estados esperando, a espera encurta (a mesa não fica para trás do jogo).
static func pace(backlog: int) -> float:
	if backlog <= 0:
		return 1.0
	return 0.6 if backlog < 2 else 0.35


## Os ids dos itens da pilha do estado.
static func stack_ids(state: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for raw: Variant in state.get("stack", []):
		if raw is Dictionary:
			out[int((raw as Dictionary).get("id", -1))] = true
	return out


static func _has_targets(targets: Variant) -> bool:
	if not targets is Dictionary:
		return false
	for key: String in ["cards", "players", "stack"]:
		if (targets as Dictionary).get(key) is Array and not ((targets as Dictionary)[key] as Array).is_empty():
			return true
	return false


## O estado como estava no evento: o campo, a vida, a pilha e o combate do quadro (as outras zonas vêm do estado, sem
## as cartas que no quadro ainda estão no campo ou na pilha), só os eventos até ele, e sem a sua decisão (o clique na
## mesa desenhada assim não vale: geração -1).
static func framed(state: Dictionary, event: Dictionary) -> Dictionary:
	var frame: Dictionary = event["frame"]
	var out: Dictionary = state.duplicate()
	for key: String in ["turn", "phase", "activePlayer", "stack", "combat"]:
		if frame.has(key):
			out[key] = frame[key]
	var placed: Dictionary = {}
	for raw: Variant in (frame["stack"] if frame.get("stack") is Array else []):
		var source: Variant = (raw as Dictionary).get("source")
		if source is Dictionary and (source as Dictionary).has("id"):
			placed[int((source as Dictionary)["id"])] = true
	var seen: Dictionary = {}
	for raw: Variant in (frame["players"] if frame.get("players") is Array else []):
		var player: Dictionary = raw
		seen[int(player.get("id", -1))] = player
		for card: Variant in player.get("battlefield", []):
			if card is Dictionary and (card as Dictionary).has("id"):
				placed[int((card as Dictionary)["id"])] = true
	var players: Array = []
	for raw: Variant in state.get("players", []):
		var player: Dictionary = (raw as Dictionary).duplicate()
		var past: Dictionary = seen.get(int(player.get("id", -1)), {})
		for key: Variant in past:
			player[key] = past[key]
		for zone: String in ZONES:
			if player.get(zone) is Array:
				player[zone] = (player[zone] as Array).filter(func(c: Variant) -> bool:
					return not (c is Dictionary and placed.has(int((c as Dictionary).get("id", -1)))))
		players.append(player)
	out["players"] = players
	var seq: int = int(event.get("seq", -1))
	out["events"] = (state.get("events", []) as Array).filter(func(e: Variant) -> bool: return int((e as Dictionary).get("seq", -1)) <= seq)
	out.erase("question")
	out["castable"] = []
	out["input"] = held_input(state.get("input", {}) if state.get("input") is Dictionary else {})
	return out


## A entrada sem a decisão: sem botões, alvos, pagamento, ataque nem bloqueio, e com a geração -1.
static func held_input(input: Dictionary) -> Dictionary:
	return {"gen": -1, "message": "", "priority": false,
		"ok": {"label": Txt.of((input.get("ok", {}) as Dictionary).get("label")) if input.get("ok") is Dictionary else "", "enabled": false},
		"cancel": {"label": Txt.of((input.get("cancel", {}) as Dictionary).get("label")) if input.get("cancel") is Dictionary else "", "enabled": false},
		"selectable": [], "selectableStacks": [], "selectablePlayers": [], "actionable": [], "untappable": [], "manaOnly": []}
