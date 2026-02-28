/**
 * @file environment.ts
 * @description Development environment configuration.
 * All sensitive keys are read from this file; never commit production secrets.
 */
export const environment = {
  production: false,

  supabase: {
    url: 'https://klouyjcppfjynzlfcszh.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsb3V5amNwcGZqeW56bGZjc3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5OTE4MDQsImV4cCI6MjA4NjU2NzgwNH0.WGHgn4Bw5cJ-S1i4CHrp6a7EOgx0yaVXSiwaaW7tOsY',
  },

  app: {
    name: 'HIRED',
    version: '1.0.0',
    apiBaseUrl: 'https://klouyjcppfjynzlfcszh.supabase.co',
  },
};
