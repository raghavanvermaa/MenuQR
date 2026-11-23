/**
 * MENUQR Firestore Security Rules Verification Spec
 * Documents the 12 adversarial Dirty Dozen test cases aligned with firestore.rules.
 * Run against the Firebase Emulator Suite (`firebase emulators:exec`) when running offline rule unit tests.
 */

export interface SecurityTestCase {
  id: string;
  title: string;
  actor: 'anonymous' | 'ownerA' | 'ownerB' | 'unverifiedAdmin' | 'verifiedAdmin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'DENY';
  enforcedBy: string;
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    title: 'Owner self-upgrades subscription plan',
    actor: 'ownerA',
    operation: 'update',
    path: '/restaurants/rest_a',
    payload: { plan: 'pro', subscriptionStatus: 'active' },
    expected: 'DENY',
    enforcedBy: 'Action 2 affectedKeys().hasOnly(...) excludes plan and subscriptionStatus',
  },
  {
    id: 'DD-02',
    title: 'Regular owner creates admin record for themselves',
    actor: 'ownerA',
    operation: 'create',
    path: '/admins/owner_a_uid',
    payload: { id: 'owner_a_uid', email: 'owner@example.com' },
    expected: 'DENY',
    enforcedBy: 'admins create requires isAdmin()',
  },
  {
    id: 'DD-03',
    title: 'Cross-tenant menu tampering by another restaurant owner',
    actor: 'ownerB',
    operation: 'update',
    path: '/restaurants/rest_a/menu_items/item_1',
    payload: { price: 1 },
    expected: 'DENY',
    enforcedBy: 'existing().ownerId == request.auth.uid && parent restaurant ownerId check',
  },
  {
    id: 'DD-04',
    title: 'Cross-tenant PII read on profiles',
    actor: 'ownerB',
    operation: 'get',
    path: '/profiles/owner_a_uid',
    expected: 'DENY',
    enforcedBy: 'profiles get strictly restricted to isOwnerUid(userId) || isAdmin()',
  },
  {
    id: 'DD-05',
    title: 'Public visitor attempts to read unpublished restaurant',
    actor: 'anonymous',
    operation: 'get',
    path: '/restaurants/rest_unpublished',
    expected: 'DENY',
    enforcedBy: 'existing().isPublished == true && existing().isSuspended == false',
  },
  {
    id: 'DD-06',
    title: 'Free plan owner exceeds 20-dish limit',
    actor: 'ownerA',
    operation: 'create',
    path: '/restaurants/rest_a/menu_items/item_21',
    payload: { name: 'Dish 21', price: 150 },
    expected: 'DENY',
    enforcedBy: 'parent.data.dishCount < 20 and atomic getAfter dishCount == dishCount + 1',
  },
  {
    id: 'DD-07',
    title: 'Shadow field injection on menu item create',
    actor: 'ownerA',
    operation: 'create',
    path: '/restaurants/rest_a/menu_items/item_shadow',
    payload: { name: 'Chai', isVerified: true },
    expected: 'DENY',
    enforcedBy: 'isValidMenuItem data.keys().hasOnly(...)',
  },
  {
    id: 'DD-08',
    title: 'ID poisoning with oversized/invalid characters',
    actor: 'ownerA',
    operation: 'create',
    path: '/restaurants/rest_a/categories/..%2Fevil',
    expected: 'DENY',
    enforcedBy: 'isValidId(categoryId) regex ^[a-zA-Z0-9_\\-]+$',
  },
  {
    id: 'DD-09',
    title: 'Unverified account spoofing admin email',
    actor: 'unverifiedAdmin',
    operation: 'list',
    path: '/profiles',
    expected: 'DENY',
    enforcedBy: 'isAdmin() requires isVerifiedUser() (email_verified == true)',
  },
  {
    id: 'DD-10',
    title: 'Negative or XSS URL payload on dish',
    actor: 'ownerA',
    operation: 'update',
    path: '/restaurants/rest_a/menu_items/item_1',
    payload: { price: -50, imageUrl: 'javascript:alert(1)' },
    expected: 'DENY',
    enforcedBy: 'isValidMenuItem price >= 0 && isSafeOptionalUrl(data.imageUrl)',
  },
  {
    id: 'DD-11',
    title: 'Backdated createdAt timestamp',
    actor: 'ownerA',
    operation: 'create',
    path: '/restaurants/rest_a/categories/cat_1',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'DENY',
    enforcedBy: 'incoming().createdAt == request.time',
  },
  {
    id: 'DD-12',
    title: 'Owner attempts to delete or edit audit log',
    actor: 'ownerA',
    operation: 'delete',
    path: '/restaurants/rest_a/audit_logs/log_1',
    expected: 'DENY',
    enforcedBy: 'audit_logs allow update, delete: if false',
  },
];
