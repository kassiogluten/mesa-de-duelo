# A fila dos estados da partida: cada estado do servidor aparece na ordem em que chegou, mas antes dele a mesa mostra o
# quadro da mágica que entrou e saiu da pilha nele, e espera o item que vai sair da pilha ficar o tempo mínimo à vista
# (as regras ficam em match/stack_hold.gd). Sem nada para segurar, o estado aparece na hora.
class_name StateQueue
extends Node

## Quem põe o estado na mesa (MatchScreen._show_state).
var show: Callable
var hold := StackHold.new()
## Relógio em segundos (os testes trocam).
var clock: Callable = func() -> float: return Time.get_ticks_msec() / 1000.0
var _waiting: Array = []
var _draining: bool = false
var _match_id: String = ""
## MESA_FX_LOG=1: escreve no console cada quadro da pilha e cada espera (para conferir partidas de verdade).
var _log: bool = OS.get_environment("MESA_FX_LOG") == "1"


## Um estado novo do servidor. `first`: a mesa ainda não mostrou nenhum (abrir ou voltar à partida): sem quadros.
func receive(msg: Dictionary, first: bool = false) -> void:
	var id: String = Txt.of(msg.get("matchId", ""))
	if id != _match_id:
		_match_id = id
		hold.reset()
	_waiting.append({"state": msg, "first": first})
	_drain()


## Quantos estados ainda esperam (contando o que está segurado agora).
func pending() -> int:
	return _waiting.size() + (1 if _draining else 0)


func _drain() -> void:
	if _draining:
		return
	_draining = true
	while not _waiting.is_empty():
		var next: Dictionary = _waiting.pop_front()
		for step: Variant in hold.plan(next["state"], _waiting.size(), bool(next["first"])):
			var wait: float = hold.wait_before(step, clock.call(), _waiting.size())
			if _log and not is_same(step, next["state"]):
				print("[pilha] quadro: %s" % ", ".join(PackedStringArray((step["stack"] as Array).map(func(i: Dictionary) -> String:
					return Txt.of((i.get("source", {}) as Dictionary).get("name", i.get("text"))) if i.get("source") is Dictionary else Txt.of(i.get("text"))))))
			if _log and wait > 0.02:
				print("[pilha] espera %.2f s" % wait)
			if wait > 0.02:
				await get_tree().create_timer(wait).timeout
				if not is_inside_tree():
					_draining = false
					return
			hold.shown(step, clock.call())
			show.call(step)
	_draining = false
