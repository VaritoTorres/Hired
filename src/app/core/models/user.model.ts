/**
 * @file user.model.ts
 * @description Core domain models for the authenticated user.
 * Kept in core/models so both AuthService and guards can import without
 * creating circular dependencies.
 */

/** Enumeration of all supported user roles in HIRED. */
export enum UserRole {
  CANDIDATE   = 'candidate',
  INTERVIEWER = 'interviewer',
  ADMIN       = 'admin',
}

/**
 * Internal representation of an authenticated user.
 * Built from a Supabase Auth session inside AuthService.mapUser().
 */
export interface AppUser {
  id:        string;
  email:     string;
  fullName:  string;
  avatarUrl: string;
  role:      UserRole;
  createdAt: string;
}

/**
 * Payload stored in the `profiles` table (PostgreSQL).
 * Populated lazily in Phase 2 once the DB schema is ready.
 */
export interface UserProfile extends AppUser {
  bio?:          string;
  githubUrl?:    string;
  linkedinUrl?:  string;
  planId?:       string;
  planExpiresAt?: string;
}
