# Barra do alto da partida: Desfazer (com o pedido e a votação), votação para pular a vez de quem caiu ou demora,
# o nível de passar automaticamente (os quatro da mesa do navegador, src/ui/passLevel.ts), "Passando até o fim do turno"
# e os selos da partida (src/ui/matchBar.ts): placar da melhor de três ("Jogo 2 · 1 × 0"), quem caiu e quem só assiste.
class_name MatchBar
extends VBoxContainer

## Mensagem pronta para o servidor.
signal action(message: Dictionary)
## O jogador trocou o nível de passar (para guardar).
signal pass_level_changed(level: String)

const LEVELS := [
	["sempre", "Parar sempre", "Para em toda etapa que dá prioridade, nos dois turnos, mesmo sem nada para usar."],
	["acoes", "Só com ações", "Passa quando você não tem nada que possa usar agora."],
	["respostas", "Respostas", "Passa também no turno dos oponentes e com algo na pilha. No seu turno, com a pilha vazia, para."],
	["afeta", "Só quando me afeta", "Passa tudo, menos as suas fases principais, até algo mirar você ou suas permanentes, ou até você ser atacado."],
]

var _undo: Button
var _level: OptionButton
var _passing: Button
var _notice: VBoxContainer
var _chips: HBoxContainer


func _ready() -> void:
	add_theme_constant_override("separation", 8)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.alignment = BoxContainer.ALIGNMENT_END
	add_child(row)
	_chips = HBoxContainer.new()
	_chips.add_theme_constant_override("separation", 8)
	row.add_child(_chips)
	_undo = _small("Desfazer")
	_undo.pressed.connect(func() -> void: action.emit({"type": "undo-request"}))
	row.add_child(_undo)
	_level = OptionButton.new()
	_level.custom_minimum_size = Vector2(190, 38)
	_level.add_theme_font_size_override("font_size", 15)
	for entry: Array in LEVELS:
		_level.add_item("Passar: %s" % entry[1])
		_level.set_item_tooltip(_level.item_count - 1, Txt.of(entry[2]))
	_level.item_selected.connect(func(i: int) -> void:
		var level: String = Txt.of((LEVELS[i] as Array)[0])
		action.emit({"type": "preferences", "passLevel": level})
		pass_level_changed.emit(level))
	row.add_child(_level)
	_passing = _small("Passando até o fim do turno · parar")
	_passing.pressed.connect(func() -> void: action.emit({"type": "pass-turn-stop"}))
	_passing.visible = false
	row.add_child(_passing)
	_notice = VBoxContainer.new()
	_notice.add_theme_constant_override("separation", 6)
	_notice.size_flags_horizontal = Control.SIZE_SHRINK_END
	add_child(_notice)


func apply_state(state: Dictionary) -> void:
	var playing: bool = not bool(state.get("gameOver", false)) and not bool(state.get("spectating", false)) and not bool(state.get("watching", false))
	_apply_chips(state)
	_undo.visible = playing
	_level.visible = playing
	_notice.visible = playing
	if not playing:
		_passing.visible = false
		return
	var prefs: Dictionary = state.get("preferences", {}) if state.get("preferences") is Dictionary else {}
	var level: String = Txt.of(prefs.get("passLevel"))
	for i: int in LEVELS.size():
		if (LEVELS[i] as Array)[0] == level and _level.selected != i:
			_level.select(i)
	_passing.visible = bool(prefs.get("passingTurn", false))
	var undo: Dictionary = state.get("undo", {}) if state.get("undo") is Dictionary else {}
	var last: Variant = undo.get("last")
	_undo.disabled = not last is Dictionary or bool(undo.get("pending", false))
	_undo.tooltip_text = "Desfazer: %s" % Txt.of((last as Dictionary).get("text")) if last is Dictionary else "Nada para desfazer agora."
	for child: Node in _notice.get_children():
		child.queue_free()
	if undo.get("request") is Dictionary:
		_undo_request(undo["request"])
	var skip: Dictionary = state.get("skip", {}) if state.get("skip") is Dictionary else {}
	if skip.get("vote") is Dictionary:
		_skip_vote(skip["vote"])
	else:
		for id: Variant in skip.get("slow", []):
			var name: String = _player_name(state, id)
			var start := _small("Votar para pular a vez de %s" % name)
			start.pressed.connect(func() -> void: action.emit({"type": "skip-vote", "target": int(id), "value": true}))
			_notice.add_child(start)


## Os selos da partida (placar da série, desconectados, assistindo), como pílulas antes dos botões.
func _apply_chips(state: Dictionary) -> void:
	for child: Node in _chips.get_children():
		child.queue_free()
	for raw: Variant in MatchText.match_chips(state):
		var chip: Dictionary = raw
		var panel: PanelContainer = TurnClocks.chip()
		panel.custom_minimum_size = Vector2(0, 38)
		panel.tooltip_text = Txt.of(chip["label"])
		var label := Hud._label(15, Color(1, 0.6, 0.5) if chip["kind"] == "offline" else Color(1, 1, 1, 0.92))
		label.add_theme_constant_override("outline_size", 0)
		label.text = Txt.of(chip["text"])
		(panel.get_child(0) as HBoxContainer).add_child(label)
		_chips.add_child(panel)


## O pedido de desfazer aberto: quem pediu e o que volta; aceitar/recusar ou cancelar o seu.
func _undo_request(request: Dictionary) -> void:
	var step: Dictionary = request.get("step", {}) if request.get("step") is Dictionary else {}
	var mine: bool = bool(request.get("mine", false))
	var text := _text("%s pediu para desfazer: %s." % ["Você" if mine else Txt.of(request.get("name")), Txt.of(step.get("text"))])
	_notice.add_child(text)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	if mine:
		var waiting: Array = request.get("waiting", [])
		if not waiting.is_empty():
			_notice.add_child(_text("Esperando: %s." % ", ".join(PackedStringArray(waiting.map(func(n: Variant) -> String: return Txt.of(n))))))
		var cancel := _small("Cancelar pedido")
		cancel.pressed.connect(func() -> void: action.emit({"type": "undo-cancel"}))
		row.add_child(cancel)
	elif bool(request.get("canVote", false)) and request.get("vote") == null:
		var no := _small("Recusar")
		no.pressed.connect(func() -> void: action.emit({"type": "undo-vote", "value": false}))
		row.add_child(no)
		var yes := _small("Aceitar")
		yes.pressed.connect(func() -> void: action.emit({"type": "undo-vote", "value": true}))
		row.add_child(yes)
	_notice.add_child(row)


## A votação para pular a vez: placar e Sim/Não para quem vota.
func _skip_vote(vote: Dictionary) -> void:
	var what: String = "a vez de %s (demorando)" % Txt.of(vote.get("name")) if bool(vote.get("slow", false)) else "o turno de %s (caiu)" % Txt.of(vote.get("name"))
	_notice.add_child(_text("Pular %s? Sim %d · Não %d · precisa de %d." % [what, int(vote.get("yes", 0)), int(vote.get("no", 0)), int(vote.get("needed", 0))]))
	if bool(vote.get("canVote", false)) and vote.get("mine") == null:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		for answer: bool in [false, true]:
			var button := _small("Sim" if answer else "Não")
			button.pressed.connect(func() -> void: action.emit({"type": "skip-vote", "target": int(vote.get("target", -1)), "value": answer}))
			row.add_child(button)
		_notice.add_child(row)


static func _player_name(state: Dictionary, id: Variant) -> String:
	for p: Variant in state.get("players", []):
		if (p as Dictionary).get("id") == id:
			return Txt.of((p as Dictionary).get("name"))
	return "Jogador"


static func _small(text: String) -> Button:
	var button := Hud._button(text, false)
	button.custom_minimum_size = Vector2(0, 38)
	button.add_theme_font_size_override("font_size", 15)
	return button


static func _text(text: String) -> Label:
	var label := Hud._label(16, Color(1, 1, 1, 0.85))
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(420, 0)
	return label
