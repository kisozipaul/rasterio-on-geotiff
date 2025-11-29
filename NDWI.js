// -----------------------------------------------------------------------------
// NDWI time series over maize-growing areas (UBOS maize zones + GFSAD cropland)
// -----------------------------------------------------------------------------

// Define the region of interest (ROI)
var roi = ee.Geometry.Rectangle([32.2500, 0.0000, 33.2500, 1.0000]);

// Define the growing season date range
var startDate = '2023-06-01';
var endDate   = '2023-08-31';

// -----------------------------------------------------------------------------
// 1. Load UBOS maize zones and create a mask
// -----------------------------------------------------------------------------

// UBOS Maize Asset
var ubosMaize = ee.FeatureCollection('UBOS_maize_zones');

// If the shapefile has multiple crops, filter to maize (adjust field name as needed):
// ubosMaize = ubosMaize.filter(ee.Filter.eq('crop', 'Maize'));

// Rasterize UBOS maize polygons into a 0/1 mask image
var ubosMaizeMask = ee.Image(0).byte()
  .paint({
    featureCollection: ubosMaize,
    color: 1
  })
  .rename('ubos_maize');

// Convert to boolean
ubosMaizeMask = ubosMaizeMask.gt(0);

// -----------------------------------------------------------------------------
// 2. Load the Landsat 8 collection
// -----------------------------------------------------------------------------

var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(roi)
  .filterDate(startDate, endDate);

// -----------------------------------------------------------------------------
// 3. Load the cropland mask (GFSAD)
// -----------------------------------------------------------------------------

var cropland = ee.Image('USGS/GFSAD1000_V1')
  .select('landcover')
  .eq(2); // class 2 = cropland

// Combine GFSAD cropland with UBOS maize polygons
// → pixels must be both cropland AND inside UBOS maize zones
var maizeMask = cropland.and(ubosMaizeMask);

// -----------------------------------------------------------------------------
// 4. Function to calculate NDWI and mask to maize
// -----------------------------------------------------------------------------

function calculateNDWI(image) {
  // Landsat 8 NDWI = (Green - NIR) / (Green + NIR)
  var ndwi = image.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');
  return image.addBands(ndwi);
}

var ndwiCollection = l8.map(calculateNDWI);

// Mask non-maize areas
function maskNonMaize(image) {
  return image.updateMask(maizeMask);
}

var maskedNDWI = ndwiCollection.map(maskNonMaize);

// -----------------------------------------------------------------------------
// 5. Get mean NDWI per image (time series) over ROI
// -----------------------------------------------------------------------------

var getMeanNDWI = function(image) {
  var mean = image.select('NDWI').reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: roi,
    scale: 100,
    maxPixels: 1e9
  });
  return ee.Feature(null, {
    'mean_ndwi': mean.get('NDWI'),
    'date': image.date().format('YYYY-MM-dd')
  });
};

var ndwiTimeseries = maskedNDWI.map(getMeanNDWI);

// -----------------------------------------------------------------------------
// 6. Time series chart
// -----------------------------------------------------------------------------

var chart = ui.Chart.feature.byFeature({
  features: ndwiTimeseries,
  xProperty: 'date',
  yProperties: ['mean_ndwi']
})
.setChartType('ScatterChart')
.setOptions({
  title: 'NDWI Time Series for Maize Areas (UBOS ∩ GFSAD)',
  hAxis: {title: 'Date', titleTextStyle: {italic: false, bold: true}},
  vAxis: {title: 'Mean NDWI', titleTextStyle: {italic: false, bold: true}},
  pointSize: 4,
  lineWidth: 1
});

print(chart);

// -----------------------------------------------------------------------------
// 7. Mean NDWI image for entire growing season (maize only)
// -----------------------------------------------------------------------------

var seasonNDWI = maskedNDWI.select('NDWI').mean();

var visParams = {min: -1, max: 1, palette: ['red', 'yellow', 'green', 'blue']};

Map.centerObject(roi, 8);
Map.addLayer(seasonNDWI, visParams, 'Growing Season NDWI (Maize only)');

// ROI
Map.addLayer(roi, {color: 'FF0000'}, 'Region of Interest');

// Visualise masks for sanity-check
Map.addLayer(cropland.clip(roi), {palette: ['white', 'brown']}, 'GFSAD Cropland');
Map.addLayer(ubosMaizeMask.clip(roi), {palette: ['white', 'blue']}, 'UBOS Maize Mask');
Map.addLayer(maizeMask.clip(roi), {palette: ['white', 'green']}, 'Maize Mask (GFSAD ∩ UBOS)');

// -----------------------------------------------------------------------------
// 8. Legend (unchanged)
// -----------------------------------------------------------------------------

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'NDWI Legend',
  style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
});
legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

var palette = ['red', 'yellow', 'green', 'blue'];
var names = ['Low NDWI', 'Medium-Low NDWI', 'Medium-High NDWI', 'High NDWI'];
for (var i = 0; i < 4; i++) {
  legend.add(makeRow(palette[i], names[i]));
}

Map.add(legend);

// -----------------------------------------------------------------------------
// 9. Exports
// -----------------------------------------------------------------------------

// Export the NDWI image for the growing season (maize only)
Export.image.toDrive({
  image: seasonNDWI,
  description: 'Growing_Season_NDWI_MaizeOnly',
  scale: 30,
  region: roi,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e9
});

// Export the NDWI time series data
Export.table.toDrive({
  collection: ndwiTimeseries,
  description: 'NDWI_Time_Series_MaizeOnly',
  fileFormat: 'CSV'
});
