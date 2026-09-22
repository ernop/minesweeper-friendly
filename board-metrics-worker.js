'use strict';

importScripts('board-shape.js', 'zini.js', 'board-metrics.js?v=20260921-board-groups');

self.onmessage = ({ data }) => {
  const { id, width, height, mines } = data;
  try {
    self.postMessage({ id, result: BoardMetrics.analyze(width, height, mines) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
