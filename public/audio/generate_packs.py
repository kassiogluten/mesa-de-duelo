#!/usr/bin/env python3
"""Themed sound packs. Standard library only, deterministic, original synthesis.

Each pack renders the same eighteen cues as the classic set (generate.py), with the same
file names, into public/audio/<pack>/, so the game swaps packs by folder. The styles are
evocations written from scratch: no sound comes from another game (Arena reuses only
the CC0 damage takes in sources/, as the classic set does).

Run: python public/audio/generate_packs.py [pack ...] [cue ...]
"""
from pathlib import Path
import array
import json
import math
import random
import sys
import wave

from generate import RATE, TAU, OUT, add_texture, add_modes, add_drum, add_explosion, bell, render

FRAME = 1 / 60  # Chiptune pitch changes once per video frame.


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def wave_at(shape, phase, duty=.5):
    p = phase % 1
    if shape == 'square':
        return 1.0 if p < duty else -1.0
    if shape == 'tri':
        return 4 * abs(p - .5) - 1
    if shape == 'saw':
        return 2 * p - 1
    return math.sin(TAU * p)


def add_tone(buf, start, duration, f0, f1=None, shape='sine', amp=1.0, attack=.004, decay=None, release=.012,
             duty=.5, vibrato=(0, 0), tremolo=(0, 0), lowpass=None, frame=None):
    """A pitched voice gliding exponentially from f0 to f1; frame steps the glide like old consoles."""
    f1 = f1 or f0
    offset = round(start * RATE)
    a = 1 - math.exp(-TAU * lowpass / RATE) if lowpass else 1
    phase = low = lower = 0.0
    for i in range(min(round(duration * RATE), len(buf) - offset)):
        t = i / RATE
        at = t - t % frame if frame else t
        frequency = f0 * (f1 / f0) ** (at / duration)
        if vibrato[1]:
            frequency *= 1 + vibrato[1] * math.sin(TAU * vibrato[0] * t)
        phase += frequency / RATE
        envelope = min(1, t / attack, (duration - t) / release)
        if decay:
            envelope *= math.exp(-t / decay)
        if tremolo[1]:
            envelope *= 1 - tremolo[1] * (.5 + .5 * math.cos(TAU * tremolo[0] * t))
        sample = wave_at(shape, phase, duty)
        low += a * (sample - low)
        lower += a * (low - lower)
        buf[offset + i] += (lower if lowpass else sample) * amp * envelope


def add_notes(buf, start, notes, step, length=None, **voice):
    """A melody of MIDI notes, one per step; None rests."""
    for i, note in enumerate(notes):
        if note is not None:
            add_tone(buf, start + i * step, length or step, hz(note), **voice)


def add_noise8(buf, start, duration, rate0, rate1=None, amp=1.0, decay=None, seed=0, attack=.001):
    """Sample-and-hold noise, the chiptune noise channel: its clock sets the pitch of the hiss."""
    rng = random.Random(seed)
    rate1 = rate1 or rate0
    offset = round(start * RATE)
    held, clock = 0.0, 1.0
    for i in range(min(round(duration * RATE), len(buf) - offset)):
        t = i / RATE
        clock += rate0 * (rate1 / rate0) ** (t / duration) / RATE
        if clock >= 1:
            clock -= int(clock)
            held = rng.choice((-1.0, 1.0))
        envelope = min(1, t / attack, (duration - t) / .01) * (math.exp(-t / decay) if decay else 1)
        buf[offset + i] += held * amp * envelope


def add_sweep(buf, start, duration, band0, band1, amplitude, seed, envelope):
    """add_texture with a moving band: whooshes, charges and suction."""
    rng = random.Random(seed)
    low = high = smooth = 0.0
    offset = round(start * RATE)
    for i in range(min(round(duration * RATE), len(buf) - offset)):
        t = i / RATE
        x = t / duration
        a = 1 - math.exp(-TAU * band0[0] * (band1[0] / band0[0]) ** x / RATE)
        b = 1 - math.exp(-TAU * band0[1] * (band1[1] / band0[1]) ** x / RATE)
        high += b * (rng.uniform(-1, 1) - high)
        smooth += b * (high - smooth)
        low += a * (smooth - low)
        buf[offset + i] += (smooth - low) * amplitude * envelope(t)


def add_fm(buf, start, duration, carrier, ratio, index, amp=1.0, decay=.3, attack=.002, index_decay=None):
    """Two-operator FM: inharmonic ratios ring like bells and metal."""
    offset = round(start * RATE)
    for i in range(min(round(duration * RATE), len(buf) - offset)):
        t = i / RATE
        depth = index * (math.exp(-t / index_decay) if index_decay else 1)
        envelope = min(1, t / attack, (duration - t) / .015) * math.exp(-t / decay)
        buf[offset + i] += amp * envelope * math.sin(TAU * carrier * t + depth * math.sin(TAU * carrier * ratio * t))


def add_pluck(buf, start, frequency, amp=1.0, damping=.996, seed=0, brightness=1.0):
    """Karplus-Strong string; a lower brightness plucks with the thumb instead of a pick."""
    rng = random.Random(seed)
    period = max(2, round(RATE / frequency))
    line = [rng.uniform(-1, 1) for _ in range(period)]
    for k in range(1, period):
        line[k] = line[k - 1] + brightness * (line[k] - line[k - 1])
    mean = sum(line) / period
    line = [sample - mean for sample in line]
    offset = round(start * RATE)
    for i in range(len(buf) - offset):
        k = i % period
        current = line[k]
        line[k] = damping * .5 * (current + line[(k + 1) % period])
        buf[offset + i] += current * amp


def mallet(buf, start, note, amp=1.0, decay=.18):
    """Marimba bar: fundamental with the tuned fourth and tenth partials."""
    f = hz(note)
    add_modes(buf, start, [(f, 1, decay), (f * 3.98, .28, decay * .25), (f * 9.9, .06, decay * .1)], amp, attack=.001)


def coin(buf, start, base, amp=1.0, decay=.25):
    add_modes(buf, start, [(base, .5, decay), (base * 2.76, .3, decay * .7), (base * 5.40, .18, decay * .5),
                           (base * 8.93, .08, decay * .3)], amp, attack=.0008)


def wood(buf, start, base, amp=1.0, seed=0):
    add_modes(buf, start, [(base, .6, .06), (base * 2.3, .25, .03), (base * 3.9, .1, .015)], amp)
    add_texture(buf, start, .06, (base * .6, base * 9), .5 * amp, seed, lambda t: math.exp(-t / .012))


def glass(buf, start, base, amp=1.0, decay=.15):
    add_modes(buf, start, [(base, .4, decay), (base * 2.32, .25, decay * .66), (base * 4.1, .1, decay * .33)], amp, attack=.0008)


def shards(buf, start, count, span, band, seed, amp=1.0):
    rng = random.Random(seed)
    for i in range(count):
        at = start + rng.uniform(0, span) * (i / count) ** .6
        f = rng.uniform(*band)
        add_modes(buf, at, [(f, .09, .025), (f * 1.47, .04, .015)], rng.uniform(.4, 1) * amp, attack=.0008)


# 8 bits: pulse waves, a triangle bass and the noise channel; short melodic gestures.
def bits_draw(buf):
    add_notes(buf, 0, [88, 95], .045, shape='square', duty=.125, amp=.5, release=.006)


def bits_play(buf):
    add_tone(buf, 0, .09, hz(79), hz(67), shape='square', duty=.25, amp=.6, frame=FRAME)
    add_noise8(buf, 0, .04, 9000, amp=.25, decay=.01, seed=8001)


def bits_land(buf):
    add_tone(buf, 0, .28, 180, 50, shape='tri', amp=1, decay=.12, frame=FRAME)
    add_noise8(buf, 0, .09, 2500, 900, amp=.35, decay=.03, seed=8002)


def bits_cast(buf):
    add_notes(buf, 0, [72, 76, 79, 84, 88], .04, shape='square', duty=.25, amp=.45)
    add_tone(buf, .2, .38, hz(91), shape='square', duty=.125, amp=.35, decay=.15, vibrato=(9, .012))
    add_tone(buf, .2, .38, hz(79), shape='tri', amp=.4, decay=.18)


def bits_impact(buf):
    add_noise8(buf, 0, .3, 5000, 900, amp=.8, decay=.09, seed=8003)
    add_tone(buf, 0, .16, 320, 70, shape='square', amp=.35, decay=.06, frame=FRAME)


def bits_player_hit(buf):
    add_noise8(buf, 0, .7, 3500, 250, amp=.8, decay=.22, seed=8004)
    add_tone(buf, 0, .45, 160, 35, shape='tri', amp=.9, decay=.2, frame=FRAME)
    add_tone(buf, .02, .25, 240, 60, shape='square', duty=.25, amp=.25, decay=.1, frame=FRAME)


def bits_turn_self(buf):
    # Short-short-short-long fanfare, rising: your move.
    add_notes(buf, 0, [79, 84, 88], .085, length=.075, shape='square', amp=.42)
    add_tone(buf, .255, .45, hz(91), shape='square', amp=.42, decay=.3, vibrato=(7, .01))
    add_notes(buf, 0, [55, 60, 64], .085, length=.08, shape='tri', amp=.6)
    add_tone(buf, .255, .45, hz(67), shape='tri', amp=.6, decay=.3)


def bits_turn_opponent(buf):
    add_notes(buf, 0, [76, 72], .14, length=.12, shape='square', duty=.25, amp=.36)
    add_tone(buf, .28, .48, hz(69), shape='square', duty=.25, amp=.36, decay=.3, vibrato=(6, .012))
    add_notes(buf, 0, [52, 48], .14, length=.13, shape='tri', amp=.7)
    add_tone(buf, .28, .48, hz(45), shape='tri', amp=.7, decay=.3)


def bits_wing(buf):
    for start, seed in [(0, 8005), (.17, 8006)]:
        add_tone(buf, start, .11, 500, 1300, shape='square', duty=.125, amp=.25, decay=.06, frame=FRAME / 2)
        add_noise8(buf, start, .12, 6000, 12000, amp=.25, decay=.04, seed=seed)


def bits_ability(buf):
    add_notes(buf, 0, [93, None, 93, 98], .035, length=.03, shape='square', duty=.125, amp=.45)


def bits_resolved(buf):
    add_notes(buf, 0, [84, 91], .06, length=.07, shape='tri', amp=.7, decay=.06)


def bits_countered(buf):
    add_tone(buf, 0, .32, 1400, 120, shape='square', amp=.4, frame=FRAME)
    add_noise8(buf, .3, .06, 7000, amp=.3, decay=.015, seed=8007)


def bits_attack(buf):
    add_noise8(buf, 0, .32, 600, 7000, amp=.5, seed=8008, attack=.15)
    add_tone(buf, 0, .32, 180, 720, shape='square', duty=.25, amp=.3, attack=.12, frame=FRAME)


def bits_block(buf):
    add_tone(buf, 0, .25, hz(81), shape='square', amp=.3, decay=.07)
    add_tone(buf, 0, .25, hz(82), shape='square', duty=.25, amp=.3, decay=.07)
    add_noise8(buf, 0, .05, 11000, amp=.5, decay=.012, seed=8009)


def bits_heal(buf):
    add_notes(buf, 0, [84, 88, 91, 96], .06, length=.055, shape='square', duty=.25, amp=.35)
    add_tone(buf, .24, .32, hz(100), shape='square', duty=.125, amp=.28, decay=.14, vibrato=(10, .01))
    add_notes(buf, 0, [72, 76, 79, 84], .06, shape='tri', amp=.45)


def bits_poison(buf):
    for note, start in [(62, 0), (59, .13), (55, .26)]:
        add_tone(buf, start, .11, hz(note), hz(note - 5), shape='square', amp=.32, vibrato=(16, .04), frame=FRAME)
    add_noise8(buf, 0, .4, 700, 300, amp=.12, decay=.3, seed=8010)


def bits_shield(buf):
    add_tone(buf, 0, .5, hz(88), shape='square', duty=.25, amp=.28, attack=.02, decay=.25, tremolo=(18, .5))
    add_tone(buf, 0, .5, hz(95), shape='square', duty=.125, amp=.2, attack=.04, decay=.2, tremolo=(18, .5))
    add_tone(buf, 0, .5, hz(76), shape='tri', amp=.4, attack=.02, decay=.25)


def bits_shatter(buf):
    add_noise8(buf, 0, .14, 9000, 3000, amp=.7, decay=.04, seed=8011)
    rng = random.Random(8012)
    for i in range(9):
        note = rng.choice([96, 98, 100, 103, 105, 107]) - i
        add_tone(buf, .04 + i * .045, .04, hz(note), shape='square', duty=.125, amp=.25 * (1 - i / 12), decay=.02)


# Fantasia: harp, bells, brass calls and choir pads in a large hall.
def fantasy_draw(buf):
    add_texture(buf, 0, .22, (900, 5200), 1, 9101, lambda t: bell(t, .07, .04) + .4 * bell(t, .15, .04))
    add_fm(buf, .08, .4, hz(100), 3.5, 1.1, amp=.22, decay=.12, index_decay=.05)


def fantasy_play(buf):
    add_modes(buf, 0, [(150, .5, .04), (260, .2, .025)])
    add_texture(buf, 0, .08, (150, 1500), .7, 9102, lambda t: math.exp(-t / .02))
    add_pluck(buf, .01, hz(67), amp=.35, damping=.995, seed=9103, brightness=.5)


def fantasy_land(buf):
    add_drum(buf, 0, 70, 30, .14, .9)
    add_texture(buf, 0, .15, (60, 900), 1, 9104, lambda t: math.exp(-t / .05))
    for note in (45, 52, 57):
        add_tone(buf, .02, .55, hz(note), amp=.18, attack=.08, decay=.25)


def fantasy_cast(buf):
    # Harp glissando on a pentatonic scale, then a bell bloom.
    for i, note in enumerate([62, 64, 67, 69, 71, 74, 76, 79]):
        add_pluck(buf, i * .028, hz(note), amp=.3, damping=.996, seed=9110 + i, brightness=.6)
    add_fm(buf, .24, .6, hz(86), 3.5, 1.4, amp=.3, decay=.25, index_decay=.1)
    add_fm(buf, .26, .6, hz(93), 3.5, 1.0, amp=.18, decay=.2, index_decay=.08)
    add_sweep(buf, 0, .5, (400, 2000), (1500, 7000), .35, 9105, lambda t: bell(t, .25, .14))


def fantasy_impact(buf):
    add_drum(buf, 0, 95, 60, .06, .7)
    add_texture(buf, 0, .3, (300, 4800), 1, 9106, lambda t: math.exp(-t / .05))
    add_fm(buf, 0, .4, 420, 1.41, 3, amp=.25, decay=.1, index_decay=.04)


def fantasy_player_hit(buf):
    add_drum(buf, 0, 48, 50, .2, 1)
    add_texture(buf, 0, .6, (80, 2600), 1.1, 9107, lambda t: math.exp(-t / .13))
    add_fm(buf, 0, .7, 110, 1.73, 4, amp=.25, decay=.2, index_decay=.1)


def fantasy_turn_self(buf):
    # A brass call rising D-A-D, over a timpani stroke on the last note.
    for start, note, length in [(0, 62, .12), (.13, 69, .12), (.26, 74, .55)]:
        add_tone(buf, start, length, hz(note), shape='saw', amp=.35, attack=.025, decay=.6, lowpass=1400)
        add_tone(buf, start, length, hz(note - 12), shape='saw', amp=.2, attack=.03, decay=.6, lowpass=700)
    add_fm(buf, .26, .6, hz(86), 3.5, 1.0, amp=.12, decay=.25, index_decay=.1)
    add_drum(buf, .26, 80, 25, .12, .4)


def fantasy_turn_opponent(buf):
    # Low horns falling a half step, with heavy drums: something stirs across the table.
    for start, note, length in [(0, 45, .3), (.32, 44, .62)]:
        add_tone(buf, start, length, hz(note), shape='saw', amp=.4, attack=.06, decay=.7, lowpass=600)
        add_tone(buf, start, length, hz(note + 3), shape='saw', amp=.2, attack=.08, decay=.7, lowpass=500)
    add_drum(buf, 0, 55, 30, .2, .6)
    add_drum(buf, .32, 45, 30, .25, .8)


def fantasy_wing(buf):
    add_texture(buf, 0, .5, (200, 2000), 1, 9108, lambda t: bell(t, .11, .06) + .6 * bell(t, .3, .08))
    for i, note in enumerate([96, 100, 103]):
        add_fm(buf, .05 + i * .07, .35, hz(note), 3.5, .8, amp=.08, decay=.1)


def fantasy_ability(buf):
    add_fm(buf, 0, .5, hz(81), 2.0, 1.5, amp=.35, decay=.18, index_decay=.05)
    add_fm(buf, .06, .5, hz(88), 2.0, 1.2, amp=.3, decay=.16, index_decay=.05)
    add_texture(buf, 0, .03, (2000, 8000), .4, 9109, lambda t: math.exp(-t / .005))


def fantasy_resolved(buf):
    for i, note in enumerate([93, 88]):
        add_fm(buf, i * .06, .3, hz(note), 3.5, .7, amp=.2, decay=.09)
    add_texture(buf, 0, .2, (2000, 7000), .1, 9120, lambda t: bell(t, .05, .04))


def fantasy_countered(buf):
    # Magic drawn inward, then a dissonant bell cut short.
    add_sweep(buf, 0, .22, (3000, 7000), (300, 1500), .7, 9121, lambda t: (t / .22) ** 1.8)
    add_fm(buf, .22, .4, hz(78), 1.414, 3, amp=.3, decay=.08, index_decay=.03)
    add_fm(buf, .22, .4, hz(84), 1.414, 3, amp=.25, decay=.07, index_decay=.03)


def fantasy_attack(buf):
    add_sweep(buf, 0, .38, (200, 1200), (900, 5000), 1, 9122, lambda t: bell(t, .2, .08))
    add_modes(buf, .22, [(2400, .08, .2), (3610, .05, .15)], attack=.003)


def fantasy_block(buf):
    add_modes(buf, 0, [(1180, .4, .2), (1923, .3, .15), (2871, .2, .1), (4105, .1, .06)], attack=.001)
    add_texture(buf, 0, .04, (1000, 7000), .7, 9123, lambda t: math.exp(-t / .006))
    add_modes(buf, 0, [(240, .2, .03)])


def fantasy_heal(buf):
    for i, note in enumerate([67, 71, 74, 79, 83, 86]):
        add_pluck(buf, i * .05, hz(note), amp=.28, damping=.997, seed=9130 + i, brightness=.55)
    for note in (67, 71, 74):
        for detune in (-.004, .004):
            add_tone(buf, .05, .75, hz(note) * (1 + detune), amp=.07, attack=.2, release=.3)


def fantasy_poison(buf):
    for start, note, amplitude in [(0, 130, .7), (.12, 98, .6), (.22, 150, .5), (.36, 110, .65)]:
        add_drum(buf, start, note, -30, .06, amplitude)
    add_fm(buf, 0, .6, hz(50), 1.06, 2, amp=.2, decay=.25)
    add_texture(buf, 0, .55, (250, 1800), .25, 9131, lambda t: bell(t, .25, .17))


def fantasy_shield(buf):
    for note, amplitude in [(76, .25), (83, .18), (88, .12)]:
        add_tone(buf, 0, .7, hz(note), amp=amplitude, attack=.06, decay=.3, tremolo=(7, .35))
    add_fm(buf, 0, .5, hz(95), 3.5, 1, amp=.12, decay=.15)
    add_texture(buf, 0, .3, (1500, 6000), .2, 9132, lambda t: bell(t, .06, .05))


def fantasy_shatter(buf):
    add_texture(buf, 0, .05, (900, 7000), 1, 9133, lambda t: math.exp(-t / .008))
    shards(buf, .02, 16, .45, (2500, 6000), 9134, .9)
    for i, note in enumerate([100, 96, 93, 88]):
        add_fm(buf, .08 + i * .07, .4, hz(note), 3.5, .6, amp=.07, decay=.1)


# Aventura fofa: marimba, toy bells, bubbles, bonks and slide whistles.
def pop(buf, start, f0, f1, amp, duration=.05):
    add_tone(buf, start, duration, f0, f1, amp=amp, attack=.001, decay=duration / 3)


def cute_draw(buf):
    pop(buf, 0, 900, 1600, .5, .04)
    mallet(buf, .03, 96, .35, .12)


def cute_play(buf):
    pop(buf, 0, 700, 260, .8, .06)
    mallet(buf, 0, 72, .2, .1)


def cute_land(buf):
    mallet(buf, 0, 55, .8, .25)
    mallet(buf, .06, 62, .4, .2)
    add_tone(buf, 0, .25, 140, 90, amp=.3, decay=.1, vibrato=(28, .06))


def cute_cast(buf):
    for i, note in enumerate([84, 88, 91, 96]):
        mallet(buf, i * .055, note, .5, .2)
    rng = random.Random(10101)
    for i in range(6):
        add_fm(buf, .18 + i * .045, .25, hz(rng.choice([100, 103, 105, 108])), 2.0, .8, amp=.1, decay=.07)


def cute_impact(buf):
    # Cartoon bonk: a falling sine on a wooden knock.
    add_tone(buf, 0, .18, 700, 160, amp=.8, decay=.06)
    add_modes(buf, 0, [(480, .4, .03), (1100, .15, .015)])
    add_texture(buf, 0, .02, (1500, 6000), .4, 10102, lambda t: math.exp(-t / .004))


def cute_player_hit(buf):
    add_tone(buf, 0, .3, 500, 90, amp=.8, decay=.12)
    add_texture(buf, 0, .2, (200, 3000), 1, 10103, lambda t: math.exp(-t / .05))
    add_tone(buf, .08, .45, 1400, 500, amp=.25, attack=.02, decay=.3, vibrato=(6, .01))


def cute_turn_self(buf):
    for i, (note, decay) in enumerate([(72, .15), (76, .15), (79, .15), (84, .4)]):
        mallet(buf, i * .08, note, .6, decay)
    add_fm(buf, .24, .5, hz(96), 2.0, 1, amp=.15, decay=.2)


def cute_turn_opponent(buf):
    for start, note in [(0, 79), (.16, 72)]:
        mallet(buf, start, note, .55, .3)
        mallet(buf, start, note - 12, .4, .35)


def cute_wing(buf):
    for start in (0, .16):
        add_tone(buf, start, .12, 900, 1500, amp=.3, decay=.06, vibrato=(30, .05))
    add_texture(buf, 0, .35, (400, 3000), .25, 10104, lambda t: bell(t, .06, .04) + bell(t, .22, .04))


def cute_ability(buf):
    add_fm(buf, 0, .4, hz(93), 2.0, 1, amp=.4, decay=.15, index_decay=.05)
    add_texture(buf, 0, .02, (2000, 7000), .3, 10105, lambda t: math.exp(-t / .004))


def cute_resolved(buf):
    pop(buf, 0, 600, 1100, .5)
    pop(buf, .07, 800, 1400, .4)


def cute_countered(buf):
    add_tone(buf, 0, .35, 1600, 300, amp=.4, attack=.02, vibrato=(7, .015))
    add_texture(buf, .3, .15, (300, 3000), .7, 10106, lambda t: bell(t, .04, .03))


def cute_attack(buf):
    add_sweep(buf, 0, .25, (300, 1500), (1200, 6000), .6, 10107, lambda t: bell(t, .1, .05))
    add_tone(buf, .05, .18, 400, 1600, amp=.3, decay=.1)


def cute_block(buf):
    # A spring: pitch wobble that dies out.
    add_tone(buf, 0, .4, 200, 170, amp=.6, decay=.15, vibrato=(20, .15))
    add_modes(buf, 0, [(520, .4, .03), (1180, .15, .012)])


def cute_heal(buf):
    for i, note in enumerate([84, 88, 91, 96, 100]):
        add_fm(buf, i * .05, .4, hz(note), 2.0, .8, amp=.25, decay=.15)
    rng = random.Random(10108)
    for i in range(5):
        add_tone(buf, .25 + i * .04, .1, hz(rng.choice([103, 105, 108])), amp=.08, decay=.04)


def cute_poison(buf):
    for start, f in [(0, 420), (.13, 340), (.26, 280)]:
        add_tone(buf, start, .12, f, f * .6, amp=.5, decay=.06, vibrato=(25, .05))


def cute_shield(buf):
    add_tone(buf, 0, .5, hz(76), amp=.25, attack=.03, decay=.25, vibrato=(5, .02), tremolo=(12, .3))
    mallet(buf, 0, 88, .3, .2)
    mallet(buf, .05, 95, .2, .15)


def cute_shatter(buf):
    shards(buf, 0, 10, .3, (3000, 6000), 10109)
    pop(buf, .3, 500, 900, .4)


# Arena épica: weight first. Thick drums, metal, war horns and big magic.
def arena_draw(buf):
    add_texture(buf, 0, .1, (1500, 7000), .8, 11101, lambda t: bell(t, .03, .02))
    add_texture(buf, .07, .03, (2500, 8000), .6, 11102, lambda t: math.exp(-t / .004))
    add_drum(buf, .07, 90, 20, .04, .15)


def arena_play(buf):
    add_drum(buf, 0, 80, 40, .07, .8)
    add_texture(buf, 0, .08, (100, 1800), .8, 11103, lambda t: math.exp(-t / .03))
    add_modes(buf, 0, [(210, .2, .03)])


def arena_land(buf):
    add_drum(buf, 0, 45, 40, .2, 1)
    add_texture(buf, 0, .3, (40, 700), 1.2, 11104, lambda t: math.exp(-t / .12))
    add_modes(buf, .04, [(900, .2, .02), (1400, .1, .012)], attack=.001)
    add_texture(buf, .04, .1, (900, 4000), .3, 11105, lambda t: math.exp(-t / .02))


def arena_cast(buf):
    # Power gathers, then lands.
    add_sweep(buf, 0, .38, (300, 1500), (1200, 7000), .8, 11106, lambda t: (t / .38) ** 2)
    for note in (50, 57, 62):
        add_tone(buf, 0, .4, hz(note), shape='saw', amp=.12, attack=.3, lowpass=1200)
    add_drum(buf, .37, 110, 60, .08, .8)
    add_fm(buf, .37, .5, 330, 1.41, 3, amp=.3, decay=.15, index_decay=.05)


def arena_impact(buf):
    add_explosion(buf, 'creature', speed=1.4, cutoff=3200, decay=.16, amplitude=1.4)
    add_drum(buf, 0, 75, 60, .05, .5)
    add_modes(buf, 0, [(1800, .1, .05)], attack=.001)


def arena_player_hit(buf):
    add_explosion(buf, 'player', speed=.7, cutoff=2000, decay=.5, amplitude=1.4)
    add_drum(buf, 0, 38, 40, .25, .5)
    add_texture(buf, 0, .7, (30, 300), .8, 11107, lambda t: math.exp(-t / .25))


def arena_turn_self(buf):
    # War horn on a fifth over three drum strokes.
    for start, amplitude in [(0, .6), (.12, .7), (.24, 1)]:
        add_drum(buf, start, 70, 35, .12, amplitude)
    for note, amplitude in [(50, .3), (57, .22), (62, .1)]:
        add_tone(buf, .24, .7, hz(note), shape='saw', amp=amplitude, attack=.06, decay=.5, lowpass=900)


def arena_turn_opponent(buf):
    # A low gong: inharmonic bronze with a long decay.
    add_modes(buf, 0, [(110, .5, .6), (167, .35, .5), (231, .25, .4), (298, .15, .3), (411, .08, .2)], attack=.004)
    add_drum(buf, 0, 50, 30, .2, .7)
    add_texture(buf, 0, .1, (100, 2000), .5, 11108, lambda t: math.exp(-t / .03))


def arena_wing(buf):
    add_texture(buf, 0, .55, (90, 900), 1.2, 11109, lambda t: bell(t, .14, .07) + .8 * bell(t, .38, .08))
    add_drum(buf, .1, 60, 10, .06, .2)
    add_drum(buf, .34, 55, 10, .06, .18)


def arena_ability(buf):
    for start in (0, .05):
        add_modes(buf, start, [(2600, .2, .02), (3900, .08, .012)], attack=.001)
    add_sweep(buf, 0, .2, (500, 3000), (1500, 8000), .4, 11110, lambda t: bell(t, .08, .04))
    add_drum(buf, 0, 100, 30, .04, .3)


def arena_resolved(buf):
    add_drum(buf, 0, 90, 20, .05, .5)
    add_texture(buf, 0, .15, (200, 1500), .4, 11111, lambda t: bell(t, .04, .03))


def arena_countered(buf):
    add_tone(buf, 0, .3, 400, 60, shape='saw', amp=.5, decay=.15, lowpass=1200)
    add_texture(buf, .2, .06, (1600, 7000), .8, 11112, lambda t: math.exp(-t / .008))
    add_modes(buf, .2, [(2100, .15, .02), (3300, .07, .012)], attack=.001)


def arena_attack(buf):
    add_sweep(buf, 0, .42, (150, 800), (600, 3500), 1.2, 11113, lambda t: bell(t, .2, .09))
    add_texture(buf, .1, .2, (3000, 8000), .15, 11114, lambda t: bell(t, .1, .06))
    add_drum(buf, .32, 70, 40, .08, .5)


def arena_block(buf):
    add_modes(buf, 0, [(380, .5, .18), (640, .35, .14), (1020, .25, .1), (1530, .12, .07)], attack=.0015)
    add_drum(buf, 0, 100, 40, .05, .4)
    add_texture(buf, 0, .05, (800, 5000), .7, 11115, lambda t: math.exp(-t / .008))


def arena_heal(buf):
    for note in (62, 66, 69):
        add_tone(buf, 0, .65, hz(note), shape='saw', amp=.1, attack=.15, release=.25, lowpass=1600)
    for i, note in enumerate([86, 90, 93]):
        add_fm(buf, .1 + i * .08, .45, hz(note), 3.5, .8, amp=.15, decay=.18)


def arena_poison(buf):
    add_texture(buf, 0, .5, (2500, 8000), .4, 11116, lambda t: bell(t, .12, .1))
    for start, note in [(.05, 90), (.18, 70), (.3, 85)]:
        add_drum(buf, start, note, -25, .08, .7)


def arena_shield(buf):
    for f, amplitude in [(220, .25), (223, .25), (440, .1)]:
        add_tone(buf, 0, .6, f, amp=amplitude, attack=.05, decay=.3, tremolo=(9, .4))
    add_modes(buf, 0, [(1760, .15, .2), (2637, .08, .15)], attack=.004)
    add_sweep(buf, 0, .3, (2000, 6000), (800, 3000), .25, 11117, lambda t: math.exp(-t / .08))


def arena_shatter(buf):
    add_texture(buf, 0, .06, (500, 6000), 1, 11118, lambda t: math.exp(-t / .01))
    shards(buf, .02, 18, .45, (900, 3000), 11119, 1.2)
    add_texture(buf, 0, .6, (40, 500), .6, 11120, lambda t: math.exp(-t / .2))
    add_drum(buf, 0, 60, 40, .1, .5)


# Discreto: small taps and soft tones, low and short. Feedback, not spectacle.
def quiet_draw(buf):
    add_texture(buf, 0, .06, (1500, 6000), 1, 12101, lambda t: math.exp(-t / .012))


def quiet_play(buf):
    add_modes(buf, 0, [(330, .6, .03), (700, .15, .01)])


def quiet_land(buf):
    add_modes(buf, 0, [(180, .7, .05), (410, .15, .02)])


def quiet_cast(buf):
    add_tone(buf, 0, .12, hz(76), amp=.6, decay=.04)
    add_tone(buf, .07, .15, hz(83), amp=.6, decay=.05)


def quiet_impact(buf):
    add_drum(buf, 0, 120, 30, .04, .8)
    add_texture(buf, 0, .05, (100, 1200), .5, 12102, lambda t: math.exp(-t / .015))


def quiet_player_hit(buf):
    add_drum(buf, 0, 80, 30, .07, .8)
    add_drum(buf, .09, 70, 30, .07, .6)


def quiet_turn_self(buf):
    add_tone(buf, 0, .2, hz(81), amp=.5, decay=.08)
    add_tone(buf, .11, .3, hz(88), amp=.5, decay=.12)


def quiet_turn_opponent(buf):
    add_tone(buf, 0, .2, hz(76), amp=.5, decay=.08)
    add_tone(buf, .13, .3, hz(69), amp=.5, decay=.12)


def quiet_wing(buf):
    add_texture(buf, 0, .14, (300, 2000), 1, 12103, lambda t: bell(t, .06, .03))


def quiet_ability(buf):
    for start, seed in [(0, 12104), (.05, 12105)]:
        add_modes(buf, start, [(1500, .3, .008)], attack=.001)
        add_texture(buf, start, .02, (1500, 6000), .3, seed, lambda t: math.exp(-t / .003))


def quiet_resolved(buf):
    add_modes(buf, 0, [(900, .25, .02)])


def quiet_countered(buf):
    add_tone(buf, 0, .08, hz(74), amp=.6, decay=.03)
    add_tone(buf, .07, .1, hz(67), amp=.6, decay=.03)


def quiet_attack(buf):
    add_texture(buf, 0, .22, (300, 3000), 1, 12106, lambda t: bell(t, .1, .05))


def quiet_block(buf):
    add_modes(buf, 0, [(420, .6, .04), (980, .2, .015)])
    add_texture(buf, 0, .02, (800, 5000), .3, 12107, lambda t: math.exp(-t / .004))


def quiet_heal(buf):
    add_tone(buf, 0, .3, hz(72), hz(84), amp=.5, attack=.02, decay=.15)


def quiet_poison(buf):
    add_tone(buf, 0, .15, 300, 180, amp=.6, decay=.05)


def quiet_shield(buf):
    add_tone(buf, 0, .3, hz(93), amp=.35, decay=.1)
    add_tone(buf, 0, .3, hz(100), amp=.15, decay=.08)


def quiet_shatter(buf):
    shards(buf, 0, 4, .12, (2500, 5000), 12108)


# Taverna: a wooden table, real cards, mugs, coins, dice and a lute.
def tavern_draw(buf):
    add_texture(buf, 0, .1, (1500, 7000), 1, 13101, lambda t: bell(t, .05, .03))
    add_texture(buf, .08, .03, (2000, 8000), .9, 13102, lambda t: math.exp(-t / .004))


def tavern_play(buf):
    # A card slapped on the table.
    add_texture(buf, 0, .06, (300, 4000), 1, 13103, lambda t: math.exp(-t / .01))
    add_modes(buf, 0, [(230, .3, .05), (520, .1, .02)])


def tavern_land(buf):
    # A heavy mug set down, the handle clinking.
    wood(buf, 0, 120, 1, 13104)
    add_texture(buf, 0, .1, (60, 800), .8, 13105, lambda t: math.exp(-t / .03))
    glass(buf, .03, 1900, .1)


def tavern_cast(buf):
    # Lute strum on D major.
    for i, note in enumerate([50, 57, 62, 66, 69]):
        add_pluck(buf, i * .018, hz(note), amp=.3, damping=.995, seed=13110 + i, brightness=.7)


def tavern_impact(buf):
    # A fist on the table; the mugs jump.
    add_drum(buf, 0, 90, 30, .06, .6)
    wood(buf, 0, 100, .8, 13106)
    for start, base in [(.03, 1700), (.06, 2100), (.09, 1850)]:
        glass(buf, start, base, .12, .08)


def tavern_player_hit(buf):
    add_drum(buf, 0, 55, 30, .15, 1)
    wood(buf, 0, 80, 1, 13107)
    add_texture(buf, 0, .4, (80, 2500), .9, 13108, lambda t: math.exp(-t / .12))
    rng = random.Random(13109)
    for i in range(6):
        coin(buf, .05 + rng.uniform(0, .35), rng.uniform(2600, 3600), .18, .12)


def tavern_turn_self(buf):
    # A coin tossed onto the table, bouncing to rest.
    for start, amplitude in [(0, .6), (.22, .4), (.34, .25), (.41, .15), (.45, .08)]:
        coin(buf, start, 3200, amplitude, .3)
    add_pluck(buf, 0, hz(74), amp=.15, damping=.996, seed=13111, brightness=.5)


def tavern_turn_opponent(buf):
    add_pluck(buf, 0, hz(57), amp=.45, damping=.996, seed=13112, brightness=.4)
    add_pluck(buf, .25, hz(50), amp=.5, damping=.996, seed=13113, brightness=.4)
    wood(buf, .25, 140, .5, 13114)


def tavern_wing(buf):
    add_texture(buf, 0, .4, (150, 1500), 1, 13115, lambda t: bell(t, .1, .05) + .7 * bell(t, .27, .06))


def tavern_ability(buf):
    # Dice rolling across the boards.
    rng = random.Random(13116)
    at, gap = 0.0, .045
    for i in range(9):
        f = rng.uniform(1800, 2600)
        add_modes(buf, at, [(f, .3, .01), (f * 2.7, .1, .006)], 1 - i / 12, attack=.0008)
        at += gap * rng.uniform(.6, 1.2)
        gap *= .85


def tavern_resolved(buf):
    add_pluck(buf, 0, hz(69), amp=.4, damping=.993, seed=13117, brightness=.5)


def tavern_countered(buf):
    # A strum muted by the palm.
    for i, note in enumerate([50, 57, 62, 65]):
        add_pluck(buf, i * .015, hz(note), amp=.35, damping=.97, seed=13118 + i, brightness=.6)
    wood(buf, .07, 180, .6, 13122)


def tavern_attack(buf):
    # Boots stomping forward.
    for start, seed in [(0, 13123), (.14, 13124)]:
        wood(buf, start, 95, .9, seed)
    add_texture(buf, 0, .3, (300, 2500), .4, 13125, lambda t: bell(t, .15, .07))


def tavern_block(buf):
    wood(buf, 0, 210, 1, 13126)
    wood(buf, .01, 150, .6, 13127)


def tavern_heal(buf):
    # Pouring, then a toast.
    rng = random.Random(13128)
    for i in range(10):
        f = rng.uniform(300, 650)
        add_tone(buf, i * .028, .04, f, f * 1.4, amp=.25, decay=.015)
    glass(buf, .32, 2100, .6, .25)
    glass(buf, .335, 2350, .5, .22)


def tavern_poison(buf):
    # A bubbling cauldron.
    rng = random.Random(13129)
    for i in range(8):
        add_drum(buf, i * .075 + rng.uniform(0, .03), rng.uniform(90, 170), -30, .05, rng.uniform(.4, .8))
    add_texture(buf, 0, .65, (100, 900), .2, 13130, lambda t: bell(t, .3, .2))


def tavern_shield(buf):
    # A spinning coin, wobbling faster as it settles.
    coin(buf, 0, 2900, .5, .2)
    add_tone(buf, 0, .65, 2900, amp=.18, attack=.01, decay=.3, tremolo=(14, .8))
    add_tone(buf, 0, .65, 2900 * 2.76, amp=.06, attack=.01, decay=.2, tremolo=(14, .8))


def tavern_shatter(buf):
    # A glass mug breaking.
    add_texture(buf, 0, .05, (800, 7000), 1, 13131, lambda t: math.exp(-t / .007))
    shards(buf, .02, 14, .4, (2400, 5600), 13132)
    wood(buf, 0, 110, .4, 13133)


# Ficção científica: beeps, lasers, servos and force fields.
def scifi_draw(buf):
    add_noise8(buf, 0, .04, 12000, 4000, amp=.25, decay=.015, seed=14101)
    add_tone(buf, .02, .06, 2200, 3000, amp=.4, decay=.025)


def scifi_play(buf):
    add_tone(buf, 0, .12, 300, 500, shape='saw', amp=.3, lowpass=1500)
    add_texture(buf, .11, .02, (1500, 7000), .4, 14102, lambda t: math.exp(-t / .004))


def scifi_land(buf):
    # A magnetic clamp locking into place.
    add_tone(buf, 0, .35, 90, 55, shape='saw', amp=.6, decay=.12, lowpass=500)
    add_modes(buf, .02, [(620, .3, .08), (1310, .15, .05)], attack=.001)
    add_texture(buf, .02, .02, (1500, 7000), .5, 14103, lambda t: math.exp(-t / .004))


def scifi_cast(buf):
    # Charging up, then release.
    add_tone(buf, 0, .5, 200, 1800, amp=.4, attack=.05, tremolo=(30, .4))
    add_tone(buf, 0, .5, 400, 3600, shape='tri', amp=.12, attack=.05)
    add_tone(buf, .5, .2, 1800, 1200, amp=.35, decay=.08)


def scifi_impact(buf):
    add_tone(buf, 0, .15, 3000, 250, amp=.5, decay=.06)
    add_noise8(buf, 0, .2, 8000, 1500, amp=.4, decay=.06, seed=14104)


def scifi_player_hit(buf):
    add_tone(buf, 0, .5, 800, 40, shape='saw', amp=.5, decay=.2, lowpass=1800)
    add_noise8(buf, 0, .6, 6000, 400, amp=.5, decay=.2, seed=14105)
    add_drum(buf, 0, 50, 30, .15, .5)


def scifi_turn_self(buf):
    add_notes(buf, 0, [81, 86, 93], .09, length=.08, amp=.45, decay=.05)
    add_fm(buf, .18, .35, hz(93), 1.0, .5, amp=.25, decay=.12)


def scifi_turn_opponent(buf):
    add_notes(buf, 0, [74, 69], .18, length=.14, shape='square', amp=.25, lowpass=1500)
    add_tone(buf, 0, .5, 55, shape='saw', amp=.2, attack=.05, decay=.3, lowpass=300)


def scifi_wing(buf):
    add_sweep(buf, 0, .45, (300, 2500), (1200, 8000), 1, 14106, lambda t: bell(t, .2, .1))
    add_tone(buf, 0, .45, 300, 600, amp=.12, attack=.1, release=.15)


def scifi_ability(buf):
    add_notes(buf, 0, [96, 91], .05, length=.04, shape='square', amp=.25, lowpass=4000)


def scifi_resolved(buf):
    add_tone(buf, 0, .1, 600, 900, amp=.45, decay=.04)


def scifi_countered(buf):
    # Error buzz.
    add_tone(buf, 0, .3, 110, shape='saw', amp=.45, tremolo=(25, .6), lowpass=2500)
    add_tone(buf, 0, .3, 116.5, shape='saw', amp=.3, tremolo=(25, .6), lowpass=2500)
    add_tone(buf, .28, .1, 400, 150, amp=.3, decay=.04)


def scifi_attack(buf):
    add_tone(buf, 0, .12, 2600, 400, amp=.5, decay=.05)
    add_tone(buf, .13, .12, 2400, 350, amp=.5, decay=.05)


def scifi_block(buf):
    # Energy deflected: a ring-modulated metal ping.
    add_tone(buf, 0, .35, 1200, amp=.35, decay=.1, tremolo=(170, 1))
    add_modes(buf, 0, [(1850, .2, .08), (2930, .1, .05)], attack=.001)
    add_noise8(buf, 0, .03, 10000, amp=.3, decay=.008, seed=14107)


def scifi_heal(buf):
    for i, note in enumerate([84, 88, 91, 96, 100]):
        for detune in (-.003, .003):
            add_tone(buf, i * .05, .3, hz(note) * (1 + detune), amp=.12, decay=.1)
    add_tone(buf, 0, .45, 600, 2400, amp=.06, attack=.1)


def scifi_poison(buf):
    # Geiger counter over a dirty hum.
    rng = random.Random(14108)
    for i in range(14):
        add_texture(buf, rng.uniform(0, .55), .01, (2000, 9000), rng.uniform(.4, 1), 14110 + i,
                    lambda t: math.exp(-t / .0015))
    add_tone(buf, 0, .6, 60, shape='saw', amp=.2, tremolo=(8, .5), lowpass=300)


def scifi_shield(buf):
    add_tone(buf, 0, .6, 110, 220, shape='saw', amp=.35, attack=.15, decay=.4, lowpass=900)
    add_tone(buf, 0, .6, 880, amp=.12, attack=.2, tremolo=(16, .6))


def scifi_shatter(buf):
    rng = random.Random(14109)
    for i in range(5):
        add_noise8(buf, i * .05, .04, rng.uniform(2000, 12000), amp=.5, decay=.02, seed=14130 + i)
    for i in range(6):
        add_tone(buf, .05 + i * .05, .04, hz(rng.choice([88, 91, 95, 98]) - 2 * i), shape='square', amp=.18,
                 lowpass=5000, decay=.02)


# Pack folder -> (early reflections, [(file, material, duration, first-pass peak, room, composer)]).
# Files match the classic set (generate.DESIGNS); a missing cue would fall silent in that pack.
PACKS = {
    '8bits': (((.023, 1), (.047, .5)), [
        ('01-card-draw', 'pulse / two-note blip', .14, .26, 0, bits_draw),
        ('02-card-play', 'pulse and noise / short drop', .14, .26, 0, bits_play),
        ('03-land', 'triangle bass / falling thump', .32, .40, .02, bits_land),
        ('04-cast', 'pulse arpeggio / held note', .62, .36, .05, bits_cast),
        ('05-impact', 'noise channel / short burst', .34, .44, .02, bits_impact),
        ('06-turn', 'pulse and triangle / rising fanfare', .76, .42, .06, bits_turn_self),
        ('07-wing', 'pulse sweeps / two flaps', .32, .24, 0, bits_wing),
        ('08-player-hit', 'noise and triangle / long blast', .74, .48, .04, bits_player_hit),
        ('09-opponent-turn', 'pulse and triangle / falling call', .80, .42, .06, bits_turn_opponent),
        ('10-ability', 'pulse / select blips', .18, .28, 0, bits_ability),
        ('11-resolved', 'triangle / two soft notes', .16, .18, 0, bits_resolved),
        ('12-countered', 'pulse / stepped fall', .40, .34, .02, bits_countered),
        ('13-attack', 'noise and pulse / rising rush', .36, .34, .02, bits_attack),
        ('14-block', 'detuned pulses / clang', .28, .36, .03, bits_block),
        ('15-heal', 'pulse arpeggio / sparkle', .58, .30, .04, bits_heal),
        ('16-poison', 'wobbling pulses / three drops', .44, .32, .02, bits_poison),
        ('17-shield', 'tremolo pulses / shimmer', .52, .30, .04, bits_shield),
        ('18-shatter', 'noise and blips / falling bits', .48, .38, .02, bits_shatter),
    ]),
    'fantasia': (((.031, 1), (.067, .7), (.113, .5), (.171, .3)), [
        ('01-card-draw', 'parchment and sparkle', .52, .26, .08, fantasy_draw),
        ('02-card-play', 'soft contact and harp', .60, .26, .08, fantasy_play),
        ('03-land', 'drum and open fifth', .66, .42, .12, fantasy_land),
        ('04-cast', 'harp glissando and bells', .95, .40, .16, fantasy_cast),
        ('05-impact', 'magic burst', .46, .44, .08, fantasy_impact),
        ('06-turn', 'brass call and timpani', .92, .44, .14, fantasy_turn_self),
        ('07-wing', 'feathers and chimes', .55, .26, .08, fantasy_wing),
        ('08-player-hit', 'deep blast and growl', .78, .48, .1, fantasy_player_hit),
        ('09-opponent-turn', 'low horns and drums', 1.0, .44, .14, fantasy_turn_opponent),
        ('10-ability', 'rune bells', .60, .32, .12, fantasy_ability),
        ('11-resolved', 'falling chimes', .36, .18, .1, fantasy_resolved),
        ('12-countered', 'drawn in, dissonant cut', .64, .36, .1, fantasy_countered),
        ('13-attack', 'sword sweep', .58, .36, .08, fantasy_attack),
        ('14-block', 'sword clang', .50, .40, .1, fantasy_block),
        ('15-heal', 'harp and choir', .92, .32, .14, fantasy_heal),
        ('16-poison', 'bubbles and dark drone', .66, .34, .08, fantasy_poison),
        ('17-shield', 'shimmering ward', .74, .30, .12, fantasy_shield),
        ('18-shatter', 'crystal shards and fading magic', .70, .40, .1, fantasy_shatter),
    ]),
    'aventura': (((.023, 1), (.051, .5)), [
        ('01-card-draw', 'pop and marimba', .26, .26, .03, cute_draw),
        ('02-card-play', 'bubble pop', .20, .26, .02, cute_play),
        ('03-land', 'marimba and spring', .44, .40, .04, cute_land),
        ('04-cast', 'marimba arpeggio and glitter', .62, .36, .06, cute_cast),
        ('05-impact', 'cartoon bonk', .24, .44, .02, cute_impact),
        ('06-turn', 'marimba jingle', .74, .40, .06, cute_turn_self),
        ('07-wing', 'fluttering whistles', .34, .24, .02, cute_wing),
        ('08-player-hit', 'big bonk and slide whistle', .60, .46, .04, cute_player_hit),
        ('09-opponent-turn', 'marimba, two falling notes', .64, .38, .06, cute_turn_opponent),
        ('10-ability', 'toy bell', .42, .30, .04, cute_ability),
        ('11-resolved', 'two bubbles', .16, .18, .02, cute_resolved),
        ('12-countered', 'slide whistle and poof', .50, .34, .04, cute_countered),
        ('13-attack', 'swish and zip', .30, .32, .02, cute_attack),
        ('14-block', 'spring boing', .44, .38, .03, cute_block),
        ('15-heal', 'twinkling bells', .62, .30, .06, cute_heal),
        ('16-poison', 'goopy bloops', .42, .32, .02, cute_poison),
        ('17-shield', 'bubble shimmer', .54, .30, .05, cute_shield),
        ('18-shatter', 'glass tinkles and pop', .40, .36, .03, cute_shatter),
    ]),
    'arena': (((.037, 1), (.083, .6), (.139, .35)), [
        ('01-card-draw', 'card snap', .16, .26, .02, arena_draw),
        ('02-card-play', 'heavy placement', .22, .30, .03, arena_play),
        ('03-land', 'earth and stone', .56, .46, .06, arena_land),
        ('04-cast', 'power gathers and lands', .92, .44, .1, arena_cast),
        ('05-impact', 'SFXMint burst / punchy hit', .48, .48, .04, arena_impact),
        ('06-turn', 'war drums and horn', 1.0, .46, .1, arena_turn_self),
        ('07-wing', 'heavy wing beats', .58, .30, .04, arena_wing),
        ('08-player-hit', 'SFXMint blast / slow, with rumble', 1.0, .50, .06, arena_player_hit),
        ('09-opponent-turn', 'low gong', 1.05, .44, .1, arena_turn_opponent),
        ('10-ability', 'arcane clicks', .26, .32, .03, arena_ability),
        ('11-resolved', 'low settle', .18, .20, .02, arena_resolved),
        ('12-countered', 'suppressed, glass snap', .40, .38, .04, arena_countered),
        ('13-attack', 'heavy rush', .46, .38, .04, arena_attack),
        ('14-block', 'shield clang', .54, .44, .06, arena_block),
        ('15-heal', 'warm pad and chimes', .72, .30, .08, arena_heal),
        ('16-poison', 'venom hiss and gurgle', .54, .34, .03, arena_poison),
        ('17-shield', 'force field', .64, .32, .06, arena_shield),
        ('18-shatter', 'heavy crash and debris', .72, .44, .05, arena_shatter),
    ]),
    'discreto': (((.029, 1),), [
        ('01-card-draw', 'paper tick', .08, .14, 0, quiet_draw),
        ('02-card-play', 'soft tap', .08, .16, 0, quiet_play),
        ('03-land', 'low tap', .12, .20, 0, quiet_land),
        ('04-cast', 'two soft notes rising', .24, .18, 0, quiet_cast),
        ('05-impact', 'muted thud', .14, .22, 0, quiet_impact),
        ('06-turn', 'two-tone chime rising', .42, .22, 0, quiet_turn_self),
        ('07-wing', 'air puff', .16, .14, 0, quiet_wing),
        ('08-player-hit', 'two muted thuds', .26, .26, 0, quiet_player_hit),
        ('09-opponent-turn', 'two-tone chime falling', .44, .22, 0, quiet_turn_opponent),
        ('10-ability', 'double click', .10, .16, 0, quiet_ability),
        ('11-resolved', 'faint tick', .08, .10, 0, quiet_resolved),
        ('12-countered', 'two notes falling', .19, .18, 0, quiet_countered),
        ('13-attack', 'soft swish', .24, .16, 0, quiet_attack),
        ('14-block', 'wood knock', .14, .20, 0, quiet_block),
        ('15-heal', 'soft rising glide', .32, .18, 0, quiet_heal),
        ('16-poison', 'low blop', .17, .18, 0, quiet_poison),
        ('17-shield', 'high ping', .32, .16, 0, quiet_shield),
        ('18-shatter', 'tiny ticks', .16, .16, 0, quiet_shatter),
    ]),
    'taverna': (((.019, 1), (.043, .6)), [
        ('01-card-draw', 'card slide and snap', .14, .26, .03, tavern_draw),
        ('02-card-play', 'card slapped on wood', .14, .28, .04, tavern_play),
        ('03-land', 'heavy mug on the table', .32, .40, .05, tavern_land),
        ('04-cast', 'lute strum', .90, .38, .05, tavern_cast),
        ('05-impact', 'fist on table, mugs jump', .34, .44, .05, tavern_impact),
        ('06-turn', 'coin toss and bounce', .80, .38, .05, tavern_turn_self),
        ('07-wing', 'cloak flaps', .40, .24, .03, tavern_wing),
        ('08-player-hit', 'table crash and coins', .62, .48, .06, tavern_player_hit),
        ('09-opponent-turn', 'two low lute notes', .80, .40, .05, tavern_turn_opponent),
        ('10-ability', 'dice roll', .40, .30, .03, tavern_ability),
        ('11-resolved', 'one lute note', .46, .20, .04, tavern_resolved),
        ('12-countered', 'muted strum', .30, .34, .04, tavern_countered),
        ('13-attack', 'boots and swish', .34, .36, .04, tavern_attack),
        ('14-block', 'wooden shield knock', .22, .40, .05, tavern_block),
        ('15-heal', 'pour and toast', .80, .30, .05, tavern_heal),
        ('16-poison', 'bubbling cauldron', .70, .32, .03, tavern_poison),
        ('17-shield', 'spinning coin', .68, .28, .04, tavern_shield),
        ('18-shatter', 'mug breaking', .50, .40, .04, tavern_shatter),
    ]),
    'scifi': (((.041, 1), (.097, .6), (.157, .35)), [
        ('01-card-draw', 'data chirp', .10, .24, .03, scifi_draw),
        ('02-card-play', 'servo and click', .16, .26, .03, scifi_play),
        ('03-land', 'magnetic clamp', .38, .40, .05, scifi_land),
        ('04-cast', 'charge and release', .74, .36, .08, scifi_cast),
        ('05-impact', 'laser hit', .24, .42, .04, scifi_impact),
        ('06-turn', 'three rising beeps', .56, .38, .1, scifi_turn_self),
        ('07-wing', 'jet whoosh', .48, .26, .04, scifi_wing),
        ('08-player-hit', 'plasma blast', .66, .48, .06, scifi_player_hit),
        ('09-opponent-turn', 'alert, two low beeps', .54, .38, .08, scifi_turn_opponent),
        ('10-ability', 'keypad beeps', .12, .24, .04, scifi_ability),
        ('11-resolved', 'confirm bloop', .12, .18, .04, scifi_resolved),
        ('12-countered', 'error buzz', .40, .34, .04, scifi_countered),
        ('13-attack', 'two laser shots', .28, .36, .05, scifi_attack),
        ('14-block', 'energy deflect', .38, .38, .06, scifi_block),
        ('15-heal', 'rising shimmer', .52, .28, .08, scifi_heal),
        ('16-poison', 'geiger clicks and hum', .62, .30, .04, scifi_poison),
        ('17-shield', 'force field powering up', .62, .32, .06, scifi_shield),
        ('18-shatter', 'glitch breakdown', .38, .38, .05, scifi_shatter),
    ]),
}


def loudness(path):
    with wave.open(str(path), 'rb') as wav:
        pcm = array.array('h', wav.readframes(wav.getnframes()))
    return 20 * math.log10(math.sqrt(sum((sample / 32767) ** 2 for sample in pcm) / len(pcm)))


# Each cue sits near the loudness of the same cue in the classic set, so switching packs keeps the mix;
# square waves would otherwise sound far louder than physical materials at the same peak.
LOUDER = {'discreto': -4}
PEAK_LIMIT = .48


if __name__ == '__main__':
    # Optional pack and cue names render only those (the others stay byte-for-byte as they are).
    wanted = set(sys.argv[1:])
    packs = [pack for pack in PACKS if pack in wanted] or list(PACKS)
    cues = wanted - set(PACKS)
    for pack in packs:
        taps, designs = PACKS[pack]
        folder = OUT / pack
        folder.mkdir(exist_ok=True)
        for name, material, duration, peak, room, compose in designs:
            if cues and name not in cues:
                continue
            target = loudness(OUT / f'{name}.wav') + LOUDER.get(pack, 0)
            result = render(name, material, duration, peak, room, compose, out=folder, taps=taps)
            peak = min(PEAK_LIMIT, peak * 10 ** ((target - result['rmsDbFS']) / 20))
            result = render(name, material, duration, peak, room, compose, out=folder, taps=taps)
            print(json.dumps({'pack': pack, **result}))
