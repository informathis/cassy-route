
import { HGVParams } from './types';

export const ORIGIN = {
  label: "Loire-sur-Rhône 69700, France",
  lat: 45.561075,
  lon: 4.804825
};

export const DEFAULT_HGV_PARAMS: HGVParams = {
  weight: 44,
  height: 4.0,
  width: 2.55,
  length: 16.5,
  axleLoad: 11.5,
  hazmat: false
};

export const MAX_DESTINATIONS = 2000;
export const CONCURRENCY_LIMIT = 5;

export const COLUMN_MAPPINGS = {
  id: ['id', 'ref', 'code', 'identifiant'],
  address: ['adresse', 'address', 'rue', 'street'],
  postcode: ['cp', 'code_postal', 'zip', 'postcode'],
  city: ['ville', 'city', 'town'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'longitude', 'lng']
};
