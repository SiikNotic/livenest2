import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
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
// v4: identidad fija propia en vez de seguir los 13 temas seleccionables
// del resto de la app (ver el bloque ".ln" en index.css) — un sistema
// "cockpit oscuro": canvas casi negro, un solo acento (oro), tarjetas con
// sombra interior tipo "tecla de teclado" en vez de glassmorphism, botones
// de acción neutros (nunca cromáticos). Referencia de estilo pedida por el
// usuario, adaptada a la marca propia — nunca copiada literal (ni el
// acento de color, ni el wordmark, ni las imágenes).

// Revela `children` con un fade-up cuando entran en el viewport (o de
// inmediato, si el navegador no soporta IntersectionObserver — nunca se
// queda escondido). El hero usa esto mismo para su animación de entrada:
// como ya está a la vista al cargar, el observer dispara enseguida.
function Reveal({ children, delay = 0, className = "", style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
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
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
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
    <div className="ln min-h-screen overflow-x-clip">
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
    return (
      <header className="sticky top-3 sm:top-4 z-30 px-3 sm:px-4">
        <div className="ln-nav-pill max-w-5xl mx-auto h-14 flex items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg" />
            <span className="text-[13px] font-medium text-white">
              Live<span style={{ color: "var(--ln-gold)" }}>Nest</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium" style={{ color: "var(--ln-ash)" }}>
            <button onClick={() => scrollTo("features")} className="hover:text-white transition-colors">{t("landing_nav_features")}</button>
            <button onClick={() => scrollTo("how")} className="hover:text-white transition-colors">{t("landing_nav_how")}</button>
            <button onClick={() => scrollTo("pricing")} className="hover:text-white transition-colors">{t("landing_nav_pricing")}</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-white transition-colors">{t("landing_nav_faq")}</button>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:inline-flex rounded-lg p-0.5 gap-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
              {(["es", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="px-1.5 py-1 rounded text-xs font-bold transition-colors"
                  style={{ opacity: lang === l ? 1 : 0.45 }}
                >
                  {l === "es" ? "🇪🇸" : "🇬🇧"}
                </button>
              ))}
            </div>
            <button onClick={onLaunch} className="ln-btn ln-btn-primary">{t("landing_nav_launch")}</button>
          </div>
        </div>
      </header>
    );
  }

  function Hero({ onLaunch, scrollTo }: { onLaunch: () => void; scrollTo: (id: string) => void }) {
    return (
      <section className="relative border-b overflow-hidden" style={{ borderColor: "var(--ln-border)" }}>
        {/* Composición atmosférica — el único lugar del sistema donde el
            oro/plata se cranquean al máximo (blur, escala, saturación)
            antes de que la página vuelva a la austeridad de abajo. */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(216,154,22,0.22), transparent 60%)",
              filter: "blur(40px)",
            }}
          />
          <img
            src="/onboarding/start.png"
            alt=""
            className="absolute -top-24 right-[-180px] w-[640px] max-w-none opacity-40 animate-float"
            style={{ animationDuration: "8s" }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-24 sm:pt-28 sm:pb-28 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Reveal>
              <span className="ln-badge ln-badge-gold mb-6">LiveNest</span>
            </Reveal>
            <Reveal delay={80}>
              <h1
                className="text-[42px] sm:text-[56px] font-normal leading-[1.08] text-white"
                style={{ letterSpacing: "0.22px" }}
              >
                <span className="block">{t("landing_hero_title_1")}</span>
                {t("landing_hero_title_2") && <span className="block">{t("landing_hero_title_2")}</span>}
                <span className="block" style={{ color: "var(--ln-gold)" }}>{t("landing_hero_title_3")}</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-base max-w-md leading-relaxed" style={{ color: "var(--ln-ash)" }}>
                {t("landing_hero_subtitle")}
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-9 flex flex-wrap gap-3">
                <button onClick={onLaunch} className="ln-btn ln-btn-primary px-6 py-3 text-sm">{t("landing_hero_cta_primary")}</button>
                <button onClick={() => scrollTo("features")} className="ln-btn ln-btn-ghost px-6 py-3 text-sm">{t("landing_hero_cta_secondary")}</button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs" style={{ color: "var(--ln-smoke)", fontFamily: "var(--font-geist-mono)" }}>
                {[t("landing_hero_trust_1"), t("landing_hero_trust_2"), t("landing_hero_trust_3")].map((txt, i) => (
                  <span key={txt} className="flex items-center gap-3">
                    {i > 0 && <span style={{ opacity: 0.4 }}>|</span>}
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
          <div
            className="relative rounded-[2.5rem] border-[6px] shadow-2xl overflow-hidden"
            style={{ borderColor: "var(--ln-border)", background: "#000" }}
          >
            {/* Cámara frontal — un punto, no una muesca que compita con la
                barra de estado de abajo */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-black ring-1 ring-white/10 z-20" />
            {/* Botones laterales */}
            <div className="absolute -right-[6px] top-24 w-[6px] h-10 rounded-r" style={{ background: "var(--ln-border)" }} />
            <div className="absolute -left-[6px] top-20 w-[6px] h-6 rounded-l" style={{ background: "var(--ln-border)" }} />
            <div className="absolute -left-[6px] top-32 w-[6px] h-10 rounded-l" style={{ background: "var(--ln-border)" }} />

            <div className="relative aspect-[9/17.5] flex flex-col" style={{ background: "linear-gradient(to bottom, var(--ln-ink), #000)" }}>
              <div className="h-1" style={{ background: "linear-gradient(to right, var(--ln-gold), var(--ln-silver), var(--ln-gold))" }} />

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
              <div className="mx-3.5 mb-2.5 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-2.5 py-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--ln-gold-tint)" }}>
                  <alert.icon className="w-3.5 h-3.5" style={{ color: "var(--ln-gold-bright)" }} />
                </div>
                <div className="leading-tight min-w-0 flex-1">
                  <p className="text-[11px] font-bold truncate text-white">{t(alert.labelKey)}</p>
                  <p className="text-[9px]" style={{ color: "var(--ln-smoke)" }}>{t("landing_mock_alerts_title")}</p>
                </div>
                <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                  {waveBars.map((bar, i) => (
                    <span
                      key={i}
                      className="w-[2px] h-4 rounded-full origin-bottom animate-wave-bar"
                      style={{ background: "var(--ln-gold)", opacity: 0.8, animationDelay: `${bar.delay}s`, animationDuration: `${bar.duration}s` }}
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
                      <span className="font-bold" style={{ color: "var(--ln-gold-bright)" }}>@{c.name}</span>{" "}
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
      <section className="border-b" style={{ borderColor: "var(--ln-border)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--ln-border)]">
          {stats.map(([n, label], i) => (
            <Reveal key={label} delay={i * 80} className="px-4 first:pl-0 text-center sm:text-left">
              <p className="text-2xl sm:text-3xl font-semibold text-white">{n}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--ln-smoke)" }}>{label}</p>
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  function Features() {
    const items: { icon: typeof Mic; titleKey: TranslationKey; descKey: TranslationKey }[] = [
      { icon: Mic, titleKey: "landing_feature_1_title", descKey: "landing_feature_1_desc" },
      { icon: Bell, titleKey: "landing_feature_2_title", descKey: "landing_feature_2_desc" },
      { icon: Music, titleKey: "landing_feature_3_title", descKey: "landing_feature_3_desc" },
      { icon: Shield, titleKey: "landing_feature_4_title", descKey: "landing_feature_4_desc" },
      { icon: Globe, titleKey: "landing_feature_5_title", descKey: "landing_feature_5_desc" },
      { icon: SlidersHorizontal, titleKey: "landing_feature_6_title", descKey: "landing_feature_6_desc" },
    ];
    return (
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28 scroll-mt-20">
        <div className="max-w-lg mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ln-gold)" }}>{t("landing_nav_features")}</span>
          <h2 className="mt-3 text-[32px] font-semibold tracking-tight text-white">{t("landing_features_title")}</h2>
          <p className="mt-4 text-base" style={{ color: "var(--ln-ash)" }}>{t("landing_features_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((f, i) => (
            <Reveal key={f.titleKey} delay={(i % 3) * 90} className="ln-key ln-key-hover p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="ln-icon-circle w-10 h-10">
                  <f.icon className="w-4.5 h-4.5" style={{ color: "var(--ln-mist)" }} />
                </div>
                <span className="text-[11px] font-bold" style={{ color: "var(--ln-smoke)", fontFamily: "var(--font-geist-mono)" }}>0{i + 1}</span>
              </div>
              <h3 className="text-sm font-semibold mb-1.5 text-white">{t(f.titleKey)}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--ln-ash)" }}>{t(f.descKey)}</p>
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
      <section id="how" className="border-y scroll-mt-20" style={{ borderColor: "var(--ln-border)", background: "var(--ln-ink)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28">
          <h2 className="text-[32px] font-semibold tracking-tight text-center mb-16 text-white">{t("landing_how_title")}</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <Reveal key={s.titleKey} delay={i * 120} className="text-center sm:text-left">
                <p className="text-4xl font-semibold mb-3" style={{ color: "var(--ln-gold)", opacity: 0.35, fontFamily: "var(--font-geist-mono)" }}>0{i + 1}</p>
                <h3 className="text-sm font-semibold mb-1.5 text-white">{t(s.titleKey)}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--ln-ash)" }}>{t(s.descKey)}</p>
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
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-28 scroll-mt-20">
        <div className="text-center max-w-lg mx-auto mb-16">
          <h2 className="text-[32px] font-semibold tracking-tight text-white">{t("landing_pricing_title")}</h2>
          <p className="mt-4 text-base" style={{ color: "var(--ln-ash)" }}>{t("landing_pricing_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Reveal className="ln-key p-6">
            <h3 className="text-sm font-semibold" style={{ color: "var(--ln-ash)" }}>{t("landing_pricing_free_title")}</h3>
            <p className="text-4xl font-semibold mt-2 text-white">{t("landing_pricing_free_price")}</p>
            <p className="text-xs mb-5" style={{ color: "var(--ln-smoke)" }}>{t("landing_pricing_free_desc")}</p>
            <ul className="space-y-2.5 mb-6">
              {freeItems.map((k) => (
                <li key={k} className="flex items-start gap-2 text-xs" style={{ color: "var(--ln-ash)" }}>
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--ln-gold)" }} /> {t(k)}
                </li>
              ))}
            </ul>
            <button onClick={onLaunch} className="ln-btn ln-btn-ghost w-full text-sm">{t("landing_hero_cta_primary")}</button>
          </Reveal>
          <Reveal
            delay={120}
            className="ln-key p-6 relative"
            style={{ boxShadow: "rgba(255,255,255,0.05) 0px 1px 0px 0px inset, rgba(216,154,22,0.4) 0px 0px 0px 1px, rgba(0,0,0,0.3) 0px -1px 0px 0px inset" }}
          >
            <span className="ln-badge ln-badge-gold absolute -top-3 left-5">{t("landing_pricing_premium_badge")}</span>
            <h3 className="text-sm font-semibold" style={{ color: "var(--ln-ash)" }}>{t("landing_pricing_premium_title")}</h3>
            <p className="text-4xl font-semibold mt-2 text-white">
              {MEMBERSHIP_PRICE_LABEL.split(" / ")[0]}
              <span className="text-sm font-medium" style={{ color: "var(--ln-smoke)" }}> {t("landing_pricing_period")}</span>
            </p>
            <p className="text-xs mb-5" style={{ color: "var(--ln-smoke)" }}>{t("landing_pricing_premium_desc")}</p>
            <ul className="space-y-2.5 mb-6">
              {premiumItems.map((k) => (
                <li key={k} className="flex items-start gap-2 text-xs" style={{ color: "var(--ln-ash)" }}>
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--ln-gold)" }} /> {t(k)}
                </li>
              ))}
            </ul>
            <button onClick={onLaunch} className="ln-btn ln-btn-primary w-full text-sm">{t("landing_hero_cta_primary")}</button>
          </Reveal>
        </div>
      </section>
    );
  }

  function AndroidSection() {
    return (
      <section className="border-y" style={{ borderColor: "var(--ln-border)", background: "var(--ln-ink)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <span className="ln-badge mb-3">{t("landing_android_badge")}</span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2 text-white">
              <Smartphone className="w-5 h-5" style={{ color: "var(--ln-gold)" }} /> {t("landing_android_title")}
            </h2>
            <p className="mt-2 text-sm max-w-lg" style={{ color: "var(--ln-ash)" }}>{t("landing_android_desc")}</p>
            <p className="mt-2 text-[11px] max-w-lg" style={{ color: "var(--ln-smoke)" }}>{t("landing_android_note")}</p>
          </div>
          <a
            href="https://github.com/SiikNotic/LiveNest/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="ln-btn ln-btn-primary px-5 py-3 text-sm whitespace-nowrap"
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
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-24 sm:py-28 scroll-mt-20">
        <h2 className="text-[32px] font-semibold tracking-tight text-center mb-12 text-white">{t("landing_faq_title")}</h2>
        <div className="space-y-3">
          {items.map(([qKey, aKey], i) => {
            const isOpen = open === qKey;
            return (
              <Reveal key={qKey} delay={i * 60}>
                <div className="ln-key ln-key-hover p-6 cursor-pointer" onClick={() => setOpen(isOpen ? null : qKey)}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">{t(qKey)}</h3>
                    <ChevronDown
                      className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                      style={{ color: "var(--ln-smoke)" }}
                    />
                  </div>
                  {isOpen && (
                    <p className="text-xs leading-relaxed mt-2.5 animate-slide-down" style={{ color: "var(--ln-ash)" }}>
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
        <Reveal className="ln-key px-6 py-14 sm:px-14 sm:py-16 relative flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full" style={{ background: "linear-gradient(to bottom, var(--ln-gold), var(--ln-silver))" }} />
          <div className="relative text-center sm:text-left">
            <h2 className="text-[32px] font-semibold tracking-tight text-white">{t("landing_final_title")}</h2>
            <p className="text-sm mt-2 max-w-md" style={{ color: "var(--ln-ash)" }}>{t("landing_final_subtitle")}</p>
          </div>
          <button onClick={onLaunch} className="ln-btn ln-btn-primary px-7 py-3 text-sm whitespace-nowrap">
            {t("landing_final_cta")}
          </button>
        </Reveal>
      </section>
    );
  }

  function Footer() {
    return (
      <footer className="border-t" style={{ borderColor: "var(--ln-border)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-[1.5fr_1fr_1fr] gap-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg" />
              <span className="text-sm font-medium text-white">Live<span style={{ color: "var(--ln-gold)" }}>Nest</span></span>
            </div>
            <p className="text-xs max-w-xs" style={{ color: "var(--ln-smoke)" }}>{t("landing_footer_tagline")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ln-smoke)" }}>{t("landing_footer_legal")}</p>
            <div className="flex flex-col gap-1.5 text-xs" style={{ color: "var(--ln-ash)" }}>
              <a href="/terms.html" className="hover:text-white transition-colors">{t("landing_footer_terms")}</a>
              <a href="/es/lector-voz-tiktok-live/" className="hover:text-white transition-colors">Lector de voz TikTok Live</a>
              <a href="/es/como-leer-comentarios-tiktok-live/" className="hover:text-white transition-colors">Guía TikTok Live</a>
              <a href="/es/tiktok-live-text-to-speech/" className="hover:text-white transition-colors">TikTok Live TTS</a>
              <a href="/es/alertas-tiktok-live/" className="hover:text-white transition-colors">Alertas TikTok Live</a>
              <a href="/privacy.html" className="hover:text-white transition-colors">{t("landing_footer_privacy")}</a>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ln-smoke)" }}>{t("landing_footer_contact")}</p>
            <a href="mailto:livenestapp@gmail.com" className="text-xs hover:text-white transition-colors" style={{ color: "var(--ln-ash)" }}>
              livenestapp@gmail.com
            </a>
          </div>
        </div>
        <div
          className="border-t py-4 text-center text-[11px]"
          style={{ borderColor: "var(--ln-border)", color: "var(--ln-smoke)", fontFamily: "var(--font-geist-mono)" }}
        >
          © {new Date().getFullYear()} LiveNest
        </div>
      </footer>
    );
  }
}
