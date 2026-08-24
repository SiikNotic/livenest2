/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// YouTube IFrame API types
declare namespace YT {
  class Player {
    constructor(element: HTMLElement | string, options: any);
    loadVideoById(videoId: string): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    getPlayerState(): number;
    setVolume(volume: number): void;
    getDuration(): number;
    getCurrentTime(): number;
  }
  class PlayerEvent {}
}
