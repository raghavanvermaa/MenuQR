import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type { Restaurant } from '../types/menuqr';

export async function generateQrDataUrl(url: string, darkColor = '#171923'): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: darkColor,
      light: '#FFFFFF',
    },
  });
}

export async function downloadQrPng(url: string, filename: string): Promise<void> {
  const dataUrl = await generateQrDataUrl(url);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [255, 159, 67];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to load logo'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadPrintableQrPosterPdf(params: {
  restaurant: Restaurant;
  destinationUrl: string;
  label?: string;
  tableNumber?: string;
  includeMenuqrBranding?: boolean;
}): Promise<void> {
  const { restaurant, destinationUrl, label, tableNumber, includeMenuqrBranding = true } = params;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const [ar, ag, ab] = hexToRgb(restaurant.theme || '#FF9F43');

  // Cream background
  pdf.setFillColor(255, 249, 241);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Outer charcoal frame card
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(23, 25, 35);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 8, 8, 'FD');

  // Top accent stripe inside card
  pdf.setFillColor(ar, ag, ab);
  pdf.roundedRect(18, 18, pageWidth - 36, 12, 4, 4, 'F');
  pdf.rect(18, 24, pageWidth - 36, 6, 'F');

  let cursorY = 46;

  // Optional Restaurant Logo
  if (restaurant.logoUrl) {
    const logoDataUrl = await imageUrlToDataUrl(restaurant.logoUrl);
    if (logoDataUrl) {
      try {
        const format = logoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(logoDataUrl, format, pageWidth / 2 - 14, cursorY - 6, 28, 28);
        cursorY += 30;
      } catch {
        // Continue cleanly without logo if unsupported image format
      }
    }
  }

  // Restaurant Name
  pdf.setTextColor(23, 25, 35);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(26);
  pdf.text(restaurant.name, pageWidth / 2, cursorY, { align: 'center', maxWidth: 150 });
  cursorY += 10;

  // City / Subtitle
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(90, 96, 112);
  const subtitle = tableNumber
    ? `Table ${tableNumber} · ${restaurant.city}`
    : label && label !== 'Primary Restaurant Menu'
      ? `${label} · ${restaurant.city}`
      : restaurant.city;
  pdf.text(subtitle, pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 14;

  // QR Container Box
  const qrSize = 98;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = cursorY;

  pdf.setDrawColor(230, 224, 214);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 6, 6, 'S');

  const qrDataUrl = await generateQrDataUrl(destinationUrl, '#171923');
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  cursorY = qrY + qrSize + 22;

  // Call to action
  pdf.setTextColor(23, 25, 35);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Scan to view our menu.', pageWidth / 2, cursorY, { align: 'center' });
  cursorY += 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(100, 106, 120);
  pdf.text(
    'Point your phone camera at the QR code — no app download required.',
    pageWidth / 2,
    cursorY,
    { align: 'center' }
  );
  cursorY += 12;

  // Permanent URL caption
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(70, 76, 90);
  pdf.text(destinationUrl.replace(/^https?:\/\//, ''), pageWidth / 2, cursorY, {
    align: 'center',
    maxWidth: 155,
  });

  // Footer
  if (restaurant.address || restaurant.phone) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(110, 115, 128);
    const footerLine = [restaurant.address, restaurant.phone].filter(Boolean).join('  ·  ');
    pdf.text(footerLine, pageWidth / 2, pageHeight - 34, { align: 'center', maxWidth: 155 });
  }

  if (includeMenuqrBranding) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(ar, ag, ab);
    pdf.text('Powered by MENUQR', pageWidth / 2, pageHeight - 25, { align: 'center' });
  }

  const safeFile = tableNumber
    ? `${restaurant.slug}-table-${tableNumber}-qr-poster.pdf`
    : `${restaurant.slug}-qr-poster.pdf`;
  pdf.save(safeFile);
}
