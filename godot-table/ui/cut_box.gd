# Caixa da direção "Angular" (roadmap 150): fundo chapado com cantos cortados em reta, só nos cantos pedidos, filete,
# brilho e sombra, desenhada em código. Serve de StyleBox para painéis, botões e o que mais aceitar uma.
class_name CutBox
extends StyleBox

@export var fill: Color = Color.BLACK
@export var border: Color = Color(0, 0, 0, 0)
@export var border_width: float = 1.0
## Corte de cada canto, em px: cima-esquerda, cima-direita, baixo-direita e baixo-esquerda (0 = canto reto).
@export var cuts: PackedFloat32Array = PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
## Brilho em volta (mouse em cima).
@export var glow: Color = Color(0, 0, 0, 0)
@export var glow_size: float = 0.0
## Sombra macia por baixo (painéis).
@export var shadow_size: float = 0.0
@export var shadow_offset: Vector2 = Vector2(0, 12)

const LAYERS := 10


## O contorno da caixa em `rect`, crescido `grow` px para fora (os cortes crescem junto, paralelos).
func shape(rect: Rect2, grow: float = 0.0) -> PackedVector2Array:
	var r: Rect2 = rect.grow(grow)
	var c: PackedFloat32Array = PackedFloat32Array()
	for i: int in 4:
		var cut: float = cuts[i] if i < cuts.size() else 0.0
		c.append(minf(cut + grow * 0.4142, minf(r.size.x, r.size.y) * 0.5) if cut > 0.0 else 0.0)
	var points := PackedVector2Array()
	points.append(Vector2(r.position.x + c[0], r.position.y))
	points.append(Vector2(r.end.x - c[1], r.position.y))
	if c[1] > 0.0:
		points.append(Vector2(r.end.x, r.position.y + c[1]))
	points.append(Vector2(r.end.x, r.end.y - c[2]))
	if c[2] > 0.0:
		points.append(Vector2(r.end.x - c[2], r.end.y))
	points.append(Vector2(r.position.x + c[3], r.end.y))
	if c[3] > 0.0:
		points.append(Vector2(r.position.x, r.end.y - c[3]))
	if c[0] > 0.0:
		points.append(Vector2(r.position.x, r.position.y + c[0]))
	return points


func _draw(item: RID, rect: Rect2) -> void:
	for i: int in LAYERS:
		var t: float = float(i + 1) / LAYERS
		var fade: float = (1.0 - t) * (1.0 - t)
		if shadow_size > 0.0:
			RenderingServer.canvas_item_add_polygon(item, shape(Rect2(rect.position + shadow_offset, rect.size), shadow_size * t), PackedColorArray([Color(0, 0, 0, 0.18 * fade)]))
		if glow_size > 0.0 and glow.a > 0.0:
			RenderingServer.canvas_item_add_polygon(item, shape(rect, glow_size * t), PackedColorArray([Color(glow, glow.a * 0.3 * fade)]))
	var outline: PackedVector2Array = shape(rect)
	if fill.a > 0.0:
		RenderingServer.canvas_item_add_polygon(item, outline, PackedColorArray([fill]))
	if border.a > 0.0 and border_width > 0.0:
		# O filete corre por dentro da borda, para não vazar da caixa.
		var inner: PackedVector2Array = shape(rect, -border_width * 0.5)
		inner.append(inner[0])
		RenderingServer.canvas_item_add_polyline(item, inner, PackedColorArray([border]), border_width, true)
