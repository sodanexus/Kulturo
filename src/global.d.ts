declare const CONFIG: {
  app: { name: string; version: string; itemsPerPage: number };
  supabase: { url: string; anonKey: string };
  [section: string]: unknown;
};

interface Window {
  __kulturoUpdateAccepted?: boolean;
  __kulturoReloading?: boolean;
}
