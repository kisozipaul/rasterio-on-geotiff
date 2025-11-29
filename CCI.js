// -----------------------------------------------------------------------------
// CCI time series over maize-growing areas (UBOS maize zones)
// -----------------------------------------------------------------------------

// Define a specific region within Uganda (Bounding Box example)
var region = ee.Geometry.Rectangle([31.5000, 1.3000, 32.0000, 2.3000]);

// Define the time range for the growing season (adjust as needed)
var startDate = '2019-03-01';
var endDate   = '2019-06-30';

// -----------------------------------------------------------------------------
// 1. Load UBOS maize zones and build a maize mask
// -----------------------------------------------------------------------------

// UBOS maize asset ID
var ubosMaize = ee.FeatureCollection('UBOS_maize_zones');

// If the layer has multiple crops, filter to maize (adjust field name if needed):
// ubosMaize = ubosMaize.filter(ee.Filter.eq('crop', 'Maize'));

// If UBOS has year-specific polygons, you can also filter by year:
// ubosMaize = ubosMaize.filter(ee.Filter.eq('year', 2019));

// Rasterize UBOS maize polygons into a 0/1 mask
var maizeMask = ee.Image(0).byte()
  .paint({
    featureCollection: ubosMaize,
    color: 1
  })
  .rename('maizeMask')
  .gt(0);   // boolean mask

// -----------------------------------------------------------------------------
// 2. Import the Sentinel-2 dataset
// -----------------------------------------------------------------------------

var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(region)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// -----------------------------------------------------------------------------
// 3. Function to calculate CCI
// -----------------------------------------------------------------------------

function calculateCCI(image) {
  var nir     = image.select('B8');
  var red     = image.select('B4');
  var redEdge = image.select('B5');
  
  var cci = nir.subtract(red).divide(nir.subtract(redEdge));
  
  return cci.rename('CCI').copyProperties(image, ['system:time_start']);
}

// Apply CCI calculation and restrict to maize & region
var cciCollection = s2Collection
  .map(calculateCCI)
  .map(function(image) {
    // apply maize mask and clip to region
    return image.updateMask(maizeMask).clip(region);
  });

// -----------------------------------------------------------------------------
// 4. Manually aggregate CCI data over the region (maize-only)
// -----------------------------------------------------------------------------

var cciTimeSeries = cciCollection.map(function(image) {
  var meanCCI = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: 100,         // Adjust the scale as needed
    bestEffort: true,
    maxPixels: 1e8
  }).get('CCI');
  
  return ee.Feature(null, {
    'system:time_start': image.get('system:time_start'),
    'CCI': meanCCI
  });
});

// Convert the results to a feature collection
var cciFeatureCollection = ee.FeatureCollection(cciTimeSeries);

// -----------------------------------------------------------------------------
// 5. Create a time series chart
// -----------------------------------------------------------------------------

var chart = ui.Chart.feature.byFeature(
    cciFeatureCollection, 'system:time_start', 'CCI')
  .setOptions({
    title: 'CCI Time Series for Maize Areas in Region',
    vAxis: {title: 'CCI'},
    hAxis: {title: 'Date', format: 'MM-yyyy'},
    lineWidth: 1,
    pointSize: 3
  });

// Display the chart
print(chart);

// -----------------------------------------------------------------------------
// 6. Map visualisation
// -----------------------------------------------------------------------------

Map.centerObject(region, 8); // Adjust zoom level as needed
Map.addLayer(region, {color: 'red'}, 'Region', true);

// Visualise UBOS maize mask to sanity-check
Map.addLayer(maizeMask.clip(region),
  {min: 0, max: 1, palette: ['white', 'green']},
  'UBOS Maize Mask');
