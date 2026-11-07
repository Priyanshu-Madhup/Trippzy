/**
 * App-level names for the API's types. The shapes themselves are GENERATED from the
 * backend's OpenAPI schema (`npm run api:types` → ./api.d.ts) — never hand-edit them.
 */
import type { components } from './api';

type S = components['schemas'];

export type Ticket = S['TicketOut'];
export type TicketWithTrip = S['TicketWithTrip'];
export type DocumentRow = S['DocumentRow'];
export type TicketPatch = S['TicketPatch'];
export type Trip = S['TripOut'];
export type TripWithStats = S['TripWithStats'];
export type TripCreate = S['TripCreate'];
export type TripPatch = S['TripPatch'];
export type TripPlace = S['TripPlaceOut'];
export type Profile = S['ProfileOut'];
export type ProfilePatch = S['ProfilePatch'];
export type Gender = NonNullable<S['ProfileOut']['gender']>;
export type Stats = S['StatsOut'];
export type UploadOut = S['UploadOut'];
export type JobOut = S['JobOut'];

export type DocumentExtraction = S['DocumentExtraction'];
export type TripNote = S['TripNote'];
export type NoteConnection = S['NoteConnection'];
export type DocumentType = S['DocumentExtraction']['document_type'];
export type FlightData = S['FlightData'];
export type FlightSegment = S['FlightSegment'];
export type HotelData = S['HotelData'];
export type TrainData = S['TrainData'];
export type BusData = S['BusData'];
export type RestaurantData = S['RestaurantData'];
export type ActivityData = S['ActivityData'];
export type GenericData = S['GenericData'];

export type ProcessingStatus = Ticket['processing_status'];
export type ProcessingStage = NonNullable<Ticket['processing_stage']>;

// /v1/place-info is untyped in OpenAPI (a plain dict), so it's declared here (port of Trippy's place.ts).
export interface WeatherDay {
  date: string;
  condition: string;
  min: number;
  max: number;
  precipChance: number | null;
}
export interface PlaceWeather {
  source: 'open-meteo';
  location: string | null;
  current: { temperature: number; feelsLike: number | null; condition: string; humidity: number | null; wind: number | null; daylight: boolean };
  days: WeatherDay[];
}
export interface PlaceNewsItem {
  title: string;
  url: string;
  source: string | null;
  date: string | null;
  image: string | null;
  excerpt: string | null;
  /** Publisher icon (favicon) for `source`. */
  logo?: string | null;
}
export interface PlaceInfo {
  query: string;
  weather: PlaceWeather | null;
  news: PlaceNewsItem[];
  about: { title: string; extract: string; url: string; image: string | null } | null;
}
