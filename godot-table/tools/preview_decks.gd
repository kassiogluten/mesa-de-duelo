# Mostra Meus decks com decks de exemplo e salva um print, para conferir a tela (precisa do servidor local para as cores e a conferência).
# npm run godot -- --resolution 1600x900 --script res://tools/preview_decks.gd -- <list|import|commander|delete|menu|offline> <saída.png>
extends SceneTree

const StarterDecks := preload("res://cards/starter_decks.gd")

const SAMPLE_LIST := "Deck\n4 Monastery Swiftspear (BRO) 144\n4 Lightning Bolt\n4 Play with Fire (MID) 154\n4 Kumano Faces Kakkazan\n4 Bonecrusher Giant\n4 Fireblast\n4 Light Up the Stage\n4 Skewer the Critics\n2 Boros Charm\n4 Chain Lightining\n18 Mountain\n\nSideboard\n3 Roiling Vortex (ZNR) 156\n2 Smash to Smithereens\nMaybeboard\n1 Embercleave"


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var mode: String = args[0]
	DeckLibrary.path = "user://preview-decks.json"
	DeckSyncState.path = "user://preview-decks-sync.json"
	DeckSyncState.account_id = func() -> String: return "conta-exemplo"
	DeckSyncState.write({})
	var decks: Array = []
	var picks: Dictionary = {"standard": 2, "pauper": 1, "commander": 2, "oathbreaker": 1}
	for deck: Dictionary in StarterDecks.all():
		var format: String = Txt.of(deck.get("format"))
		if int(picks.get(format, 0)) > 0:
			picks[format] = int(picks[format]) - 1
			var copy: Dictionary = DeckLibrary.duplicate_deck(deck)
			copy["name"] = Txt.of(deck.get("name"))
			decks.append(copy)
	# Um importado com uma carta escrita errado, para a marca de "Com problemas".
	var broken: Dictionary = DeckLibrary.duplicate_deck(decks[0])
	broken["name"] = "Auras importadas"
	(broken["cards"] as Array).append({"name": "Chain Lightining", "count": 1})
	decks.insert(1, broken)
	DeckLibrary.save_from_account(decks)
	var sync := DeckSync.new()
	sync.signed_in = func() -> bool: return mode != "menu"
	sync.transport = func(method: String, path: String, _body: Variant) -> Dictionary:
		if mode == "offline":
			return {"offline": true}
		if method == "GET":
			return {"status": 200, "data": {"rev": 3, "decks": []}}
		return {"status": 200, "data": {"rev": 3, "aplicadas": [], "conflitos": [], "recusadas": []}}
	root.add_child(sync)
	if mode == "menu":
		var menu := MenuScreen.new()
		menu.version_text = "Versão de desenvolvimento"
		root.add_child(menu)
		await create_timer(0.5).timeout
		menu.choose_deck(decks[0])
		await create_timer(1.0).timeout
		_save(args[1])
		return
	var screen := DeckScreen.new()
	screen.sync = sync
	root.add_child(screen)
	if mode == "offline":
		var more: Array = DeckLibrary.load_all()
		DeckSyncState.write({"conta": "conta-exemplo", "rev": 3, "base": {}, "pendentes": {}})
		(more[0] as Dictionary)["name"] = "Mono-vermelho (editado)"
		DeckLibrary.save_all(more)
		screen.refresh()
		sync.run()
	await create_timer(4.0).timeout
	if mode == "delete":
		screen._ask_delete(DeckLibrary.load_all()[2])
		await create_timer(1.0).timeout
	elif mode == "import" or mode == "commander":
		var dialog: DeckImportDialog = screen.open_import()
		if mode == "commander":
			dialog.set_list("1 Krenko, Mob Boss\n1 Goblin Matron\n1 Skirk Prospector\n1 Sol Ring\n96 Mountain", "Goblins do Krenko", "commander")
		else:
			dialog.set_list(SAMPLE_LIST, "Burn do Pauper", "pauper")
		await create_timer(0.5).timeout
		if args.size() > 2 and args[2] == "review":
			dialog._on_review()
			await create_timer(4.0).timeout
	_save(args[1])


func _save(out: String) -> void:
	await create_timer(0.3).timeout
	root.get_texture().get_image().save_png(out)
	print("print: ", out)
	for path: String in [DeckLibrary.path, DeckSyncState.path]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	quit()
