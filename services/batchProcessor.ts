
import { CalculationResult, HGVParams } from '../types';
import { ORIGIN, CONCURRENCY_LIMIT } from '../constants';
import { orsProxy } from './orsProxy';

const geocodeCache = new Map<string, { lat: number, lon: number, address: string }>();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processBatch(
  rows: CalculationResult[],
  params: HGVParams,
  onProgress: (index: number, result: CalculationResult) => void
) {
  const results: CalculationResult[] = [...rows];
  let activeRequests = 0;
  let nextIndex = 0;

  return new Promise<CalculationResult[]>((resolve) => {
    const runNext = async () => {
      // Fin du traitement
      if (nextIndex >= rows.length && activeRequests === 0) {
        resolve(results);
        return;
      }

      // Concurrence réduite pour stabiliser les appels avec les nouvelles clés
      const safeConcurrency = 2; 

      while (activeRequests < safeConcurrency && nextIndex < rows.length) {
        const index = nextIndex++;
        activeRequests++;
        
        onProgress(index, { ...results[index], status: 'geocoding' });

        processRow(results[index], params, (status) => {
          onProgress(index, { ...results[index], status });
        })
          .then((updatedRow) => {
            results[index] = updatedRow;
            onProgress(index, updatedRow);
          })
          .catch((err) => {
            results[index].status = 'error';
            if (err.message === 'ACCESS_DISALLOWED') {
              results[index].error_message = "Service non autorisé (403)";
            } else if (err.message === 'AUTH_FAILED') {
              results[index].error_message = "Clé invalide (401)";
            } else {
              results[index].error_message = err.message;
            }
            onProgress(index, results[index]);
          })
          .finally(() => {
            activeRequests--;
            // Intervalle de sécurité entre les lancements (500ms)
            setTimeout(runNext, 500);
          });
      }
    };

    runNext();
  });
}

async function processRow(
  row: CalculationResult, 
  params: HGVParams, 
  onStatusUpdate: (status: any) => void
): Promise<CalculationResult> {
  try {
    let lat = row.lat;
    let lon = row.lon;
    let displayAddress = row.address || `${row.postcode || ''} ${row.city || ''}`.trim();

    const hasValidCoords = lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon);

    if (!hasValidCoords) {
      if (!displayAddress) throw new Error("Destination vide");
      
      onStatusUpdate('geocoding');
      const cacheKey = displayAddress.toLowerCase().trim();
      
      if (geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey)!;
        lat = cached.lat;
        lon = cached.lon;
        row.geocoded_address = cached.address;
      } else {
        const geoData = await orsProxy.geocode(displayAddress, { lat: ORIGIN.lat, lon: ORIGIN.lon });
        const feature = geoData.features?.[0];
        
        if (!feature) {
          return { ...row, status: 'invalid_location', error_message: "Non trouvé" };
        }

        const [fLon, fLat] = feature.geometry.coordinates;
        const country = feature.properties.country_a;
        
        if (country !== 'FRA' && country !== 'FR') {
          return { ...row, status: 'invalid_location', error_message: "Hors France" };
        }

        lat = fLat;
        lon = fLon;
        row.geocoded_address = feature.properties.label || feature.properties.name;
        geocodeCache.set(cacheKey, { lat: fLat!, lon: fLon!, address: row.geocoded_address });
      }
    }

    onStatusUpdate('routing');
    
    if (lat === undefined || lon === undefined) throw new Error("GPS manquant");

    const routeData = await orsProxy.getRoute([ORIGIN.lon, ORIGIN.lat], [lon, lat], params);
    
    // Extraction du summary depuis la structure GeoJSON
    const summary = routeData.features?.[0]?.properties?.summary;

    if (!summary) {
      throw new Error("Route impossible");
    }

    return {
      ...row,
      status: 'success',
      distance_km: Number((summary.distance / 1000).toFixed(3)),
      duration_min: Number((summary.duration / 60).toFixed(1)),
      lat,
      lon
    };

  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
      await delay(5000); 
      return processRow(row, params, onStatusUpdate);
    }
    // Propager les erreurs critiques d'auth
    if (['AUTH_FAILED', 'ACCESS_DISALLOWED', 'API_KEY_MISSING'].includes(error.message)) {
      throw error;
    }
    
    return {
      ...row,
      status: 'error',
      error_message: error.message.substring(0, 40)
    };
  }
}
