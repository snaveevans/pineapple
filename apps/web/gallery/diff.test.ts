import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import {
  COLOR_THRESHOLD,
  COMMENT_MARKER,
  buildCommentMarkdown,
  diffPair,
  parseShotName,
  runDiff,
} from "./diff.ts";

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

function scratch(): string {
  const dir = join(
    tmpdir(),
    `pineapple-gallery-diff-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("parseShotName", () => {
  it("splits id and viewport from harness file names", () => {
    expect(parseShotName("asset-library__loading__desktop.png")).toEqual({
      id: "asset-library/loading",
      viewport: "desktop",
    });
    expect(parseShotName("app-shell__notifications-badge-zero-unread__mobile.png")).toEqual({
      id: "app-shell/notifications-badge-zero-unread",
      viewport: "mobile",
    });
  });
});

describe("diffPair", () => {
  it("reports unchanged for identical PNGs", () => {
    const dir = scratch();
    try {
      const buf = solidPng(8, 8, [10, 20, 30]);
      const a = join(dir, "a.png");
      const b = join(dir, "b.png");
      const out = join(dir, "diff.png");
      writeFileSync(a, buf);
      writeFileSync(b, buf);
      const result = diffPair(a, b, out);
      expect(result.status).toBe("unchanged");
      expect(result.diffPixels).toBe(0);
      expect(result.diffFile).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports changed when a solid region differs", () => {
    const dir = scratch();
    try {
      const a = join(dir, "a.png");
      const b = join(dir, "b.png");
      const out = join(dir, "diff.png");
      writeFileSync(a, solidPng(8, 8, [10, 20, 30]));
      writeFileSync(b, solidPng(8, 8, [200, 20, 30]));
      const result = diffPair(a, b, out);
      expect(result.status).toBe("changed");
      expect(result.diffPixels).toBeGreaterThan(0);
      expect(result.diffFile).toBe("diff.png");
      // Highlighted PNG must exist and be a valid PNG.
      expect(PNG.sync.read(readFileSync(out)).width).toBe(8);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports resized on dimension mismatch", () => {
    const dir = scratch();
    try {
      const a = join(dir, "a.png");
      const b = join(dir, "b.png");
      const out = join(dir, "diff.png");
      writeFileSync(a, solidPng(8, 8, [10, 20, 30]));
      writeFileSync(b, solidPng(16, 8, [10, 20, 30]));
      const result = diffPair(a, b, out);
      expect(result.status).toBe("resized");
      expect(result.diffFile).toBe("diff.png");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports added / removed when one side is missing", () => {
    const dir = scratch();
    try {
      const only = join(dir, "only.png");
      writeFileSync(only, solidPng(4, 4, [1, 2, 3]));
      const added = diffPair(undefined, only, join(dir, "add.png"));
      expect(added.status).toBe("added");
      const removed = diffPair(only, undefined, join(dir, "rm.png"));
      expect(removed.status).toBe("removed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runDiff + comment", () => {
  it("summarises zero changes and uploads nothing conceptually", () => {
    const root = scratch();
    try {
      const base = join(root, "base");
      const head = join(root, "head");
      const out = join(root, "out");
      mkdirSync(base);
      mkdirSync(head);
      const buf = solidPng(4, 4, [9, 9, 9]);
      writeFileSync(join(base, "screen__idle__desktop.png"), buf);
      writeFileSync(join(head, "screen__idle__desktop.png"), buf);

      const summary = runDiff({ baseDir: base, headDir: head, outDir: out });
      expect(summary.changedCount).toBe(0);
      expect(summary.unchangedCount).toBe(1);
      expect(summary.colorThreshold).toBe(COLOR_THRESHOLD);

      const md = buildCommentMarkdown(summary);
      expect(md).toContain(COMMENT_MARKER);
      expect(md).toContain("No visual change");
      expect(md).not.toContain("![");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lists affected triples and can inline image URLs", () => {
    const root = scratch();
    try {
      const base = join(root, "base");
      const head = join(root, "head");
      const out = join(root, "out");
      mkdirSync(base);
      mkdirSync(head);
      writeFileSync(join(base, "screen__idle__desktop.png"), solidPng(4, 4, [0, 0, 0]));
      writeFileSync(join(head, "screen__idle__desktop.png"), solidPng(4, 4, [255, 0, 0]));
      // added only on head
      writeFileSync(join(head, "screen__new__mobile.png"), solidPng(4, 4, [0, 255, 0]));

      const summary = runDiff({ baseDir: base, headDir: head, outDir: out });
      expect(summary.changedCount).toBe(1);
      expect(summary.addedCount).toBe(1);

      const md = buildCommentMarkdown(summary, {
        imageBaseUrl: "https://example.test/pr/1/abc",
        headSha: "abcdef1234567890",
        prNumber: 42,
      });
      expect(md).toContain("`screen/idle` · desktop");
      expect(md).toContain("`screen/new` · mobile");
      expect(md).toContain("https://example.test/pr/1/abc/diff/");
      expect(md).toContain("PR #42");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("artifact-only mode explains missing inline images", () => {
    const summary = {
      generatedAt: new Date().toISOString(),
      colorThreshold: COLOR_THRESHOLD,
      baseDir: "b",
      headDir: "h",
      outDir: "o",
      totalCompared: 1,
      changedCount: 1,
      addedCount: 0,
      removedCount: 0,
      resizedCount: 0,
      unchangedCount: 0,
      entries: [
        {
          file: "x__desktop.png",
          id: "x",
          viewport: "desktop",
          status: "changed" as const,
          diffPixels: 12,
          width: 4,
          height: 4,
          diffFile: "diff/x__desktop.png",
        },
      ],
    };
    const md = buildCommentMarkdown(summary, { artifactOnly: true });
    expect(md).toContain("Artifact only");
    expect(md).not.toContain("![");
  });
});
