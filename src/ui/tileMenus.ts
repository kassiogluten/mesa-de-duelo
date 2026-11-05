/**
 * O menu "⋯" de cada card de deck (`[data-tile-menu]` seguido de `.tile-menu`): abre um de cada vez, fecha ao clicar
 * fora ou quando o Tab sai do card, e se percorre pelas setas, com Esc devolvendo o foco ao botão.
 */
export function attachTileMenus(root: HTMLElement) {
  function close(except?: HTMLButtonElement) {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tile-menu][aria-expanded="true"]')) {
      if (button === except) continue;
      button.setAttribute('aria-expanded', 'false');
      (button.nextElementSibling as HTMLElement).hidden = true;
    }
  }
  function toggle(button: HTMLButtonElement) {
    const open = button.getAttribute('aria-expanded') !== 'true';
    close(button);
    button.setAttribute('aria-expanded', String(open));
    const menu = button.nextElementSibling as HTMLElement;
    menu.hidden = !open;
    if (open) menu.querySelector<HTMLButtonElement>('button')?.focus();
  }
  // O menu fecha ao clicar fora dele ou quando o Tab leva o foco para outro lugar.
  document.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement).closest?.('.tile-menu, [data-tile-menu]')) close(); });
  root.addEventListener('focusout', e => {
    const wrap = (e.target as HTMLElement).closest('.tile-wrap');
    if (wrap && e.relatedTarget && !wrap.contains(e.relatedTarget as Node)) close();
  });
  root.addEventListener('keydown', e => {
    const menu = (e.target as HTMLElement).closest<HTMLElement>('.tile-menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button')], at = items.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); const button = menu.previousElementSibling as HTMLButtonElement; close(); button.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  });
  return { close, toggle };
}
