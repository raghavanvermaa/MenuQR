import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react';
import { SmartImage } from '../../components/BrandUI';
import { useDashboard } from '../DashboardLayout';
import { createTableQrCode, deleteQrCode, getPublicMenuUrl } from '../../lib/menuService';
import { downloadPrintableQrPosterPdf, downloadQrPng, generateQrDataUrl } from '../../lib/qrExport';
import { getEffectivePlan } from '../../lib/plans';

export function QrCodesTab() {
  const { restaurant, qrCodes, reloadAll } = useDashboard();
  const [primaryQr, setPrimaryQr] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = getEffectivePlan(restaurant);
  const primaryUrl = getPublicMenuUrl(restaurant.slug);

  useEffect(() => {
    void generateQrDataUrl(primaryUrl, '#171923').then(setPrimaryQr);
  }, [primaryUrl]);

  const handleCopy = (id: string, url: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateTableQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) return;
    setError(null);
    setCreating(true);
    try {
      await createTableQrCode(
        restaurant,
        tableLabel.trim() || `Table ${tableNumber.trim()}`,
        tableNumber.trim()
      );
      setTableLabel('');
      setTableNumber('');
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create table QR.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteQr = async (qrId: string) => {
    setBusyId(qrId);
    setError(null);
    try {
      await deleteQrCode(restaurant.id, qrId);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete QR record.');
    } finally {
      setBusyId(null);
    }
  };

  const tableQrs = qrCodes.filter((q) => Boolean(q.tableNumber));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171923]">QR Codes & Posters</h1>
        <p className="text-sm text-[#525866] mt-1">
          Your QR code points to your permanent menu URL. Edit dishes or prices anytime — printed QR
          codes never expire.
        </p>
      </div>

      {!restaurant.isPublished && (
        <div className="rounded-xl bg-[#FFF3E3] border border-[#F2D1A5] p-4 text-xs text-[#8A4F0E]">
          Your menu is currently in <strong>Draft Mode</strong>. Publish it from the top bar before
          printing or placing QR codes on tables so customers can scan and browse.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]" role="alert">
          {error}
        </div>
      )}

      {/* Primary Permanent QR + Printable Poster Preview */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-6">
          <div>
            <p className="text-xs font-semibold text-[#239B69] mb-1">Permanent Menu QR</p>
            <h2 className="text-lg font-bold text-[#171923]">{restaurant.name}</h2>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-48 h-48 rounded-2xl border border-[#E6DFD3] bg-white p-3.5 shrink-0 flex items-center justify-center">
              {primaryQr ? (
                <img src={primaryQr} alt={`QR code for ${restaurant.name}`} className="w-full h-full" />
              ) : (
                <QrCode className="w-16 h-16 text-[#171923]" />
              )}
            </div>

            <div className="flex-1 min-w-0 w-full space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#525866] mb-1.5">Permanent destination URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#FAF6EE] border border-[#E6DFD3] rounded-lg px-3 py-2 text-xs font-mono truncate">
                    {primaryUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy('primary', primaryUrl)}
                    className="px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white hover:bg-[#FAF6EE] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {copiedId === 'primary' ? (
                      <Check className="w-3.5 h-3.5 text-[#239B69]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'primary' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void downloadQrPng(primaryUrl, `${restaurant.slug}-menu-qr`)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void downloadPrintableQrPosterPdf({
                      restaurant,
                      destinationUrl: primaryUrl,
                      includeMenuqrBranding: restaurant.plan === 'free',
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] whitespace-nowrap"
                >
                  <FileText className="w-4 h-4" />
                  Download Printable PDF
                </button>

                <Link
                  to={`/menu/${restaurant.slug}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-xs font-semibold text-[#171923] hover:border-[#171923] whitespace-nowrap"
                >
                  Test menu link
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Live Printable Poster Card Preview */}
        <section className="lg:col-span-5 bg-[#FFF9F1] rounded-2xl border border-[#E6DFD3] p-6">
          <p className="text-xs font-semibold text-[#6B7280] mb-3">Printable A4 Poster Preview</p>
          <div className="bg-white rounded-xl border border-[#171923]/20 overflow-hidden text-center">
            <div className="h-3" style={{ backgroundColor: restaurant.theme || '#FF9F43' }} />
            <div className="p-6 flex flex-col items-center">
              {restaurant.logoUrl && (
                <SmartImage
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  className="w-12 h-12 rounded-lg object-cover mb-2.5 border border-[#EFE8DC]"
                />
              )}
              <p className="font-editorial text-lg font-semibold text-[#171923] leading-tight">
                {restaurant.name}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">{restaurant.city}</p>

              <div className="my-4 p-2.5 rounded-xl border border-[#E6DFD3] w-36 h-36 bg-white">
                {primaryQr && (
                  <img src={primaryQr} alt="Poster QR preview" className="w-full h-full" />
                )}
              </div>

              <p className="text-sm font-bold text-[#171923]">Scan to view our menu.</p>
              <p className="text-[11px] text-[#6B7280] mt-1">
                Point your phone camera — no app required
              </p>
              {restaurant.plan === 'free' && (
                <p className="text-[10px] font-bold text-[#C86D14] mt-4">Powered by MENUQR</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Table-Specific QR Codes (Growth / Pro) */}
      <section className="bg-white rounded-2xl border border-[#E6DFD3] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#171923]">Table-specific QR codes</h2>
            <p className="text-xs text-[#525866] mt-0.5">
              Generate individual QR posters for Table 1, Table 2, Rooftop, or Takeaway Counter with
              table tracking in the menu header.
            </p>
          </div>
          {!plan.tableQrEnabled && (
            <Link
              to="/dashboard/subscription"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A5B13] hover:underline whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Growth plan (₹499/mo)
            </Link>
          )}
        </div>

        <form onSubmit={handleCreateTableQr} className="grid sm:grid-cols-12 gap-3">
          <input
            type="text"
            maxLength={20}
            disabled={!plan.tableQrEnabled || restaurant.isSuspended}
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="Table number (e.g., 4)"
            className="sm:col-span-4 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm disabled:bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          />
          <input
            type="text"
            maxLength={60}
            disabled={!plan.tableQrEnabled || restaurant.isSuspended}
            value={tableLabel}
            onChange={(e) => setTableLabel(e.target.value)}
            placeholder="Label (e.g., Window Table 4)"
            className="sm:col-span-5 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm disabled:bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          />
          <button
            type="submit"
            disabled={!plan.tableQrEnabled || creating || !tableNumber.trim() || restaurant.isSuspended}
            className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] disabled:opacity-45 whitespace-nowrap"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Table QR
          </button>
        </form>

        {tableQrs.length > 0 && (
          <div className="divide-y divide-[#EFE8DC] border-t border-[#EFE8DC] pt-2">
            {tableQrs.map((qr) => {
              const url = getPublicMenuUrl(restaurant.slug, qr.tableNumber);
              return (
                <div
                  key={qr.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#171923]">
                      {qr.label}{' '}
                      <span className="font-normal text-[#6B7280]">· Table {qr.tableNumber}</span>
                    </p>
                    <p className="text-xs font-mono text-[#6B7280] truncate">{url}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(qr.id, url)}
                      className="px-3 py-1.5 rounded-lg border border-[#DDD5C7] text-xs font-semibold hover:bg-[#FAF6EE]"
                    >
                      {copiedId === qr.id ? 'Copied' : 'Copy URL'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadQrPng(url, `${restaurant.slug}-table-${qr.tableNumber}`)
                      }
                      className="px-3 py-1.5 rounded-lg border border-[#DDD5C7] text-xs font-semibold hover:bg-[#FAF6EE]"
                    >
                      PNG
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadPrintableQrPosterPdf({
                          restaurant,
                          destinationUrl: url,
                          label: qr.label,
                          tableNumber: qr.tableNumber,
                          includeMenuqrBranding: false,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#FF9F43] text-[#171923] text-xs font-bold"
                    >
                      PDF Poster
                    </button>
                    <button
                      type="button"
                      disabled={busyId === qr.id}
                      onClick={() => void handleDeleteQr(qr.id)}
                      aria-label="Delete table QR"
                      className="p-2 rounded-lg border border-[#E6DFD3] text-[#6B7280] hover:text-[#B42318]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
