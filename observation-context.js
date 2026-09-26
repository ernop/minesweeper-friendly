'use strict';

// Context stored with an observation so it stays interpretable across
// decades of travel, new screens, and browser upgrades. Shared by the game
// page and the self-check page; reads browser globals, stores nothing.

// Local-time analyses (time of day, weekday, circadian phase) need the zone
// the player was in, not the zone of whoever reads the data years later.
// Both facts are observed: the IANA name the browser reported and the offset
// it applied at that instant, so a later tz-database revision cannot change
// what the record says.
function observedTimeZone(atMs) {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMin: 0 - new Date(atMs).getTimezoneOffset(),
  };
}

// Display and browser facts that change cursor pixels and input timing.
// Physical device facts (mouse model, DPI, acceleration) are not observable
// here and are never guessed.
function observedEnvironment() {
  return {
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    userAgent: navigator.userAgent,
  };
}

function validObservedEnvironment(value) {
  const finitePositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return value !== null && typeof value === 'object'
    && finitePositive(value.devicePixelRatio)
    && finitePositive(value.screenWidth) && finitePositive(value.screenHeight)
    && finitePositive(value.viewportWidth) && finitePositive(value.viewportHeight)
    && typeof value.userAgent === 'string' && value.userAgent.length > 0;
}

function validUtcOffsetMin(value) {
  return Number.isInteger(value) && Math.abs(value) <= 14 * 60;
}

// Every local-time display formats in the recorded zone, so a valid name is
// exactly one Intl accepts. Records share a handful of zones; accepted names
// are remembered so validating decades of records stays cheap.
const acceptedTimeZoneNames = new Set();

function validTimeZoneName(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (acceptedTimeZoneNames.has(value)) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
  acceptedTimeZoneNames.add(value);
  return true;
}
