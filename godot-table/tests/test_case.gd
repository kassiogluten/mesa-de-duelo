# Base dos testes da mesa no PC: cada método test_* de um arquivo tests/test_*.gd roda isolado (tools/run_tests.gd).
extends RefCounted

var failures: PackedStringArray = []
## Teste com await: ponha false no começo e true no fim (o executor espera, até 10 s).
var done: bool = true


func check(ok: bool, what: String) -> void:
	if not ok:
		failures.append(what)


func check_eq(actual: Variant, expected: Variant, what: String) -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		failures.append("%s: esperava %s, veio %s" % [what, var_to_str(expected), var_to_str(actual)])
