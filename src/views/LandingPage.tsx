import { useState } from "react";
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
    return (
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
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
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-5">
              <span className="w-4 h-px bg-primary" /> LiveNest
            </span>
            <h1 className="text-4xl sm:text-[3.25rem] font-extrabold tracking-tight leading-[1.08]">
              <span className="block">{t("landing_hero_title_1")}</span>
              {t("landing_hero_title_2") && <span className="block">{t("landing_hero_title_2")}</span>}
              <span className="block text-gradient">{t("landing_hero_title_3")}</span>
            </h1>
            <p className="mt-5 text-base text-text-soft max-w-md leading-relaxed">{t("landing_hero_subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onLaunch} className="btn-primary text-sm px-6 py-3.5">{t("landing_hero_cta_primary")}</button>
              <button onClick={() => scrollTo("features")} className="btn-ghost text-sm px-6 py-3.5">{t("landing_hero_cta_secondary")}</button>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
              {[t("landing_hero_trust_1"), t("landing_hero_trust_2"), t("landing_hero_trust_3")].map((txt, i) => (
                <span key={txt} className="flex items-center gap-3">
                  {i > 0 && <span className="w-1 h-1 rounded-full bg-border-soft" />}
                  {txt}
                </span>
              ))}
            </div>
          </div>
          <HeroMock />
        </div>
      </section>
    );
  }

  function HeroMock() {
    const chatLines = [
      { name: "maria_23", msg: "Hola! Saludos desde México 🇲🇽" },
      { name: "andree21", msg: "Great stream! 🔥" },
      { name: "lucas99", msg: "Me encanta este contenido" },
      { name: "sofia_12", msg: "Nuevo seguidor! 🎉" },
    ];
    const alert = { icon: Gift, labelKey: "landing_mock_alert_gift" as const };
    // Barras de una "onda de voz" — sugieren que algo se está leyendo en voz
    // alta ahora mismo, sin necesitar una captura de audio real.
    const waveBars = [8, 16, 11, 22, 14, 26, 10, 18, 13, 20, 9, 15];
    return (
      <div className="relative rounded-2xl border border-border-soft bg-bg-card overflow-hidden shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

        {/* Cabecera tipo overlay de transmisión — no una pantalla de navegador
            (eso ya lo probamos en v2 y no funcionó). */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1.5 bg-black/30 rounded-full pl-2 pr-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse-soft" />
            <span className="text-[10px] font-extrabold tracking-wide">{t("landing_mock_status")}</span>
          </div>
          <Radio className="w-4 h-4 text-muted" />
        </div>

        {/* Toast de alerta, como aparecería de verdad sobre el stream */}
        <div className="mx-4 flex items-center gap-2.5 bg-bg-soft border border-border-soft rounded-xl px-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <alert.icon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <p className="text-xs font-bold truncate">{t(alert.labelKey)}</p>
            <p className="text-[10px] text-muted">{t("landing_mock_alerts_title")}</p>
          </div>
          {/* Onda de voz — refuerza que la alerta se está leyendo en vivo */}
          <div className="flex items-end gap-[3px] h-5 flex-shrink-0">
            {waveBars.map((h, i) => (
              <span key={i} className="w-[2.5px] rounded-full bg-primary/60" style={{ height: h }} />
            ))}
          </div>
        </div>

        {/* Panel de chat, como un overlay real de transmisión */}
        <div className="p-4">
          <p className="text-[10px] font-bold text-muted uppercase tracking-wide mb-2">{t("landing_mock_chat_title")}</p>
          <div className="space-y-2">
            {chatLines.map((c) => (
              <div key={c.name} className="text-xs">
                <span className="font-bold text-primary">@{c.name}</span>{" "}
                <span className="text-text-soft">{c.msg}</span>
              </div>
            ))}
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
          {stats.map(([n, label]) => (
            <div key={label} className="px-4 first:pl-0 text-center sm:text-left">
              <p className="text-2xl sm:text-3xl font-extrabold">{n}</p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </div>
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
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 scroll-mt-16">
        <div className="max-w-lg mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">{t("landing_nav_features")}</span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">{t("landing_features_title")}</h2>
          <p className="mt-3 text-sm text-text-soft">{t("landing_features_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {items.map((f, i) => (
            <div key={f.titleKey} className="bg-bg-card p-6 hover:bg-bg-soft transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center flex-shrink-0`}>
                  <f.icon className={`w-4.5 h-4.5 ${f.color}`} />
                </div>
                <span className="text-[11px] font-bold text-muted">0{i + 1}</span>
              </div>
              <h3 className="text-sm font-bold mb-1.5">{t(f.titleKey)}</h3>
              <p className="text-xs text-text-soft leading-relaxed">{t(f.descKey)}</p>
            </div>
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-14">{t("landing_how_title")}</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={s.titleKey} className="text-center sm:text-left">
                <p className="text-4xl font-extrabold text-primary/30 mb-3">0{i + 1}</p>
                <h3 className="text-sm font-bold mb-1.5">{t(s.titleKey)}</h3>
                <p className="text-xs text-text-soft leading-relaxed">{t(s.descKey)}</p>
              </div>
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
      <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 scroll-mt-16">
        <div className="text-center max-w-lg mx-auto mb-14">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t("landing_pricing_title")}</h2>
          <p className="mt-3 text-sm text-text-soft">{t("landing_pricing_subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="card">
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
          </div>
          <div className="card !border-primary/40 relative">
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
          </div>
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
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-24 scroll-mt-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">{t("landing_faq_title")}</h2>
        <div className="space-y-3">
          {items.map(([qKey, aKey]) => {
            const isOpen = open === qKey;
            return (
              <div key={qKey} className="card cursor-pointer" onClick={() => setOpen(isOpen ? null : qKey)}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold">{t(qKey)}</h3>
                  <ChevronDown className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
                {isOpen && (
                  <p className="text-xs text-text-soft leading-relaxed mt-2.5 animate-slide-down">
                    {aKey === "landing_faq_3_a" ? t(aKey, { price: MEMBERSHIP_PRICE_LABEL }) : t(aKey)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function FinalCta({ onLaunch }: { onLaunch: () => void }) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative rounded-2xl border border-border bg-bg-soft/60 px-6 py-14 sm:px-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-accent" />
          <div className="relative text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold">{t("landing_final_title")}</h2>
            <p className="text-sm text-text-soft mt-2 max-w-md">{t("landing_final_subtitle")}</p>
          </div>
          <button onClick={onLaunch} className="btn-primary text-sm px-7 py-3.5 whitespace-nowrap">
            {t("landing_final_cta")}
          </button>
        </div>
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
