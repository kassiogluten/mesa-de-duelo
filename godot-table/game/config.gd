# Endereços do servidor e das imagens: o site publicado no executável, o servidor local rodando do projeto.
class_name GameConfig
extends RefCounted

const PRODUCTION_WS := "wss://mesao.online/ws"
const LOCAL_WS := "ws://127.0.0.1:7171/ws"
## O site no `npm run dev`, que conversa com o servidor local.
const LOCAL_SITE := "http://localhost:5173"
## Cache das imagens das cartas (a CDN na frente do nginx do site; src/scryfallMirror.ts).
const IMAGES_MIRROR := "https://img.mesao.online/scryfall/"
const SCRYFALL_IMAGES := "https://cards.scryfall.io/"
const SCRYFALL_API := "https://api.scryfall.com/"


## O WebSocket do servidor: FORGE_URL, ou o site no executável e o servidor local rodando do projeto.
static func forge_url() -> String:
	var env: String = OS.get_environment("FORGE_URL")
	if env != "":
		return env
	return PRODUCTION_WS if OS.has_feature("template") else LOCAL_WS


## Uma rota HTTP do mesmo servidor do WebSocket (ws://host:7171/ws → http://host:7171/api/...).
static func http_url(path: String) -> String:
	var ws: String = forge_url()
	var base: String = ws.replace("wss://", "https://").replace("ws://", "http://")
	if base.ends_with("/ws"):
		base = base.substr(0, base.length() - 3)
	return base + path


## Uma página do site (/vincular…): MESA_SITE, o mesmo endereço do servidor publicado, ou o `npm run dev` com o servidor local.
static func site_url(path: String) -> String:
	var env: String = OS.get_environment("MESA_SITE").trim_suffix("/")
	if env != "":
		return env + path
	var api: String = http_url("")
	if api.contains("://127.0.0.1") or api.contains("://localhost"):
		return LOCAL_SITE + path
	return api + path


## A imagem pelo nosso cache quando é do Scryfall; MESA_IMAGENS=direto busca no Scryfall. A pedida pela série e número
## (api.scryfall.com/cards/<série>/<número>?format=image, um redirecionamento: fichas, impressão escolhida, série Nyx)
## vira /scryfall/cards/<tamanho>/<série>/<número>, como em src/scryfallMirror.ts.
static func image_url(url: String) -> String:
	if OS.get_environment("MESA_IMAGENS") == "direto":
		return url
	if url.begins_with(SCRYFALL_IMAGES):
		return IMAGES_MIRROR + url.substr(SCRYFALL_IMAGES.length())
	var api: RegExMatch = _api_image().search(url)
	if api:
		return "%scards/%s/%s/%s%s" % [IMAGES_MIRROR, api.get_string(3), api.get_string(1).to_lower(), api.get_string(2), "/back" if api.get_string(4) != "" else ""]
	return url


## O endereço original no Scryfall de uma imagem do nosso cache (para buscar direto quando o cache falha ou demora);
## os outros voltam como vieram.
static func original_image_url(url: String) -> String:
	if not url.begins_with(IMAGES_MIRROR):
		return url
	var path: String = url.substr(IMAGES_MIRROR.length())
	var parts: PackedStringArray = path.split("/")
	if parts.size() >= 4 and parts[0] == "cards":
		return "%scards/%s/%s?format=image&version=%s%s" % [SCRYFALL_API, parts[2], parts[3], parts[1], "&face=back" if parts.size() > 4 and parts[4] == "back" else ""]
	return SCRYFALL_IMAGES + path


static var _api_regex: RegEx


static func _api_image() -> RegEx:
	if _api_regex == null:
		_api_regex = RegEx.create_from_string("^https://api\\.scryfall\\.com/cards/([a-z0-9]{2,8})/([0-9a-z-]{1,12})\\?format=image&version=(small|normal|art_crop)(&face=back)?$")
	return _api_regex
