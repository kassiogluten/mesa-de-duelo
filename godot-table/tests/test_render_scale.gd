# A resolução da mesa 3D no Automático (fx/render_scale.gd e o regulador de fx/fx_director.gd): só desce depois dos
# efeitos chegarem ao Leve, um degrau por vez, com FSR, e volta à cheia a cada partida e nos modos fixos.
extends "res://tests/test_case.gd"


func test_steps_down_with_fsr_and_resets() -> void:
	var viewport := SubViewport.new()
	var scale := RenderScale.new()
	scale.viewport = viewport
	scale.reset()
	check_eq(viewport.scaling_3d_scale, 1.0, "começa cheia")
	check(scale.lower(), "desce um degrau")
	check(is_equal_approx(viewport.scaling_3d_scale, 0.85), "85%")
	check_eq(viewport.scaling_3d_mode, Viewport.SCALING_3D_MODE_FSR, "ampliada com FSR")
	while scale.lower():
		pass
	check(is_equal_approx(viewport.scaling_3d_scale, RenderScale.STEPS[-1]), "para no degrau mais baixo")
	scale.reset()
	check_eq(viewport.scaling_3d_scale, 1.0, "volta à cheia")
	check_eq(viewport.scaling_3d_mode, Viewport.SCALING_3D_MODE_BILINEAR, "sem ampliar")
	viewport.free()


func test_regulator_lowers_resolution_only_after_light_effects() -> void:
	var director := FxDirector.new()
	var viewport := SubViewport.new()
	director.render_scale.viewport = viewport
	director.automatic = true
	var before: int = Fx.quality
	Fx.quality = 1
	for i: int in 60:
		director._process(0.05)
		if Fx.quality > 0:
			check_eq(director.render_scale.step, 0, "com efeitos acima do Leve, a resolução não muda")
	check_eq(Fx.quality, 0, "os efeitos descem primeiro")
	check(director.render_scale.step > 0, "depois, a resolução")
	var step: int = director.render_scale.step
	director.automatic = false
	for i: int in 60:
		director._process(0.05)
	check_eq(director.render_scale.step, step, "fora do Automático, o regulador não mexe")
	Fx.quality = before
	viewport.free()
	director.free()
