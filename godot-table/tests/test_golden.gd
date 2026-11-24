# Fixtures dourados: cada chamada gravada das funções de texto da mesa do navegador (tests/golden/, npm run godot:golden)
# tem que dar a mesma saída no porte em GDScript.
extends "res://tests/test_case.gd"

const DIR := "res://tests/golden"
var PORTS: Dictionary = {
	"fixPossessives": [ForgeText, "fix_possessives"],
	"shortInstruction": [ShortInstruction, "short_instruction"],
	"validTargetKind": [ShortInstruction, "valid_target_kind"],
	"targetKind": [ShortInstruction, "target_kind"],
	"poolCost": [ShortInstruction, "pool_cost"],
	"targetProgress": [ShortInstruction, "target_progress"],
	"abilityKindLabel": [ShortInstruction, "ability_kind_label"],
	"paymentButtonLabels": [ShortInstruction, "payment_button_labels"],
	"counteredUnlessPaid": [ShortInstruction, "countered_unless_paid"],
	"voteRequest": [ShortInstruction, "vote_request"],
	"selectionRequest": [ForgeRequest, "selection_request"],
	"ptTitle": [ForgeRequest, "pt_title"],
	"turnBannerText": [PhaseText, "turn_banner_text"],
	"upcomingTurnsText": [PhaseText, "upcoming_turns_text"],
	"dayNightText": [PhaseText, "day_night_text"],
	"phaseGroupLabel": [PhaseText, "phase_group_label"],
	"normalizeStops": [PhaseText, "normalize_stops"],
	"turnTimeText": [MatchText, "turn_time_text"],
	"seriesText": [MatchText, "series_text"],
	"matchFormatName": [MatchText, "match_format_name"],
	"matchChips": [MatchText, "match_chips"],
	"waitStage": [MatchText, "wait_stage"],
	"waitNudgeText": [MatchText, "wait_nudge_text"],
	"waitClockTip": [MatchText, "wait_clock_tip"],
	"eventDescription": [EventText, "describe"],
	"historyTurns": [HistoryLog, "history_turns"],
	"listNames": [EventText, "list_names"],
	"parseDeckList": [DeckList, "parse"],
	"deckFingerprint": [DeckMerge, "fingerprint"],
	"planFirstLogin": [DeckMerge, "plan_first_login"],
	"countLabel": [CardCounts, "count_label"],
	"countSubject": [CardCounts, "count_subject"],
}
## Saídas guardadas enxutas (PROJECT de scripts/godot-golden-record.mjs): o porte passa pela mesma redução.
var PROJECT: Dictionary = {"historyTurns": HistoryLog.project}
## Como a vista gravada ({  }) faz a chave de cada chamada (VIEWS de scripts/godot-golden-record.mjs).
var VIEW_KEYS: Dictionary = {
	"state": func() -> String: return "",
	"label": func(c: Variant) -> String: return Txt.of((c as Dictionary).get("name")) if c is Dictionary else "",
	"findCard": func(id: Variant) -> String: return _num_key(id),
	"ptName": func(n: Variant) -> String: return Txt.of(n),
	"player": func(id: Variant) -> String: return "" if id == null else _num_key(id),
	"card": func(e: Dictionary) -> String: return _num_key(e.get("seq")),
	"cardById": func(id: Variant, e: Dictionary) -> String: return "%s:%s" % [_num_key(id), _num_key(e.get("seq"))],
	"describe": func(e: Dictionary) -> String: return _num_key(e.get("seq")),
}


func test_every_golden_case_matches_the_port() -> void:
	var files: PackedStringArray = DirAccess.get_files_at(DIR)
	check(not files.is_empty(), "há fixtures dourados em %s" % DIR)
	var total: int = 0
	for file: String in files:
		if not file.ends_with(".json"):
			continue
		var fn: String = file.trim_suffix(".json")
		if not PORTS.has(fn):
			failures.append("%s: sem porte em GDScript (acrescente em PORTS)" % fn)
			continue
		var port: Array = PORTS[fn]
		var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("%s/%s" % [DIR, file]))
		for entry: Variant in cases:
			var c: Dictionary = entry
			var names: Dictionary = c.get("names", {}) if c.get("names") is Dictionary else {}
			var args: Array = []
			for arg: Variant in c["args"]:
				if arg is Dictionary and (arg as Dictionary).has("$translate"):
					args.append(func(name: String) -> String: return Txt.of(names.get(name, name)))
				elif arg is Dictionary and (arg as Dictionary).has("$view"):
					args.append(_view((arg as Dictionary)["$view"]))
				else:
					args.append(arg)
			total += 1
			var out: Variant = (port[0] as Script).callv(port[1], args)
			if PROJECT.has(fn) and out != null:
				out = (PROJECT[fn] as Callable).call(out)
			if not _same(out, c["out"]):
				failures.append("%s(%s)\n      esperava %s\n      veio     %s" % [fn, JSON.stringify(c["args"]).left(140), JSON.stringify(c["out"]), JSON.stringify(out)])
	print("    %d casos dourados conferidos" % total)
	check(total >= 100, "pelo menos 100 casos (veio %d)" % total)


## Monta de volta a vista gravada: cada função devolve o resultado guardado para a chave da chamada.
func _view(saved: Dictionary) -> Dictionary:
	var view: Dictionary = {}
	var calls: Dictionary = saved.get("$calls", {})
	for key: Variant in saved:
		if key != "$calls":
			view[key] = saved[key]
	for fn: String in VIEW_KEYS:
		var recorded: Dictionary = calls.get(fn, {})
		var make_key: Callable = VIEW_KEYS[fn]
		view[fn] = func(a: Variant = null, b: Variant = null) -> Variant:
			var k: String = make_key.call() if make_key.get_argument_count() == 0 else (make_key.call(a) if make_key.get_argument_count() == 1 else make_key.call(a, b))
			return recorded.get(k)
	return view


## O número como o JavaScript o escreve numa chave (10, não 10.0); "undefined" se falta.
static func _num_key(value: Variant) -> String:
	if value == null:
		return "undefined"
	if (value is float or value is int) and float(value) == floorf(float(value)):
		return str(int(value))
	return str(value)


## Compara pelo JSON, com os inteiros e os números do JSON (sempre float no Godot) iguais.
static func _same(a: Variant, b: Variant) -> bool:
	return JSON.stringify(JSON.parse_string(JSON.stringify(a)), "", true) == JSON.stringify(JSON.parse_string(JSON.stringify(b)), "", true)
