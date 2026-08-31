// Ambient declaration for the plain-JS frontend module reused by the
// backend (both tsconfig.json and tsconfig.server.json alias @/* -> ./src/*,
// so this import resolves at runtime; this file only supplies types for the
// strict server build).
declare module "@/lib/whatsapp" {
  export function normalizeLebanesePhone(raw?: string | null): string;
  export function whatsappLink(phone?: string | null, message?: string): string;
}
