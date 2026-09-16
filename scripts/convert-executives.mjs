import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FONT_FILES = [
  "Montserrat-regular.ttf",
  "Montserrat-bold.ttf",
  "Montserrat-italic.ttf",
  "Montserrat-boldItalic.ttf",
  "MontserratExtraBold-bold.ttf",
  "MontserratExtraBold-boldItalic.ttf",
];

function unzipEntry(docxPath, entry) {
  return execFileSync("unzip", ["-p", docxPath, entry]);
}

function listEntries(docxPath) {
  return new Set(execFileSync("unzip", ["-Z1", docxPath]).toString("utf8").trim().split(/\n+/));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function slugify(fileName) {
  return path
    .basename(fileName, ".docx")
    .replace(/\s+-\s+DE$/i, "")
    .replace(/^\d+\.\s*/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function runStyle(runXml) {
  return {
    bold: /<w:b(?:\s|\/|>)/.test(runXml) && !/<w:b[^>]*w:val="0"/.test(runXml),
    italic: /<w:i(?:\s|\/|>)/.test(runXml) && !/<w:i[^>]*w:val="0"/.test(runXml),
  };
}

function mergeRuns(runs) {
  return runs.reduce((merged, run) => {
    var last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
    return merged;
  }, []);
}

function parseRuns(paragraphXml) {
  const runs = [];
  for (const match of paragraphXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)) {
    const runXml = match[0];
    let text = "";
    for (const textMatch of runXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      text += decodeXml(textMatch[1]);
    }
    if (!text) continue;
    runs.push({ ...runStyle(runXml), text });
  }
  return mergeRuns(runs);
}

function renderRuns(runs) {
  return runs
    .map((run) => {
      let value = escapeHtml(run.text);
      if (run.italic) value = `<em>${value}</em>`;
      if (run.bold) value = `<strong>${value}</strong>`;
      return value;
    })
    .join("");
}

function paragraphProperties(paragraphXml) {
  const pPr = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
  return {
    center: /<w:jc[^>]*w:val="center"/.test(pPr),
    justified: /<w:jc[^>]*w:val="both"/.test(pPr),
    list: /<w:numPr\b/.test(pPr),
    heading: /<w:pStyle[^>]*w:val="Heading/.test(pPr),
    indented: /<w:ind[^>]*w:firstLine="720"/.test(pPr),
    quoted: /<w:ind[^>]*w:left="600"/.test(pPr),
  };
}

function renderParagraph(paragraphXml, index) {
  const runs = parseRuns(paragraphXml);
  const text = runs.map((run) => run.text).join("").trim();
  const props = paragraphProperties(paragraphXml);
  if (!text) return null;

  const html = renderRuns(runs);
  if (props.list) return { type: "li", html };

  if (props.center && index < 2) {
    return { type: "block", html: `<h1>${html}</h1>` };
  }

  if (props.heading || /^\d+\.\s+/.test(text)) {
    return { type: "block", html: `<h2>${html}</h2>` };
  }

  const classes = [
    props.center ? "center" : "",
    props.justified ? "justify" : "",
    props.indented ? "indent" : "",
    props.quoted ? "quote" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { type: "block", html: `<p${classes ? ` class="${classes}"` : ""}>${html}</p>` };
}

function renderBlocks(blocks) {
  const out = [];
  let inList = false;
  for (const block of blocks) {
    if (block.type === "li") {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${block.html}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    out.push(block.html);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function parseDocument(xml) {
  const blocks = [];
  let index = 0;
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const block = renderParagraph(match[0], index);
    index += 1;
    if (block) blocks.push(block);
  }
  return renderBlocks(blocks);
}

function htmlDocument({ title, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Relatório executivo</title>
  <style>
    @font-face { font-family: Montserrat; src: url("assets/Montserrat-regular.ttf") format("truetype"); font-weight: 400; }
    @font-face { font-family: Montserrat; src: url("assets/Montserrat-bold.ttf") format("truetype"); font-weight: 700; }
    @font-face { font-family: Montserrat; src: url("assets/Montserrat-italic.ttf") format("truetype"); font-style: italic; }
    @font-face { font-family: Montserrat; src: url("assets/Montserrat-boldItalic.ttf") format("truetype"); font-style: italic; font-weight: 700; }
    @font-face { font-family: "Montserrat ExtraBold"; src: url("assets/MontserratExtraBold-bold.ttf") format("truetype"); font-weight: 800; }
    * { box-sizing: border-box; }
    html { background: #e8eef5; }
    body { margin: 0; color: #000; font: 12pt/1.5 Montserrat, Arial, sans-serif; }
    #pages { padding: 24px 0; }
    #source { display: none; }
    .page { width: 210mm; height: 297mm; margin: 0 auto 24px; position: relative; overflow: hidden; background: white url("assets/letterhead.jpg") center / 100% 100% no-repeat; box-shadow: 0 6px 24px #1f33241c; transform-origin: top center; break-after: page; page-break-after: always; }
    .content { position: absolute; top: 28mm; right: 25mm; bottom: 24mm; left: 25mm; z-index: 1; overflow: hidden; }
    h1 { margin: 0; text-align: center; font-family: "Montserrat ExtraBold", Montserrat, sans-serif; font-size: 24pt; line-height: 1.25; font-weight: 800; }
    h1 + h1 { margin-bottom: 22px; }
    h2 { margin: 22px 0 10px; font-size: 14pt; line-height: 1.3; font-weight: 700; }
    p { margin: 0 0 12px; }
    p.justify { text-align: justify; }
    p.indent { text-indent: 12.7mm; }
    p.quote { margin-left: 10.6mm; margin-right: 10.6mm; text-align: justify; }
    p.center { text-align: center; }
    ul { margin: 8px 0 16px 21px; padding: 0; }
    li { margin: 0 0 3px; text-align: justify; }
    @media print {
      html, body { background: white; }
      #pages { padding: 0; }
      .page { margin: 0; box-shadow: none; transform: none !important; }
    }
  </style>
</head>
<body>
  <main id="pages" aria-label="Relatório executivo"></main>
  <div id="source">
${body
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
  </div>
  <script>
    (function () {
      "use strict";

      var OVERFLOW_PX = 1;

      function childrenOf(el) {
        return Array.prototype.filter.call(el.childNodes, function (node) {
          return node.nodeType === 1;
        });
      }

      function overflows(content) {
        return content.scrollHeight - content.clientHeight > OVERFLOW_PX;
      }

      function makePage() {
        var article = document.createElement("article");
        article.className = "page";
        var content = document.createElement("section");
        content.className = "content";
        article.appendChild(content);
        return { article: article, content: content };
      }

      function isOrphanHeading(el) {
        return el && el.matches("h2");
      }

      function lastChild(el) {
        var kids = childrenOf(el);
        return kids.length ? kids[kids.length - 1] : null;
      }

      function appendGroup(content, group) {
        group.forEach(function (node) {
          content.appendChild(node);
        });
      }

      function detachGroup(group) {
        group.forEach(function (node) {
          if (node.parentNode) node.parentNode.removeChild(node);
        });
      }

      function takeGroup(queue) {
        var first = queue.shift();
        return [first];
      }

      function paginate() {
        var pages = document.getElementById("pages");
        var source = document.getElementById("source");
        pages.replaceChildren();
        var queue = childrenOf(source);
        source.replaceChildren();

        var page = makePage();
        pages.appendChild(page.article);

        while (queue.length) {
          var group = takeGroup(queue);
          appendGroup(page.content, group);
          if (!overflows(page.content)) continue;

          detachGroup(group);
          if (childrenOf(page.content).length) {
            var carried = [];
            var last = lastChild(page.content);
            while (isOrphanHeading(last)) {
              carried.unshift(last);
              page.content.removeChild(last);
              last = lastChild(page.content);
            }
            page = makePage();
            pages.appendChild(page.article);
            appendGroup(page.content, carried);
            appendGroup(page.content, group);
          } else {
            appendGroup(page.content, group);
          }
        }
      }

      function fit() {
        var pageWidth = (210 * 96) / 25.4;
        var pageHeight = (297 * 96) / 25.4;
        var scale = window.innerWidth < 830 ? (window.innerWidth - 16) / pageWidth : 1;
        document.querySelectorAll(".page").forEach(function (page) {
          page.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
          page.style.marginBottom = scale < 1 ? 24 - (1 - scale) * pageHeight + "px" : "";
        });
      }

      function boot() {
        paginate();
        fit();
        window.addEventListener("resize", fit);
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
      } else {
        boot();
      }
    })();
  </script>
</body>
</html>
`;
}

function findDocxWithEntry(docxPaths, entry) {
  for (const docxPath of docxPaths) {
    if (listEntries(docxPath).has(entry)) return docxPath;
  }
  throw new Error(`No DOCX contains ${entry}`);
}

async function copyAssets(docxPaths, outDir, letterheadPath) {
  const assetsDir = path.join(outDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const letterhead = letterheadPath
    ? await readFile(letterheadPath)
    : unzipEntry(findDocxWithEntry(docxPaths, "word/media/image1.jpg"), "word/media/image1.jpg");
  await writeFile(path.join(assetsDir, "letterhead.jpg"), letterhead);
  for (const font of FONT_FILES) {
    const entry = `word/fonts/${font}`;
    await writeFile(path.join(assetsDir, font), unzipEntry(findDocxWithEntry(docxPaths, entry), entry));
  }
}

export async function convertExecutives({ sourceDir, outDir, only, letterheadPath } = {}) {
  const files = (await readdir(sourceDir))
    .filter((file) => file.toLowerCase().endsWith(".docx"))
    .filter((file) => !only || only.includes(file))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  if (!files.length) {
    throw new Error(`No DOCX files found in ${sourceDir}`);
  }

  await mkdir(outDir, { recursive: true });
  const docxPaths = files.map((file) => path.join(sourceDir, file));
  await copyAssets(docxPaths, outDir, letterheadPath);

  const documents = [];
  for (const file of files) {
    const docxPath = path.join(sourceDir, file);
    const slug = slugify(file);
    const title = path.basename(file, ".docx").replace(/\s+-\s+DE$/i, "");
    const xml = unzipEntry(docxPath, "word/document.xml").toString("utf8");
    const body = parseDocument(xml);
    const html = htmlDocument({ title, body });
    await writeFile(path.join(outDir, `${slug}.html`), html, "utf8");
    documents.push({ file, slug, title, html });
  }

  return { documents };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  await convertExecutives({
    sourceDir: path.join(repoRoot, "documentos-executivos"),
    outDir: path.join(repoRoot, "executivos"),
    letterheadPath: path.join(repoRoot, "letterhead.jpg"),
  });
}
