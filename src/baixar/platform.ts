// Se o aparelho é um PC com Windows: decide o link Mesa no PC da tela inicial e o que a página /baixar oferece.

/** O pedaço do `navigator` que interessa (o `userAgentData` só existe no Chrome e no Edge). */
interface PlatformHints {
  userAgent?: string;
  userAgentData?: { platform?: string } | null;
}

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
