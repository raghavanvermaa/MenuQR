import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useDashboard } from '../DashboardLayout';
import {
  createCategory,
  deleteCategorySafely,
  reorderCategories,
  updateCategory,
} from '../../lib/menuService';
import type { Category } from '../../types/menuqr';

const QUICK_CATEGORY_SUGGESTIONS = [
  'Starters',
  'Main Course',
  'Biryani & Rice',
  'Breads',
  'Coffee',
  'Beverages',
  'Desserts',
  'Snacks',
  'Combos',
];

export function CategoriesTab() {
  const { restaurant, categories, items, reloadAll } = useDashboard();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Safe category deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteMode, setDeleteMode] = useState<'reassign' | 'cascade'>('reassign');
  const [reassignId, setReassignId] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const availableSuggestions = useMemo(() => {
    const existingLower = new Set(categories.map((c) => c.name.trim().toLowerCase()));
    return QUICK_CATEGORY_SUGGESTIONS.filter((s) => !existingLower.has(s.toLowerCase()));
  }, [categories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Type a category name first (for example: Starters, Coffee, or Main Course), or tap a quick suggestion below.');
      inputRef.current?.focus();
      return;
    }
    if (categories.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" already exists in your categories.`);
      return;
    }

    setError(null);
    setAdding(true);
    try {
      await createCategory(restaurant, trimmed, categories.length);
      setNewName('');
      setNotice(`Category "${trimmed}" added.`);
      await reloadAll();
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category.');
    } finally {
      setAdding(false);
    }
  };

  const handleQuickAdd = async (presetName: string) => {
    if (adding || addingPreset || restaurant.isSuspended) return;
    setError(null);
    setNotice(null);
    setAddingPreset(presetName);
    try {
      await createCategory(restaurant, presetName, categories.length);
      setNotice(`Category "${presetName}" added.`);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category.');
    } finally {
      setAddingPreset(null);
    }
  };

  const handleRename = async (cat: Category) => {
    if (!editDraft.trim()) return;
    setBusyId(cat.id);
    setError(null);
    try {
      await updateCategory(restaurant.id, cat.id, { name: editDraft.trim() });
      setEditingId(null);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename category.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    setBusyId(cat.id);
    setError(null);
    try {
      await updateCategory(restaurant.id, cat.id, { isActive: !cat.isActive });
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update category.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setBusyId(moved.id);
    try {
      await reorderCategories(
        restaurant.id,
        next.map((c) => c.id)
      );
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder categories.');
    } finally {
      setBusyId(null);
    }
  };

  const openDeleteModal = (cat: Category) => {
    const others = categories.filter((c) => c.id !== cat.id);
    setDeleteTarget(cat);
    if (others.length > 0) {
      setDeleteMode('reassign');
      setReassignId(others[0].id);
    } else {
      setDeleteMode('cascade');
      setReassignId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const associated = items.filter((i) => i.categoryId === deleteTarget.id);
    setDeleting(true);
    setError(null);
    try {
      await deleteCategorySafely(
        restaurant,
        deleteTarget.id,
        associated,
        associated.length > 0 && deleteMode === 'reassign' ? reassignId : null
      );
      setDeleteTarget(null);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete category.');
    } finally {
      setDeleting(false);
    }
  };

  const associatedForTarget = deleteTarget
    ? items.filter((i) => i.categoryId === deleteTarget.id)
    : [];
  const otherCategories = deleteTarget
    ? categories.filter((c) => c.id !== deleteTarget.id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#171923]">Categories</h1>
        <p className="text-sm text-[#525866] mt-1">
          Organize your menu into clear sections and set the order customers browse them.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl bg-[#EAF7F1] border border-[#BFE6D3] p-3.5 flex items-center justify-between gap-3 text-xs text-[#1B6E4B]">
          <span className="inline-flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 shrink-0" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="text-[#1B6E4B]/70 hover:text-[#1B6E4B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]" role="alert">
          {error}
        </div>
      )}

      {/* Add Category Bar */}
      <div className="bg-white rounded-2xl border border-[#E6DFD3] p-4 sm:p-5 space-y-4">
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            ref={inputRef}
            type="text"
            maxLength={60}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="New category name (e.g., Coffee, Tandoor Starters, Desserts)"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          />
          <button
            type="submit"
            disabled={adding || restaurant.isSuspended}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add category
          </button>
        </form>

        {availableSuggestions.length > 0 && !restaurant.isSuspended && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#F2ECE2]">
            <span className="text-[11px] font-medium text-[#8B8376] mr-1">Quick add:</span>
            {availableSuggestions.slice(0, 7).map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={adding || Boolean(addingPreset)}
                onClick={() => void handleQuickAdd(preset)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E6DFD3] bg-[#FAF6EE] hover:border-[#171923] text-xs font-medium text-[#171923] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {addingPreset === preset ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3 text-[#C86D14]" />
                )}
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-12 text-center">
          <p className="text-base font-bold text-[#171923] mb-1">No categories yet</p>
          <p className="text-sm text-[#525866]">
            Type a category name above or tap any Quick Add option to start building your menu.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E6DFD3] divide-y divide-[#EFE8DC]">
          {categories.map((cat, idx) => {
            const count = items.filter((i) => i.categoryId === cat.id).length;
            const isEditing = editingId === cat.id;
            const isBusy = busyId === cat.id;

            return (
              <div
                key={cat.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="font-mono text-xs text-[#8B8376] w-6 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <input
                        type="text"
                        maxLength={60}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[#171923] text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRename(cat)}
                        className="p-2 rounded-lg bg-[#239B69] text-white"
                        aria-label="Save name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-2 rounded-lg border border-[#DDD5C7] text-[#525866]"
                        aria-label="Cancel rename"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#171923] truncate">{cat.name}</p>
                      <p className="text-xs text-[#6B7280] tabular-nums">
                        {count} {count === 1 ? 'dish' : 'dishes'} ·{' '}
                        {cat.isActive ? 'Visible on menu' : 'Hidden'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => void handleToggleActive(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                      cat.isActive
                        ? 'border-[#239B69]/30 bg-[#EAF7F1] text-[#1B6E4B]'
                        : 'border-[#DDD5C7] bg-[#F4F1EC] text-[#6B7280]'
                    }`}
                  >
                    {cat.isActive ? 'Active' : 'Hidden'}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || idx === 0 || restaurant.isSuspended}
                    onClick={() => void handleReorder(idx, -1)}
                    title="Move up"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923] disabled:opacity-35"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || idx === categories.length - 1 || restaurant.isSuspended}
                    onClick={() => void handleReorder(idx, 1)}
                    title="Move down"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923] disabled:opacity-35"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditDraft(cat.name);
                    }}
                    title="Rename category"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => openDeleteModal(cat)}
                    title="Delete category"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#B42318] hover:border-[#F5C9C2]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Safe Category Deletion Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#171923]/55 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E6DFD3] max-w-md w-full p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF1EE] text-[#B42318] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#171923]">
                  Delete "{deleteTarget.name}"?
                </h2>
                <p className="text-xs text-[#525866] mt-1 leading-relaxed">
                  {associatedForTarget.length === 0
                    ? 'This category has no dishes and can be deleted safely.'
                    : `This category contains ${associatedForTarget.length} ${
                        associatedForTarget.length === 1 ? 'dish' : 'dishes'
                      }. Choose what should happen to them before deleting.`}
                </p>
              </div>
            </div>

            {associatedForTarget.length > 0 && (
              <div className="space-y-3 bg-[#FAF6EE] rounded-xl p-4 border border-[#EFE8DC]">
                {otherCategories.length > 0 && (
                  <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="delete-mode"
                      checked={deleteMode === 'reassign'}
                      onChange={() => setDeleteMode('reassign')}
                      className="mt-0.5 accent-[#171923]"
                    />
                    <div className="flex-1 space-y-2">
                      <span className="font-semibold text-[#171923] block">
                        Move {associatedForTarget.length} dishes to another category (Recommended)
                      </span>
                      {deleteMode === 'reassign' && (
                        <select
                          value={reassignId}
                          onChange={(e) => setReassignId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#DDD5C7] bg-white text-xs"
                        >
                          {otherCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                )}

                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="delete-mode"
                    checked={deleteMode === 'cascade'}
                    onChange={() => setDeleteMode('cascade')}
                    className="mt-0.5 accent-[#B42318]"
                  />
                  <span className="font-semibold text-[#B42318]">
                    Permanently delete "{deleteTarget.name}" and all {associatedForTarget.length}{' '}
                    dishes inside it
                  </span>
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B42318] text-white text-xs font-semibold hover:bg-[#911C13] disabled:opacity-60"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {associatedForTarget.length > 0 && deleteMode === 'reassign'
                  ? 'Move dishes & delete'
                  : 'Confirm delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
