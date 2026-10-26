/** A signed-in user as every product sees it. Never carries names/emails into AI calls; use `id` as the pseudonymous ref. */
export type AuthUser = { id: string; email: string | null };

/**
 * What a product must provide. apps/web implements it over Supabase SSR cookies;
 * a new product can use the same Supabase project (shared login) or the memory adapter in tests.
 */
export interface AuthAdapter {
  currentUser(): Promise<AuthUser | null>;
  /** Is the user a member of this product (product_memberships)? Missing table/error → false (fail closed). */
  isMember?(userId: string, productId: string): Promise<boolean>;
}

export class AuthError extends Error {
  constructor(public readonly code: 'unauthenticated' | 'not_member' | 'invalid_product') {
    super(code);
  }
}

const PRODUCT_ID = /^[a-z][a-z0-9-]{1,30}$/;

export function createAuth(opts: { productId: string; adapter: AuthAdapter; requireMembership?: boolean }) {
  if (!PRODUCT_ID.test(opts.productId)) throw new AuthError('invalid_product');
  return {
    productId: opts.productId,
    async getUser(): Promise<AuthUser | null> {
      try {
        return await opts.adapter.currentUser();
      } catch {
        return null; // fail closed
      }
    },
    async requireUser(): Promise<AuthUser> {
      const u = await this.getUser();
      if (!u) throw new AuthError('unauthenticated');
      if (opts.requireMembership) {
        let ok = false;
        try {
          ok = (await opts.adapter.isMember?.(u.id, opts.productId)) ?? false;
        } catch {
          ok = false;
        }
        if (!ok) throw new AuthError('not_member');
      }
      return u;
    },
  };
}

/** Structural subset of a Supabase client, so this package doesn't depend on supabase-js. */
export type SupabaseLike = {
  auth: { getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null }; error?: unknown }> };
  from(table: string): {
    select(cols: string, o?: { count?: 'exact'; head?: boolean }): {
      eq(c: string, v: string): { eq(c: string, v: string): PromiseLike<{ count: number | null; error: unknown }> };
    };
  };
};

/** Adapter over a request-scoped Supabase client (cookies). Uses getUser() (server-verified), never getSession(). */
export function supabaseAuthAdapter(client: SupabaseLike): AuthAdapter {
  return {
    async currentUser() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async isMember(userId, productId) {
      const { count, error } = await client.from('product_memberships').select('user_id', { count: 'exact', head: true }).eq('user_id', userId).eq('product_id', productId);
      return !error && (count ?? 0) > 0;
    },
  };
}

/** For tests and local demos. */
export function memoryAuthAdapter(user: AuthUser | null, memberships: { userId: string; productId: string }[] = []): AuthAdapter {
  return {
    currentUser: async () => user,
    isMember: async (u, p) => memberships.some((m) => m.userId === u && m.productId === p),
  };
}
