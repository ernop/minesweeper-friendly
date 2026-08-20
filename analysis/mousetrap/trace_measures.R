#!/usr/bin/env Rscript
# Psychometric mouse-tracking measures over minesweeper-friendly traces.
#
# Input: the game's "export traces" JSON (an array of per-game traces:
# {endedAt, mode, outcome, startedAt, sampleT, sampleX, sampleY, events}).
# Each inter-click segment becomes one mousetrap trial: the trajectory
# from the previous click (or trace start) to the next click, the click
# being the trial's response. mousetrap (Kieslich et al.) then computes
# the standard measures: MAD, MD_above/below, AUC, AD, x/y flips and
# reversals, initiation time, idle time, hovers, velocity/acceleration
# extrema, and sample entropy on time-normalized trajectories.
#
# Usage: Rscript trace_measures.R <traces.json> <out_prefix>
# Writes <out_prefix>_trials.csv (one row per inter-click segment) and
# <out_prefix>_games.csv (per-game means of the key measures).
#
# Runs on the env at ~/analysis-envs/r-mousetrap (see agents.md):
#   ~/analysis-envs/r-mousetrap/bin/Rscript trace_measures.R traces.json out

library(jsonlite)
library(mousetrap)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("usage: trace_measures.R <traces.json> <out_prefix>")

games <- fromJSON(args[1], simplifyDataFrame = FALSE)
if (length(games) == 0) stop("no traces in ", args[1])

rows <- list()
skipped <- 0
for (g in games) {
  clicks <- Filter(function(e) e$kind %in% c("lup", "rdown"), g$events)
  if (length(clicks) == 0) next
  clicks <- clicks[order(sapply(clicks, function(e) e$t))]
  st <- as.numeric(g$sampleT)
  sx <- as.numeric(g$sampleX)
  sy <- as.numeric(g$sampleY)
  lower <- -Inf
  prev <- NULL
  for (k in seq_along(clicks)) {
    ck <- clicks[[k]]
    sel <- which(st > lower & st <= ck$t)
    ts <- st[sel]; xs <- sx[sel]; ys <- sy[sel]
    # The segment starts where the previous click left the cursor and ends
    # on the click itself (unless a sample already sits on that instant).
    if (!is.null(prev)) { ts <- c(prev$t, ts); xs <- c(prev$x, xs); ys <- c(prev$y, ys) }
    if (length(ts) == 0 || ts[length(ts)] < ck$t) {
      ts <- c(ts, ck$t); xs <- c(xs, ck$x); ys <- c(ys, ck$y)
    }
    if (length(ts) >= 5) {
      rows[[length(rows) + 1]] <- data.frame(
        mt_id = paste0(g$endedAt, "_", k),
        game = as.character(g$endedAt),
        outcome = g$outcome,
        timestamps = ts - ts[1],
        xpos = xs,
        ypos = ys
      )
    } else {
      skipped <- skipped + 1
    }
    lower <- ck$t
    prev <- ck
  }
}
if (length(rows) == 0) stop("no segments with enough samples (skipped ", skipped, ")")
long <- do.call(rbind, rows)
cat(sprintf("games: %d, segments: %d (skipped %d with <5 samples), samples: %d\n",
  length(games), length(unique(long$mt_id)), skipped, nrow(long)))

# The mousetrap pipeline runs once per game, not once over the whole
# export: mt_sample_entropy pools its tolerance radius r (0.2 * SD of the
# time-normalized x-differences) across every trial in the object, and the
# game is the pooling unit — a game's values must not depend on which
# other games happen to sit in the same export. The in-page implementation
# (minesweeper.js computePsychometrics) pools per game identically.
trial_list <- list()
for (game_id in unique(long$game)) {
  long_g <- long[long$game == game_id, ]
  mt <- mt_import_long(long_g)
  mt <- mt_derivatives(mt)
  mt <- mt_measures(mt)
  mt <- mt_time_normalize(mt)
  mt <- mt_sample_entropy(mt, use = "tn_trajectories")
  trial_list[[game_id]] <- mt$measures
}
trials <- do.call(rbind, trial_list)
# Carry game id and outcome back onto the per-trial rows.
meta <- unique(long[, c("mt_id", "game", "outcome")])
trials <- merge(meta, trials, by = "mt_id")
write.csv(trials, paste0(args[2], "_trials.csv"), row.names = FALSE)

key <- c("MAD", "AUC", "AD", "xpos_flips", "ypos_flips",
  "initiation_time", "idle_time", "hovers", "hover_time",
  "vel_max", "acc_max", "sample_entropy", "RT")
key <- intersect(key, names(trials))
byGame <- aggregate(trials[key], by = list(game = trials$game), FUN = mean)
write.csv(byGame, paste0(args[2], "_games.csv"), row.names = FALSE)

cat("per-trial measures -> ", args[2], "_trials.csv (", nrow(trials), " rows, ",
  ncol(trials), " columns)\n", sep = "")
cat("per-game means     -> ", args[2], "_games.csv\n", sep = "")
cat("\ncolumns:\n"); print(names(trials))
cat("\nper-game means of key measures:\n"); print(byGame)
