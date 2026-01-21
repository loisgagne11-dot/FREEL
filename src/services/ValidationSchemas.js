/**
 * Schémas de validation Zod pour toutes les entités
 * Sécurise les entrées utilisateur contre XSS, injection, et corruption de données
 */

import { z } from 'zod';

/**
 * Schéma pour les dates au format YYYY-MM-DD
 */
const DateSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date invalide (format YYYY-MM-DD)')
  .refine(val => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Date invalide');

/**
 * Schéma pour les montants monétaires (positifs uniquement)
 */
const MoneySchema = z.number()
  .min(0, 'Le montant doit être positif')
  .max(1000000, 'Le montant ne peut pas dépasser 1 000 000€')
  .finite('Le montant doit être un nombre valide');

/**
 * Schéma pour les TJM (Taux Journalier Moyen)
 */
const TJMSchema = z.number()
  .min(0, 'Le TJM doit être positif')
  .max(10000, 'Le TJM ne peut pas dépasser 10 000€')
  .finite('Le TJM doit être un nombre valide');

/**
 * Schéma pour les jours (0-31)
 */
const DaysSchema = z.number()
  .int('Le nombre de jours doit être un entier')
  .min(0, 'Le nombre de jours doit être positif')
  .max(31, 'Le nombre de jours ne peut pas dépasser 31');

/**
 * Schéma pour les emails
 */
const EmailSchema = z.string()
  .email('Email invalide')
  .max(255, 'Email trop long')
  .toLowerCase()
  .trim();

/**
 * Schéma pour les URLs
 */
const URLSchema = z.string()
  .url('URL invalide')
  .max(2000, 'URL trop longue')
  .trim();

/**
 * Schéma pour les chaînes de texte sécurisées (sans HTML/scripts)
 */
const SafeStringSchema = z.string()
  .max(500, 'Texte trop long (max 500 caractères)')
  .trim()
  .refine(val => {
    // Interdire les balises HTML et scripts
    const dangerousPatterns = /<script|<iframe|javascript:|onerror=|onclick=/i;
    return !dangerousPatterns.test(val);
  }, 'Contenu interdit détecté');

/**
 * Schéma pour les textes longs sécurisés
 */
const SafeTextSchema = z.string()
  .max(5000, 'Texte trop long (max 5000 caractères)')
  .trim()
  .refine(val => {
    // Interdire les balises HTML et scripts
    const dangerousPatterns = /<script|<iframe|javascript:|onerror=|onclick=/i;
    return !dangerousPatterns.test(val);
  }, 'Contenu interdit détecté');

/**
 * Schéma pour le SIRET
 */
const SIRETSchema = z.string()
  .regex(/^\d{14}$/, 'Le SIRET doit contenir 14 chiffres')
  .length(14, 'Le SIRET doit contenir exactement 14 chiffres');

/**
 * Schéma pour le numéro de TVA
 */
const TVASchema = z.string()
  .regex(/^FR\d{11}$/, 'Le numéro de TVA doit être au format FR + 11 chiffres')
  .length(13, 'Le numéro de TVA doit contenir exactement 13 caractères');

/**
 * Schéma pour une mission
 */
export const MissionSchema = z.object({
  id: z.string().optional(),
  client: SafeStringSchema,
  clientId: z.string().max(100).optional(),
  titre: SafeStringSchema,
  site: SafeStringSchema.optional(),
  debut: DateSchema,
  fin: DateSchema,
  tjm: TJMSchema,
  delaiPaiement: z.number().int().min(0).max(365).default(30),
  jourPaiement: z.number().int().min(1).max(31).default(15),
  adresseClient: SafeTextSchema.optional(),
  numeroCommande: SafeStringSchema.optional(),
  descriptifFacture: SafeTextSchema.optional(),
  lignes: z.array(z.any()).optional(),
  factures: z.array(z.any()).optional()
}).refine(data => {
  // Valider que fin >= debut
  const start = new Date(data.debut);
  const end = new Date(data.fin);
  return end >= start;
}, {
  message: 'La date de fin doit être après la date de début',
  path: ['fin']
}).refine(data => {
  // Valider que la durée ne dépasse pas 10 ans
  const start = new Date(data.debut);
  const end = new Date(data.fin);
  const yearsDiff = (end - start) / (1000 * 60 * 60 * 24 * 365);
  return yearsDiff <= 10;
}, {
  message: 'La durée de la mission ne peut pas dépasser 10 ans',
  path: ['fin']
});

/**
 * Schéma pour une ligne de mission (jours)
 */
export const MissionLineSchema = z.object({
  ym: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format de mois invalide (YYYY-MM)'),
  joursOuvrables: DaysSchema,
  joursPrevus: DaysSchema,
  conges: DaysSchema,
  joursReels: z.number().int().min(0).max(31).nullable()
}).refine(data => {
  // Valider que conges <= joursPrevus
  return data.conges <= data.joursPrevus;
}, {
  message: 'Les congés ne peuvent pas dépasser les jours prévus',
  path: ['conges']
});

/**
 * Schéma pour une facture
 */
export const InvoiceSchema = z.object({
  id: z.string().optional(),
  numero: z.string().max(50),
  date: DateSchema,
  missionId: z.string().max(100),
  client: SafeStringSchema,
  montantHT: MoneySchema,
  tva: MoneySchema.optional(),
  montantTTC: MoneySchema,
  statut: z.enum(['emise', 'payee', 'annulee']).default('emise'),
  datePaiement: DateSchema.optional().nullable(),
  modeReglement: z.enum(['virement', 'cheque', 'especes', 'cb', 'autre']).optional(),
  notes: SafeTextSchema.optional()
}).refine(data => {
  // Valider montantTTC >= montantHT
  return data.montantTTC >= data.montantHT;
}, {
  message: 'Le montant TTC doit être supérieur ou égal au montant HT',
  path: ['montantTTC']
});

/**
 * Schéma pour une charge
 */
export const ChargeSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['urssaf', 'ir', 'tva', 'autre']),
  libelle: SafeStringSchema,
  montant: MoneySchema,
  dateEcheance: DateSchema,
  statut: z.enum(['apayer', 'payee', 'annulee']).default('apayer'),
  datePaiement: DateSchema.optional().nullable(),
  notes: SafeTextSchema.optional(),
  recurrence: z.enum(['unique', 'mensuel', 'trimestriel', 'annuel']).optional()
});

/**
 * Schéma pour un mouvement de trésorerie
 */
export const TreasuryMovementSchema = z.object({
  id: z.string().optional(),
  date: DateSchema,
  type: z.enum(['facture', 'charge', 'autre']),
  libelle: SafeStringSchema,
  montant: z.number()
    .min(-1000000, 'Le montant ne peut pas être inférieur à -1 000 000€')
    .max(1000000, 'Le montant ne peut pas dépasser 1 000 000€')
    .finite('Le montant doit être un nombre valide'),
  solde: z.number().optional(),
  reference: z.string().max(100).optional()
});

/**
 * Schéma pour la configuration de l'entreprise
 */
export const CompanySchema = z.object({
  nom: SafeStringSchema,
  siret: SIRETSchema.optional(),
  tva: TVASchema.optional(),
  adresse: SafeTextSchema.optional(),
  email: EmailSchema.optional(),
  telephone: z.string().max(20).optional(),
  logo: URLSchema.optional(),
  acre: z.boolean().default(false),
  prelevementLiberatoire: z.boolean().default(false),
  parts: z.number().min(1).max(10).default(1),
  abattement: z.number().min(0).max(1).default(0.34),
  supabaseUrl: URLSchema.optional(),
  supabaseAnonKey: z.string().max(500).optional(),
  onboardingDone: z.boolean().default(false),
  updatedAt: z.string().optional()
});

/**
 * Schéma pour l'authentification
 */
export const AuthSignUpSchema = z.object({
  email: EmailSchema,
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(128, 'Le mot de passe est trop long')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
});

export const AuthSignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Le mot de passe est requis').max(128)
});

/**
 * Fonction utilitaire pour valider et nettoyer les données
 */
export function validate(schema, data) {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error.errors && Array.isArray(error.errors)) {
      return {
        success: false,
        errors: error.errors.map(err => ({
          path: err.path ? err.path.join('.') : 'unknown',
          message: err.message || 'Validation error'
        }))
      };
    }
    return {
      success: false,
      errors: [{ path: 'unknown', message: error.message || 'Validation error' }]
    };
  }
}

/**
 * Fonction pour sanitiser le HTML (prévenir XSS)
 */
export function sanitizeHTML(html) {
  if (!html) return '';

  // Remplacer les caractères dangereux
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Fonction pour valider et sanitiser les URLs
 */
export function sanitizeURL(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    // Autoriser uniquement http et https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}
