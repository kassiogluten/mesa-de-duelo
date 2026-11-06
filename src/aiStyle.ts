// Estilo do computador (S12): os jeitos de jogar da IA do Forge, com o nome e a explicação que o jogador vê.
export type AiStyle = 'equilibrado' | 'cauteloso' | 'agressivo' | 'experimental';

export const AI_STYLES: readonly { id: AiStyle; name: string; hint: string }[] = [
  { id: 'equilibrado', name: 'Equilibrado', hint: 'O jeito padrão: ataca quando vale a pena e segura o que precisa para se defender.' },
  { id: 'cauteloso', name: 'Cauteloso', hint: 'Evita trocas arriscadas, ataca menos e prefere esperar uma boa oportunidade.' },
  { id: 'agressivo', name: 'Agressivo', hint: 'Ataca mais, aceita trocar criaturas e pressiona a sua vida desde cedo.' },
  { id: 'experimental', name: 'Experimental', hint: 'Usa decisões novas que ainda estão em teste; pode surpreender, para o bem ou para o mal.' },
];

export const DEFAULT_AI_STYLE: AiStyle = 'equilibrado';
export const isAiStyle = (v: unknown): v is AiStyle => AI_STYLES.some(s => s.id === v);
export const aiStyleName = (v: unknown) => AI_STYLES.find(s => s.id === v)?.name ?? '';
