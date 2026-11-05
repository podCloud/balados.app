import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { configure } from "@testing-library/react";

// Testing Library's default async timeout is 1000 ms. Pages that render
// 50+ rows (ListeningHistory pagination, see #76) can exceed it on a loaded
// CI runner, so align it with Vitest's 5 s testTimeout instead.
configure({ asyncUtilTimeout: 5000 });
