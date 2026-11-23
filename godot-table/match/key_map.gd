# Os atalhos de teclado da partida: que ação cada tecla pede (sem cena, para os testes) e a lista que a ajuda do "?" mostra.
class_name KeyMap
extends RefCounted

## As ações, na ordem da ajuda: [tecla como aparece, ação, o que faz].
const SHORTCUTS: Array = [
	["Espaço", "primary", "Aperta o botão principal (passar, resolver, confirmar)."],
	["Enter", "confirm", "Confirma a escolha (ou escolhe o alvo marcado com o Tab)."],
	["Esc", "cancel", "Desfaz a escolha em andamento (bloqueador, atacantes marcados, alvo marcado)."],
	["Tab", "cycle", "Passa pelos alvos válidos (Shift+Tab volta)."],
	["Z", "undo", "Pede para desfazer a última jogada."],
	["F", "control", "Controle total: para em toda etapa. De novo, volta ao jeito de passar de antes."],
	["I", "inspect", "Abre a carta sob o mouse de perto (o clique direito também)."],
	["?", "help", "Mostra ou esconde esta lista."],
]


## A ação de uma tecla apertada ("" se não é atalho): primary, confirm, cancel, cycle, cycle_back, undo, control,
## inspect ou help. Com Ctrl, Alt ou Meta, nada (os atalhos do sistema ficam livres); repetição da tecla segurada, nada.
static func action_for(keycode: int, unicode: int, shift: bool, modifiers: bool, echo: bool = false) -> String:
	if modifiers or echo:
		return ""
	if unicode == 63 or keycode == KEY_QUESTION or keycode == KEY_F1 or (keycode == KEY_SLASH and shift):
		return "help"
	match keycode:
		KEY_SPACE:
			return "primary"
		KEY_ENTER, KEY_KP_ENTER:
			return "confirm"
		KEY_ESCAPE:
			return "cancel"
		KEY_TAB:
			return "cycle_back" if shift else "cycle"
		KEY_Z:
			return "undo"
		KEY_F:
			return "control"
		KEY_I:
			return "inspect"
	return ""


## A ação de um evento de teclado ("" se não é uma tecla apertada ou não é atalho).
static func action(event: InputEvent) -> String:
	if not event is InputEventKey or not (event as InputEventKey).pressed:
		return ""
	var key := event as InputEventKey
	return action_for(key.keycode, key.unicode, key.shift_pressed, key.ctrl_pressed or key.alt_pressed or key.meta_pressed, key.echo)
