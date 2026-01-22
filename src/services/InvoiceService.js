/**
 * Service de gestion des factures
 * Conformité légale française : numérotation séquentielle, livre des recettes
 */

import { store } from './Store.js';
import { fmtDate, fmtInvoiceNumber } from '../utils/formatters.js';

class InvoiceService {
  /**
   * Obtenir le prochain numéro de facture (séquentiel par année)
   */
  getNextInvoiceNumber(year) {
    const company = store.get('company') || {};
    const invoiceCounter = company.invoiceCounter || {};

    const currentCount = invoiceCounter[year] || 0;
    const nextNumber = currentCount + 1;

    return fmtInvoiceNumber(nextNumber, year);
  }

  /**
   * Réserver un numéro de facture et incrémenter le compteur
   */
  reserveInvoiceNumber(year) {
    const company = store.get('company') || {};
    const invoiceCounter = company.invoiceCounter || {};

    const currentCount = invoiceCounter[year] || 0;
    const nextNumber = currentCount + 1;

    // Incrémenter le compteur
    invoiceCounter[year] = nextNumber;
    company.invoiceCounter = invoiceCounter;

    store.set('company', company);

    return fmtInvoiceNumber(nextNumber, year);
  }

  /**
   * Enregistrer une facture dans le livre des recettes
   * Obligation légale pour les micro-entrepreneurs
   */
  registerInvoice(invoice) {
    const company = store.get('company') || {};
    const registry = company.invoiceRegistry || [];

    const entry = {
      id: 'INV' + Date.now(),
      numero: invoice.numero,
      date: invoice.date,
      client: invoice.client,
      nature: invoice.nature || 'Prestation de service',
      montantHT: invoice.montantHT,
      tva: invoice.tva || 0,
      montantTTC: invoice.montantTTC,
      missionId: invoice.missionId,
      mois: invoice.mois,
      registeredAt: new Date().toISOString()
    };

    registry.push(entry);
    company.invoiceRegistry = registry;

    store.set('company', company);

    return entry;
  }

  /**
   * Obtenir le registre des factures
   */
  getRegistry() {
    const company = store.get('company') || {};
    return company.invoiceRegistry || [];
  }

  /**
   * Générer le livre des recettes en CSV (obligation légale)
   */
  generateRegistryCSV() {
    const registry = this.getRegistry();

    const headers = [
      'N° Facture',
      'Date',
      'Client',
      'Nature',
      'Montant HT',
      'TVA',
      'Montant TTC'
    ];

    const rows = registry.map(r => [
      r.numero,
      fmtDate(r.date),
      r.client,
      r.nature,
      r.montantHT.toFixed(2),
      r.tva.toFixed(2),
      r.montantTTC.toFixed(2)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Calculer la date d'échéance de paiement
   */
  calculatePaymentDeadline(invoiceDate, delayDays = 30) {
    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + delayDays);
    return date.toISOString().slice(0, 10);
  }

  /**
   * Vérifier si TVA applicable pour un mois donné
   */
  isTVAApplicable(monthYm) {
    const company = store.get('company') || {};
    const tvaStartMonth = company.tvaDepuis || '2025-10';
    return monthYm >= tvaStartMonth;
  }

  /**
   * Générer les données de facture pour une mission/mois
   */
  generateInvoiceData(mission, monthYm, options = {}) {
    const company = store.get('company') || {};
    const ligne = mission.lignes?.find(l => l.ym === monthYm);

    if (!ligne) {
      throw new Error('Aucune donnée pour ce mois');
    }

    // Calcul jours et montants
    const jours = ligne.joursReels !== null ? ligne.joursReels : ligne.joursPrevus || 0;
    const totalHT = jours * mission.tjm;

    // TVA
    const tvaApplicable = this.isTVAApplicable(monthYm);
    const tvaRate = tvaApplicable ? 20 : 0;
    const tvaAmount = tvaApplicable ? Math.round(totalHT * 0.20 * 100) / 100 : 0;
    const totalTTC = totalHT + tvaAmount;

    // Numéro de facture
    const year = new Date().getFullYear();
    const invoiceNum = options.invoiceNum || this.reserveInvoiceNumber(year);
    const invoiceDate = options.invoiceDate || new Date().toISOString().slice(0, 10);
    const delayDays = options.delayDays || 30;
    const echeance = this.calculatePaymentDeadline(invoiceDate, delayDays);

    // Période
    const [y, m] = monthYm.split('-').map(Number);
    const moisNom = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });

    const lastDay = new Date(y, m, 0).getDate();
    const periode = `du 01 au ${String(lastDay).padStart(2, '0')} ${moisNom}`;

    return {
      numero: invoiceNum,
      date: invoiceDate,
      echeance,
      delayDays,

      // Émetteur
      emetteur: company.nom || '',
      adresseEmetteur: company.adresse || '',
      siret: company.siret || '',
      siren: company.siret?.substring(0, 9) || '',
      tvaIntra: company.tvaIntracom || '',
      apeCode: company.apeCode || '',
      rcs: company.rcs || '',
      rcPro: company.rcPro || '',
      iban: company.iban || '',

      // Client
      client: mission.client || '',
      adresseClient: mission.adresseClient || '',

      // Prestation
      titre: mission.client + ' - ' + moisNom,
      descriptif: mission.descriptifFacture || 'Prestation de service consultant',
      periode,
      numeroCommande: options.numeroCommande || mission.numeroCommande || '',

      // Montants
      jours,
      tjm: mission.tjm,
      totalHT,
      tvaRate,
      tvaAmount,
      totalTTC
    };
  }

  /**
   * Générer le HTML de facture
   */
  generateInvoiceHTML(invoiceData) {
    const fmtEur = (n) => n.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' €';

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facture ${invoiceData.numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; background: #fff; }
    .header { display: flex; justify-content: space-between; margin-bottom: 25px; }
    .company-title { font-size: 14pt; font-weight: bold; color: #1a1a2e; margin-bottom: 8px; }
    .company-name { font-size: 12pt; font-weight: bold; margin-bottom: 4px; }
    .company-info { color: #555; font-size: 9pt; line-height: 1.5; }
    .client-box { background: #f0f4f8; border-left: 4px solid #0099ff; padding: 15px; min-width: 200px; }
    .client-label { font-size: 9pt; color: #666; margin-bottom: 4px; }
    .client-name { font-weight: bold; font-size: 11pt; }
    .client-address { color: #555; font-size: 9pt; margin-top: 4px; }
    .invoice-info { display: flex; gap: 30px; margin-bottom: 20px; font-size: 10pt; padding: 12px; background: #f8f9fa; border-radius: 6px; }
    .invoice-title { font-size: 11pt; font-weight: bold; color: #1a1a2e; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #1a1a2e; color: #fff; }
    th { padding: 10px; text-align: left; font-weight: 500; }
    th.center { text-align: center; }
    th.right { text-align: right; }
    tbody tr { border-bottom: 1px solid #eee; }
    td { padding: 12px 10px; }
    .prestation-desc { font-weight: 500; }
    .prestation-period { font-size: 9pt; color: #666; margin-top: 4px; }
    .total-row { background: #f8f9fa; }
    .total-final { background: #1a1a2e; color: #fff; }
    .bank-box { background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    .bank-title { font-weight: bold; margin-bottom: 8px; }
    .bank-iban { font-family: monospace; font-size: 11pt; letter-spacing: 1px; }
    .legal { font-size: 8pt; color: #888; line-height: 1.6; border-top: 1px solid #ddd; padding-top: 15px; }
    @media print { @page { margin: 0; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="company-title">Entreprise individuelle</div>
        <div class="company-name">${invoiceData.emetteur}</div>
        <div class="company-info">
          ${invoiceData.adresseEmetteur}<br>
          France<br>
          ${invoiceData.siret ? 'SIRET: ' + invoiceData.siret + '<br>' : ''}
          ${invoiceData.tvaIntra ? 'TVA Intra: ' + invoiceData.tvaIntra : ''}
        </div>
      </div>
      <div class="client-box">
        <div class="client-label">FACTURER À</div>
        <div class="client-name">${invoiceData.client}</div>
        ${invoiceData.adresseClient ? '<div class="client-address">' + invoiceData.adresseClient + '</div>' : ''}
      </div>
    </div>

    <div class="invoice-info">
      <div><span style="color:#666;">Facture N° </span><strong>${invoiceData.numero}</strong></div>
      <div><span style="color:#666;">Date: </span><strong>${fmtDate(invoiceData.date)}</strong></div>
      <div><span style="color:#666;">Échéance: </span><strong style="color:#c53030;">${fmtDate(invoiceData.echeance)}</strong></div>
      ${invoiceData.numeroCommande ? '<div><span style="color:#666;">Réf. commande: </span><strong>' + invoiceData.numeroCommande + '</strong></div>' : ''}
    </div>

    <div class="invoice-title">${invoiceData.titre}</div>

    <table>
      <thead>
        <tr>
          <th>Désignation</th>
          <th class="center" style="width:50px;">Qté</th>
          <th class="center" style="width:50px;">Unité</th>
          <th class="right" style="width:80px;">P.U. HT</th>
          <th class="center" style="width:45px;">TVA</th>
          <th class="right" style="width:90px;">Montant HT</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="prestation-desc">${invoiceData.descriptif}</div>
            <div class="prestation-period">Période: ${invoiceData.periode}</div>
          </td>
          <td style="text-align:center;">${invoiceData.jours}</td>
          <td style="text-align:center;">jour(s)</td>
          <td style="text-align:right;">${fmtEur(invoiceData.tjm)}</td>
          <td style="text-align:center;">${invoiceData.tvaRate}%</td>
          <td style="text-align:right;font-weight:500;">${fmtEur(invoiceData.totalHT)}</td>
        </tr>
        <tr><td colspan="6" style="padding:5px;"></td></tr>
        <tr class="total-row">
          <td colspan="4"></td>
          <td style="text-align:right;font-weight:500;color:#666;">Total HT</td>
          <td style="text-align:right;font-weight:600;">${fmtEur(invoiceData.totalHT)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="4"></td>
          <td style="text-align:right;font-weight:500;color:#666;">TVA ${invoiceData.tvaRate}%</td>
          <td style="text-align:right;font-weight:600;">${fmtEur(invoiceData.tvaAmount)}</td>
        </tr>
        <tr class="total-final">
          <td colspan="4"></td>
          <td style="padding:10px;text-align:right;font-weight:bold;">TOTAL TTC</td>
          <td style="padding:10px;text-align:right;font-weight:bold;font-size:12pt;">${fmtEur(invoiceData.totalTTC)}</td>
        </tr>
      </tbody>
    </table>

    ${invoiceData.iban ? `
    <div class="bank-box">
      <div class="bank-title">💳 Coordonnées bancaires</div>
      <div class="bank-iban">${invoiceData.iban}</div>
    </div>
    ` : ''}

    <div class="legal">
      <div style="margin-bottom:8px;"><strong>Conditions de paiement:</strong> Paiement à ${invoiceData.delayDays} jours à compter de la date de facturation. Date d'échéance: ${fmtDate(invoiceData.echeance)}</div>
      <div style="margin-bottom:8px;">En cas de retard de paiement, une pénalité de 3 fois le taux d'intérêt légal sera appliquée (taux BCE + 10 points), à laquelle s'ajoutera une indemnité forfaitaire pour frais de recouvrement de 40 € (article L.441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.</div>
      <div style="margin-bottom:4px;">
        ${invoiceData.siret ? 'SIRET: ' + invoiceData.siret + ' - ' : ''}
        ${invoiceData.siren ? 'SIREN: ' + invoiceData.siren + ' - ' : ''}
        ${invoiceData.apeCode || 'APE 6201Z (Programmation informatique)'}
      </div>
      ${invoiceData.rcs ? '<div style="margin-bottom:4px;">' + invoiceData.rcs + '</div>' : '<div style="margin-bottom:4px;">Dispensé d\'immatriculation en application de l\'article L. 123-1-1 du Code de commerce</div>'}
      ${invoiceData.rcPro ? '<div style="margin-bottom:4px;">Assurance RC Pro: ' + invoiceData.rcPro + '</div>' : ''}
      ${invoiceData.tvaRate === 0 ? '<div style="font-weight:500;margin-top:4px;">TVA non applicable, article 293 B du CGI (franchise en base de TVA)</div>' : ''}
      <div style="margin-top:8px;font-size:7pt;color:#999;">En vertu de l'article 289 du Code Général des Impôts, cette facture doit être conservée 10 ans à compter de sa date d'émission.</div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Télécharger une facture en HTML
   */
  downloadInvoiceHTML(invoiceData) {
    const html = this.generateInvoiceHTML(invoiceData);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Facture-${invoiceData.numero}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Export class for testing
export { InvoiceService };

// Export singleton for app use
export const invoiceService = new InvoiceService();
