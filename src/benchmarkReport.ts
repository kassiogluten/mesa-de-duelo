// Manda ao servidor o resultado do teste de desempenho da mesa (a página /desempenho), para a área de admin comparar aparelhos.
import { bridgeHttpUrl } from './forge/client';

/** Um trecho do teste (abertura, combate, campo cheio…), com o FPS dele. */
export interface BenchmarkScene { nome: string; fps: number; fps1: number; travadas: number }

/**
 * O resultado como o servidor guarda (veja Benchmarks.java): campos desconhecidos são descartados, textos cortados
 * em 120 caracteres (o modelo em 60) e até 20 cenas. Nada identifica o jogador; o aparelho vai só resumido.
 */
export interface BenchmarkResult {
  versao: string;
  modo: 'duelo' | 'commander';
  /** 0 a 100. */
  nota: number;
  /** FPS médio. */
  fps: number;
  /** FPS do 1% de quadros mais lentos. */
  fps1: number;
  /** Quadros acima de 50 ms. */
  travadas: number;
  quadros: number;
  duracaoMs: number;
  /** Pior degrau a que o regulador de efeitos chegou (0 a 3); null sem regulador. */
  degrau: 0 | 1 | 2 | 3 | null;
  /** O ajuste de efeitos da mesa (auto, full, light…). */
  efeitos: string;
  aparelho: {
    /** Largura x altura @ densidade, ex. "412x915@2.6". */
    tela: string;
    nucleos: number | null;
    /** GB, como o navegador informa. */
    memoria: number | null;
    gpu: string | null;
    /** O modelo do celular, quando o navegador conta ("SM-A515F", "Pixel 7"). */
    modelo?: string | null;
    navegador: string;
    sistema: string;
    movel: boolean;
    hz: number | null;
  };
  cenas: BenchmarkScene[];
}

export const benchmarkUrl = () => bridgeHttpUrl('/api/desempenho');

/** Envia o resultado; true se o servidor guardou. Nunca lança: sem rede ou com recusa, só devolve false. */
export async function sendBenchmark(result: BenchmarkResult, send: typeof fetch = fetch): Promise<boolean> {
  try {
    // text/plain não pede a confirmação prévia do CORS no `npm run dev`, em que o servidor fica em outra porta.
    const response = await send(benchmarkUrl(), { method: 'POST', body: JSON.stringify(result), headers: { 'Content-Type': 'text/plain' } });
    return response.ok;
  } catch { return false; }
}
