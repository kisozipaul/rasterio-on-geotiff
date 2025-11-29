// -----------------------------------------------------------------------------
// EVI time series over maize-growing areas (UBOS maize zones + MODIS cropland)
// -----------------------------------------------------------------------------

// Define the area of interest
var aoi = ee.Geometry.Rectangle([33.2500, 1.2500, 33.7500, 1.7500]);
// Buffer (note: 100 m, despite the comment saying 10 km)
var aoiBuffer = aoi.buffer(100);

// Define the analysis period
var startDate = '2018-04-01';
var endDate   = '2020-12-15';

// -----------------------------------------------------------------------------
// 1. Load UBOS maize zones and create a mask
// -----------------------------------------------------------------------------

// UBOS maize Asset
var ubosMaize = ee.FeatureCollection('UBOS_maize_zones');

// If the layer has multiple crops, uncomment and adjust:
// ubosMaize = ubosMaize.filter(ee.Filter.eq('crop', 'Maize'));

// Rasterize UBOS maize polygons into a 0/1 mask image
var ubosMaizeMask = ee.Image(0).byte()
  .paint({
    featureCollection: ubosMaize,
    color: 1
  })
  .rename('ubos_maize');

// We’ll threshold it to create a boolean mask
ubosMaizeMask = ubosMaizeMask.gt(0);

// -----------------------------------------------------------------------------
// 2. MODIS land cover: cropland + cropland/natural mosaic
// -----------------------------------------------------------------------------

var landcover = ee.ImageCollection('MODIS/006/MCD12Q1')
  .filter(ee.Filter.date('2020-01-01', '2020-12-31'))  // Using 2020 LC as reference
  .first()
  .select('LC_Type1');

// Class 12 = croplands, 14 = cropland/natural vegetation mosaic
var cropMask = landcover.eq(12).or(landcover.eq(14));

// Combine MODIS cropland/mosaic with UBOS maize polygons:
// keep pixels that are both cropland/mosaic AND inside UBOS maize zones
var maizeMask = cropMask.and(ubosMaizeMask);

// -----------------------------------------------------------------------------
// 3. Load MODIS EVI and apply maize mask
// -----------------------------------------------------------------------------

var modis = ee.ImageCollection('MODIS/006/MOD13Q1')
  .filterDate(startDate, endDate)
  .filterBounds(aoiBuffer);

// Function to extract EVI and apply maize mask
var getEVI = function(image) {
  return image.select('EVI')
    .divide(10000)        // scale factor
    .updateMask(maizeMask) // <--- IMPORTANT: maize-specific mask
    .copyProperties(image, ['system:time_start']);
};

// Map the function over the image collection
var eviCollection = modis.map(getEVI);

// Sort the collection by date
var sortedCollection = eviCollection.sort('system:time_start');

// -----------------------------------------------------------------------------
// 4. Convert ImageCollection → multi-band Image
// -----------------------------------------------------------------------------

var eviImage = sortedCollection.toBands();

// Rename bands using days since startDate
var bandNames = sortedCollection.aggregate_array('system:time_start')
  .map(function(date) {
    return ee.Date(date)
      .difference(ee.Date(startDate), 'days')
      .format('EVI_day_%d');
  });

var eviImageRenamed = eviImage.rename(bandNames);

// -----------------------------------------------------------------------------
// 5. Visualisation
// -----------------------------------------------------------------------------

Map.centerObject(aoi, 8);

// First EVI layer (maize-specific)
Map.addLayer(
  eviImageRenamed.select(0).clip(aoiBuffer),
  {
    min: 0,
    max: 1,
    palette: [
      'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
      '66A000', '529400', '3E8601', '207401', '056201', '004C00',
      '023B01', '012E01', '011D01', '011301'
    ]
  },
  'First EVI (Maize only)'
);

// AOI
Map.addLayer(aoiBuffer, {color: 'FF0000'}, 'Area of Interest');

// Cropland+mosaic mask
Map.addLayer(cropMask.clip(aoiBuffer), {palette: ['white', 'brown']}, 'Cropland+Mosaic Mask');

// UBOS maize mask (for visual comparison)
Map.addLayer(ubosMaizeMask.clip(aoiBuffer), {palette: ['white', 'blue']}, 'UBOS Maize Mask');

// Maize mask (intersection)
Map.addLayer(maizeMask.clip(aoiBuffer), {palette: ['white', 'green']}, 'Maize Mask (MODIS ∩ UBOS)');

// -----------------------------------------------------------------------------
// 6. Export
// -----------------------------------------------------------------------------

Export.image.toDrive({
  image: eviImageRenamed,
  description: 'MODIS_EVI_TimeSeries_MaizeOnly_2018_2020',
  folder: 'EVI_Data',
  scale: 250,
  region: aoiBuffer,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e9
});

// -----------------------------------------------------------------------------
// 7. Time series chart (mean EVI over maize within AOI)
// -----------------------------------------------------------------------------

var chart = ui.Chart.image.series({
  imageCollection: sortedCollection,
  region: aoiBuffer,
  reducer: ee.Reducer.mean(),
  scale: 250
}).setOptions({
  title: 'EVI Time Series for Maize (UBOS + MODIS cropland)',
  vAxis: {title: 'EVI'},
  hAxis: {title: 'Date', format: 'MM-dd-yyyy'},
  lineWidth: 1,
  pointSize: 4,
  series: {0: {color: '2ca25f'}}
});

print(chart);

// -----------------------------------------------------------------------------
// 8. Optional: add date stamps to images
// -----------------------------------------------------------------------------

var addDateStamp = function(image) {
  var date = ee.Date(image.get('system:time_start'));
  var dateString = date.format('yyyy-MM-dd');
  return image.set('date_string', dateString);
};

var eviCollectionWithDates = sortedCollection.map(addDateStamp);
var eviList = eviCollectionWithDates.toList(eviCollectionWithDates.size());

print('EVI Images with Dates:', eviList);
