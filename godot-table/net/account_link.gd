# O vínculo da mesa no PC com a conta pelo site: pede o código, abre o navegador e pergunta ao servidor até o jogador confirmar.
class_name AccountLink
extends Node

## O servidor deu o código: mostre-o (o navegador já foi aberto em `url`).
signal code_ready(code: String, url: String)
## O jogador confirmou no site: a sessão já está em AccountSession.
signal linked(account: Dictionary)
## Acabou sem login (código vencido ou recusado, servidor fora, contas desligadas): o texto é para o jogador.
signal failed(message: String)
## Aviso no meio do caminho, sem desistir (a rede caiu por uns segundos).
signal notice(message: String)

const POLL_S := 2.0
## Perguntas seguidas sem resposta antes de avisar que a conexão caiu.
const OFFLINE_NOTICE_AFTER := 4
const NO_SERVER := "Sem conexão com o servidor. Confira a internet e tente de novo."
const EXPIRED := "O código venceu ou foi recusado no site. Toque em Entrar com Google para pedir outro."

var api: AccountApi
## Abre o navegador do sistema (os testes guardam o endereço em vez de abrir).
var opener: Callable = func(address: String) -> void: OS.shell_open(address)
## O código como aparece nas duas telas (ABCD-EFGH) e a página do site que confirma.
var code: String = ""
var url: String = ""

var _poll: String = ""
var _deadline_ms: int = 0
var _timer: Timer
var _busy: bool = false
var _misses: int = 0
## Sobe a cada começo ou cancelamento: a resposta de um pedido antigo que chega depois é ignorada.
var _generation: int = 0


func _ready() -> void:
	if api == null:
		api = AccountApi.new()
	if api.get_parent() == null:
		add_child(api)
	_timer = Timer.new()
	_timer.wait_time = POLL_S
	_timer.timeout.connect(_on_tick)
	add_child(_timer)


## Esperando o jogador confirmar no site?
func waiting() -> bool:
	return _poll != ""


## Quanto o código ainda vale, em segundos.
func seconds_left() -> int:
	return maxi(0, int(ceil((_deadline_ms - Time.get_ticks_msec()) / 1000.0))) if waiting() else 0


## Pede um código novo e abre o navegador na página de confirmar.
func start() -> void:
	_reset()
	var generation: int = _generation
	var r: Dictionary = await api.call_api(HTTPClient.METHOD_POST, "vincular/iniciar")
	if generation != _generation:
		return
	var status: int = int(r.get("status", 0))
	var json: Dictionary = r["json"] if r.get("json") is Dictionary else {}
	if not bool(r.get("reached", false)):
		failed.emit(NO_SERVER)
		return
	if status != 200 or Txt.of(json.get("poll")) == "" or Txt.of(json.get("codigo")).length() != 8:
		# Um servidor de antes do vínculo pede sessão (401) ou não conhece a rota (404).
		if status == 401 or status == 404:
			failed.emit("Este servidor ainda não aceita entrar pela mesa no PC.")
			return
		var fallback: String = "As contas não estão ligadas neste servidor." if status == 503 else "Não deu para começar a entrar. Tente de novo."
		failed.emit(AccountApi.error_text(r, fallback))
		return
	var raw: String = Txt.of(json["codigo"])
	code = "%s-%s" % [raw.substr(0, 4), raw.substr(4)]
	_poll = Txt.of(json["poll"])
	url = GameConfig.site_url(Txt.of(json.get("url", "/vincular?codigo=" + raw)))
	_deadline_ms = Time.get_ticks_msec() + int(json.get("expiresIn", 600)) * 1000
	code_ready.emit(code, url)
	open_browser()
	_timer.start()


## Abre (de novo) a página do site.
func open_browser() -> void:
	if url != "":
		opener.call(url)


## O jogador desistiu: o código morre no servidor também.
func cancel() -> void:
	if _poll != "":
		api.call_api(HTTPClient.METHOD_POST, "vincular/cancelar", {"poll": _poll})
	_reset()


func _reset() -> void:
	_generation += 1
	_poll = ""
	code = ""
	url = ""
	_busy = false
	_misses = 0
	if _timer:
		_timer.stop()


func _on_tick() -> void:
	if _poll == "" or _busy:
		return
	if Time.get_ticks_msec() > _deadline_ms:
		_reset()
		failed.emit(EXPIRED)
		return
	_busy = true
	var generation: int = _generation
	var r: Dictionary = await api.call_api(HTTPClient.METHOD_POST, "vincular/estado", {"poll": _poll})
	if generation != _generation:
		return
	_busy = false
	if not bool(r.get("reached", false)):
		_misses += 1
		if _misses == OFFLINE_NOTICE_AFTER:
			notice.emit("Sem conexão com o servidor. Tentando de novo…")
		return
	_misses = 0
	var status: int = int(r.get("status", 0))
	var json: Dictionary = r["json"] if r.get("json") is Dictionary else {}
	if status == 200 and Txt.of(json.get("estado")) == "ligado" and Txt.of(json.get("token")) != "":
		_reset()
		AccountSession.store(json)
		linked.emit(AccountSession.account())
	elif status == 200:
		_deadline_ms = Time.get_ticks_msec() + int(json.get("expiresIn", seconds_left())) * 1000
	elif status == 410 or status == 404:
		_reset()
		failed.emit(EXPIRED)
	elif status == 503 and AccountApi.error_text(r, "").begins_with("Contas desligadas"):
		_reset()
		failed.emit("As contas não estão ligadas neste servidor.")
	# 429, 500 e afins: pergunta de novo no próximo tique.
