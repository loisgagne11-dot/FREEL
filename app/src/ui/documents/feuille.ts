/**
 * La feuille de style des documents qui partent chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CHAÎNE, ET NON UN MODULE CSS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tout le reste de l'application passe par des modules CSS, et c'est bien.
 * Mais un document TÉLÉCHARGÉ quitte l'application : il s'ouvre seul, dans
 * un navigateur qui n'a ni notre feuille de style ni les noms de classes
 * hachés que l'empaqueteur a produits. Un module CSS ne peut pas voyager.
 *
 * L'alternative — une seconde feuille écrite à la main pour le fichier
 * téléchargé — donnerait deux définitions du même document, qui divergeraient
 * dès la première retouche. Le client recevrait alors un papier qui ne
 * ressemble pas à l'aperçu qu'on lui a montré. Une seule chaîne, employée par
 * l'aperçu ET par le fichier, l'interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PAPIER RESTE CLAIR, MÊME EN THÈME SOMBRE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Aucun jeton de thème ici : ni `var(--text)`, ni `var(--panel)`. Un document
 * destiné à être imprimé et signé est blanc, et le rester en thème sombre
 * n'est pas une incohérence — c'est la seule version qui sort correctement de
 * l'imprimante. Les couleurs sont donc écrites en clair, et c'est le seul
 * endroit du projet où c'est vrai.
 */
export const FEUILLE_DOCUMENT = `
.doc {
  background: #ffffff;
  color: #1d1d1b;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 12px;
  line-height: 1.5;
  padding: 30px 32px 36px;
  max-width: 780px;
  margin: 0 auto;
}
.doc-entete {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 18px;
  border-bottom: 1.5px solid #1d1d1b;
}
.doc-marque { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
.doc-marque em { font-style: italic; font-weight: 400; color: #1f8b58; }
.doc-emetteur { font-size: 10.5px; color: #6a6a66; margin-top: 5px; line-height: 1.55; }
.doc-titre { text-align: right; }
.doc-titre h1 {
  font-size: 14px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; margin: 0;
}
.doc-periode { font-size: 12.5px; color: #1f8b58; font-weight: 600; margin-top: 3px; }
.doc-destinataire { font-size: 10.5px; color: #6a6a66; margin-top: 5px; line-height: 1.55; }

.doc-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
.doc-table th {
  font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase;
  font-weight: 700; color: #1d1d1b; text-align: left;
  padding: 0 0 7px; border-bottom: 1.5px solid #1d1d1b;
}
.doc-table th.doc-n, .doc-table td.doc-n { text-align: right; }
.doc-table td {
  font-size: 11.5px; padding: 6px 0; border-bottom: 1px solid #ececec;
  vertical-align: baseline;
}
.doc-n { font-variant-numeric: tabular-nums; white-space: nowrap; }
.doc-semaine td {
  background: #f6f6f2; font-weight: 700; color: #1d1d1b;
  padding: 7px 6px; border-bottom: 1px solid #e2e2dc;
}
.doc-semaine td:first-child { padding-left: 0; }
.doc-semaine td:last-child { padding-right: 0; }
.doc-client td:first-child { padding-left: 14px; color: #6a6a66; }
.doc-fort { font-weight: 700; }
.doc-taches td {
  font-size: 10.5px; font-style: italic; color: #6a6a66;
  padding: 3px 0 9px 14px;
}
.doc-sansLieu { font-style: italic; color: #8a8a85; }

.doc-sousTitre {
  font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  font-weight: 700; color: #8a8a85; margin: 20px 0 2px;
}
.doc-total td {
  font-size: 12.5px; font-weight: 700; color: #1d1d1b;
  padding-top: 10px; border-top: 1.5px solid #1d1d1b; border-bottom: none;
}
.doc-note {
  margin-top: 16px; padding: 9px 11px; border-radius: 6px;
  background: #f6f6f2; font-size: 10.5px; color: #6a6a66; line-height: 1.6;
}
.doc-signatures { display: flex; gap: 30px; margin-top: 32px; }
.doc-signature { flex: 1; font-size: 10.5px; color: #8a8a85; }
.doc-signature span { display: block; height: 52px; margin-top: 6px;
  border: 1px dashed #c8c8c0; border-radius: 6px; }

/* ---------- ce qui n'appartient qu'à la facture ---------- */

.doc-grosTitre {
  font-size: 21px; font-weight: 800; letter-spacing: -0.01em;
  text-transform: uppercase; margin: 0;
}
.doc-numero { font-size: 12.5px; color: #1f8b58; font-weight: 700; margin-top: 2px; }

/* Le destinataire sur un fond teinté : sur une facture, « à qui » se repère
   avant de se lire, et c'est la première chose qu'un service comptable
   cherche pour la router. */
.doc-bloc {
  margin-top: 18px; padding: 11px 13px; border-radius: 6px; background: #f6f6f2;
}
.doc-bloc .doc-label {
  font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
  color: #8a8a85; font-weight: 700; margin-bottom: 3px;
}
.doc-bloc strong { font-size: 13px; }

.doc-iban {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}

.doc-totaux { margin-top: 14px; display: flex; justify-content: flex-end; }
/* Une largeur plafonnée, et non la forme fonctionnelle min() : celle-ci fait
   tomber getComputedStyle de jsdom en résolvant les tailles de police, et les
   tests d'écran de la facture ne pouvaient plus interroger le document. Les
   deux déclarations décrivent la même largeur.
   (Aucune apostrophe inverse dans cette chaîne : elle terminerait le gabarit.) */
.doc-totaux dl { width: 100%; max-width: 320px; }
.doc-totaux div {
  display: flex; justify-content: space-between; gap: 20px;
  padding: 5px 0; font-size: 11.5px; color: #6a6a66;
}
.doc-totaux dd { font-variant-numeric: tabular-nums; color: #1d1d1b; }
.doc-totaux .doc-net {
  margin-top: 4px; padding-top: 9px; border-top: 1.5px solid #1d1d1b;
  font-size: 14px; font-weight: 700; color: #1d1d1b;
}
.doc-totaux .doc-net dd { font-weight: 700; }

.doc-mentions {
  margin-top: 18px; padding-top: 12px; border-top: 1px solid #ececec;
  font-size: 10px; line-height: 1.6; color: #6a6a66;
}
.doc-mentions p { margin: 0 0 2px; }

/*
 * LE BROUILLON SE VOIT, ET NE SE CONFOND PAS AVEC UNE FACTURE ÉMISE.
 *
 * Une facture non émise porte un numéro qui n'est pas encore attribué : deux
 * brouillons téléchargés le même jour porteraient le même. Envoyé tel quel à
 * un client, l'un des deux devient une facture en double au livre de
 * quelqu'un. Le bandeau part avec le fichier — c'est tout l'intérêt.
 */
.doc-brouillon {
  margin-bottom: 14px; padding: 8px 11px; border-radius: 6px;
  border: 1px dashed #c08a2e; background: #fdf6e8;
  font-size: 11px; font-weight: 600; color: #8a5d10;
  text-transform: uppercase; letter-spacing: 0.06em;
}

@media print {
  .doc { padding: 0; max-width: none; }
}
`;
