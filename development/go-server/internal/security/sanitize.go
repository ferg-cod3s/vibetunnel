package security

import (
	"html"
	"regexp"
	"strings"
)

// SanitizeInput sanitizes user input to prevent XSS and other injection attacks
func SanitizeInput(input string) string {
	if input == "" {
		return input
	}

	// HTML escape to prevent XSS
	sanitized := html.EscapeString(input)

	// Remove potentially dangerous patterns
	sanitized = removeDangerousPatterns(sanitized)

	// Limit length to prevent DoS
	if len(sanitized) > 1000 {
		sanitized = sanitized[:1000]
	}

	return sanitized
}

// SanitizeTitle specifically sanitizes session titles and similar display text
func SanitizeTitle(title string) string {
	if title == "" {
		return title
	}

	// HTML escape
	sanitized := html.EscapeString(title)

	// Remove script tags and event handlers
	sanitized = removeScriptTags(sanitized)
	sanitized = removeEventHandlers(sanitized)

	// Limit title length
	if len(sanitized) > 200 {
		sanitized = sanitized[:200]
	}

	return sanitized
}

// SanitizeCommand sanitizes command input (more permissive than general input)
func SanitizeCommand(command string) string {
	if command == "" {
		return command
	}

	// For commands, we mainly want to prevent XSS in display but allow shell commands
	// Only escape HTML entities, don't remove shell operators
	sanitized := html.EscapeString(command)

	// Limit command length
	if len(sanitized) > 2000 {
		sanitized = sanitized[:2000]
	}

	return sanitized
}

// removeDangerousPatterns removes or neutralizes dangerous patterns
func removeDangerousPatterns(input string) string {
	// Remove javascript: protocol
	jsProtocol := regexp.MustCompile(`(?i)javascript\s*:`)
	input = jsProtocol.ReplaceAllString(input, "")

	// Remove data: URIs with scripts
	dataScript := regexp.MustCompile(`(?i)data\s*:\s*[^,]*script`)
	input = dataScript.ReplaceAllString(input, "")

	// Remove vbscript: protocol
	vbScript := regexp.MustCompile(`(?i)vbscript\s*:`)
	input = vbScript.ReplaceAllString(input, "")

	return input
}

// removeScriptTags removes script tags and their content
func removeScriptTags(input string) string {
	scriptTag := regexp.MustCompile(`(?i)<script[^>]*>.*?</script>`)
	input = scriptTag.ReplaceAllString(input, "")

	// Remove unclosed script tags
	openScriptTag := regexp.MustCompile(`(?i)<script[^>]*>`)
	input = openScriptTag.ReplaceAllString(input, "")

	return input
}

// removeEventHandlers removes HTML event handlers
func removeEventHandlers(input string) string {
	// Common event handlers that could execute JavaScript
	events := []string{
		"onload", "onerror", "onclick", "onmouseover", "onmouseout",
		"onkeydown", "onkeyup", "onkeypress", "onfocus", "onblur",
		"onsubmit", "onreset", "onchange", "onselect", "onresize",
		"onscroll", "ondblclick", "onmousedown", "onmouseup",
		"onmousemove", "oncontextmenu", "ondrag", "ondrop",
	}

	for _, event := range events {
		// Remove event handlers (case insensitive)
		eventRegex := regexp.MustCompile(`(?i)\s*` + event + `\s*=\s*[^>\s]*`)
		input = eventRegex.ReplaceAllString(input, "")
	}

	return input
}

// ValidateInput performs additional validation on sanitized input
func ValidateInput(input string) bool {
	// Check for remaining suspicious patterns after sanitization
	suspicious := []string{
		"<script", "javascript:", "vbscript:", "onload=", "onerror=",
		"data:text/html", "&#", "\\x", "\\u00",
	}

	lowerInput := strings.ToLower(input)
	for _, pattern := range suspicious {
		if strings.Contains(lowerInput, pattern) {
			return false
		}
	}

	return true
}

// SanitizeAndValidate combines sanitization and validation
func SanitizeAndValidate(input string) (string, bool) {
	sanitized := SanitizeInput(input)
	valid := ValidateInput(sanitized)
	return sanitized, valid
}

// SanitizeTitleAndValidate sanitizes and validates titles specifically
func SanitizeTitleAndValidate(title string) (string, bool) {
	sanitized := SanitizeTitle(title)
	valid := ValidateInput(sanitized)
	return sanitized, valid
}
