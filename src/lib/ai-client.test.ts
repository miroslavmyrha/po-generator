import { describe, it, expect } from 'vitest';
import { cleanHtmlContent, parseJsonResponse } from './ai-client.js';

/**
 * Tests for AI client helper functions
 *
 * WHY these tests matter:
 * - cleanHtmlContent prepares HTML for AI analysis - wrong cleaning = bad analysis
 * - parseJsonResponse handles AI response quirks - critical for reliability
 * - AI responses can be unpredictable, these functions add robustness
 */

describe('cleanHtmlContent', () => {
  it('removes script tags', () => {
    const html = '<div>Content</div><script>alert("xss")</script><p>More</p>';
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('<div>Content</div>');
    expect(result).toContain('<p>More</p>');
  });

  it('removes script tags with attributes', () => {
    const html = '<script src="app.js" type="module"></script><div>Content</div>';
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('<script');
    expect(result).toContain('<div>Content</div>');
  });

  it('removes inline script content', () => {
    const html = `
      <div>Before</div>
      <script>
        const data = { key: "value" };
        console.log(data);
      </script>
      <div>After</div>
    `;
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('const data');
    expect(result).not.toContain('console.log');
  });

  it('removes style tags', () => {
    const html = '<style>.red { color: red; }</style><div class="red">Content</div>';
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('<style>');
    expect(result).not.toContain('color: red');
    expect(result).toContain('<div class="red">Content</div>');
  });

  it('removes style tags with attributes', () => {
    const html = '<style type="text/css">.class{}</style><p>Text</p>';
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('<style');
    expect(result).toContain('<p>Text</p>');
  });

  it('removes HTML comments', () => {
    const html = '<div>Visible</div><!-- This is a comment --><p>More</p>';
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('<!--');
    expect(result).not.toContain('This is a comment');
    expect(result).toContain('<div>Visible</div>');
    expect(result).toContain('<p>More</p>');
  });

  it('removes multi-line comments', () => {
    const html = `
      <div>Before</div>
      <!--
        Multi-line
        comment
        here
      -->
      <div>After</div>
    `;
    const result = cleanHtmlContent(html);

    expect(result).not.toContain('Multi-line');
    expect(result).not.toContain('comment');
  });

  it('truncates content to 50000 characters', () => {
    const longHtml = '<div>' + 'a'.repeat(60000) + '</div>';
    const result = cleanHtmlContent(longHtml);

    expect(result.length).toBe(50000);
  });

  it('preserves content under 50000 characters', () => {
    const html = '<div>Short content</div>';
    const result = cleanHtmlContent(html);

    expect(result).toBe('<div>Short content</div>');
  });

  it('handles empty input', () => {
    expect(cleanHtmlContent('')).toBe('');
  });

  it('handles input with only scripts and styles', () => {
    const html = '<script>code</script><style>.class{}</style>';
    const result = cleanHtmlContent(html);

    expect(result).toBe('');
  });

  it('handles nested scripts (edge case)', () => {
    // This shouldn't happen in valid HTML, but test robustness
    const html = '<div><script>outer<script>inner</script></script></div>';
    const result = cleanHtmlContent(html);

    // Should handle this gracefully
    expect(result).not.toContain('inner');
  });

  it('preserves data attributes', () => {
    const html = '<button data-testid="submit" data-action="save">Save</button>';
    const result = cleanHtmlContent(html);

    expect(result).toContain('data-testid="submit"');
    expect(result).toContain('data-action="save"');
  });

  it('preserves Vue/Stimulus attributes', () => {
    const html = `
      <div data-controller="modal" @click="open">
        <span v-if="visible">Content</span>
      </div>
    `;
    const result = cleanHtmlContent(html);

    expect(result).toContain('data-controller="modal"');
    expect(result).toContain('@click="open"');
    expect(result).toContain('v-if="visible"');
  });
});

describe('parseJsonResponse', () => {
  it('parses clean JSON response', () => {
    const response = '{"key": "value", "number": 42}';
    const result = parseJsonResponse(response);

    expect(result).toEqual({ key: 'value', number: 42 });
  });

  it('extracts JSON from markdown code block', () => {
    const response = `Here is the analysis:

\`\`\`json
{
  "pageAnalysis": {
    "url": "/test"
  }
}
\`\`\`

Hope this helps!`;

    const result = parseJsonResponse(response) as { pageAnalysis: { url: string } };

    expect(result.pageAnalysis.url).toBe('/test');
  });

  it('extracts JSON from text with surrounding content', () => {
    const response = `I analyzed the page and here's what I found:

{
  "elements": [
    {"name": "button1"}
  ]
}

Let me know if you need more details.`;

    const result = parseJsonResponse(response) as { elements: Array<{ name: string }> };

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].name).toBe('button1');
  });

  it('handles JSON with nested objects', () => {
    const response = `{
      "outer": {
        "inner": {
          "deep": "value"
        }
      }
    }`;

    const result = parseJsonResponse(response) as {
      outer: { inner: { deep: string } };
    };

    expect(result.outer.inner.deep).toBe('value');
  });

  it('throws error for null input', () => {
    expect(() => parseJsonResponse(null)).toThrow('Empty AI response');
  });

  it('throws error for empty string', () => {
    expect(() => parseJsonResponse('')).toThrow('Empty AI response');
  });

  it('throws error when no JSON found', () => {
    const response = 'This is just plain text without any JSON.';

    expect(() => parseJsonResponse(response)).toThrow('No JSON found in response');
  });

  it('throws error for invalid JSON', () => {
    const response = '{ invalid json: missing quotes }';

    expect(() => parseJsonResponse(response)).toThrow(); // JSON.parse error
  });

  it('handles JSON with arrays', () => {
    const response = `{
      "items": [1, 2, 3],
      "nested": [{"a": 1}, {"b": 2}]
    }`;

    const result = parseJsonResponse(response) as {
      items: number[];
      nested: Array<{ a?: number; b?: number }>;
    };

    expect(result.items).toEqual([1, 2, 3]);
    expect(result.nested).toHaveLength(2);
  });

  it('extracts first JSON object when response contains multiple objects', () => {
    const response = `
      First object: {"first": true}
      Second object: {"second": true}
    `;

    // Balanced bracket matching extracts the first complete JSON object
    // This is correct behavior - gracefully handles multiple objects
    const result = parseJsonResponse(response) as { first?: boolean };
    expect(result.first).toBe(true);
  });

  it('handles JSON with special characters in strings', () => {
    const response = `{
      "selector": "[data-id=\\"test\\"]",
      "text": "Hello\\nWorld",
      "path": "C:\\\\Users\\\\test"
    }`;

    const result = parseJsonResponse(response) as {
      selector: string;
      text: string;
      path: string;
    };

    expect(result.selector).toBe('[data-id="test"]');
    expect(result.text).toBe('Hello\nWorld');
  });

  it('handles AI response with thinking prefix', () => {
    const response = `Let me analyze this page...

After careful consideration, here's the structured data:

{
  "pageAnalysis": {
    "purpose": "Login page"
  }
}`;

    const result = parseJsonResponse(response) as {
      pageAnalysis: { purpose: string };
    };

    expect(result.pageAnalysis.purpose).toBe('Login page');
  });
});
