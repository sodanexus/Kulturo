import "../app.js";

// Le code historique reste importable tel quel pendant la migration. Les
// nouveaux contrats TypeScript sécurisent les frontières données/sync sans
// imposer une réécriture risquée de toute l’interface en une seule version.
export const KULTURO_RUNTIME = "4.0.0" as const;
