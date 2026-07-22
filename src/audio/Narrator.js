/**
 * Narrator — la voz del puesto, versión humana.
 * Web Speech API con dos mejoras clave:
 *
 * 1. SELECCIÓN DE VOZ POR RANKING: se puntúan todas las voces es-* y se elige
 *    la más natural disponible (las "Natural/Neural" de Microsoft Edge y las
 *    "Google español" suenan a persona; las SAPI locales de los 90, no).
 * 2. QUIEBRE VOCAL POR ESTRÉS: el tono sube y el fraseo se ENTRECORTA cuando el
 *    personaje tiene miedo — el texto se divide en fragmentos con micro-pausas
 *    y jitter de pitch por fragmento: la voz tiembla de verdad.
 *
 * El texto siempre queda como subtítulo (accesibilidad); la voz suma.
 */
export class Narrator {
  constructor() {
    this.enabled = true;
    this.voz = null;
    this.disponible = 'speechSynthesis' in window;
    if (this.disponible) {
      const pick = () => { this.voz = this.#mejorVoz(); };
      speechSynthesis.addEventListener('voiceschanged', pick);
      pick();
    }
  }

  /** Ranking de naturalidad: nombre de la voz + cercanía del acento. */
  #mejorVoz() {
    const voces = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
    if (!voces.length) return null;
    const puntuar = (v) => {
      const n = v.name.toLowerCase();
      let p = 0;
      if (n.includes('natural') || n.includes('neural')) p += 40; // Edge "…Online (Natural)"
      if (n.includes('online')) p += 10;
      if (n.includes('google')) p += 25;                           // Chrome: "Google español"
      if (n.includes('microsoft')) p += 8;
      if (n.includes('espeak')) p -= 30;                           // el robot de los 90, fuera
      const lang = v.lang.toLowerCase();
      if (lang.includes('pe')) p += 12;                            // acento local primero
      else if (lang.includes('mx') || lang.includes('419') || lang.includes('us')) p += 8;
      else if (lang.includes('es-es')) p += 5;
      if (v.localService === false) p += 6;                        // las remotas suelen ser neurales
      return p;
    };
    voces.sort((a, b) => puntuar(b) - puntuar(a));
    return voces[0];
  }

  /** Timbre determinista por hablante: la misma persona suena siempre igual. */
  #timbre(hablante) {
    if (!hablante) return { pitch: 0.9, rate: 1.0 };
    let h = 0;
    for (const c of hablante) h = (h * 31 + c.charCodeAt(0)) % 997;
    return {
      pitch: 0.78 + (h % 5) * 0.11,        // 0.78 – 1.22
      rate: 0.96 + ((h >> 3) % 4) * 0.04,  // 0.96 – 1.08
    };
  }

  /**
   * Habla. `estres` (0..1) modula la voz: sube el tono, acelera un pelín y,
   * pasado 0.55, ENTRECORTA el fraseo (la voz se quiebra).
   */
  decir(hablante, texto, { esNarrador = false, estres = 0 } = {}) {
    if (!this.enabled || !this.disponible || !texto) return;
    const limpio = texto
      .replace(/\(([^)]*)\)/g, '')
      .replace(/[«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!limpio) return;

    const base = esNarrador ? { pitch: 0.82, rate: 0.97 } : this.#timbre(hablante);
    const pitch = Math.min(2, base.pitch + estres * 0.3); // el miedo agudiza
    const rate = base.rate * (1 + estres * 0.07);

    // Voz quebrada: fragmentos cortos (máx. 3: las colas largas cuelgan SAPI).
    const fragmentos = (estres > 0.55
      ? limpio.split(/(?<=[,;.!?…])\s+/).flatMap((f) => this.#trocear(f, 7)).filter(Boolean)
      : [limpio]).slice(0, 3);

    // BLINDAJE contra el bug de Chrome/Windows: cancel() seguido de speak()
    // inmediato con voces SAPI puede congelar el renderer. Cancelamos solo si
    // hace falta y hablamos tras un respiro de 60 ms, todo en try/catch.
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    } catch { /* SAPI de mal humor: seguimos sin voz */ }
    clearTimeout(this.#speakTimer);
    this.#speakTimer = setTimeout(() => {
      try {
        for (const frag of fragmentos) {
          const u = new SpeechSynthesisUtterance(frag);
          if (this.voz) u.voice = this.voz;
          u.lang = this.voz?.lang ?? 'es-ES';
          u.pitch = Math.min(2, pitch + (fragmentos.length > 1 ? (Math.random() - 0.3) * 0.16 : 0));
          u.rate = rate * (fragmentos.length > 1 ? 0.94 + Math.random() * 0.12 : 1);
          u.volume = 0.92;
          speechSynthesis.speak(u); // en cola: las pausas entre utterances SON el temblor
        }
      } catch { /* sin voz antes que sin juego */ }
    }, 60);
  }

  #speakTimer = null;

  /** Parte una frase larga en trozos de ~n palabras (para el entrecortado). */
  #trocear(frase, n) {
    const palabras = frase.trim().split(' ');
    const trozos = [];
    for (let i = 0; i < palabras.length; i += n) {
      trozos.push(palabras.slice(i, i + n).join(' '));
    }
    return trozos;
  }

  callar() {
    clearTimeout(this.#speakTimer);
    try {
      if (this.disponible && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    } catch { /* ídem */ }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.callar();
    return this.enabled;
  }
}

export const narrator = new Narrator();
