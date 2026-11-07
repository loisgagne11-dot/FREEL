import { useEffect, useMemo, useState } from 'react';
import type { Mois } from '../../domain/types';
import { mois as moisDe } from '../../domain/types';
import { pourDestinataire, syntheseHebdomadaire } from '../../domain/calculs/cra';
import { destinatairesDuMois, journeesDuMois } from '../../state/selecteurs.cra';
import { useFaits } from '../../state/store';
import { noterSemaineCra } from '../../state/ecritures.activite';
import { DocumentCra, enJours, plageDeSemaine } from '../documents/DocumentCra';
import { Apercu, useSortieDocument } from '../documents/Apercu';
import { Sheet } from '../components/Sheet';
import { moisLong } from '../format';
import styles from './Outils.cra.module.css';

/**
 * Le générateur de compte rendu d'activité.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES JOURS NE SE SAISISSENT PAS ICI, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le handoff de design pose des champs de saisie sur les jours : « 2 » en
 * télétravail, « 1 » sur site, pour chaque client et chaque semaine. C'est une
 * maquette, et la reprendre telle quelle créerait exactement ce que
 * l'invariant n°4 interdit — une SECONDE source pour les journées travaillées,
 * à côté du planning.
 *
 * Le défaut serait concret : « 2 jours de télétravail cette semaine » ne dit
 * pas LESQUELS. Les répartir pour pouvoir les enregistrer inventerait des
 * faits ; ne pas les enregistrer donnerait un document qui contredit le
 * planning dès qu'on y touche — et un CRA qui ne correspond pas au plan de
 * charge ne prouve rien. L'utilisateur a d'ailleurs posé la question dans ces
 * termes : « quand je mets à jour l'activité, ça ajuste les factures et le
 * CRA ? C'est impératif que tout soit aligné. » Une saisie parallèle ici
 * aurait répondu non.
 *
 * Les jours viennent donc du planning, en lecture seule, et se corrigent là où
 * ils vivent. Une seule chose se saisit : la phrase de tâches accomplies, qui
 * ne se déduit d'aucun fait enregistré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN DOCUMENT PAR CLIENT, PAR DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le CRA se remet au client, qui le signe. Le document « tous clients » existe
 * — il sert de récapitulatif interne — mais il n'est pas le défaut, et son
 * choix s'accompagne d'un avertissement : l'envoyer expose à chaque client le
 * volume consacré aux autres.
 */
export interface ProprietesGenerateurCra {
  readonly ouvert: boolean;
  readonly onFermer: () => void;
  /** L'année de la barre du haut : elle borne les mois proposés. */
  readonly annee: number;
}

/** Valeur du sélecteur de destinataire pour le document tous clients. */
const TOUS = '\u0000tous';

export function GenerateurCra({ ouvert, onFermer, annee }: ProprietesGenerateurCra) {
  const faits = useFaits((e) => e.faits);
  const noter = noterSemaineCra;
  const sortie = useSortieDocument();

  /*
   * Les mois de l'année qui portent des journées, et le mois courant.
   *
   * Proposer les douze ferait choisir un mois vide neuf fois sur douze en
   * début d'exercice, pour un document qui n'existe pas. Le mois courant reste
   * proposé même vide : c'est celui qu'on vient regarder pour vérifier qu'il
   * l'est bien.
   */
  const { moisPossibles, defaut } = useMemo(() => {
    const aujourdhui = new Date();
    const enCours = aujourdhui.getFullYear() === annee;
    const moisCourant = aujourdhui.getMonth() + 1;

    const avecJours: string[] = [];
    for (let n = 1; n <= 12; n += 1) {
      const m = `${annee}-${String(n).padStart(2, '0')}` as Mois;
      if (journeesDuMois(faits, m).length > 0) avecJours.push(m);
    }
    const proposes = new Set(avecJours);
    if (enCours) proposes.add(`${annee}-${String(moisCourant).padStart(2, '0')}`);
    const liste = [...proposes].sort();

    /*
     * LE DÉFAUT EST LE DERNIER MOIS ÉCHU QUI A PRODUIT QUELQUE CHOSE.
     *
     * Deux bornes, et chacune a été posée pour une raison constatée.
     *
     * Pas le dernier de la LISTE : le mois courant y figure même vide, et
     * l'ouvrir dessus donnerait « aucune journée travaillée » à qui vient
     * justement documenter le mois écoulé.
     *
     * Pas un mois À VENIR non plus : le planning est rempli d'office par le
     * rythme, donc juillet porte déjà des journées le 10 juin. Sans la borne,
     * le générateur s'ouvrait sur le CRA de juillet — un document qui atteste
     * d'un travail qui n'a pas eu lieu. La capture l'a montré ; aucun test ne
     * l'aurait vu, parce que rien n'y était faux, seulement prématuré.
     *
     * Les mois à venir restent PROPOSÉS dans la liste : regarder ce que le
     * rythme prévoit est légitime, l'attester par défaut ne l'est pas.
     */
    const echus = enCours
      ? avecJours.filter((m) => Number(m.slice(5, 7)) <= moisCourant)
      : avecJours;

    return {
      moisPossibles: liste.length > 0 ? liste : [`${annee}-12`],
      defaut: echus[echus.length - 1]
        ?? (enCours ? `${annee}-${String(moisCourant).padStart(2, '0')}` : null)
        ?? liste[liste.length - 1] ?? `${annee}-12`
    };
  }, [faits, annee]);

  const [mois, setMois] = useState<string>(defaut);
  useEffect(() => {
    setMois((actuel) => (moisPossibles.includes(actuel) ? actuel : defaut));
  }, [moisPossibles, defaut]);

  const m = moisDe(mois);
  const destinataires = useMemo(() => destinatairesDuMois(faits, m), [faits, m]);

  const [choix, setChoix] = useState<string>('');
  /* Le destinataire suit le mois : un client qui n'a pas travaillé en juillet
     ne peut pas rester sélectionné sur le CRA de juillet. D'où une valeur
     DÉRIVÉE du choix et de la liste, plutôt qu'un état qu'il faudrait penser
     à remettre d'accord à chaque changement de mois. */
  const destinataire = choix === TOUS
    ? null
    : (destinataires.find((d) => d.nom === choix)?.nom ?? destinataires[0]?.nom ?? null);

  const complete = useMemo(
    () => syntheseHebdomadaire(m, journeesDuMois(faits, m)), [faits, m]
  );
  const synthese = useMemo(
    () => pourDestinataire(complete, destinataire), [complete, destinataire]
  );

  const cleNotes = destinataire ?? '';
  const taches = useMemo(() => {
    const par: Record<string, string> = {};
    for (const n of faits.notesCra) {
      if (n.destinataire === cleNotes) par[n.semaine] = n.texte;
    }
    return par;
  }, [faits.notesCra, cleNotes]);

  const titreFichier = `CRA ${moisLong(m)}${destinataire === null ? '' : ` — ${destinataire}`}`;

  const sortir = (action: 'imprimer' | 'telecharger'): void =>
    sortie(action, titreFichier, ['CRA', mois, destinataire ?? 'tous-clients']);

  return (
    <Sheet
      ouvert={ouvert}
      variante="atelier"
      titre="Compte-rendu d’activité"
      sousTitre={`synthèse hebdomadaire · ${moisLong(m)}`}
      onFermer={onFermer}
      pied={(
        <>
          <span className={styles.piedNote}>
            Synthèse <strong>par semaine</strong> reprise du planning · suivi
            d’activité, sans montants
          </span>
          <button type="button" className={styles.bouton} onClick={() => sortir('imprimer')}>
            Imprimer
          </button>
          <button
            type="button"
            className={`${styles.bouton} ${styles.principal}`}
            onClick={() => sortir('telecharger')}
          >
            Télécharger
          </button>
        </>
      )}
    >
      <div className={styles.atelier}>
        <div className={styles.saisie}>
          <label className={styles.champ}>
            <span className={styles.libelle}>Mois</span>
            <select
              className={styles.selecteur}
              value={mois}
              onChange={(e) => setMois(e.target.value)}
            >
              {moisPossibles.map((x) => (
                <option key={x} value={x}>{moisLong(moisDe(x))}</option>
              ))}
            </select>
          </label>

          {destinataires.length > 0 && (
            <label className={styles.champ}>
              <span className={styles.libelle}>Destinataire</span>
              <select
                className={styles.selecteur}
                value={destinataire === null ? TOUS : destinataire}
                onChange={(e) => setChoix(e.target.value)}
              >
                {destinataires.map((d) => (
                  <option key={d.id} value={d.nom}>{d.nom} · {enJours(d.jours)}</option>
                ))}
                {/* Le récapitulatif n'est proposé que s'il diffère du document
                    d'un client : avec un seul client, « tous » est le même
                    papier sous un autre nom, et le choix n'en est pas un. */}
                {destinataires.length > 1 && (
                  <option value={TOUS}>Tous clients (récapitulatif interne)</option>
                )}
              </select>
            </label>
          )}

          {destinataire === null && destinataires.length > 1 && (
            <p className={styles.avertissement} role="status">
              Ce document expose à chaque client le volume consacré aux autres.
              Il sert de récapitulatif ; pour l’envoyer, choisis un client.
            </p>
          )}

          {synthese.semaines.length === 0
            ? (
              <p className={styles.vide}>
                Aucune journée travaillée sur ce mois. Le document se remplit
                depuis le planning, à partir du rythme de tes missions.
              </p>
            )
            : synthese.semaines.map((s) => (
              <section key={s.lundi} className={styles.semaine}>
                <h3 className={styles.titreSemaine}>
                  Semaine {s.rang}
                  <span className={styles.plage}>{plageDeSemaine(s, false)}</span>
                  <span className={styles.totalSemaine}>{enJours(s.total)}</span>
                </h3>

                <dl className={styles.volumes}>
                  {s.volumes.map((v) => (
                    <div key={v.client} className={styles.volume}>
                      <dt>{v.client}</dt>
                      <dd className={styles.jours}>{enJours(v.total)}</dd>
                      {/* Une SECONDE définition pour le même terme, et non un
                          bout de la première : la ventilation prend sa propre
                          ligne, sur toute la largeur. Serrée à côté du total,
                          elle sortait du cadre — « 0,5 j sans lie », coupé net,
                          que seule la capture a montré. */}
                      {(v.teletravail > 0 || v.surSite > 0) && (
                        <dd className={styles.repartition}>
                          {enJours(v.teletravail)} télétrav. · {enJours(v.surSite)} sur site
                          {v.nonPrecise > 0 && ` · ${enJours(v.nonPrecise)} sans lieu`}
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>

                <label className={styles.champ}>
                  <span className={styles.libelle}>Tâches accomplies</span>
                  <textarea
                    className={styles.zone}
                    rows={2}
                    value={taches[s.lundi] ?? ''}
                    placeholder="Ce qui a été fait cette semaine-là"
                    onChange={(e) => noter(s.lundi, cleNotes, e.target.value)}
                  />
                </label>
              </section>
            ))}

          <p className={styles.provenance}>
            Les jours viennent du planning et ne se saisissent pas ici : corrige
            une journée dans <a href="#/activite">Activité</a>, le document
            suit. Seule la phrase de tâches s’écrit.
          </p>
        </div>

        <Apercu>
          <DocumentCra
            synthese={synthese}
            entreprise={faits.entreprise}
            destinataire={destinataire}
            taches={taches}
          />
        </Apercu>
      </div>
    </Sheet>
  );
}
