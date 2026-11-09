import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertirBundle } from '../infra/migration.legacy';
import { mois } from '../domain/types';
import { motifRefusFaits, VERSION_SCHEMA } from '../state/schema';
import { completerFaits } from '../state/schema.migrations';
import { craDuMoisParMission, etatActivite, planningDuMois } from '../state/selecteurs.activite';
import { journeesDuMois } from '../state/selecteurs.cra';
import { etatPilote } from '../state/selecteurs';
import { aTraiter } from '../state/selecteurs.aTraiter';
import { le } from '../test/jeu-d-essai';

/**
 * Un compte venu de l'ANCIENNE application n'a jamais de lieu de travail.
 *
 * Le lieu (télétravail ou sur site) est apparu avec le nouveau schéma, et la
 * reprise ne l'invente pas : poser « sur site » partout ferait compter 0 % de
 * télétravail à quelqu'un qui en fait trois jours par semaine, chiffre qui se
 * justifie auprès d'un client. Tout ce qui lit le lieu doit donc tenir `null`
 * pour une réponse normale — pas pour une erreur.
 */
const bundle = JSON.parse(readFileSync(join(import.meta.dirname, '../test/jeu-d-essai.ancien.json'), 'utf8')) as
  Record<string, unknown>;
const { faits, rapport } = convertirBundle(bundle);

const nonFinis = (v: unknown, chemin = '$'): string[] => {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${chemin} = ${v}`];
  if (typeof v !== 'object' || v === null) return [];
  return Object.entries(v).flatMap(([k, x]) => nonFinis(x, `${chemin}.${k}`));
};

describe('l’import d’un ancien compte sans lieu', () => {
  it('se convertit en faits du schéma courant, acceptés tels quels', () => {
    expect(faits.version).toBe(VERSION_SCHEMA);
    expect(motifRefusFaits(faits)).toBeNull();
    expect(rapport.anomalies.filter((a) => a.gravite === 'bloquante')).toEqual([]);
  });

  // DÉFAUT TROUVÉ PAR CE JEU, corrigé au lot 4 : la conversion rendait des
  // recettes sans `echeanceLe`, `envoyeeLe`, `relancesLe`, `tvaCollectee` ni
  // `justificatifId` (champs des schémas 9 à 16), et `remplacerParBundle` les
  // persistait sans passer par `completerFaits`. L'échéance de chaque facture
  // reprise était alors recalculée d'après la formule du client à chaque
  // lecture, ce que le fait stocké existe précisément pour empêcher.
  it('rend des faits complets : le comblement de schéma n’a plus rien à ajouter', () => {
    expect(completerFaits(faits)).toEqual(faits);
  });

  // Les calculs ci-dessous valent aussi APRÈS le comblement : c'est la forme
  // que prend le compte dès qu'il repasse par `completerFaits`.
  it('reste accepté et sans lieu après le comblement de schéma', () => {
    const comble = completerFaits(faits);
    expect(motifRefusFaits(comble)).toBeNull();
    expect(journeesDuMois(comble, mois('2026-03')).every((j) => j.lieu === null)).toBe(true);
  });

  // Si la conversion se mettait à inventer un lieu, le jeu cesserait de
  // représenter ce qu'il doit représenter et les tests ci-dessous ne
  // vérifieraient plus que « null » est toléré.
  it('ne porte aucun lieu, sur aucune journée ajustée', () => {
    const ajustements = faits.missions.flatMap((m) => m.entites.flatMap((e) => Object.values(e.ajustements)));
    expect(ajustements.length).toBeGreaterThan(0);
    expect(ajustements.every((a) => a.lieu === undefined)).toBe(true);
  });

  it('rend un lieu null à chaque journée du planning, sans exception ni NaN', () => {
    for (const m of ['2025-12', '2026-01', '2026-03']) {
      const planning = planningDuMois(faits, mois(m));
      expect(nonFinis(planning), m).toEqual([]);
      const journees = journeesDuMois(faits, mois(m));
      expect(journees.length, m).toBeGreaterThan(0);
      expect(journees.every((j) => j.lieu === null), m).toBe(true);
    }
  });

  it('calcule les comptes rendus d’activité, y compris pour les clients finaux d’une agence', () => {
    const cras = craDuMoisParMission(faits, mois('2026-03'));
    expect(nonFinis(cras)).toEqual([]);
    // La mission de l'agence (sans client final déclaré) signe en son propre
    // nom ; la mission à deux entités rend un document par client final.
    expect(cras.map((c) => c.clientNom).sort()).toEqual(
      ['Agence Démo Ancienne', 'Client Final Démo A', 'Client Final Démo B']
    );
    expect(cras.every((c) => c.cra.totalJours > 0)).toBe(true);
  });

  it('calcule le plan de charge, le Pilote et les sujets à traiter sans valeur absurde', () => {
    const date = le(2026, 3, 16);
    expect(nonFinis(etatActivite(faits, mois('2026-03'), date))).toEqual([]);
    expect(nonFinis(etatPilote(faits, faits.echeances, date))).toEqual([]);
    expect(nonFinis(aTraiter(faits, date))).toEqual([]);
  });
});
