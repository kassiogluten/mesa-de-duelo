# A conta na tela inicial da mesa no PC, no canto de cima: Entrar com Google, o código enquanto o site confirma e a conta ligada.
class_name AccountPanel
extends Control

## Aviso para o jogador (o menu mostra na pilha de avisos): kind "info", "error", "success" ou "warning".
signal toast(text: String, kind: String)

enum View { OUT, STARTING, WAITING, IN }

const WIDTH := 360.0
const AVATAR := 44.0
## Recorta a foto em círculo, com a borda suave.
const CIRCLE_SHADER := """
shader_type canvas_item;
void fragment() {
	float d = distance(UV, vec2(0.5));
	COLOR = texture(TEXTURE, UV);
	COLOR.a *= 1.0 - smoothstep(0.47, 0.5, d);
}
"""

## Fotos já baixadas nesta execução (endereço → textura).
static var _photos: Dictionary = {}

var link: AccountLink
var api: AccountApi
var view: View = View.OUT

var _box: PanelContainer
var _content: VBoxContainer
var _countdown: Label


func _ready() -> void:
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	offset_left = -WIDTH - HudStyle.MARGIN
	offset_right = -HudStyle.MARGIN
	offset_top = HudStyle.MARGIN
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if api == null:
		api = AccountApi.new()
	add_child(api)
	if link == null:
		link = AccountLink.new()
		link.api = api
	add_child(link)
	link.code_ready.connect(func(_code: String, _url: String) -> void: _show(View.WAITING))
	link.linked.connect(_on_linked)
	link.failed.connect(_on_failed)
	link.notice.connect(func(text: String) -> void: toast.emit(text, "warning"))
	_box = PanelContainer.new()
	_box.custom_minimum_size = Vector2(WIDTH, 0)
	_box.size_flags_horizontal = Control.SIZE_SHRINK_END
	add_child(_box)
	# Fora de um contêiner, o painel não acompanha sozinho o conteúdo (o texto quebrado cresce depois do layout).
	_box.minimum_size_changed.connect(_fit)
	_content = VBoxContainer.new()
	_content.add_theme_constant_override("separation", 10)
	_box.add_child(_content)
	AccountSession.notifier().changed.connect(_on_session_changed)
	_show(View.IN if AccountSession.signed_in() else View.OUT)
	api.validate()


func _exit_tree() -> void:
	if AccountSession.notifier().changed.is_connected(_on_session_changed):
		AccountSession.notifier().changed.disconnect(_on_session_changed)


func _fit() -> void:
	_box.size = _box.get_combined_minimum_size()


func _process(_delta: float) -> void:
	if view == View.WAITING and _countdown:
		_countdown.text = _countdown_text(link.seconds_left())


## "Vale por mais 9:41".
static func _countdown_text(seconds: int) -> String:
	return "O código vale por mais %d:%02d" % [seconds / 60, seconds % 60]


func sign_in() -> void:
	_show(View.STARTING)
	link.start()


func _cancel() -> void:
	link.cancel()
	_show(View.OUT)


func _sign_out() -> void:
	api.logout()
	toast.emit("Você saiu da conta nesta mesa.", "info")


func _on_linked(_account: Dictionary) -> void:
	_show(View.IN)
	toast.emit("Pronto: a mesa entrou na conta de %s." % AccountSession.display_name(), "success")


func _on_failed(message: String) -> void:
	_show(View.IN if AccountSession.signed_in() else View.OUT)
	toast.emit(message, "error")


func _on_session_changed() -> void:
	if view != View.WAITING and view != View.STARTING:
		_show(View.IN if AccountSession.signed_in() else View.OUT)


func _show(next: View) -> void:
	view = next
	_countdown = null
	for child: Node in _content.get_children():
		_content.remove_child(child)
		child.queue_free()
	match next:
		View.OUT, View.STARTING:
			_box.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
			var enter: Button = ModalStyle.button("Abrindo…" if next == View.STARTING else "Entrar com Google", ModalStyle.Kind.SECONDARY, 0.0, 46.0)
			enter.name = "Entrar"
			enter.disabled = next == View.STARTING
			enter.tooltip_text = "Abre o navegador para você entrar com a conta do site. Seus decks da conta vêm junto."
			enter.size_flags_horizontal = Control.SIZE_SHRINK_END
			enter.pressed.connect(sign_in)
			_content.add_child(enter)
		View.WAITING:
			_box.add_theme_stylebox_override("panel", _panel_style())
			_waiting()
		View.IN:
			_box.add_theme_stylebox_override("panel", _panel_style(10))
			_signed_in()


func _waiting() -> void:
	_content.add_child(ModalStyle.label(HudStyle.SIZE_TITLE, ModalStyle.GOLD_LIGHT, "Entrar com Google"))
	_content.add_child(ModalStyle.wrap(HudStyle.SIZE_BODY, ModalStyle.INK, "Abrimos o navegador para você entrar. Confira se o site mostra este mesmo código:", WIDTH - 40.0, false))
	var code_box := PanelContainer.new()
	code_box.add_theme_stylebox_override("panel", _code_style())
	var code := ModalStyle.label(40, ModalStyle.GOLD_LIGHT, link.code)
	code.name = "Codigo"
	code.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	code.add_theme_font_override("font", HudStyle.bold_font())
	code_box.add_child(code)
	_content.add_child(code_box)
	_countdown = ModalStyle.label(HudStyle.SIZE_SMALL, ModalStyle.MUTED, _countdown_text(link.seconds_left()))
	_content.add_child(_countdown)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var again: Button = ModalStyle.button("Abrir de novo", ModalStyle.Kind.SECONDARY, 0.0, 42.0)
	again.name = "AbrirDeNovo"
	again.tooltip_text = "Abre a página do site outra vez, se o navegador não apareceu ou foi fechado."
	again.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	again.pressed.connect(link.open_browser)
	row.add_child(again)
	var cancel: Button = ModalStyle.button("Cancelar", ModalStyle.Kind.GHOST, 0.0, 42.0)
	cancel.name = "Cancelar"
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel.pressed.connect(_cancel)
	row.add_child(cancel)
	_content.add_child(row)


func _signed_in() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.add_child(_avatar(Txt.of(AccountSession.account().get("foto")), AccountSession.display_name()))
	var names := VBoxContainer.new()
	names.add_theme_constant_override("separation", 0)
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	var who := ModalStyle.label(HudStyle.SIZE_BODY + 2, ModalStyle.INK, AccountSession.display_name())
	who.name = "Nome"
	who.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	who.clip_text = true
	names.add_child(who)
	names.add_child(ModalStyle.label(HudStyle.SIZE_CAPTION, ModalStyle.MUTED, "Conta conectada"))
	row.add_child(names)
	var out: Button = ModalStyle.button("Sair", ModalStyle.Kind.GHOST, 72.0, 38.0)
	out.name = "Sair"
	out.tooltip_text = "Sai da conta só nesta mesa. Os outros aparelhos continuam conectados."
	out.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	out.pressed.connect(_sign_out)
	row.add_child(out)
	_content.add_child(row)


## A foto do Google em círculo; enquanto baixa (ou sem foto), a inicial do nome.
func _avatar(photo: String, name_text: String) -> Control:
	var holder := PanelContainer.new()
	holder.custom_minimum_size = Vector2(AVATAR, AVATAR)
	holder.add_theme_stylebox_override("panel", ModalStyle.box(ModalStyle.NAVY, int(AVATAR / 2.0), Color(ModalStyle.GOLD, 0.45), 1))
	var initial := ModalStyle.label(20, ModalStyle.GOLD_LIGHT, name_text.left(1).to_upper())
	initial.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	initial.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	holder.add_child(initial)
	var picture := TextureRect.new()
	picture.name = "Foto"
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = Shader.new()
	material.shader.code = CIRCLE_SHADER
	picture.material = material
	holder.add_child(picture)
	if photo.begins_with("https://"):
		if _photos.has(photo):
			picture.texture = _photos[photo]
			initial.visible = false
		else:
			_download(photo, picture, initial)
	return holder


func _download(photo: String, picture: TextureRect, initial: Label) -> void:
	var http := HTTPRequest.new()
	http.timeout = 15.0
	add_child(http)
	if http.request(photo) != OK:
		http.queue_free()
		return
	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS or int(result[1]) != 200:
		return
	var texture: Texture2D = decode_image(result[3])
	if texture == null:
		return
	_photos[photo] = texture
	if is_instance_valid(picture):
		picture.texture = texture
	if is_instance_valid(initial):
		initial.visible = false


## JPEG, PNG ou WebP pelos primeiros bytes (o Google escolhe o formato); null se não for imagem.
static func decode_image(bytes: PackedByteArray) -> Texture2D:
	if bytes.size() < 12:
		return null
	var image := Image.new()
	var error: int = ERR_FILE_UNRECOGNIZED
	if bytes[0] == 0xFF and bytes[1] == 0xD8:
		error = image.load_jpg_from_buffer(bytes)
	elif bytes[0] == 0x89 and bytes[1] == 0x50:
		error = image.load_png_from_buffer(bytes)
	elif bytes.slice(0, 4).get_string_from_ascii() == "RIFF" and bytes.slice(8, 12).get_string_from_ascii() == "WEBP":
		error = image.load_webp_from_buffer(bytes)
	return ImageTexture.create_from_image(image) if error == OK else null


static func _panel_style(margin: int = 20) -> CutBox:
	var style: CutBox = ModalStyle.panel_style(16)
	style.shadow_size = 24
	style.shadow_offset = Vector2(0, 8)
	style.content_margin_left = margin + 4
	style.content_margin_right = margin + 4
	style.content_margin_top = margin
	style.content_margin_bottom = margin
	return style


static func _code_style() -> StyleBoxFlat:
	var style: StyleBoxFlat = ModalStyle.box(Color(0, 0, 0, 0.35), 12, Color(ModalStyle.GOLD, 0.35), 1)
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style
