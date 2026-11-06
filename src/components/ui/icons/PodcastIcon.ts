/**
 * Classic "podcast" broadcast logo, copied from lucide-react 0.562.0.
 * lucide 1.27 redrew its Podcast icon as a studio microphone (MicSignal);
 * the app keeps this glyph (decision 2026-11-06). Built with lucide's own
 * createLucideIcon, so it takes the same props (size, strokeWidth,
 * className, aria-*) as the other icons.
 *
 * Lucide is licensed under the ISC License:
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as
 * part of Feather (MIT). All other copyright (c) for Lucide are held by
 * Lucide Contributors 2025.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 */
import { createLucideIcon } from "lucide-react";

export const PodcastIcon = createLucideIcon("podcast", [
  [
    "path",
    { d: "M13 17a1 1 0 1 0-2 0l.5 4.5a0.5 0.5 0 0 0 1 0z", fill: "currentColor", key: "x1mxqr" },
  ],
  ["path", { d: "M16.85 18.58a9 9 0 1 0-9.7 0", key: "d71mpg" }],
  ["path", { d: "M8 14a5 5 0 1 1 8 0", key: "fc81rn" }],
  ["circle", { cx: "12", cy: "11", r: "1", fill: "currentColor", key: "vqiwd" }],
]);
