/**
 * Shared map styles for MapLibre GL
 *
 * OSM_STYLE: Standard OpenStreetMap (Mapnik) tiles.
 * Contains full street names, colony/area names, landmarks (hospitals, schools,
 * metro stations, markets, temples), and house/building details with high contrast.
 */

export const OSM_STYLE = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const DARK_MATTER_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default OSM_STYLE;
