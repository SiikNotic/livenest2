import { useCallback, useMemo, useState, useEffect } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, X, RotateCcw, LayoutGrid, ChevronDown, Eye } from "lucide-react";
import { ChatView } from "../views/ChatView";
import { EventsView } from "../views/EventsView";
import { MusicView } from "../views/MusicView";
import { useI18n, type TranslationKey } from "../lib/i18n";

const ReactGridLayout = WidthProvider(GridLayout);

/*
Paneles del dashboard de escritorio, arrastrables y redimensionables sobre
una grilla de 12 columnas (react-grid-layout ya es la única librería de
drag & drop del proyecto — no se agregó ninguna otra).

Persistencia: el diseño del usuario se guarda en localStorage
("livenest_dashboard_layout"). No se creó ninguna tabla nueva en Supabase
para esto — un layout de UI puramente visual no necesita sincronizarse
entre dispositivos, así que localStorage es suficiente y evita gastar
cuota de base de datos en algo que no la necesita.

Los paneles en sí (ChatView, EventsView, MusicView) son exactamente los
mismos componentes que ya existían — el drag & drop solo cambia dónde y
de qué tamaño se ven, nunca duplica su lógica interna.
*/

type PanelId = "chat" | "events" | "music";

const PANEL_LABEL_KEYS: Record<PanelId, TranslationKey> = {
  chat: "dash_panel_chat",
  events: "dash_panel_events",
  music: "dash_panel_music",
};

const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  chat: ChatView,
  events: EventsView,
  music: MusicView,
};

const ALL_PANELS: PanelId[] = ["chat", "events", "music"];

const LAYOUT_PRESETS: Record<string, Layout[]> = {
  default: [
    { i: "chat", x: 0, y: 0, w: 6, h: 10, minW: 3, minH: 6 },
    { i: "events", x: 6, y: 0, w: 3, h: 10, minW: 2, minH: 6 },
    { i: "music", x: 9, y: 0, w: 3, h: 10, minW: 3, minH: 6 },
  ],
  chatFocus: [
    { i: "chat", x: 0, y: 0, w: 8, h: 12, minW: 3, minH: 6 },
    { i: "events", x: 8, y: 0, w: 4, h: 6, minW: 2, minH: 4 },
    { i: "music", x: 8, y: 6, w: 4, h: 6, minW: 3, minH: 4 },
  ],
  musicFocus: [
    { i: "music", x: 0, y: 0, w: 7, h: 12, minW: 3, minH: 6 },
    { i: "chat", x: 7, y: 0, w: 5, h: 7, minW: 3, minH: 4 },
    { i: "events", x: 7, y: 7, w: 5, h: 5, minW: 2, minH: 4 },
  ],
  compact: [
    { i: "chat", x: 0, y: 0, w: 5, h: 8, minW: 3, minH: 5 },
    { i: "events", x: 5, y: 0, w: 3, h: 8, minW: 2, minH: 5 },
    { i: "music", x: 8, y: 0, w: 4, h: 8, minW: 3, minH: 5 },
  ],
};

const PRESET_LABEL_KEYS: { id: keyof typeof LAYOUT_PRESETS; labelKey: TranslationKey }[] = [
  { id: "default", labelKey: "dash_preset_default" },
  { id: "chatFocus", labelKey: "dash_preset_chat_focus" },
  { id: "musicFocus", labelKey: "dash_preset_music_focus" },
  { id: "compact", labelKey: "dash_preset_compact" },
];

const STORAGE_KEY = "livenest_dashboard_layout";
const HIDDEN_KEY = "livenest_dashboard_hidden";

function loadStoredLayout(): Layout[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadHiddenPanels(): PanelId[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is PanelId => ALL_PANELS.includes(p)) : [];
  } catch {
    return [];
  }
}

export function DesktopDashboard() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<Layout[]>(() => loadStoredLayout() ?? LAYOUT_PRESETS.default);
  const [hidden, setHidden] = useState<PanelId[]>(() => loadHiddenPanels());
  const [presetOpen, setPresetOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(() => loadStoredLayout() !== null);

  useEffect(() => {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  }, [hidden]);

  // Cerrar el menú de diseños con Escape, igual que con clic afuera.
  useEffect(() => {
    if (!presetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presetOpen]);

  const visiblePanels = useMemo(() => ALL_PANELS.filter((p) => !hidden.includes(p)), [hidden]);
  const visibleLayout = useMemo(() => layout.filter((l) => visiblePanels.includes(l.i as PanelId)), [layout, visiblePanels]);

  const handleLayoutChange = useCallback((next: Layout[]) => {
    // react-grid-layout solo reporta los items visibles en cada callback —
    // conservamos la posición guardada de los ocultos combinando ambos.
    setLayout((prev) => {
      const merged = [...next];
      for (const item of prev) {
        if (!merged.some((m) => m.i === item.i)) merged.push(item);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
    setIsCustom(true);
  }, []);

  const applyPreset = (id: keyof typeof LAYOUT_PRESETS) => {
    setLayout(LAYOUT_PRESETS[id]);
    setHidden([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(LAYOUT_PRESETS[id]));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([]));
    setIsCustom(false);
    setPresetOpen(false);
  };

  const resetLayout = () => applyPreset("default");

  const hidePanel = (id: PanelId) => setHidden((h) => [...h, id]);
  const showPanel = (id: PanelId) => setHidden((h) => h.filter((p) => p !== id));

  return (
    <div className="h-full flex flex-col">
      {/* Layout controls */}
      <div className="flex items-center gap-2 px-4 lg:px-6 pt-4 pb-2 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setPresetOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-text-soft hover:text-text transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {isCustom ? t("dash_my_layout") : (() => {
              const key = PRESET_LABEL_KEYS.find((p) => p.id === Object.keys(LAYOUT_PRESETS).find((k) => LAYOUT_PRESETS[k] === layout))?.labelKey;
              return key ? t(key) : t("dash_layout_label");
            })()}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {presetOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPresetOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 w-48 rounded-xl bg-bg-card border border-border shadow-xl overflow-hidden py-1">
                {PRESET_LABEL_KEYS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-text-soft hover:bg-bg-hover hover:text-text transition-colors"
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-muted hover:text-text transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("dash_reset")}
        </button>

        {hidden.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            {hidden.map((id) => (
              <button
                key={id}
                onClick={() => showPanel(id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                {t(PANEL_LABEL_KEYS[id])}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 pb-4">
        <ReactGridLayout
          className="layout"
          layout={visibleLayout}
          onLayoutChange={handleLayoutChange}
          cols={12}
          rowHeight={28}
          margin={[16, 16]}
          draggableHandle=".panel-drag-handle"
          resizeHandles={["se"]}
          isBounded
        >
          {visiblePanels.map((id) => {
            const Comp = PANEL_COMPONENTS[id];
            return (
              <div key={id} className="rounded-2xl border border-border bg-bg-card overflow-hidden flex flex-col">
                <div className="panel-drag-handle flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-soft cursor-move flex-shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-muted" />
                  <span className="text-xs font-bold text-text-soft flex-1">{t(PANEL_LABEL_KEYS[id])}</span>
                  <button
                    onClick={() => hidePanel(id)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-error-400 hover:bg-error-400/10 transition-colors"
                    title={t("dash_close_panel_title")}
                    aria-label={t("dash_close_panel_aria", { panel: t(PANEL_LABEL_KEYS[id]) })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
                  <Comp />
                </div>
              </div>
            );
          })}
        </ReactGridLayout>
      </div>
    </div>
  );
}
