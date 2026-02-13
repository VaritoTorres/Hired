import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor() {}

  // Base methods prepared for future implementation
  get<T>(path: string): Promise<T> {
    return Promise.reject('Not implemented');
  }

  post<T>(path: string, body: any): Promise<T> {
    return Promise.reject('Not implemented');
  }
}
