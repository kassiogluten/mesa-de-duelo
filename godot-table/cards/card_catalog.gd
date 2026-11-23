# Catálogo das cartas: nome e texto em português pelo cache do servidor (/api/cartas) e imagens com cache em disco.
# Um nó por partida (filho da tela da mesa); quem desenha pede info()/texture() e escuta os sinais quando chegam.
class_name CardCatalog
extends Node

## Chegaram os dados de cartas pedidas (nomes em inglês, como o servidor manda no estado).
signal info_ready(names: PackedStringArray)
## A imagem de um endereço terminou de baixar (ou veio do disco).
signal texture_ready(url: String, texture: Texture2D)

const BATCH := 200
const MAX_DOWNLOADS := 6
const CACHE_DIR := "user://cards"
## O nome muda quando o formato dos dados guardados muda (v2: sem a imagem traduzida que é só um aviso; v3: com a
## raridade e as faces; v4: com as cores, para Meus decks).
const INFO_FILE := "user://cards/info-v4.json"
## Imagem de uma carta pelo nome, quando o servidor não a conhece (o Scryfall redireciona para a imagem).
const NAMED_IMAGE := "https://api.scryfall.com/cards/named?format=image&version=normal&exact="

## nome em inglês → {label, type_line, text, image, small, rarity, layout, colors, faces}; faces: [{name, label, cost, type_line,
## text, power, toughness, image, small}] nas cartas de mais de uma face (vazio nas outras).
var _info: Dictionary = {}
## Nome em inglês de uma face (a de trás de uma carta transformada) → a chave da carta inteira em _info.
var _face_keys: Dictionary = {}
var _asked: Dictionary = {}
var _textures: Dictionary = {}
var _queue: PackedStringArray = []
var _downloading: Dictionary = {}
var _info_dirty: bool = false
## Nomes pedidos ao servidor cuja resposta ainda não chegou.
var _pending_names: Dictionary = {}
## Decodificações de imagem em andamento noutro fio: url → {task, image, bytes, save}
var _decoding: Dictionary = {}
var _decoded: Dictionary = {}
var _decoded_lock := Mutex.new()


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(CACHE_DIR + "/img")
	if FileAccess.file_exists(INFO_FILE):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(INFO_FILE))
		if parsed is Dictionary:
			_info = parsed


func _exit_tree() -> void:
	_save_info()
	# Espera as imagens que ainda estão sendo decodificadas (fecha a mesa ou o teste sem deixar fio solto).
	for job: Dictionary in _decoding.values():
		WorkerThreadPool.wait_for_task_completion(int(job["task"]))
	_decoding.clear()


## Os dados de uma carta, ou {} enquanto não chegam (peça antes com request()).
func info(name: String) -> Dictionary:
	return _info.get(name, {})


## O nome que o jogador vê: o impresso em português, ou o em inglês enquanto não chega.
func label(name: String) -> String:
	return Txt.of(info(name).get("label", name))


## A carta de que `name` é uma das faces, e qual ({"entry", "index"}), ou {} quando não se sabe. Acha também a face
## de trás ("Insectile Aberration"), que o estado traz quando a carta está transformada e que info() não conhece.
func face_of(name: String) -> Dictionary:
	if name == "":
		return {}
	var key: String = Txt.of(_face_keys.get(name, ""))
	if key == "" or not _info.has(key):
		key = ""
		for candidate: String in _info:
			for face: Variant in (_info[candidate] as Dictionary).get("faces", []):
				if face is Dictionary and Txt.of((face as Dictionary).get("name")) == name:
					key = candidate
					break
			if key != "":
				break
		if key == "":
			return {}
		_face_keys[name] = key
	var entry: Dictionary = _info[key]
	var faces: Array = entry.get("faces", [])
	for i: int in faces.size():
		if faces[i] is Dictionary and Txt.of((faces[i] as Dictionary).get("name")) == name:
			return {"entry": entry, "index": i}
	return {}


## Pede ao servidor os dados das cartas que ainda não conhece.
func request(names: PackedStringArray) -> void:
	var missing: PackedStringArray = []
	for name: String in names:
		if name != "" and not _info.has(name) and not _asked.has(name):
			_asked[name] = true
			missing.append(name)
	for i: int in range(0, missing.size(), BATCH):
		_fetch_info(missing.slice(i, i + BATCH))


## O endereço da imagem de uma carta do estado: a ficha e a impressão escolhida vêm prontas; o resto pelo nome.
func image_url_for(card: Dictionary) -> String:
	var token_image: String = Txt.of(card.get("image", ""))
	if token_image != "":
		return token_image
	var print_info: Variant = card.get("print")
	if print_info is Dictionary:
		return "https://api.scryfall.com/cards/%s/%s?format=image&version=normal" % [Txt.of((print_info as Dictionary).get("set", "")).to_lower(), (print_info as Dictionary).get("cn", "")]
	var name: String = Txt.of(card.get("name", ""))
	if name == "":
		return ""
	var data: Dictionary = info(name)
	if Txt.of(data.get("image", "")) != "":
		return Txt.of(data["image"])
	# O servidor já respondeu e não conhece a carta: a imagem pelo nome, direto no Scryfall.
	if _asked.has(name) and not _pending_names.has(name):
		return NAMED_IMAGE + name.uri_encode()
	return ""


## A textura de um endereço, ou null enquanto baixa (texture_ready avisa quando chega).
func texture(url: String) -> Texture2D:
	if url == "":
		return null
	if _textures.has(url):
		return _textures[url]
	if _decoding.has(url):
		return null
	var cached: String = _cache_path(url)
	if FileAccess.file_exists(cached):
		_decode_async(url, FileAccess.get_file_as_bytes(cached), false)
		return null
	if not _downloading.has(url) and not _queue.has(url):
		_queue.append(url)
		_pump()
	return null



func _fetch_info(names: PackedStringArray) -> void:
	for name: String in names:
		_pending_names[name] = true
	var http := HTTPRequest.new()
	http.timeout = 25.0
	add_child(http)
	var body: String = JSON.stringify({"nomes": Array(names)})
	if http.request(GameConfig.http_url("/api/cartas"), ["Content-Type: text/plain"], HTTPClient.METHOD_POST, body) != OK:
		http.queue_free()
		_info_failed(names)
		return
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS or int(result[1]) != 200:
		_info_failed(names)
		return
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	var got: PackedStringArray = []
	if parsed is Dictionary:
		for raw: Variant in (parsed as Dictionary).get("cartas", []):
			if raw is Dictionary:
				var entry: Dictionary = _entry(raw as Dictionary)
				var key: String = Txt.of((raw as Dictionary).get("name", ""))
				_info[key] = entry
				got.append(key)
	for name: String in names:
		_pending_names.erase(name)
		# Cartas de duas faces chegam com o nome completo ("A // B"); o estado às vezes traz só a face.
		if not _info.has(name):
			for key: String in got:
				if key.begins_with(name + " //"):
					_info[name] = _info[key]
	_info_dirty = true
	info_ready.emit(names)


func _info_failed(names: PackedStringArray) -> void:
	for name: String in names:
		_pending_names.erase(name)
	info_ready.emit(names)


## Os campos que a mesa usa, preferindo a impressão em português.
static func _entry(card: Dictionary) -> Dictionary:
	var pt: Dictionary = card.get("pt", {}) if card.get("pt") is Dictionary else {}
	# Sem scan da impressão traduzida o Scryfall devolve um aviso no lugar da arte: aí vale a imagem em inglês (slimPt).
	var no_scan: bool = pt.get("image_status") in ["placeholder", "missing"]
	var images: Dictionary = {} if no_scan else _images(pt)
	if images.is_empty():
		images = _images(card)
	var printed: String = Txt.of(pt.get("printed_name"))
	if printed == "" and pt.get("card_faces") is Array:
		var faces: PackedStringArray = []
		for face: Variant in pt["card_faces"]:
			if face is Dictionary and Txt.of((face as Dictionary).get("printed_name")) != "":
				faces.append(Txt.of((face as Dictionary)["printed_name"]))
		printed = " // ".join(faces)
	return {
		"label": printed if printed != "" else Txt.of(card.get("name", "")),
		"type_line": Txt.of(pt.get("printed_type_line", card.get("type_line", ""))),
		"text": Txt.of(pt.get("printed_text", card.get("oracle_text", ""))),
		"image": GameConfig.image_url(Txt.of(images.get("normal", ""))),
		"small": GameConfig.image_url(Txt.of(images.get("small", ""))),
		"rarity": Txt.of(card.get("rarity")),
		"layout": Txt.of(card.get("layout")),
		"colors": _colors(card),
		"faces": _faces(card, pt, no_scan),
	}


## As cores da carta (WUBRG); nas de duas faces sem as cores da carta inteira, as dos custos das faces.
static func _colors(card: Dictionary) -> Array:
	var out: Array = []
	if card.get("colors") is Array:
		for color: Variant in card["colors"]:
			out.append(Txt.of(color))
		return out
	for face: Variant in (card.get("card_faces", []) if card.get("card_faces") is Array else []):
		for symbol: String in ManaSymbols.parse(Txt.of((face as Dictionary).get("mana_cost")) if face is Dictionary else ""):
			for color: String in ["W", "U", "B", "R", "G"]:
				if symbol.contains(color) and not out.has(color):
					out.append(color)
	return out


## As faces de uma carta de duas faces (transformar, modal, flip, dividida), cada uma com o nome, o tipo e o texto em
## português quando a impressão traduzida tem, e a imagem da face quando ela tem uma (dupla face).
static func _faces(card: Dictionary, pt: Dictionary, no_scan: bool) -> Array:
	var faces: Array = card.get("card_faces", []) if card.get("card_faces") is Array else []
	if faces.size() < 2:
		return []
	var pt_faces: Array = pt.get("card_faces", []) if pt.get("card_faces") is Array else []
	var out: Array = []
	for i: int in faces.size():
		if not faces[i] is Dictionary:
			return []
		var face: Dictionary = faces[i]
		var translated: Dictionary = pt_faces[i] if i < pt_faces.size() and pt_faces[i] is Dictionary else {}
		var images: Dictionary = {}
		if not no_scan and translated.get("image_uris") is Dictionary:
			images = translated["image_uris"]
		if images.is_empty() and face.get("image_uris") is Dictionary:
			images = face["image_uris"]
		out.append({
			"name": Txt.of(face.get("name")),
			"label": Txt.of(translated.get("printed_name", face.get("name", ""))),
			"cost": Txt.of(face.get("mana_cost")),
			"type_line": Txt.of(translated.get("printed_type_line", face.get("type_line", ""))),
			"text": Txt.of(translated.get("printed_text", face.get("oracle_text", ""))),
			"power": Txt.of(face.get("power")),
			"toughness": Txt.of(face.get("toughness")),
			"image": GameConfig.image_url(Txt.of(images.get("normal", ""))),
			"small": GameConfig.image_url(Txt.of(images.get("small", ""))),
		})
	return out


static func _images(card: Dictionary) -> Dictionary:
	if card.get("image_uris") is Dictionary:
		return card["image_uris"]
	var faces: Variant = card.get("card_faces")
	if faces is Array and not (faces as Array).is_empty() and (faces as Array)[0] is Dictionary and ((faces as Array)[0] as Dictionary).get("image_uris") is Dictionary:
		return ((faces as Array)[0] as Dictionary)["image_uris"]
	return {}


func _pump() -> void:
	while _downloading.size() < MAX_DOWNLOADS and not _queue.is_empty():
		var url: String = _queue[0]
		_queue.remove_at(0)
		_download(url)


func _download(url: String) -> void:
	var http := HTTPRequest.new()
	http.timeout = 30.0
	http.use_threads = true
	add_child(http)
	_downloading[url] = http
	var result: Array = [HTTPRequest.RESULT_CANT_CONNECT, 0, PackedStringArray(), PackedByteArray()]
	if http.request(url) == OK:
		result = await http.request_completed
	http.queue_free()
	_downloading.erase(url)
	var bytes: PackedByteArray = result[3]
	var ok: bool = int(result[0]) == HTTPRequest.RESULT_SUCCESS and int(result[1]) == 200 and _looks_like_image(bytes)
	if not ok and url.begins_with(GameConfig.IMAGES_MIRROR):
		# O cache falhou: tenta direto no Scryfall, guardando no mesmo lugar.
		var original: String = GameConfig.SCRYFALL_IMAGES + url.substr(GameConfig.IMAGES_MIRROR.length())
		var retry := HTTPRequest.new()
		retry.timeout = 30.0
		add_child(retry)
		if retry.request(original) == OK:
			var again: Array = await retry.request_completed
			bytes = again[3]
			ok = int(again[0]) == HTTPRequest.RESULT_SUCCESS and int(again[1]) == 200 and _looks_like_image(bytes)
		retry.queue_free()
	if ok:
		_decode_async(url, bytes, true)
	_pump()


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
			var file: FileAccess = FileAccess.open(_cache_path(url), FileAccess.WRITE)
			if file:
				file.store_buffer(job["bytes"])
		var tex := ImageTexture.create_from_image(image)
		_textures[url] = tex
		texture_ready.emit(url, tex)


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


static func _cache_path(url: String) -> String:
	return "%s/img/%s.img" % [CACHE_DIR, url.md5_text()]


func _save_info() -> void:
	if not _info_dirty:
		return
	var file: FileAccess = FileAccess.open(INFO_FILE, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(_info))
	_info_dirty = false
