/**
 * @file admin.guard.ts
 * @description Functional route guard that restricts access to the admin
 * module.  Queries the public.admin_users table to verify the currently
 * authenticated user has an active admin record before allowing navigation.
 *
 * Usage:
 * ```ts
 * {
 *   path: '',
 *   canActivate: [authGuard, adminGuard],
 *   ...
 * }
 * ```
 *
 * The guard assumes authGuard already ran (user is authenticated).
 * It redirects non-admin users to /dashboard.
 */
import { inject }                         from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { SupabaseService }                from '../services/supabase.service';

export const adminGuard: CanActivateFn = (): Promise<boolean | UrlTree> => {
  const supabase = inject(SupabaseService);
  const router   = inject(Router);
  return checkAdminAccess(supabase, router);
};

async function checkAdminAccess(
  supabase: SupabaseService,
  router:   Router,
): Promise<boolean | UrlTree> {
  const { data: { user }, error: authErr } = await supabase.client.auth.getUser();

  if (authErr || !user) {
    return router.createUrlTree(['/dashboard']);
  }

  const { data, error } = await supabase.client
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
}
