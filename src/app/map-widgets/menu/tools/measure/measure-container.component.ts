import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { AnalyzeParams } from './AnalyzeParams';
import { MapService } from '../../../../core/services/map.service';
import { MeasureMapService } from './measure-map.service';
import { ThemeNameService } from '../../../../core/services/theme-name.service';
import PolygonDrawAction from 'arcgis-js-api/views/draw/PolygonDrawAction';
import isEmpty from 'lodash-es/isempty';
import forOwn from 'lodash-es/forOwn';

@Component({
  selector: 'maps-v-measure-container',
  templateUrl: './measure-container.component.html',
  styleUrls: ['./measure-container.component.scss']
})
export class MeasureContainerComponent implements OnInit, OnDestroy {
  @ViewChild('bufferCheckbox', { static: false }) bufferCheckbox: ElementRef;
  view: any;
  draw: any;
  activeToolsState = false;
  activeTool = '';
  previousActiveTool = '';
  checkboxChecked: boolean;
  canCreateBuffer = true;
  analyzeParams: AnalyzeParams = {
    bufferSize: 1,
    inputlayer: null,
    chosenUnit: 'km'
  };

  units = [
    'km', 'm'
  ];

  measureActiveOpt: any = {
    pointActive: {
      name: 'draw-point',
      active: false
    },
    lineActive: {
      name: 'draw-line',
      active: false
    },
    polyActive: {
      name: 'draw-polygon',
      active: false
    }
  };

  destroyView: boolean;

  // dojo draw events handlers Array
  eventHandlers = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private mapService: MapService,
    private measureMapService: MeasureMapService,
    private themeNameService: ThemeNameService
  ) {
    this.cdr.detach();
  }

  ngOnInit() {
    this.view = this.mapService.getView();

    // add draw capabilities for temporary geometries
    this.view.when(() => {
      this.draw = this.measureMapService.initDraw(this.view);
    });
  }

  checkBoxChange() {
    this.checkboxChecked = this.bufferCheckbox.nativeElement.checked;
    this.measureMapService.resetCalculate();
  }


  restoreDefault() {
    //  set active tool to empty string
    this.activeTool = '';

    // set previous active tool, to indetify if any previuos tool was activeTool
    // and blockin buffer method
    this.measureMapService.resetCalculate();
    this.view.graphics.removeAll();
  }

  // remove eventHandlers
  removeEventHandlers() {
    this.eventHandlers.forEach((event) => {
      event.remove();
    });
    this.eventHandlers = [];
  }

  drawElement() {
    // esri draw approach
    switch (this.activeTool) {
      case 'draw-polygon':
        this.enableCreatePolygon();
        break;
      case 'draw-line':
        this.enableCreatePolyline(this.draw, this.view);
        break;
      case 'draw-point':
        this.enableCreatePoint(this.draw, this.view);
        break;
    }
  }

  selectDrawEl(evt, id) {
    if (id === this.activeTool) {
      this.activeTool = '';
      this.resetTools();
    } else {
      this.previousActiveTool = this.activeTool;
      // suspend layers toggle (e.g. suspend layers while drawing with measure tools)
      // this.mapService.suspendLayersToggle();
      this.resetTools();
      this.activateTool(id);
      this.drawElement();
    }
  }

  resetTools() {
    // complete 2d draw action since 4.5 complete() method is available
    const action = this.draw.activeAction as PolygonDrawAction;

    if (!isEmpty(action)) {
      action.complete();

      // BUG Fix: in order to unsuspend run destroy as well
      // BUG effects if we closing draw feature after first draw element has been added
      action.destroy();

      this.draw.activeAction = null;

    }

    this.measureMapService.resetCalculate();
    this.view.graphics.removeAll();

    // reset eventHandler events
    this.removeEventHandlers();
  }

  // activate measure tools based on id
  activateTool(id: string) {
    // check if any tool is active
    this.activeToolsState = false;
    // iterate with lodash
    forOwn(this.measureActiveOpt, (value) => {
      // active tools
      if (value.name === id) {
        value.active = !value.active;
        // add or remove disabled attribute and activeTool name
        this.activeToolsState = true;
        this.activeTool = value.name;
        this.cdr.detectChanges();
      }
    });
  }

  completeDrawing(e): void {
    // tslint:disable-next-line: no-unused-expression
    this.checkboxChecked
    && this.activeTool
    && !this.previousActiveTool && (this.view.graphics.items.length > 0)
    && (this.measureMapService.createBuffer(this.analyzeParams, e)
    .then(() => {
      // detect changes when binding count number from service
      this.cdr.detectChanges();
    }));

    // set active tool to empty string
    this.zone.run(() => {this.activeTool = '';
  });

    // unsuspend layers
    if (this.mapService.getSuspendedIdentitication()) {
      if (e.coordinates) {
        setTimeout(() => {
          this.mapService.unSuspendLayersToggle();
        }, 800);
      } else {
        this.mapService.unSuspendLayersToggle();
      }
    }

    if (!this.destroyView) {
      this.cdr.detectChanges();
    }

  }

  // Polygon approach
  enableCreatePolygon() {
    this.mapService.suspendLayersToggle();

    // create() will return a reference to an instance of PolygonDrawAction
    const action = this.draw.create('polygon');
    // focus the view to activate keyboard shortcuts for drawing polygons
    this.view.focus();
    // listen to vertex-add event on the action
    this.eventHandlers.push(action.on('vertex-add', (e) => {
      this.measureMapService.drawPolygon(e, this.analyzeParams);
    }));
    // listen to cursor-update event on the action
    this.eventHandlers.push(action.on('cursor-update', (e) => this.measureMapService.drawPolygon(e, this.analyzeParams)));
    // listen to vertex-remove event on the action
    this.eventHandlers.push(action.on('vertex-remove', (e) => this.measureMapService.drawPolygon(e, this.analyzeParams)));
    // listen to draw-complete event on the action
    this.eventHandlers.push(action.on('draw-complete', (e) => {
      this.measureMapService.drawPolygon(e, this.analyzeParams, true);
      this.completeDrawing(e);
    }));
  }

  // Polyline approach
  enableCreatePolyline(draw, view) {
    const action = draw.create('polyline');

    this.mapService.suspendLayersToggle();

    // listen to PolylineDrawAction.vertex-add
    // Fires when the user clicks, or presses the "F" key
    // Can also fire when the "R" key is pressed to redo
    this.eventHandlers.push(action.on('vertex-add', (evt) => {
      this.measureMapService.createPolylineGraphic(evt, this.analyzeParams);
    }));

    // listen to PolylineDrawAction.vertex-remove
    // Fires when the "Z" key is pressed to undo the
    // last added vertex
    this.eventHandlers.push(action.on('vertex-remove', (evt) => {
      this.measureMapService.createPolylineGraphic(evt, this.analyzeParams);
    }));

    // listen to PolylineDrawAction.cursor-update
    // fires when the pointer moves over the view
    this.eventHandlers.push(action.on('cursor-update', (evt) => {
      this.measureMapService.createPolylineGraphic(evt, this.analyzeParams);
    }));

    // listen to PolylineDrawAction.draw-complete
    // event to create a graphic when user double-clicks
    // on the view or presses the "C" key
    this.eventHandlers.push(action.on('draw-complete', (evt) => {
      this.measureMapService.createPolylineGraphic(evt, this.analyzeParams, true);
      this.completeDrawing(evt);
    }));
  }

  // Point approach
  enableCreatePoint(draw, view) {
    // TODO add action property to component and complete() on draw toolbox close
    const action = draw.create('point');
    this.mapService.suspendLayersToggle();

    // PointDrawAction.cursor-update
    // Give a visual feedback to users as they move the pointer over the view
    this.eventHandlers.push(action.on('cursor-update', (evt) => {
      this.measureMapService.createPointGraphic(evt, this.analyzeParams);
    }));

    // PointDrawAction.draw-complete
    // Create a point when user clicks on the view or presses "C" key.
    this.eventHandlers.push(action.on('draw-complete', (evt) => {
      this.measureMapService.createPointGraphic(evt, this.analyzeParams);
      this.completeDrawing(evt);
    }));
  }

  ngOnDestroy() {
    this.destroyView = true;
    this.checkboxChecked = false;
    this.measureMapService.resetCalculate();
    this.mapService.unSuspendLayersToggle();
    this.restoreDefault();
    this.resetTools();
  }

}
