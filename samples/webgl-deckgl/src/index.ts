/*
 * Copyright 2019 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

declare global {
  const deck: any;
}

// [START maps_webgl_deckgl]
let PRESERVE_COMMENT_ABOVE; // force tsc to maintain the comment above eslint-disable-line

let map: google.maps.Map, webGLOverlay: any;
// source: Natural Earth http://www.naturalearthdata.com/ via geojson.xyz
const AIR_PORTS =
  "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_airports.geojson";

function initMap() {
  const lat = 51.4709959;
  const lng = -0.4531566;
  const zoom = 2;
  const heading = 0;
  const tilt = 0;

  const mapElement = document.getElementById("map")!;

  map = new google.maps.Map(mapElement, {
    zoom: zoom,
    center: new google.maps.LatLng(lat, lng),
    heading: heading,
    tilt: tilt,
    mapId: "b1beacae401d047c",
  });

  const tooltipElement = document.getElementById("tooltip")!;

  function setTooltip({ x, y, object }) {
    if (object) {
      tooltipElement.style.display = "block";
      tooltipElement.style.left = `${x + 5}px`;
      tooltipElement.style.top = `${y + 5}px`;
      tooltipElement.innerHTML = `${object.properties.name} - ${object.properties.abbrev}`;
    } else {
      tooltipElement.style.display = "none";
    }
  }

  const eventListeners = {
    click: null,
    dblclick: null,
    mousemove: null,
    mouseout: null,
  };

  class DeckGLOverlay extends google.maps.WebglOverlayView {
    private canvas: HTMLElement;
    private deck: any;
    private layers_: any[];
    private props: any;

    constructor(canvas: HTMLElement, layers: any[], props = {}) {
      super();
      this.deck = null;
      this.layers_ = layers;
      this.props = props;
      this.canvas = canvas;
    }

    set layers(layers: any[]) {
      this.layers_ = layers;
      this.deck.setProps({ layers: [this.layers_] });
    }

    onAdd() {}

    onRemove() {}

    onContextRestored(gl: WebGLRenderingContext) {
      const map = this.getMap()!;

      this.deck = new deck.Deck({
        canvas: this.canvas,
        initialViewState: {
          longitude: lng,
          latitude: lat,
          pitch: tilt,
          zoom,
        },
        gl: gl,
        layers: this.layers_,
        props: this.props,
        controller: false,
        userData: { map: map }, // Custom context available to layers
      });

      // Register event listeners
      for (const eventType in eventListeners) {
        eventListeners[eventType] = map.addListener(
          eventType,
          (event: google.maps.MapMouseEvent) =>
            this.handleMouseEvent(this.deck, eventType, event)
        );
      }
    }

    onDraw(gl: WebGLRenderingContext, coordinateTransformer) {
      const deck = this.deck;

      if (!deck || !deck.layerManager) {
        return;
      }

      const camParams = coordinateTransformer.getCameraParams();
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      const left = 0;
      const top = 0;
      const zoom = Math.max(0, camParams.zoom - 1);
      const pitch = camParams.tilt;
      const bearing = camParams.heading;
      const latitude = camParams.lat;
      const longitude = camParams.lng;

      this.canvas.style.left = `${left}px`;
      this.canvas.style.top = `${top}px`;

      deck.setProps({
        width,
        height,
        viewState: {
          latitude,
          longitude,
          zoom,
          pitch,
          bearing,
          nearZMultiplier: 0.01,
          farZMultiplier: 1.01,
          repeat: true,
        },
      });

      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);

      // [START maps_webgl_deckgl_draw_is_requesting_frame]
      this.requestRedraw();
      deck._drawLayers("google-map-repaint", {
        clearCanvas: false,
      });
      // [END maps_webgl_deckgl_draw_is_requesting_frame]
    }

    onContextLost() {}

    getEventPixel(
      event: google.maps.MapMouseEvent | google.maps.IconMouseEvent,
      deck: any
    ): { x: number; y: number } {
      const point = deck
        .getViewports()[0]
        .project([event.latLng!.lng(), event.latLng!.lat()]);
      return { x: point[0], y: point[1] };
    }

    /**
     * Translate and pass events from map to Deck instance.
     *
     * @param deck Deck instance to pass modified event to.
     * @param type Event name such as `click` that triggered the event.
     * @param event Source event that is being handled.
     */
    handleMouseEvent(
      deck: any,
      type: string,
      event: google.maps.MapMouseEvent
    ) {
      const deckEvent = {
        type,
        offsetCenter: this.getEventPixel(event, deck),
        srcEvent: event,
      } as any;

      switch (type) {
        case "click":
          // Hack: because we do not listen to pointer down, perform picking now
          deck._lastPointerDownInfo = deck.pickObject(deckEvent.offsetCenter);
          deckEvent.tapCount = 1;
          deck._onEvent(deckEvent);
          break;
        case "dblclick":
          deckEvent.type = "click";
          deckEvent.tapCount = 2;
          deck._onEvent(deckEvent);
          break;
        case "mousemove":
          deckEvent.type = "pointermove";
          deck._onPointerMove(deckEvent);
          // google.maps.event.trigger(this.getMap()!,'resize');
          break;
        case "mouseout":
          deckEvent.type = "pointerleave";
          deck._onPointerMove(deckEvent);
          // google.maps.event.trigger(this.getMap()!,'resize');
          break;
        default:
          return;
      }

      this.requestRedraw();
    }
  }

  // [START maps_webgl_deckgl_layers]
  const layers = [
    new deck.GeoJsonLayer({
      id: "airports",
      data: AIR_PORTS,
      filled: true,
      pointRadiusMinPixels: 2,
      opacity: 1,
      pointRadiusScale: 2000,
      getRadius: (f: any) => 11 - f.properties.scalerank,
      getFillColor: [200, 0, 80, 180],
      pickable: true,
      autoHighlight: true,
      onHover: setTooltip,
    }),
    new deck.ArcLayer({
      id: "arcs",
      data: AIR_PORTS,
      dataTransform: (d: any) =>
        d.features.filter((f: any) => f.properties.scalerank < 4),
      getSourcePosition: (f: any) => [lng, lat], // London
      getTargetPosition: (f: any) => f.geometry.coordinates,
      getSourceColor: [0, 128, 200],
      getTargetColor: [200, 0, 80],
      getWidth: 1,
    }),
  ];
  // [END maps_webgl_deckgl_layers]

  const props = {};

  webGLOverlay = new DeckGLOverlay(mapElement, layers, props);
  webGLOverlay.setMap(map);
}
// [END maps_webgl_deckgl]
export { initMap };
