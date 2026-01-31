
export interface HGVParams {
  weight: number;
  height: number;
  width: number;
  length: number;
  axleLoad: number;
  hazmat: boolean;
}

export interface DestinationRow {
  id: string;
  label: string;
  address?: string;
  postcode?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

export type CalculationStatus = 'pending' | 'geocoding' | 'routing' | 'success' | 'error' | 'invalid_location';

export interface CalculationResult extends DestinationRow {
  status: CalculationStatus;
  distance_km?: number;
  duration_min?: number;
  error_message?: string;
  geocoded_address?: string;
}

export interface ORSConfig {
  apiKey: string;
  baseUrl: string;
}
