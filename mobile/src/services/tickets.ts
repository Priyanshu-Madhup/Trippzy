import type { DocumentRow, JobOut, Ticket, TicketPatch, TicketWithTrip, UploadOut } from '@/types';
import { apiFetch } from './api';

export const getAllTickets = () => apiFetch<TicketWithTrip[]>('/v1/tickets?limit=500');
export const getDocuments = () => apiFetch<DocumentRow[]>('/v1/documents?limit=500');

export const getTickets = (tripId: string) => apiFetch<Ticket[]>(`/v1/trips/${tripId}/tickets`);
export const getRecentTickets = (limit = 6) => apiFetch<TicketWithTrip[]>(`/v1/tickets/recent?limit=${limit}`);
export const getTicket = (id: string) => apiFetch<Ticket>(`/v1/tickets/${id}`);
export const updateTicket = (id: string, patch: TicketPatch) => apiFetch<Ticket>(`/v1/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTicket = (id: string) => apiFetch<void>(`/v1/tickets/${id}`, { method: 'DELETE' });
export const reprocessTicket = (id: string) => apiFetch<JobOut>(`/v1/tickets/${id}/reprocess`, { method: 'POST' });

// Files: short-lived presigned URLs issued by the API after an ownership check.
export const getFileUrl = (id: string, download = false) =>
  apiFetch<{ url: string; expires_in: number }>(`/v1/tickets/${id}/file-url${download ? '?download=true' : ''}`);
export const getTicketCode = (id: string) => apiFetch<{ url: string; format: string; expires_in: number }>(`/v1/tickets/${id}/code`);
export const getPdfPages = (id: string) => apiFetch<{ pages: string[]; expires_in: number }>(`/v1/tickets/${id}/pages`);

// Upload (step 1 + 3): the file itself goes straight to R2 in step 2 — see uploadToR2.
export const createUpload = (tripId: string, file: { file_name: string; mime_type: string; size: number }) =>
  apiFetch<UploadOut>(`/v1/trips/${tripId}/uploads`, { method: 'POST', body: JSON.stringify(file) });
export const completeUpload = (ticketId: string) => apiFetch<Ticket>(`/v1/tickets/${ticketId}/upload-complete`, { method: 'POST', timeoutMs: 60_000 });
