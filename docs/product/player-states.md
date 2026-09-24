# Player states

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/player-states.md](../implementation/player-states.md).

- The player keeps a personal list of self-reported context tags —
  sleepiness, mood, hardware ("bad mouse"), location. Active tags are
  stored on finished-game records for later grouping and comparison; the
  tag and any observed association do not establish a cause.
- Only ACTIVE states are visible. Each shows as a chip (the me-row
  highlight: bold black on light blue, with a trailing x); clicking a
  chip takes the state off. An untagged session shows nothing but one
  small "+ state" button, which carries a hover tooltip explaining the
  feature.
- The "+ state" button opens a menu of the inactive options: clicking a
  name puts it on (and closes the menu). The menu also manages the list
  itself: an x beside each option deletes it outright, and a text field
  at the bottom creates a new state — a created state goes on
  immediately, since typing it mid-session means "I am in this state
  now". Duplicate or empty names are refused with a visible message.
- Since 2026-08-23 the "+ state" opener is a real bordered button (it was
  dotted-underline text) that holds a pressed look while the menu is up,
  and the menu carries a "session states" header with an ×; ×, Esc, and a
  click outside all close it. (It shares the button dress with the
  "settings" link beside it, which since later that day leads to the full
  settings page rather than opening a surface here.)
- A new player's menu offers three suggested options: sleepy, just woke
  up, inebriated — none active.
- The active set is stamped onto each game record at the moment it
  finishes (win or loss).
- Editing the list never touches past games: records keep exactly the
  states they were stamped with, even if a state is later removed.
- The states panel sits in the screen's upper-right corner (2026-08-20;
  it previously hung off the board's left edge), sharing a fixed cluster
  with the play-mode menu (2026-08-21) and the settings button. Fixed to
  the viewport, it occupies no layout space — using it never moves the
  board — and stays visible while scrolling the charts.
