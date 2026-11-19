// Os tipos de criatura em português, como estão impressos nas cartas traduzidas (tirados das traduções de carta do Forge, em 19/11/2026): o nome que a mesa mostra na escolha de tipo e nos avisos.

/** Inglês → português; o tipo que não aparece aqui (sem carta impressa em português) fica com o nome em inglês. */
const PT: Record<string, string> = {
  Advisor: 'Conselheiro', Aetherborn: 'Etergênito', Ally: 'Aliado', Angel: 'Anjo', Antelope: 'Antílope', Ape: 'Símio', Archer: 'Arqueiro',
  Archon: 'Arconte', Armadillo: 'Tatu', Artificer: 'Artesão', Assassin: 'Assassino', "Assembly-Worker": 'Operário-de-Linha-de-Montagem',
  Atog: 'Atogue', Aurochs: 'Auroques', Badger: 'Texugo', Barbarian: 'Bárbaro', Bard: 'Bardo', Basilisk: 'Basilisco', Bat: 'Morcego', Bear: 'Urso',
  Beast: 'Besta', Beaver: 'Castor', Beholder: 'Observador', Berserker: 'Amoque', Bird: 'Ave', Boar: 'Javali', Bringer: 'Portador', Brushwagg: 'Tojo',
  Camel: 'Camelo', Capybara: 'Capivara', Carrier: 'Portador', Cat: 'Felino', Centaur: 'Centauro', Chimera: 'Quimera', Citizen: 'Cidadão',
  Cleric: 'Clérigo', Cockatrice: 'Cocatriz', Construct: 'Constructo', Coward: 'Covarde', Coyote: 'Coiote', Crab: 'Caranguejo', Crocodile: 'Crocodilo',
  Cyclops: 'Ciclope', Demigod: 'Semideus', Demon: 'Demônio', Detective: 'Detetive', Devil: 'Diabo', Dinosaur: 'Dinossauro', Djinn: 'Gênio', Dog: 'Cão',
  Dragon: 'Dragão', Drake: 'Dragonete', Dreadnought: 'Couraçado', Drone: 'Zangão', Druid: 'Druida', Dryad: 'Dríade', Dwarf: 'Anão', Efreet: 'Efrite',
  Egg: 'Ovo', Elder: 'Ancião', Elephant: 'Elefante', Elf: 'Elfo', Elk: 'Alce', Eye: 'Olho', Faerie: 'Fada', Fish: 'Peixe', Fox: 'Raposa', Frog: 'Sapo',
  Fungus: 'Fungo', Gargoyle: 'Gárgula', Giant: 'Gigante', Gnome: 'Gnomo', Goat: 'Bode', God: 'Deus', Gorgon: 'Górgona', Griffin: 'Grifo', Hag: 'Bruxa',
  Halfling: 'Pequenino', Harpy: 'Harpia', Hellion: 'Avernal', Hippo: 'Hipopótamo', Hippogriff: 'Hipogrifo', Homarid: 'Homárida',
  Homunculus: 'Homúnculo', Horse: 'Cavalo', Human: 'Humano', Hydra: 'Hidra', Hyena: 'Hiena', Illusion: 'Ilusão', Imp: 'Diabrete',
  Incarnation: 'Encarnação', Inquisitor: 'Inquisidor', Insect: 'Inseto', Jackal: 'Sabujo', Jellyfish: 'Água-viva', Knight: 'Cavaleiro', Lamia: 'Lâmia',
  Leech: 'Sanguessuga', Leviathan: 'Leviatã', Lizard: 'Lagarto', Manticore: 'Mantícora', Masticore: 'Mastícora', Mercenary: 'Mercenário',
  Merfolk: 'Tritão', Minion: 'Assecla', Minotaur: 'Minotauro', Mite: 'Ácaro', Mole: 'Toupeira', Mongoose: 'Mangusto', Monk: 'Monge', Monkey: 'Símio',
  Moonfolk: 'Cidadão-da-lua', Mount: 'Montaria', Mouse: 'Camundongo', Mutant: 'Mutante', Mystic: 'Místico', Nautilus: 'Náutilo', Nephilim: 'Nefilim',
  Nightmare: 'Pesadelo', Noble: 'Nobre', Nomad: 'Nômade', Nymph: 'Ninfa', Octopus: 'Polvo', Ooze: 'Lodo', Otter: 'Lontra', Ouphe: 'Trasgo', Ox: 'Boi',
  Oyster: 'Ostra', Pangolin: 'Pangolim', Peasant: 'Plebeu', Pegasus: 'Pégaso', Pest: 'Peste', Phoenix: 'Fênix', Phyrexian: 'Phyrexiano',
  Pilot: 'Piloto', Pirate: 'Pirata', Plant: 'Planta', Porcupine: 'Porco-espinho', Possum: 'Gambá', Praetor: 'Pretor', Primarch: 'Primarca',
  Processor: 'Processador', Rabbit: 'Coelho', Raccoon: 'Guaxinim', Ranger: 'Guardião', Rat: 'Rato', Rebel: 'Rebelde', Reflection: 'Reflexo',
  Rhino: 'Rinoceronte', Rigger: 'Montador', Rogue: 'Ladino', Sable: 'Zibelina', Salamander: 'Salamandra', Satyr: 'Sátiro', Scarecrow: 'Espantalho',
  Scientist: 'Cientista', Scorpion: 'Escorpião', Scout: 'Batedor', Serpent: 'Serpente', Shade: 'Sombra', Shaman: 'Xamã', Shapeshifter: 'Metamorfo',
  Shark: 'Tubarão', Sheep: 'Ovelha', Siren: 'Sirena', Skeleton: 'Esqueleto', Sliver: 'Fractius', Slug: 'Lesma', Snail: 'Caracol', Snake: 'Cobra',
  Soldier: 'Soldado', Soltari: 'Soltariano', Specter: 'Espectro', Spellshaper: 'Magimodelador', Sphinx: 'Esfinge', Spider: 'Aranha', Spike: 'Espículo',
  Spirit: 'Espírito', Sponge: 'Esponja', Squid: 'Lula', Squirrel: 'Esquilo', Starfish: 'Estrela-do-mar', Thopter: 'Tóptero', Tiefling: 'Tiferino',
  Treefolk: 'Ent', Trilobite: 'Trilobita', Troll: 'Trol', Turtle: 'Tartaruga', Tyranid: 'Tiranídeo', Unicorn: 'Unicórnio', Vampire: 'Vampiro',
  Varmint: 'Vermina', Vedalken: 'Vedalkeano', Wall: 'Barreira', Walrus: 'Morsa', Warlock: 'Bruxo', Warrior: 'Guerreiro', Weird: 'Bizarro',
  Werewolf: 'Lobisomem', Whale: 'Baleia', Wizard: 'Mago', Wolf: 'Lobo', Wolverine: 'Carcaju', Wombat: 'Vombate', Worm: 'Verme', Wraith: 'Aparição',
  Wurm: 'Vorme', Zombie: 'Zumbi',
};

/** "Elf" → "Elfo"; desconhecido, o próprio nome. */
export const creatureTypePt = (type: string) => PT[type] ?? type;
