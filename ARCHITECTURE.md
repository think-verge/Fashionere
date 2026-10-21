# Architecture & Multi-Tenant Isolation Strategy

This document records the architectural decisions and data isolation strategy implemented for Fashionere (Ticket [#170](https://github.com/think-verge/Fashionere/issues/170)).

---

## 1. Isolation Strategy Decision

**Strategy Chosen:** **Shared Database with Mandatory `tenant_id` Partitioning (Pooled Model)**

### Rationale: Shared DB vs. Database-per-Tenant
* **Resource Efficiency:** Avoids excessive database connection overhead and infrastructure cost on MongoDB Atlas.
* **Seamless Cross-Tenant Collaboration:** Allows controlled cross-brand look sharing via `shared_with_tenants` without complex cross-database queries or distributed transactions.
* **Unified Maintenance:** Enables single-pass schema migrations (`npm run migrate:tenants`) and centralized catalog indexing.

---

## 2. Core Isolation Architecture

### A. Context Derivation & Resolution
* `req.tenantId` is strictly derived on the backend via the `requireTenant` middleware from the verified JWT session (`req.user.tenantId`).
* Client-supplied query parameters (e.g., `?tenant_id=...`) can **never** override the authenticated tenant context.

### B. Data Scoping & Query Boundaries
* **Indexed Tenant Ownership:** All tenant-owned collections (`User`, `Workspace`, `Concept`, `GarmentPack`, `GenerationJob`, `ModelShoot`, and private looks) carry an indexed `tenant_id`.
* **Visibility Scoping (`buildTenantFilter`):**
  * **Public Catalog Looks:** `tenant_id: null` or nonexistent, and `source.type !== "shopify"`. Visible platform-wide.
  * **Private Brand Looks:** Filtered strictly by `{ tenant_id: { $in: [userTenantId, ...accessibleTenantIds] } }`.
  * **Cross-Tenant Access:** Access to another brand's private assets without an accepted `shared_with_tenants` entry returns `404 Not Found`.

### C. Platform Admin Oversight
* Users with `role: "admin"` bypass tenant boundary restrictions for catalog moderation, brand deconstruction, and platform administration.

---

## 3. Verification & Compliance
* Data isolation boundaries and context enforcement are validated via automated regression tests in `backend/src/__tests__/tenant-isolation.test.ts`.
