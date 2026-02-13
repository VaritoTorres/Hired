export interface User {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: 'candidate' | 'interviewer' | 'admin' | string;
  token?: string;
}
