import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("technical report links to executive HTML reports", async () => {
  const html = await readFile(path.join(repoRoot, "index.html"), "utf8");

  assert.match(html, /Relatórios executivos/);
  for (const slug of ["nexus", "saep", "gopro", "escreve-ai"]) {
    assert.match(html, new RegExp(`href="executivos/${slug}\\.html"`));
  }
});

test("technical platform profiles link to their executive reports in new tabs", async () => {
  const html = await readFile(path.join(repoRoot, "index.html"), "utf8");
  const profiles = [
    ["8.1 Hub Innovatis", "hub"],
    ["8.2 Admin Console", "admin-console"],
    ["8.3 Nexus", "nexus"],
    ["8.4 SAEP", "saep"],
    ["8.6 GoPro", "gopro"],
    ["8.7 Indicadores 2026", "indicadores-2026"],
    ["8.8 Comunidade InnovaNation", "comunidade-innovanation"],
    ["8.9 Innova Coin", "innovacoin"],
    ["8.10 Innova Books", "innovabooks"],
    ["8.11 Central de Editais", "editais"],
    ["8.12 Esplanada 4.0", "esplanada-4-0"],
    ["8.14 EscreveAI", "escreve-ai"],
  ];

  for (const [title, slug] of profiles) {
    const start = html.indexOf(title);
    assert.notEqual(start, -1, `profile not found: ${title}`);
    const next = html.indexOf('<h3 class="profile"', start + title.length);
    const section = html.slice(start, next === -1 ? html.length : next);
    assert.match(
      section,
      new RegExp(`class="executive-button" href="executivos/${slug}\\.html" target="_blank" rel="noopener"`),
      `missing executive link in ${title}`,
    );
  }
});
