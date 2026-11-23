import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Copy,
  Edit3,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DietaryMark, SmartImage } from '../../components/BrandUI';
import { ImageUploadField } from '../../components/ImageUploadField';
import { useDashboard } from '../DashboardLayout';
import {
  createCategory,
  createMenuItem,
  deleteMenuItem,
  reorderMenuItems,
  updateMenuItem,
} from '../../lib/menuService';
import {
  aiGenerateDishCopy,
  aiScanPaperMenu,
  type DishCopyResponse,
  type ScannedDish,
} from '../../lib/aiService';
import {
  canAddMoreDishes,
  formatInr,
  getDiscountPercent,
  getEffectiveDishPrice,
  getEffectivePlan,
  hasActiveDiscount,
} from '../../lib/plans';
import { FOOD_TYPE_LABELS, type Category, type FoodType, type MenuItem } from '../../types/menuqr';

interface DishFormState {
  id?: string;
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  categoryId: string;
  imageUrl: string;
  foodType: FoodType;
  isAvailable: boolean;
  isFeatured: boolean;
}

interface ReviewScannedDish extends ScannedDish {
  rowId: string;
  selected: boolean;
}

export function MenuTab() {
  const { restaurant, categories, items, reloadAll } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // AI Dish Copywriter state
  const [aiCopyLoading, setAiCopyLoading] = useState(false);
  const [aiCopySuggestion, setAiCopySuggestion] = useState<DishCopyResponse | null>(null);

  // AI Paper Menu Scanner state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedRows, setScannedRows] = useState<ReviewScannedDish[]>([]);
  const [importingScan, setImportingScan] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const scanFileRef = useRef<HTMLInputElement>(null);

  // Quick Category creation state (available directly from My Menu & inside Dish modal)
  const [quickCatModalOpen, setQuickCatModalOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [creatingQuickCat, setCreatingQuickCat] = useState(false);
  const [quickCatError, setQuickCatError] = useState<string | null>(null);
  const [inlineCatOpen, setInlineCatOpen] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');

  const [form, setForm] = useState<DishFormState>({
    name: '',
    description: '',
    price: '',
    discountPrice: '',
    categoryId: categories[0]?.id || '',
    imageUrl: '',
    foodType: 'veg',
    isAvailable: true,
    isFeatured: false,
  });

  const plan = getEffectivePlan(restaurant);
  const canAdd = canAddMoreDishes(restaurant, items.length);
  const remainingSlots =
    plan.dishLimit === null ? null : Math.max(0, plan.dishLimit - items.length);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (scanPreviewUrl) {
        URL.revokeObjectURL(scanPreviewUrl);
      }
    };
  }, [scanPreviewUrl]);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, search, categoryFilter]);

  const openCreateModal = () => {
    setFormError(null);
    setAiCopySuggestion(null);
    setInlineCatOpen(categories.length === 0);
    setInlineCatName('');
    setForm({
      name: '',
      description: '',
      price: '',
      discountPrice: '',
      categoryId: categories[0]?.id || '',
      imageUrl: '',
      foodType: 'veg',
      isAvailable: true,
      isFeatured: false,
    });
    setModalOpen(true);
  };

  const handleCreateQuickCategory = async (nameToCreate: string, selectInDishForm = false) => {
    const trimmed = nameToCreate.trim();
    if (!trimmed) {
      if (selectInDishForm) {
        setFormError('Enter a category name first.');
      } else {
        setQuickCatError('Enter a category name (e.g., Starters, Coffee, Desserts).');
      }
      return;
    }
    if (categories.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      const existing = categories.find(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (selectInDishForm && existing) {
        setForm((prev) => ({ ...prev, categoryId: existing.id }));
        setInlineCatOpen(false);
        setInlineCatName('');
        return;
      }
      setQuickCatError(`"${trimmed}" already exists.`);
      return;
    }

    setCreatingQuickCat(true);
    setQuickCatError(null);
    setFormError(null);
    try {
      const created = await createCategory(restaurant, trimmed, categories.length);
      await reloadAll();
      if (selectInDishForm) {
        setForm((prev) => ({ ...prev, categoryId: created.id }));
        setInlineCatOpen(false);
        setInlineCatName('');
      } else {
        setQuickCatName('');
        setQuickCatModalOpen(false);
        setNotice(`Category "${created.name}" created.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create category.';
      if (selectInDishForm) setFormError(msg);
      else setQuickCatError(msg);
    } finally {
      setCreatingQuickCat(false);
    }
  };

  const openEditModal = (item: MenuItem) => {
    setFormError(null);
    setAiCopySuggestion(null);
    setForm({
      id: item.id,
      name: item.name,
      description: item.description,
      price: String(item.price),
      discountPrice:
        typeof item.discountPrice === 'number' && item.discountPrice > 0 && item.discountPrice < item.price
          ? String(item.discountPrice)
          : '',
      categoryId: item.categoryId,
      imageUrl: item.imageUrl,
      foodType: item.foodType,
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured,
    });
    setModalOpen(true);
  };

  const openScanModal = () => {
    setScanError(null);
    setScannedRows([]);
    setImportProgress('');
    if (scanPreviewUrl) {
      URL.revokeObjectURL(scanPreviewUrl);
      setScanPreviewUrl(null);
    }
    setScanModalOpen(true);
  };

  const handleGenerateDishCopy = async () => {
    if (!form.name.trim() || form.name.trim().length < 2) {
      setFormError('Enter a dish name first so AI can write its description.');
      return;
    }
    setFormError(null);
    setAiCopyLoading(true);
    try {
      const catName = categoryNameMap.get(form.categoryId) || 'Specials';
      const result = await aiGenerateDishCopy({
        dishName: form.name.trim(),
        categoryName: catName,
        foodType: form.foodType,
        restaurant,
      });
      setForm((prev) => ({
        ...prev,
        description: result.description || prev.description,
        foodType: result.foodType || prev.foodType,
        price: prev.price.trim() === '' && result.suggestedPriceInr > 0
          ? String(result.suggestedPriceInr)
          : prev.price,
      }));
      setAiCopySuggestion(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not generate dish copy right now.');
    } finally {
      setAiCopyLoading(false);
    }
  };

  const handleScanFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScannedRows([]);

    if (scanPreviewUrl) {
      URL.revokeObjectURL(scanPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setScanPreviewUrl(preview);

    setScanning(true);
    try {
      const result = await aiScanPaperMenu(file);
      if (!result.dishes || result.dishes.length === 0) {
        setScanError(
          'No dishes could be read clearly from this photo. Try a sharper, well-lit image of the menu.'
        );
        return;
      }

      const maxSelect = remainingSlots === null ? result.dishes.length : remainingSlots;
      setScannedRows(
        result.dishes.map((dish, idx) => ({
          ...dish,
          rowId: `scan-${idx}-${Date.now()}`,
          selected: idx < maxSelect,
        }))
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not scan menu photo.');
    } finally {
      setScanning(false);
      if (scanFileRef.current) scanFileRef.current.value = '';
    }
  };

  const updateScannedRow = (rowId: string, patch: Partial<ReviewScannedDish>) => {
    setScannedRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    );
  };

  const selectedScannedRows = useMemo(
    () => scannedRows.filter((row) => row.selected && row.name.trim().length > 0),
    [scannedRows]
  );

  const exceedsPlanLimit =
    remainingSlots !== null && selectedScannedRows.length > remainingSlots;

  const handleImportScannedDishes = async () => {
    if (selectedScannedRows.length === 0) {
      setScanError('Select at least one dish to import.');
      return;
    }
    if (exceedsPlanLimit) {
      setScanError(
        `Your Free plan has ${remainingSlots} dish slot${remainingSlots === 1 ? '' : 's'} remaining. Uncheck ${
          selectedScannedRows.length - (remainingSlots ?? 0)
        } item(s) or upgrade to Starter.`
      );
      return;
    }

    setScanError(null);
    setImportingScan(true);
    try {
      let workingRestaurant = { ...restaurant };
      const categoryByLowerName = new Map<string, Category>();
      categories.forEach((c) => categoryByLowerName.set(c.name.trim().toLowerCase(), c));
      let nextCatOrder = categories.length;
      let createdCategoriesCount = 0;

      // 1. Create any missing categories sequentially so restaurant.categoryCount stays accurate
      const uniqueCategoryNames = Array.from(
        new Set(
          selectedScannedRows.map((row) => (row.category || 'Specials').trim().slice(0, 60))
        )
      );

      for (const catName of uniqueCategoryNames) {
        const key = catName.toLowerCase();
        if (!categoryByLowerName.has(key)) {
          setImportProgress(`Creating category "${catName}"...`);
          const created = await createCategory(workingRestaurant, catName, nextCatOrder);
          workingRestaurant = {
            ...workingRestaurant,
            categoryCount: workingRestaurant.categoryCount + 1,
          };
          nextCatOrder += 1;
          createdCategoriesCount += 1;
          categoryByLowerName.set(key, created);
        }
      }

      // 2. Import selected dishes sequentially so restaurant.dishCount rules validate cleanly
      let nextItemOrder = items.length;
      let importedDishesCount = 0;

      for (let i = 0; i < selectedScannedRows.length; i += 1) {
        const row = selectedScannedRows[i];
        const catKey = (row.category || 'Specials').trim().slice(0, 60).toLowerCase();
        const targetCat = categoryByLowerName.get(catKey);
        if (!targetCat) continue;

        setImportProgress(`Importing dish ${i + 1} of ${selectedScannedRows.length}...`);
        const safePrice = Number.isFinite(row.price) && row.price >= 0 ? Math.min(100000, row.price) : 0;

        await createMenuItem(workingRestaurant, {
          categoryId: targetCat.id,
          name: row.name.trim().slice(0, 100),
          description: (row.description || '').trim().slice(0, 400),
          price: safePrice,
          imageUrl: '',
          foodType: row.foodType || 'veg',
          isAvailable: true,
          isFeatured: false,
          sortOrder: nextItemOrder,
        });

        workingRestaurant = {
          ...workingRestaurant,
          dishCount: workingRestaurant.dishCount + 1,
        };
        nextItemOrder += 1;
        importedDishesCount += 1;
      }

      await reloadAll();
      setScanModalOpen(false);
      setNotice(
        `Imported ${importedDishesCount} dish${importedDishesCount === 1 ? '' : 'es'}${
          createdCategoriesCount > 0
            ? ` and ${createdCategoriesCount} new categor${createdCategoriesCount === 1 ? 'y' : 'ies'}`
            : ''
        } from your menu photo.`
      );
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Import stopped midway. Reload to see saved dishes.'
      );
      await reloadAll();
    } finally {
      setImportingScan(false);
      setImportProgress('');
    }
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Dish name is required.');
      return;
    }
    if (!form.categoryId) {
      setFormError('Please select a category first.');
      return;
    }
    const parsedPrice = Number(form.price);
    if (form.price.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 100000) {
      setFormError('Enter a valid price between ₹0 and ₹1,00,000.');
      return;
    }

    let parsedDiscountPrice = 0;
    if (form.discountPrice.trim() !== '') {
      const candidate = Number(form.discountPrice);
      if (!Number.isFinite(candidate) || candidate <= 0 || candidate >= parsedPrice) {
        setFormError('Discounted price must be greater than ₹0 and lower than the regular price.');
        return;
      }
      parsedDiscountPrice = candidate;
    }

    setSaving(true);
    try {
      if (form.id) {
        await updateMenuItem(restaurant.id, form.id, {
          name: form.name,
          description: form.description,
          price: parsedPrice,
          discountPrice: parsedDiscountPrice,
          categoryId: form.categoryId,
          imageUrl: form.imageUrl,
          foodType: form.foodType,
          isAvailable: form.isAvailable,
          isFeatured: form.isFeatured,
        });
      } else {
        await createMenuItem(restaurant, {
          name: form.name,
          description: form.description,
          price: parsedPrice,
          discountPrice: parsedDiscountPrice,
          categoryId: form.categoryId,
          imageUrl: form.imageUrl,
          foodType: form.foodType,
          isAvailable: form.isAvailable,
          isFeatured: form.isFeatured,
          sortOrder: items.length,
        });
      }
      setModalOpen(false);
      await reloadAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save dish.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateMenuItem(restaurant.id, item.id, { isAvailable: !item.isAvailable });
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update availability.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleFeatured = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateMenuItem(restaurant.id, item.id, { isFeatured: !item.isFeatured });
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update featured status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (item: MenuItem) => {
    if (!canAdd) {
      setError('Free plan limit of 20 dishes reached. Upgrade to Starter for unlimited dishes.');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await createMenuItem(restaurant, {
        categoryId: item.categoryId,
        name: `${item.name} (Copy)`.slice(0, 100),
        description: item.description,
        price: item.price,
        discountPrice: hasActiveDiscount(item) ? item.discountPrice : 0,
        imageUrl: item.imageUrl,
        foodType: item.foodType,
        isAvailable: item.isAvailable,
        isFeatured: false,
        sortOrder: items.length,
      });
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate dish.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteMenuItem(restaurant, item.id);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dish.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setBusyId(moved.id);
    try {
      await reorderMenuItems(
        restaurant.id,
        next.map((i) => i.id)
      );
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder dishes.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171923]">My Menu</h1>
          <p className="text-sm text-[#525866] mt-1 tabular-nums">
            {items.length} {items.length === 1 ? 'dish' : 'dishes'}
            {plan.dishLimit !== null ? ` of ${plan.dishLimit} on Free plan` : ' · Unlimited plan'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={restaurant.isSuspended}
            onClick={() => {
              setQuickCatError(null);
              setQuickCatName('');
              setQuickCatModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-[#171923] text-xs font-semibold hover:border-[#171923] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4 text-[#239B69]" />
            Add category
          </button>

          <button
            type="button"
            disabled={!canAdd || restaurant.isSuspended}
            onClick={openScanModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#171923]/20 bg-white text-[#171923] text-xs font-semibold hover:border-[#171923] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 text-[#C86D14]" />
            Scan Paper Menu (AI)
          </button>

          <button
            type="button"
            disabled={!canAdd || restaurant.isSuspended}
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add dish
          </button>
        </div>
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

      {!canAdd && (
        <div className="rounded-xl bg-[#FFF3E3] border border-[#F2D1A5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8A4F0E]">
          <span>
            You have reached the 20-dish limit on the Free plan. Upgrade to Starter (₹299/month) for
            unlimited dishes.
          </span>
          <Link
            to="/dashboard/subscription"
            className="font-bold text-[#171923] underline whitespace-nowrap shrink-0"
          >
            View plans
          </Link>
        </div>
      )}

      {categories.length === 0 && (
        <div className="rounded-xl bg-white border border-[#E6DFD3] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#171923]">Create a category or scan your printed menu</p>
            <p className="text-xs text-[#525866] mt-0.5">
              Organize your menu manually in Categories, or snap a photo of your paper menu to create
              categories and dishes automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canAdd || restaurant.isSuspended}
              onClick={openScanModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold whitespace-nowrap shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              Scan Paper Menu
            </button>
            <Link
              to="/dashboard/categories"
              className="px-4 py-2 rounded-xl bg-[#171923] text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Go to Categories
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]" role="alert">
          {error}
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8B8376] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Dish List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6DFD3] p-12 text-center">
          <p className="text-base font-bold text-[#171923] mb-1">
            {items.length === 0 ? 'No dishes yet' : 'No matching dishes'}
          </p>
          <p className="text-sm text-[#525866] mb-5">
            {items.length === 0
              ? 'Add dishes manually or upload a photo of your existing printed menu to import them in seconds.'
              : 'Try clearing your search or category filter.'}
          </p>
          {items.length === 0 && canAdd && (
            <div className="flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={openScanModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold"
              >
                <Camera className="w-4 h-4" />
                Scan Paper Menu (AI)
              </button>
              {categories.length > 0 && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="px-5 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold"
                >
                  Add manually
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E6DFD3] divide-y divide-[#EFE8DC] overflow-hidden">
          {filteredItems.map((item) => {
            const fullIndex = items.findIndex((i) => i.id === item.id);
            const isBusy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF7F2]/60 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <SmartImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-14 rounded-xl object-cover border border-[#EFE8DC] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DietaryMark foodType={item.foodType} />
                      <h3 className="text-sm font-bold text-[#171923] truncate">{item.name}</h3>
                      {item.isFeatured && (
                        <span className="text-[11px] font-semibold text-[#C86D14]">Featured</span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5 truncate">
                      {categoryNameMap.get(item.categoryId) || 'Uncategorized'}
                      {item.description ? ` · ${item.description}` : ''}
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="font-mono text-sm font-bold tabular-nums text-[#171923]">
                        {formatInr(getEffectiveDishPrice(item))}
                      </span>
                      {hasActiveDiscount(item) && (
                        <>
                          <span className="font-mono text-xs line-through tabular-nums text-[#8B8376]">
                            {formatInr(item.price)}
                          </span>
                          <span className="text-[11px] font-semibold text-[#239B69] tabular-nums">
                            {getDiscountPercent(item)}% OFF
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => void handleToggleAvailable(item)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                      item.isAvailable
                        ? 'border-[#239B69]/30 bg-[#EAF7F1] text-[#1B6E4B]'
                        : 'border-[#DDD5C7] bg-[#F4F1EC] text-[#6B7280]'
                    }`}
                  >
                    {item.isAvailable ? 'Available' : 'Sold out'}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => void handleToggleFeatured(item)}
                    title={item.isFeatured ? 'Remove featured' : 'Mark featured'}
                    className={`p-2 rounded-lg border transition-colors ${
                      item.isFeatured
                        ? 'border-[#FF9F43] bg-[#FFF3E3] text-[#C86D14]'
                        : 'border-[#E6DFD3] bg-white text-[#6B7280] hover:text-[#171923]'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${item.isFeatured ? 'fill-[#FF9F43]' : ''}`} />
                  </button>

                  {!search && categoryFilter === 'all' && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy || fullIndex === 0 || restaurant.isSuspended}
                        onClick={() => void handleMove(fullIndex, -1)}
                        title="Move up"
                        className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923] disabled:opacity-35"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || fullIndex === items.length - 1 || restaurant.isSuspended}
                        onClick={() => void handleMove(fullIndex, 1)}
                        title="Move down"
                        className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923] disabled:opacity-35"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => openEditModal(item)}
                    title="Edit dish"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || !canAdd || restaurant.isSuspended}
                    onClick={() => void handleDuplicate(item)}
                    title="Duplicate dish"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#171923] disabled:opacity-40"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || restaurant.isSuspended}
                    onClick={() => void handleDelete(item)}
                    title="Delete dish"
                    className="p-2 rounded-lg border border-[#E6DFD3] bg-white text-[#525866] hover:text-[#B42318] hover:border-[#F5C9C2]"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Paper Menu Scanner Modal */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#171923]/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E6DFD3] max-w-3xl w-full p-6 sm:p-7 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#EFE8DC] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#171923] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C86D14]" />
                  AI Paper Menu Scanner
                </h2>
                <p className="text-xs text-[#525866] mt-0.5">
                  Upload a photo of your printed menu card or board. Review and edit every dish before
                  importing.
                </p>
              </div>
              <button
                type="button"
                disabled={importingScan}
                onClick={() => setScanModalOpen(false)}
                aria-label="Close scanner"
                className="p-1.5 text-[#6B7280] hover:text-[#171923] disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 overflow-y-auto space-y-5 flex-1">
              {/* Upload Area */}
              <div className="rounded-xl border border-dashed border-[#D6CCBC] bg-[#FAF6EE] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {scanPreviewUrl ? (
                      <img
                        src={scanPreviewUrl}
                        alt="Uploaded menu preview"
                        className="w-20 h-20 rounded-lg object-cover border border-[#E6DFD3] shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-white border border-[#E6DFD3] flex items-center justify-center text-[#C86D14] shrink-0">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#171923]">
                        {scanning
                          ? 'Reading categories, dishes, and INR prices...'
                          : scannedRows.length > 0
                            ? `${scannedRows.length} dishes detected — review below`
                            : 'Select a clear photo of your printed menu'}
                      </p>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        JPG, PNG, or WebP up to 5 MB. Works with English & Hinglish menus.
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <input
                      ref={scanFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleScanFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={scanning || importingScan}
                      onClick={() => scanFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] disabled:opacity-50 whitespace-nowrap"
                    >
                      {scanning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                      {scanning ? 'Scanning...' : scannedRows.length > 0 ? 'Scan another photo' : 'Upload menu photo'}
                    </button>
                  </div>
                </div>
              </div>

              {scanError && (
                <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3.5 text-xs text-[#B42318]" role="alert">
                  {scanError}
                </div>
              )}

              {/* Editable Extracted Dishes Table */}
              {scannedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#171923] tabular-nums">
                      Selected: {selectedScannedRows.length} of {scannedRows.length} dishes
                      {remainingSlots !== null && (
                        <span className={exceedsPlanLimit ? 'text-[#B42318] ml-1.5' : 'text-[#6B7280] ml-1.5'}>
                          ({remainingSlots} Free-plan slot{remainingSlots === 1 ? '' : 's'} remaining)
                        </span>
                      )}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setScannedRows((prev) =>
                            prev.map((row, idx) => ({
                              ...row,
                              selected: remainingSlots === null ? true : idx < remainingSlots,
                            }))
                          )
                        }
                        className="font-semibold text-[#C86D14] hover:underline"
                      >
                        Select max allowed
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setScannedRows((prev) => prev.map((row) => ({ ...row, selected: false })))
                        }
                        className="text-[#6B7280] hover:text-[#171923]"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <div className="border border-[#E6DFD3] rounded-xl divide-y divide-[#EFE8DC]">
                    {scannedRows.map((row) => (
                      <div
                        key={row.rowId}
                        className={`p-3.5 space-y-2.5 transition-opacity ${
                          row.selected ? 'bg-white' : 'bg-[#FAF7F2] opacity-65'
                        }`}
                      >
                        <div className="grid grid-cols-12 gap-2.5 items-center">
                          <div className="col-span-1 flex justify-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) =>
                                updateScannedRow(row.rowId, { selected: e.target.checked })
                              }
                              aria-label={`Select ${row.name}`}
                              className="w-4 h-4 rounded accent-[#FF9F43]"
                            />
                          </div>

                          <div className="col-span-11 sm:col-span-4">
                            <input
                              type="text"
                              value={row.name}
                              maxLength={100}
                              onChange={(e) => updateScannedRow(row.rowId, { name: e.target.value })}
                              placeholder="Dish name"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD5C7] text-xs font-semibold text-[#171923] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                            />
                          </div>

                          <div className="col-span-5 sm:col-span-3">
                            <input
                              type="text"
                              value={row.category}
                              maxLength={60}
                              onChange={(e) =>
                                updateScannedRow(row.rowId, { category: e.target.value })
                              }
                              placeholder="Category"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD5C7] text-xs text-[#4A505E] focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                            />
                          </div>

                          <div className="col-span-3 sm:col-span-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#6B7280] font-mono">
                                ₹
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="100000"
                                step="1"
                                value={row.price}
                                onChange={(e) =>
                                  updateScannedRow(row.rowId, {
                                    price: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-full pl-5 pr-2 py-1.5 rounded-lg border border-[#DDD5C7] font-mono text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                              />
                            </div>
                          </div>

                          <div className="col-span-4 sm:col-span-2">
                            <select
                              value={row.foodType}
                              onChange={(e) =>
                                updateScannedRow(row.rowId, {
                                  foodType: e.target.value as FoodType,
                                })
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-[#DDD5C7] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                            >
                              {(Object.keys(FOOD_TYPE_LABELS) as FoodType[]).map((ft) => (
                                <option key={ft} value={ft}>
                                  {FOOD_TYPE_LABELS[ft]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="pl-8">
                          <input
                            type="text"
                            value={row.description}
                            maxLength={400}
                            onChange={(e) =>
                              updateScannedRow(row.rowId, { description: e.target.value })
                            }
                            placeholder="Optional short description"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#EFE8DC] bg-[#FAF8F4] text-xs text-[#525866] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#EFE8DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-[#6B7280]">
                {importProgress || 'Missing categories will be created automatically.'}
              </span>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={importingScan}
                  onClick={() => setScanModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    importingScan ||
                    scanning ||
                    selectedScannedRows.length === 0 ||
                    exceedsPlanLimit
                  }
                  onClick={() => void handleImportScannedDishes()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50 whitespace-nowrap"
                >
                  {importingScan && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {importingScan
                    ? 'Importing...'
                    : `Import ${selectedScannedRows.length} dish${selectedScannedRows.length === 1 ? '' : 'es'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Dish Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#171923]/55 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E6DFD3] max-w-xl w-full p-6 sm:p-7 my-8">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#EFE8DC]">
              <h2 className="text-lg font-bold text-[#171923]">
                {form.id ? 'Edit dish' : 'Add new dish'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 text-[#6B7280] hover:text-[#171923]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDish} className="space-y-4 pt-5">
              {formError && (
                <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3 text-xs text-[#B42318]">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="dish-name">
                  Dish name *
                </label>
                <input
                  id="dish-name"
                  type="text"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Butter Paneer Masala"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="dish-price">
                    Regular price (INR ₹) *
                  </label>
                  <input
                    id="dish-price"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.5"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="249"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold" htmlFor="dish-discount-price">
                      Discounted price (₹, optional)
                    </label>
                    {Number(form.discountPrice) > 0 &&
                      Number(form.price) > 0 &&
                      Number(form.discountPrice) < Number(form.price) && (
                        <span className="text-[11px] font-bold text-[#239B69] tabular-nums">
                          {Math.round(
                            ((Number(form.price) - Number(form.discountPrice)) / Number(form.price)) *
                              100
                          )}
                          % OFF
                        </span>
                      )}
                  </div>
                  <input
                    id="dish-discount-price"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.5"
                    value={form.discountPrice}
                    onChange={(e) => setForm({ ...form, discountPrice: e.target.value })}
                    placeholder="Leave blank for no discount"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold" htmlFor="dish-cat">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => setInlineCatOpen((prev) => !prev)}
                      className="text-[11px] font-semibold text-[#C86D14] hover:underline whitespace-nowrap"
                    >
                      {inlineCatOpen ? 'Cancel new' : '+ New category'}
                    </button>
                  </div>
                  {inlineCatOpen ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        maxLength={60}
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        placeholder="e.g., Starters"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[#171923] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                      />
                      <button
                        type="button"
                        disabled={creatingQuickCat}
                        onClick={() => void handleCreateQuickCategory(inlineCatName, true)}
                        className="px-3 py-2 rounded-xl bg-[#239B69] text-white text-xs font-semibold hover:bg-[#1D8257] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {creatingQuickCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                      </button>
                    </div>
                  ) : (
                    <select
                      id="dish-cat"
                      required
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                    >
                      {categories.length === 0 && (
                        <option value="">No categories yet — click + New category</option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5" htmlFor="dish-type">
                    Dietary type *
                  </label>
                  <select
                    id="dish-type"
                    value={form.foodType}
                    onChange={(e) => setForm({ ...form, foodType: e.target.value as FoodType })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                  >
                    {(Object.keys(FOOD_TYPE_LABELS) as FoodType[]).map((ft) => (
                      <option key={ft} value={ft}>
                        {FOOD_TYPE_LABELS[ft]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-semibold" htmlFor="dish-desc">
                    Description
                  </label>
                  <button
                    type="button"
                    disabled={aiCopyLoading || form.name.trim().length < 2}
                    onClick={() => void handleGenerateDishCopy()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFF3E3] border border-[#F2D1A5] text-[11px] font-semibold text-[#9A5B13] hover:bg-[#FFE8CC] disabled:opacity-50 whitespace-nowrap"
                  >
                    {aiCopyLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {aiCopyLoading ? 'Writing...' : 'Write with AI'}
                  </button>
                </div>
                <textarea
                  id="dish-desc"
                  rows={2}
                  maxLength={400}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Key ingredients, spice level, or serving size"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />

                {aiCopySuggestion && (
                  <div className="mt-2 rounded-xl bg-[#FAF6EE] border border-[#EAE3D7] p-3 text-xs text-[#4A505E] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      {aiCopySuggestion.suggestedPriceInr > 0 && (
                        <p className="font-medium text-[#171923] tabular-nums">
                          Suggested Delhi NCR price:{' '}
                          <span className="font-mono font-bold">
                            {formatInr(aiCopySuggestion.suggestedPriceInr)}
                          </span>
                        </p>
                      )}
                      {aiCopySuggestion.pairingTip && (
                        <p className="text-[11px] text-[#6B7280]">
                          Pairing idea: {aiCopySuggestion.pairingTip}
                        </p>
                      )}
                    </div>
                    {aiCopySuggestion.suggestedPriceInr > 0 &&
                      String(aiCopySuggestion.suggestedPriceInr) !== form.price && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              price: String(aiCopySuggestion.suggestedPriceInr),
                            }))
                          }
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#DDD5C7] text-[11px] font-semibold text-[#171923] hover:border-[#171923] whitespace-nowrap shrink-0"
                        >
                          Apply {formatInr(aiCopySuggestion.suggestedPriceInr)}
                        </button>
                      )}
                  </div>
                )}
              </div>

              <ImageUploadField
                label="Food photograph"
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                aspect="landscape"
                showPresets
              />

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#171923] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAvailable}
                    onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#239B69]"
                  />
                  Currently available
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#171923] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#FF9F43]"
                  />
                  Highlight as House Favorite
                </label>
              </div>

              <div className="pt-4 border-t border-[#EFE8DC] flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171923] text-white text-xs font-semibold hover:bg-[#2A2E3F] disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {form.id ? 'Save changes' : 'Create dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Category Modal (Directly accessible from My Menu) */}
      {quickCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#171923]/55 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E6DFD3] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#171923]">Add new category</h2>
              <button
                type="button"
                onClick={() => setQuickCatModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-[#6B7280] hover:text-[#171923]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickCatError && (
              <div className="rounded-xl bg-[#FFF1EE] border border-[#F5C9C2] p-3 text-xs text-[#B42318]">
                {quickCatError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateQuickCategory(quickCatName, false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold mb-1.5" htmlFor="quick-cat-name">
                  Category name *
                </label>
                <input
                  id="quick-cat-name"
                  type="text"
                  autoFocus
                  maxLength={60}
                  value={quickCatName}
                  onChange={(e) => setQuickCatName(e.target.value)}
                  placeholder="e.g., Starters, Biryani, Cold Beverages"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5C7] text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9F43]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickCatModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5C7] text-xs font-semibold text-[#525866]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingQuickCat}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#FF9F43] text-[#171923] text-xs font-bold hover:bg-[#F09134] disabled:opacity-50"
                >
                  {creatingQuickCat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Add category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
