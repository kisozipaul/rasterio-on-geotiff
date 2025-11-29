// -----------------------------------------------------------------------------
// NDVI time series over maize-growing areas
// (UBOS maize zones a∩d MODIS cropland/cropland–mosaic)
// -----------------------------------------------------------------------------

// 1. Region and time window
// Adjust region + dates to match your study design
var region = ee.Geometry.Rectangle([31.5000, 1.3000, 32.0000, 2.3000]);

var startDate = '2018-03-01';
var endDate   = '2018-06-30';

// -----------------------------------------------------------------------------
// 2. UBOS maize mask + MODIS cropland
// -----------------------------------------------------------------------------

//  UBOS maize asset
var ubosMaize = ee.FeatureCollection('UBOS_maize_zones');

// If layer has multiple crops, filter to maize (edit field name if needed):
// ubosMaize = ubosMaize.filter(ee.Filter.eq('crop', 'Maize'));

// If polygons are year-specific, you can also filter by year:
// ubosMaize = ubosMaize.filter(ee.Filter.eq('year', 2018));

// Rasterize UBOS maize polygons into a boolean mask
var ubosMaizeMask = ee.Image(0).byte()
  .paint({
    featureCollection: ubosMaize,
    color: 1
  })
  .rename('ubos_maize')
  .gt(0);   // boolean

// MODIS land cover for cropland / cropland–natural vegetation mosaic
var landcover = ee.ImageCollection('MODIS/006/MCD12Q1')
  .filterDate('2018-01-01', '2018-12-31')
  .first()
  .select('LC_Type1');

// Class 12 = cropland; 14 = cropland/natural vegetation mosaic
var cropMask = landcover.eq(12).or(landcover.eq(14));

// Final maize mask: MODIS cropland ∩ UBOS maize
var maizeMask = cropMask.and(ubosMaizeMask);

// -----------------------------------------------------------------------------
// 3. MODIS NDVI collection (MOD13Q1)
// -----------------------------------------------------------------------------

var ndviCollectionRaw = ee.ImageCollection('MODIS/006/MOD13Q1')
  .filterBounds(region)
  .filterDate(startDate, endDate);

// Function to scale NDVI and apply maize mask
function scaleAndMaskNDVI(image) {
  return image
    .select('NDVI')
    .divide(10000)          // scale factor for MODIS NDVI
    .updateMask(maizeMask)  // maize-specific mask
    .clip(region)
    .copyProperties(image, ['system:time_start']);
}

// Apply processing
var ndviCollection = ndviCollectionRaw.map(scaleAndMaskNDVI);

// -----------------------------------------------------------------------------
// 4. Build multi-band NDVI image (one band per date)
// -----------------------------------------------------------------------------

var ndviBands = ndviCollection.map(function(image) {
  var dateStr = ee.Date(image.get('system:time_start')).format('YYYY_MM_dd');
  return image.rename(dateStr);
});

var ndviMultiBandImage = ee.ImageCollection(ndviBands).toBands();

print('NDVI multi-band image (maize-only):', ndviMultiBandImage);

// -----------------------------------------------------------------------------
// 5. Map visualisation
// -----------------------------------------------------------------------------

Map.centerObject(region, 8);

// Show an example band (adjust index if needed)
Map.addLayer(
  ndviMultiBandImage.select(0),
  {min: 0, max: 1, palette: ['red', 'yellow', 'green']},
  'NDVI (maize, example date)'
);

// Region outline
Map.addLayer(region, {color: 'blue'}, 'Region', true);

// Optional: visualise masks for sanity-check
Map.addLayer(ubosMaizeMask.clip(region),
  {min: 0, max: 1, palette: ['white', 'cyan']},
  'UBOS Maize Mask');

Map.addLayer(cropMask.clip(region),
  {min: 0, max: 1, palette: ['white', 'brown']},
  'MODIS Cropland+Mosaic');

Map.addLayer(maizeMask.clip(region),
  {min: 0, max: 1, palette: ['white', 'green']},
  'Maize Mask (MODIS ∩ UBOS)');

// -----------------------------------------------------------------------------
// 6. Export multi-band NDVI (maize-only)
// -----------------------------------------------------------------------------

Export.image.toDrive({
  image: ndviMultiBandImage,
  description: 'Region_NDVI_MaizeOnly_Growing_Season_2018',
  folder: 'GEE_Exports',
  region: region,
  scale: 250,          // MOD13Q1 native resolution
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

// -----------------------------------------------------------------------------
// 7. NDVI time series chart (mean over maize in region)
// -----------------------------------------------------------------------------

var chart = ui.Chart.image.series({
  imageCollection: ndviCollection,
  region: region,
  reducer: ee.Reducer.mean(),
  scale: 250
}).setOptions({
  title: 'NDVI Time Series for Maize Areas (MODIS ∩ UBOS)',
  vAxis: {title: 'NDVI'},
  hAxis: {title: 'Date', format: 'MM-yyyy'},
  lineWidth: 1,
  pointSize: 3
});

print(chart);
