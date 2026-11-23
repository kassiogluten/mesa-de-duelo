# A ponta da seta que segue o mouse gruda no alvo válido: o que está sob o mouse ou, perto dele, o mais próximo; e o
# Tab passa pelos alvos na ordem da tela (sem cena, para os testes).
class_name TargetSnap
extends RefCounted

## Até quantos pixels da tela (na resolução da mesa, 1920×1080) a ponta gruda num alvo que não está sob o mouse.
const RADIUS := 90.0


## O alvo em que a ponta gruda: `hovered` (a chave do que está sob o mouse) se for um dos candidatos; senão o candidato
## mais perto do mouse dentro de `radius`; senão null. `candidates`: [{key, screen: Vector2}].
static func pick(mouse: Vector2, candidates: Array, hovered: Variant = null, radius: float = RADIUS) -> Variant:
	var best: Variant = null
	var best_distance: float = radius
	for raw: Variant in candidates:
		var c: Dictionary = raw
		if hovered != null and typeof(c["key"]) == typeof(hovered) and c["key"] == hovered:
			return hovered
		var d: float = mouse.distance_to(c["screen"])
		if d <= best_distance:
			best_distance = d
			best = c["key"]
	return best


## Os candidatos na ordem do Tab: da esquerda para a direita e, na mesma coluna, de cima para baixo.
static func order(candidates: Array) -> Array:
	var sorted: Array = candidates.duplicate()
	sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var pa: Vector2 = a["screen"]
		var pb: Vector2 = b["screen"]
		if absf(pa.x - pb.x) > 24.0:
			return pa.x < pb.x
		return pa.y < pb.y)
	return sorted.map(func(c: Dictionary) -> Variant: return c["key"])


## O próximo alvo do Tab (`step` 1) ou do Shift+Tab (-1), dando a volta; o primeiro (ou o último) quando não há foco.
static func cycle(keys: Array, current: Variant, step: int) -> Variant:
	if keys.is_empty():
		return null
	var index: int = -1
	for i: int in keys.size():
		if typeof(keys[i]) == typeof(current) and keys[i] == current:
			index = i
	if index < 0:
		return keys[0] if step > 0 else keys[keys.size() - 1]
	return keys[posmod(index + step, keys.size())]
