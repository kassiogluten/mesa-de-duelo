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
				else:
					args.append(arg)
			total += 1
			var out: Variant = (port[0] as Script).callv(port[1], args)
			if not _same(out, c["out"]):
				failures.append("%s(%s)\n      esperava %s\n      veio     %s" % [fn, JSON.stringify(c["args"]).left(140), JSON.stringify(c["out"]), JSON.stringify(out)])
	print("    %d casos dourados conferidos" % total)
	check(total >= 100, "pelo menos 100 casos (veio %d)" % total)


static func _same(a: Variant, b: Variant) -> bool:
	return JSON.stringify(a, "", true) == JSON.stringify(b, "", true)
