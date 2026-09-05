import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n, type Lang, type TranslationKey } from "../lib/i18n";
import { MEMBERSHIP_PRICE_LABEL } from "../lib/stripeConfig";
import {
  Mic, Bell, Music, Shield, Globe, SlidersHorizontal,
  Gift, Check, Download, Smartphone, ChevronDown, Radio,
} from "lucide-react";

// Página de bienvenida para quien todavía no inició sesión — antes se iba
// derecho a AuthView, sin nada que explique qué es LiveNest antes de
// pedir email/contraseña. Solo se ve en la web (livenest.net); la app
// nativa de Android salta directo al login (ver App.tsx) — nadie necesita
// que le vendan la app una vez que ya la instaló.
//
// v3: la v2 (blobs difuminados + grilla de puntos + mock de navegador con
// tarjeta flotante superpuesta) se sentía a "plantilla de SaaS genérica" —
// se rechazó explícitamente. Este rediseño baja el efectismo (nada de
// blur decorativo ni tarjetas flotando encima de otras) y apuesta por un
// mock que se parece a lo que el producto realmente hace: un overlay de
// transmisión en vivo, no una captura de navegador.

// Revela `children` con un fade-up cuando entran en el viewport (o de
// inmediato, si el navegador no soporta IntersectionObserver — nunca se
// queda escondido). El hero usa esto mismo para su animación de entrada:
// como ya está a la vista al cargar, el observer dispara enseguida.
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  const { t, lang, setLang } = useI18n();

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-bg text-text overflow-x-clip">
      <Nav onLaunch={onLaunch} lang={lang} setLang={setLang} scrollTo={scrollTo} />
      <Hero onLaunch={onLaunch} scrollTo={scrollTo} />
      <StatStrip />
      <Features />
      <HowItWorks />
      <Pricing onLaunch={onLaunch} />
      <AndroidSection />
      <Faq />
      <FinalCta onLaunch={onLaunch} />
      <Footer />
    </div>
  );

  function Nav({ onLaunch, lang, setLang, scrollTo }: {
    onLaunch: () => void; lang: Lang; setLang: (l: Lang) => void; scrollTo: (id: string) => void;
  }) {
    // Sombra que aparece recién al scrollear — la barra se siente "flotando"
    // sobre el contenido en vez de tener un borde fijo desde el arranque.
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
      const onScroll = () => setScrolled(window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }, []);
    return (
      <header
        className={`sticky top-0 z-30 bg-bg/80 backdrop-blur-md transition-shadow duration-300 ${
          scrolled ? "border-b border-border shadow-lg shadow-black/20" : "border-b border-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-xl" />
            <span className="text-base font-extrabold tracking-tight">
              Live<span className="text-gradient">Nest</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-text-soft">
            <button onClick={() => scrollTo("features")} className="hover:text-text transition-colors">{t("landing_nav_features")}</button>
            <button onClick={() => scrollTo("how")} className="hover:text-text transition-colors">{t("landing_nav_how")}</button>
            <button onClick={() => scrollTo("pricing")} className="hover:text-text transition-colors">{t("landing_nav_pricing")}</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-text transition-colors">{t("landing_nav_faq")}</button>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:inline-flex rounded-xl border border-border bg-bg-soft p-1 gap-1">
              {(["es", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                    lang === l ? "bg-primary/15 text-primary" : "text-muted hover:text-text"
                  }`}
                >
                  {l === "es" ? "🇪🇸" : "🇬🇧"}
                </button>
              ))}
            </div>
            <button onClick={onLaunch} className="btn-primary text-sm">{t("landing_nav_launch")}</button>
          </div>
        </div>
      </header>
    );
  }

  function Hero({ onLaunch, scrollTo }: { onLaunch: () => void; scrollTo: (id: string) => void }) {
    return (
      <section className="relative border-b border-border">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-6">
                <span className="w-4 h-px bg-primary" /> LiveNest
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
                <span className="block">{t("landing_hero_title_1")}</span>
                {t("landing_hero_title_2") && <span className="block">{t("landing_hero_title_2")}</span>}
                <span className="block text-gradient">{t("landing_hero_title_3")}</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg text-text-soft max-w-md leading-relaxed">{t("landing_hero_subtitle")}</p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap gap-3">
                <button onClick={onLaunch} className="btn-primary text-sm px-6 py-3.5 glow-primary hover:-translate-y-0.5">{t("landing_hero_cta_primary")}</button>
                <button onClick={() => scrollTo("features")} className="btn-ghost text-sm px-6 py-3.5 hover:-translate-y-0.5">{t("landing_hero_cta_secondary")}</button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
                {[t("landing_hero_trust_1"), t("landing_hero_trust_2"), t("landing_hero_trust_3")].map((txt, i) => (
                  <span key={txt} className="flex items-center gap-3">
                    {i > 0 && <span className="w-1 h-1 rounded-full bg-border-soft" />}
                    {txt}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
          <Reveal delay={160}>
            <HeroMock />
          </Reveal>
        </div>
      </section>
    );
  }

  // Marco de teléfono en vez de una tarjeta abstracta — TikTok Live es un
  // producto de celular, y mostrarlo así se lee como una demo real del
  // producto, no como un elemento decorativo genérico de landing page.
  function HeroMock() {
    const chatLines = [
      { name: "maria_23", msg: "Hola! Saludos desde México 🇲🇽" },
      { name: "andree21", msg: "Great stream! 🔥" },
      { name: "lucas99", msg: "Me encanta este contenido" },
    ];
    const alert = { icon: Gift, labelKey: "landing_mock_alert_gift" as const };
    // Barras de una "onda de voz" — sugieren que algo se está leyendo en voz
    // alta ahora mismo. Cada una pulsa con su propio retraso/duración para
    // que se vea como un ecualizador real, no una animación sincronizada.
    const waveBars = [
      { delay: 0, duration: 1.0 }, { delay: 0.12, duration: 0.9 }, { delay: 0.24, duration: 1.15 },
      { delay: 0.06, duration: 0.8 }, { delay: 0.3, duration: 1.05 }, { delay: 0.18, duration: 0.95 },
      { delay: 0.36, duration: 1.1 }, { delay: 0.1, duration: 0.85 },
    ];
    return (
      <div className="flex justify-center lg:justify-end">
        <div className="relative w-[300px] animate-float">
          {/* Resplandor sutil detrás del teléfono — la única concesión al
              "glow", contenida y sin competir con el contenido. */}
          <div className="absolute -inset-6 bg-gradient-to-br from-primary/15 to-accent/15 rounded-[3rem] blur-2xl -z-10" />

          <div className="relative rounded-[2.5rem] border-[6px] border-border bg-black shadow-2xl overflow-hidden">
            {/* Cámara frontal — un punto, no una muesca que compita con la
                barra de estado de abajo */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-black ring-1 ring-white/10 z-20" />
            {/* Botones laterales */}
            <div className="absolute -right-[6px] top-24 w-[6px] h-10 bg-border rounded-r" />
            <div className="absolute -left-[6px] top-20 w-[6px] h-6 bg-border rounded-l" />
            <div className="absolute -left-[6px] top-32 w-[6px] h-10 bg-border rounded-l" />

            <div className="relative aspect-[9/17.5] bg-gradient-to-b from-bg-card to-black flex flex-col">
              <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

              <div className="flex items-center justify-between px-3.5 pt-4">
                <div className="flex items-center gap-1.5 bg-black/40 rounded-full pl-2 pr-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-soft" />
                  <span className="text-[9px] font-extrabold tracking-wide text-white">{t("landing_mock_status")}</span>
                </div>
                <Radio className="w-3.5 h-3.5 text-white/50" />
              </div>

              {/* Espacio del video — marca de agua sutil en vez de dejarlo
                  vacío o fingir una captura de video real */}
              <div className="flex-1 flex items-center justify-center">
                <img src="/logo.png" alt="" className="w-16 h-16 rounded-2xl opacity-10" />
              </div>

              {/* Toast de alerta, como aparecería de verdad sobre el stream */}
              <div className="mx-3.5 mb-2.5 flex items-center gap-2 bg-bg-card/95 border border-white/10 rounded-xl px-2.5 py-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <alert.icon className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="leading-tight min-w-0 flex-1">
                  <p className="text-[11px] font-bold truncate text-white">{t(alert.labelKey)}</p>
                  <p className="text-[9px] text-muted">{t("landing_mock_alerts_title")}</p>
                </div>
                <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                  {waveBars.map((bar, i) => (
                    <span
                      key={i}
                      className="w-[2px] h-4 rounded-full bg-primary/70 origin-bottom animate-wave-bar"
                      style={{ animationDelay: `${bar.delay}s`, animationDuration: `${bar.duration}s` }}
                    />
                  ))}
                </div>
              </div>

              {/* Panel de chat, pegado abajo como un overlay real */}
              <div className="mx-3.5 mb-4 bg-black/40 rounded-xl px-2.5 py-2.5">
                <p className="text-[8px] font-bold text-white/50 uppercase tracking-wide mb-1.5">{t("landing_mock_chat_title")}</p>
                <div className="space-y-1">
                  {chatLines.map((c) => (
                    <div key={c.name} className="text-[10.5px] leading-snug">
                      <span className="font-bold text-primary">@{c.name}</span>{" "}
                      <span className="text-white/80">{c.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StatStrip() {
    const stats: [string, string][] = [
      ["2", t("landing_stat_langs")],
      ["200", t("landing_stat_free")],
      [MEMBERSHIP_PRICE_LABEL.split(" / ")[0], t("landing_stat_premium")],
      ["100%", t("landing_stat_browser")],
    ];
    return (
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
          {stats.map(([n, label], i) => (
            <Reveal key={label} delay={i * 80} className="px-4 first:pl-0 text-center sm:text-left">
              <p className="text-2xl sm:text-3xl font-extrabold">{n}</p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  function Features() {
    const items: { icon: typeof Mic; color: string; bg: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
      { icon: Mic, color: "text-primary", bg: "bg-primary/10", titleKey: "landing_feature_1_title", descKey: "landing_feature_1_desc" },
      { icon: Bell, color: "text-amber-400", bg: "bg-amber-500/10", titleKey: "landing_feature_2_title", descKey: "landing_feature_2_desc" },
      { icon: Music, color: "text-pink-400", bg: "bg-pink-500/10", titleKey: "landing_feature_3_title", descKey: "landing_feature_3_desc" },
      { icon: Shield, color: "text-success-400", bg: "bg-success-500/10", titleKey: "landing_feature_4_title", descKey: "landing_feature_4_desc" },
      { icon: Globe, color: "text-sky-400", bg: "bg-sky-500/10", titleKey: "landing_feature_5_title", descKey: "landing_feature_5_desc" },
      { icon: SlidersHorizontal, color: "text-accent", bg: "bg-accent/10", titleKey: "landing_feature_6_title", descKey: "landing_feature_6_desc" },
    ];
    return (
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-28 scroll-mt-16">
        <div className="max-w-lg mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">{t("landing_nav_features")}</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">{t("landing_features_title")}</h2>
          <p className="mt-4 text-base text-text-soft">{t("landing_features_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {items.map((f, i) => (
            <Reveal key={f.titleKey} delay={(i % 3) * 90} className="bg-bg-card p-6 hover:bg-bg-soft transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center flex-shrink-0`}>
                  <f.icon className={`w-4.5 h-4.5 ${f.color}`} />
                </div>
                <span className="text-[11px] font-bold text-muted">0{i + 1}</span>
              </div>
              <h3 className="text-sm font-bold mb-1.5">{t(f.titleKey)}</h3>
              <p className="text-xs text-text-soft leading-relaxed">{t(f.descKey)}</p>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  function HowItWorks() {
    const steps = [
      { titleKey: "landing_how_1_title" as const, descKey: "landing_how_1_desc" as const },
      { titleKey: "landing_how_2_title" as const, descKey: "landing_how_2_desc" as const },
      { titleKey: "landing_how_3_title" as const, descKey: "landing_how_3_desc" as const },
    ];
    return (
      <section id="how" className="bg-bg-soft/50 border-y border-border scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-28">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-16">{t("landing_how_title")}</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <Reveal key={s.titleKey} delay={i * 120} className="text-center sm:text-left">
                <p className="text-4xl font-extrabold text-primary/30 mb-3">0{i + 1}</p>
                <h3 className="text-sm font-bold mb-1.5">{t(s.titleKey)}</h3>
                <p className="text-xs text-text-soft leading-relaxed">{t(s.descKey)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function Pricing({ onLaunch }: { onLaunch: () => void }) {
    const freeItems = ["landing_pricing_free_item_1", "landing_pricing_free_item_2", "landing_pricing_free_item_3"] as const;
    const premiumItems = ["landing_pricing_premium_item_1", "landing_pricing_premium_item_2", "landing_pricing_premium_item_3"] as const;
    return (
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-28 scroll-mt-16">
        <div className="text-center max-w-lg mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("landing_pricing_title")}</h2>
          <p className="mt-4 text-base text-text-soft">{t("landing_pricing_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Reveal className="card">
            <h3 className="text-sm font-bold text-text-soft">{t("landing_pricing_free_title")}</h3>
            <p className="text-4xl font-extrabold mt-2">{t("landing_pricing_free_price")}</p>
            <p className="text-xs text-muted mb-5">{t("landing_pricing_free_desc")}</p>
            <ul className="space-y-2.5 mb-6">
              {freeItems.map((k) => (
                <li key={k} className="flex items-start gap-2 text-xs text-text-soft">
                  <Check className="w-3.5 h-3.5 text-success-400 flex-shrink-0 mt-0.5" /> {t(k)}
                </li>
              ))}
            </ul>
            <button onClick={onLaunch} className="btn-ghost w-full text-sm">{t("landing_hero_cta_primary")}</button>
          </Reveal>
          <Reveal delay={120} className="card !border-primary/40 relative glow-primary">
            <span className="badge-primary absolute -top-3 left-5">{t("landing_pricing_premium_badge")}</span>
            <h3 className="text-sm font-bold text-text-soft">{t("landing_pricing_premium_title")}</h3>
            <p className="text-4xl font-extrabold mt-2">
              {MEMBERSHIP_PRICE_LABEL.split(" / ")[0]}
              <span className="text-sm font-semibold text-muted"> {t("landing_pricing_period")}</span>
            </p>
            <p className="text-xs text-muted mb-5">{t("landing_pricing_premium_desc")}</p>
            <ul className="space-y-2.5 mb-6">
              {premiumItems.map((k) => (
                <li key={k} className="flex items-start gap-2 text-xs text-text-soft">
                  <Check className="w-3.5 h-3.5 text-success-400 flex-shrink-0 mt-0.5" /> {t(k)}
                </li>
              ))}
            </ul>
            <button onClick={onLaunch} className="btn-primary w-full text-sm">{t("landing_hero_cta_primary")}</button>
          </Reveal>
        </div>
      </section>
    );
  }

  function AndroidSection() {
    return (
      <section className="bg-bg-soft/50 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <span className="badge-accent mb-3">{t("landing_android_badge")}</span>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" /> {t("landing_android_title")}
            </h2>
            <p className="mt-2 text-sm text-text-soft max-w-lg">{t("landing_android_desc")}</p>
            <p className="mt-2 text-[11px] text-muted max-w-lg">{t("landing_android_note")}</p>
          </div>
          <a
            href="https://github.com/SiikNotic/LiveNest/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="btn-primary text-sm px-5 py-3 whitespace-nowrap"
          >
            <Download className="w-4 h-4" /> {t("landing_android_download")}
          </a>
        </div>
      </section>
    );
  }

  function Faq() {
    const items = [
      ["landing_faq_1_q", "landing_faq_1_a"],
      ["landing_faq_2_q", "landing_faq_2_a"],
      ["landing_faq_3_q", "landing_faq_3_a"],
      ["landing_faq_4_q", "landing_faq_4_a"],
      ["landing_faq_5_q", "landing_faq_5_a"],
    ] as const;
    const [open, setOpen] = useState<string | null>(items[0][0]);
    return (
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-28 scroll-mt-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-12">{t("landing_faq_title")}</h2>
        <div className="space-y-3">
          {items.map(([qKey, aKey], i) => {
            const isOpen = open === qKey;
            return (
              <Reveal key={qKey} delay={i * 60}>
                <div className="card card-hover cursor-pointer" onClick={() => setOpen(isOpen ? null : qKey)}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold">{t(qKey)}</h3>
                    <ChevronDown className={`w-4 h-4 text-muted flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                  {isOpen && (
                    <p className="text-xs text-text-soft leading-relaxed mt-2.5 animate-slide-down">
                      {aKey === "landing_faq_3_a" ? t(aKey, { price: MEMBERSHIP_PRICE_LABEL }) : t(aKey)}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>
    );
  }

  function FinalCta({ onLaunch }: { onLaunch: () => void }) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <Reveal className="relative rounded-2xl border border-border bg-bg-soft/60 px-6 py-14 sm:px-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-accent" />
          <div className="relative text-center sm:text-left">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("landing_final_title")}</h2>
            <p className="text-sm text-text-soft mt-2 max-w-md">{t("landing_final_subtitle")}</p>
          </div>
          <button onClick={onLaunch} className="btn-primary text-sm px-7 py-3.5 whitespace-nowrap hover:-translate-y-0.5">
            {t("landing_final_cta")}
          </button>
        </Reveal>
      </section>
    );
  }

  function Footer() {
    return (
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-[1.5fr_1fr_1fr] gap-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg" />
              <span className="text-sm font-extrabold">Live<span className="text-gradient">Nest</span></span>
            </div>
            <p className="text-xs text-muted max-w-xs">{t("landing_footer_tagline")}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">{t("landing_footer_legal")}</p>
            <div className="flex flex-col gap-1.5 text-xs text-text-soft">
              <a href="/terms.html" className="hover:text-primary transition-colors">{t("landing_footer_terms")}</a>
              <a href="/privacy.html" className="hover:text-primary transition-colors">{t("landing_footer_privacy")}</a>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">{t("landing_footer_contact")}</p>
            <a href="mailto:livenestapp@gmail.com" className="text-xs text-text-soft hover:text-primary transition-colors">
              livenestapp@gmail.com
            </a>
          </div>
        </div>
        <div className="border-t border-border py-4 text-center text-[11px] text-muted">
          © {new Date().getFullYear()} LiveNest
        </div>
      </footer>
    );
  }
}
