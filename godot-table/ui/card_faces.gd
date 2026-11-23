# As faces de uma carta para o botão de virar do inspetor: qual está à mostra, a imagem de cada uma e os textos da face
# em português (porta de cardSides de src/ui/cardFlip.ts, com os dados de /api/cartas).
class_name CardFaces
extends RefCounted

## Layouts em que cada face é um lado da carta (as divididas e as de aventura mostram as duas metades na mesma imagem).
const SIDED_LAYOUTS: PackedStringArray = ["transform", "modal_dfc", "flip", "double_faced_token", "reversible_card"]


## Os lados da carta do estado: {} se ela não vira; senão {kind: "dfc" (outra imagem) ou "flip" (a mesma de cabeça para
## baixo), faces: as do catálogo, shown: a face à mostra na mesa, urls: a imagem de cada face}.
static func sides(card: Dictionary, catalog: CardCatalog) -> Dictionary:
	if catalog == null or card.is_empty() or bool(card.get("faceDown", false)) or Txt.of(card.get("name")) == "":
		return {}
	var name: String = Txt.of(card["name"])
	var found: Dictionary = _entry(name, catalog)
	if found.is_empty():
		return {}
	var entry: Dictionary = found["entry"]
	var faces: Array = entry.get("faces", [])
	if faces.size() < 2 or not SIDED_LAYOUTS.has(Txt.of(entry.get("layout"))):
		return {}
	var shown: int = int(found["index"])
	var both_images: bool = Txt.of((faces[0] as Dictionary).get("image")) != "" and Txt.of((faces[1] as Dictionary).get("image")) != ""
	var kind: String = "dfc" if both_images else ("flip" if Txt.of(entry.get("layout")) == "flip" else "")
	if kind == "":
		return {}
	var urls: PackedStringArray = []
	for i: int in 2:
		urls.append(face_url(card, faces, i, catalog) if kind == "dfc" else catalog.image_url_for(card))
	return {"kind": kind, "faces": faces, "shown": shown, "urls": urls}


## A imagem de uma face: a da impressão escolhida no deck (com face=back no verso), senão a da face no catálogo.
static func face_url(card: Dictionary, faces: Array, index: int, catalog: CardCatalog) -> String:
	var print_info: Variant = card.get("print")
	if print_info is Dictionary and Txt.of(card.get("image")) == "":
		var base: String = catalog.image_url_for(card)
		return base + ("&face=back" if index == 1 else "")
	var own: String = Txt.of((faces[index] as Dictionary).get("image")) if index < faces.size() else ""
	return own if own != "" else catalog.image_url_for(card)


## Um lookup (nome em inglês → dados do catálogo) que, nas cartas de dois lados, devolve o nome, o tipo e o texto só da
## face com aquele nome: a dupla face mostra a face à mostra, e não as duas juntas; a transformada é achada pelo verso.
static func lookup(catalog: CardCatalog, base: Callable) -> Callable:
	return func(name: String) -> Dictionary:
		var info: Dictionary = base.call(name) if base.is_valid() else {}
		if catalog == null:
			return info
		var found: Dictionary = _entry(name, catalog)
		if found.is_empty():
			return info
		var entry: Dictionary = found["entry"]
		if not SIDED_LAYOUTS.has(Txt.of(entry.get("layout"))):
			return info
		var face: Dictionary = (entry["faces"] as Array)[int(found["index"])]
		var out: Dictionary = (info if not info.is_empty() else entry).duplicate()
		out["label"] = Txt.of(face.get("label"))
		out["type_line"] = Txt.of(face.get("type_line"))
		out["text"] = Txt.of(face.get("text"))
		return out


## A carta de que `name` é uma face, e qual face ({"entry", "index"}); o nome da carta inteira conta como a frente.
static func _entry(name: String, catalog: CardCatalog) -> Dictionary:
	var found: Dictionary = catalog.face_of(name)
	if not found.is_empty():
		return found
	var entry: Dictionary = catalog.info(name)
	if (entry.get("faces", []) as Array).size() >= 2:
		return {"entry": entry, "index": 0}
	return {}
