// O desenho da mesa viva, sem página: o shader (luz de quem joga, poeira, vinheta da vida baixa, clarão, tremor, escurecer) e o estado que desliza até a cena, para a página ou para o worker.

/** O que a mesa viva mostra agora; ela desliza até aqui em vez de pular. */
export interface AmbienceScene {
  /** Centro do campo de quem joga o turno, de 0 a 1 na janela. */
  focus: { x: number; y: number };
  /** Cor de quem joga o turno (a da capa das cartas), de 0 a 1. */
  tone: [number, number, number];
  /** Sua vida baixa: 0 (tranquilo) a 1 (por um fio). */
  danger: number;
  /** Combate em andamento: a luz fecha e esquenta. */
  combat: boolean;
}

/** Um toque do jogo na mesa viva: clarão na cor dada, tremor (0 a 1) e escurecer por `ms`. */
export interface AmbiencePulse {
  flash?: [number, number, number];
  quake?: number;
  dim?: { amount: number; ms: number };
}

/** O que a página manda para o worker da mesa viva. */
export type AmbienceToWorker =
  | { type: 'start'; canvas: OffscreenCanvas; width: number; height: number }
  | { type: 'size'; width: number; height: number }
  | { type: 'set'; scene: AmbienceScene }
  | { type: 'pulse'; pulse: AmbiencePulse }
  | { type: 'run'; on: boolean };

/** O que o worker devolve: os quadros desenhados (de tempos em tempos), ou que não deu para desenhar. */
export type AmbienceFromWorker = { type: 'frames'; frames: number } | { type: 'failed' } | { type: 'lost' };

/** A mesa viva desenha a 30 quadros por segundo. */
export const AMBIENCE_FRAME_MS = 1000 / 30;

const VERTEX = `#version 300 es
in vec2 corner;
out vec2 uv;
void main() { uv = corner * .5 + .5; gl_Position = vec4(corner, 0., 1.); }`;

// Saída com alfa pré-multiplicado: a luz soma por cima do fundo da mesa e a vinheta o escurece.
const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 uv;
out vec4 color;
uniform vec2 size;
uniform float time;
uniform vec2 focus;
uniform vec3 tone;
uniform float danger;
uniform float combat;
// Os toques do jogo (pulse): o clarão de uma mágica resolvendo, o tremor de um golpe pesado, o escuro de um momento
// grande, e o relógio da poeira (anda mais rápido no combate, sem dar saltos).
uniform vec3 flash;
uniform float quake;
uniform float dim;
uniform float drift;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// Poeira: um grão por célula, subindo devagar e balançando; só as células vizinhas contam.
float motes(vec2 p, float scale, float speed, float seed) {
  p *= scale;
  p.y -= drift * speed;
  vec2 cell = floor(p);
  float light = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = cell + vec2(x, y);
    float h = hash(c + seed);
    if (h > .22) continue;
    vec2 at = c + vec2(hash(c + seed + 7.1), hash(c + seed + 3.7));
    at.x += sin(time * (.35 + h) + h * 40.) * .35;
    float d = length(p - at);
    float twinkle = .55 + .45 * sin(time * (1.2 + h * 2.) + h * 60.);
    light += (smoothstep(.04, 0., d) + smoothstep(.13, 0., d) * .1) * twinkle;
  }
  return light;
}
void main() {
  float aspect = size.x / size.y;
  vec2 p = vec2(uv.x * aspect, 1. - uv.y);
  // O golpe pesado sacode a luz e a faz piscar.
  vec2 f = vec2(focus.x * aspect, focus.y) + quake * .02 * vec2(sin(time * 61.), cos(time * 47.));
  // A luz de quem joga: uma elipse larga que respira; no combate, mais fechada e mais quente.
  vec2 d = (p - f) / vec2(mix(.62, .48, combat) * aspect * .55, mix(.42, .34, combat));
  float spot = exp(-dot(d, d) * 1.6) * (.85 + .15 * sin(time * .45)) * (1. + quake * .5 * sin(time * 53.)) * (1. - dim * .7);
  float haze = noise(p * 2.2 + vec2(time * .03, time * .018)) * .6 + noise(p * 5. - time * .04) * .4;
  vec3 warm = mix(vec3(1., .9, .72), vec3(1., .55, .3), combat);
  vec3 lightColor = mix(tone, warm, .45);
  vec3 light = lightColor * spot * (.16 + haze * .06);
  // Grãos de poeira, mais visíveis perto da luz.
  float dust = motes(p, 9., .045, 1.) + motes(p, 16., .03, 9.) * .4;
  light += mix(lightColor, vec3(1.), .35) * dust * (.035 + spot * .28);
  // Vinheta: as bordas da mesa somem no escuro; com a vida baixa, pesam mais e pulsam em vermelho, como um coração.
  vec2 e = uv - .5;
  float edge = smoothstep(.25, .85, length(e * vec2(1., .9)) * 1.25);
  float beat = pow(max(0., sin(time * 2.4)), 6.) * .6 + .4;
  float dark = edge * (.22 + danger * .35);
  light += vec3(.8, .06, .03) * edge * danger * beat * .45;
  // O clarão: um brilho leve na cor da mágica, só no meio da mesa (reduzido em 14/11/2026: o de antes clareava a
  // tela inteira, como um relâmpago branco, quando a mágica resolvia e chegava ao campo).
  light += flash * (1. - edge) * .06;
  // Momento grande: a mesa toda escurece por baixo das cartas.
  dark = mix(dark, 1., dim * .55);
  // Com alfa pré-multiplicado, a cor não pode passar do alfa: no meio da mesa, onde a vinheta não escurece (alfa 0), a
  // luz ficava sem definição, e o navegador a descartava. Aparecia uma elipse nítida no meio da mesa, onde a vinheta
  // começa. O alfa vai até a luz mais forte; o fundo escurece por isso no máximo uns 2%.
  color = vec4(light, max(dark, max(light.r, max(light.g, light.b))));
}`;

/** O contexto WebGL2 da mesa viva, num canvas da página ou num OffscreenCanvas do worker. */
export function ambienceContext(canvas: HTMLCanvasElement | OffscreenCanvas) {
  return canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }) as WebGL2RenderingContext | null;
}

/**
 * Prepara o shader em `gl`. Devolve null sem compilar: quem chamou fica sem a mesa viva. `draw(dt)` anda `dt`
 * segundos (a luz, a cor e os toques deslizam) e desenha um quadro do tamanho do canvas.
 */
export function createAmbienceDraw(gl: WebGL2RenderingContext) {
  const program = buildProgram(gl);
  if (!program) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // Um triângulo que cobre a tela inteira.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = { size: u('size'), time: u('time'), focus: u('focus'), tone: u('tone'), danger: u('danger'), combat: u('combat'),
    flash: u('flash'), quake: u('quake'), dim: u('dim'), drift: u('drift') };

  const target: AmbienceScene = { focus: { x: .5, y: .72 }, tone: [.85, .72, .45], danger: 0, combat: false };
  const shown = { fx: .5, fy: .72, r: .85, g: .72, b: .45, danger: 0, combat: 0 };
  // Os toques somem sozinhos: o clarão em cerca de meio segundo, o tremor mais rápido; o escuro fica `ms` e volta.
  const touch = { flash: [0, 0, 0] as [number, number, number], flashAmount: 0, flashRise: 1, quake: 0, dim: 0, dimTarget: 0, dimUntil: 0 };
  let clock = 0, drift = 0;

  return {
    set(scene: AmbienceScene) { Object.assign(target, scene); },
    pulse(p: AmbiencePulse) {
      if (p.flash) { touch.flash = p.flash; touch.flashAmount = 1; touch.flashRise = 0; }
      if (p.quake) touch.quake = Math.min(1, touch.quake + p.quake);
      if (p.dim) { touch.dimTarget = Math.max(p.dim.amount, clock < touch.dimUntil ? touch.dimTarget : 0); touch.dimUntil = Math.max(touch.dimUntil, clock + p.dim.ms / 1000); }
    },
    draw(dt: number) {
      clock += dt;
      // A luz leva cerca de um segundo para trocar de lado; a vinheta, um pouco mais.
      const k = 1 - Math.exp(-dt * 3), slow = 1 - Math.exp(-dt * 1.5);
      shown.fx += (target.focus.x - shown.fx) * k; shown.fy += (target.focus.y - shown.fy) * k;
      shown.r += (target.tone[0] - shown.r) * k; shown.g += (target.tone[1] - shown.g) * k; shown.b += (target.tone[2] - shown.b) * k;
      shown.danger += (target.danger - shown.danger) * slow; shown.combat += ((target.combat ? 1 : 0) - shown.combat) * k;
      // No combate, a poeira sobe mais depressa (o relógio dela acelera, sem saltar).
      drift += dt * (1 + shown.combat * 1.6);
      // O clarão sobe em vez de estourar (flashRise) e apaga devagar.
      touch.flashRise = Math.min(1, touch.flashRise + dt * 6);
      touch.flashAmount *= Math.exp(-dt * 2); touch.quake *= Math.exp(-dt * 5);
      const dimGoal = clock < touch.dimUntil ? touch.dimTarget : 0;
      touch.dim += (dimGoal - touch.dim) * (1 - Math.exp(-dt * (dimGoal > touch.dim ? 9 : 3)));
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform1f(uniforms.time, clock);
      gl.uniform2f(uniforms.focus, shown.fx, shown.fy);
      gl.uniform3f(uniforms.tone, shown.r, shown.g, shown.b);
      gl.uniform1f(uniforms.danger, shown.danger);
      gl.uniform1f(uniforms.combat, shown.combat);
      const glow = touch.flashAmount * touch.flashRise;
      gl.uniform3f(uniforms.flash, touch.flash[0] * glow, touch.flash[1] * glow, touch.flash[2] * glow);
      gl.uniform1f(uniforms.quake, touch.quake);
      gl.uniform1f(uniforms.dim, touch.dim);
      gl.uniform1f(uniforms.drift, drift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

function buildProgram(gl: WebGL2RenderingContext) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vertex = shader(gl.VERTEX_SHADER, VERTEX), fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}
