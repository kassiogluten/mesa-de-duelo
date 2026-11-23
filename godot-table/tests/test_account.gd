# Testes do login da mesa no PC pelo site: a sessão guardada, o vínculo (código, espera, confirmação) e o painel do menu.
extends "res://tests/test_case.gd"

const TEST_FILE := "user://conta-teste.json"

## Rotas pedidas ao servidor falso, em ordem ("POST vincular/iniciar").
var calls: PackedStringArray = []
## Respostas do servidor falso por rota (sem o /api/conta/): {status, json}, ou {"reached": false}.
var replies: Dictionary = {}
var opened: PackedStringArray = []
var _nodes: Array[Node] = []


func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree


func _fake(method: int, url: String, headers: PackedStringArray, _body: String) -> Dictionary:
	var route: String = url.substr(url.find("/api/conta/") + "/api/conta/".length())
	var auth: String = "+auth" if Array(headers).any(func(h: String) -> bool: return h.begins_with("Authorization: Bearer ")) else ""
	calls.append("%s %s%s" % ["GET" if method == HTTPClient.METHOD_GET else "POST", route, auth])
	var reply: Dictionary = replies.get(route, {"status": 404, "json": {"error": "?"}})
	return {"reached": bool(reply.get("reached", true)), "status": int(reply.get("status", 0)), "json": reply.get("json")}


func _fresh() -> void:
	AccountSession.path = TEST_FILE
	AccountSession.clear()
	AccountApi.validated = false
	calls.clear()
	opened.clear()
	replies = {"vincular/iniciar": {"status": 200, "json": {"codigo": "ABCDEFGH", "poll": "segredo", "url": "/vincular?codigo=ABCDEFGH", "expiresIn": 600}}}


func _finish() -> void:
	for node: Node in _nodes:
		if is_instance_valid(node):
			node.queue_free()
	AccountSession.clear()
	AccountSession.path = AccountSession.FILE
	AccountSession.reread()
	AccountApi.validated = false
	done = true


func _link() -> AccountLink:
	var api := AccountApi.new()
	api.transport = _fake
	var link := AccountLink.new()
	link.api = api
	link.opener = func(address: String) -> void: opened.append(address)
	_tree().root.add_child(link)
	_nodes.append(link)
	return link


const SESSION := {"estado": "ligado", "token": "tok123", "expiresAt": "2099-01-02T03:04:05.678Z",
	"conta": {"id": "c1", "nome": "Kassio", "apelido": "Kass", "foto": ""}}


func test_expiry_reads_iso_dates_and_numbers() -> void:
	check_eq(AccountSession.parse_expiry("2099-01-02T03:04:05.678Z"), 4071006245000, "data ISO do servidor, sem a fração")
	check_eq(AccountSession.parse_expiry("2099-01-02T03:04:05Z"), 4071006245000, "sem fração")
	check_eq(AccountSession.parse_expiry(4071006245000.0), 4071006245000, "número do arquivo")
	check_eq(AccountSession.parse_expiry(""), 0, "vazio")


func test_session_is_stored_announced_and_forgotten() -> void:
	done = false
	_fresh()
	var changes: Array[int] = [0]
	var counter := func() -> void: changes[0] += 1
	AccountSession.notifier().changed.connect(counter)
	AccountSession.store(SESSION)
	check(AccountSession.signed_in(), "entrou")
	check_eq(AccountSession.display_name(), "Kass", "apelido primeiro")
	check(Array(AccountSession.headers()).has("Authorization: Bearer tok123"), "cabeçalho com o token")
	AccountSession.reread()
	check_eq(AccountSession.token(), "tok123", "relido do disco")
	AccountSession.store({"token": "velho", "expiresAt": "2001-01-01T00:00:00Z", "conta": {}})
	check(not AccountSession.signed_in(), "sessão vencida não vale")
	AccountSession.clear()
	check(not FileAccess.file_exists(TEST_FILE), "arquivo apagado")
	check_eq(changes[0], 3, "avisou ao entrar, ao trocar e ao sair")
	AccountSession.notifier().changed.disconnect(counter)
	_finish()


func test_link_opens_the_site_and_waits_for_the_confirmation() -> void:
	done = false
	_fresh()
	var link: AccountLink = _link()
	var got: Array = []
	link.code_ready.connect(func(code: String, url: String) -> void: got.append([code, url]))
	link.linked.connect(func(account: Dictionary) -> void: got.append(account))
	await link.start()
	check_eq(got, [["ABCD-EFGH", GameConfig.site_url("/vincular?codigo=ABCDEFGH")]], "código com hífen e a página do site")
	check_eq(opened, PackedStringArray([GameConfig.site_url("/vincular?codigo=ABCDEFGH")]), "abriu o navegador")
	check(link.waiting() and link.seconds_left() > 590, "esperando, com os 10 minutos")

	replies["vincular/estado"] = {"status": 200, "json": {"estado": "esperando", "expiresIn": 500}}
	await link._on_tick()
	check(link.waiting() and not AccountSession.signed_in(), "ainda esperando o site")
	check(link.seconds_left() <= 500, "o prazo segue o do servidor")
	replies["vincular/estado"] = {"status": 200, "json": SESSION}
	await link._on_tick()
	check(not link.waiting(), "parou de perguntar")
	check_eq(AccountSession.token(), "tok123", "sessão guardada")
	check_eq(got.size(), 2, "avisou que ligou")
	check_eq(calls, PackedStringArray(["POST vincular/iniciar", "POST vincular/estado", "POST vincular/estado"]), "sem token nas rotas do vínculo")
	link.open_browser()
	check_eq(opened.size(), 1, "sem código, Abrir de novo não abre nada")
	_finish()


func test_link_expiry_cancel_and_errors() -> void:
	done = false
	_fresh()
	var link: AccountLink = _link()
	var errors: PackedStringArray = []
	link.failed.connect(func(text: String) -> void: errors.append(text))
	await link.start()
	replies["vincular/estado"] = {"status": 410, "json": {"error": "O código venceu."}}
	await link._on_tick()
	check_eq(errors, PackedStringArray([AccountLink.EXPIRED]), "código vencido")
	check(not link.waiting(), "desistiu")

	await link.start()
	link.cancel()
	check(not link.waiting(), "cancelado")
	check(calls[calls.size() - 1] == "POST vincular/cancelar", "o código morre no servidor")

	replies["vincular/iniciar"] = {"reached": false}
	await link.start()
	check_eq(errors[errors.size() - 1], AccountLink.NO_SERVER, "sem servidor")
	replies["vincular/iniciar"] = {"status": 429, "json": {"error": "Muitos pedidos de código."}}
	await link.start()
	check_eq(errors[errors.size() - 1], "Muitos pedidos de código.", "a frase do servidor")

	# A rede cai no meio da espera: avisa uma vez e continua.
	replies["vincular/iniciar"] = {"status": 200, "json": {"codigo": "ABCDEFGH", "poll": "s", "url": "/vincular?codigo=ABCDEFGH", "expiresIn": 600}}
	var notices: PackedStringArray = []
	link.notice.connect(func(text: String) -> void: notices.append(text))
	await link.start()
	replies["vincular/estado"] = {"reached": false}
	for i: int in AccountLink.OFFLINE_NOTICE_AFTER + 2:
		await link._on_tick()
	check_eq(notices.size(), 1, "um aviso só")
	check(link.waiting(), "segue esperando")
	_finish()


func test_stored_session_is_checked_once_and_logout_calls_the_server() -> void:
	done = false
	_fresh()
	AccountSession.store(SESSION)
	var api := AccountApi.new()
	api.transport = _fake
	_tree().root.add_child(api)
	_nodes.append(api)
	replies["eu"] = {"status": 200, "json": {"conta": {"id": "c1", "nome": "Kassio", "apelido": "Novo"}}}
	await api.validate()
	check_eq(AccountSession.display_name(), "Novo", "perfil atualizado")
	await api.validate()
	check_eq(calls, PackedStringArray(["GET eu+auth"]), "uma vez por execução")

	AccountApi.validated = false
	replies["eu"] = {"status": 401, "json": {"error": "Entre de novo"}}
	await api.validate()
	check(not AccountSession.signed_in(), "token recusado: esquece")

	AccountSession.store(SESSION)
	AccountApi.validated = false
	replies["eu"] = {"reached": false}
	await api.validate()
	check(AccountSession.signed_in(), "sem rede: fica a sessão")

	await api.logout()
	check(not AccountSession.signed_in(), "saiu")
	check_eq(calls[calls.size() - 1], "POST sair+auth", "invalida no servidor")
	_finish()


func test_menu_panel_states() -> void:
	done = false
	_fresh()
	AccountApi.validated = true
	var api := AccountApi.new()
	api.transport = _fake
	var link := AccountLink.new()
	link.api = api
	link.opener = func(address: String) -> void: opened.append(address)
	var panel := AccountPanel.new()
	panel.api = api
	panel.link = link
	var toasts: PackedStringArray = []
	panel.toast.connect(func(text: String, _kind: String) -> void: toasts.append(text))
	_tree().root.add_child(panel)
	_nodes.append(panel)
	check_eq(panel.view, AccountPanel.View.OUT, "começa fora da conta")
	check(panel.find_child("Entrar", true, false) is Button, "botão Entrar com Google")

	panel.sign_in()
	await _tree().process_frame
	check_eq(panel.view, AccountPanel.View.WAITING, "esperando o site")
	var code: Label = panel.find_child("Codigo", true, false)
	check(code != null and code.text == "ABCD-EFGH", "mostra o código")
	check(panel.find_child("AbrirDeNovo", true, false) is Button and panel.find_child("Cancelar", true, false) is Button, "Abrir de novo e Cancelar")

	replies["vincular/estado"] = {"status": 200, "json": SESSION}
	await link._on_tick()
	check_eq(panel.view, AccountPanel.View.IN, "conta ligada")
	var who: Label = panel.find_child("Nome", true, false)
	check(who != null and who.text == "Kass", "nome da conta")
	check(toasts.size() == 1 and toasts[0].contains("Kass"), "aviso de pronto")

	(panel.find_child("Sair", true, false) as Button).pressed.emit()
	await _tree().process_frame
	check_eq(panel.view, AccountPanel.View.OUT, "saiu")
	check_eq(calls[calls.size() - 1], "POST sair+auth", "chamou sair")
	_finish()


func test_photos_decode_by_their_first_bytes() -> void:
	var image := Image.create(4, 4, false, Image.FORMAT_RGB8)
	image.fill(Color.RED)
	check(AccountPanel.decode_image(image.save_png_to_buffer()) != null, "PNG")
	check(AccountPanel.decode_image(image.save_jpg_to_buffer()) != null, "JPEG")
	check(AccountPanel.decode_image(image.save_webp_to_buffer()) != null, "WebP")
	check(AccountPanel.decode_image("<html>erro</html>".to_utf8_buffer()) == null, "HTML não é foto")
