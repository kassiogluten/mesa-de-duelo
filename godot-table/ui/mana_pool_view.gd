# A reserva de mana de um assento, viva: compara cada estado com o anterior e faz a mana chegar voando da permanente que
# virou, os pips respirarem enquanto a mana flutua (com o aviso âmbar quando ela vai se perder), voarem até o que foi
# pago ao serem gastos e se desfazerem quando a etapa acaba sem uso. Pagando, cada pip é o botão que gasta a mana.
class_name ManaPoolView
extends HBoxContainer

## Pagando: tocou num pip ({type:"mana", color, gen}).
signal mana_pressed(message: Dictionary)

## No máximo tantas gotas por cor num estado (a última leva o resto).
const MAX_ORBS := 6

## Onde fica na tela um ponto da mesa 3D (id de carta, "stack:<id>"); (-1, -1) se não está à mostra. O HUD liga à mesa.
var table_point: Callable = func(_key: Variant) -> Vector2: return Vector2(-1, -1)
var mine: bool = false

## O retrato (de onde a mana vem quando não se sabe a fonte) e onde ficam os voos (sempre visível, mesmo sem reserva).
var _portrait: Control
var _fx_parent: Control
## cor → ManaPoolPip
var _pips: Dictionary = {}
## cor → quantas havia no estado anterior
var _counts: Dictionary = {}
## id da permanente → virada no estado anterior
var _tapped: Dictionary = {}
var _step: String = ""
var _seen: bool = false
## O que estava sendo pago no estado anterior (id da carta), para onde a mana gasta voa se a pilha não diz.
var _paying_for: Variant = null


## `is_mine`: o seu assento; `portrait`: o retrato do jogador; `fx_parent`: onde pôr as gotas e faíscas.
func setup(is_mine: bool, portrait: Control, fx_parent: Control) -> void:
	mine = is_mine
	_portrait = portrait
	_fx_parent = fx_parent
	add_theme_constant_override("separation", 6 if mine else 4)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## O estado novo do jogador: `pips` de SeatInfo.pool_pips (na ordem WUBRG e incolor), o jogador e o estado.
func apply(pips: Array, player: Dictionary, state: Dictionary) -> void:
	var counts: Dictionary = {}
	for raw: Variant in pips:
		counts[Txt.of((raw as Dictionary)["color"])] = int((raw as Dictionary)["count"])
	var fresh: Array = _newly_tapped(player)
	var step: String = "%s|%s" % [str(state.get("turn", "")), Txt.of(state.get("phase"))]
	var animate: bool = _seen and is_inside_tree() and _fx_parent != null
	var stepped: bool = step != _step
	var used: bool = _player_acted(int(player.get("id", -1)), state)
	# Saídas: gasta (voa até o que foi pago) ou perdida no fim da etapa (se desfaz).
	for color: Variant in _counts.keys():
		var before: int = int(_counts[color])
		var now: int = int(counts.get(color, 0))
		if now >= before or not _pips.has(color):
			continue
		var pip: ManaPoolPip = _pips[color]
		if animate and pip.shown_count() > 0:
			if stepped and not used:
				_dissipate(pip, before - now, now == 0)
			else:
				_spend(pip, before - now, now == 0, state)
		if now == 0:
			_pips.erase(color)
			remove_child(pip)
			pip.queue_free()
	# Os pips de agora, na ordem; as manas novas voam da fonte e só contam quando chegam.
	var sources_used: Dictionary = {}
	for i: int in pips.size():
		var data: Dictionary = pips[i]
		var color: String = Txt.of(data["color"])
		var pip: ManaPoolPip = _pips.get(color)
		if pip == null:
			pip = ManaPoolPip.new()
			pip.setup(color, mine)
			pip.pressed.connect(_on_pip_pressed.bind(pip))
			add_child(pip)
			_pips[color] = pip
		move_child(pip, i)
		pip.tooltip_text = Txt.of(data["hint"])
		pip.set_clickable(data["message"])
		var gained: int = int(data["count"]) - int(_counts.get(color, 0))
		if animate and gained > 0:
			pip.pending += gained
			pip.set_count(int(data["count"]))
			_arrive(pip, gained, fresh, sources_used)
		else:
			pip.set_count(int(data["count"]))
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	var paying: bool = bool(input.get("paying", false))
	# O aviso: a sua mana flutuando com a prioridade na mão (some no fim da etapa se não usar).
	var warn: bool = mine and not paying and bool(input.get("priority", false)) and int(player.get("id", -1)) == int(state.get("you", -2))
	for pip: Variant in _pips.values():
		(pip as ManaPoolPip).set_warn(warn)
	_paying_for = null
	if paying and input.get("card") is Dictionary and (input["card"] as Dictionary).has("id"):
		_paying_for = int((input["card"] as Dictionary)["id"])
	_counts = counts
	_step = step
	_seen = true
	visible = not pips.is_empty()


## O pip de uma cor (null se não há mana dela): para os testes e o preview.
func pip_of(color: String) -> ManaPoolPip:
	return _pips.get(color)


func _on_pip_pressed(pip: ManaPoolPip) -> void:
	if not pip.message.is_empty():
		mana_pressed.emit(pip.message)


## As permanentes do jogador que viraram desde o estado anterior (e guarda as viradas de agora).
func _newly_tapped(player: Dictionary) -> Array:
	var out: Array = []
	var now: Dictionary = {}
	var field: Array = player.get("battlefield", []) if player.get("battlefield") is Array else []
	for raw: Variant in field:
		var card: Dictionary = raw
		var id: int = int(card.get("id", -1))
		var tapped: bool = bool(card.get("tapped", false))
		now[id] = tapped
		if tapped and _tapped.has(id) and not bool(_tapped[id]):
			out.append(card)
	_tapped = now
	return out


## O jogador conjurou ou ativou algo neste estado (a mana que sumiu foi gasta, mesmo que a etapa tenha mudado).
static func _player_acted(player_id: int, state: Dictionary) -> bool:
	for raw: Variant in state.get("events", []) if state.get("events") is Array else []:
		var event: Dictionary = raw
		if Txt.of(event.get("type")) in ["spell-cast", "ability-activated"] and int(event.get("actor", -2)) == player_id:
			return true
	return false


## As gotas de uma cor que entrou: da permanente que virou (a que dá essa cor primeiro), senão do retrato.
func _arrive(pip: ManaPoolPip, gained: int, fresh: Array, used: Dictionary) -> void:
	var orbs: int = mini(gained, MAX_ORBS)
	var calm: bool = not mine
	for i: int in orbs:
		var amount: int = 1 if i < orbs - 1 else gained - (orbs - 1)
		var from: Vector2 = _source_point(pip.color_key, fresh, used)
		ManaPoolFx.fly(_fx_parent, from, pip.icon_center_global, pip.tint(), i * 0.09, calm, pip.arrive.bind(amount), false)
		if Fx.quality > 0:
			# Na saída, um respingo pequeno na cor (a mana sai da carta).
			ManaPoolFx.sparks_ring(_fx_parent, from, pip.tint(), true, 0.35)


## Onde nasce uma gota da cor `color`: a permanente virada que dá essa cor e ainda não deu nenhuma, depois qualquer
## virada, depois o retrato.
func _source_point(color: String, fresh: Array, used: Dictionary) -> Vector2:
	var best: Dictionary = {}
	for pass_index: int in 3:
		for raw: Variant in fresh:
			var card: Dictionary = raw
			var id: int = int(card.get("id", -1))
			var gives: String = ManaPoolFx.produces(card)
			var fits: bool = gives.contains(color) or gives == ""
			if (pass_index == 0 and fits and not used.has(id)) or (pass_index == 1 and fits) or (pass_index == 2 and not used.has(id)):
				best = card
				break
		if not best.is_empty():
			break
	if not best.is_empty():
		var id: int = int(best.get("id", -1))
		used[id] = true
		var p: Vector2 = table_point.call(id)
		if p.x >= 0.0:
			return p
	return _portrait_point()


func _portrait_point() -> Vector2:
	if _portrait and _portrait.is_inside_tree():
		return _portrait.get_global_rect().get_center()
	return global_position


## Gasta: um estalo no pip e as gotas voando até o que foi pago (ou subindo e sumindo, se não está à mostra).
func _spend(pip: ManaPoolPip, lost: int, removed: bool, state: Dictionary) -> void:
	var at: Vector2 = pip.icon_center_global()
	var calm: bool = not mine
	var key: Variant = _spend_key(state)
	var to: Vector2 = _spend_target(key, Vector2(-1, -1))
	var target: Callable = _spend_target.bind(key, to) if to.x >= 0.0 else _rise_target.bind(at)
	ManaPoolFx.sparks_ring(_fx_parent, at, pip.tint(), calm, 0.7)
	for i: int in mini(lost, MAX_ORBS):
		ManaPoolFx.fly(_fx_parent, at, target, pip.tint(), i * 0.06, calm, Callable(), true)
	if removed:
		ManaPoolFx.ghost(_fx_parent, pip, "burst")
	else:
		pip.squash()


## A mana perdida no fim da etapa: o pip sobe, encolhe e se desfaz em poeira de luz.
func _dissipate(pip: ManaPoolPip, lost: int, removed: bool) -> void:
	var at: Vector2 = pip.icon_center_global()
	ManaPoolFx.motes_rise(_fx_parent, at, pip.icon_size * 0.45, pip.tint(), not mine, clampf(0.6 + lost * 0.25, 0.6, 1.6))
	ManaPoolFx.ghost(_fx_parent, pip, "fade")
	if not removed:
		pip.squash()


## Para onde voa a mana gasta: a carta que ainda está sendo paga (a mostrada junto da caixa de ação), senão o topo da
## pilha (a mágica ou habilidade que acabou de ser paga), senão a carta que estava sendo paga; null se não se sabe.
func _spend_key(state: Dictionary) -> Variant:
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	if _paying_for != null and bool(input.get("paying", false)) and input.get("card") is Dictionary and int((input["card"] as Dictionary).get("id", -1)) == int(_paying_for):
		return _paying_for
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	if not stack.is_empty():
		var item: Dictionary = stack[0]
		var source: Dictionary = item.get("source", {}) if item.get("source") is Dictionary else {}
		if Txt.of(item.get("kind", "spell")) == "spell" and source.has("id"):
			return int(source["id"])
		return "stack:%d" % int(item.get("id", -1))
	return _paying_for


## O destino da mana gasta na tela, seguindo a carta enquanto ela voa para a pilha; `fallback` se ela não está à mostra.
func _spend_target(key: Variant, fallback: Vector2) -> Vector2:
	if key == null:
		return fallback
	var p: Vector2 = table_point.call(key)
	return p if p.x >= 0.0 else fallback


func _rise_target(at: Vector2) -> Vector2:
	return at + Vector2(0, -70)
