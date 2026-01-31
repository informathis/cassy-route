
import { HGVParams } from '../types';

/**
 * Récupère la clé API depuis l'environnement.
 * Note: La clé fournie est un jeton JWT, elle doit être transmise dans le header Authorization.
 */
const getApiKey = () => {
  try {
    // @ts-ignore
    return typeof process !== 'undefined' ? (process.env.API_KEY || "") : "";
  } catch (e) {
    return "";
  }
};

/**
 * fetchORS gère les appels vers OpenRouteService via un proxy CORS.
 */
async function fetchORS(endpoint: string, method: string, body: any) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  // Utilisation de l'URL complète comme demandé dans les exemples curl
  const targetUrl = `https://api.openrouteservice.org${endpoint}`;
  
  // Utilisation de corsproxy.io qui est généralement fiable pour les headers personnalisés
  const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  
  try {
    const response = await fetch(proxiedUrl, {
      method,
      headers: {
        'Authorization': apiKey.trim(),
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('QUOTA_EXCEEDED');
      if (response.status === 403) {
        const errorDetail = await response.text();
        console.error('Détail Erreur 403 ORS:', errorDetail);
        throw new Error('ACCESS_DISALLOWED');
      }
      if (response.status === 401) throw new Error('AUTH_FAILED');
      
      let errorMsg = `Erreur API ${response.status}`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.error?.message || errJson.message || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    return response.json();
  } catch (error: any) {
    const msg = error.message || "Erreur réseau";
    if (['QUOTA_EXCEEDED', 'AUTH_FAILED', 'ACCESS_DISALLOWED', 'API_KEY_MISSING'].includes(msg)) {
      throw error;
    }
    throw new Error(`Erreur technique : ${msg}`);
  }
}

export const orsProxy = {
  /**
   * Utilise l'endpoint de recherche Pelias d'ORS
   */
  async geocode(text: string, focusPoint: { lat: number, lon: number }) {
    const params = new URLSearchParams({
      text,
      'boundary.country': 'FRA',
      'focus.point.lat': focusPoint.lat.toString(),
      'focus.point.lon': focusPoint.lon.toString(),
      'size': '1'
    });
    
    return fetchORS(`/geocode/search?${params.toString()}`, 'GET', null);
  },

  /**
   * Utilise l'endpoint /v2/directions/driving-hgv/geojson comme suggéré
   */
  async getRoute(origin: [number, number], destination: [number, number], params: HGVParams) {
    const body = {
      coordinates: [origin, destination],
      instructions: false,
      preference: "fastest",
      options: {
        avoid_borders: "all",
        vehicle_type: "hgv",
        profile_params: {
          restrictions: {
            weight: params.weight,
            height: params.height,
            width: params.width,
            length: params.length,
            axleload: params.axleLoad,
            hazmat: params.hazmat
          }
        }
      }
    };

    return fetchORS('/v2/directions/driving-hgv/geojson', 'POST', body);
  }
};
