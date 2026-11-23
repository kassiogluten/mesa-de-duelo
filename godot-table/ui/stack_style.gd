# Aparência comum da pilha (painel, lista, pílula recolhida e galeria): a cor e o ícone de cada tipo de item, o selo do tipo e
# o brilho de faíscas que acompanha a carta quando ela chega à pilha ou resolve.
class_name StackStyle
extends RefCounted

const GOLD := Color("#f0b84a")
## Mágica violeta, habilidade turquesa, gatilho dourado (as mesmas cores da presença 3D da pilha).
const KIND_COLORS := {"spell": Color("#8f74ff"), "ability": Color("#3fb6c9"), "trigger": Color("#f0b84a")}
## Os ícones do selo (os mesmos traços de STACK_KINDS em src/ui/stackPresentation.ts, viewBox 16).
const KIND_ICONS := {
	"spell": "<path d=\"M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z\"/>",
	"ability": "<path d=\"M8 2.5a5.5 5.5 0 1 0 5.2 3.7l-1.9.7A3.5 3.5 0 1 1 8 4.5V7l3.5-3.5L8 0Z\"/>",
	"trigger": "<path d=\"M9.5 1 3 9h4l-1 6 6.5-8h-4Z\"/>",
}
## Cor da borda de quem controla o item: azul o seu, avermelhado o do oponente.
const MINE := Color(0.45, 0.65, 1.0)
const THEIRS := Color(1.0, 0.5, 0.45)
## A grade da galeria e o ícone de abrir a galeria (quatro cartas), em traço.
const GALLERY_ICON := "<rect x=\"3\" y=\"4\" width=\"7\" height=\"9\" rx=\"1.5\"/><rect x=\"14\" y=\"4\" width=\"7\" height=\"9\" rx=\"1.5\"/><path d=\"M5 17h14M7 20.5h10\"/>"

static var _icons: Dictionary = {}


## A cor do tipo do item (o selo e o ícone).
static func kind_color(item: Dictionary) -> Color:
	return KIND_COLORS.get(StackText.kind_of(item), GOLD)


## A cor do próprio item, a mesma da presença 3D da carta na pilha (a da carta; dourada nos gatilhos): a moldura, as faíscas e
## as setas do item sob o mouse.
static func item_color(item: Dictionary) -> Color:
	return StackPresence._color_of(item)


## Dá para responder: a vez é sua e o topo é de outro jogador (a mesma regra da presença 3D).
static func can_respond(state: Dictionary) -> bool:
	var stack: Array = state.get("stack", []) if state.get("stack") is Array else []
	var input: Dictionary = state.get("input", {}) if state.get("input") is Dictionary else {}
	return not stack.is_empty() and bool(input.get("priority", false)) and int((stack[0] as Dictionary).get("controller", -1)) != int(state.get("you", 0))


## O ícone cheio do tipo do item em `px` pixels (branco: a cor vem do modulate); null se o tipo não tem ícone.
static func kind_icon(kind: String, px: int = 32) -> Texture2D:
	if not KIND_ICONS.has(kind):
		return null
	var key: String = "%s|%d" % [kind, px]
	if _icons.has(key):
		return _icons[key]
	var svg: String = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\" width=\"16\" height=\"16\" fill=\"#ffffff\">%s</svg>" % KIND_ICONS[kind]
	var image := Image.new()
	var tex: Texture2D = ImageTexture.create_from_image(image) if image.load_svg_from_string(svg, px / 16.0) == OK else null
	_icons[key] = tex
	return tex


## O selo do tipo: o ícone na cor do tipo e o texto ("Mágica · Flashback"), numa pílula escura de borda colorida.
static func kind_badge(font_size: int = 15) -> PanelContainer:
	var badge := PanelContainer.new()
	badge.name = "KindBadge"
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := ModalStyle.box(Color(0.04, 0.05, 0.09, 0.96), 14, Color(1, 1, 1, 0.3), 1)
	style.content_margin_left = 10
	style.content_margin_right = 14
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 8
	badge.add_theme_stylebox_override("panel", style)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 7)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(row)
	var icon := TextureRect.new()
	icon.name = "Icon"
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(font_size + 2, font_size + 2)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var label := ModalStyle.label(font_size, Color.WHITE)
	label.name = "Text"
	label.uppercase = true
	row.add_child(label)
	return badge


## Pinta o selo do tipo para um item (some quando não há tipo nem forma de conjurar).
static func paint_kind_badge(badge: PanelContainer, item: Dictionary) -> void:
	var kind: String = StackText.kind_of(item)
	var color: Color = kind_color(item)
	var text: String = StackText.badge_text(item)
	var icon: TextureRect = badge.find_child("Icon", true, false)
	var label: Label = badge.find_child("Text", true, false)
	icon.texture = kind_icon(kind, 40)
	icon.modulate = color.lightened(0.25)
	icon.visible = icon.texture != null
	label.text = text
	label.add_theme_color_override("font_color", color.lightened(0.45))
	var style: StyleBoxFlat = badge.get_theme_stylebox("panel")
	style.border_color = Color(color, 0.85)
	style.shadow_color = Color(color.darkened(0.3), 0.45)
	badge.visible = text != ""


## Faíscas na cor do item saindo das bordas do retângulo `rect` (a carta que chegou) ou subindo dele (`rising`, a que
## resolveu). Somem sozinhas; no nível de efeitos leve, menos faíscas.
static func sparks(parent: Control, rect: Rect2, color: Color, rising: bool = false) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	var p := CPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 0.85 if not rising else 0.55
	p.amount = int((26 if rising else 34) * (0.5 if Fx.quality == 0 else (1.0 if Fx.quality == 1 else 1.4)))
	p.lifetime = 0.9 if rising else 0.6
	p.local_coords = false
	p.position = rect.get_center()
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = rect.size / 2.0 + Vector2(4, 4)
	p.direction = Vector2(0, -1)
	p.spread = 35.0 if rising else 180.0
	p.gravity = Vector2(0, -60) if rising else Vector2(0, 40)
	p.initial_velocity_min = 40.0 if rising else 70.0
	p.initial_velocity_max = 140.0 if rising else 220.0
	p.damping_min = 40.0
	p.damping_max = 90.0
	p.scale_amount_min = 1.5
	p.scale_amount_max = 4.0
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color.lightened(0.6), 1.0))
	ramp.set_color(1, Color(color, 0.0))
	ramp.add_point(0.4, Color(color.lightened(0.2), 0.9))
	p.color_ramp = ramp
	var curve := Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(1, 0.2))
	p.scale_amount_curve = curve
	var additive := CanvasItemMaterial.new()
	additive.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = additive
	parent.add_child(p)
	p.emitting = true
	var tween := p.create_tween()
	tween.tween_interval(p.lifetime + 0.2)
	tween.tween_callback(p.queue_free)
