# MENUQR Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Tenant Isolation**: A restaurant owner can only read/write restaurants, categories, menu items, QR codes, analytics, and audit logs where `ownerId == request.auth.uid`.
2. **Public Menu Isolation**: Unauthenticated visitors can only read restaurants, slugs, categories, and menu items where `isPublished == true` and `isSuspended == false`. Unpublished or suspended restaurants are strictly unreadable by public visitors and non-owners.
3. **Server-Controlled Subscriptions & Roles**: Restaurant owners cannot self-upgrade `plan`, modify `subscriptionStatus`/`subscriptionExpiresAt`, unset `isSuspended`, or add themselves to `admins/{uid}`.
4. **Plan-Limit Enforcement**: On `free` plan, creating a `menu_item` is rejected by Firestore rules once `dishCount >= 20`, and `dishCount` must be updated atomically in the same batch (`getAfter`).
5. **PII Isolation**: `profiles/{userId}` is strictly restricted to `request.auth.uid == userId` or verified platform admins.
6. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on creation and cannot be changed on update. `ownerId` and `restaurantId` are immutable after creation.
7. **Slug Uniqueness**: `slugs/{slug}` prevents two restaurants from claiming the same public URL slug.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Upgrade Plan**: Owner sends `{ plan: "pro", subscriptionStatus: "active" }` on restaurant update.
2. **Privilege Escalation**: Regular user attempts `create` on `/admins/{theirUid}`.
3. **Cross-Tenant Menu Tampering**: Owner B attempts `update` or `delete` on Owner A's `/restaurants/{restA}/menu_items/{itemA}`.
4. **Cross-Tenant PII Read**: Owner B attempts `get` on `/profiles/{ownerA}`.
5. **Unpublished Restaurant Scraping**: Anonymous visitor runs `list` or `get` on `/restaurants/{unpublishedId}` or its `menu_items`.
6. **Free Plan Dish Bypass**: Owner on `free` plan with `dishCount == 20` attempts to create a 21st `menu_item` (or omits atomic `dishCount` increment).
7. **Shadow Field Injection**: Owner sends `{ name: "Masala Chai", isVerified: true }` (extra key) on `menu_item` create/update.
8. **ID Poisoning**: Attacker attempts `create` with a 500-char ID or invalid characters (`../evil`) as `{itemId}`.
9. **Spoofed Admin Email**: Unverified account (`email_verified: false`) attempts admin action.
10. **Negative / Overflow Price**: Owner sends `{ price: -50 }` or `{ price: "100" }` on `menu_item`.
11. **Backdated Timestamp**: Owner sends `{ createdAt: "2020-01-01T00:00:00Z" }` instead of `serverTimestamp()`.
12. **Audit Log Tampering**: Owner attempts `update` or `delete` on `/restaurants/{restId}/audit_logs/{logId}`.
