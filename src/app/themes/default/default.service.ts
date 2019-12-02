import { Injectable, Inject } from '@angular/core';
import { MapService } from '../../core/services/map.service';
import { MAP_CONFIG } from '../../core/config/map.config';

@Injectable({
  providedIn: 'root'
})
export class DefaultService {
  dynamicLayersArray: any[] = [];
  urlArray: string[] = [];

  constructor(private mapService: MapService, @Inject(MAP_CONFIG) private config) { }

  getUrls(): string[] {
    return this.urlArray;
  }

  // return Dynimac Layers
  initDefaultDynamicLayers(themeServiceUrl: any, id: string, name: string, opacity: number, raster: boolean = false): any {
    const dynamicLayer = this.mapService.initDynamicLayer(themeServiceUrl, id, name, opacity);
    dynamicLayer.isRaster = raster;
    return dynamicLayer;
  }

  // get service based on theme
  getDefaultDynamicLayers(urlTheme: string): any[] {
    const themes: any = this.config.themes;
    for (const theme in themes) {
      // if hasOwnProperty and if not custom theme
      if ((themes.hasOwnProperty(theme)) && (!themes[theme].custom)) {
        const themeId = themes[theme].id; // get unique theme id
        if (themeId === urlTheme) {
          return this.returnDynamicLayersArray(theme);
        }
      }
    }
  }

  returnDynamicLayersArray(themeId: string): any[] {
    const layers = this.config.themes[themeId].layers;
    const layersArr: any[] = [];
    for (const layer in layers) {
      if (layers.hasOwnProperty(layer)) {
        const url = layers[layer].dynimacLayerUrls;
        // init dynaimc layer bases on url and push it to array
        const id = layer; // get id
        const name = layers[layer].name; // get name
        const opacity = layers[layer].opacity;
        const raster = layers[layer].isRaster;
        // do not push service with Raster
        if (!raster) {
          this.urlArray.push(url);
        }

        layersArr.push(this.initDefaultDynamicLayers(url, id, name, opacity, raster));
      }
    }

    return layersArr;
  }

  // validate ArcGis date string
  isValidDate(dateStr, reg) {
    return dateStr.match(reg) !== null;
  };

  getVisibleLayersContent(result): string {
    const reg = /(\d+)[.](\d+)[.](\d+)\s.*/; // regex: match number with . char, clear everything else
    const feature = result.feature;
    let content = ' ';
    const layerName = result.layerName;
    const attributes = feature.attributes;

    feature.attributes.layerName = layerName;

    for (const resultAtr in attributes) {
      if (attributes.hasOwnProperty(resultAtr)) {
        // Filter specific string values
        // TEMP check for raster and other str properties, use match case insensitive where possible
        // tslint:disable-next-line: max-line-length
        if (!(resultAtr.toLowerCase() === 'objectid' || resultAtr === 'layerName' || resultAtr.match(/shape/i) || resultAtr === 'Class value' || resultAtr === 'Pixel Value' || resultAtr.match(/count/i) || resultAtr == 'OBJECTID' || resultAtr == 'layerName' || resultAtr == 'SHAPE' || resultAtr == 'SHAPE.area' || resultAtr == 'OID' || resultAtr == 'Shape.area' || resultAtr == 'SHAPE.STArea()' || resultAtr == 'Shape' || resultAtr == 'SHAPE.len' || resultAtr == 'Shape.len' || resultAtr == 'SHAPE.STLength()' || resultAtr == 'SHAPE.fid' ||
          resultAtr === 'Class value' || resultAtr === 'Pixel Value' || resultAtr === 'Count_'
        )) { // add layers attributes that you do not want to show
          // AG check for date string
          if (this.isValidDate(attributes[resultAtr], reg)) {
            content += '<p><span>' + resultAtr + '</br></span>' + attributes[resultAtr].replace(reg, '$1-$2-$3') + '<p>';
          } else {
            let attributeResult = attributes[resultAtr];
            // tslint:disable-next-line: max-line-length
            if (attributeResult !== null) { // attributes[resultAtr] == null  equals to (attributes[resultAtr]  === undefined || attributes[resultAtr]  === null)
              if ((attributeResult === ' ') || (attributeResult === 'Null')) {
                attributeResult = '-';
              }

            } else {
              attributeResult = '-';
            }
            // check if url contains http or https  + :// string with regex, TODO refactor
            if (attributeResult.match('^https?://', 'i')) {
              // tslint:disable-next-line: max-line-length
              content += `<p><span>${resultAtr}</br></span><a href='${attributeResult}' rel="noopener noreferrer" target='_blank'>Nuoroda</a><p>`;
            } else {
              content += '<p><span>' + resultAtr + '</br></span>' + attributeResult + '<p>';
            }

          }
        } else if (resultAtr === 'Class value' || resultAtr === 'Pixel Value') {
          // TEMP check for raster properties 	and add custom msg
          content = '<p class="raster">Išsamesnė sluoksnio informacija pateikiama Meniu lauke <strong>"Žymėjimas"</strong></p>';
        }

      }
    }
    return content;
  }

}
