import { useCallback, useMemo, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GripVertical, RotateCcw } from "lucide-react";
import { ChatView } from "../views/ChatView";
import { EventsView } from "../views/EventsView";
import { MusicView } from "../views/MusicView";
import { useI18n, type TranslationKey } from "../lib/i18n";

const ReactGridLayout = WidthProvider(GridLayout);

/*
Versión tablet del dashboard: 2 columnas, objetivos táctiles grandes,
reordenable por arrastre (react-grid-layout ya soporta touch de forma
nativa), pero SIN redimensionar por esquina — en pantallas táctiles medias,
el resize por arrastre de esquina es propenso a errores; reordenar alcanza
para que el streamer priorice lo que necesita ver.

No es el layout de escritorio encogido ni el de móvil estirado — usa su
propia grilla de 2 columnas con paneles más altos.
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

const DEFAULT_LAYOUT: Layout[] = [
  { i: "chat", x: 0, y: 0, w: 1, h: 14 },
  { i: "music", x: 1, y: 0, w: 1, h: 8 },
  { i: "events", x: 1, y: 8, w: 1, h: 8 },
];

const STORAGE_KEY = "livenest_tablet_layout";

function loadStoredLayout(): Layout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 3 ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function TabletDashboard() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<Layout[]>(loadStoredLayout);

  const handleLayoutChange = useCallback((next: Layout[]) => {
    setLayout(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LAYOUT));
  };

  const panelOrder = useMemo<PanelId[]>(() => ["chat", "events", "music"], []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-muted hover:text-text transition-colors active:scale-95"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("dash_reset_layout")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <ReactGridLayout
          className="layout"
          layout={layout}
          onLayoutChange={handleLayoutChange}
          cols={2}
          rowHeight={28}
          margin={[12, 12]}
          draggableHandle=".panel-drag-handle"
          isResizable={false}
          isBounded
        >
          {panelOrder.map((id) => {
            const Comp = PANEL_COMPONENTS[id];
            return (
              <div key={id} className="rounded-2xl border border-border bg-bg-card overflow-hidden flex flex-col">
                <div className="panel-drag-handle flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-soft cursor-move flex-shrink-0 touch-none">
                  <GripVertical className="w-4 h-4 text-muted" />
                  <span className="text-sm font-bold text-text-soft">{t(PANEL_LABEL_KEYS[id])}</span>
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
