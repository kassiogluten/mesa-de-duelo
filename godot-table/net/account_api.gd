# As chamadas HTTP da conta na mesa no PC (/api/conta/): conferir a sessão guardada ao abrir, sair e os pedidos do vínculo.
class_name AccountApi
extends Node

## Resposta de uma chamada: reached (o servidor respondeu), status (HTTP) e json (o corpo lido, ou null).
## O transporte é trocável: os testes respondem sem rede. Assinatura: func(method, url, headers, body) -> Dictionary.
var transport: Callable = _http
var timeout_s: float = 20.0

## A sessão guardada já foi conferida nesta execução da mesa (o menu é recriado a cada volta da partida).
static var validated: bool = false


## Uma rota de /api/conta/ (ex.: "vincular/iniciar"); `auth` manda o token da sessão.
func call_api(method: int, route: String, body: Dictionary = {}, auth: bool = false) -> Dictionary:
	var headers := AccountSession.headers() if auth else PackedStringArray(["Content-Type: application/json"])
	var text: String = JSON.stringify(body) if method != HTTPClient.METHOD_GET else ""
	var result: Variant = await transport.call(method, AccountSession.api_url("/api/conta/" + route), headers, text)
	return result if result is Dictionary else {"reached": false, "status": 0, "json": null}


## Confere a sessão guardada uma vez por execução: 401 esquece, 200 traz o perfil atualizado, sem rede fica como está.
func validate() -> void:
	if validated or not AccountSession.signed_in():
		return
	validated = true
	var r: Dictionary = await call_api(HTTPClient.METHOD_GET, "eu", {}, true)
	var status: int = int(r.get("status", 0))
	if status == 401:
		AccountSession.clear()
	elif status == 200 and r.get("json") is Dictionary and (r["json"] as Dictionary).get("conta") is Dictionary:
		AccountSession.update_account((r["json"] as Dictionary)["conta"])


## Sai da conta: esquece aqui na hora (mesmo sem rede) e pede ao servidor para invalidar o token.
func logout() -> void:
	if AccountSession.token() == "":
		AccountSession.clear()
		return
	var headers: PackedStringArray = AccountSession.headers()
	AccountSession.clear()
	await transport.call(HTTPClient.METHOD_POST, AccountSession.api_url("/api/conta/sair"), headers, "{}")


## O texto de erro que o servidor mandou ({error}), ou `fallback`.
static func error_text(r: Dictionary, fallback: String) -> String:
	if r.get("json") is Dictionary:
		var text: String = Txt.of((r["json"] as Dictionary).get("error")).strip_edges()
		if text != "":
			return text
	return fallback


func _http(method: int, url: String, headers: PackedStringArray, body: String) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = timeout_s
	add_child(http)
	if http.request(url, headers, method, body) != OK:
		http.queue_free()
		return {"reached": false, "status": 0, "json": null}
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return {"reached": false, "status": 0, "json": null}
	# JSON.new().parse não suja o log quando o corpo vem vazio ou em HTML (um proxy no meio do caminho).
	var json := JSON.new()
	var parsed: Variant = json.data if json.parse((result[3] as PackedByteArray).get_string_from_utf8()) == OK else null
	return {"reached": true, "status": int(result[1]), "json": parsed}
