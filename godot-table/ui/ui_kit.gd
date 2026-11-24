# Peças comuns da interface na direção "Angular" (roadmap 150, docs/direcao-visual-mesa-pc.md): painel, título com a
# barra dourada, botões e campos com dois cantos cortados em cada estado, com a letra condensada em versalete.
class_name UiKit
extends RefCounted

enum Kind { PRIMARY, SECONDARY, DANGER, GHOST }

const GOLD := Color("#f0b84a")
const GOLD_LIGHT := Color("#ffd27a")
const INK := Color("#eef1f8")
const MUTED := Color(0.78, 0.83, 0.92, 0.7)
const DARK_INK := Color("#1d1405")
const PANEL := Color(0.045, 0.06, 0.1, 0.97)
const SECONDARY_FILL := Color("#1c2436")
const DANGER_FILL := Color("#b9452f")
const DISABLED_FILL := Color(0.16, 0.18, 0.23, 0.9)
const DISABLED_INK := Color(0.72, 0.75, 0.82, 0.55)
## Cortes dos painéis (cima-direita e baixo-esquerda) e dos botões (cima-esquerda e baixo-direita).
const PANEL_CUT := 22.0
const BUTTON_CUT := 10.0
## O versalete é menor que a maiúscula: a letra cresce nessa proporção para ficar do tamanho pedido.
const CAPS_SCALE := 1.3

static var _semibold: Font
static var _bold: Font


## A letra dos botões (Barlow Condensed SemiBold, em versalete: todo texto sai em caixa alta, mesmo o trocado depois).
static func button_font() -> Font:
	if _semibold == null:
		_semibold = _face("res://ui/fonts/BarlowCondensed-SemiBold.ttf")
	return _semibold


## A letra dos títulos (Barlow Condensed Bold, em versalete).
static func title_font() -> Font:
	if _bold == null:
		_bold = _face("res://ui/fonts/BarlowCondensed-Bold.ttf")
	return _bold


static func _face(path: String) -> Font:
	var face := FontVariation.new()
	face.base_font = load(path) as Font
	var server: TextServer = TextServerManager.get_primary_interface()
	face.opentype_features = {server.name_to_tag("smcp"): 1, server.name_to_tag("c2sc"): 1}
	return face


## O tamanho da letra condensada que fica da altura de uma maiúscula de `size` px.
static func caps_size(size: int) -> int:
	return roundi(size * CAPS_SCALE)


## O painel das janelas: chapado, filete claro fino, cortes em dois cantos e sombra macia.
static func panel() -> CutBox:
	var box := CutBox.new()
	box.fill = PANEL
	box.border = Color(1, 1, 1, 0.12)
	box.cuts = PackedFloat32Array([0.0, PANEL_CUT, 0.0, PANEL_CUT])
	box.shadow_size = 34.0
	box.content_margin_left = 36
	box.content_margin_right = 36
	box.content_margin_top = 30
	box.content_margin_bottom = 26
	return box


## Título em caixa alta, com a barra dourada à esquerda.
static func title(text: String, size: int = 32) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bar := ColorRect.new()
	bar.name = "Bar"
	bar.color = GOLD
	bar.custom_minimum_size = Vector2(4, 0)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(bar)
	var heading := Label.new()
	heading.name = "Title"
	heading.text = text
	heading.add_theme_font_override("font", title_font())
	heading.add_theme_font_size_override("font_size", caps_size(size))
	heading.add_theme_color_override("font_color", Color.WHITE)
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(heading)
	return row


static func button(text: String, kind: Kind = Kind.SECONDARY, min_width: float = 0.0, height: float = 48.0) -> Button:
	var out := Button.new()
	out.text = text
	out.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	out.custom_minimum_size = Vector2(min_width, height)
	out.add_theme_font_size_override("font_size", 20 if height >= 56.0 else (18 if height >= 44.0 else 15))
	style_button(out, kind)
	return out


## Pinta um botão de um tipo em todos os estados, com a letra condensada em versalete. O tamanho de letra que o
## botão já tinha vira o da maiúscula (cresce CAPS_SCALE); pintar de novo (trocar o tipo) não cresce outra vez.
static func style_button(out: Button, kind: Kind) -> void:
	if not out.has_meta("caps_size"):
		out.set_meta("caps_size", out.get_theme_font_size("font_size") if out.has_theme_font_size_override("font_size") else 16)
	out.add_theme_font_size_override("font_size", caps_size(int(out.get_meta("caps_size"))))
	out.add_theme_font_override("font", button_font())
	for state_name: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		out.add_theme_stylebox_override(state_name, button_box(kind, state_name))
	var ink: Color = DARK_INK if kind == Kind.PRIMARY else INK
	for slot: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		out.add_theme_color_override(slot, ink)
	out.add_theme_color_override("font_disabled_color", DISABLED_INK)


## A caixa de um botão num estado: "normal", "hover" (clareia, filete e brilho dourados), "pressed" (escurece),
## "disabled" (cinza) ou "focus" (só um contorno claro por fora, diferente do mouse em cima, para o teclado).
static func button_box(kind: Kind, state_name: String) -> CutBox:
	var box := CutBox.new()
	box.cuts = PackedFloat32Array([BUTTON_CUT, 0.0, BUTTON_CUT, 0.0])
	box.content_margin_left = 22
	box.content_margin_right = 22
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	if state_name == "focus":
		box.fill = Color(0, 0, 0, 0)
		box.border = Color(1, 1, 1, 0.85)
		box.border_width = 2.0
		return box
	match kind:
		Kind.PRIMARY:
			box.fill = GOLD
		Kind.DANGER:
			box.fill = DANGER_FILL
		Kind.GHOST:
			box.fill = Color(1, 1, 1, 0.0)
			box.border = Color(1, 1, 1, 0.22)
		_:
			box.fill = SECONDARY_FILL
			box.border = Color(1, 1, 1, 0.1)
	match state_name:
		"hover":
			box.fill = box.fill.lightened(0.14) if kind != Kind.GHOST else Color(1, 1, 1, 0.06)
			box.border = GOLD_LIGHT if kind != Kind.PRIMARY else Color(1, 1, 1, 0.6)
			# O discreto não tem fundo: o brilho apareceria por dentro dele.
			if kind != Kind.GHOST:
				box.glow = GOLD
				box.glow_size = 10.0
		"pressed":
			box.fill = box.fill.darkened(0.16) if kind != Kind.GHOST else Color(1, 1, 1, 0.1)
		"disabled":
			box.fill = DISABLED_FILL
			box.border = Color(0, 0, 0, 0)
	return box


## A caixa de um campo de escolha (formato, deck): escuro, filete fino que fica dourado com o mouse, cortes pequenos.
static func field_box(state_name: String) -> CutBox:
	var box := CutBox.new()
	box.cuts = PackedFloat32Array([6.0, 0.0, 6.0, 0.0])
	box.content_margin_left = 14
	box.content_margin_right = 14
	match state_name:
		"hover":
			box.fill = Color(0.07, 0.09, 0.15, 0.92)
			box.border = Color(GOLD, 0.6)
		"pressed":
			box.fill = Color(0.03, 0.04, 0.07, 0.92)
			box.border = Color(GOLD, 0.8)
		"disabled":
			box.fill = Color(0.04, 0.055, 0.094, 0.5)
			box.border = Color(1, 1, 1, 0.05)
		_:
			box.fill = Color(0.04, 0.055, 0.094, 0.85)
			box.border = Color(1, 1, 1, 0.12)
	return box


## Um painel menor, sem sombra (o da partida na tela inicial, listas abertas): mesmo corte do painel das janelas.
static func inset_panel(fill: Color = Color(0.045, 0.06, 0.1, 0.85), cut: float = 14.0) -> CutBox:
	var box := CutBox.new()
	box.fill = fill
	box.border = Color(1, 1, 1, 0.1)
	box.cuts = PackedFloat32Array([0.0, cut, 0.0, cut])
	return box
