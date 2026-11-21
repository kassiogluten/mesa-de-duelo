import test from 'node:test';
import assert from 'node:assert/strict';
const { playerProtectionHTML, playerProtectionText, protectionHaloClass } = await import('../src/ui/playerProtection.ts');
const player = protections => ({ id: 3, name: 'Ana', protections });
const names = id => ({ 3: 'Ana', 9: 'Beto' })[id] ?? '?';
const ring = { kind: 'protection', from: 'everything', source: 'The One Ring', until: 'next-turn', untilPlayer: 3 };

test('protection from everything shows a shield seal saying where it comes from and until when, with the silver halo', () => {
  const html = playerProtectionHTML(player([ring]), 3, names, null, new Set(['PROTECTION']));
  assert.match(html, /player-counter protection protection bump/);
  assert.match(html, /data-ctr="p3:PROT-protection"/);
  assert.match(html, /Proteção contra tudo, até o seu próximo turno\. Nada pode mirar neste jogador/);
  assert.match(html, /Vem de The One Ring\./);
  assert.match(playerProtectionHTML(player([ring]), 9, names), /até o próximo turno de Ana/);
  assert.equal(protectionHaloClass(player([ring])), 'prot-all');
  assert.match(playerProtectionText(player([ring])), /, tem proteção contra tudo/);
});

test('hexproof and shroud use the permanent icons and their own halo; nothing without protection', () => {
  const leyline = { kind: 'hexproof', source: 'Leyline of Sanctity' };
  const html = playerProtectionHTML(player([leyline]), 3, names);
  assert.match(html, /player-counter protection hexproof/);
  assert.match(html, /Resistência à magia\. Os oponentes não podem mirar/);
  assert.doesNotMatch(html, /até o/);
  assert.equal(protectionHaloClass(player([leyline])), 'prot-hexproof');
  assert.equal(protectionHaloClass(player([leyline, { kind: 'shroud', source: 'Gilded Light', until: 'turn' }])), 'prot-shroud');
  assert.match(playerProtectionHTML(player([{ kind: 'shroud', source: 'Gilded Light', until: 'turn' }]), 3, names), /Manto, até o fim do turno/);
  assert.equal(playerProtectionHTML(player(undefined), 3, names), '');
  assert.equal(protectionHaloClass(player([])), '');
});

test('protection from a color carries the mana symbol and the colored halo', () => {
  const red = { kind: 'protection', from: 'red', until: 'turn' };
  assert.match(playerProtectionHTML(player([red]), 3, names), /Proteção contra vermelho, até o fim do turno/);
  assert.match(playerProtectionHTML(player([red]), 3, names), /prot-pips/);
  assert.equal(protectionHaloClass(player([red])), 'prot-some');
});

test('a combat blow held by the player protection is drawn silver with "Proteção", not as a spent shield', async () => {
  const { damageLook, heldLook } = await import('../src/ui/damageEffects.ts');
  const look = damageLook({ type: 'damage', delta: -3, prevented: true, protection: true, combat: true, step: 'regular', targets: { players: [3] } });
  assert.equal(look.tone, 'protection');
  assert.deepEqual(look.badges, ['Proteção']);
  assert.equal(look.heavy, false);
  assert.equal(look.lethal, false);
  assert.ok(heldLook(look));
  assert.deepEqual(damageLook({ type: 'damage', delta: -2, prevented: true, targets: { players: [3] } }).badges, ['Prevenido']);
});
