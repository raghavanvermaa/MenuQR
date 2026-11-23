import React, { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { uploadImageFile } from '../lib/menuService';
import { DEMO_ASSETS } from '../data/demoRestaurant';
import { SmartImage } from './BrandUI';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: 'square' | 'landscape' | 'wide';
  hint?: string;
  showPresets?: boolean;
}

const PRESET_PHOTOS = [
  { label: 'Cappuccino', url: DEMO_ASSETS.cappuccino },
  { label: 'Cold Coffee', url: DEMO_ASSETS.coldCoffee },
  { label: 'Paneer Tikka', url: DEMO_ASSETS.paneerTikka },
  { label: 'Margherita Pizza', url: DEMO_ASSETS.margheritaPizza },
  { label: 'Brownie', url: DEMO_ASSETS.chocolateBrownie },
  { label: 'Cafe Interior', url: DEMO_ASSETS.cover },
];

export function ImageUploadField({
  label,
  value,
  onChange,
  aspect = 'landscape',
  hint = 'JPG, PNG, or WebP up to 5 MB',
  showPresets = false,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);

  const previewClass =
    aspect === 'square'
      ? 'w-24 h-24 rounded-xl'
      : aspect === 'wide'
        ? 'w-full h-36 rounded-xl'
        : 'w-32 h-24 rounded-xl';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const uploadedUrl = await uploadImageFile(file);
      onChange(uploadedUrl);
      setUrlDraft(uploadedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (trimmed && !/^https?:\/\/.+/.test(trimmed) && !trimmed.startsWith('/')) {
      setError('Enter a valid https:// image URL or upload a file.');
      return;
    }
    setError(null);
    onChange(trimmed);
    setShowUrlInput(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-[#171923]">{label}</label>
        <button
          type="button"
          onClick={() => {
            setUrlDraft(value);
            setShowUrlInput((prev) => !prev);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#525866] hover:text-[#171923] transition-colors whitespace-nowrap shrink-0"
        >
          <Link2 className="w-3.5 h-3.5" />
          {showUrlInput ? 'Hide URL' : 'Paste URL'}
        </button>
      </div>

      <div className={`flex ${aspect === 'wide' ? 'flex-col' : 'flex-row items-center'} gap-4`}>
        <div className={`relative overflow-hidden border border-[#E6DFD3] bg-[#FAF6EE] shrink-0 ${previewClass}`}>
          {value ? (
            <SmartImage src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#8B8376] p-2 text-center">
              <ImagePlus className="w-5 h-5 mb-1 opacity-70" />
              <span className="text-[11px]">No photo</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-[#171923]/65 flex items-center justify-center text-white">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#171923] text-white hover:bg-[#2A2E3F] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading...' : value ? 'Replace photo' : 'Upload photo'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setUrlDraft('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#E6DFD3] text-[#525866] hover:text-[#C93B2B] hover:border-[#F0C8C3] transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-[#6B7280]">{hint}</p>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="flex-1 rounded-lg border border-[#DDD5C7] bg-white px-3 py-2 text-sm text-[#171923] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          />
          <button
            type="button"
            onClick={applyUrl}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#FF9F43] text-[#171923] hover:bg-[#E8862A] transition-colors whitespace-nowrap shrink-0"
          >
            Apply
          </button>
        </div>
      )}

      {showPresets && (
        <div className="pt-1">
          <p className="text-xs text-[#6B7280] mb-1.5">Or pick a starter food photo:</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_PHOTOS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setError(null);
                  onChange(preset.url);
                }}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  value === preset.url
                    ? 'border-[#171923] bg-[#171923] text-white'
                    : 'border-[#E6DFD3] bg-white text-[#525866] hover:border-[#171923]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-[#C93B2B]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
