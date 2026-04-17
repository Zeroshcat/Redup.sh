package linkpreview

import (
	"io"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// parseHTML walks an HTML document and returns the best metadata it
// can find. The parse is stop-on-first-win per field: og:title beats
// twitter:title beats <title>, and the first match for each is kept.
// Page URLs embedded in metadata (og:url, og:image, favicon) are
// resolved against baseURL so a downstream renderer always gets
// absolute URLs.
func parseHTML(body io.Reader, baseURL *url.URL) (title, desc, image, siteName, canonical, favicon string) {
	z := html.NewTokenizer(body)

	// inTitle guards the <title> text capture — we only take the
	// first run of chars because some sites put trailing junk
	// inside nested elements.
	inTitle := false
	var titleText strings.Builder

	for {
		tt := z.Next()
		switch tt {
		case html.ErrorToken:
			goto done
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := z.TagName()
			tag := string(name)
			switch tag {
			case "meta":
				if !hasAttr {
					continue
				}
				prop, content, named := readMeta(z)
				if content == "" {
					continue
				}
				switch prop {
				case "og:title":
					if title == "" {
						title = content
					}
				case "og:description":
					if desc == "" {
						desc = content
					}
				case "og:image", "og:image:url", "og:image:secure_url":
					if image == "" {
						image = absolute(baseURL, content)
					}
				case "og:site_name":
					if siteName == "" {
						siteName = content
					}
				case "og:url":
					if canonical == "" {
						canonical = absolute(baseURL, content)
					}
				case "twitter:title":
					if title == "" {
						title = content
					}
				case "twitter:description":
					if desc == "" {
						desc = content
					}
				case "twitter:image", "twitter:image:src":
					if image == "" {
						image = absolute(baseURL, content)
					}
				}
				switch named {
				case "description":
					if desc == "" {
						desc = content
					}
				case "application-name":
					if siteName == "" {
						siteName = content
					}
				}
			case "title":
				inTitle = true
			case "link":
				if !hasAttr {
					continue
				}
				rel, href := readLink(z)
				if href == "" {
					continue
				}
				switch rel {
				case "canonical":
					if canonical == "" {
						canonical = absolute(baseURL, href)
					}
				case "icon", "shortcut icon", "apple-touch-icon":
					if favicon == "" {
						favicon = absolute(baseURL, href)
					}
				}
			case "body":
				// Don't read the body — metadata we care about is all
				// in <head>, and stopping here bounds the parser's
				// work on huge pages.
				goto done
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			if string(name) == "title" {
				inTitle = false
			}
		case html.TextToken:
			if inTitle && title == "" {
				if s := strings.TrimSpace(string(z.Text())); s != "" {
					titleText.WriteString(s)
				}
			}
		}
	}

done:
	if title == "" && titleText.Len() > 0 {
		title = titleText.String()
	}
	// Last-resort favicon: /favicon.ico at the host root. Still
	// subject to the renderer's own fallback if it 404s.
	if favicon == "" && baseURL != nil {
		favicon = baseURL.Scheme + "://" + baseURL.Host + "/favicon.ico"
	}
	return
}

// readMeta pulls the (property|name, content) pair off a <meta> tag.
// Returns ("", "", "") when neither property nor name is set.
func readMeta(z *html.Tokenizer) (prop, content, named string) {
	for {
		k, v, more := z.TagAttr()
		key := strings.ToLower(string(k))
		val := string(v)
		switch key {
		case "property":
			prop = strings.ToLower(strings.TrimSpace(val))
		case "name":
			named = strings.ToLower(strings.TrimSpace(val))
		case "content":
			content = strings.TrimSpace(val)
		}
		if !more {
			return
		}
	}
}

func readLink(z *html.Tokenizer) (rel, href string) {
	for {
		k, v, more := z.TagAttr()
		key := strings.ToLower(string(k))
		val := string(v)
		switch key {
		case "rel":
			rel = strings.ToLower(strings.TrimSpace(val))
		case "href":
			href = strings.TrimSpace(val)
		}
		if !more {
			return
		}
	}
}

// absolute resolves ref against base, returning the empty string when
// resolution fails. Absolute URLs pass through unchanged.
func absolute(base *url.URL, ref string) string {
	if ref == "" {
		return ""
	}
	if base == nil {
		return ref
	}
	parsed, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	return base.ResolveReference(parsed).String()
}
