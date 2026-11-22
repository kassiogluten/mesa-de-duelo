# Endereços do servidor e das imagens: o site publicado no executável, o servidor local rodando do projeto.
class_name GameConfig
extends RefCounted

const PRODUCTION_WS := "wss://mesao.online/ws"
const LOCAL_WS := "ws://127.0.0.1:7171/ws"
## Cache das imagens das cartas (a CDN na frente do nginx do site; src/scryfallMirror.ts).
const IMAGES_MIRROR := "https://img.mesao.online/scryfall/"
const SCRYFALL_IMAGES := "https://cards.scryfall.io/"


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


## A imagem pelo nosso cache quando é do Scryfall; MESA_IMAGENS=direto busca no Scryfall.
static func image_url(url: String) -> String:
	if url.begins_with(SCRYFALL_IMAGES) and OS.get_environment("MESA_IMAGENS") != "direto":
		return IMAGES_MIRROR + url.substr(SCRYFALL_IMAGES.length())
	return url
