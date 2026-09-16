import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { convertExecutives } from "./convert-executives.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(repoRoot, "documentos-executivos");
const letterheadPath = path.join(repoRoot, "letterhead.jpg");

test("converts executive DOCX files into branded standalone HTML", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "executivos-test-"));

  try {
    const result = await convertExecutives({
      sourceDir,
      outDir,
      only: ["NEXUS - DE.docx"],
      letterheadPath,
    });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].slug, "nexus");
    assert.match(result.documents[0].html, /DOCUMENTAÇÃO EXECUTIVA/);
    assert.match(result.documents[0].html, /NEXUS/);
    assert.match(result.documents[0].html, /<strong>OBJETIVO CENTRAL:<\/strong>/);
    assert.match(result.documents[0].html, /assets\/letterhead\.jpg/);
    assert.match(result.documents[0].html, /@font-face/);
    assert.match(result.documents[0].html, /<ul>/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("uses the technical report letterhead as the canonical executive background", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "executivos-test-"));

  try {
    await convertExecutives({
      sourceDir,
      outDir,
      only: ["NEXUS - DE.docx"],
      letterheadPath,
    });

    assert.deepEqual(
      await readFile(path.join(outDir, "assets", "letterhead.jpg")),
      await readFile(letterheadPath),
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("keeps executive pages fixed to A4 and scales them on screen", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "executivos-test-"));

  try {
    const result = await convertExecutives({
      sourceDir,
      outDir,
      only: ["ESPLANADA 4.0 - DE.docx"],
      letterheadPath,
    });

    assert.match(result.documents[0].html, /\.page \{[^}]*height: 297mm;/s);
    assert.doesNotMatch(result.documents[0].html, /min-height: 297mm/);
    assert.match(result.documents[0].html, /function paginate\(\)/);
    assert.match(result.documents[0].html, /function fit\(\)/);
    assert.match(result.documents[0].html, /overflow: hidden/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("converts the whole executive report folder despite font variations", async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), "executivos-test-"));

  try {
    const result = await convertExecutives({ sourceDir, outDir });

    assert.equal(result.documents.length, 15);
    assert.ok(result.documents.some((document) => document.slug === "servicos-digitais"));
    assert.ok(result.documents.some((document) => document.slug === "nexus"));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
