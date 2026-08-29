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

@media print {
  .doc { padding: 0; max-width: none; }
}
`;
