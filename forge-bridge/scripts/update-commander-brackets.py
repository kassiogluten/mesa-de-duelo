#!/usr/bin/env python3
"""Refresh the card lists behind the Commander bracket estimate (shared/commander-brackets.json).
Game Changers, mass land denial, extra turns and efficient tutors come from Scryfall; the most popular two-card combos
come from Commander Spellbook. Review the result by hand before publishing: the tutor search has false positives
(listed in TUTOR_FALSE_POSITIVES) and the combos keep Commander Spellbook's bracketTag.
The table never contacts these sites: the bracket is computed locally from this snapshot.
"""
import datetime
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

HEADERS = {'User-Agent': 'MesaDeDuelo/0.70 bracket-snapshot', 'Accept': 'application/json'}
SCRYFALL = {
    'gameChangers': 'is:gamechanger',
    'massLandDenial': 'otag:mass-land-denial',
    'extraTurns': 'otag:extra-turn',
    'tutors': 'otag:tutor mv<=3 o:"search your library for a card"',
}
# Reviewed by hand: the search also catches cards that find one named card, need a long setup or rarely tutor at all.
TUTOR_FALSE_POSITIVES = {
    'Alpine Houndmaster',
    "Angel's Herald",
    'Archmage Ascension',
    'Asmoranomardicadaistinaculdacar',
    "Ayara's Oathsworn",
    "Behemoth's Herald",
    'Cool but Rude',
    'Cynical Loner',
    "Demon's Herald",
    'Disciple of Deceit',
    "Dragon's Herald",
    'Dragonstorm Forecaster',
    'Elvish Clancaller',
    'Forging the Tyrite Sword',
    'Growth-Chamber Guardian',
    'Hour of Victory',
    'Infectious Bloodlust',
    'Lagomos, Hand of Hatred',
    'Lively Dirge',
    'Llanowar Sentinel',
    'Magitek Infantry',
    'Mask of the Mimic',
    'Renowned Weaponsmith',
    'Ringsight',
    'Servant of the Stinger',
    'Sift Through Sands',
    "Sphinx's Herald",
    'Tempest Hawk',
    'The Creation of Avacyn',
    'Treasure Chest',
    'Trustworthy Scout',
    'Urborg Panther',
    'Welkin Hawk',
    'Whisper Squad',
    'Wretched Throng',
}
# Planeswalkers whose only land denial is the ultimate: rarely reached, not what the brackets mean by mass land denial.
LAND_DENIAL_FALSE_POSITIVES = {
    'Ajani Vengeant',
    'Dovin Baan',
    'Gideon, Champion of Justice',
    'Liliana of the Veil',
    'Liliana, Dreadhorde General',
}
COMBO_COUNT = 100
COMBOS = 'https://backend.commanderspellbook.com/variants/?' + urllib.parse.urlencode({
    'q': 'cards=2 legal:commander', 'ordering': '-popularity', 'limit': COMBO_COUNT,
})


def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def scryfall_names(query):
    url = 'https://api.scryfall.com/cards/search?' + urllib.parse.urlencode({'q': f'({query}) f:commander', 'unique': 'cards'})
    names = set()
    while url:
        page = fetch(url)
        names.update(card['name'] for card in page['data'])
        url = page.get('next_page')
        time.sleep(0.15)
    return sorted(names)


lists = {key: scryfall_names(query) for key, query in SCRYFALL.items()}
lists['tutors'] = [name for name in lists['tutors'] if name not in TUTOR_FALSE_POSITIVES]
lists['massLandDenial'] = [name for name in lists['massLandDenial'] if name not in LAND_DENIAL_FALSE_POSITIVES]
if len(lists['gameChangers']) < 40:
    raise ValueError('Unexpectedly small Game Changers list; previous file preserved')

combos = []
for variant in fetch(COMBOS)['results']:
    cards = sorted(use['card']['name'] for use in variant['uses'])
    if len(cards) != 2 or variant.get('bracketTag') in (None, 'B'):
        continue
    combos.append({'cards': cards, 'tag': variant['bracketTag']})
if len(combos) < COMBO_COUNT * 0.8:
    raise ValueError('Unexpectedly few combos; previous file preserved')

snapshot = {
    'asOf': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
    'sources': {**{key: f'scryfall: {query}' for key, query in SCRYFALL.items()}, 'combos': COMBOS},
    **lists,
    'combos': combos,
}
target = Path(__file__).resolve().parents[2] / 'shared' / 'commander-brackets.json'
temporary = target.with_suffix('.json.tmp')
temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
temporary.replace(target)
print(', '.join(f'{len(v)} {k}' for k, v in lists.items()) + f', {len(combos)} combos as of {snapshot["asOf"]}. Review by hand.')
