'use strict';

importScripts('board-shape.js?v=20261020-no-left-panel', 'zini.js?v=20261020-no-left-panel', 'board-metrics.js?v=20261020-no-left-panel');

self.onmessage = ({ data }) => {
  const { id, width, height, mines } = data;
  try {
    self.postMessage({ id, result: BoardMetrics.analyze(width, height, mines) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
