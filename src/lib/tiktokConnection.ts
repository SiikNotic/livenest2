export type TikTokEvent =
  | { type: "chat"; username: string; nickname?: string; avatar?: string; message: string; userId?: string; timestamp?: number }
  | { type: "gift"; username: string; nickname?: string; avatar?: string; giftName: string; count: number }
  | { type: "like"; username: string; nickname?: string; avatar?: string; count: number }
  | { type: "viewer"; count: number }
  | { type: "follow"; username: string; nickname?: string; avatar?: string }
  | { type: "share"; username: string; nickname?: string; avatar?: string }
  | { type: "sub"; username: string; nickname?: string; avatar?: string; detail: string };

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type Handlers = {
  onStatus?: (status: ConnectionStatus) => void;
  onEvent?: (event: TikTokEvent) => void;
  onError?: (message: string) => void;
  onNotLive?: (username: string) => void;
  onReconnecting?: () => void;
};

// Nos conectamos directamente a nuestra función (proxy WebSocket), NUNCA a Euler Stream
// directamente — así la API key nunca llega al navegador.
const TIKTOK_PROXY_WS_ENDPOINT = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/^http/, "ws")}/functions/v1/tiktok-connect`;

export class TikTokConnection {
  private ws: WebSocket | null = null;
  private handlers: Handlers;
  private retryCount = 0;
  private maxRetries = 5;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUsername = "";
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private closedByClient = false;
  private visibilityHandler: (() => void) | null = null;
  private seenKeys = new Map<string, number>();
  private static readonly MAX_SEEN = 500;

  constructor(handlers: Handlers) {
    this.handlers = handlers;

    // Reconnect when tab becomes visible again (browser throttles/suspends
    // WebSocket timers in background tabs, causing silent disconnects)
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible" && !this.closedByClient && this.currentUsername) {
          // Only reconnect if the socket is actually closed or closing.
          // If it's still OPEN, leave it alone — reconnecting causes duplicate
          // messages because Euler Stream re-sends recent history on connect.
          if (!this.ws || this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
            this.reconnectSilent();
          }
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  get status(): ConnectionStatus {
    if (!this.ws) return "disconnected";
    if (this.ws.readyState === WebSocket.CONNECTING) return "connecting";
    if (this.ws.readyState === WebSocket.OPEN) return "connected";
    if (this.ws.readyState === WebSocket.CLOSING) return "connecting";
    return "disconnected";
  }

  async connect(username: string): Promise<void> {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      this.handlers.onError?.("Introduce un nombre de usuario válido");
      return;
    }
    this.silentDisconnect();
    this.handlers.onStatus?.("connecting");
    this.currentUsername = clean;
    this.retryCount = 0;
    this.closedByClient = false;

    this.openSocket(this.buildProxyUrl(clean), clean);
  }

  /** Reconexión silenciosa — no muestra "disconnected" ni resetea el contador. */
  private async reconnectSilent(): Promise<void> {
    if (this.closedByClient || !this.currentUsername) return;
    this.silentDisconnect();
    this.handlers.onReconnecting?.();

    this.openSocket(this.buildProxyUrl(this.currentUsername), this.currentUsername);
  }

  /** Construye la URL de nuestro proxy WebSocket (sin ninguna clave privada). */
  private buildProxyUrl(username: string): string {
    const url = new URL(TIKTOK_PROXY_WS_ENDPOINT);
    url.searchParams.set("username", username);
    return url.toString();
  }

  /** Desconexión interna sin disparar onStatus("disconnected"). */
  private silentDisconnect() {
    this.stopHeartbeat();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "client disconnect");
      }
      this.ws = null;
    }
  }

  private openSocket(url: string, username: string) {
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.handlers.onStatus?.("error");
      this.handlers.onError?.(err instanceof Error ? err.message : "No se pudo abrir el WebSocket");
      return;
    }

    this.ws.onopen = () => {
      this.handlers.onStatus?.("connected");
      this.lastPong = Date.now();
      this.startHeartbeat();
    };

    this.ws.onmessage = (ev) => {
      this.lastPong = Date.now();
      this.handleMessage(ev.data);
    };

    this.ws.onerror = () => {
      // Errores de WebSocket silenciados — el onclose maneja la lógica
    };

    this.ws.onclose = (ev) => {
      this.stopHeartbeat();
      if (this.closedByClient) return;

      // Euler Stream WebSocket close codes (from @eulerstream/euler-websocket-sdk):
      // 1000 = NORMAL, 1011 = INTERNAL_SERVER_ERROR
      // 4005 = STREAM_END, 4006 = NO_MESSAGES_TIMEOUT
      // 4400 = INVALID_OPTIONS, 4401 = INVALID_AUTH, 4403 = NO_PERMISSION
      // 4404 = NOT_LIVE, 4429 = TOO_MANY_CONNECTIONS
      // 4500 = TIKTOK_CLOSED_CONNECTION, 4555 = MAX_LIFETIME_EXCEEDED
      // 4556 = WEBCAST_FETCH_ERROR, 4557 = ROOM_INFO_FETCH_ERROR

      // 4404 (NOT_LIVE) can be a false negative — Euler Stream's live check
      // sometimes fails transiently. Retry a few times before declaring offline.
      // These retries are an internal check, not a real reconnect the user
      // needs to see, so they don't trigger the "Reconectando…" banner.
      if (ev.code === 4404) {
        if (this.retryCount < 3) {
          this.retryCount++;
          this.retryTimer = setTimeout(() => {
            this.reconnectSilent();
          }, 1500 * this.retryCount);
        } else {
          this.stopAutoReconnect();
          this.handlers.onStatus?.("disconnected");
          this.handlers.onNotLive?.(username);
        }
      } else if (
        ev.code === 4556 || ev.code === 4557 ||
        ev.code === 4500 || ev.code === 4006 ||
        ev.code === 1006 || ev.code === 1011 || ev.code === 4000
      ) {
        // Transient errors — reconnect silently
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          this.retryTimer = setTimeout(() => {
            this.reconnectSilent();
          }, 2000 * this.retryCount);
        } else {
          this.stopAutoReconnect();
          this.handlers.onStatus?.("disconnected");
          this.handlers.onError?.(
            "No se pudo conectar con el canal. Vuelve a intentarlo en unos segundos."
          );
        }
      } else if (ev.code === 4005) {
        // La transmisión terminó — para quien mira, es lo mismo que "no está
        // en vivo": se avisa y se deja de intentar reconectar solo.
        this.stopAutoReconnect();
        this.handlers.onStatus?.("disconnected");
        this.handlers.onNotLive?.(username);
      } else {
        // 1000 (normal), 4400/4401/4403 (config/auth), 4429 (rate limit), 4555 (lifetime)
        this.stopAutoReconnect();
        this.handlers.onStatus?.("disconnected");
      }
    };
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed === null || typeof parsed !== "object") return;

    const obj = parsed as Record<string, unknown>;
    let items: unknown[];

    // Euler Stream schema v2 format: { messages: [{ type, data }], timestamp }
    if (Array.isArray(obj.messages)) items = obj.messages;
    else if (Array.isArray(obj.events)) items = obj.events; // Fallback: array of events
    else if (Array.isArray(parsed)) items = parsed; // Fallback: array directly
    else items = [parsed]; // Single event

    for (const item of items) {
      // Los regalos se manejan aparte: TikTok manda un mensaje por cada
      // "golpe" dentro de una racha (ej. 2 rosas seguidas = 2 mensajes con
      // repeatCount 1 y 2), y solo el último trae repeatEnd=true. Si los
      // tratáramos como eventos independientes, la alerta se repetiría por
      // cada golpe en vez de anunciar la cantidad final una sola vez.
      const giftInfo = parseGiftMessage(item);
      if (giftInfo) {
        this.handleGiftMessage(giftInfo);
        continue;
      }
      logUnknownLinkMicEvent(item);
      const event = normalizeSchemaV2(item);
      if (event && !this.isDuplicate(event)) this.handlers.onEvent?.(event);
    }
  }

  /** Regalos en curso de una racha (todavía no confirmados como el golpe
   *  final) — uno por combinación usuario+regalo, para no mezclar la racha
   *  de rosas de un usuario con la de otro, ni con otro tipo de regalo del
   *  mismo usuario. */
  private pendingGiftCombos = new Map<
    string,
    { count: number; giftName: string; username: string; nickname?: string; avatar?: string; timer: ReturnType<typeof setTimeout> }
  >();
  // Cuánto esperar tras el último golpe de una racha sin confirmación
  // explícita de que terminó, antes de anunciarla igual — así nunca se
  // pierde un regalo si el servidor no manda repeatEnd por alguna razón.
  private static readonly GIFT_COMBO_FLUSH_MS = 1500;

  private handleGiftMessage(info: {
    username: string; nickname?: string; avatar?: string;
    giftName: string; giftId: string; count: number; repeatEnd: boolean;
  }) {
    const key = `${info.username}|${info.giftId}`;
    const existing = this.pendingGiftCombos.get(key);
    if (existing) clearTimeout(existing.timer);

    if (info.repeatEnd) {
      // Racha confirmada como terminada — anunciar ya, con el total final.
      this.pendingGiftCombos.delete(key);
      const event: TikTokEvent = {
        type: "gift",
        username: info.username,
        nickname: info.nickname,
        avatar: info.avatar,
        giftName: info.giftName,
        count: info.count,
      };
      if (!this.isDuplicate(event)) this.handlers.onEvent?.(event);
      return;
    }

    // Todavía puede seguir la racha — esperar un poco por si llega otro
    // golpe del mismo regalo antes de anunciar (así "2 rosas" se lee una
    // sola vez con la cantidad correcta, no dos veces por separado).
    const timer = setTimeout(() => this.flushGiftCombo(key), TikTokConnection.GIFT_COMBO_FLUSH_MS);
    this.pendingGiftCombos.set(key, {
      count: info.count,
      giftName: info.giftName,
      username: info.username,
      nickname: info.nickname,
      avatar: info.avatar,
      timer,
    });
  }

  private flushGiftCombo(key: string) {
    const entry = this.pendingGiftCombos.get(key);
    if (!entry) return;
    this.pendingGiftCombos.delete(key);
    const event: TikTokEvent = {
      type: "gift",
      username: entry.username,
      nickname: entry.nickname,
      avatar: entry.avatar,
      giftName: entry.giftName,
      count: entry.count,
    };
    if (!this.isDuplicate(event)) this.handlers.onEvent?.(event);
  }

  private clearPendingGiftCombos() {
    for (const entry of this.pendingGiftCombos.values()) clearTimeout(entry.timer);
    this.pendingGiftCombos.clear();
  }

  /** Deduplicate chat messages across reconnections.
   *  Euler Stream re-sends recent history on each new WebSocket connection,
   *  so without this, messages appear twice after every reconnect. */
  /** Deduplicate events across reconnections. Euler Stream re-sends recent
   *  history on each new WebSocket connection — sin esto, un regalo/follow/
   *  compartido/suscripción que llegó justo antes de una reconexión (por
   *  ejemplo, un timeout de heartbeat) podía volver a llegar y anunciarse
   *  una segunda vez. El chat usa una ventana "para siempre" (hasta que se
   *  evict por tamaño) porque cada mensaje trae su propio timestamp de
   *  origen y por lo tanto ya es único de por sí; el resto de eventos no
   *  trae un timestamp fiable, así que se deduplican con una ventana corta
   *  — lo bastante para filtrar el reenvío de historial, sin bloquear un
   *  regalo genuinamente repetido minutos después. */
  private static readonly REPLAY_DEDUP_WINDOW_MS = 20000;

  private isDuplicate(event: TikTokEvent): boolean {
    const key = this.dedupKey(event);
    if (!key) return false;
    const now = Date.now();
    const last = this.seenKeys.get(key);
    const isChat = event.type === "chat";
    if (last !== undefined && (isChat || now - last < TikTokConnection.REPLAY_DEDUP_WINDOW_MS)) {
      return true;
    }
    this.seenKeys.set(key, now);
    if (this.seenKeys.size > TikTokConnection.MAX_SEEN) {
      const oldest = this.seenKeys.keys().next().value;
      if (oldest !== undefined) this.seenKeys.delete(oldest);
    }
    return false;
  }

  private dedupKey(event: TikTokEvent): string | null {
    switch (event.type) {
      case "chat":
        return `chat|${event.username}|${event.message}|${event.timestamp ?? ""}`;
      case "gift":
        return `gift|${event.username}|${event.giftName}|${event.count}`;
      case "follow":
        return `follow|${event.username}`;
      case "share":
        return `share|${event.username}`;
      case "sub":
        return `sub|${event.username}|${event.detail}`;
      default:
        // "like"/"viewer" son de alta frecuencia y no representan una
        // alerta puntual — no hace falta (ni conviene) deduplicarlos.
        return null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      // Si no hemos recibido nada en 90s, la conexión está muerta
      // (ampliado de 45s a 90s para ser tolerante con la limitación de pestañas en segundo plano)
      if (Date.now() - this.lastPong > 90000) {
        this.ws.close(4000, "heartbeat timeout");
        return;
      }
      // Enviar ping (texto plano, Euler Stream lo ignora pero mantiene el socket activo)
      try {
        this.ws.send("ping");
      } catch {
        // ignore
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Cierre definitivo — el canal no está en vivo, la transmisión terminó, o
   *  hubo un error que no se arregla reintentando. Sin esto, el listener de
   *  visibilidad de pestaña seguía vivo y, al volver a la pestaña, disparaba
   *  otra ronda completa de reconexión (con su aviso de "Reconectando…" y,
   *  al fallar de nuevo, otro aviso de "canal no está en vivo") contra un
   *  canal que ya sabíamos offline — de ahí los avisos repetidos. */
  private stopAutoReconnect() {
    this.closedByClient = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  disconnect() {
    this.stopAutoReconnect();
    this.stopHeartbeat();
    this.clearPendingGiftCombos();
    this.retryCount = 0;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "client disconnect");
      }
      this.ws = null;
    }
    this.handlers.onStatus?.("disconnected");
  }
}

// TEMPORAL — diagnóstico para la alerta de "alguien pidió unirse al live".
// TikTok agrupa esa función bajo el nombre "link mic" en su protocolo (así
// se ve en librerías de código abierto como TikTok-Live-Connector: eventos
// tipo LinkMicMethod, LinkMessage, LinkLayer, etc.), pero no hay forma de
// confirmar desde aquí si Euler Stream realmente reenvía alguno de esos
// eventos al navegador — puede que TikTok solo se lo mande al anfitrión de
// forma privada, sin pasar por el canal público de mensajes. Este log deja
// ver en la consola del navegador cualquier mensaje cuyo "type" mencione
// "link", para poder capturar el evento real la próxima vez que alguien
// pida unirse en un live real, y programar la alerta con datos ciertos en
// vez de adivinar el formato. Se puede borrar una vez identificado (o si
// se confirma que nunca llega nada).
const loggedUnknownEventTypes = new Set<string>();
function logUnknownLinkMicEvent(item: unknown) {
  if (typeof item !== "object" || item === null) return;
  const type = (item as Record<string, unknown>).type;
  if (typeof type !== "string") return;
  const t = type.toLowerCase();
  if (t.includes("link") || t.includes("invite") || t.includes("cohost") || t.includes("guest")) {
    // eslint-disable-next-line no-console
    console.log("[LiveNest] Posible evento de invitado/link mic:", JSON.stringify(item));
    return;
  }
  // Red de seguridad: si aparece un tipo que nunca hemos visto (no es chat,
  // regalo, like, follow, share, sub, roomInfo...), lo dejamos ver una sola
  // vez por tipo, por si el evento real no usa la palabra "link" en absoluto.
  const known = [
    "webcastchatmessage", "chat", "chatmessage",
    "webcastgiftmessage", "gift", "giftmessage",
    "webcastlikemessage", "like", "likemessage",
    "webcastroomviewercountmessage", "viewer", "roomviewercountmessage", "roominfo",
    "webcastsocialmessage", "follow", "socialmessage",
    "webcastmembermessage", "member", "membermessage", "webcastroommessage",
    "webcastsharemessage", "share", "sharemessage",
    "webcastsubmessage", "sub", "subscribemessage",
  ];
  if (!known.includes(t) && !loggedUnknownEventTypes.has(t)) {
    loggedUnknownEventTypes.add(t);
    // eslint-disable-next-line no-console
    console.log("[LiveNest] Tipo de evento nunca visto:", type, JSON.stringify(item));
  }
}

// Extrae la info de un mensaje de regalo directamente del payload crudo,
// incluida la señal de si la racha terminó (repeatEnd). Se usa ANTES de
// normalizeSchemaV2 porque los regalos necesitan lógica de agrupación por
// racha que un evento normalizado de un solo golpe no puede expresar.
function parseGiftMessage(msg: unknown): {
  username: string; nickname?: string; avatar?: string;
  giftName: string; giftId: string; count: number; repeatEnd: boolean;
} | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const type = typeof m.type === "string" ? m.type : "";
  if (type !== "WebcastGiftMessage" && type !== "gift" && type !== "GiftMessage") return null;

  const data = (m.data ?? m.payload ?? {}) as Record<string, unknown>;
  const giftObj = data.gift as Record<string, unknown> | undefined;

  const giftNameRaw = data.giftName ?? data.gift_name ?? giftObj?.name ?? giftObj?.giftName;
  const giftIdRaw = data.giftId ?? data.gift_id ?? giftObj?.id ?? giftObj?.giftId ?? giftNameRaw;
  const count = Number(data.repeatCount ?? data.repeat_count ?? data.count ?? data.giftCount ?? data.comboCount ?? 1) || 1;

  // giftType === 1 (o "combo"/"streakable" en algunos esquemas) significa
  // que el regalo SÍ puede encadenarse en una racha — solo en ese caso vale
  // la pena esperar a repeatEnd; el resto de los regalos son de un solo
  // golpe y no necesitan espera.
  const giftTypeRaw = data.giftType ?? data.gift_type ?? giftObj?.giftType ?? giftObj?.type;
  const giftType = typeof giftTypeRaw === "number" ? giftTypeRaw : Number(giftTypeRaw);
  const repeatEndRaw = data.repeatEnd ?? data.repeat_end;
  const repeatEnd =
    typeof repeatEndRaw === "boolean" ? repeatEndRaw :
    typeof repeatEndRaw === "number" ? repeatEndRaw === 1 :
    giftType === 1 ? false : true;

  return {
    username: extractUsername(data, m),
    nickname: extractNickname(data, m) ?? undefined,
    avatar: extractAvatar(data, m) ?? undefined,
    giftName: typeof giftNameRaw === "string" && giftNameRaw.trim() ? giftNameRaw.trim() : "regalo",
    giftId: giftIdRaw !== undefined && giftIdRaw !== null ? String(giftIdRaw) : "unknown",
    count,
    repeatEnd,
  };
}

// Normaliza eventos del WebSocket de Euler Stream schema v2.
// Formato: { type: "WebcastChatMessage", data: { uniqueId, comment, ... } }
// o: { type: "roomInfo", data: { roomInfo: { isLive, currentViewers, ... } } }
function normalizeSchemaV2(msg: unknown): TikTokEvent | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const type = typeof m.type === "string" ? m.type : "";
  const data = (m.data ?? m.payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case "WebcastChatMessage":
    case "chat":
    case "ChatMessage": {
      const comment = data.comment ?? data.message ?? data.content ?? data.text;
      if (typeof comment !== "string") return null;
      const avatar = extractAvatar(data, m);
      const nickname = extractNickname(data, m);
      return {
        type: "chat",
        username: extractUsername(data, m),
        nickname: nickname ?? undefined,
        avatar: avatar ?? undefined,
        message: comment,
        userId: typeof data.userId === "string" ? data.userId : undefined,
        timestamp: typeof data.timestamp === "number" ? data.timestamp : undefined,
      };
    }
    // Los mensajes de regalo se interceptan antes, en handleMessage() vía
    // parseGiftMessage(), para poder agrupar la racha en un solo evento
    // final — nunca llegan hasta aquí.
    case "WebcastLikeMessage":
    case "like":
    case "LikeMessage": {
      return {
        type: "like",
        username: extractUsername(data, m),
        nickname: extractNickname(data, m) ?? undefined,
        avatar: extractAvatar(data, m) ?? undefined,
        count: Number(data.likeCount ?? data.count ?? data.totalLikeCount ?? 1) || 1,
      };
    }
    case "WebcastRoomViewerCountMessage":
    case "viewer":
    case "RoomViewerCountMessage":
    case "roomInfo": {
      // roomInfo message contains viewer count in data.roomInfo.currentViewers
      const roomInfo = data.roomInfo as Record<string, unknown> | undefined;
      const count = data.viewerCount ?? data.viewer_count ?? data.count ?? roomInfo?.currentViewers ?? roomInfo?.totalViewers;
      if (count !== undefined && count !== null) {
        return { type: "viewer", count: Number(count) || 0 };
      }
      return null;
    }
    case "WebcastSocialMessage":
    case "follow":
    case "SocialMessage": {
      // TikTok action codes: 1 = follow, 3 = share
      // Euler Stream may send action as number or string
      const actionRaw = data.action ?? data.event ?? data.actionType;
      const actionNum = typeof actionRaw === "number" ? actionRaw : parseInt(String(actionRaw), 10);
      const actionStr = String(actionRaw ?? "").toLowerCase();

      if (actionStr.includes("share") || actionNum === 3) {
        return { type: "share", username: extractUsername(data, m), nickname: extractNickname(data, m) ?? undefined, avatar: extractAvatar(data, m) ?? undefined };
      }
      // Only treat as follow if action is explicitly 1 or "follow"
      if (actionStr.includes("follow") || actionNum === 1 || actionStr === "") {
        return { type: "follow", username: extractUsername(data, m), nickname: extractNickname(data, m) ?? undefined, avatar: extractAvatar(data, m) ?? undefined };
      }
      // Unknown social action — ignore
      return null;
    }
    case "WebcastMemberMessage":
    case "member":
    case "MemberMessage":
    case "WebcastRoomMessage": {
      // Someone joined the live room — NOT a follow. Ignore to avoid false follow alerts.
      return null;
    }
    case "WebcastShareMessage":
    case "share":
    case "ShareMessage": {
      return { type: "share", username: extractUsername(data, m), nickname: extractNickname(data, m) ?? undefined, avatar: extractAvatar(data, m) ?? undefined };
    }
    case "WebcastSubMessage":
    case "sub":
    case "SubscribeMessage": {
      return {
        type: "sub",
        username: extractUsername(data, m),
        nickname: extractNickname(data, m) ?? undefined,
        avatar: extractAvatar(data, m) ?? undefined,
        detail: String(data.subMonth ?? data.months ?? data.detail ?? ""),
      };
    }
    default:
      return null;
  }
}

// Euler Stream schema v2 incluye datos de usuario en data.user.profilePictureUrl
// y data.user.nickname. Algunos eventos usan data.avatar / data.profilePictureUrl.
// El payload nativo de TikTok, en cambio, suele anidar la imagen como
// { avatarThumb: { urlList: ["https://..."] } } (o avatarMedium/avatarLarger,
// en snake_case o camelCase) en lugar de un string plano — hay que soportar
// ambas formas o el avatar nunca se resuelve y siempre cae a las iniciales.
function firstUrlFromList(val: unknown): string | null {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const list = obj.urlList ?? obj.url_list;
    if (Array.isArray(list) && typeof list[0] === "string") return list[0] as string;
  }
  return null;
}

function extractAvatar(data: Record<string, unknown>, top?: Record<string, unknown>): string | null {
  const user = (data.user ?? data.sender ?? (top?.user as Record<string, unknown> | undefined)) as Record<string, unknown> | undefined;
  const candidates = [
    user?.profilePictureUrl,
    user?.avatar_url,
    user?.avatar,
    user?.avatarThumb,
    user?.avatar_thumb,
    user?.avatarMedium,
    user?.avatar_medium,
    user?.avatarLarger,
    user?.avatar_larger,
    user?.avatarLarge,
    user?.avatar_large,
    data.profilePictureUrl,
    data.avatar_url,
    data.avatar,
    data.avatarThumb,
    top?.profilePictureUrl,
    top?.avatar_url,
    top?.avatar,
    top?.avatarThumb,
  ];
  for (const c of candidates) {
    const url = firstUrlFromList(c);
    if (url) return url;
  }
  return null;
}

function extractNickname(data: Record<string, unknown>, top?: Record<string, unknown>): string | null {
  // Euler Stream schema v2 may nest user data in different locations,
  // or send fields flat at the top level of the message.
  const user = (data.user ?? data.sender ?? data.author ?? data.user_info ?? (top?.user as Record<string, unknown> | undefined) ?? (top?.sender as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const nick =
    user.nickname ??
    user.nickName ??
    user.display_name ??
    user.displayName ??
    user.name ??
    data.nickname ??
    data.nickName ??
    data.display_name ??
    data.displayName ??
    data.name ??
    top?.nickname ??
    top?.nickName ??
    top?.display_name ??
    top?.displayName ??
    top?.name;
  return typeof nick === "string" && nick.trim().length > 0 ? nick.trim() : null;
}

function extractUsername(data: Record<string, unknown>, top?: Record<string, unknown>): string {
  const user = (data.user ?? (top?.user as Record<string, unknown> | undefined)) as Record<string, unknown> | undefined;
  const id =
    user?.uniqueId ??
    user?.username ??
    data.uniqueId ??
    data.username ??
    data.user_id ??
    data.userId ??
    top?.uniqueId ??
    top?.username ??
    top?.user_id ??
    top?.userId;
  return typeof id === "string" && id.length > 0 ? id : "anónimo";
}