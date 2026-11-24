# Novidades da mesa no PC: o /novidades.json do site (as versões do CHANGELOG-PC.md, só com o que muda na mesa no PC), guardado em user:// para abrir sem internet.
class_name NewsFeed
extends Node

## Chegou uma cópia nova do site (o painel e o ponto do botão se refazem).
signal updated
## Terminou uma busca no site: `ok` quando o site respondeu (com novidades novas ou as mesmas).
signal finished(ok: bool)

const PATH := "/novidades.json"
const TIMEOUT_S := 8.0
## Preferência com a última versão vista no painel (como o ponto do botão Novidades do navegador).
const SEEN_KEY := "news_seen"
## Onde fica a última cópia baixada ({etag, feed}); os testes trocam.
static var cache_path: String = "user://novidades.json"

## As novidades ({version, releases}), as guardadas até chegar a do site; vazio sem nenhuma.
var feed: Dictionary = {}
## Buscando no site agora.
var busy: bool = false
var _etag: String = ""


func _init() -> void:
	var cached: Dictionary = load_cache()
	feed = cached["feed"]
	_etag = cached["etag"]


## Busca no site; só baixa de novo quando mudou (If-None-Match). Sem internet, fica a cópia guardada.
func refresh() -> void:
	if busy:
		return
	busy = true
	var http := HTTPRequest.new()
	http.timeout = TIMEOUT_S
	add_child(http)
	var headers: PackedStringArray = ["Cache-Control: no-cache"]
	if _etag != "" and not feed.is_empty():
		headers.append("If-None-Match: " + _etag)
	if http.request(GameConfig.site_url(PATH), headers) != OK:
		http.queue_free()
		busy = false
		finished.emit(false)
		return
	var result: Array = await http.request_completed
	http.queue_free()
	busy = false
	var code: int = int(result[1])
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS or (code != 200 and code != 304):
		finished.emit(false)
		return
	if code == 200:
		var fresh: Dictionary = parse(_json((result[3] as PackedByteArray).get_string_from_utf8()))
		if fresh.is_empty():
			finished.emit(false)
			return
		feed = fresh
		_etag = header(result[2], "etag")
		save_cache(fresh, _etag)
		updated.emit()
	finished.emit(true)


## Há versão (com número) que o jogador ainda não viu no painel.
func unseen() -> bool:
	return has_unseen(feed, seen())


## O painel abriu: a versão mais nova fica vista.
func mark_seen() -> void:
	var version: String = Txt.of(feed.get("version"))
	if version != "" and version != seen():
		Prefs.save(SEEN_KEY, version)


static func seen() -> String:
	return Txt.of(Prefs.load_all().get(SEEN_KEY))


## Só uma versão mais nova que a vista acende o ponto (a vista pode ser de antes, quando o painel tinha as novidades das duas mesas).
static func has_unseen(data: Dictionary, seen_version: String) -> bool:
	var version: String = Txt.of(data.get("version"))
	return version != "" and _newer(version, seen_version)


## X.Y.Z `a` depois de `b` (um `b` fora do formato conta como nenhum).
static func _newer(a: String, b: String) -> bool:
	var x: PackedStringArray = a.split(".")
	var y: PackedStringArray = b.split(".")
	if y.size() != 3 or x.size() != 3:
		return a != b
	for i: int in 3:
		if x[i].to_int() != y[i].to_int():
			return x[i].to_int() > y[i].to_int()
	return false


## O /novidades.json conferido: {version, releases: [{version, title, date, visual, groups: [{name, items: [{title, text}]}]}]}.
## O que não tem o formato fica de fora; {} quando não há nenhuma versão.
static func parse(data: Variant) -> Dictionary:
	if not data is Dictionary or not (data as Dictionary).get("releases") is Array:
		return {}
	var releases: Array = []
	for r: Variant in (data as Dictionary)["releases"]:
		if not r is Dictionary or Txt.of((r as Dictionary).get("version")) == "":
			continue
		var release: Dictionary = r
		var groups: Array = []
		var raw_groups: Variant = release.get("groups")
		for g: Variant in raw_groups if raw_groups is Array else []:
			if not g is Dictionary or not (g as Dictionary).get("items") is Array:
				continue
			var items: Array = []
			for i: Variant in (g as Dictionary)["items"]:
				if not i is Dictionary:
					continue
				var item: Dictionary = i
				if Txt.of(item.get("title")) != "" or Txt.of(item.get("text")) != "":
					items.append({"title": Txt.of(item.get("title")), "text": Txt.of(item.get("text"))})
			if not items.is_empty():
				groups.append({"name": Txt.of((g as Dictionary).get("name")), "items": items})
		var version: String = Txt.of(release["version"])
		releases.append({
			"version": version, "title": Txt.of(release.get("title", "Versão " + version)), "date": Txt.of(release.get("date")),
			"visual": release.get("visual") == true, "groups": groups,
		})
	if releases.is_empty():
		return {}
	return {"version": Txt.of((data as Dictionary).get("version")), "releases": releases}


## A cópia guardada: {feed, etag} (feed vazio sem nenhuma ou com o arquivo estragado).
static func load_cache() -> Dictionary:
	var out: Dictionary = {"feed": {}, "etag": ""}
	if not FileAccess.file_exists(cache_path):
		return out
	var saved: Variant = _json(FileAccess.get_file_as_string(cache_path))
	if saved is Dictionary:
		out["feed"] = parse((saved as Dictionary).get("feed"))
		out["etag"] = Txt.of((saved as Dictionary).get("etag")) if not (out["feed"] as Dictionary).is_empty() else ""
	return out


static func save_cache(data: Dictionary, etag: String) -> void:
	var file: FileAccess = FileAccess.open(cache_path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"etag": etag, "feed": data}))


## O JSON lido, ou null; sem encher o registro de erro com um arquivo estragado ou uma página no lugar do JSON (JSON.parse_string enche).
static func _json(text: String) -> Variant:
	var json := JSON.new()
	return json.data if json.parse(text) == OK else null


## Um cabeçalho da resposta (sem diferença de maiúsculas), ou vazio.
static func header(headers: PackedStringArray, name: String) -> String:
	for line: String in headers:
		var colon: int = line.find(":")
		if colon > 0 and line.substr(0, colon).strip_edges().to_lower() == name:
			return line.substr(colon + 1).strip_edges()
	return ""


## O pouco de Markdown do CHANGELOG (**negrito** e `código`) em BBCode, com os colchetes do texto escapados.
static func to_bbcode(text: String) -> String:
	var out: String = text.replace("[", "[lb]")
	var bold := RegEx.create_from_string("\\*\\*(.+?)\\*\\*")
	out = bold.sub(out, "[b]$1[/b]", true)
	var code := RegEx.create_from_string("`(.+?)`")
	return code.sub(out, "[code]$1[/code]", true)


## A página Novidades em imagens do site, na aba da mesa no PC e na versão dada (vazio: o começo).
static func visual_url(version: String = "") -> String:
	return GameConfig.site_url("/novidades?mesa=pc" + ("#v" + version.uri_encode() if version != "" else ""))
