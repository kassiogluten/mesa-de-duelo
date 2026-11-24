# O fundo de cena das telas do menu (roadmap 150), no lugar da cor chapada: o azul quase preto da tela inicial com uma
# luz quente que respira devagar, a arte do seu deck desfocada por trás (quando há) e uma poeira dourada subindo, com a
# vinheta nas bordas. Leve: um shader de tela e poucas partículas; nos efeitos "leve", sem a poeira.
class_name MenuBackdrop
extends Control

const SHADER := """
shader_type canvas_item;
uniform sampler2D art : filter_linear_mipmap, repeat_disable;
uniform float has_art = 0.0;
uniform vec4 base : source_color = vec4(0.024, 0.035, 0.07, 1.0);
uniform vec4 glow : source_color = vec4(0.95, 0.68, 0.28, 1.0);
uniform vec2 aspect = vec2(1.78, 1.0);
void fragment() {
	vec3 color = base.rgb;
	// A arte do deck, bem desfocada (pelas mipmaps), escurecida e só no meio-alto da tela.
	if (has_art > 0.5) {
		vec3 painted = textureLod(art, UV, 6.0).rgb;
		float fade = smoothstep(1.05, 0.15, distance(UV, vec2(0.45, 0.35)) * 1.4);
		color = mix(color, painted * 0.42, fade * 0.8);
	}
	// A luz quente que respira: uma poça larga no alto, que anda um pouco.
	vec2 p = (UV - vec2(0.5 + sin(TIME * 0.11) * 0.08, 0.18 + cos(TIME * 0.07) * 0.04)) * aspect;
	float light = exp(-dot(p, p) * 1.6) * (0.16 + 0.04 * sin(TIME * 0.5));
	color += glow.rgb * light;
	// Um azul frio do lado oposto, para dar profundidade.
	vec2 q = (UV - vec2(0.15, 0.95)) * aspect;
	color += vec3(0.12, 0.2, 0.42) * exp(-dot(q, q) * 1.2) * 0.22;
	// A vinheta.
	vec2 v = UV - 0.5;
	color *= 1.0 - smoothstep(0.35, 0.95, length(v * vec2(1.0, 1.25))) * 0.7;
	COLOR = vec4(color, 1.0);
}
"""

static var _shader: Shader
static var _mote: Texture2D

var _rect: ColorRect
var _material: ShaderMaterial
var _motes: CPUParticles2D


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SHADER
	_material = ShaderMaterial.new()
	_material.shader = _shader
	_rect = ColorRect.new()
	_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.material = _material
	add_child(_rect)
	_motes = motes()
	add_child(_motes)
	resized.connect(_fit)
	_fit()


## A arte (do deck escolhido) desfocada por trás; null tira.
func set_art(texture: Texture2D) -> void:
	_material.set_shader_parameter("art", texture)
	_material.set_shader_parameter("has_art", 1.0 if texture != null else 0.0)


func _fit() -> void:
	var view: Vector2 = size if size.x > 0.0 else get_viewport_rect().size
	_material.set_shader_parameter("aspect", Vector2(view.x / maxf(view.y, 1.0), 1.0))
	_motes.position = Vector2(view.x / 2.0, view.y + 20.0)
	_motes.emission_rect_extents = Vector2(view.x / 2.0, 10.0)
	_motes.emitting = Txt.of(Prefs.load_all().get("effects", "auto")) != "leve"


## A poeira dourada: pontinhos de luz que sobem devagar, balançando, e somem no alto.
static func motes(amount: int = 46) -> CPUParticles2D:
	var dust := CPUParticles2D.new()
	dust.name = "Motes"
	dust.amount = amount
	dust.lifetime = 14.0
	dust.preprocess = 14.0
	dust.texture = _mote_texture()
	dust.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	dust.emission_rect_extents = Vector2(960, 10)
	dust.direction = Vector2(0, -1)
	dust.spread = 12.0
	dust.gravity = Vector2.ZERO
	dust.initial_velocity_min = 40.0
	dust.initial_velocity_max = 90.0
	dust.scale_amount_min = 0.25
	dust.scale_amount_max = 0.8
	dust.angular_velocity_min = -10.0
	dust.angular_velocity_max = 10.0
	var fade := Gradient.new()
	fade.offsets = PackedFloat32Array([0.0, 0.2, 0.75, 1.0])
	fade.colors = PackedColorArray([Color(1.0, 0.8, 0.45, 0.0), Color(1.0, 0.8, 0.45, 0.55), Color(1.0, 0.75, 0.4, 0.35), Color(1.0, 0.7, 0.35, 0.0)])
	dust.color_ramp = fade
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	dust.material = add
	return dust


static func _mote_texture() -> Texture2D:
	if _mote == null:
		var gradient := Gradient.new()
		gradient.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
		gradient.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.35), Color(1, 1, 1, 0)])
		var texture := GradientTexture2D.new()
		texture.gradient = gradient
		texture.fill = GradientTexture2D.FILL_RADIAL
		texture.fill_from = Vector2(0.5, 0.5)
		texture.fill_to = Vector2(1.0, 0.5)
		texture.width = 24
		texture.height = 24
		_mote = texture
	return _mote
