(function () {
  "use strict";

  var LETTERHEAD = "letterhead.jpg";
  var FOOT_DEFAULT = "INNOVATIS · Panorama técnico das plataformas";
  var FOOT_TOC = "INNOVATIS · Documentação Técnica das Plataformas";
  var OVERFLOW_PX = 1;
  var MAX_PAGES = 80;

  function isElement(n) {
    return n && n.nodeType === 1;
  }

  function childrenOf(el) {
    return Array.prototype.filter.call(el.childNodes, isElement);
  }

  function overflows(content) {
    return content.scrollHeight - content.clientHeight > OVERFLOW_PX;
  }

  function makePage(isCover) {
    var article = document.createElement("article");
    article.className = isCover ? "page cover" : "page";

    var img = document.createElement("img");
    img.className = "letterhead";
    img.alt = "Papel timbrado Innovatis";
    img.src = LETTERHEAD;

    var content = document.createElement("div");
    content.className = "content";

    var footer = document.createElement("footer");
    footer.className = "page-footer";
    footer.innerHTML =
      '<span class="foot-label">' +
      FOOT_DEFAULT +
      '</span><span class="folio"></span>';

    article.appendChild(img);
    article.appendChild(content);
    article.appendChild(footer);
    return { article: article, content: content, footer: footer };
  }

  function continuedHeading(h3) {
    var h = h3.cloneNode(true);
    h.removeAttribute("id");
    var target = h.querySelector("strong") || h;
    if (target.textContent.indexOf("(cont.)") === -1) {
      target.appendChild(document.createTextNode(" (cont.)"));
    }
    return h;
  }

  function wrapFichas(root) {
    var nodes = childrenOf(root);
    var groups = [];
    var i = 0;
    while (i < nodes.length) {
      if (nodes[i].matches("h3.profile")) {
        var start = i;
        i += 1;
        while (i < nodes.length && !nodes[i].matches("h2, h3.profile")) {
          i += 1;
        }
        groups.push(nodes.slice(start, i));
        continue;
      }
      i += 1;
    }
    groups.forEach(function (group) {
      var wrap = document.createElement("section");
      wrap.className = "ficha";
      group[0].parentNode.insertBefore(wrap, group[0]);
      group.forEach(function (el) {
        wrap.appendChild(el);
      });
    });
  }

  function sameTableId(a, b) {
    var id = a && a.getAttribute && a.getAttribute("data-table");
    return !!(id && b && b.getAttribute && b.getAttribute("data-table") === id);
  }

  function mergeSameTables(queue) {
    var first = queue[0];
    if (!first || !first.matches("table")) return;
    var tbody = first.querySelector("tbody");
    if (!tbody) return;
    while (queue.length > 1 && queue[1].matches("table") && sameTableId(first, queue[1])) {
      var next = queue.splice(1, 1)[0];
      var nextBody = next.querySelector("tbody");
      if (!nextBody) continue;
      childrenOf(nextBody).forEach(function (tr) {
        tbody.appendChild(tr);
      });
    }
  }

  function takeGroup(queue) {
    mergeSameTables(queue);
    var first = queue.shift();
    var group = [first];
    if (!queue.length) return group;
    var next = queue[0];
    if (first.matches("figure") && next.matches("p.diagram-note, .diagram-note")) {
      group.push(queue.shift());
    } else if (first.matches("table") && next.matches("p.table-cont, .table-cont")) {
      group.push(queue.shift());
    }
    return group;
  }

  function appendAll(parent, nodes) {
    nodes.forEach(function (n) {
      parent.appendChild(n);
    });
  }

  function detachAll(nodes) {
    nodes.forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function isOrphanHeading(el) {
    return el && el.matches("h2, h3:not(.profile)");
  }

  function lastChild(el) {
    var kids = childrenOf(el);
    return kids.length ? kids[kids.length - 1] : null;
  }

  function Paginate() {
    this.pagesEl = document.getElementById("pages");
    this.pages = [];
    this.page = null;
  }

  Paginate.prototype.addPage = function (isCover) {
    if (this.pages.length >= MAX_PAGES) {
      throw new Error("Pagination exceeded " + MAX_PAGES + " pages");
    }
    this.page = makePage(!!isCover);
    this.pagesEl.appendChild(this.page.article);
    this.pages.push(this.page);
    return this.page;
  };

  Paginate.prototype.hasContent = function () {
    return childrenOf(this.page.content).length > 0;
  };

  Paginate.prototype.fits = function (nodes) {
    appendAll(this.page.content, nodes);
    var ok = !overflows(this.page.content);
    if (!ok) detachAll(nodes);
    return ok;
  };

  Paginate.prototype.startNextPage = function () {
    var old = this.page;
    var carried = [];
    var last = lastChild(old.content);
    while (isOrphanHeading(last)) {
      carried.unshift(last);
      old.content.removeChild(last);
      last = lastChild(old.content);
    }
    var oldEmpty = childrenOf(old.content).length === 0;
    this.addPage(false);
    var self = this;
    carried.forEach(function (el) {
      self.page.content.appendChild(el);
    });
    if (oldEmpty) {
      old.article.remove();
      var idx = this.pages.indexOf(old);
      if (idx >= 0) this.pages.splice(idx, 1);
    }
  };

  Paginate.prototype.splitFicha = function (ficha) {
    var heading = ficha.querySelector("h3.profile");
    var parts = childrenOf(ficha).filter(function (el) {
      return el !== heading;
    });

    var wrap = document.createElement("section");
    wrap.className = "ficha";
    wrap.appendChild(heading);
    this.page.content.appendChild(wrap);

    var usedContinuation = false;
    var i = 0;
    while (i < parts.length) {
      var child = parts[i];
      wrap.appendChild(child);
      if (!overflows(this.page.content)) {
        i += 1;
        continue;
      }
      wrap.removeChild(child);

      var onlyHeading = childrenOf(wrap).length === 1;
      if (onlyHeading && childrenOf(this.page.content).length === 1 && !this.hasSiblingsBeside(wrap)) {
        wrap.appendChild(child);
        i += 1;
        continue;
      }

      if (onlyHeading && childrenOf(this.page.content).length > 1) {
        this.page.content.removeChild(wrap);
        this.startNextPage();
        wrap = document.createElement("section");
        wrap.className = "ficha";
        wrap.appendChild(heading);
        this.page.content.appendChild(wrap);
        continue;
      }

      this.startNextPage();
      wrap = document.createElement("section");
      wrap.className = "ficha";
      wrap.appendChild(continuedHeading(heading));
      usedContinuation = true;
      this.page.content.appendChild(wrap);
    }
    return usedContinuation;
  };

  Paginate.prototype.hasSiblingsBeside = function (el) {
    return childrenOf(el.parentNode).length > 1;
  };

  Paginate.prototype.splitTable = function (table, trailing) {
    var thead = table.querySelector("thead");
    var tbody = table.querySelector("tbody");
    var rows = tbody ? childrenOf(tbody) : [];
    if (!rows.length) {
      this.page.content.appendChild(table);
      if (trailing) this.page.content.appendChild(trailing);
      return;
    }

    var colgroup = table.querySelector("colgroup");
    var makeFrag = function () {
      var frag = table.cloneNode(false);
      if (colgroup) frag.appendChild(colgroup.cloneNode(true));
      if (thead) frag.appendChild(thead.cloneNode(true));
      var body = document.createElement("tbody");
      frag.appendChild(body);
      return { table: frag, body: body };
    };

    var frag = makeFrag();
    this.page.content.appendChild(frag.table);

    for (var r = 0; r < rows.length; r += 1) {
      frag.body.appendChild(rows[r]);
      if (!overflows(this.page.content)) continue;
      frag.body.removeChild(rows[r]);
      if (!frag.body.children.length) {
        var onlyThisTable = childrenOf(this.page.content).length === 1;
        if (!onlyThisTable) {
          this.page.content.removeChild(frag.table);
          this.startNextPage();
          frag = makeFrag();
          this.page.content.appendChild(frag.table);
        }
        frag.body.appendChild(rows[r]);
        continue;
      }
      this.startNextPage();
      frag = makeFrag();
      this.page.content.appendChild(frag.table);
      frag.body.appendChild(rows[r]);
      if (overflows(this.page.content) && frag.body.children.length === 1) {
        /* single row taller than the page: keep it rather than looping */
      }
    }
    if (trailing) {
      this.page.content.appendChild(trailing);
      if (overflows(this.page.content)) {
        this.page.content.removeChild(trailing);
        this.startNextPage();
        this.page.content.appendChild(trailing);
      }
    }
  };

  Paginate.prototype.place = function (group) {
    if (this.fits(group)) return;

    var first = group[0];
    if (first.matches("table")) {
      this.splitTable(first, group[1] || null);
      return;
    }

    if (this.hasContent()) {
      this.startNextPage();
      if (this.fits(group)) return;
    }

    if (first.matches("section.ficha") && group.length === 1) {
      this.splitFicha(first);
      return;
    }

    appendAll(this.page.content, group);
  };

  Paginate.prototype.numberPages = function () {
    var total = this.pages.length;
    this.pages.forEach(function (page, i) {
      var folio = page.footer.querySelector(".folio");
      folio.textContent = i + 1 + " / " + total;
      var label = page.footer.querySelector(".foot-label");
      if (page.content.querySelector(".toc-entry")) {
        label.textContent = FOOT_TOC;
      } else {
        label.textContent = FOOT_DEFAULT;
      }
    });
    var totalEl = document.getElementById("page-total");
    if (totalEl) {
      totalEl.textContent = total + " páginas · A4";
    }
  };

  Paginate.prototype.updateToc = function () {
    var pages = this.pages;
    document.querySelectorAll("[data-toc]").forEach(function (span) {
      var id = span.getAttribute("data-toc");
      var target = document.getElementById(id);
      if (!target) return;
      var article = target.closest(".page");
      var idx = -1;
      for (var i = 0; i < pages.length; i += 1) {
        if (pages[i].article === article) {
          idx = i + 1;
          break;
        }
      }
      if (idx > 0) span.textContent = String(idx);
    });
  };

  Paginate.prototype.run = function () {
    this.pagesEl.replaceChildren();
    this.pagesEl.classList.add("rendering");

    var coverSrc = document.getElementById("source-cover");
    this.addPage(true);
    while (coverSrc.firstChild) {
      this.page.content.appendChild(coverSrc.firstChild);
    }

    var source = document.getElementById("source");
    wrapFichas(source);
    var queue = childrenOf(source);
    source.replaceChildren();

    this.addPage(false);
    while (queue.length) {
      var group = takeGroup(queue);
      this.place(group);
    }

    if (!this.hasContent() && this.pages.length > 1) {
      this.pagesEl.removeChild(this.page.article);
      this.pages.pop();
    }

    this.numberPages();
    this.updateToc();
    this.pagesEl.classList.remove("rendering");
  };

  function fit() {
    var width = window.innerWidth;
    document.querySelectorAll(".page").forEach(function (p) {
      var scale = width < 830 ? (width - 16) / ((210 * 96) / 25.4) : 1;
      p.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
      p.style.marginBottom =
        scale < 1 ? 24 - (1 - scale) * 297 * (96 / 25.4) + "px" : "";
    });
  }

  function boot() {
    var engine = new Paginate();
    engine.run();
    var printBtn = document.getElementById("print");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        window.print();
      });
    }
    window.addEventListener("resize", fit);
    fit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
