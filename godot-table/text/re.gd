# Expressões regulares no jeito do JavaScript da mesa do navegador: compila uma vez e testa, casa, troca e divide.
# Padrões com (?i) no começo ignoram maiúsculas, como o /i; use strings cruas (r"...") para as barras.
class_name Re
extends RefCounted

static var _cache: Dictionary = {}


static func compile(pattern: String) -> RegEx:
	var re: RegEx = _cache.get(pattern)
	if re == null:
		re = RegEx.create_from_string(pattern)
		assert(re != null and re.is_valid(), "expressão inválida: " + pattern)
		_cache[pattern] = re
	return re


static func test(pattern: String, text: String) -> bool:
	return compile(pattern).search(text) != null


## O primeiro casamento, ou null.
static func find(pattern: String, text: String) -> RegExMatch:
	return compile(pattern).search(text)


## Um grupo do casamento ("" se o grupo não casou).
static func group(m: RegExMatch, index: int) -> String:
	return m.get_string(index) if m != null and m.get_start(index) >= 0 else ""


## O grupo casou (o `m[i] !== undefined` do JavaScript)?
static func has(m: RegExMatch, index: int) -> bool:
	return m != null and m.get_start(index) >= 0


## Troca todas as ocorrências ($1, $2… e $0 para o trecho inteiro).
static func replace_all(pattern: String, text: String, replacement: String) -> String:
	return compile(pattern).sub(text, replacement, true)


## Troca só a primeira ocorrência.
static func replace_first(pattern: String, text: String, replacement: String) -> String:
	return compile(pattern).sub(text, replacement, false)


## Divide pelo padrão (o `split(/re/)` do JavaScript).
static func split(pattern: String, text: String) -> PackedStringArray:
	var out: PackedStringArray = []
	var at: int = 0
	for m: RegExMatch in compile(pattern).search_all(text):
		if m.get_end() == m.get_start():
			continue
		out.append(text.substr(at, m.get_start() - at))
		at = m.get_end()
	out.append(text.substr(at))
	return out


## As linhas sem espaços nas pontas e sem as vazias.
static func lines(text: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for line: String in text.split("\n"):
		var trimmed: String = line.strip_edges()
		if trimmed != "":
			out.append(trimmed)
	return out


## Escapa o texto para entrar num padrão.
static func escape(text: String) -> String:
	# Na troca do PCRE2 a barra é literal e só o $ é especial: r"\$0" põe uma barra antes do trecho.
	return replace_all(r"[.*+?^${}()|\[\]\\]", text, r"\$0")
