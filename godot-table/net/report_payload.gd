# Monta o relato da mesa no PC no mesmo formato do navegador (src/feedback.ts, FeedbackReport v1), com a marca de que veio do PC.
class_name ReportPayload
extends RefCounted

const UpdateState := preload("res://boot/update_state.gd")
const ForgeClient := preload("res://net/forge_client.gd")

const DESCRIPTION_LIMIT := 2000
## A gravação comprimida cabe nisto (RECORDING_LIMIT de src/forge/recording.ts).
const RECORDING_LIMIT := 2 * 1024 * 1024
## O servidor recusa corpo comprimido acima de 3 MB (Feedback.MAX_COMPRESSED); fica uma folga.
const BODY_LIMIT := 2800 * 1024
## Largura do print da mesa (JPEG): legível sem pesar.
const SCREENSHOT_WIDTH := 1280
const SCREENSHOT_QUALITY := 0.8


## A versão que vai em app.version: a do pacote com "-pc" (a área de admin acha os relatos do PC buscando "pc").
static func app_version() -> String:
	var version: String = UpdateState.current_version()
	return "%s-pc" % (version if version != "" else "dev")


static func engine_version() -> String:
	var info: Dictionary = Engine.get_version_info()
	return "%d.%d.%d" % [info["major"], info["minor"], info["patch"]]


## O campo a mais que diz de onde veio o relato (o servidor guarda o que não conhece como veio).
static func client_info() -> Dictionary:
	return {"type": "godot", "version": UpdateState.current_version(), "engine": engine_version(), "protocol": ForgeClient.SUPPORTED_PROTOCOL}


## O aparelho, nos campos do DeviceInfo do navegador, mais placa de vídeo e processador (ajudam nos relatos de desempenho).
static func device_info() -> Dictionary:
	var window: Vector2i = DisplayServer.window_get_size() if DisplayServer.get_name() != "headless" else Vector2i.ZERO
	var screen: Vector2i = DisplayServer.screen_get_size() if DisplayServer.get_name() != "headless" else Vector2i.ZERO
	var gpu: String = RenderingServer.get_video_adapter_name()
	return {
		"userAgent": "Mesa no PC %s (Godot %s; %s %s%s)" % [app_version(), engine_version(), OS.get_name(), OS.get_version(), "; %s" % gpu if gpu != "" else ""],
		"viewport": "%d×%d" % [window.x, window.y],
		"screen": "%d×%d" % [screen.x, screen.y],
		"pixelRatio": DisplayServer.screen_get_scale() if DisplayServer.get_name() != "headless" else 1.0,
		"touch": DisplayServer.is_touchscreen_available(),
		"installed": OS.has_feature("template"),
		"language": OS.get_locale_language(),
		"gpu": gpu,
		"cpu": OS.get_processor_name(),
	}


## As preferências que mudam o que a mesa mostra (em português, como as do navegador).
static func preferences() -> Dictionary:
	var prefs: Dictionary = Prefs.load_all()
	var effects: Dictionary = {"auto": "automático", "alto": "alto", "medio": "médio", "leve": "leve"}
	return {
		"efeitos": effects.get(Txt.of(prefs.get("effects", "auto")), "automático"),
		"efeitosContinuos": bool(prefs.get(AmbientFx.PREF_KEY, true)),
		"volume": float(prefs.get("volume", 0.8)),
	}


## O começo do texto numa linha só (o resumo que Meus relatos mostra).
static func summary_of(description: String) -> String:
	var text: String = RegEx.create_from_string("\\s+").sub(description.strip_edges(), " ", true)
	return text.substr(0, 159) + "…" if text.length() > 160 else text


## O relato pronto. `input`: kind ("erro" | "sugestao"), description, from ("inicio" | "partida"), recording
## (Dictionary ou null), name (apelido; vazio = sem nome), screenshot (data URL ou ""), log (o registro da mesa).
static func build(input: Dictionary) -> Dictionary:
	var recording: Variant = input.get("recording")
	var report: Dictionary = {
		"v": 1,
		"kind": "erro" if Txt.of(input.get("kind")) == "erro" else "sugestao",
		"description": Txt.of(input.get("description")).strip_edges().substr(0, DESCRIPTION_LIMIT),
		"createdAt": Time.get_datetime_string_from_system(true) + "Z",
		"from": "partida" if Txt.of(input.get("from")) == "partida" else "inicio",
		"app": {"version": app_version()},
		"client": client_info(),
		"device": device_info(),
		"preferences": preferences(),
		"recording": recording if recording is Dictionary else null,
	}
	if recording is Dictionary:
		var meta: Dictionary = (recording as Dictionary).get("meta", {})
		report["match"] = {
			"matchId": meta.get("matchId"), "format": meta.get("format"), "rulesVersion": meta.get("rulesVersion"),
			"engineVersion": meta.get("engineVersion"), "net": bool(meta.get("net", false)), "playerCount": meta.get("playerCount"),
		}
		if meta.get("preferences") is Dictionary:
			(report["preferences"] as Dictionary).merge(meta["preferences"], true)
	var log: String = Txt.of(input.get("log"))
	if log != "":
		report["diagnostics"] = "Registro da mesa no PC (últimas linhas):\n" + log
	var name: String = Txt.of(input.get("name")).strip_edges()
	if name != "":
		report["name"] = name
	var shot: String = Txt.of(input.get("screenshot"))
	if shot.begins_with("data:image/"):
		report["screenshot"] = shot
	return report


## O corpo em gzip; se passar do limite do servidor, sai o print e depois os estados mais antigos da gravação.
static func encode(report: Dictionary, recorder: MatchRecorder = null) -> PackedByteArray:
	var body: PackedByteArray = _gzip(report)
	if body.size() <= BODY_LIMIT:
		return body
	var smaller: Dictionary = report.duplicate()
	smaller.erase("screenshot")
	body = _gzip(smaller)
	var limit: int = RECORDING_LIMIT
	while body.size() > BODY_LIMIT and recorder and limit > 64 * 1024:
		limit /= 2
		smaller["recording"] = recorder.recording(limit, (report["recording"] as Dictionary).get("meta", {}) if report["recording"] is Dictionary else {})
		body = _gzip(smaller)
	return body


static func _gzip(report: Dictionary) -> PackedByteArray:
	return JSON.stringify(report).to_utf8_buffer().compress(FileAccess.COMPRESSION_GZIP)


## O print da janela em JPEG, como data URL; "" quando não há imagem (sem janela, nos testes).
static func screenshot(image: Image) -> String:
	if image == null or image.is_empty():
		return ""
	var shot: Image = image.duplicate()
	if shot.get_width() > SCREENSHOT_WIDTH:
		shot.resize(SCREENSHOT_WIDTH, int(shot.get_height() * float(SCREENSHOT_WIDTH) / shot.get_width()), Image.INTERPOLATE_LANCZOS)
	shot.convert(Image.FORMAT_RGB8)
	return "data:image/jpeg;base64," + Marshalls.raw_to_base64(shot.save_jpg_to_buffer(SCREENSHOT_QUALITY))
