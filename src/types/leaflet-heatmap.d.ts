declare module "leaflet-heatmap" {
  import * as L from "leaflet";

  export default class HeatmapOverlay extends L.Layer {
    constructor(config: any);
    setData(data: any): void;
  }
}