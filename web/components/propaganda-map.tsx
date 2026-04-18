'use client';

import { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = '/data/world-110m.json';

type MapStatus = {
  isActive: boolean;
  isScraping: boolean;
  activeCountry: string | null;
  processedCountries: string[];
};

export function PropagandaMap() {
  const [status, setStatus] = useState<MapStatus>({
    isActive: false,
    isScraping: false,
    activeCountry: null,
    processedCountries: [],
  });

  useEffect(() => {
    const poll = () =>
      fetch('/api/map-status')
        .then((r) => r.json() as Promise<MapStatus>)
        .then(setStatus)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  function getFill(geoId: string): string {
    if (status.activeCountry === geoId) return '#22c55e';
    if (status.processedCountries.includes(geoId)) return '#14532d';
    return 'transparent';
  }

  function isActive(geoId: string): boolean {
    return status.activeCountry === geoId;
  }

  return (
    <ComposableMap
      projection="geoNaturalEarth1"
      projectionConfig={{ scale: 185 }}
      style={{ width: '100%', height: 'auto', background: 'transparent' }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter((geo) => geo.id !== '010')
            .map((geo) => {
            const id = String(geo.id);
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={getFill(id)}
                stroke="#22c55e"
                strokeWidth={0.4}
                style={{
                  default: {
                    outline: 'none',
                    animation: isActive(id) ? 'flash-country 0.8s ease-in-out infinite' : 'none',
                  },
                  hover: { outline: 'none' },
                  pressed: { outline: 'none' },
                }}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
