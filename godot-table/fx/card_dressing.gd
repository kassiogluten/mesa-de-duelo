# Acabamento das cartas da mesa: o halo macio por baixo da carta acesa (pode jogar, escolhível, selecionada), que vaza
# para fora da borda. Olha as cartas da mesa algumas vezes por segundo. O foil das raras e míticas não aparece na mesa
# (só ao ver a carta de perto, no inspetor); `foil_level` diz o nível de cada raridade para quem mostra.
class_name CardDressing
extends Node

const CARD_SHADER := preload("res://table/card.gdshader")
## Quanto o halo passa da borda da carta (unidades da mesa; a carta tem 0,63 × 0,88).
const HALO_MARGIN := 0.14
## Olhadas por segundo nas cartas (a carta acende ou apaga com o prompt, não a cada quadro).
const RATE := 12.0

var table: TableView
var _wait: float = 0.0
static var _halo_shader: Shader
static var _halo_mesh: PlaneMesh


func _process(delta: float) -> void:
	_wait -= delta
	if _wait > 0.0 or table == null:
		return
	_wait = 1.0 / RATE
	for child: Node in table.get_children():
		if child is CardNode:
			dress(child as CardNode, table.catalog)


## Põe na carta o halo (se ela está acesa) e garante a carta da mesa sem foil.
static func dress(node: CardNode, _catalog: CardCatalog = null) -> void:
	var material: ShaderMaterial = material_of(node)
	if material == null:
		return
	var glow: Variant = material.get_shader_parameter("glow")
	var strength: float = (glow as Vector4).w if glow is Vector4 else 0.0
	var halo: MeshInstance3D = node.get_meta("halo") as MeshInstance3D if node.has_meta("halo") else null
	if strength > 0.01:
		if halo == null or not is_instance_valid(halo):
			halo = _new_halo(node)
		halo.visible = true
		var g: Vector4 = glow
		(halo.material_override as ShaderMaterial).set_shader_parameter("color", Color(g.x, g.y, g.z, g.w))
		var style: Variant = material.get_shader_parameter("glow_style")
		(halo.material_override as ShaderMaterial).set_shader_parameter("style", int(style) if style != null else 0)
	elif halo and is_instance_valid(halo):
		halo.visible = false
	# Na partida, nada de foil no campo: ele distrai numa mesa cheia (pedido do jogador). Só no inspetor.
	if material.get_shader_parameter("foil") != 0.0:
		material.set_shader_parameter("foil", 0.0)


## A raridade da carta: a do estado, se vier, ou a do catálogo (Scryfall); "" quando não se sabe.
static func rarity_of(card: Dictionary, catalog: CardCatalog = null) -> String:
	if card.is_empty() or bool(card.get("faceDown", false)) or bool(card.get("token", false)):
		return ""
	if card.has("rarity"):
		return Txt.of(card["rarity"])
	if catalog != null and Txt.of(card.get("name")) != "":
		return Txt.of(catalog.info(Txt.of(card["name"])).get("rarity", ""))
	return ""


## O foil de cada raridade: nada nas comuns e incomuns, um brilho na rara, o arco-íris na mítica (e nas especiais).
static func foil_level(rarity: String) -> float:
	match rarity:
		"rare":
			return 1.0
		"mythic", "special", "bonus":
			return 2.0
	return 0.0


## O material da carta (o ShaderMaterial com o shader da carta), onde quer que esteja dentro dela.
static func material_of(node: Node) -> ShaderMaterial:
	if node == null:
		return null
	if node.has_meta("card_material"):
		var cached: Variant = node.get_meta("card_material")
		if cached is ShaderMaterial:
			return cached
	for child: Node in node.find_children("*", "MeshInstance3D", true, false):
		var material: Material = (child as MeshInstance3D).material_override
		if material is ShaderMaterial and (material as ShaderMaterial).shader == CARD_SHADER:
			node.set_meta("card_material", material)
			return material
	return null


## O desenho da carta (o que sobe na mão e inclina): o primeiro Node3D filho, ou a própria carta.
static func visual_of(node: Node3D) -> Node3D:
	if node == null:
		return null
	var visual: Variant = node.get("_visual")
	return visual if visual is Node3D else node


static func _new_halo(node: CardNode) -> MeshInstance3D:
	var halo := MeshInstance3D.new()
	if _halo_mesh == null:
		_halo_mesh = PlaneMesh.new()
		_halo_mesh.size = CardNode.SIZE + Vector2.ONE * HALO_MARGIN * 2.0
	halo.mesh = _halo_mesh
	var material := ShaderMaterial.new()
	material.shader = _halo()
	halo.material_override = material
	halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Logo abaixo da face: a própria carta cobre o miolo, só a borda de fora aparece.
	halo.position = Vector3(0, -0.004, 0)
	visual_of(node).add_child(halo)
	node.set_meta("halo", halo)
	return halo


static func _halo() -> Shader:
	if _halo_shader == null:
		_halo_shader = Shader.new()
		_halo_shader.code = """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;
uniform vec4 color : source_color = vec4(0.3, 0.75, 1.0, 1.0);
uniform vec2 card = vec2(0.63, 0.88);
uniform float margin = 0.14;
// 0 o halo que respira; 1 o "pode jogar": uma aura macia com ondas correndo pelo contorno e duas luzes viajando.
uniform int style = 0;
float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void fragment() {
	vec2 size = card + vec2(margin * 2.0);
	vec2 p = (UV - 0.5) * size;
	float d = box(p, card * 0.5, 0.035);
	// Luz que cai como a de uma borda acesa de verdade: um fio forte junto da carta e uma névoa larga e macia, que some
	// antes da beira da malha (sem o retângulo dela aparecer).
	float outside = step(0.0, d);
	float edge_fade = smoothstep(margin, margin * 0.5, d);
	float breathe = 0.8 + 0.2 * sin(TIME * 3.2);
	float core = exp(-d / 0.014);
	float mist = exp(-d / 0.05);
	ALBEDO = mix(color.rgb, vec3(1.0), 0.18 * core) * 1.15;
	ALPHA = clamp(core * 0.55 + mist * 0.5, 0.0, 1.0) * outside * edge_fade * color.a * 0.8 * breathe;
	if (style == 1) {
		// Aura limpa: um brilho macio em volta, ondas lentas correndo pelo contorno e duas luzes viajando por ele.
		float a = atan(p.y, p.x);
		float waves = 0.62 + 0.24 * sin(a * 3.0 - TIME * 1.4) + 0.14 * sin(a * 5.0 + TIME * 0.9);
		float soft = exp(-d / (0.018 + 0.012 * waves)) * step(0.0, d);
		float comet = pow(0.5 + 0.5 * sin(a - TIME * 1.8), 36.0) + pow(0.5 + 0.5 * sin(a + 3.14159 - TIME * 1.8), 36.0);
		// Some antes da borda da malha (senão o retângulo dela aparece).
		float edge_fade = smoothstep(margin * 0.6, margin * 0.25, d);
		float aura = (soft * waves * 0.7 + comet * exp(-d / 0.014) * step(0.0, d) * 0.6) * edge_fade;
		ALBEDO = mix(color.rgb, vec3(1.0), 0.04 + 0.4 * comet) * 1.1;
		ALPHA = clamp(aura, 0.0, 1.0) * color.a * 0.7;
	}
}
"""
	return _halo_shader
