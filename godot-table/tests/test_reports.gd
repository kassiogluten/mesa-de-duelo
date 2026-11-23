# Testes do relato da mesa no PC: registro recente, gravação da partida, corpo do relato, Meus relatos e o envio a um servidor falso.
extends "res://tests/test_case.gd"

const ForgeClient := preload("res://net/forge_client.gd")


## Servidor HTTP falso: responde cada pedido com a resposta da rota e guarda o que chegou ({path, headers, body}).
class FakeHttp extends Node:
	var server := TCPServer.new()
	var port: int = 0
	var routes: Dictionary = {}
	var received: Array = []
	var _peers: Array = []

	func start() -> void:
		for candidate: int in range(47100, 47200):
			if server.listen(candidate, "127.0.0.1") == OK:
				port = candidate
				return

	func _process(_delta: float) -> void:
		while server.is_connection_available():
			_peers.append({"peer": server.take_connection(), "data": PackedByteArray()})
		for entry: Dictionary in _peers.duplicate():
			var peer: StreamPeerTCP = entry["peer"]
			peer.poll()
			var available: int = peer.get_available_bytes()
			var data: PackedByteArray = entry["data"]
			if available > 0:
				data.append_array(peer.get_data(available)[1])
				entry["data"] = data
			var text: String = data.get_string_from_ascii()
			var split: int = text.find("\r\n\r\n")
			if split < 0:
				continue
			var head: PackedStringArray = text.substr(0, split).split("\r\n")
			var headers: Dictionary = {}
			for line: String in head.slice(1):
				var colon: int = line.find(":")
				headers[line.substr(0, colon).to_lower()] = line.substr(colon + 1).strip_edges()
			var length: int = int(headers.get("content-length", "0"))
			if data.size() < split + 4 + length:
				continue
			var path: String = head[0].split(" ")[1]
			received.append({"path": path, "headers": headers, "body": data.slice(split + 4, split + 4 + length)})
			var reply: Array = routes.get(path, [404, {"error": "não achei"}])
			var body: PackedByteArray = JSON.stringify(reply[1]).to_utf8_buffer()
			var out: String = "HTTP/1.1 %d X\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % [int(reply[0]), body.size()]
			peer.put_data(out.to_utf8_buffer())
			peer.put_data(body)
			peer.disconnect_from_host()
			_peers.erase(entry)


func _states() -> Array:
	return JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/abertura.json"))


func test_client_log_keeps_the_last_lines() -> void:
	ClientLog.clear()
	for i: int in ClientLog.LIMIT + 50:
		ClientLog.add("linha %d" % i)
	var lines: PackedStringArray = ClientLog.lines()
	check_eq(lines.size(), ClientLog.LIMIT, "fica só o limite")
	check(lines[lines.size() - 1].ends_with("linha %d" % (ClientLog.LIMIT + 49)), "a mais nova por último")
	check(lines[0].ends_with("linha 50"), "as mais antigas saem")
	ClientLog.install()
	print("relato: linha do print")
	push_warning("relato: um aviso")
	check(ClientLog.text().contains("relato: linha do print"), "o print do motor entra no registro")
	check(ClientLog.text().contains("[aviso] relato: um aviso"), "o aviso entra marcado")
	ClientLog.uninstall()
	ClientLog.clear()


func test_recorder_keeps_states_without_secrets() -> void:
	var recorder := MatchRecorder.new()
	recorder.start({"type": "start", "you": {"main": ["Ilha"]}, "config": {"format": "standard"}})
	recorder.sent({"type": "start", "you": {"main": ["Ilha"]}, "config": {"format": "standard"}})
	recorder.received({"type": "hello", "rulesVersion": "r1", "engineVersion": "e1", "protocolVersion": 1})
	var states: Array = _states()
	for state: Dictionary in states:
		var msg: Dictionary = state.duplicate()
		msg["type"] = "state"
		msg["session"] = {"code": "ABCD", "token": "segredo", "room": false}
		recorder.received(msg)
	recorder.sent({"type": "card", "id": 3, "gen": 7})
	recorder.sent({"type": "rejoin", "code": "ABCD", "token": "segredo"})
	recorder.received({"type": "error", "text": "Jogada recusada."})
	check_eq(recorder.session, {"code": "ABCD", "token": "segredo"}, "o assento fica para os cabeçalhos")
	var rec: Dictionary = recorder.recording()
	check_eq(rec["format"], "mesa-gravacao", "formato da gravação do navegador")
	check_eq((rec["meta"] as Dictionary).get("rulesVersion"), (states[states.size() - 1] as Dictionary).get("rulesVersion", "r1"), "versão das regras (a do estado vale mais que a do hello)")
	check_eq((rec["meta"] as Dictionary).get("format"), "standard", "formato da partida")
	check((rec["meta"] as Dictionary).get("deck") is Dictionary, "o deck vai na meta")
	check((rec["frames"] as Array).size() >= 1, "há quadros")
	var text: String = JSON.stringify(rec)
	check(not text.contains("segredo"), "nenhum token na gravação")
	var first: Variant = JSON.parse_string(((rec["frames"] as Array)[0] as Dictionary)["k"])
	check(first is Dictionary and (first as Dictionary).has("players"), "o quadro é o estado inteiro")
	var sent: Array = rec["sent"]
	check_eq(sent.size(), 3, "start, card e rejoin entram (o hello não)")
	check(not ((sent[0] as Dictionary)["msg"] as Dictionary).has("you"), "sem o deck na mensagem")
	check_eq(int((sent[1] as Dictionary)["gen"]), 7, "o gen da jogada")
	check_eq(((rec["notes"] as Array)[0] as Dictionary)["kind"], "erro", "o erro do servidor vira nota")


func test_recorder_fits_the_limit_keeping_the_first() -> void:
	var recorder := MatchRecorder.new()
	var base: Dictionary = _states()[0]
	for i: int in 30:
		var msg: Dictionary = base.duplicate()
		msg["type"] = "state"
		msg["stateVersion"] = i
		msg["ruido"] = Marshalls.raw_to_base64(Crypto.new().generate_random_bytes(3000))
		recorder.received(msg)
	var small: Dictionary = recorder.recording(20 * 1024)
	var frames: Array = small["frames"]
	check(frames.size() < 30, "cortou quadros (%d)" % frames.size())
	check_eq(int((frames[0] as Dictionary)["v"]), 0, "o primeiro fica")
	check_eq(int((frames[frames.size() - 1] as Dictionary)["v"]), 29, "o mais novo fica")
	check_eq(int(small["droppedFrames"]), 30 - frames.size(), "conta os cortados")


func test_payload_has_the_browser_shape_and_the_pc_mark() -> void:
	var recorder := MatchRecorder.new()
	var msg: Dictionary = (_states()[0] as Dictionary).duplicate()
	msg["type"] = "state"
	recorder.received(msg)
	var report: Dictionary = ReportPayload.build({
		"kind": "erro", "description": "  A carta sumiu.  ", "from": "partida",
		"recording": recorder.recording(), "name": "Kassio", "screenshot": "data:image/jpeg;base64,AAAA", "log": "12:00:00 linha",
	})
	check_eq(int(report["v"]), 1, "v")
	check_eq(report["kind"], "erro", "tipo")
	check_eq(report["description"], "A carta sumiu.", "descrição sem espaços nas pontas")
	check_eq(report["from"], "partida", "de onde")
	check(Txt.of((report["app"] as Dictionary)["version"]).ends_with("-pc"), "a versão diz que é do PC")
	check_eq((report["client"] as Dictionary)["type"], "godot", "o campo do cliente")
	check_eq(int((report["client"] as Dictionary)["protocol"]), ForgeClient.SUPPORTED_PROTOCOL, "o protocolo do cliente")
	for key: String in ["userAgent", "viewport", "screen", "pixelRatio", "touch", "installed", "language"]:
		check((report["device"] as Dictionary).has(key), "aparelho: %s" % key)
	check_eq((report["match"] as Dictionary)["format"], "standard", "formato da partida")
	check(Txt.of(report["diagnostics"]).contains("12:00:00 linha"), "o registro vai em diagnostics")
	check_eq(report["name"], "Kassio", "o nome")
	check_eq(report["screenshot"], "data:image/jpeg;base64,AAAA", "o print")
	var body: PackedByteArray = ReportPayload.encode(report, recorder)
	check(body[0] == 0x1f and body[1] == 0x8b, "corpo em gzip")
	var bad: Dictionary = ReportPayload.build({"kind": "x", "description": "oi", "from": "?", "screenshot": "javascript:1"})
	check_eq(bad["kind"], "sugestao", "tipo desconhecido vira sugestão")
	check_eq(bad["from"], "inicio", "lugar desconhecido vira início")
	check(not bad.has("screenshot") and bad["recording"] == null and not bad.has("match"), "sem print, sem partida")


func test_screenshot_is_a_small_jpeg() -> void:
	var image := Image.create(2560, 1440, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.1, 0.2, 0.3))
	var shot: String = ReportPayload.screenshot(image)
	check(shot.begins_with("data:image/jpeg;base64,"), "data URL em JPEG")
	var decoded := Image.new()
	decoded.load_jpg_from_buffer(Marshalls.base64_to_raw(shot.substr(shot.find(",") + 1)))
	check_eq(decoded.get_width(), ReportPayload.SCREENSHOT_WIDTH, "reduzido para a largura do print")
	check_eq(ReportPayload.screenshot(null), "", "sem imagem, sem print")


func test_summary_is_one_line() -> void:
	check_eq(ReportPayload.summary_of("  a\n\n b\t c "), "a b c", "uma linha")
	check_eq(ReportPayload.summary_of("x".repeat(300)).length(), 160, "cortado em 160")


func test_my_reports_merge_and_forget() -> void:
	MyReports.clear()
	MyReports.remember("AAAA", "k1", "http://x/api/relatos", "erro", "primeiro")
	MyReports.remember("BBBB", "k2", "http://x/api/relatos", "sugestao", "segundo")
	check_eq(MyReports.saved().size(), 2, "guardados")
	check_eq((MyReports.saved()[0] as Dictionary)["code"], "BBBB", "o mais novo primeiro")
	var merged: Dictionary = MyReports.merge(MyReports.saved(), [
		{"code": "AAAA", "kind": "erro", "summary": "primeiro", "receivedAt": "2026-11-23T10:00:00.000Z", "status": "resolvido", "reply": "Corrigido."},
		{"code": "CCCC", "kind": "sugestao", "summary": "de outro aparelho", "receivedAt": "2026-11-22T10:00:00Z", "status": "analise"},
	])
	var reports: Array = MyReports.sort(merged["reports"])
	check_eq(reports.size(), 2, "os que o servidor devolveu")
	check_eq((reports[0] as Dictionary)["reply"], "Corrigido.", "a resposta")
	check_eq((reports[0] as Dictionary)["status"], "resolvido", "o andamento")
	check_eq(merged["gone"], ["BBBB"], "o que o servidor não devolveu sai")
	MyReports.forget(merged["gone"])
	check_eq(MyReports.saved().size(), 1, "esquecido")
	MyReports.clear()


func test_update_check_evaluates_the_manifest() -> void:
	var state: Dictionary = {"bad": ["0.9.0"]}
	check_eq(UpdateCheck.evaluate({"version": "1.0.0"}, "1.0.0", state, 1, "4.7.2"), {}, "mesma versão: nada")
	check_eq(UpdateCheck.evaluate({"version": "1.1.0"}, "", state, 1, "4.7.2"), {}, "sem atualizador: nada")
	check_eq(UpdateCheck.evaluate({"version": "0.9.0"}, "1.0.0", state, 1, "4.7.2"), {}, "versão quebrada: nada")
	var found: Dictionary = UpdateCheck.evaluate({"version": "1.1.0", "engine": "4.7.2", "minBoot": 1}, "1.0.0", state, 1, "4.7.2")
	check_eq(found.get("version"), "1.1.0", "versão nova")
	check_eq(found.get("reinstall"), false, "entra sozinha ao reabrir")
	check_eq(UpdateCheck.evaluate({"version": "1.0.0+bbbb2222"}, "1.0.0+aaaa1111", state, 1, "4.7.2").get("version"), "1.0.0+bbbb2222", "deploy só com correções (mesmo número, outro pacote): também é versão nova")
	check_eq(UpdateCheck.evaluate({"version": "1.1.0", "engine": "4.8.0"}, "1.0.0", state, 1, "4.7.2").get("reinstall"), true, "outro motor: instalar de novo")
	check_eq(UpdateCheck.evaluate({"version": "1.1.0", "minBoot": 2}, "1.0.0", state, 1, "4.7.2").get("reinstall"), true, "boot novo: instalar de novo")


func test_protocol_check() -> void:
	check(not ForgeClient.needs_update({"type": "hello"}), "servidor antigo, sem versão: segue")
	check(not ForgeClient.needs_update({"protocolVersion": ForgeClient.SUPPORTED_PROTOCOL}), "a mesma versão: segue")
	check(ForgeClient.needs_update({"protocolVersion": ForgeClient.SUPPORTED_PROTOCOL + 1}), "protocolo mais novo: atualizar")
	check(not ForgeClient.needs_update({"protocolVersion": ForgeClient.SUPPORTED_PROTOCOL + 1, "minProtocolVersion": ForgeClient.SUPPORTED_PROTOCOL}), "mais novo, mas ainda aceita o nosso: segue")
	check(ForgeClient.needs_update({"protocolVersion": ForgeClient.SUPPORTED_PROTOCOL + 2, "minProtocolVersion": ForgeClient.SUPPORTED_PROTOCOL + 1}), "o mínimo passou do nosso: atualizar")


func test_send_to_a_fake_server() -> void:
	done = false
	MyReports.clear()
	var tree: SceneTree = Engine.get_main_loop()
	var fake := FakeHttp.new()
	tree.root.add_child(fake)
	fake.start()
	fake.routes = {
		"/api/relatos": [201, {"code": "K7Q2", "key": "chave"}],
		"/api/relatos/situacao": [200, {"relatos": [{"code": "K7Q2", "kind": "erro", "summary": "Sumiu", "receivedAt": "2026-11-23T10:00:00Z", "status": "analise"}]}],
	}
	var client := ReportClient.new()
	client.url = "http://127.0.0.1:%d/api/relatos" % fake.port
	tree.root.add_child(client)
	var recorder := MatchRecorder.new()
	var msg: Dictionary = (_states()[0] as Dictionary).duplicate()
	msg["type"] = "state"
	recorder.received(msg)
	var report: Dictionary = ReportPayload.build({"kind": "erro", "description": "Sumiu", "from": "partida", "recording": recorder.recording()})
	var result: Dictionary = await client.send_report(report, ReportPayload.encode(report), {"code": "ABCD", "token": "t"}, "tok")
	check_eq(result, {"status": "sent", "code": "K7Q2"}, "enviado")
	var got: Dictionary = fake.received[0]
	check_eq(got["path"], "/api/relatos", "rota")
	check_eq((got["headers"] as Dictionary).get("content-encoding"), "gzip", "gzip declarado")
	check_eq((got["headers"] as Dictionary).get("authorization"), "Bearer tok", "a conta")
	check_eq((got["headers"] as Dictionary).get("x-mesa-partida"), "ABCD", "o assento da partida")
	var body: PackedByteArray = got["body"]
	var opened: Variant = JSON.parse_string(body.decompress_dynamic(-1, FileAccess.COMPRESSION_GZIP).get_string_from_utf8())
	check(opened is Dictionary and (opened as Dictionary)["kind"] == "erro" and ((opened as Dictionary)["client"] as Dictionary)["type"] == "godot", "o corpo chega inteiro")
	check_eq((MyReports.saved()[0] as Dictionary)["key"], "chave", "a chave fica guardada")
	var mine: Dictionary = await client.refresh("")
	check_eq(((mine["reports"] as Array)[0] as Dictionary)["status"], "analise", "a situação volta")
	check_eq(mine["offline"], false, "o servidor respondeu")
	fake.routes["/api/relatos"] = [429, {"error": "Muitos"}]
	var limited: Dictionary = await client.send_report(report, ReportPayload.encode(report))
	check_eq(limited.get("status"), "rejected", "limite recusado")
	check_eq(limited.get("text"), ReportClient.TOO_MANY, "a frase do limite")
	fake.routes["/api/relatos"] = [400, {"error": "Escreva o que aconteceu."}]
	var invalid: Dictionary = await client.send_report(report, ReportPayload.encode(report))
	check_eq(invalid.get("text"), "Escreva o que aconteceu.", "a frase do servidor")
	fake.queue_free()
	client.queue_free()
	MyReports.clear()
	done = true


func test_dialog_sends_and_shows_the_code() -> void:
	done = false
	MyReports.clear()
	var tree: SceneTree = Engine.get_main_loop()
	var fake := FakeHttp.new()
	tree.root.add_child(fake)
	fake.start()
	fake.routes = {"/api/relatos": [201, {"code": "Z9Z9", "key": "k"}]}
	var client := ReportClient.new()
	client.url = "http://127.0.0.1:%d/api/relatos" % fake.port
	tree.root.add_child(client)
	var dialog := ReportDialog.new()
	dialog.client = client
	tree.root.add_child(dialog)
	var codes: Array = []
	dialog.sent.connect(func(code: String) -> void: codes.append(code))
	dialog.open({"from": "inicio", "recorder": null})
	check(dialog.visible, "abre")
	check(not (dialog.get("_attach") as CheckBox).visible, "sem partida, sem a caixa de anexar")
	dialog.submit()
	check_eq((dialog.get("_error") as Label).text, "Escreva o que aconteceu ou a sua ideia.", "descrição vazia não sai")
	dialog.set_description("O botão sumiu.")
	await dialog.submit()
	check_eq(codes, ["Z9Z9"], "enviado")
	check((dialog.get("_done") as Control).visible, "mostra o código")
	check((dialog.get("_done_title") as Label).text.contains("Z9Z9"), "com o código")
	dialog.queue_free()
	fake.queue_free()
	client.queue_free()
	MyReports.clear()
	done = true
