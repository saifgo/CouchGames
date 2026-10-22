/*
 * The page's small amount of behaviour. Everything works and reads without it: entrances start
 * hidden only under html.js, and the interactive pieces fall back to their server-rendered state.
 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/* ---------- Entrances: each section's parts rise in order, once ---------- */
function entrances() {
  // Long Markdown pages: each block of the text arrives on its own.
  document.querySelectorAll('.prose[data-rise]').forEach((p) => {
    p.removeAttribute('data-rise');
    [...p.children].forEach((c) => c.setAttribute('data-rise', ''));
  });
  const items = $$('[data-rise]');
  if (!('IntersectionObserver' in window)) return items.forEach((el) => el.classList.add('is-in'));
  // Stagger within the nearest section so heading → text → picture arrive in that order.
  const groups = new Map<Element, HTMLElement[]>();
  for (const el of items) {
    const g = el.closest('section, .band, .plan, .stage, .feat, footer') ?? document.body;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(el);
  }
  for (const list of groups.values()) list.forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 4))));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px 20% 0px', threshold: 0 },
  );
  items.forEach((el) => io.observe(el));
}

/* ---------- The bar: hidden over the hero, then takes the chapter beneath it ---------- */
function bar() {
  const el = $('[data-bar]');
  if (!el) return;
  const hero = $('[data-hero]');
  const chapters = $$('[data-tone]').filter((s) => s !== el && !s.closest('[data-bar]'));
  let ticking = false;
  const update = () => {
    ticking = false;
    const probe = 34; // middle of the 68px bar
    if (hero) {
      const r = hero.getBoundingClientRect();
      el.dataset.hidden = r.bottom > 68 ? 'true' : 'false';
    }
    // The innermost chapter under the probe wins (FAQ bands sit inside the FAQ section).
    let tone: string | undefined;
    for (const s of chapters) {
      const r = s.getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) tone = s.dataset.tone;
    }
    if (tone && el.dataset.tone !== tone) el.dataset.tone = tone;
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
}

/* ---------- Hero: a live clock, seats filling in, the game drifting with the scroll ---------- */
function hero() {
  const clock = $('[data-clock]');
  if (clock) {
    const tick = () => {
      clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    tick();
    setInterval(tick, 15_000);
  }

  const lobby = $('[data-hero-lobby]');
  if (lobby) {
    const seats = $$('.lseat', lobby);
    const toast = $('[data-hero-toast]', lobby);
    const names = ['Omar', 'Lina', 'Sam', 'Nour'];
    const join = (i: number) => {
      const seat = seats[i];
      if (!seat) return;
      seat.classList.add('is-in');
      const name = $('.lseat__name', seat);
      if (name) name.textContent = names[i]!;
      if (toast) toast.textContent = `${names[i]}’s phone is in. Player ${i + 1}.`;
    };
    if (reduced.matches) {
      [0, 1].forEach(join);
    } else {
      names.forEach((_, i) => setTimeout(() => join(i), 1400 + i * 1500));
    }
  }

  const game = $<HTMLElement>('[data-drift]');
  const heroEl = $('[data-hero]');
  if (game && heroEl && !reduced.matches) {
    let ticking = false;
    const drift = () => {
      ticking = false;
      const r = heroEl.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      game.style.setProperty('--drift', `${(p * 60).toFixed(1)}px`);
      game.style.setProperty('--zoom', (1.06 + p * 0.06).toFixed(3));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true });
  }
}

/* ---------- Try it: the name you type takes seat P2 on the TV ---------- */
function tryIt() {
  const input = $<HTMLInputElement>('[data-try-input]');
  const lobby = $('#try-lobby');
  if (!input || !lobby) return;
  const seat = $$('.lseat', lobby)[1];
  const name = seat && $('.lseat__name', seat);
  const toast = $('.lobby__toast', lobby);
  const render = () => {
    const v = input.value.trim();
    if (!seat || !name || !toast) return;
    if (v) {
      seat.classList.remove('is-in');
      void seat.offsetWidth; // restart the little pop for each change of name
      seat.classList.add('is-in');
      name.textContent = v;
      toast.textContent = `${v}’s phone is in. Player 2.`;
    } else {
      seat.classList.remove('is-in');
      name.textContent = 'P2';
      toast.textContent = 'Seat 2 is free. Scan to join.';
    }
  };
  let last = input.value;
  input.addEventListener('input', () => {
    // Re-pop only when the seat goes from empty to taken; while typing just update the text.
    const was = last.trim();
    last = input.value;
    if (!was || !input.value.trim()) return render();
    if (name) name.textContent = input.value.trim();
    if (toast) toast.textContent = `${input.value.trim()}’s phone is in. Player 2.`;
  });
  for (const b of $$<HTMLButtonElement>('[data-try-example]')) {
    b.addEventListener('click', () => {
      input.value = b.dataset.tryExample ?? '';
      last = input.value;
      render();
    });
  }
}

/* ---------- Controllers: the phone on the left follows the controls on the right ---------- */
function pads() {
  const pad = $('[data-pad]');
  const img = $<HTMLImageElement>('[data-pad-img]');
  const caption = $('[data-pad-caption]');
  if (!pad || !img || !caption) return;

  // Warm the cache so a switch never waits on the network.
  const picks = $$<HTMLButtonElement>('[data-pad-pick]');
  const warm = () => picks.forEach((b) => { const i = new Image(); i.src = b.dataset.src!; });
  if ('requestIdleCallback' in window) requestIdleCallback(warm); else setTimeout(warm, 1500);

  let swapId = 0;
  for (const b of picks) {
    b.addEventListener('click', () => {
      picks.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      const id = ++swapId;
      const next = new Image();
      next.src = b.dataset.src!;
      next.alt = `The ${b.dataset.pad} on a phone, for ${b.dataset.system} games`;
      next.width = 2265;
      next.height = 945;
      next.setAttribute('data-pad-img', '');
      const go = () => {
        if (id !== swapId) return;
        const old = $$<HTMLImageElement>('[data-pad-img]', pad);
        if (!reduced.matches) next.style.transform = 'scale(1.04)';
        next.style.opacity = '0';
        pad.prepend(next);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          next.style.opacity = '';
          next.style.transform = '';
          old.forEach((o) => {
            o.classList.add('is-leaving');
            setTimeout(() => o.remove(), 300);
          });
        }));
        const tier = b.dataset.pro === '1' ? 'With Pro.' : 'Free.';
        caption.innerHTML = '';
        const s = document.createElement('strong');
        s.textContent = b.dataset.system!;
        caption.append(s, ` on the TV: every phone becomes a ${b.dataset.pad}. ${tier}`);
      };
      next.decode().then(go, go);
    });
  }

  const ping = $<HTMLInputElement>('[data-pad-ping-toggle]');
  const pingChip = $('[data-pad-ping]');
  ping?.addEventListener('change', () => pad.classList.toggle('show-ping', ping.checked));
  if (pingChip) {
    // Values from docs/LATENCY.md (5 GHz, in-game): p50 5 ms, p95 9.5 ms.
    const samples = [5, 5, 4, 6, 5, 7, 5, 4, 9, 5, 6, 5];
    let k = 0;
    setInterval(() => {
      if (!pad.classList.contains('show-ping')) return;
      pingChip.textContent = `${samples[k++ % samples.length]} ms`;
    }, 900);
  }

  // Feedback on pointer-down, the moment the thumb lands; release on up.
  const a = $<HTMLButtonElement>('[data-pad-press]');
  if (a) {
    const down = (e: Event) => {
      e.preventDefault();
      a.classList.add('is-down');
      pad.classList.add('is-pressed');
      navigator.vibrate?.(14);
    };
    const up = () => {
      a.classList.remove('is-down');
      pad.classList.remove('is-pressed');
    };
    a.addEventListener('pointerdown', down);
    a.addEventListener('pointerup', up);
    a.addEventListener('pointercancel', up);
    a.addEventListener('pointerleave', up);
    a.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { if (!e.repeat) down(e); } });
    a.addEventListener('keyup', up);
  }

  const seatChip = $('[data-pad-seat]');
  const seats = $$<HTMLButtonElement>('[data-pad-seat-pick]');
  for (const b of seats) {
    b.addEventListener('click', () => {
      seats.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      if (seatChip) {
        seatChip.dataset.p = b.dataset.padSeatPick;
        seatChip.textContent = `P${b.dataset.padSeatPick}`;
      }
    });
  }
}

entrances();
bar();
hero();
tryIt();
pads();
