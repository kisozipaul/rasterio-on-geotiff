// -----------------------------------------------------------------------------
// LAI time series over maize-growing areas (UBOS maize zones ∩ MODIS cropland)
// -----------------------------------------------------------------------------

// Define a specific region within Uganda (Bounding Box example)
var region = ee.Geometry.Rectangle([31.5000, 1.3000, 32.0000, 2.3000]);

// Define the time range for the growing season (adjust as needed)
var startDate = '2018-09-01';
var endDate   = '2018-12-15';

// -----------------------------------------------------------------------------
// 1. UBOS maize mask + MODIS cropland mask
// -----------------------------------------------------------------------------

//  UBOS maize asset ID
var ubosMaize = ee.FeatureCollection('UBOS_maize_zones');

// If the layer has multiple crops, filter to maize (if needed):
// ubosMaize = ubosMaize.filter(ee.Filter.eq('crop', 'Maize'));

// If UBOS is year-specific, you can filter by year as well:
// ubosMaize = ubosMaize.filter(ee.Filter.eq('year', 2018));

// Rasterize UBOS maize polygons into a 0/1 mask
var ubosMaizeMask = ee.Image(0).byte()
  .paint({
    featureCollection: ubosMaize,
    color: 1
  })
  .rename('ubos_maize')
  .gt(0); // boolean

// MODIS land cover for cropland / cropland–natural vegetation mosaic
var landcover = ee.ImageCollection('MODIS/006/MCD12Q1')
  .filterDate('2018-01-01', '2018-12-31')
  .first()
  .select('LC_Type1');

// Class 12 = croplands; 14 = cropland/natural vegetation mosaic
var cropMask = landcover.eq(12).or(landcover.eq(14));

// Final maize mask: MODIS cropland ∩ UBOS maize zones
var maizeMask = cropMask.and(ubosMaizeMask);

// -----------------------------------------------------------------------------
// 2. Import the MODIS LAI dataset
// -----------------------------------------------------------------------------

var laiCollection = ee.ImageCollection('MODIS/006/MOD15A2H')
  .select('Lai_500m')
  .filterBounds(region)
  .filterDate(startDate, endDate);

// Print the number of images
print('Number of images in LAI collection for specified date range:', laiCollection.size());

// -----------------------------------------------------------------------------
// 3. Scale LAI, apply maize mask, and clip to region
// -----------------------------------------------------------------------------

function scaleLAI(image) {
  return image
    .multiply(0.1)          // LAI scale factor
    .updateMask(maizeMask)  // maize-specific mask
    .clip(region)
    .copyProperties(image, ['system:time_start']);
}

// Apply scaling to LAI collection
var scaledLAICollection = laiCollection.map(scaleLAI);

// -----------------------------------------------------------------------------
// 4. Build multi-band LAI image (one band per date)
// -----------------------------------------------------------------------------

var laiBands = scaledLAICollection.map(function(image) {
  var dateStr = ee.Date(image.get('system:time_start')).format('YYYY_MM_dd');
  return image.rename(dateStr);
});

// Combine all images into a multi-band image
var laiMultiBandImage = ee.ImageCollection(laiBands).toBands();

print('LAI Multi-band Image:', laiMultiBandImage);

// -----------------------------------------------------------------------------
// 5. Map visualisation
// -----------------------------------------------------------------------------

Map.centerObject(region, 8); // Adjust zoom level as needed

// Display an arbitrary band (e.g. 5th band) – adjust index as needed
Map.addLayer(
  laiMultiBandImage.select(4),
  {
    min: 0,
    max: 7,
    palette: [
      '#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163',
      '#99B718', '#74A901', '#66A000', '#529400', '#3E8601',
      '#207401', '#056201', '#004C00', '#023B01', '#012E01',
      '#011D01', '#011301'
    ]
  },
  'LAI (maize, example date)'
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
// 6. Export multi-band LAI image (maize-only)
// -----------------------------------------------------------------------------

Export.image.toDrive({
  image: laiMultiBandImage,
  description: 'Region_LAI_MaizeOnly_Growing_Season_2018',
  folder: 'GEE_Exports',
  region: region,
  scale: 500,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

// -----------------------------------------------------------------------------
// 7. LAI time series chart (mean over maize in region)
// -----------------------------------------------------------------------------

var chart = ui.Chart.image.series({
  imageCollection: scaledLAICollection,
  region: region,
  reducer: ee.Reducer.mean(),
  scale: 500
}).setOptions({
  title: 'LAI Time Series for Maize Areas (MODIS ∩ UBOS)',
  vAxis: {title: 'LAI'},
  hAxis: {title: 'Date', format: 'MM-yyyy'},
  lineWidth: 1,
  pointSize: 3
});

print(chart);
