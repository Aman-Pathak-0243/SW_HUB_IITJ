import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml, isSafeHref, markdownPreview } from "../lib/markdown/render.mjs";

describe("markdown: escapeHtml (escape-first, DL-077)", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" & 'y'>`)).toBe("&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;");
  });
});

describe("markdown: security (injection is structurally impossible)", () => {
  it("escapes raw HTML / <script> so it can never execute", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops a javascript: link (renders the text, no href)", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });

  it("drops a data: link and a control-char-obfuscated javascript: link", () => {
    expect(renderMarkdown("[x](data:text/html,<b>)")).not.toContain("href");
    expect(isSafeHref("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
  });

  it("allows http(s), mailto, relative and anchor hrefs", () => {
    expect(isSafeHref("https://iitjammu.ac.in")).toBe(true);
    expect(isSafeHref("http://x.test")).toBe(true);
    expect(isSafeHref("mailto:a@b.c")).toBe(true);
    expect(isSafeHref("/org/clubs/x")).toBe(true);
    expect(isSafeHref("#section")).toBe(true);
    expect(isSafeHref("ftp://x")).toBe(false);
    expect(isSafeHref("")).toBe(false);
  });
});

describe("markdown: rendering subset", () => {
  it("renders headings", () => {
    expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("### Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders bold + italic + inline code", () => {
    expect(renderMarkdown("**b**")).toBe("<p><strong>b</strong></p>");
    expect(renderMarkdown("_i_")).toBe("<p><em>i</em></p>");
    expect(renderMarkdown("`c`")).toBe("<p><code>c</code></p>");
  });

  it("renders a safe link with target+rel", () => {
    const html = renderMarkdown("[IITJ](https://iitjammu.ac.in)");
    expect(html).toContain('<a href="https://iitjammu.ac.in"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain(">IITJ</a>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders a fenced code block with contents escaped", () => {
    const html = renderMarkdown("```\n<x> & y\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("&lt;x&gt; &amp; y");
  });

  it("groups paragraphs (blank line separates; single newline → <br>)", () => {
    const html = renderMarkdown("line one\nline two\n\npara two");
    expect(html).toBe("<p>line one<br/>line two</p>\n<p>para two</p>");
  });

  it("empty / nullish input renders empty", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });
});

describe("markdown: markdownPreview", () => {
  it("strips markup + truncates", () => {
    expect(markdownPreview("# Hi\n\n**bold** [x](https://y)")).toBe("Hi bold x");
    const long = markdownPreview("word ".repeat(100), 20);
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith("…")).toBe(true);
  });
});
