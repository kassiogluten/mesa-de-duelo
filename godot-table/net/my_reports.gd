# Meus relatos (porte de src/myReports.ts): o código e a chave de cada relato enviado deste computador, guardados para ver a resposta depois.
class_name MyReports
extends RefCounted

const FILE := "user://meus_relatos.json"
const SAVED_LIMIT := 50
const STATUS_LABEL := {"recebido": "Recebido", "analise": "Em análise", "resolvido": "Resolvido", "encerrado": "Encerrado"}


## Os relatos guardados ({code, key, url, at, kind, summary}), o mais novo primeiro.
static func saved() -> Array:
	if not FileAccess.file_exists(FILE):
		return []
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FILE))
	if not parsed is Array:
		return []
	return (parsed as Array).filter(func(r: Variant) -> bool:
		return r is Dictionary and (r as Dictionary).get("code") is String and (r as Dictionary).get("key") is String and (r as Dictionary).get("url") is String)


## Guarda o relato que acabou de sair (o servidor devolveu código e chave).
static func remember(code: String, key: String, url: String, kind: String, summary: String) -> void:
	if code == "" or key == "":
		return
	var entry: Dictionary = {"code": code, "key": key, "url": url, "at": int(Time.get_unix_time_from_system() * 1000.0), "kind": kind_of(kind), "summary": summary}
	var list: Array = [entry]
	list.append_array(saved().filter(func(r: Dictionary) -> bool: return r["code"] != code))
	_write(list.slice(0, SAVED_LIMIT))


## Tira da lista os relatos que o servidor deixou de devolver (apagados pela retenção).
static func forget(codes: Array) -> void:
	if codes.is_empty():
		return
	_write(saved().filter(func(r: Dictionary) -> bool: return not codes.has(r["code"])))


static func clear() -> void:
	if FileAccess.file_exists(FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(FILE))


static func kind_of(kind: Variant) -> String:
	return "erro" if Txt.of(kind) == "erro" else "sugestao"


## Junta o que o servidor devolveu (`answers`, de /api/relatos/situacao) com o que está guardado de um servidor (`mine`).
## Devolve {reports, gone}: os relatos para a tela e os códigos guardados que o servidor não conhece mais.
static func merge(mine: Array, answers: Array) -> Dictionary:
	var reports: Array = []
	var answered: Dictionary = {}
	for a: Variant in answers:
		if not a is Dictionary or not (a as Dictionary).get("code") is String:
			continue
		var answer: Dictionary = a
		var code: String = answer["code"]
		answered[code] = true
		var own: Dictionary = {}
		for r: Dictionary in mine:
			if r["code"] == code:
				own = r
		var status: String = Txt.of(answer.get("status"))
		var report: Dictionary = {
			"code": code, "kind": kind_of(answer.get("kind", own.get("kind"))),
			"summary": Txt.of(answer.get("summary", own.get("summary", ""))),
			"at": _parse_time(Txt.of(answer.get("receivedAt")), int(own.get("at", 0))),
			"status": status if STATUS_LABEL.has(status) else "recebido",
		}
		if Txt.of(answer.get("reply")) != "":
			report["reply"] = Txt.of(answer["reply"])
		reports.append(report)
	var gone: Array = []
	for r: Dictionary in mine:
		if not answered.has(r["code"]):
			gone.append(r["code"])
	return {"reports": reports, "gone": gone}


## Os guardados como estão, sem a situação (servidor fora do ar).
static func offline_view(mine: Array) -> Array:
	return mine.map(func(r: Dictionary) -> Dictionary:
		return {"code": r["code"], "kind": kind_of(r.get("kind")), "summary": Txt.of(r.get("summary")), "at": int(r.get("at", 0))})


static func sort(reports: Array) -> Array:
	var out: Array = reports.duplicate()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a["at"]) > int(b["at"]) if int(a["at"]) != int(b["at"]) else Txt.of(a["code"]) < Txt.of(b["code"]))
	return out


## "2026-11-23T14:02:11.123Z" em milissegundos (ou `fallback`).
static func _parse_time(text: String, fallback: int) -> int:
	if text == "":
		return fallback
	var clean: String = text.trim_suffix("Z")
	if clean.contains("."):
		clean = clean.substr(0, clean.find("."))
	var seconds: int = Time.get_unix_time_from_datetime_string(clean)
	return seconds * 1000 if seconds > 0 else fallback


static func _write(list: Array) -> void:
	var file: FileAccess = FileAccess.open(FILE, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(list))
