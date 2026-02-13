export interface Exam {
  id?: string;
  title?: string;
  description?: string;
  durationMinutes?: number;
  questions?: Array<any>;
  createdAt?: string;
}
