import type { Trip, TripCreate, TripPatch, TripWithStats } from '@/types';
import { apiFetch } from './api';

export const getTrips = () => apiFetch<TripWithStats[]>('/v1/trips');
export const getTrip = (id: string) => apiFetch<Trip>(`/v1/trips/${id}`);
export const createTrip = (input: TripCreate) => apiFetch<Trip>('/v1/trips', { method: 'POST', body: JSON.stringify(input) });
export const updateTrip = (id: string, patch: TripPatch) => apiFetch<Trip>(`/v1/trips/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTrip = (id: string) => apiFetch<void>(`/v1/trips/${id}`, { method: 'DELETE' });
