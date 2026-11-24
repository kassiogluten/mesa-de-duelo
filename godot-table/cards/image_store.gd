# As imagens das cartas por endereço: memória, disco (user://cards/img) e download com prioridade (mão e campo primeiro),
# a pequena antes da nítida, pelo espelho de imagens com o Scryfall de reserva; decodifica noutro fio.
class_name ImageStore
extends Node

## A imagem de um endereço ficou pronta. A pequena chega antes com o endereço da nítida, e depois a nítida no mesmo.
signal texture_ready(url: String, texture: Texture2D)

## Prioridade: a mão, o campo e a pilha; o resto à mostra (cemitério, exílio, inspetor, janelas); o deck baixado antes
## da partida (a sala, o mulligan).
const TABLE := 0
const OTHER := 1
const PREFETCH := 2
const CACHE_DIR := "user://cards"
## Downloads ao mesmo tempo (as conexões ficam abertas entre um e outro: cards/image_fetcher.gd).
const MAX_DOWNLOADS := 16
## Desses, no máximo tantos para o deck baixado antes: sempre sobra vaga para a carta que acabou de aparecer.
const MAX_PREFETCH := 10
## O espelho de imagens que não começa a responder nesse tempo fica para trás: a imagem vem direto do Scryfall.
const MIRROR_WAIT_S := 3.0
## Depois de tantas falhas seguidas do espelho, esta partida busca direto no Scryfall.
const MIRROR_STRIKES := 3

var _textures: Dictionary = {}
## A fila de download: [{url, rank, seq}] (rank menor sai antes: a prioridade, e a pequena antes da nítida); url → item.
var _queue: Array = []
var _queued: Dictionary = {}
var _seq: int = 0
## Baixando: url → rank.
var _downloading: Dictionary = {}
## Baixadas só para o disco (o deck antes da partida), até alguém pedir a textura; as que alguém pediu; as que falharam.
var _store_only: Dictionary = {}
var _wanted: Dictionary = {}
var _failed: Dictionary = {}
## A imagem pequena → a nítida que ela antecipa.
var _small_for: Dictionary = {}
var _mirror_strikes: int = 0
var fetcher := ImageFetcher.new()
## Sem imagens nenhuma (os prints da carta desenhada, tools/preview_card_art.gd).
var offline: bool = false
## Decodificações de imagem em andamento noutro fio: url → {task, bytes, save}
var _decoding: Dictionary = {}
var _decoded: Dictionary = {}
var _decoded_lock := Mutex.new()


func _ready() -> void:
	add_child(fetcher)
	DirAccess.make_dir_recursive_absolute(CACHE_DIR + "/img")


func _exit_tree() -> void:
	# Espera as imagens que ainda estão sendo decodificadas (fecha a mesa ou o teste sem deixar fio solto).
	for job: Dictionary in _decoding.values():
		WorkerThreadPool.wait_for_task_completion(int(job["task"]))
	_decoding.clear()


## A textura de um endereço, ou null enquanto baixa (texture_ready avisa quando chega). Enquanto a nítida não chega,
## devolve a pequena, se ela já veio.
func texture(url: String, priority: int = OTHER) -> Texture2D:
	if url == "" or offline:
		return null
	if _textures.has(url):
		return _textures[url]
	_wanted[url] = true
	_store_only.erase(url)
	var small: String = small_url_of(url)
	if not _decoding.has(url) and not _failed.has(url) and not _load_local(url):
		_enqueue(url, priority, false)
		if small != "" and not _textures.has(small) and not _decoding.has(small) and not _failed.has(small):
			_small_for[small] = url
			if not _load_local(small):
				_enqueue(small, priority, true)
	return _textures.get(small) if small != "" else null


## A textura nítida do endereço já está na memória.
func has_texture(url: String) -> bool:
	return _textures.has(url)


## A imagem chega em instantes (já está na memória, no disco ou no aplicativo): não vale desenhar a carta antes.
func arriving_soon(url: String) -> bool:
	if url == "" or offline or _failed.has(url):
		return false
	if _textures.has(url) or _decoding.has(url) or url.begins_with("res://") or FileAccess.file_exists(cache_path(url)):
		return true
	var small: String = small_url_of(url)
	return small != "" and (_textures.has(small) or _decoding.has(small) or FileAccess.file_exists(cache_path(small)))


## Baixa para o disco, atrás das cartas à mostra, a imagem de uma carta que ainda vai aparecer (o deck na sala).
func prefetch(url: String) -> void:
	if url == "" or url.begins_with("res://") or _textures.has(url) or _decoding.has(url) or _failed.has(url):
		return
	if FileAccess.file_exists(cache_path(url)):
		return
	if not _wanted.has(url):
		_store_only[url] = true
	_enqueue(url, PREFETCH, false)


## A imagem pequena (~15 KB) que antecipa a nítida do endereço dado, ou "" quando não há (a da mesa, que já está aqui).
static func small_url_of(url: String) -> String:
	if url == "" or url.begins_with("res://"):
		return ""
	if url.contains("version=normal"):
		return url.replace("version=normal", "version=small")
	if url.contains("/normal/"):
		return url.replace("/normal/", "/small/")
	return ""


static func cache_path(url: String) -> String:
	return "%s/img/%s.img" % [CACHE_DIR, url.md5_text()]


## A imagem já está aqui: no aplicativo (res://) ou no disco. Decodifica noutro fio e avisa quando ficar pronta.
func _load_local(url: String) -> bool:
	var path: String = url if url.begins_with("res://") else cache_path(url)
	if not FileAccess.file_exists(path):
		return false
	_decode_async(url, FileAccess.get_file_as_bytes(path), false)
	return true


## Põe na fila (ou sobe na fila, se já estava mais atrás).
func _enqueue(url: String, priority: int, small: bool) -> void:
	if _downloading.has(url):
		return
	var rank: int = priority * 2 + (0 if small else 1)
	if _queued.has(url):
		var queued: Dictionary = _queued[url]
		queued["rank"] = mini(int(queued["rank"]), rank)
		return
	_seq += 1
	var item: Dictionary = {"url": url, "rank": rank, "seq": _seq}
	_queue.append(item)
	_queued[url] = item
	_pump()


func _pump() -> void:
	while _downloading.size() < MAX_DOWNLOADS and not _queue.is_empty():
		var best: int = 0
		for i: int in range(1, _queue.size()):
			var a: Dictionary = _queue[i]
			var b: Dictionary = _queue[best]
			if int(a["rank"]) < int(b["rank"]) or (int(a["rank"]) == int(b["rank"]) and int(a["seq"]) < int(b["seq"])):
				best = i
		var item: Dictionary = _queue[best]
		if int(item["rank"]) >= PREFETCH * 2 and _prefetching() >= MAX_PREFETCH:
			return
		_queue.remove_at(best)
		_queued.erase(item["url"])
		_download(Txt.of(item["url"]), int(item["rank"]))


func _prefetching() -> int:
	var n: int = 0
	for rank: int in _downloading.values():
		if rank >= PREFETCH * 2:
			n += 1
	return n


func _download(url: String, rank: int) -> void:
	_downloading[url] = rank
	var bytes: PackedByteArray = await _fetch_bytes(url)
	_downloading.erase(url)
	if bytes.is_empty():
		_failed[url] = true
	elif _store_only.has(url) and not _wanted.has(url):
		_store(url, bytes)
	else:
		_decode_async(url, bytes, true)
	_store_only.erase(url)
	_pump()


## Os bytes da imagem: pelo espelho (se ele responde a tempo) ou direto no Scryfall; vazio se não deu.
func _fetch_bytes(url: String) -> PackedByteArray:
	var mirror: bool = url.begins_with(GameConfig.IMAGES_MIRROR)
	if mirror and _mirror_strikes < MIRROR_STRIKES:
		var result: Array = await fetcher.fetch(url, MIRROR_WAIT_S, 30.0).finished
		if bool(result[0]) and _looks_like_image(result[1]):
			_mirror_strikes = 0
			return result[1]
		_mirror_strikes += 1
	var source: String = GameConfig.original_image_url(url) if mirror else url
	var again: Array = await fetcher.fetch(source, 15.0, 30.0).finished
	return again[1] if bool(again[0]) and _looks_like_image(again[1]) else PackedByteArray()


## Guarda no disco sem decodificar (a imagem do deck que ainda não apareceu na mesa).
func _store(url: String, bytes: PackedByteArray) -> void:
	var file: FileAccess = FileAccess.open(cache_path(url), FileAccess.WRITE)
	if file:
		file.store_buffer(bytes)


func _process(_delta: float) -> void:
	if _decoding.is_empty():
		return
	for url: String in _decoding.keys():
		var job: Dictionary = _decoding[url]
		if not WorkerThreadPool.is_task_completed(int(job["task"])):
			continue
		WorkerThreadPool.wait_for_task_completion(int(job["task"]))
		_decoding.erase(url)
		_decoded_lock.lock()
		var image: Image = _decoded.get(url)
		_decoded.erase(url)
		_decoded_lock.unlock()
		if image == null:
			continue
		if bool(job["save"]):
			_store(url, job["bytes"])
		var tex := ImageTexture.create_from_image(image)
		_textures[url] = tex
		texture_ready.emit(url, tex)
		# A pequena chegou antes da nítida: quem espera a nítida já recebe esta.
		var sharp: String = Txt.of(_small_for.get(url, ""))
		if sharp != "" and not _textures.has(sharp):
			texture_ready.emit(sharp, tex)


## Decodifica a imagem (JPG/PNG/WebP e as mipmaps) noutro fio, para a mesa não engasgar quando muitas chegam juntas.
func _decode_async(url: String, bytes: PackedByteArray, save: bool) -> void:
	# A trava e o dicionário vão como locais: se o catálogo sair da cena no meio, o fio não toca num objeto já liberado.
	var lock: Mutex = _decoded_lock
	var store: Dictionary = _decoded
	var task: int = WorkerThreadPool.add_task(func() -> void:
		var image: Image = _decode_image(bytes)
		lock.lock()
		store[url] = image
		lock.unlock())
	_decoding[url] = {"task": task, "bytes": bytes, "save": save}


static func _looks_like_image(bytes: PackedByteArray) -> bool:
	return bytes.size() > 4 and ((bytes[0] == 0xFF and bytes[1] == 0xD8) or (bytes[0] == 0x89 and bytes[1] == 0x50) or (bytes[0] == 0x52 and bytes[1] == 0x49))


static func _decode_image(bytes: PackedByteArray) -> Image:
	if bytes.size() < 4:
		return null
	var image := Image.new()
	var err: Error
	if bytes[0] == 0x89 and bytes[1] == 0x50:
		err = image.load_png_from_buffer(bytes)
	elif bytes[0] == 0x52 and bytes[1] == 0x49:
		err = image.load_webp_from_buffer(bytes)
	else:
		err = image.load_jpg_from_buffer(bytes)
	if err != OK:
		return null
	image.generate_mipmaps()
	return image
