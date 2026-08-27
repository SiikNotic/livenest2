import { Crown } from "lucide-react";

/** Pequeña insignia que marca una opción como exclusiva para miembros.
 *  Reutilizable en cualquier vista (temas, voces, proveedores, etc.) para
 *  mantener el mismo estilo visual del candado premium en toda la app. */
export function PremiumBadge() {
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-bg shadow-sm">
      <Crown className="w-3 h-3" />
    </span>
  );
}

/** Dispara la navegación a la pantalla donde el usuario activa su
 *  membresía. La cuenta/licencia vive en la pestaña "account" (ver
 *  App.tsx), así que emitimos un evento global que App.tsx escucha y
 *  usa para cambiar de pestaña — evita tener que pasar props de
 *  navegación por cada vista que necesite ofrecer el upgrade. */
export function requestUpgrade() {
  window.dispatchEvent(new CustomEvent("livenest:request-upgrade"));
}
