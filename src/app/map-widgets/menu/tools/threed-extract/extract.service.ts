import { Injectable, Inject } from '@angular/core';
import Draw from 'arcgis-js-api/views/draw/Draw';
import Polygon from 'arcgis-js-api/geometry/Polygon';
import Graphic from 'arcgis-js-api/Graphic';
import FeatureSet from 'arcgis-js-api/tasks/support/FeatureSet';
import Geoprocessor from 'arcgis-js-api/tasks/Geoprocessor';
import { MapService } from '../../../../core/services/map.service';
import { MenuToolsService } from '../../menu-tools.service';
import { Symbols } from '../../symbols';
import geometryEngine from 'arcgis-js-api/geometry/geometryEngine';
import { Observable, interval, of } from 'rxjs';
import { switchMapTo, map, take, filter } from 'rxjs/operators';
import { MAP_CONFIG } from '../../../../core/config/map.config';
import { FileIndex } from './fileIndex';
import JobInfo from 'arcgis-js-api/tasks/support/JobInfo';

@Injectable({
  providedIn: 'root'
})
export class ExtractService {
  draw: Draw;
  view: any;
  polygon: Polygon;
  graphic: Graphic;
  featureSet = new FeatureSet();

  // file results promises
  fileResults = [];

  // file results urls
  fileResultsurls = {
    pdf: null,
    collada: null,
    obj: null,
    ds: null,
    succes: null
  };
  calculatedUnits: number;
  job: Promise<JobInfo>;
  geo: Geoprocessor;

  constructor(
    private mapService: MapService,
    private menuToolsService: MenuToolsService,
    @Inject(MAP_CONFIG) private config
  ) { }

  initDraw(view): Draw {
    this.view = view;
    this.draw = new Draw({
      view
    });
    return this.draw;
  }

  initGeoprocessor(view) {
    const url = this.config.mapOptions.staticServices.extract3DGP.url;
    this.geo = new Geoprocessor({
      url,
      outSpatialReference: view.spatialReference
    });
    return this.geo;
  }

  deactivateAndDisable(evt: Event, drawActive: boolean) {
    // on complete remove class
    // check if drawActive -> unsuspend
    if ((evt.type === 'draw-complete') && drawActive) {
      // first unsuspend layers on draw-complete event
      // set timeout, needed for point element specificallly as we do not want to start identify method too early
      setTimeout(() => {
        this.mapService.unSuspendLayersToggle();
      }, 800);
    }
  }

  drawPolygon(evt, drawActive: boolean, ended = false) {
    // on complete remove class
    this.deactivateAndDisable(evt, drawActive);

    const vertices = evt.vertices;
    // remove existing graphic
    this.view.graphics.removeAll();
    // create a new polygon
    const polygon = new Polygon({
      rings: vertices,
      spatialReference: this.view.spatialReference
    });

    // create a new graphic representing the polygon, add it to the view
    const graphic = new Graphic({
      geometry: polygon,
      symbol: Symbols.polygonSymbol
    });

    // using graphic to show clear button
    // add only if graphic has more than 1 vertex, equal length mroe than 2 arrays
    if (polygon.rings[0].length > 1) {
      this.graphic = graphic;
    }

    this.view.graphics.add(graphic);

    // calculate the area of the polygon
    let area = geometryEngine.planarArea(polygon, 'hectares');
    if (area < 0) {
      area = - area;
    }
    // start displaying the area of the polygon
    this.labelAreas(polygon, area, ended);
  }

  // Label polyon with its area
  labelAreas(geom, area, ended) {
    const graphic = this.menuToolsService.createAreaLabelGraphic(geom, area, ended, 'ha');
    this.view.graphics.add(graphic);

    this.calculatedUnits = area.toFixed(4);
  }

  async submitExtractJob() {
    const params = {};

    // null succes result
    this.fileResultsurls.succes = null;

    this.fileResults = [];
    this.featureSet.features = [this.graphic];
    params[this.config.mapOptions.staticServices.extract3DGP.params.name] = this.featureSet;
    this.job = this.geo.submitJob(params);
    const jobInfo = await this.job;
    return this.geo.waitForJobCompletion(jobInfo.jobId).then((res) => {
      const jobId = res.jobId;
      if (res.jobStatus !== 'job-failed') {
        // get results
        const collada = this.geo.getResultData(jobId, 'COLLADA_zip');
        const obj = this.geo.getResultData(jobId, 'OBJ_zip');
        const ds = this.geo.getResultData(jobId, '3DS_zip');
        const pdf = this.geo.getResultData(jobId, 'PDF_zip_');
        const blogasDydis = this.geo.getResultData(jobId, 'BlogasDydis');

        // order is important check enum FileIndex
        this.fileResults.push.apply(this.fileResults, [blogasDydis, collada, obj, ds, pdf]);

        this.filePromise(this.fileResults);
      } else {
        this.fileResultsurls.succes = false;
      }

    }).catch((error) => {
      console.warn('VP Warn', error);
    });
  }

  filePromise(fileResults: any) {
    // check first promise for fault results
    fileResults[FileIndex.blogasDydis].then((res) => {
      if (!res.value) {
        this.fileResultsurls.succes = true;
        this.executeFilesPromises(fileResults);

      } else {
        this.fileResultsurls.succes = false;
      }
    });
  }

  executeFilesPromises(fileResults: any[]) {
    fileResults.forEach((filePromise, index) => {
      if (index > 0) {
        filePromise.then((res) => {
          switch (index) {
            case FileIndex.obj:
              this.fileResultsurls.obj = res.value.url;
              break;
            case FileIndex.ds:
              this.fileResultsurls.ds = res.value.url;
              break;
            case FileIndex.collada:
              this.fileResultsurls.collada = res.value.url;
              break;
            case FileIndex.pdf:
              this.fileResultsurls.pdf = res.value.url;
              break;
          }
        }).catch(function(error) {
          this.fileResultsurls.succes = false;
          console.warn('VP File Warn', error);
        });
      }
    });
  }

  getJobinfo(): Observable<string> {
    const geo = this.geo as any;
    // Get Map keys
    // only 1 job in Map object
    const jobs = geo._timers.keys();
    return interval(1000)
    .pipe(
      switchMapTo(of([jobs.next().value])
        .pipe(
          filter(jobs => jobs.length > 0),
          map(jobs => jobs[0])
        )
      ),
      take(1)
    );
  }

  cancelJob() {
    if (this.job) {
      this.getJobinfo().subscribe(jobId => {
          this.geo.cancelJob(jobId); }
        );

    }

  }

}

