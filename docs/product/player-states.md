# Player states

Product spec section; index: [PRODUCT.md](../../PRODUCT.md). Implementation notes: [docs/implementation/player-states.md](../implementation/player-states.md).

- The player keeps a personal list of self-reported context tags —
  sleepiness, mood, hardware ("bad mouse"), location. Active tags are
  stored on finished-game records for later grouping and comparison; the
  tag and any observed association do not establish a cause.
- Only ACTIVE states are visible on the page, as facts, not buttons
  (creator direction 2026-10-14: "the tags/playstate (music on/off, mouse,
  computer, mental and physical state) shall not visually be identical to
  BUTTONS. it's a totally diff datatype after all";
  [One look per kind of thing](ui-doctrine.md)). They form the play context
  line: the measured music state first ("music on" or "music off";
  [Music playing](per-game-stats.md)), then each state that is on, in list
  order. Each is a tag (creator request 2026-10-20: "we must visually
  distinguish states from buttons; they're not buttons, they're tags. make
  their corners rounded and show they're more like props than UI
  interactive elements"): a fully rounded pill, bold black on a sand fill
  with a thin sand border, no pointer, hover, or x. Buttons keep 3px
  corners and the blue-gray fill, and sand is used for nothing else.
  Clicking a tag does nothing. The line wraps between tags, never inside
  one, and is absent when nothing is on and music is not measured. From
  2026-10-14 to 2026-10-20 the items were plain bold text separated by
  dots, which still read too much like the controls around them; from
  2026-08-20 each state was a clickable chip (bold black on light blue, a
  trailing x, a click took it off) and music an olive bordered box, both
  dressed like buttons.
- One bordered **edit states** button follows the line; its tooltip explains
  the feature. It opens the one menu that changes states: every state in
  the list, on or off, as a checkbox row (check puts it on, uncheck takes it
  off, and the menu stays open), an x at the end of each row that deletes
  it outright, and a text field at the bottom with an **add** button that
  creates a new state. A created state goes on immediately, since typing it
  mid-session means "I am in this state now", and closes the menu.
  Duplicate or empty names are refused with a visible message. Until
  2026-10-14 the opener was "+ state" and its menu listed only the inactive
  states, a click putting one on and closing the menu.
- The button holds a pressed look while the menu is up, and the menu carries
  a "session states" header with an ×; ×, Esc, and a click outside all close
  it (since 2026-08-23, when the opener became a real bordered button).
- Defect fixed 2026-10-14: every saved setting replaces the stored settings
  with a copy, and opening the menu itself saves (it remembers the open
  panel), so a click in the old menu put nothing on, and a chip click after
  any other saved setting (a Zoom change, for one) took nothing off. States
  are now found by name at the moment of the click.
- A new player's menu offers three suggested options: sleepy, just woke
  up, inebriated — none active.
- The active set is stamped onto each game record at the moment it
  finishes (win or loss).
- Editing the list never touches past games: records keep exactly the
  states they were stamped with, even if a state is later removed.
- The states panel sits at the top of the details column at the right
  (2026-08-20 in the upper-right corner; it previously hung off the board's
  left edge), after the archive alert, shown only while the archive folder
  is paused or failing
  (2026-09-26, [Archive folder](storage-and-history.md#archive-folder-creator-direction-2026-09-26)).
  From 2026-08-21 to 2026-10-20 it sat under the play-mode and generator
  menus, which moved to the game setup rows above the board. The settings
  button and the other-page links moved to the top bar above that column on
  2026-10-14, and on 2026-10-20 to the settings row and footer at the page
  foot ([Game setup](board-and-layout.md#game-setup-top-bar-settings-row-and-footer)).
  The states are a game's context, not configuration, so they stay beside
  the game's details. The column is reserved, so using the panel never
  moves the board.
