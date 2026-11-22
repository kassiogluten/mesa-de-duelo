# Texto de um valor do JSON do servidor sem quebrar com null (String(null) é erro no GDScript).
class_name Txt
extends RefCounted


static func of(value: Variant) -> String:
	if value is String:
		return value
	if value == null:
		return ""
	return str(value)
