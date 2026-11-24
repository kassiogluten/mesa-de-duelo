# Os controles da vista da mesa na partida (table/table_camera.gd): a roda do mouse aproxima e afasta na direção do
# mouse, + e − pelo meio da tela, V troca o ângulo (Shift+V volta) e 0 volta à vista padrão; liga a vista ao botão da
# barra do alto e aos retratos dos oponentes, que acompanham o lugar deles na mesa.
class_name ViewControls
extends RefCounted


## A vista guardada da última partida (Prefs) e as ligações com o HUD.
static func attach(table: TableView, hud: Hud) -> void:
	table.view_rig.load_prefs()
	hud.set_view_rig(table.view_rig)
	table.view_rig.moved.connect(func(_done: bool) -> void: hud.follow_view())


## Trata a roda do mouse e as teclas da câmera; devolve true se o evento era delas.
static func handle(rig: TableCamera, event: InputEvent) -> bool:
	if rig == null:
		return false
	var wheel := event as InputEventMouseButton
	if wheel and wheel.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		# O touchpad manda frações de um clique (factor); a roda comum manda 1 (ou 0, em alguns sistemas).
		if wheel.pressed and not (wheel.ctrl_pressed or wheel.alt_pressed or wheel.meta_pressed):
			var notches: float = wheel.factor if wheel.factor > 0.0 else 1.0
			rig.zoom_by(notches if wheel.button_index == MOUSE_BUTTON_WHEEL_UP else -notches, wheel.position)
			return true
		return false
	match KeyMap.action(event):
		"zoom_in":
			rig.zoom_by(1.0)
		"zoom_out":
			rig.zoom_by(-1.0)
		"view_next":
			rig.cycle_angle(1)
		"view_prev":
			rig.cycle_angle(-1)
		"view_reset":
			rig.reset()
		_:
			return false
	return true
