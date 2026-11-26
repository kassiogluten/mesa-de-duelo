# Preço de cada carta em reais (menor preço da LigaMagic; shared/card-prices-brl.json, copiado para res://data/ pelo npm run godot).
# O mesmo arquivo e as mesmas regras de src/cardPrices.ts: lido na primeira carta aberta no inspetor.
class_name CardPrices
extends RefCounted

const PATH := "res://data/card-prices-brl.json"
## Cotação com mais de 30 dias aparece apagada, como antiga.
const STALE_DAYS := 30
## As letras acentuadas que aparecem em nomes de carta, sem o acento (o NFKD de priceKey em src/cardPrices.ts).
const PLAIN := {
	"à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "ç": "c", "è": "e", "é": "e", "ê": "e", "ë": "e",
	"ì": "i", "í": "i", "î": "i", "ï": "i", "ñ": "n", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ù": "u",
	"ú": "u", "û": "u", "ü": "u", "ý": "y", "ÿ": "y",
}

static var _table: Dictionary = {}
static var _loaded := false


## Troca a tabela (os testes usam; a mesa lê o arquivo sozinha). `cartas`: nome normalizado → [preço, "AAAA-MM-DD"].
static func set_table(cartas: Dictionary) -> void:
	_table = {}
	for key: String in cartas:
		_table[key] = cartas[key]
		var front: String = key.split(" // ")[0]
		if front != key and not cartas.has(front):
			_table[front] = cartas[key]
	_loaded = true


static func _ensure() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if parsed is Dictionary and (parsed as Dictionary).get("cartas") is Dictionary:
		set_table((parsed as Dictionary)["cartas"])


## O nome como a base guarda: Æ como "Ae", sem acento, apóstrofo reto, minúsculas e espaços simples.
static func key(name: String) -> String:
	var s: String = name.replace("Æ", "Ae").replace("æ", "ae").replace("’", "'").to_lower()
	var out := ""
	for i: int in s.length():
		var c: String = s[i]
		if PLAIN.has(c):
			out += Txt.of(PLAIN[c])
		elif s.unicode_at(i) < 128:
			out += c
	return " ".join(out.replace("\t", " ").split(" ", false))


## A cotação da carta pelo nome em inglês (o inteiro ou a primeira face): {brl, date, stale}, ou {} sem preço.
## `today`: "AAAA-MM-DD" (vazio = hoje).
static func of(name: String, today: String = "") -> Dictionary:
	_ensure()
	if name == "":
		return {}
	var k: String = key(name)
	var hit: Variant = _table.get(k, _table.get(k.split(" // ")[0]))
	if not hit is Array or (hit as Array).size() < 2:
		return {}
	var date: String = Txt.of(hit[1])
	var now: int = Time.get_unix_time_from_datetime_string(today if today != "" else Time.get_date_string_from_system())
	var stale: bool = Time.get_unix_time_from_datetime_string(date) < now - STALE_DAYS * 86400
	return {"brl": float(hit[0]), "date": date, "stale": stale}


## O preço de uma carta do inspetor: nada na virada para baixo, na ficha e na carta sem cotação.
static func of_card(card: Dictionary, today: String = "") -> Dictionary:
	if bool(card.get("faceDown", false)) or bool(card.get("token", false)):
		return {}
	return of(Txt.of(card.get("name")), today)


## "R$ 1.234,50".
static func brl_text(value: float) -> String:
	var parts: PackedStringArray = ("%.2f" % value).split(".")
	var whole: String = parts[0]
	var grouped := ""
	while whole.length() > 3:
		grouped = "." + whole.right(3) + grouped
		whole = whole.left(whole.length() - 3)
	return "R$ %s%s,%s" % [whole, grouped, parts[1]]


## "25/11/2026".
static func date_text(date: String) -> String:
	var p: PackedStringArray = date.split("-")
	return "%s/%s/%s" % [p[2], p[1], p[0]] if p.size() == 3 else date


## A dica da linha de preço (a mesma do navegador).
static func tip(price: Dictionary) -> String:
	return "O menor preço desta carta na LigaMagic, entre todas as edições, em %s. É uma referência: o preço muda com o tempo.%s" % [
		date_text(Txt.of(price["date"])), " Esta cotação tem mais de 30 dias." if bool(price["stale"]) else ""]
