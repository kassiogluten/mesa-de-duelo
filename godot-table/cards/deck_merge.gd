# Regras de junção dos decks da conta com os deste computador (porte de src/conta/merge.ts): na dúvida, ficam os dois.
class_name DeckMerge
extends RefCounted

const COPY_SUFFIX := " (deste aparelho)"


static func _entries(list: Variant) -> String:
	var counts: Dictionary = {}
	for e: Variant in (list if list is Array else []):
		var key: String = Txt.of((e as Dictionary).get("name")).strip_edges().to_lower()
		counts[key] = int(counts.get(key, 0)) + int((e as Dictionary).get("count", 0))
	var keys: Array = counts.keys()
	keys.sort_custom(func(a: String, b: String) -> bool: return _js_less(a, b))
	var out: PackedStringArray = []
	for key: String in keys:
		out.append("%d %s" % [int(counts[key]), key])
	return "|".join(out)


## A ordem do `<` do JavaScript entre textos (por unidade de código, não pela regra da língua).
static func _js_less(a: String, b: String) -> bool:
	var n: int = mini(a.length(), b.length())
	for i: int in n:
		if a.unicode_at(i) != b.unicode_at(i):
			return a.unicode_at(i) < b.unicode_at(i)
	return a.length() < b.length()


## O que o jogador vê do deck: nome, formato e cartas, sem id, datas nem histórico (deckFingerprint). Os outros
## argumentos são os do `map` do JavaScript (os fixtures dourados os gravam) e não mudam nada.
static func fingerprint(d: Dictionary, _index: Variant = null, _all: Variant = null) -> String:
	return "#".join(PackedStringArray([Txt.of(d.get("name")).strip_edges(), Txt.of(d.get("format")), _entries(d.get("cards")),
		_entries(d.get("sideboard")), _entries(d.get("commanders"))]))


static func same_deck(a: Dictionary, b: Dictionary) -> bool:
	return fingerprint(a) == fingerprint(b)


## A versão deste computador que ficou de lado num conflito: outro id e o nome marcado (deviceCopy).
static func device_copy(deck: Dictionary, id: String, now: String) -> Dictionary:
	var copy: Dictionary = deck.duplicate(true)
	var name: String = Txt.of(deck.get("name"))
	copy["id"] = id
	copy["name"] = name if name.ends_with(COPY_SUFFIX) else name + COPY_SUFFIX
	copy["updatedAt"] = now
	return copy


## Compara este computador com a conta no primeiro login (planFirstLogin): {onlyLocal, conflicts: [{local, account}]}.
static func plan_first_login(local: Array, account: Array) -> Dictionary:
	var by_id: Dictionary = {}
	var prints: Dictionary = {}
	for d: Dictionary in account:
		by_id[d.get("id")] = d
		prints[fingerprint(d)] = true
	var plan: Dictionary = {"onlyLocal": [], "conflicts": []}
	for deck: Dictionary in local:
		if bool(deck.get("builtin", false)):
			continue
		if by_id.has(deck.get("id")):
			var same: Dictionary = by_id[deck.get("id")]
			if not same_deck(deck, same) and not prints.has(fingerprint(deck)):
				(plan["conflicts"] as Array).append({"local": deck, "account": same})
		elif not prints.has(fingerprint(deck)):
			(plan["onlyLocal"] as Array).append(deck)
	return plan


## "Juntar à conta" (joinAccount): a ordem é a deste computador; no conflito a versão da conta fica com o id e a daqui
## vira cópia logo depois; os decks que só a conta tem vão para o fim. {decks, upload}.
static func join_account(local: Array, account: Array, new_id: Callable, now: String) -> Dictionary:
	var plan: Dictionary = plan_first_login(local, account)
	var only: Dictionary = {}
	for d: Dictionary in plan["onlyLocal"]:
		only[d.get("id")] = true
	var conflicts: Dictionary = {}
	for c: Dictionary in plan["conflicts"]:
		conflicts[(c["local"] as Dictionary).get("id")] = c
	var by_id: Dictionary = {}
	var prints: Dictionary = {}
	for d: Dictionary in account:
		by_id[d.get("id")] = d
		if not prints.has(fingerprint(d)):
			prints[fingerprint(d)] = d
	var decks: Array = []
	var upload: Array = []
	var used: Dictionary = {}
	for deck: Dictionary in local:
		if bool(deck.get("builtin", false)):
			continue
		if only.has(deck.get("id")):
			decks.append(deck)
			upload.append(deck)
			continue
		var conflict: Variant = conflicts.get(deck.get("id"))
		var theirs: Dictionary = (conflict as Dictionary)["account"] if conflict is Dictionary \
			else by_id.get(deck.get("id"), prints.get(fingerprint(deck), {}))
		if not used.has(theirs.get("id")):
			decks.append(theirs)
			used[theirs.get("id")] = true
		if conflict is Dictionary:
			var copy: Dictionary = device_copy(deck, new_id.call(), now)
			decks.append(copy)
			upload.append(copy)
	for deck: Dictionary in account:
		if not used.has(deck.get("id")):
			decks.append(deck)
	return {"decks": decks, "upload": upload}


## Uma mudança daqui que a conta recusou porque o deck mudou em outro aparelho (resolveConflict): editar vence apagar,
## duas edições diferentes ficam as duas. {keep, resend, copy}, cada um um deck ou null.
static func resolve_conflict(local: Variant, account: Variant, new_id: Callable, now: String) -> Dictionary:
	if local == null:
		return {"keep": account, "resend": null, "copy": null}
	if account == null:
		return {"keep": local, "resend": local, "copy": null}
	if same_deck(local, account):
		return {"keep": account, "resend": null, "copy": null}
	return {"keep": account, "resend": null, "copy": device_copy(local, new_id.call(), now)}


## Aplica o que mudou em outro aparelho (applyRemote): [{id, deck} | {id, deleted: true}]. Decks com mudança daqui
## esperando envio ficam como estão; deck novo entra no começo.
static func apply_remote(local: Array, changes: Array, pending: Dictionary) -> Array:
	var decks: Array = local.duplicate()
	for change: Dictionary in changes:
		var id: Variant = change.get("id")
		if pending.has(id):
			continue
		var index: int = -1
		for i: int in decks.size():
			if (decks[i] as Dictionary).get("id") == id:
				index = i
				break
		if bool(change.get("deleted", false)):
			if index >= 0:
				decks.remove_at(index)
		elif index >= 0:
			decks[index] = change["deck"]
		else:
			decks.push_front(change["deck"])
	return decks
