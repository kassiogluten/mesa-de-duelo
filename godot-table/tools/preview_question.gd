# Mostra uma pergunta de exemplo e salva um print, para conferir as telas das perguntas.
# npm run godot -- --script res://tools/preview_question.gd -- <exemplo> <saída.png>
# Exemplos: triggers, modes, library, combat, piles, playmode.
extends SceneTree

const SAMPLES := {
	"triggers": {"id": 7, "kind": "order", "purpose": "triggers", "canRemember": true, "title": "", "options": [
		{"kind": "ability", "label": "Eerie", "ability": "Sempre que um encantamento que você controla entrar, coloque um marcador +1/+1 na criatura alvo.", "card": {"id": 31, "name": "Archon of the Wild Rose"}},
		{"kind": "ability", "label": "Exile", "ability": "Quando Sheltered by Ghosts entrar, exile a permanente não terreno alvo de um oponente.", "card": {"id": 48, "name": "Sheltered by Ghosts"}},
		{"kind": "ability", "label": "Life", "ability": "Sempre que você ganhar vida, coloque um marcador +1/+1 nesta criatura.", "card": {"id": 52, "name": "Cult Healer"}}]},
	"modes": {"id": 8, "kind": "choose", "purpose": "modes", "min": 1, "max": 2, "title": "", "card": {"id": 9, "name": "Kolaghan's Command"},
		"options": [{"label": "Devolva o card de criatura alvo do seu cemitério para a sua mão."}, {"label": "O jogador alvo descarta um card."}, {"label": "Destrua o artefato alvo."}],
		"unavailableModes": [{"modeIndex": 4, "label": "Kolaghan's Command causa 2 pontos de dano a qualquer alvo.", "reason": "target"}]},
	"library": {"id": 9, "kind": "choose", "purpose": "library", "library": "bottom", "min": 0, "max": 2, "title": "Vidência 2", "options": [
		{"kind": "card", "label": "Lightning Bolt", "card": {"id": 61, "name": "Lightning Bolt"}}, {"kind": "card", "label": "Forest", "card": {"id": 62, "name": "Forest"}}]},
	"combat": {"id": 10, "kind": "amount", "purpose": "combat-damage", "title": "Divida o dano de combate", "total": 6, "ordered": true, "trample": true, "suggested": [2, 3, 1], "options": [
		{"kind": "card", "label": "Llanowar Elves", "lethal": 1, "card": {"id": 70, "name": "Llanowar Elves"}}, {"kind": "card", "label": "Grizzly Bears", "lethal": 2, "card": {"id": 71, "name": "Grizzly Bears"}}, {"label": "Oponente", "defender": true}]},
	"piles": {"id": 11, "kind": "choose", "purpose": "piles-split", "title": "Separe as cartas em dois montes", "chosenTo": "hand", "otherTo": "graveyard", "options": [
		{"kind": "card", "card": {"id": 81, "name": "Island"}}, {"kind": "card", "card": {"id": 82, "name": "Counterspell"}}, {"kind": "card", "card": {"id": 83, "name": "Opt"}}, {"kind": "card", "card": {"id": 84, "name": "Brainstorm"}}]},
	"playmode": {"id": 12, "kind": "choose", "purpose": "play-mode", "title": "Como jogar", "card": {"id": 90, "name": "Bonecrusher Giant"}, "options": [
		{"label": "Conjurar Bonecrusher Giant", "mode": "cast", "cost": "{2}{R}"}, {"label": "Aventura: Pisotear", "mode": "adventure", "cost": "{1}{R}"}]},
}


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var sample: Dictionary = SAMPLES[args[0]]
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	var names: PackedStringArray = []
	for raw: Variant in sample.get("options", []):
		if raw is Dictionary and (raw as Dictionary).get("card") is Dictionary:
			names.append(Txt.of(((raw as Dictionary)["card"] as Dictionary).get("name")))
	if sample.get("card") is Dictionary:
		names.append(Txt.of((sample["card"] as Dictionary)["name"]))
	catalog.request(names)
	var layer := CanvasLayer.new()
	root.add_child(layer)
	var bg := ColorRect.new()
	bg.color = Color(0.1, 0.13, 0.22)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(bg)
	var dialog := QuestionDialog.new()
	dialog.catalog = catalog
	layer.add_child(dialog)
	dialog.answered.connect(func(message: Dictionary) -> void: print("RESPOSTA ", JSON.stringify(message)))
	# Os nomes podem já estar no cache em disco (aí nada é pedido): espera um pouco em vez do sinal.
	await create_timer(1.5).timeout
	dialog.show_question(sample)
	await create_timer(3.5).timeout
	root.get_texture().get_image().save_png(args[1])
	quit()
