# Catálogo das cartas: nome e texto em português pelo cache do servidor (/api/cartas), o endereço da imagem de cada carta,
# as imagens (cards/image_store.gd) e a carta desenhada enquanto a imagem não chega (cards/card_sketch.gd).
# Um nó por partida (filho da tela da mesa); quem desenha pede info()/texture() e escuta os sinais quando chegam.
class_name CardCatalog
extends Node

## Chegaram os dados de cartas pedidas (nomes em inglês, como o servidor manda no estado).
signal info_ready(names: PackedStringArray)
## A imagem de um endereço terminou de baixar (ou veio do disco). A pequena chega antes, com o endereço da nítida, e
## depois a nítida no mesmo endereço: quem escuta só troca a textura.
signal texture_ready(url: String, texture: Texture2D)
## A carta desenhada (sketch()) ficou pronta.
signal sketch_ready(key: String, texture: Texture2D)

const BATCH := 200
const CACHE_DIR := ImageStore.CACHE_DIR
## O nome muda quando o formato dos dados guardados muda (v2: sem a imagem traduzida que é só um aviso; v3: com a
## raridade e as faces; v4: com as cores, para Meus decks; v5: com a arte recortada, o valor de mana e o tipo, para a
## capa do deck na tela inicial).
const INFO_FILE := "user://cards/info-v5.json"
## Imagem de uma carta pelo nome, quando o servidor não a conhece (o Scryfall redireciona para a imagem).
const NAMED_IMAGE := "https://api.scryfall.com/cards/named?format=image&version=normal&exact="
## A arte recortada pelo nome, quando os dados da carta não chegaram (a capa de um comandante sem o servidor).
const NAMED_ART := "https://api.scryfall.com/cards/named?format=image&version=art_crop&exact="
## O tipo principal pela linha de tipo em inglês (TYPES de src/cards.ts): o primeiro que aparece nesta ordem.
const KINDS := [
	["Land", "land"], ["Creature", "creature"], ["Planeswalker", "planeswalker"], ["Instant", "instant"],
	["Sorcery", "sorcery"], ["Battle", "battle"], ["Artifact", "artifact"], ["Enchantment", "enchantment"],
]

## nome em inglês → {label, type_line, text, image, small, art, cmc, kind, rarity, layout, colors, faces}; faces: [{name, label, cost, type_line,
## text, power, toughness, image, small}] nas cartas de mais de uma face (vazio nas outras).
var _info: Dictionary = {}
## Nome em inglês de uma face (a de trás de uma carta transformada) → a chave da carta inteira em _info.
var _face_keys: Dictionary = {}
var _asked: Dictionary = {}
var _info_dirty: bool = false
## Nomes pedidos ao servidor cuja resposta ainda não chegou.
var _pending_names: Dictionary = {}
## Cartas de um deck esperando os dados (o endereço da imagem) para baixar antes da partida: [{name, print}].
var _prefetch_wait: Array = []
var images := ImageStore.new()
var _painter := SketchPainter.new()


func _ready() -> void:
	add_child(images)
	add_child(_painter)
	images.texture_ready.connect(func(url: String, tex: Texture2D) -> void: texture_ready.emit(url, tex))
	_painter.painted.connect(func(key: String, tex: Texture2D) -> void: sketch_ready.emit(key, tex))
	if FileAccess.file_exists(INFO_FILE):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(INFO_FILE))
		if parsed is Dictionary:
			_info = parsed


func _exit_tree() -> void:
	_save_info()


## Os dados de uma carta, ou {} enquanto não chegam (peça antes com request()).
func info(name: String) -> Dictionary:
	return _info.get(name, {})


## O nome que o jogador vê: o impresso em português, ou o em inglês enquanto não chega; a ficha sem o "Token" do Forge.
func label(name: String) -> String:
	var known: String = Txt.of(info(name).get("label", ""))
	if known != "":
		return known
	return TokenNames.label(name) if name.ends_with(" Token") else name


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


## O endereço da imagem de uma carta do estado: a ficha e a impressão escolhida vêm prontas; depois a arte padrão da mesa
## (terrenos básicos na série Nyx; com "Cartas da mesa", a arte própria); o resto pelo nome.
func image_url_for(card: Dictionary) -> String:
	var token_image: String = Txt.of(card.get("image", ""))
	if token_image != "":
		return GameConfig.image_url(token_image)
	var print_info: Variant = card.get("print")
	if print_info is Dictionary:
		return GameConfig.image_url("%scards/%s/%s?format=image&version=normal" % [GameConfig.SCRYFALL_API, Txt.of((print_info as Dictionary).get("set", "")).to_lower(), Txt.of((print_info as Dictionary).get("cn", ""))])
	var name: String = Txt.of(card.get("name", ""))
	if name == "":
		return ""
	var default_art: String = DefaultArt.url_for(name)
	if default_art != "":
		return default_art
	var data: Dictionary = info(name)
	if Txt.of(data.get("image", "")) != "":
		return Txt.of(data["image"])
	# O servidor já respondeu e não conhece a carta: a imagem pelo nome, direto no Scryfall. A ficha vai sem o " Token"
	# do Forge ("Goblin Token" não existe lá; "Goblin" sim).
	if _asked.has(name) and not _pending_names.has(name):
		return NAMED_IMAGE + TokenNames.base(name).uri_encode()
	return ""


## O endereço da arte recortada de uma carta pelo nome: a dos dados; sem eles, depois que o servidor respondeu sem
## conhecê-la (ou caiu), a do Scryfall pelo nome; "" enquanto a resposta não chega.
func art_url_for(name: String) -> String:
	if name == "":
		return ""
	var art: String = Txt.of(info(name).get("art", ""))
	if art != "":
		return art
	if _asked.has(name) and not _pending_names.has(name):
		return NAMED_ART + name.uri_encode()
	return ""


## A textura de um endereço, ou null enquanto baixa (texture_ready avisa quando chega); enquanto a nítida não chega, a
## pequena, se já veio. `priority`: ImageStore.TABLE na mão, no campo e na pilha, que passam na frente do resto.
func texture(url: String, priority: int = ImageStore.OTHER) -> Texture2D:
	return images.texture(url, priority)


## A imagem nítida do endereço já está na memória.
func has_texture(url: String) -> bool:
	return images.has_texture(url)


## A imagem chega em instantes (memória, disco ou aplicativo): não vale desenhar a carta antes.
func arriving_soon(url: String) -> bool:
	return images.arriving_soon(url)


## A carta desenhada (nome, custo, tipo, texto e P/R, em português quando os dados chegaram), ou null enquanto desenha
## (sketch_ready avisa) e sem tela para desenhar.
func sketch(card: Dictionary) -> Texture2D:
	var data: Dictionary = CardSketch.spec(card, self)
	return _painter.texture(CardSketch.key(data), data)


## A chave da carta desenhada de uma carta do estado (muda quando chegam os dados em português).
func sketch_key(card: Dictionary) -> String:
	return CardSketch.key(CardSketch.spec(card, self))


## Baixa para o disco as imagens de um deck (as linhas {name, set, cn} da lista) antes da partida, na sala e no
## mulligan, atrás das cartas à mostra: quando a carta aparece, a imagem já vem do disco.
func prefetch(entries: Array) -> void:
	var names: PackedStringArray = []
	for raw: Variant in entries:
		if not raw is Dictionary:
			continue
		var entry: Dictionary = raw
		var name: String = Txt.of(entry.get("name", ""))
		if name == "":
			continue
		var card: Dictionary = {"name": name}
		if Txt.of(entry.get("set", "")) != "" and Txt.of(entry.get("cn", "")) != "":
			card["print"] = {"set": Txt.of(entry["set"]), "cn": Txt.of(entry["cn"])}
		_prefetch_wait.append(card)
		names.append(name)
	request(names)
	_prefetch_ready()


## As cartas do deck cujo endereço já se sabe vão para a fila (as outras esperam os dados).
func _prefetch_ready() -> void:
	var waiting: Array = []
	for card: Dictionary in _prefetch_wait:
		var url: String = image_url_for(card)
		if url == "":
			waiting.append(card)
		else:
			images.prefetch(url)
	_prefetch_wait = waiting



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
	_prefetch_ready()
	info_ready.emit(names)


func _info_failed(names: PackedStringArray) -> void:
	for name: String in names:
		_pending_names.erase(name)
	_prefetch_ready()
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
		# A arte sem a moldura (art_crop), da frente nas cartas de duas faces: a capa do deck na tela inicial.
		"art": GameConfig.image_url(Txt.of(images.get("art_crop", ""))),
		"cmc": float(card["cmc"]) if card.get("cmc") is float or card.get("cmc") is int else 0.0,
		"kind": kind_of(Txt.of(card.get("type_line"))),
		"rarity": Txt.of(card.get("rarity")),
		"layout": Txt.of(card.get("layout")),
		"colors": _colors(card),
		"faces": _faces(card, pt, no_scan),
	}


## O tipo principal da carta ("creature", "land"…; "other" sem nenhum), pela linha de tipo em inglês.
static func kind_of(type_line: String) -> String:
	var words: PackedStringArray = type_line.replace("—", " ").replace("/", " ").split(" ", false)
	for pair: Array in KINDS:
		if words.has(Txt.of(pair[0])):
			return Txt.of(pair[1])
	return "other"


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


func _save_info() -> void:
	if not _info_dirty:
		return
	var file: FileAccess = FileAccess.open(INFO_FILE, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(_info))
	_info_dirty = false
