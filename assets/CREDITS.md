# Third-party assets

All models here are **CC0 (public domain)**. No attribution is required; it is given anyway.

| Folder | Source | Kit |
|---|---|---|
| `peds/` | [Quaternius](https://quaternius.com) (via [Poly Pizza](https://poly.pizza)) | Animated Men + Animated Women — rigged humans, frozen mid-walk at load |
| `cars/` | [Quaternius](https://quaternius.com) (via [Poly Pizza](https://poly.pizza)) | Cars Bundle — sedan, SUV, taxi, sports, police |
| `trees/` | [Kenney](https://kenney.nl) | Nature Kit |
| `houses/` | [Kenney](https://kenney.nl) | City Kit (Suburban) |

`../Main-Character/` and `../cedar-tree/` are the project's own authored models.

## Geographic source data

- Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). Natural Resources Canada CanElevation HRDEM Mosaic 1 m DTM/DSM, tile `1_3-mosaic-1m`; bilinearly resampled to a 2 m local grid. Source URLs, coordinate system and vertical datum are recorded in `data/terrain-dtm.json` and `data/canopy.json`. Canopy peaks are estimates, not a species inventory.
- Contains information licenced under the [Open Government Licence – Nanaimo](https://www.nanaimo.ca/your-government/maps-data/open-data-catalogue/open-data-catalogue-licence). City of Nanaimo Building Footprint layer; nearby unnamed footprints and available height/floor-count fields. Missing heights remain estimates. Source and derivation are recorded in `data/city-buildings.json`. No endorsement by either information provider is implied.
