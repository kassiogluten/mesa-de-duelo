// Se o aparelho é um PC com Windows ou Linux: decide o link Mesa no PC da tela inicial e o que a página /baixar oferece.

/** O pedaço do `navigator` que interessa (o `userAgentData` só existe no Chrome e no Edge). */
interface PlatformHints {
  userAgent?: string;
  userAgentData?: { platform?: string } | null;
}

/** Os PCs para os quais a mesa no PC sai. */
export type PcPlatform = 'windows' | 'linux';

/**
 * Windows de PC: o `userAgentData.platform` quando o navegador o tem ("Windows"), senão o "Windows NT" do userAgent.
 * Fora o Windows Phone e o Xbox, que também dizem Windows mas não rodam a mesa no PC.
 */
export function isWindows(nav: PlatformHints | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  const platform = nav.userAgentData?.platform;
  if (platform) return platform === 'Windows';
  const ua = nav.userAgent ?? '';
  return /Windows NT/i.test(ua) && !/Windows Phone|Xbox/i.test(ua);
}

/**
 * Linux de PC: o `userAgentData.platform` "Linux" (o Android e o Chromebook dizem "Android" e "Chrome OS"), senão o
 * "Linux" do userAgent sem Android, Chromebook (CrOS), TV ou processador ARM, que também dizem Linux mas não rodam o
 * executável x86_64.
 */
export function isLinux(nav: PlatformHints | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  const platform = nav.userAgentData?.platform;
  if (platform) return platform === 'Linux';
  const ua = nav.userAgent ?? '';
  return /\bLinux\b/i.test(ua) && !/Android|CrOS|Tizen|webOS|SmartTV|SMART-TV|Kindle|Silk|aarch64|armv\d|\barm\b/i.test(ua);
}

/** Para qual PC a página oferece o download direto; null nos outros aparelhos. */
export function pcPlatform(nav: PlatformHints | undefined = globalThis.navigator): PcPlatform | null {
  if (isWindows(nav)) return 'windows';
  if (isLinux(nav)) return 'linux';
  return null;
}
