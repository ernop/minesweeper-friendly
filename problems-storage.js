'use strict';

// The problems page's own database and store names, shared by
// problems-page.js, which owns the schema and its upgrades, and
// archive-worker.js, which archives the stored attempts and runs.

const PROBLEM_DB_NAME = 'minesweeper-problems';
const ATTEMPT_STORE = 'attempts';
const PREFERENCE_STORE = 'preferences';
const POINTING_STORE = 'pointingRuns';
const DRILL_STORE = 'drillAttempts';
