//------------------------->Start Processing<-----------------------
var startYear = '2019-03-01';
var endYear = '2021-03-01';

//Set Geometry Shapefile Path
var shapeFile = ee.FeatureCollection(nomeUsers + SelectedShapefile);
var AOI = ee.FeatureCollection(shapeFile);

//Set featureSize
var featureSize = ee.Number(AOI.size());
var featureSize = featureSize.getInfo();

//Print Preliminary Info
print('Regione: ' + regione);
print('Anno: ' + year);
print('Eventi Considerati: ' + featureSize);

//addCorineLandCover2020_10m

//var dataset = ee.FeatureCollection("FAO/GAUL/2015/level0")
    //.filter(ee.Filter.eq('ADM0_NAME', 'Italy'));

var CLC = ee.ImageCollection("ESA/WorldCover/v100").first();

var visualization = {
  bands: ['Map'],
};


var gaul = ee.FeatureCollection("FAO/GAUL/2015/level1");

var lazio = gaul.filter(ee.Filter.eq('ADM1_CODE', 1622));
var calabria = gaul.filter(ee.Filter.eq('ADM1_CODE', 1618));
var basilicata = gaul.filter(ee.Filter.eq('ADM1_CODE', 1617));
var campania = gaul.filter(ee.Filter.eq('ADM1_CODE', 1619));

var emptyLaz = ee.Image().byte();
var emptyCal = ee.Image().byte();
var emptyCamp = ee.Image().byte();
var emptyBas = ee.Image().byte();

var outlineLaz = emptyLaz.paint({
  featureCollection: lazio,
  color: 1,
  width: 1.5
});
var outlineCal = emptyCal.paint({
  featureCollection: calabria,
  color: 1,
  width: 1.5
});
var outlineCamp = emptyCamp.paint({
  featureCollection: campania,
  color: 1,
  width: 1.5
});
var outlineBas = emptyBas.paint({
  featureCollection: basilicata,
  color: 1,
  width: 1.5
});

//==added Layers
//Map.centerObject(calabria, 6);

//Map.addLayer(CLC.clip(campania), visualization, "Campania Landcover");
//Map.addLayer(CLC.clip(basilicata), visualization, "Basilicata Landcover");
//Map.addLayer(CLC.clip(lazio), visualization, "Lazio Landcover");
//Map.addLayer(CLC.clip(calabria), visualization, "Calabria Landcover");
//Map.addLayer(outlineCamp, {}, 'Campania');
//Map.addLayer(outlineCal, {}, 'Calabria');
//Map.addLayer(outlineLaz, {}, 'Lazio');
//Map.addLayer(outlineBas, {}, 'Basilicata');

//=========================================================
//Add featureCollection shapefiles on Map;

var emptyAll = ee.Image().byte();

var outlineAll = emptyAll.paint({
  featureCollection: AOI,
  color: 1,
  width: 2,
  });

//Map.addLayer(AOI.draw({color: 'ff0000', strokeWidth: 1}), {}, 'All fire events');

Map.centerObject(AOI, 8);

//=========================================================
//================ VARIABILI e FUNZIONI  ==================

// This field contains UNIX time in milliseconds.
var timeField = 'system:time_start';

//CloudMasking
function maskS2sr(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  var snowProb = image.select('MSK_SNWPRB');
  var cloud = cloudProb.lt(10);
  var scl = image.select('SCL');
  var shadow = scl.eq(3); // 3 = cloud shadow
  var cirrus = scl.eq(10); // 10 = cirrus
  // Cloud probability less than 10% or cloud shadow classification
  var mask = cloud.and(cirrus.neq(1)).and(shadow.neq(1));
  return image.updateMask(mask)
      .copyProperties(image, ["system:time_start"]);
}
// Use this function to add variables for NDVI, time and a constant
// to Sentinel 2 imagery.
var addVariables = function(image) {
  // Compute time in fractional years since the epoch.
  var date = ee.Date(image.get('system:time_start'));
  var years = date.difference(ee.Date('2016-01-01'), 'year');
  // Return the image with the added bands.
  return image
    // Add an NDVI band.
    .addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI')).float()
    // Add an NBR band.
    .addBands(image.normalizedDifference(['B8', 'B12']).rename('NBR')).float()
    // Add an EVI band.
    .addBands(image.expression(
    '2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))', {
      'B8': image.select("B8"),
      'B4': image.select("B4"),
      'B2': image.select("B2")}).rename('EVI').float())
    // Add a time
    .addBands(ee.Image(years).rename('t').float())
    // Add a constant band.
    .addBands(ee.Image.constant(1));
};


//-->create a Time band
// Adds a band containing image date as years since 2000.
function createTimeBand(img) {
  var year = ee.Date(img.get('system:time_start')).get('year').subtract(2015);
  return ee.Image(year).byte().addBands(img);
}


//=========================================================
//==================  START PROCESSING  ===================
//=========================================================
//add Variables useful to the For cycle and start the cycle

var Ar;
for (Ar = 2; Ar <= (featureSize); Ar++) { //featureSize

var ID = Ar;

var shapeFile = AOI.filter(ee.Filter.eq("IDrel", Ar));


var shapeFileImg = shapeFile.reduceToImage({
    properties: ['IDrel'],
    reducer: ee.Reducer.first()
});

var vectorsCbOutline = shapeFileImg.toInt().addBands(shapeFileImg).reduceToVectors({
  geometry: shapeFile,
  crs: shapeFileImg.projection(),
  scale: 10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'zone',
  reducer: ee.Reducer.mean()
});

var empty = ee.Image().byte();

var outlineIdCb = empty.paint({
  featureCollection: vectorsCbOutline,
  color: 1,
  width: 1.5
});

//Set Satellite Collection
//S2 IMAGECOLLECTION
var collectionS2 =  ee.ImageCollection("COPERNICUS/S2_SR") //search all images in the collection
    //.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20)) //filter on cloudy
    .filterBounds(shapeFile);//filter by region (geometry)

// Remove clouds, add variables and filter to the area of interest.
var filteredS2 = collectionS2
  .filterBounds(shapeFile)
  .map(maskS2sr)
  .map(addVariables);

// assuming you have the start and end date
var startDate = ee.Date(startYear);
var endDate = ee.Date(endYear);
// this is the window size in months
var window = 12;
// just calculating number of windows so that i can map over it
// i could go for iterate with a break condition but i prefer map
// as i can compute parallelly
var numberOfWindows = endDate.difference(startDate,'month').divide(window).toInt();
// generating a sequence that can be used as an indicator for my window step
var sequence = ee.List.sequence(0, numberOfWindows); // inclusive series so the number of windows will be correct

// mapping over the sequence
sequence = sequence.map(function(num){
  // just casting element of sequence to a number object
  num = ee.Number(num);
  // finding the start and end point of my windows
  var windowStart = startDate.advance(num.multiply(window), 'month');
  var windowEnd = startDate.advance(num.add(1).multiply(window), 'month');
  // selecting images that fall within those windows
  var subset = filteredS2.select('NDVI').filterDate(windowStart,windowEnd);
  // calculating the mean ndvi of that window
  return subset.max().set('system:time_start',windowStart);
});

// converting list of mean images to imagecollection
var composites = ee.ImageCollection.fromImages(sequence);

// calculating the max image
var max = composites.median();

///-------->inizio trend

var collection = composites.select('NDVI').map(createTimeBand);


var collectionLinearFit = collection.reduce(ee.Reducer.linearFit()).clip(shapeFile);
var collectionMinMaxLFSlope = collectionLinearFit.reduceRegion(ee.Reducer.minMax(), shapeFile, 10);
var collectionstdDevLFSlope = collectionLinearFit.reduceRegion(ee.Reducer.stdDev(), shapeFile, 10);
var collectionstdDevLFSlope = collectionLinearFit.reduceRegion(ee.Reducer.mean(), shapeFile, 10);

//print(collectionMinMaxLFSlope, 'MinMax');

var minSlope = collectionMinMaxLFSlope.get('scale_min');
var minSlopeN = minSlope.getInfo();
var maxSlope = collectionMinMaxLFSlope.get('scale_max');
var maxSlopeN = maxSlope.getInfo();
var maxOffset = collectionMinMaxLFSlope.get('offset_max');
var maxOffsetN = maxOffset.getInfo();

//===========================MAP add Layers==================================
// Compute a linear fit over the series of values at each pixel, visualizing
// the y-intercept in green, and positive/negative slopes as red/blue.

var visTrend = {min: 0, max: [minSlopeN, maxOffsetN, maxSlopeN], bands: ['scale', 'offset', 'scale']};

Map.addLayer(
    collectionLinearFit,
    visTrend,
    'NDVI trend' + ' ' + year + ': ' + ID);


//SHAPEFILE
//Map.addLayer(collection.reduce(ee.Reducer.linearFit()).select('scale').clip(shapeFile), {}, 'NDVI SLope ' + regione + ' ' + year + ': ' + ID);

//IMAGES
Map.addLayer(outlineIdCb, {palette: 'red'}, 'Outline Shapefile: '+ ID);


//==============================Chart Pixel Stats============================
// Define the chart and print it to the console MEANVALUE
/*
// Make a list of Features.
var ROI = [
  ee.Feature(Change_1, {name: 'Change_1'}),
  ee.Feature(Change2, {name: 'Change_2'}),
  ee.Feature(NoChange, {name: 'Stable'})
];

// Create a FeatureCollection from the list and print it.
var fromList = ee.FeatureCollection(ROI);

var chartMeanValue =
    ui.Chart.image
        .byRegion({
          image: collectionLinearFit,
          regions: fromList,
          reducer: ee.Reducer.mean(),
          scale: 10,
          xProperty: 'name'
        })
        .setChartType('ColumnChart')
        .setOptions({
          title: 'Signal MeanValue ' + regione + '_' + year + '_' + ID,
          hAxis:
              {title: 'Bands', titleTextStyle: {italic: false, bold: true}},
          vAxis: {
            title: 'Value',
            titleTextStyle: {italic: false, bold: true}
          },
          colors: ['07a0ff', 'ed1010']
        });
print(chartMeanValue);



//STDEV VALUE

var chartStDev =
    ui.Chart.image
        .byRegion({
          image: collectionLinearFit,
          regions: fromList,
          reducer: ee.Reducer.stdDev(),
          scale: 10,
          xProperty: 'name'
        })
        .setChartType('ColumnChart')
        .setOptions({
          title: 'Signal StDev ' + regione + '_' + year + '_' + ID,
          hAxis:
              {title: 'Bands', titleTextStyle: {italic: false, bold: true}},
          vAxis: {
            title: 'Value',
            titleTextStyle: {italic: false, bold: true}
          },
          colors: ['07a0ff', 'ed1010']
        });
print(chartStDev);

//MinMAX

var chartMinMax =
    ui.Chart.image
        .byRegion({
          image: collectionLinearFit,
          regions: fromList,
          reducer: ee.Reducer.minMax(),
          scale: 10,
          xProperty: 'name'
        })
        .setChartType('ColumnChart')
        .setOptions({
          title: 'Signal minMax ' + regione + '_' + year + '_' + ID,
          hAxis:
              {title: 'Bands', titleTextStyle: {italic: false, bold: true}},
          vAxis: {
            title: 'Value',
            titleTextStyle: {italic: false, bold: true}
          },
          colors: ['07a0ff', 'ed1010', '77ef7d', 'e2f418']
        });
print(chartMinMax);
*/

/*
//**************************************************************************
// Feature Importance
//**************************************************************************

// Run .explain() to see what the classifer looks like
print(classifier.explain())

// Calculate variable importance
var importance = ee.Dictionary(classifier.explain().get('importance'))

// Calculate relative importance
var sum = importance.values().reduce(ee.Reducer.sum())

var relativeImportance = importance.map(function(key, val) {
   return (ee.Number(val).multiply(100)).divide(sum)
  })
print(relativeImportance)

// Create a FeatureCollection so we can chart it
var importanceFc = ee.FeatureCollection([
  ee.Feature(null, relativeImportance)
])

var chart = ui.Chart.feature.byProperty({
  features: importanceFc
}).setOptions({
      title: 'Feature Importance',
      vAxis: {title: 'Importance'},
      hAxis: {title: 'Feature'}
  })
print(chart)
*/
//**************************************************************************
// Hyperparameter Tuning
//**************************************************************************

var test = composite.sampleRegions({
  collection: validationGcp,
  properties: ['Class'],
  scale: 10,
  tileScale: 16
});


// Tune the numberOfTrees parameter.
var numTreesList = ee.List.sequence(10, 150, 10);

var accuracies = numTreesList.map(function(numTrees) {
  var classifier = ee.Classifier.smileRandomForest(numTrees)
      .train({
        features: training,
        classProperty: 'Class',
        inputProperties: composite.bandNames()
      });

  // Here we are classifying a table instead of an image
  // Classifiers work on both images and tables
  return test
    .classify(classifier)
    .errorMatrix('Class', 'classification')
    .accuracy();
});


var chart = ui.Chart.array.values({
  array: ee.Array(accuracies),
  axis: 0,
  xLabels: numTreesList
  }).setOptions({
      title: 'Hyperparameter Tuning for the numberOfTrees Parameters',
      vAxis: {title: 'Validation Accuracy'},
      hAxis: {title: 'Number of Tress', gridlines: {count: 15}}
  });
print(chart)



//============================================================================
//============================================================================
//============================================================================
var RFRegression = RFcollection;
var predictionBandsRFRegression = ['scale', 'offset'];
var TrainingRFRegression = RFRegression.select(predictionBandsRFRegression).float();
var classifierTraining_RFRegression = TrainingRFRegression.select(predictionBandsRFRegression).sampleRegions({collection: samplesRFRegression, properties: ['Class'], scale: 20 });

var classifierTraining_RFRegression = classifierTraining_RFRegression;

var withRandomRFRegression = classifierTraining_RFRegression.randomColumn('random');

var split = 0.6;  // Roughly 60% training, 40% testing.
var trainingPartitionRFRegression = withRandomRFRegression.filter(ee.Filter.lt('random', split));
var testingPartitionRFRegression = withRandomRFRegression.filter(ee.Filter.gte('random', split));

//Select best-Trees-number using Hyperparameter Tuning
var RFregressionClassifier = ee.Classifier.smileRandomForest(90).train({features:trainingPartitionRFRegression, classProperty:'Class', inputProperties: predictionBandsRFRegression});

print('RFregressionClassifier train error matrix: ', RFregressionClassifier.confusionMatrix());
print('RFregressionClassifier train accuracy: ', RFregressionClassifier.confusionMatrix().accuracy());
print('RFregressionClassifier train Kappa: ', RFregressionClassifier.confusionMatrix().kappa());


var testRFRegression = testingPartitionRFRegression.classify(RFregressionClassifier);

var testAccuracyRFRegression = testRFRegression.errorMatrix('Class', 'classification');
print('RF trend test accuracy: ', testAccuracyRFRegression.accuracy());
print('RF test Kappa: ', testAccuracyRFRegression.kappa());

var classifiedRFRegression = RFRegression.select(predictionBandsRFRegression).classify(RFregressionClassifier);

// Define a palette for the classification.
var landcoverPalette = [
  '#2c83b9', //Change_1 (0)
  '#d7191b', //Change_2 (1)
  '#fcfcbe', //NoChange (2)
];
Map.addLayer(classifiedRFRegression, {palette: landcoverPalette, min: 0, max:2}, 'classification');
Map.addLayer(validationGcp, {}, 'Validation Gcp');

var RGBRF = classifiedRFRegression.visualize({
  min: 0,
  max: 2,
  palette: ['#2c83b9', '#d7191b', '#fcfcbe']
});

Export.image.toDrive({
  image: classifiedRFRegression.visualize({palette: landcoverPalette, min: 0, max:2}).clip(shapeFile),
  region: shapeFile,
  scale: 10,
  description: 'RF_Trend_' + regione + '_' + year + '_' + ID,
  fileNamePrefix: 'RF_Trend_' + regione + '_' + year + '_' + ID,
  folder: 'RF_raster_'+ regione + '_' + year,
  maxPixels: 1e13
});

//============================================================================
//============================================================================
//============================================================================


//CLC
//Map.addLayer(LULC_10m.clip(shapeFile), {min:1, max:10, palette:dict['colors']}, 'LULC_10m ' + ID );
//=============================== EXPORT DATA ===============================

//Export image to drive


Export.image.toDrive({
  image: collectionLinearFit.visualize(visTrend).clip(shapeFile),
  region: shapeFile,
  scale: 10,
  description: 'NDVI_Trend_' + regione + '_' + year + '_' + ID,
  fileNamePrefix: 'NDVI_Trend_' + regione + '_' + year + '_' + ID,
  folder: 'RF_raster_'+ regione + '_' + year,
  maxPixels: 1e13
});

//Export image to drive in a created/selected folder
Export.image.toDrive({
  image: collection.reduce(ee.Reducer.linearFit()).clip(shapeFile),
  region: shapeFile,
  scale: 10,
  description: 'LN_singleBand_' + regione + '_' + year + '_' + ID,
  fileNamePrefix: 'LN_singleBand_' + regione + '_' + year + '_' + ID,
  folder: 'RF_raster_'+ regione + '_' + year,
  maxPixels: 1e13
});

// export the buffered LT shapefile
Export.table.toDrive({
  collection: ee.FeatureCollection(AOI.filter(ee.Filter.eq("IDrel", Ar))),
  folder: 'RF_raster_'+ regione + '_' + year,
  description: 'SHP_' + regione + '_' + year + '_' + ID,
  fileNamePrefix: 'SHP_raster_'+ regione + '_' + year,
  fileFormat: 'SHP'
});
/*
// export the buffered LT shapefile
  Export.table.toDrive({
  collection: fromList,
  description: 'ROI_' + regione + '_' + year + '_' + ID,
  fileNamePrefix: 'ROI_' + regione + '_' + year + '_' + ID,
  fileFormat: 'SHP'
});
*/

}
//================================================================================
//================================================================================
//========================== Fine del Ciclo di For ===============================
//================================================================================
//================================================================================
