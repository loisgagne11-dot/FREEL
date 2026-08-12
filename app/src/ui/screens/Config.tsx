import { useId, useMemo, useState } from 'react';
import { useFaits } from '../../state/store';
import { periodesUrssafEffectives } from '../../state/selecteurs';
import { PERIODES_URSSAF, type PeriodeBareme } from '../../domain/bareme/urssaf';
import { dateISO, mois, ratio, type TypeActivite } from '../../domain/types';
import type { Entreprise } from '../../state/schema';
import { CLE_STOCKAGE } from '../../state/schema';
import { Info } from '../components/Info';
import { Onglets, PanneauOnglet } from '../components/Onglets';
import { dateCourte } from '../format';
import styles from './Config.module.css';

/**
 * Écran Config — profil, barème et données.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUI REND LE BARÈME MAINTENABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les taux officiels changent, et l'application ne peut pas être redéployée à
 * chaque publication. Sans porte d'entrée, deux issues, toutes deux mauvaises :
 * un taux périmé appliqué indéfiniment, ou une alerte de fraîcheur qui bloque
 * les déclarations sans que personne puisse la lever.
 *
 * La section Barème ouvre donc cette porte, sans renoncer aux garanties :
 *   · une période s'AJOUTE, elle ne réécrit pas le passé ;
 *   · elle porte sa source et sa date de vérification, comme celles livrées
 *     avec le code ;
 *   · la table affichée est celle **réellement appliquée** par les calculs, et
 *     non une copie qui pourrait en diverger.
 *
 * La section « Propositions Claude Code » de l'ancienne version a été retirée
 * (décision D5) : elle proposait des actions que rien ne rattachait aux faits.
 */

type Section = 'profil' | 'bareme' | 'donnees';

const SECTIONS = [
  { id: 'profil' as Section, libelle: 'Profil' },
  { id: 'bareme' as Section, libelle: 'Barème' },
  { id: 'donnees' as Section, libelle: 'Données' }
];

const TYPES_ACTIVITE: readonly { readonly id: TypeActivite; readonly libelle: string }[] = [
  { id: 'BNC', libelle: 'BNC — prestations libérales' },
  { id: 'BIC_service', libelle: 'BIC — prestations de services' },
  { id: 'BIC_vente', libelle: 'BIC — vente de marchandises' }
];

export function Config() {
  const faits = useFaits((e) => e.faits);
  const [section, setSection] = useState<Section>('profil');
  const idGroupe = useId();

  return (
    <>
      <header className={styles.entete}>
        <h1 className={styles.titre}>Config</h1>
      </header>

      <div className={styles.sections}>
        <Onglets
          idGroupe={idGroupe}
          onglets={SECTIONS}
          actif={section}
          onChange={setSection}
          libelle="Sections de l’écran Config"
        />

        <PanneauOnglet idGroupe={idGroupe} id="profil" actif={section === 'profil'}>
          <Profil />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="bareme" actif={section === 'bareme'}>
          <Bareme />
        </PanneauOnglet>

        <PanneauOnglet idGroupe={idGroupe} id="donnees" actif={section === 'donnees'}>
          <Donnees nomFichier={nomExport(faits.entreprise)} />
        </PanneauOnglet>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Profil
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Le profil.
 *
 * Chaque champ écrit directement dans les faits, sans bouton « Enregistrer ».
 * L'ancienne version avait un formulaire à valider, et la moitié des champs
 * n'étaient jamais persistés faute de clic — l'utilisateur croyait avoir
 * renseigné son régime alors que les calculs tournaient encore sur le défaut.
 */
function Profil() {
  const entreprise = useFaits((e) => e.faits.entreprise);
  const modifier = useFaits((e) => e.modifierEntreprise);
  const idChamp = useId();

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-titre`}>
      <h2 id={`${idChamp}-titre`} className={styles.titreCarte}>Entreprise et régime</h2>

      <div className={styles.formulaire}>
        <Champ id={`${idChamp}-nom`} libelle="Nom">
          <input id={`${idChamp}-nom`} value={entreprise.nom}
            onChange={(e) => modifier({ nom: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-siret`} libelle="SIRET">
          <input id={`${idChamp}-siret`} inputMode="numeric" value={entreprise.siret}
            onChange={(e) => modifier({ siret: e.target.value })} />
        </Champ>

        <Champ id={`${idChamp}-debut`} libelle="Début d’activité">
          <input id={`${idChamp}-debut`} type="date" value={entreprise.debutActivite ?? ''}
            onChange={(e) => modifier({
              debutActivite: /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)
                ? dateISO(e.target.value)
                : null
            })} />
        </Champ>

        <Champ
          id={`${idChamp}-type`}
          libelle="Type d’activité"
          aide="Détermine le taux de cotisations, l’abattement et le plafond."
        >
          <select id={`${idChamp}-type`} value={entreprise.typeActivite}
            onChange={(e) => modifier({ typeActivite: e.target.value as TypeActivite })}>
            {TYPES_ACTIVITE.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </Champ>

        <Champ id={`${idChamp}-periodicite`} libelle="Périodicité de déclaration URSSAF">
          <select id={`${idChamp}-periodicite`} value={entreprise.urssafPeriodicite}
            onChange={(e) => modifier({
              urssafPeriodicite: e.target.value === 'trimestriel' ? 'trimestriel' : 'mensuel'
            })}>
            <option value="mensuel">Mensuelle</option>
            <option value="trimestriel">Trimestrielle</option>
          </select>
        </Champ>

        <Champ
          id={`${idChamp}-tva`}
          libelle="Assujetti à la TVA depuis"
          aide="Laisser vide en franchise en base. Le régime est résolu à la date de chaque opération."
        >
          <input id={`${idChamp}-tva`} type="month" value={entreprise.tvaDepuis ?? ''}
            onChange={(e) => modifier({
              tvaDepuis: /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)
                ? mois(e.target.value)
                : null
            })} />
        </Champ>
      </div>

      <div className={styles.interrupteurs}>
        <Interrupteur
          id={`${idChamp}-acre`}
          libelle="Bénéficiaire de l’ACRE"
          coche={entreprise.acre}
          onChange={(v) => modifier({ acre: v })}
        />
        <Interrupteur
          id={`${idChamp}-vl`}
          libelle="Versement libératoire de l’impôt sur le revenu"
          coche={entreprise.versementLiberatoire}
          onChange={(v) => modifier({ versementLiberatoire: v })}
          aide={
            <>
              Discriminant exclusif&nbsp;: avec le versement libératoire, l’impôt
              est payé à chaque déclaration et rien n’est dû au barème
              progressif. L’ancienne version cumulait les deux, et
              surestimait l’impôt à provisionner.
            </>
          }
        />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Barème
   ───────────────────────────────────────────────────────────────────────── */

function Bareme() {
  const faits = useFaits((e) => e.faits);
  const ajouter = useFaits((e) => e.ajouterPeriodeUrssaf);
  const retirer = useFaits((e) => e.retirerPeriodeUrssaf);
  const idChamp = useId();

  const effectives = useMemo(() => periodesUrssafEffectives(faits), [faits]);
  const ajouteesParDebut = useMemo(
    () => new Set(faits.periodesUrssafAjoutees.map((p) => p.du)),
    [faits.periodesUrssafAjoutees]
  );

  return (
    <>
      <section className={styles.carte} aria-labelledby={`${idChamp}-table`}>
        <h2 id={`${idChamp}-table`} className={styles.titreCarte}>
          Cotisations sociales, par période
          <Info libelle="Pourquoi par période et non par année">
            Le taux applicable aux BNC a augmenté au 1<sup>er</sup> juillet
            2024, puis de nouveau au 1<sup>er</sup> juillet 2026. Une table par
            année civile appliquerait un taux unique à des mois relevant de deux
            barèmes&nbsp;: c’est le défaut qui faisait calculer juillet 2026 à
            25,6 % au lieu de 26,1 %.
          </Info>
        </h2>

        <p className={styles.explication}>
          Cette table est celle que les calculs appliquent réellement. Un taux
          d’un mois écoulé est un fait&nbsp;: il ne s’extrapole pas, et une
          période close ne se réécrit pas.
        </p>

        <div className={styles.tableDefilante}>
          <table className={styles.table}>
            <caption className={styles.legende}>
              Taux de cotisations en vigueur, par période et par type d’activité
            </caption>
            <thead>
              <tr>
                <th scope="col">Période</th>
                <th scope="col">BNC</th>
                <th scope="col">BIC service</th>
                <th scope="col">BIC vente</th>
                <th scope="col">Source</th>
                <th scope="col">Vérifié le</th>
                <th scope="col"><span className={styles.invisible}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {effectives.map((p) => (
                <tr key={p.du}>
                  <th scope="row">
                    {p.du} → {p.au ?? 'en cours'}
                    {ajouteesParDebut.has(p.du) && (
                      <span className={styles.marque}>saisie</span>
                    )}
                  </th>
                  <td>{pourcent(p.taux.BNC)}</td>
                  <td>{pourcent(p.taux.BIC_service)}</td>
                  <td>{pourcent(p.taux.BIC_vente)}</td>
                  <td className={styles.source}>{p.source}</td>
                  <td>{dateCourte(p.verifieLe)}</td>
                  <td>
                    {ajouteesParDebut.has(p.du) && (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => retirer(p.du)}
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {faits.periodesUrssafAjoutees.length > 0 && (
          <p className={styles.explication}>
            Retirer une période saisie rend la main au barème livré avec
            l’application pour les mois qu’elle couvrait.
          </p>
        )}
      </section>

      <FormulairePeriode
        onAjouter={ajouter}
        derniere={effectives[effectives.length - 1] ?? PERIODES_URSSAF[0]}
      />
    </>
  );
}

/**
 * Saisie d'une nouvelle période.
 *
 * Le formulaire ne décide de rien : il assemble une période et la soumet au
 * magasin, qui la fait valider par le domaine. Le motif du refus est affiché
 * tel quel — il dit ce qui ne va pas, ce qu'un « saisie invalide » ne fait pas.
 */
function FormulairePeriode(
  { onAjouter, derniere }: {
    onAjouter: (p: PeriodeBareme) => string | null;
    derniere: PeriodeBareme | undefined;
  }
) {
  const idChamp = useId();
  const [du, setDu] = useState('');
  const [bnc, setBnc] = useState('');
  const [bicService, setBicService] = useState('');
  const [bicVente, setBicVente] = useState('');
  const [source, setSource] = useState('');
  const [retour, setRetour] = useState<{ ton: 'succes' | 'echec'; texte: string } | null>(null);

  function soumettre(evenement: React.FormEvent): void {
    evenement.preventDefault();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(du)) {
      setRetour({ ton: 'echec', texte: 'Indiquez le mois où la période commence.' });
      return;
    }
    const taux = [bnc, bicService, bicVente].map(enRatio);
    if (taux.some((t) => t === null)) {
      setRetour({
        ton: 'echec',
        texte: 'Les trois taux sont attendus en pourcentage, par exemple 27,2.'
      });
      return;
    }

    const refus = onAjouter({
      du: mois(du),
      // La période nouvelle reste ouverte ; la fusion ferme la précédente.
      au: null,
      taux: {
        BNC: ratio(taux[0] as number),
        BIC_service: ratio(taux[1] as number),
        BIC_vente: ratio(taux[2] as number)
      },
      source: source.trim(),
      // La date de vérification est celle de la saisie : c'est le jour où un
      // humain a lu la valeur à sa source.
      verifieLe: dateISO(new Date().toISOString().slice(0, 10))
    });

    if (refus !== null) {
      setRetour({ ton: 'echec', texte: refus });
      return;
    }
    setRetour({ ton: 'succes', texte: `Période ajoutée à partir de ${du}.` });
    setDu(''); setBnc(''); setBicService(''); setBicVente(''); setSource('');
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-ajout`}>
      <h2 id={`${idChamp}-ajout`} className={styles.titreCarte}>
        Ajouter une période
        <Info libelle="Quand ajouter une période">
          Quand un nouvel avis d’appel ou une publication officielle annonce un
          taux différent. La période ajoutée prend effet au mois indiqué et
          ferme la précédente&nbsp;; rien avant ce mois n’est modifié, pour que
          le recalcul d’un trimestre passé redonne le montant réellement déclaré
          à l’époque.
        </Info>
      </h2>

      {derniere !== undefined && (
        <p className={styles.explication}>
          Dernière période connue&nbsp;: à partir de {derniere.du},{' '}
          {pourcent(derniere.taux.BNC)} en BNC, d’après {derniere.source},
          vérifié le {dateCourte(derniere.verifieLe)}.
        </p>
      )}

      <form className={styles.formulaire} onSubmit={soumettre}>
        <Champ id={`${idChamp}-du`} libelle="À partir du mois">
          <input id={`${idChamp}-du`} type="month" value={du}
            onChange={(e) => setDu(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bnc`} libelle="Taux BNC (%)">
          <input id={`${idChamp}-bnc`} inputMode="decimal" value={bnc}
            onChange={(e) => setBnc(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bic-service`} libelle="Taux BIC service (%)">
          <input id={`${idChamp}-bic-service`} inputMode="decimal" value={bicService}
            onChange={(e) => setBicService(e.target.value)} required />
        </Champ>

        <Champ id={`${idChamp}-bic-vente`} libelle="Taux BIC vente (%)">
          <input id={`${idChamp}-bic-vente`} inputMode="decimal" value={bicVente}
            onChange={(e) => setBicVente(e.target.value)} required />
        </Champ>

        <Champ
          id={`${idChamp}-source`}
          libelle="Source"
          aide="D’où vient ce taux ? Par exemple : avis d’appel du 12/01/2027."
        >
          <input id={`${idChamp}-source`} value={source}
            onChange={(e) => setSource(e.target.value)} required />
        </Champ>

        {retour !== null && (
          <p
            role={retour.ton === 'echec' ? 'alert' : 'status'}
            className={retour.ton === 'echec' ? styles.echec : styles.succes}
          >
            {retour.texte}
          </p>
        )}

        <button type="submit" className={styles.actionPrincipale}>
          Ajouter la période
        </button>
      </form>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Données
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Export des faits.
 *
 * Un export brut et complet, pas un rapport : ce qui compte ici est de pouvoir
 * récupérer ses données sans l'application. Les pièces justificatives ne sont
 * pas incluses — elles vivent dans IndexedDB et pèsent trop pour un fichier
 * texte —, et le dire vaut mieux que de laisser croire à une sauvegarde
 * complète.
 */
function Donnees({ nomFichier }: { nomFichier: string }) {
  const faits = useFaits((e) => e.faits);
  const chargement = useFaits((e) => e.chargement);
  const idChamp = useId();

  function exporter(): void {
    const contenu = JSON.stringify(faits, null, 2);
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.carte} aria-labelledby={`${idChamp}-donnees`}>
      <h2 id={`${idChamp}-donnees`} className={styles.titreCarte}>Vos données</h2>

      {chargement.phase === 'sans-persistance' && (
        <p className={styles.echec} role="alert">{chargement.motif}</p>
      )}

      <dl className={styles.detail}>
        <div className={styles.ligne}>
          <dt>Recettes</dt>
          <dd>{faits.recettes.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Dépenses</dt>
          <dd>{faits.depenses.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Missions</dt>
          <dd>{faits.missions.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Clients</dt>
          <dd>{faits.clients.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Périodes déclarées</dt>
          <dd>{faits.periodesDeclarees.length}</dd>
        </div>
        <div className={styles.ligne}>
          <dt>Emplacement</dt>
          <dd className={styles.source}>{CLE_STOCKAGE}</dd>
        </div>
      </dl>

      <button type="button" className={styles.actionPrincipale} onClick={exporter}>
        Exporter mes données
      </button>

      <p className={styles.explication}>
        L’export contient tous les faits saisis, au format JSON. Les
        justificatifs n’y sont pas&nbsp;: ce sont des fichiers, conservés à part
        dans le navigateur. Les données de l’ancienne version restent en place
        et ne sont jamais effacées.
      </p>
    </section>
  );
}

/** Nom de fichier de l'export : lisible, daté, et sans nom de société vide. */
function nomExport(entreprise: Entreprise): string {
  const jour = new Date().toISOString().slice(0, 10);
  const nom = entreprise.nom.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `freel-${nom === '' ? 'donnees' : nom.toLowerCase()}-${jour}.json`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Présentation
   ───────────────────────────────────────────────────────────────────────── */

/** Un pourcentage lu en saisie, converti en ratio. `null` si illisible. */
function enRatio(saisie: string): number | null {
  const points = Number.parseFloat(saisie.replace(',', '.'));
  if (!Number.isFinite(points) || points < 0 || points > 100) return null;
  return points / 100;
}

function pourcent(r: number): string {
  return `${(r * 100).toFixed(1).replace('.', ',')} %`;
}

function Champ(
  { id, libelle, aide, children }: {
    id: string; libelle: string; aide?: string; children: React.ReactNode;
  }
) {
  const idAide = `${id}-aide`;
  return (
    <p className={styles.champ}>
      <label htmlFor={id}>{libelle}</label>
      {children}
      {aide !== undefined && <span id={idAide} className={styles.aide}>{aide}</span>}
    </p>
  );
}

function Interrupteur(
  { id, libelle, coche, onChange, aide }: {
    id: string;
    libelle: string;
    coche: boolean;
    onChange: (v: boolean) => void;
    aide?: React.ReactNode;
  }
) {
  return (
    <p className={styles.interrupteur}>
      <input id={id} type="checkbox" checked={coche}
        onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {libelle}
        {aide !== undefined && <Info libelle={`Explication : ${libelle}`}>{aide}</Info>}
      </label>
    </p>
  );
}
