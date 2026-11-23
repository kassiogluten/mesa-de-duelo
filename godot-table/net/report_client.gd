# Envia o relato ao servidor (POST /api/relatos, corpo em gzip) e consulta a situação dos relatos enviados (Meus relatos).
class_name ReportClient
extends Node

const SEND_TIMEOUT_S := 30.0
const STATUS_TIMEOUT_S := 15.0
const OFFLINE := "Sem conexão com o servidor. Tente de novo daqui a pouco."
const TOO_MANY := "Muitos relatos seguidos, tente de novo em alguns minutos."

## A rota de relatos; vazio usa a do servidor da mesa (GameConfig). Os testes apontam para um servidor falso.
var url: String = ""


func reports_url() -> String:
	return url if url != "" else GameConfig.http_url("/api/relatos")


## Manda o relato. `session` ({code, token}) deixa o servidor juntar o diário da partida; `account_token` diz quem enviou.
## Devolve {status: "sent", code} ou {status: "rejected", text}.
func send_report(report: Dictionary, body: PackedByteArray, session: Dictionary = {}, account_token: String = "") -> Dictionary:
	var headers := PackedStringArray(["Content-Type: application/json"])
	if body.size() >= 2 and body[0] == 0x1f and body[1] == 0x8b:
		headers.append("Content-Encoding: gzip")
	if account_token != "":
		headers.append("Authorization: Bearer %s" % account_token)
	if report.get("recording") is Dictionary and Txt.of(session.get("code")) != "" and Txt.of(session.get("token")) != "":
		headers.append("X-Mesa-Partida: %s" % Txt.of(session["code"]))
		headers.append("X-Mesa-Token: %s" % Txt.of(session["token"]))
	var target: String = reports_url()
	var reply: Dictionary = await _post(target, headers, body, SEND_TIMEOUT_S)
	var status: int = reply["status"]
	var json: Dictionary = reply["json"]
	if status >= 200 and status < 300 and Txt.of(json.get("code")) != "":
		var code: String = Txt.of(json["code"])
		MyReports.remember(code, Txt.of(json.get("key")), target, Txt.of(report.get("kind")), ReportPayload.summary_of(Txt.of(report.get("description"))))
		ClientLog.add("Relato %s enviado." % code)
		return {"status": "sent", "code": code}
	ClientLog.add("Relato não enviado (HTTP %d)." % status, "aviso")
	if status == 429:
		return {"status": "rejected", "text": TOO_MANY}
	if status == 0 or status == 404 or status == 408 or status >= 500:
		return {"status": "rejected", "text": Txt.of(json.get("error")) if status == 507 and json.get("error") is String else OFFLINE}
	return {"status": "rejected", "text": Txt.of(json.get("error")) if json.get("error") is String else "O servidor recusou o relato."}


## A situação dos relatos guardados e, com a conta, dos enviados por ela de qualquer aparelho.
## Devolve {reports (do mais novo ao mais antigo), offline (algum servidor não respondeu)}.
func refresh(account_token: String = "") -> Dictionary:
	var saved: Array = MyReports.saved()
	var groups: Dictionary = {}
	for r: Dictionary in saved:
		if not groups.has(r["url"]):
			groups[r["url"]] = []
		(groups[r["url"]] as Array).append(r)
	var home: String = reports_url()
	if account_token != "" and not groups.has(home):
		groups[home] = []
	var reports: Array = []
	var gone: Array = []
	var offline: bool = false
	for target: String in groups.keys():
		var mine: Array = groups[target]
		var headers := PackedStringArray(["Content-Type: application/json"])
		if account_token != "" and target == home:
			headers.append("Authorization: Bearer %s" % account_token)
		var query: Dictionary = {"relatos": mine.map(func(r: Dictionary) -> Dictionary: return {"code": r["code"], "key": r["key"]})}
		var reply: Dictionary = await _post(target.trim_suffix("/") + "/situacao", headers, JSON.stringify(query).to_utf8_buffer(), STATUS_TIMEOUT_S)
		var answers: Variant = (reply["json"] as Dictionary).get("relatos")
		if int(reply["status"]) != 200 or not answers is Array:
			offline = true
			reports.append_array(MyReports.offline_view(mine))
			continue
		var merged: Dictionary = MyReports.merge(mine, answers)
		reports.append_array(merged["reports"])
		gone.append_array(merged["gone"])
	MyReports.forget(gone)
	# O mesmo relato pode vir de dois lugares (pela chave e pela conta): fica um só.
	var seen: Dictionary = {}
	var unique: Array = []
	for r: Dictionary in reports:
		if not seen.has(r["code"]):
			seen[r["code"]] = true
			unique.append(r)
	return {"reports": MyReports.sort(unique), "offline": offline}


## POST cru; devolve {status (0 sem resposta), json}.
func _post(target: String, headers: PackedStringArray, body: PackedByteArray, timeout: float) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = timeout
	add_child(http)
	if http.request_raw(target, headers, HTTPClient.METHOD_POST, body) != OK:
		http.queue_free()
		return {"status": 0, "json": {}}
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return {"status": 0, "json": {}}
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	return {"status": int(result[1]), "json": parsed if parsed is Dictionary else {}}
