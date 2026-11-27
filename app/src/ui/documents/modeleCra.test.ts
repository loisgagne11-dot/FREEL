import { describe, expect, it } from 'vitest';
import { pourDestinataire, syntheseHebdomadaire, type JourTravaille } from '../../domain/calculs/cra';
import { dateISO, mois } from '../../domain/types';
import { entrepriseVide } from '../../state/schema';
import { nomDeFichier } from '../../infra/telechargement';
import { modeleDuCra } from './modeleCra';

const juin = mois('2026-06');
const entreprise = {
  ...entrepriseVide(),
  nom: 'Atelier de démonstration', adresse: '1 rue de la Démonstration',
  codePostal: '75010', ville: 'Paris', siret: '000 000 000 00000'
};

const jour = (
  date: string, client: string, lieu: JourTravaille['lieu'] = null, quotite: 0.5 | 1 = 1
): JourTravaille => ({ date: dateISO(date), client, quotite, lieu });

describe('le modèle du compte rendu', () => {
  /* Sans lieu connu, « Télétrav. 0 j · Sur site 0 j » ferait lire des
     journées sans lieu comme des journées à zéro partout. */
  it('n’ouvre les colonnes de lieu que si le mois en connaît un', () => {
    const sans = modeleDuCra(
      syntheseHebdomadaire(juin, [jour('2026-06-01', 'Alpha')]), entreprise, 'Alpha', {}
    );
    expect(sans.colonnes.map((c) => c.intitule)).toEqual(['Semaine', 'Client', 'Total']);
    expect(sans.semaines[0]?.volumes[0]?.teletravail).toBeNull();

    const avec = modeleDuCra(
      syntheseHebdomadaire(juin, [jour('2026-06-01', 'Alpha', 'sur_site'), jour('2026-06-02', 'Alpha')]),
      entreprise, 'Alpha', {}
    );
    expect(avec.colonnes.map((c) => c.intitule))
      .toEqual(['Semaine', 'Client', 'Télétrav.', 'Sur site', 'Total']);
    expect(avec.colonnes.filter((c) => c.nombre).map((c) => c.intitule))
      .toEqual(['Télétrav.', 'Sur site', 'Total']);
  });

  /* Le total est certain, la répartition ne l'est pas : la part sans lieu se
     dit à côté, et la note l'explique. L'omettre ferait signer une
     répartition que personne n'a constatée. */
  it('dit la part sans lieu à côté du total, et l’explique dans la note', () => {
    const m = modeleDuCra(
      syntheseHebdomadaire(juin, [jour('2026-06-01', 'Alpha', 'sur_site'), jour('2026-06-02', 'Alpha', null, 0.5)]),
      entreprise, 'Alpha', {}
    );
    const ligne = m.semaines[0]?.volumes[0];
    expect(ligne?.total).toBe('1,5 j');
    expect(ligne?.surSite).toBe('1 j');
    expect(ligne?.sansLieu).toBe('dont 0,5 j sans lieu');
    expect(m.note.map((s) => s.texte).join('')).toMatch(/n’ont pas de lieu renseigné/);
  });

  // Un document qui ne connaît aucun lieu n'a rien à nuancer : la phrase
  // « dont … sans lieu » y répéterait le total.
  it('ne nuance pas le total quand aucune colonne de lieu n’est ouverte', () => {
    const m = modeleDuCra(
      syntheseHebdomadaire(juin, [jour('2026-06-01', 'Alpha')]), entreprise, 'Alpha', {}
    );
    expect(m.semaines[0]?.volumes[0]?.sansLieu).toBeNull();
  });

  // Un seul client : ses totaux répéteraient le grand total, ligne pour ligne.
  it('ne porte les totaux par client qu’à partir de deux clients', () => {
    const complete = syntheseHebdomadaire(juin, [
      jour('2026-06-01', 'Alpha'), jour('2026-06-02', 'Beta')
    ]);
    expect(modeleDuCra(complete, entreprise, null, {}).totaux?.lignes.map((l) => l.client))
      .toEqual(['Alpha', 'Beta']);
    expect(modeleDuCra(pourDestinataire(complete, 'Alpha'), entreprise, 'Alpha', {}).totaux)
      .toBeNull();
  });

  it('porte la phrase de tâches de la semaine, et rien quand il n’y en a pas', () => {
    const m = modeleDuCra(
      syntheseHebdomadaire(juin, [jour('2026-06-01', 'Alpha'), jour('2026-06-08', 'Alpha')]),
      entreprise, 'Alpha', { '2026-06-01': 'Cadrage et recette' }
    );
    expect(m.semaines.map((s) => s.taches)).toEqual(['Tâches — Cadrage et recette', null]);
  });

  /* Le nom du fichier et le titre du PDF disent le mois ET le client qui
     signe : deux CRA du même mois pour deux clients ne doivent pas s'écraser
     dans le dossier de téléchargement. */
  it('nomme le document et son fichier par le mois et le destinataire', () => {
    const synthese = syntheseHebdomadaire(juin, [jour('2026-06-01', 'Client Alpha')]);
    const un = modeleDuCra(synthese, entreprise, 'Client Alpha', {});
    expect(un.titre).toBe('Compte-rendu d’activité — juin 2026 — Client Alpha');
    expect(`${nomDeFichier(...un.morceauxDuNom)}.pdf`).toBe('CRA_2026-06_Client-Alpha.pdf');

    const tous = modeleDuCra(synthese, entreprise, null, {});
    expect(tous.titre).toBe('Compte-rendu d’activité — juin 2026');
    expect(`${nomDeFichier(...tous.morceauxDuNom)}.pdf`).toBe('CRA_2026-06_tous-clients.pdf');
    expect(tous.destinataire).toBe('Tous clients');
    expect(tous.signatures[1]).toBe('Bon pour accord — client(s)');
  });

  it('met le dernier mot du nom en avant, sauf pour un nom d’un seul mot', () => {
    const s = syntheseHebdomadaire(juin, []);
    expect(modeleDuCra(s, entreprise, null, {}).marque)
      .toEqual({ debut: 'Atelier de', fin: 'démonstration' });
    expect(modeleDuCra(s, { ...entreprise, nom: 'Solo' }, null, {}).marque)
      .toEqual({ debut: 'Solo', fin: null });
  });

  it('ne garde de l’émetteur que les lignes renseignées, localité comprise', () => {
    const s = syntheseHebdomadaire(juin, []);
    expect(modeleDuCra(s, entreprise, null, {}).emetteur)
      .toEqual(['1 rue de la Démonstration', '75010 Paris', 'SIRET 000 000 000 00000']);
    expect(modeleDuCra(s, { ...entreprise, adresse: '', siret: '' }, null, {}).emetteur)
      .toEqual(['75010 Paris']);
  });
});
