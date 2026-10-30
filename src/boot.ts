import { iniciarTema } from './ui/temas';
import { loadCardCache } from './scryfall';

// O tema antes de tudo, para a mesa não abrir azul e mudar de cor depois.
iniciarTema();

// As telas leem as cartas do cache de forma síncrona: carrega o IndexedDB antes. Se ele travar, abre assim mesmo
// (as cartas que faltarem são buscadas de novo).
const timeout = new Promise(resolve => setTimeout(resolve, 2000));
void Promise.race([loadCardCache().catch(() => undefined), timeout]).then(() => import('./main'));
