import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useI18n } from "../lib/i18n";

/*
Sin esto, cualquier error que ocurra durante el render desmonta TODO el
árbol de React sin avisar — y como el fondo de la app es oscuro, eso se ve
como una pantalla negra sin ninguna pista de qué pasó.

Con este componente, ese mismo error se captura y se muestra como un
mensaje legible con la opción de recargar, en vez de dejar al usuario con
una pantalla completamente negra y sin explicación.
*/

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("LiveNest crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      // useI18n es un store de Zustand, no un hook de React en el sentido
      // estricto — se puede leer con getState() incluso desde un componente
      // de clase (que no puede usar hooks). No hace falta reactividad acá:
      // esta pantalla ya está mostrando un idioma fijo desde que el error
      // ocurrió.
      const { t } = useI18n.getState();
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-bg text-text">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-error-400/15 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-error-400" />
            </div>
            <div>
              <h1 className="text-base font-bold">{t("errorboundary_title")}</h1>
              <p className="text-sm text-muted mt-1">
                {t("errorboundary_desc")}
              </p>
            </div>
            <details className="text-left text-xs text-muted-soft bg-bg-soft rounded-xl p-3 border border-border whitespace-pre-wrap break-words">
              <summary className="cursor-pointer font-semibold text-muted mb-1">{t("errorboundary_details")}</summary>
              {this.state.error.message}
            </details>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full justify-center"
            >
              <RefreshCw className="w-4 h-4" />
              {t("errorboundary_reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
