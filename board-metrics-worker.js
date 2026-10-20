'use strict';

importScripts('board-shape.js?v=20261020-live-perf', 'zini.js?v=20261020-live-perf', 'board-metrics.js?v=20261020-live-perf');

self.onmessage = ({ data }) => {
  const { id, width, height, mines } = data;
  try {
    self.postMessage({ id, result: BoardMetrics.analyze(width, height, mines) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
