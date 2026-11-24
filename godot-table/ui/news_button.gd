# Botão Novidades no canto da tela inicial: busca as novidades no site, marca com um ponto a versão ainda não vista e abre o painel.
class_name NewsButton
extends Control

## As novidades (a cópia guardada até chegar a do site).
var feed: NewsFeed
## false: não busca no site ao entrar (os testes e os prints).
var auto_refresh: bool = true

var _button: Button
var _dot: Panel
var _panel: NewsPanel


func _ready() -> void:
	set_anchors_preset(Control.PRESET_TOP_LEFT)
	position = Vector2(HudStyle.MARGIN, HudStyle.MARGIN)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if feed == null:
		feed = NewsFeed.new()
	add_child(feed)
	_button = ModalStyle.button("Novidades", ModalStyle.Kind.SECONDARY, 150, 44)
	_button.name = "News"
	_button.focus_mode = Control.FOCUS_ALL
	_button.tooltip_text = "O que mudou em cada versão da mesa."
	_button.pressed.connect(open)
	add_child(_button)
	size = _button.custom_minimum_size
	_dot = Panel.new()
	_dot.name = "Dot"
	_dot.add_theme_stylebox_override("panel", _dot_style())
	_dot.size = Vector2(12, 12)
	_dot.position = Vector2(_button.custom_minimum_size.x - 10, -3)
	_dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dot)
	feed.updated.connect(_on_updated)
	feed.finished.connect(_on_finished)
	_sync_dot()
	if auto_refresh:
		feed.refresh()


## Ponto aceso: há versão que o jogador ainda não viu no painel.
func has_dot() -> bool:
	return _dot.visible


## Abre o painel com o que já se sabe; sem nada guardado, ele espera a busca no site.
func open() -> NewsPanel:
	if _panel and is_instance_valid(_panel):
		return _panel
	_panel = NewsPanel.new()
	_panel.closed.connect(func() -> void: _panel = null)
	get_parent().add_child(_panel)
	_fill_panel()
	feed.mark_seen()
	_sync_dot()
	if feed.feed.is_empty() and not feed.busy:
		feed.refresh()
	return _panel


func _fill_panel(failed: bool = false) -> void:
	if _panel == null or not is_instance_valid(_panel):
		return
	var note: String = ""
	if feed.feed.is_empty():
		note = "Não deu para buscar as novidades agora. Confira a internet e abra de novo." if failed and not feed.busy else "Buscando as novidades…"
	_panel.show_feed(feed.feed, note)


func _on_updated() -> void:
	_sync_dot()
	if _panel and is_instance_valid(_panel):
		_fill_panel()
		feed.mark_seen()
		_sync_dot()


func _on_finished(ok: bool) -> void:
	if not ok and feed.feed.is_empty():
		_fill_panel(true)


func _sync_dot() -> void:
	_dot.visible = feed.unseen()


static func _dot_style() -> StyleBoxFlat:
	var style := ModalStyle.box(HudStyle.GOLD, 99)
	style.shadow_color = Color(HudStyle.GOLD, 0.6)
	style.shadow_size = 6
	return style
