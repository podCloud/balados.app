import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { configure } from "@testing-library/react";

// Testing Library's default async timeout is 1000 ms. Pages that render
// 50+ rows (ListeningHistory pagination, see #76) can exceed it on a loaded
// CI runner. Keep it below Vitest's implicit 5 s testTimeout so that a
// genuinely failing waitFor/findBy still reports Testing Library's error
// and DOM dump instead of an opaque "Test timed out in 5000ms".
configure({ asyncUtilTimeout: 4000 });
