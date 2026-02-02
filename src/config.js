/**
 * Configuration globale de l'application FREEL V52
 */

export const APP_VERSION = 52;
export const STORAGE_VERSION = 'v52';
export const STORAGE_PREFIX = 'freel_v52';

// Constantes légales (taux 2025-2026 pour BNC - Bénéfices Non Commerciaux)
// Consultants, freelances IT = régime BNC, pas BIC
export const LEGAL = {
  urssafStd2025: 0.211,    // 21.1% (BNC 2025)
  urssafStd2026: 0.212,    // 21.2% (BNC 2026)
  urssafAcre2025: 0.1065,  // 10.65% (ACRE 50% du taux normal)
  urssafAcre2026: 0.106,   // 10.6% (ACRE 2026)
  cfp: 0.002,              // 0.2% Formation professionnelle
  impLib: 0.022,           // 2.2% Versement libératoire
  tvaRate: 0.20,           // 20% TVA standard
  tvaStartMonth: '2025-10', // Début assujettissement TVA

  // Plafonds micro-entreprise 2025
  plafondService2025: 77700,  // Prestations de services BNC
  plafondVente2025: 188700,   // Vente de marchandises/hébergement

  // Plafonds micro-entreprise 2026 (indexés)
  plafondService2026: 79000,  // Prestations de services BNC
  plafondVente2026: 192000,   // Vente de marchandises/hébergement

  // Abattements fiscaux
  abattementBNC: 0.34,        // 34% pour BNC
  abattementBIC: 0.50,        // 50% pour BIC services
  abattementVente: 0.71,      // 71% pour vente marchandises
};

// Tranches IR 2025 (progressif)
export const IR_BRACKETS_2025 = [
  { min: 0, max: 11294, rate: 0 },
  { min: 11294, max: 28797, rate: 0.11 },
  { min: 28797, max: 82341, rate: 0.30 },
  { min: 82341, max: 177106, rate: 0.41 },
  { min: 177106, max: Infinity, rate: 0.45 }
];

// Tranches IR 2026 (indexées +1.8%)
export const IR_BRACKETS_2026 = [
  { min: 0, max: 11497, rate: 0 },
  { min: 11497, max: 29314, rate: 0.11 },
  { min: 29314, max: 83823, rate: 0.30 },
  { min: 83823, max: 180274, rate: 0.41 },
  { min: 180274, max: Infinity, rate: 0.45 }
];

// Alias pour compatibilité
export const IR_BRACKETS = IR_BRACKETS_2025;

// Catégories de charges
export const CHARGE_CATEGORIES = [
  { id: 'urssaf', label: 'URSSAF', color: '#ff6b6b' },
  { id: 'ir', label: 'Impôt sur le revenu', color: '#ee5a6f' },
  { id: 'tva', label: 'TVA', color: '#c92a2a' },
  { id: 'bank', label: 'Banque', color: '#ffa94d' },
  { id: 'tools', label: 'Outils', color: '#74c0fc' },
  { id: 'formation', label: 'Formation', color: '#b197fc' },
  { id: 'insurance', label: 'Assurance', color: '#f783ac' },
  { id: 'other', label: 'Autre', color: '#868e96' }
];

// Scénarios de projection
export const SCENARIOS = {
  nominal: { label: 'Nominal', facteur: 1.0, color: '#51cf66' },
  normal: { label: 'Normal', facteur: 0.9, color: '#ffa94d' },
  prudent: { label: 'Prudent', facteur: 0.75, color: '#ff6b6b' }
};

// Configuration Supabase (à remplir avec vos vraies clés)
export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  enabled: false // Activé après configuration
};

// Raccourcis clavier
export const SHORTCUTS = [
  { key: '/', desc: 'Recherche globale' },
  { key: 'd', desc: 'Dashboard' },
  { key: 'm', desc: 'Missions' },
  { key: 't', desc: 'Trésorerie' },
  { key: 'f', desc: 'Factures' },
  { key: 'c', desc: 'Charges' },
  { key: 'n', desc: 'Nouvelle mission' },
  { key: 'p', desc: 'Privacy mode' },
  { key: '?', desc: 'Aide' }
];
