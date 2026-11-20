/**
 * Professional Invoicing Calculation Engine
 * Pure deterministic functions with 2-decimal precision handling.
 */

const InvoiceCalc = {
  // Round safely to 2 decimal places
  round2(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  },

  // Calculate a single invoice line
  calculateLine(line) {
    const qty = Math.max(0, parseFloat(line.quantity) || 0);
    const rate = Math.max(0, parseFloat(line.rate) || 0);
    const mrp = Math.max(0, parseFloat(line.mrp) || rate);
    const taxRate = Math.max(0, parseFloat(line.tax_rate) || 0);
    const discountVal = Math.max(0, parseFloat(line.discount_val) || 0);
    const discountType = line.discount_type || 'percent'; // 'percent' or 'fixed'

    // Gross Amount
    const grossAmount = this.round2(qty * rate);

    // Line Discount
    let discountAmount = 0;
    if (discountType === 'percent') {
      discountAmount = this.round2(grossAmount * (Math.min(100, discountVal) / 100));
    } else {
      discountAmount = this.round2(Math.min(grossAmount, discountVal));
    }

    // Taxable Amount
    const taxableAmount = this.round2(Math.max(0, grossAmount - discountAmount));

    // Tax Amount
    const taxAmount = this.round2(taxableAmount * (taxRate / 100));

    // Line Total
    const lineTotal = this.round2(taxableAmount + taxAmount);

    return {
      quantity: qty,
      mrp: mrp,
      rate: rate,
      gross_amount: grossAmount,
      discount_type: discountType,
      discount_val: discountVal,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      line_total: lineTotal
    };
  },

  // Calculate full invoice totals
  calculateInvoice(items, options = {}) {
    const {
      tax_type = 'intra', // 'intra' (CGST+SGST) or 'inter' (IGST)
      invoice_discount_type = 'percent',
      invoice_discount_val = 0,
      additional_charges = 0,
      shipping_charges = 0,
      apply_round_off = false,
      amount_paid = 0
    } = options;

    let subtotalGross = 0;
    let totalLineDiscount = 0;
    let taxableSubtotalBeforeInvoiceDiscount = 0;

    const calculatedItems = (items || []).map(item => {
      const calc = this.calculateLine(item);
      subtotalGross = this.round2(subtotalGross + calc.gross_amount);
      totalLineDiscount = this.round2(totalLineDiscount + calc.discount_amount);
      taxableSubtotalBeforeInvoiceDiscount = this.round2(taxableSubtotalBeforeInvoiceDiscount + calc.taxable_amount);
      return {
        ...item,
        ...calc
      };
    });

    // Invoice-level discount
    const discVal = Math.max(0, parseFloat(invoice_discount_val) || 0);
    let invoiceDiscountAmount = 0;
    if (invoice_discount_type === 'percent') {
      invoiceDiscountAmount = this.round2(taxableSubtotalBeforeInvoiceDiscount * (Math.min(100, discVal) / 100));
    } else {
      invoiceDiscountAmount = this.round2(Math.min(taxableSubtotalBeforeInvoiceDiscount, discVal));
    }

    const totalDiscount = this.round2(totalLineDiscount + invoiceDiscountAmount);
    const taxableSubtotal = this.round2(Math.max(0, taxableSubtotalBeforeInvoiceDiscount - invoiceDiscountAmount));

    // Compute Total GST (GST is the only applicable tax section)
    const {
      total_gst_val,
      total_gst_type = 'percent', // 'percent' or 'fixed'
      override_gst_rate
    } = options;

    let gstAmount = 0;
    const rawGst = (total_gst_val !== undefined && total_gst_val !== null) 
      ? total_gst_val 
      : (override_gst_rate !== undefined ? override_gst_rate : '');
    const cleanGstStr = (rawGst !== '' && rawGst !== null) ? String(rawGst).replace(/[^0-9.]/g, '') : '';

    if (cleanGstStr !== '' && !isNaN(parseFloat(cleanGstStr))) {
      const parsedGst = Math.max(0, parseFloat(cleanGstStr));
      if (total_gst_type === 'fixed') {
        gstAmount = this.round2(parsedGst);
      } else {
        gstAmount = this.round2(taxableSubtotal * (parsedGst / 100));
      }
    }

    // Total tax is strictly the GST amount (separate Total Tax removed)
    const totalTax = gstAmount;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    const taxBreakdown = {};

    if (gstAmount > 0) {
      taxBreakdown['gst'] = {
        rate: total_gst_type === 'percent' ? `${rawGst}% GST` : 'Fixed GST',
        taxable: taxableSubtotal,
        totalTax: gstAmount
      };
    } else {
      taxBreakdown['0'] = {
        rate: '0%',
        taxable: taxableSubtotal,
        totalTax: 0
      };
    }

    if (tax_type === 'intra') {
      cgstAmount = this.round2(totalTax / 2);
      sgstAmount = this.round2(totalTax - cgstAmount);
    } else {
      cgstAmount = 0;
      sgstAmount = 0;
      igstAmount = totalTax;
    }

    const extraCharges = this.round2(Math.max(0, parseFloat(additional_charges) || 0));
    const shipping = this.round2(Math.max(0, parseFloat(shipping_charges) || 0));

    const preliminaryGrandTotal = this.round2(taxableSubtotal + totalTax + extraCharges + shipping);

    let roundOff = 0;
    let grandTotal = preliminaryGrandTotal;
    if (apply_round_off) {
      grandTotal = Math.round(preliminaryGrandTotal);
      roundOff = this.round2(grandTotal - preliminaryGrandTotal);
    }

    const paid = this.round2(Math.max(0, parseFloat(amount_paid) || 0));
    const balanceDue = this.round2(Math.max(0, grandTotal - paid));

    return {
      items: calculatedItems,
      subtotal: subtotalGross,
      line_discount_total: totalLineDiscount,
      invoice_discount_type,
      invoice_discount_val: discVal,
      invoice_discount_amount: invoiceDiscountAmount,
      total_discount: totalDiscount,
      taxable_subtotal: taxableSubtotal,
      tax_type,
      gst_amount: gstAmount,
      tax_amount: 0,
      total_gst_val: rawGst,
      total_gst_type,
      total_tax_val: '',
      total_tax_type: 'percent',
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      total_tax: totalTax,
      tax_breakdown: taxBreakdown,
      additional_charges: extraCharges,
      shipping_charges: shipping,
      round_off: roundOff,
      grand_total: grandTotal,
      amount_paid: paid,
      balance_due: balanceDue,
      amount_in_words: this.numberToIndianWords(grandTotal)
    };
  },

  // Convert number to Indian Currency words (Rupees and Paise)
  numberToIndianWords(amount) {
    if (isNaN(amount) || amount === 0) return 'Rupees Zero Only';

    const words = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convertTwoDigits(n) {
      if (n < 20) return words[n];
      const t = tens[Math.floor(n / 10)];
      const u = n % 10 > 0 ? ' ' + words[n % 10] : '';
      return t + u;
    }

    function convertThreeDigits(n) {
      let str = '';
      if (n >= 100) {
        str += words[Math.floor(n / 100)] + ' Hundred ';
        n %= 100;
      }
      if (n > 0) {
        str += convertTwoDigits(n);
      }
      return str.trim();
    }

    const [rupeeStr, paiseStr] = Number(amount).toFixed(2).split('.');
    let rupees = parseInt(rupeeStr, 10);
    const paise = parseInt(paiseStr, 10);

    let result = '';

    // Crores
    const crores = Math.floor(rupees / 10000000);
    if (crores > 0) {
      result += convertThreeDigits(crores) + ' Crore ';
      rupees %= 10000000;
    }

    // Lakhs
    const lakhs = Math.floor(rupees / 100000);
    if (lakhs > 0) {
      result += convertThreeDigits(lakhs) + ' Lakh ';
      rupees %= 100000;
    }

    // Thousands
    const thousands = Math.floor(rupees / 1000);
    if (thousands > 0) {
      result += convertThreeDigits(thousands) + ' Thousand ';
      rupees %= 1000;
    }

    // Hundreds and remaining
    if (rupees > 0) {
      result += convertThreeDigits(rupees) + ' ';
    }

    result = result.trim() ? 'Rupees ' + result.trim() : 'Rupees Zero';

    if (paise > 0) {
      result += ' and ' + convertTwoDigits(paise) + ' Paise';
    }

    return result + ' Only';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceCalc;
}
