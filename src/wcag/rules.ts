import type { Category, RuleMeta, Severity } from '../types';

/**
 * Every rule the tool can report, in one place.
 * To add a rule: add an entry here, then emit findings with its id from a scanner.
 *
 * level 'Project'       = an RBI audit expectation that WCAG itself does not strictly require.
 * level 'Best practice' = good practice only.
 * Both are reported, but they never change the WCAG AA verdict.
 */
const R: Record<string, RuleMeta> = {};

function rule(
  id: string, wcag: string, category: Category, severity: Severity, title: string,
  expected: string, fix: string, why: string, extra: Partial<RuleMeta> = {},
): void {
  R[id] = { id, wcag, category, severity, title, expected, fix, why, ...extra };
}

const SR_NOTE = 'Markup can be checked by the tool; what a screen reader actually says cannot.';

// ---------------------------------------------------------------- Colour contrast
rule('contrast.text', '1.4.3', 'Color Contrast', 'Serious', 'Insufficient color contrast for text.',
  'Normal text needs at least 4.5:1; large text (24px, or 18.66px bold) needs at least 3:1.',
  'Darken or lighten the text or its background until the ratio is met.',
  'The computed text colour and the computed colour painted behind it give a ratio below the WCAG AA minimum.',
  { regression: 'Insufficient color contrast for text', bug: 'The "{name}" text has insufficient color contrast. The detected contrast ratio is {ratio}:1, while WCAG AA requires at least {required}:1.' });
rule('contrast.text.review', '1.4.3', 'Color Contrast', 'Serious', 'Text contrast could not be measured automatically.',
  'Text needs 4.5:1 (3:1 for large text) against every part of what is behind it.',
  'If it fails by eye, add a solid or semi-opaque backing behind the text.',
  'The text sits on an image, video, mixed gradient or SVG shape, so there is no single background colour to measure.',
  { manual: 'Use a colour picker on the lightest and darkest pixels directly behind the text and calculate the ratio for both.' });
rule('contrast.placeholder', '1.4.3', 'Color Contrast', 'Serious', 'Insufficient color contrast for placeholder text.',
  'Placeholder text needs at least 4.5:1.', 'Use a darker ::placeholder colour.',
  'The computed ::placeholder colour against the field background is below the minimum.',
  { regression: 'Insufficient color contrast for text', bug: 'The placeholder text "{name}" has insufficient color contrast. The detected contrast ratio is {ratio}:1, while WCAG AA requires at least {required}:1.' });
rule('contrast.nontext', '1.4.11', 'Color Contrast', 'Serious', 'Insufficient color contrast for non-text content.',
  'UI component boundaries, states and meaningful icons need at least 3:1 against adjacent colours.',
  'Increase the contrast of the border, fill or icon colour.',
  'The border, fill, ring or icon colour that identifies this component is below 3:1 against the colour around it.',
  { regression: 'Insufficient color contrast for non-text content', bug: 'The {what} of "{name}" has insufficient color contrast. The detected contrast ratio is {ratio}:1, while WCAG AA requires at least 3:1.' });
rule('contrast.nontext.review', '1.4.11', 'Color Contrast', 'Moderate', 'Non-text contrast could not be measured automatically.',
  'Meaningful graphics and control boundaries need at least 3:1.', 'Increase the contrast if it fails by eye.',
  'The component sits on an image, or uses colours the tool cannot attribute with certainty.',
  { manual: 'Check the icon or control edge against its surroundings with a colour picker; it needs 3:1.' });
rule('contrast.state', '1.4.3', 'Color Contrast', 'Serious', 'Insufficient color contrast for text on hover or focus.',
  'Text keeps at least 4.5:1 (3:1 for large text) when the control is hovered or focused.',
  'Choose hover and focus colours that keep the required ratio.',
  'With the hover or focus state forced on, the computed text colour against the computed background is below the WCAG AA minimum.',
  { regression: 'Insufficient color contrast for text', bug: 'The "{name}" text has insufficient color contrast on {state}. The detected contrast ratio is {ratio}:1, while WCAG AA requires at least {required}:1.' });
rule('contrast.border', '1.4.11', 'Color Contrast', 'Moderate', 'Insufficient color contrast for non-text content.',
  'The visible border of a button, link or other control has at least 3:1 against the colour next to it.',
  'Use a border colour with at least 3:1 against the background, or give the control a fill that reaches 3:1.',
  'The border of this control is below 3:1 against both the colour outside it and its own fill. WCAG strictly requires 3:1 only when the border is the only thing that identifies the control, so this is reported as an RBI project rule.',
  { level: 'Project', regression: 'Insufficient color contrast for non-text content', bug: 'The border of "{name}" has insufficient color contrast. The detected contrast ratio is {ratio}:1, while at least 3:1 is needed.' });
rule('contrast.border.review', '1.4.11', 'Color Contrast', 'Minor', 'Border colour is below 3:1.',
  'Borders that carry meaning (they mark a state, separate data, or are the only edge of a clickable area) have at least 3:1.',
  'Darken the border, or make sure the meaning is given another way.',
  'The border of a card, panel, table or divider is below 3:1 against the colours next to it. WCAG needs 3:1 only when the border carries meaning; decorative borders are exempt.',
  { regression: 'Insufficient color contrast for non-text content', manual: 'Look at the element. Log it only if the border carries meaning: it marks a selected or error state, separates data, or is the only visible edge of something clickable.' });
rule('contrast.link-in-text', '1.4.1', 'Color Contrast', 'Serious', 'Link inside text is identified by colour alone.',
  'A link with no underline must differ from the surrounding text by at least 3:1, or have another non-colour cue.',
  'Underline links inside sentences, or raise the colour difference to 3:1.',
  'The link has no underline, border or weight change, and its colour is under 3:1 against the surrounding text colour.',
  { bug: 'The "{name}" link inside running text is distinguished only by colour ({ratio}:1 against the surrounding text; 3:1 is needed).' });

// ---------------------------------------------------------------- Focus
rule('focus.missing', '2.4.7', 'Focus', 'Serious', 'Focus is missing for links and buttons.',
  'Every keyboard-focusable element shows a visible focus indicator.',
  'Do not remove the outline without replacing it. Add a :focus-visible style, for example a 2px outline with 3:1 contrast.',
  'When the element received keyboard focus none of outline, border, box-shadow, background, colour or text-decoration changed, and its pixels did not change.',
  { regression: 'Focus is missing for links and buttons', bug: 'Keyboard focus is not visible on the "{name}" {role}.' });
rule('focus.unclear', '1.4.11', 'Focus', 'Serious', 'Focus is not clearly visible for buttons, links, etc.',
  'The focus indicator has at least 3:1 contrast against the colours next to it.',
  'Use a focus colour with 3:1 contrast against the background, at least 2px thick.',
  'A focus indicator exists, but its colour is below 3:1 against the background it is drawn on.',
  { regression: 'Focus is not clearly visible for buttons, links, etc.', bug: 'Keyboard focus is not clearly visible on the "{name}" {role}. The focus indicator contrast is {ratio}:1; at least 3:1 is needed.' });
rule('focus.review', '2.4.7', 'Focus', 'Moderate', 'Focus indicator needs a manual check.',
  'Every keyboard-focusable element shows a visible focus indicator.', 'Add a clear :focus-visible style if it is hard to see.',
  'Something changed on focus, but the tool cannot tell whether it is a clear enough indicator (for example only a colour change, or a change drawn by another element).',
  { manual: 'Tab to the element and confirm the focus indicator is easy to see.' });
rule('focus.obscured', '2.4.11', 'Focus', 'Serious', 'Focused element is hidden behind other content.',
  'A focused element is not entirely hidden by sticky headers, footers or overlays.',
  'Add scroll-padding to the page, or reduce or unstick the covering element.',
  'When the element had keyboard focus, every sampled point of it was covered by a fixed or sticky element.',
  { bug: 'When the "{name}" {role} receives keyboard focus it is hidden behind {by}.' });
rule('focus.invisible-target', '2.4.7', 'Focus', 'Serious', 'Keyboard focus moves to content that is not visible.',
  'Hidden or off-screen elements do not receive keyboard focus.',
  'Remove hidden controls from the tab order (display:none, the hidden or inert attribute, or tabindex="-1").',
  'Tab moved focus to an element that could not be seen at that moment (zero size, clipped, off-screen or covered).',
  { regression: 'Focus is not correct while navigating/travelling through content', bug: 'Keyboard focus moves to "{name}", which is not visible on screen.' });
rule('focus.link-style', '', 'Focus', 'Minor', 'Links do not get underlined and change color when keyboard focused.',
  'RBI design rule: a keyboard-focused link becomes underlined and changes colour.',
  'Add a:focus-visible { text-decoration: underline; color: <focus colour>; } in line with the RBI design.',
  'RBI project rule. WCAG only needs some visible focus indicator; the RBI design additionally expects underline and colour change.',
  { level: 'Project', regression: 'Links do not get underlined and change color when keyboard focused' });

// ---------------------------------------------------------------- Keyboard
rule('keyboard.not-focusable', '2.1.1', 'Keyboard', 'Critical', 'Interactive element cannot be reached with the keyboard.',
  'Everything that works with a mouse also works with the keyboard.',
  'Use a real <button> or <a href>, or add tabindex="0", a role and Enter/Space key handling.',
  'The element has a click handler but is not focusable and has no focusable child.',
  { bug: 'The "{name}" control cannot be reached or operated with the keyboard.' });
rule('keyboard.clickable-review', '2.1.1', 'Keyboard', 'Moderate', 'Element looks clickable but is not keyboard focusable.',
  'Everything that works with a mouse also works with the keyboard.', 'If it is interactive, make it a <button> or <a href>.',
  'The element shows a pointer cursor but is not focusable; no click handler could be confirmed.',
  { manual: 'Click the element. If something happens, try to reach and operate it with Tab and Enter; if you cannot, log it under 2.1.1.' });
rule('keyboard.trap', '2.1.2', 'Keyboard', 'Critical', 'Keyboard focus is trapped.',
  'Focus can always be moved away with the keyboard, except inside an open modal dialog.',
  'Remove the focus trap, or make sure Tab and Escape leave the component.',
  'Pressing Tab repeatedly left focus on the same element while no modal dialog was open.',
  { bug: 'Keyboard focus is trapped on "{name}"; pressing Tab does not move focus away.' });
rule('keyboard.focus-lost', '2.4.3', 'Keyboard', 'Moderate', 'Keyboard focus disappears while tabbing.',
  'Focus always rests on a visible, identifiable element.', 'Make sure focus is not sent to the document body or to removed elements.',
  'During the Tab sequence focus landed on the page body between two controls.',
  { regression: 'Focus is not correct while navigating/travelling through content', manual: 'Tab through this part of the page and confirm focus never vanishes.' });
rule('keyboard.order', '2.4.3', 'Keyboard', 'Moderate', 'Focus is not correct while navigating/travelling through content.',
  'Focus order follows the visual reading order.', 'Fix the DOM order so it matches the visual order; avoid positive tabindex and CSS reordering.',
  'The keyboard focus path jumps backwards on screen, which suggests the focus order differs from the reading order.',
  { regression: 'Focus is not correct while navigating/travelling through content', manual: 'Tab through the steps listed in the evidence and confirm the order makes sense.' });
rule('keyboard.tabindex-positive', '2.4.3', 'Keyboard', 'Moderate', 'Positive tabindex changes the natural focus order.',
  'Focus order follows the DOM and reading order.', 'Remove tabindex values above 0 and order the DOM instead.',
  'tabindex greater than 0 pulls the element ahead of everything else in the tab order.',
  { manual: 'Confirm the resulting focus order is still logical.' });
rule('keyboard.reverse-order', '2.4.3', 'Keyboard', 'Moderate', 'Shift+Tab does not follow the reverse of the Tab order.',
  'Shift+Tab visits the same elements as Tab, in reverse.', 'Check scripts that move focus on blur or keydown.',
  'Going backwards with Shift+Tab landed on a different element than the forward order predicts.',
  { manual: 'Tab forward a few stops, then Shift+Tab back, and confirm the same elements are visited.' });
rule('keyboard.widget-unreachable', '2.1.1', 'Keyboard', 'Serious', 'Items in a composite widget cannot be reached with the keyboard.',
  'Tabs, menu items and options are reachable with Tab or with arrow keys.',
  'Implement arrow-key navigation (roving tabindex) or leave every item in the tab order.',
  'The other items in this widget have tabindex="-1" and the arrow keys did not move focus to them.',
  { bug: 'Items in the "{name}" {role} cannot be reached with the keyboard: they are out of the tab order and arrow keys do not move focus.' });
rule('keyboard.widget-toggle', '2.1.1', 'Keyboard', 'Serious', 'Expandable control does not respond to the keyboard.',
  'A control that exposes aria-expanded opens and closes with Enter or Space.', 'Use a native <button> or handle Enter and Space.',
  'Enter and Space were pressed on the focused control and aria-expanded did not change.',
  { bug: 'The "{name}" control does not open or close with Enter or Space.' });
rule('keyboard.unreached', '2.1.1', 'Keyboard', 'Moderate', 'Focusable element was not reached by Tab.',
  'Every interactive element can receive keyboard focus.', 'Check why the element is skipped (scripts moving focus, or a focus trap before it).',
  'The element looks tabbable but the completed Tab sequence never landed on it.',
  { manual: 'Tab through the page and confirm you can reach this element.' });

// ---------------------------------------------------------------- Headings
rule('headings.no-h1', '1.3.1', 'Headings', 'Moderate', 'Heading mark up not implemented correctly.',
  'The page has one <h1> describing its main content.', 'Mark the main page title as <h1>.',
  'No <h1> (or role="heading" aria-level="1") is exposed on the page. RBI audit rule; WCAG does not strictly require an h1.',
  { level: 'Project', regression: 'Heading mark up not implemented correctly', bug: 'The page has no level 1 heading.' });
rule('headings.multiple-h1', '1.3.1', 'Headings', 'Minor', 'More than one level 1 heading.',
  'Usually one <h1> per page.', 'Keep one <h1>; demote the others.',
  'Several visible <h1> elements were found.',
  { level: 'Project', regression: 'Heading mark up not implemented correctly', manual: 'Confirm whether more than one h1 is intended.' });
rule('headings.skipped', '1.3.1', 'Headings', 'Moderate', 'Heading mark up not implemented correctly.',
  'Heading levels go down one step at a time (h2 then h3, not h2 then h4).', 'Use the next level down, and style it with CSS.',
  'A heading level is skipped. RBI audit rule; WCAG treats skipped levels as poor practice rather than a strict failure.',
  { level: 'Project', regression: 'Heading mark up not implemented correctly', bug: 'Heading levels are skipped: "{name}" is an h{level} directly after an h{prev}.' });
rule('headings.empty', '1.3.1', 'Headings', 'Moderate', 'Empty heading.',
  'Every heading has text.', 'Remove the empty heading or give it text.',
  'A heading element is exposed with no accessible name.',
  { regression: 'Heading mark up not implemented correctly', bug: 'An empty {tag} heading is exposed to assistive technology.' });
rule('headings.visual', '1.3.1', 'Headings', 'Moderate', 'Missing heading mark up.',
  'Text that looks and works like a heading is marked up as <h1>-<h6>.', 'Use a heading element at the right level.',
  'Short, visually prominent text sits above other content but is not a heading element. This detection is a heuristic.',
  { regression: 'Missing heading mark up', manual: 'Decide whether this text is acting as a heading. If yes, log "Missing heading mark up".' });
rule('headings.none', '1.3.1', 'Headings', 'Moderate', 'Missing heading mark up.',
  'Pages with sections of content use headings.', 'Add headings that describe each section.',
  'The page has a lot of text and no heading elements at all.',
  { regression: 'Missing heading mark up', manual: 'Confirm the page has sections that need headings.' });
rule('headings.long', '1.3.1', 'Headings', 'Minor', 'Heading may be used only for styling.',
  'Headings are short labels for the content below them.', 'Use a paragraph with CSS styling if this is not a heading.',
  'The heading text is unusually long for a heading.',
  { manual: 'Check whether this is really a heading or body text styled with a heading tag.' });

// ---------------------------------------------------------------- Lists
rule('lists.fake', '1.3.1', 'Lists', 'Moderate', 'Missing List mark up.',
  'Lists are marked up with <ul>/<ol>/<li>.', 'Replace typed bullets or numbers with real list markup.',
  'Consecutive blocks start with typed bullet or number characters instead of using list elements.',
  { regression: 'Missing List mark up', bug: 'A visual list of {count} items is built with typed bullets or numbers instead of list mark up.' });
rule('lists.missing', '1.3.1', 'Lists', 'Moderate', 'Missing List mark up.',
  'Groups of related items are marked up as lists.', 'Wrap the items in <ul>/<ol> with <li>.',
  'Several similar sibling elements look like a list but use generic elements. This detection is a heuristic.',
  { regression: 'Missing List mark up', manual: 'Decide whether these items form a list. If yes, log "Missing List mark up".' });

// ---------------------------------------------------------------- Tables
rule('tables.no-headers', '1.3.1', 'Tables', 'Serious', 'Missing table header for table.',
  'Data tables mark header cells with <th>.', 'Change the header cells to <th> and add scope where needed.',
  'The table holds data in rows and columns but contains no <th> or header role.',
  { regression: 'Missing table header for table', bug: 'The data table has no header cells (<th>).' });
rule('tables.caption', '1.3.1', 'Tables', 'Moderate', 'Caption is missing for table.',
  'Data tables have a <caption> or an accessible name.', 'Add a <caption>, or aria-labelledby pointing at the table heading.',
  'The data table has no caption, aria-label or aria-labelledby. RBI audit rule; WCAG lists captions as a technique, not a strict requirement.',
  { level: 'Project', regression: 'Caption is missing for table', bug: 'The data table has no caption or accessible name.' });
rule('tables.layout-semantics', '1.3.1', 'Tables', 'Moderate', 'Table mark up implemented incorrectly.',
  'Layout tables do not use <th>, <caption> or summary.', 'Remove role="presentation" from a data table, or remove the header markup from a layout table.',
  'The table is marked as presentational but still contains header cells or a caption.',
  { regression: 'Table mark up implemented incorrectly' });
rule('tables.scope', '1.3.1', 'Tables', 'Serious', 'Table mark up implemented incorrectly.',
  'Tables with both row and column headers, or multi-level headers, associate cells using scope or headers/id.',
  'Add scope="col"/"row" (or headers/id for irregular tables).',
  'The table has headers in more than one direction or spanning cells, and its <th> cells have no scope or headers association.',
  { regression: 'Table mark up implemented incorrectly', confidence: 'probable' });
rule('tables.headers-ref', '1.3.1', 'Tables', 'Serious', 'Table mark up implemented incorrectly.',
  'Every id in a headers attribute exists in the same table.', 'Fix the headers attribute values.',
  'A cell headers attribute points at an id that does not exist in this table.',
  { regression: 'Table mark up implemented incorrectly' });
rule('tables.css-table', '1.3.1', 'Tables', 'Moderate', 'Table mark up implemented incorrectly.',
  'Tabular data uses <table> or ARIA table roles.', 'Use a real <table>, or add role="table", "row", "columnheader" and "cell".',
  'Generic elements are laid out as a table with CSS and expose no table semantics.',
  { regression: 'Table mark up implemented incorrectly', manual: 'Check whether this is tabular data. If yes, log "Table mark up implemented incorrectly".' });

// ---------------------------------------------------------------- Images
rule('images.missing-alt-informative', '1.1.1', 'Images', 'Critical', 'Missing alt text for informative images.',
  'Informative images have a text alternative.', 'Add alt text that describes the purpose or content of the image.',
  'The <img> has no alt attribute, aria-label or aria-labelledby and does not look decorative.',
  { regression: 'Missing alt text for informative images', bug: 'The informative image is missing an alternative text description.' });
rule('images.missing-alt-decorative', '1.1.1', 'Images', 'Serious', 'Missing alt attribute for decorative images.',
  'Decorative images use alt="" (or are hidden from assistive technology).', 'Add alt="".',
  'The <img> looks decorative but has no alt attribute at all, so screen readers may read its file name.',
  { regression: 'Missing alt attribute for decorative images', bug: 'The decorative image has no alt attribute.' });
rule('images.bad-alt', '1.1.1', 'Images', 'Serious', 'Alt text is a file name or placeholder.',
  'Alt text describes the image.', 'Write a real description, or use alt="" if the image is decorative.',
  'The alt text is a file name or a generic word such as "image", which is not a text alternative.',
  { bug: 'The image alt text "{name}" is a file name or placeholder, not a description.' });
rule('images.unnecessary-alt', '1.1.1', 'Images', 'Minor', 'Unnecessary alt text provided for decorative images.',
  'Decorative images, and images that repeat adjacent text, use alt="".', 'Use alt="" so the text is not read twice.',
  'The image looks decorative, or its alt text repeats the text next to it. Whether it is decorative is a judgement call.',
  { regression: 'Unnecessary alt text provided for decorative images', manual: 'Decide whether the image adds information. If it is decorative or repeats nearby text, log "Unnecessary alt text provided for decorative images".' });
rule('images.empty-alt-review', '1.1.1', 'Images', 'Moderate', 'Large content image has empty alt.',
  'Informative images have a text alternative.', 'Add alt text if the image conveys information.',
  'A large image in the main content is marked decorative (alt=""). The tool cannot judge whether it carries information.',
  { regression: 'Missing alt text for informative images', manual: 'Look at the image. If it conveys information, log "Missing alt text for informative images".' });
rule('images.complex', '1.1.1', 'Images', 'Serious', 'Long description is missing for complex images, graphs, etc.',
  'Charts, graphs, maps and diagrams have a longer description or an equivalent data table.',
  'Add a text description or data table next to the image and reference it with aria-describedby.',
  'The image looks like a chart, graph, map or diagram and no long description (aria-describedby, aria-details or figcaption) is associated with it.',
  { regression: 'Long description is missing for complex images, graphs, etc.', manual: 'Confirm the image is complex and that no equivalent description or data is provided nearby.' });
rule('images.svg-name', '1.1.1', 'Images', 'Serious', 'SVG image has no text alternative.',
  'An SVG with role="img" has an accessible name.', 'Add aria-label, or a <title> referenced by aria-labelledby, or hide it with aria-hidden="true" if decorative.',
  'The SVG is exposed as an image (role="img") with no accessible name.',
  { regression: 'Missing alt text for informative images' });
rule('images.svg-review', '1.1.1', 'Images', 'Minor', 'Standalone SVG has no text alternative.',
  'Informative SVGs have role="img" and a name; decorative ones are hidden.', 'Add role="img" with aria-label, or aria-hidden="true".',
  'A large SVG outside any control has no name and is not hidden. The tool cannot tell whether it is informative.',
  { manual: 'Decide whether the SVG conveys information; if so it needs a text alternative.' });

// ---------------------------------------------------------------- Names and links
rule('names.missing', '4.1.2', 'ARIA', 'Critical', 'Accessible name is missing for buttons, links, etc.',
  'Every interactive element has an accessible name.', 'Add visible text, aria-label or aria-labelledby.',
  'The accessible name computed for this control is empty.',
  { regression: 'Accessible name is missing for buttons, links, etc.', bug: 'The {role} ({selector}) has no accessible name.' });
rule('links.missing-name', '2.4.4', 'Links', 'Critical', 'Accessible name is missing for buttons, links, etc.',
  'Every link has an accessible name describing its destination.', 'Add link text, or alt text on the linked image.',
  'The accessible name computed for this link is empty.',
  { regression: 'Accessible name is missing for buttons, links, etc.', bug: 'The link to {href} has no accessible name.' });
rule('links.generic', '2.4.4', 'Links', 'Serious', 'Descriptive label is missing for links.',
  'Link purpose is clear from the link text, or the text plus its programmatic context.',
  'Use descriptive text, or add an aria-label such as "View more notifications".',
  'The link text is generic and there is no sentence, list item, table cell, heading or ARIA description giving it context.',
  { regression: 'Descriptive label is missing for links', bug: 'The "{name}" link does not describe its purpose and has no surrounding context.' });
rule('links.generic.review', '2.4.4', 'Links', 'Moderate', 'Descriptive label is missing for links.',
  'Link purpose is clear from the link text, or the text plus its programmatic context.',
  'Prefer descriptive text or an aria-label such as "View more notifications".',
  'The link text is generic. Context exists nearby (heading, list item or sentence), which WCAG allows, but RBI audits have logged these.',
  { regression: 'Descriptive label is missing for links', manual: 'Read the link with its context. If the purpose is still unclear, log "Descriptive label is missing for links".' });
rule('links.href', '4.1.2', 'Links', 'Moderate', 'Link has no real destination.',
  'Links go somewhere; actions use <button>.', 'Use a <button> for actions, or give the link a real href.',
  'The href is "#", empty or javascript:, so the element is a link by role but behaves like a button.',
  { manual: 'Check what the control does. If it performs an action, it should be a button.' });
rule('links.new-tab', '', 'Links', 'Minor', 'Opens in a new tab is not being rendered to the screen reader while activating links.',
  'RBI accessibility guidance: links that open a new tab say so in their accessible name or description.',
  'Add visually hidden text such as "(opens in a new tab)", or an icon with that alt text.',
  'The link has target="_blank" and nothing in its accessible name or description mentions a new tab or window. WCAG lists this as advisory (G201).',
  { level: 'Project', regression: 'Opening in a new tab is not communicated appropriately' });
rule('links.external', '', 'Links', 'Minor', 'External link is not announced as external to screen reader users.',
  'RBI accessibility guidance: a link that leaves the site says so in its accessible name or description (for example "external link").',
  'Add visually hidden text such as "(external link)", or an icon with that alt text, inside the link.',
  'The link goes to another website and nothing in its accessible name or description says it is external or opens a new tab. WCAG does not strictly require this.',
  { level: 'Project', regression: 'Opening in a new tab is not communicated appropriately' });
rule('links.internal-marked-external', '', 'Links', 'Minor', 'Internal link is announced as external.',
  'Only links that leave the site are announced as external.', 'Remove the "external" wording from links that stay on the site.',
  'The link stays on this site but its accessible name or description says it is external.',
  { level: 'Project', manual: 'Confirm where the link goes. If it stays on the site, the "external" wording is wrong.' });
rule('links.duplicate-adjacent', '', 'Screen Reader', 'Minor', 'Profile image receives multiple focus in screen reader read mode.',
  'An image and its text that go to the same place share one link.', 'Wrap the image and the text in a single <a>.',
  'Two neighbouring links in the same item go to the same URL, so a screen reader stops on the same destination twice. WCAG technique H2 recommends combining them.',
  { level: 'Project', regression: 'Profile image receives multiple focus in screen reader read mode', manual: 'With {sr} in browse mode, arrow through the item and confirm whether the same link is announced twice.' });
rule('names.label-in-name', '2.5.3', 'ARIA', 'Serious', 'Visible label is not part of the accessible name.',
  'The accessible name contains the visible text of the control.', 'Start the aria-label with the visible text, or remove the aria-label.',
  'The control shows visible text that does not appear in its accessible name, so voice-control users cannot activate it by what they see.',
  { bug: 'The control shows "{visible}" but its accessible name is "{name}".' });
rule('breadcrumb.current', '1.3.1', 'Links', 'Moderate', 'Current page indication is missing in the breadcrumb section.',
  'The current page in the breadcrumb carries aria-current="page".', 'Add aria-current="page" to the last breadcrumb item.',
  'A breadcrumb was found and none of its items has aria-current. RBI audit rule based on the ARIA breadcrumb pattern.',
  { level: 'Project', regression: 'Current-page indication is missing in the breadcrumb section', bug: 'The breadcrumb does not expose the current page (aria-current="page" is missing).' });

// ---------------------------------------------------------------- Forms
rule('forms.label', '1.3.1', 'Forms', 'Critical', 'Association is missing between label and input field.',
  'Every form control has a programmatically associated label.', 'Connect the label with for/id, wrap the control in <label>, or use aria-labelledby.',
  'The accessible name computed for this form control is empty.',
  { regression: 'Association is missing between label and input field', bug: 'The {role} field ({selector}) has no associated label.' });
rule('forms.placeholder-only', '3.3.2', 'Forms', 'Moderate', 'Field is labelled only by its placeholder or title.',
  'Fields have a persistent visible label.', 'Add a visible <label>.',
  'The only source of the accessible name is the placeholder or title attribute.',
  { manual: 'Confirm whether a visible label exists next to the field. If not, log under 3.3.2.' });
rule('forms.required', '3.3.2', 'Forms', 'Moderate', 'Required field is not exposed as required.',
  'Fields marked required visually also carry required or aria-required="true".', 'Add the required attribute.',
  'The label contains an asterisk or the word "required" but the control has neither required nor aria-required.',
  { manual: 'Confirm the field is mandatory; if so the required state must be exposed.' });
rule('forms.error-association', '3.3.1', 'Forms', 'Serious', 'Error message is not associated with its field.',
  'A field in error references its message with aria-describedby or aria-errormessage.', 'Point aria-describedby at the error text.',
  'The control has aria-invalid="true" but no aria-describedby or aria-errormessage that points at text.');
rule('forms.error-not-exposed', '3.3.1', 'Forms', 'Serious', 'Form errors are not exposed to assistive technology.',
  'When a form is submitted with missing or wrong values, each error is in text, is tied to its field (aria-describedby or aria-errormessage) or announced (role="alert"), and the field has aria-invalid="true".',
  'Set aria-invalid on the field, point aria-describedby at the error text, and put a summary in a role="alert" region or move focus to the first field in error.',
  'After the form was submitted empty, error text appeared on screen but it is not linked to a field, not in a live region, and focus did not move to a field in error.',
  { confidence: 'probable', bug: 'Submitting the "{name}" form with empty fields shows error messages that are not exposed to screen readers.' });
rule('forms.group', '1.3.1', 'Forms', 'Serious', 'Grouping (Legend and Fieldset) is missing for the checkboxes.',
  'Related radio buttons and checkboxes are grouped with <fieldset>/<legend> or role="group"/"radiogroup" with a name.',
  'Wrap the controls in <fieldset> with a <legend>, or add role="group" and aria-labelledby.',
  'Controls sharing one name attribute form a group, and no fieldset/legend or named ARIA group surrounds them.',
  { regression: 'Grouping is missing for related checkboxes', confidence: 'probable', bug: 'The {kind} group "{name}" is not grouped with a fieldset and legend (or a named ARIA group).' });
rule('forms.group.review', '1.3.1', 'Forms', 'Moderate', 'Grouping (Legend and Fieldset) is missing for the checkboxes.',
  'Related checkboxes are grouped with <fieldset>/<legend> or a named ARIA group.', 'Group them if they answer one question.',
  'Several checkboxes sit together without a fieldset or named group. They may be independent.',
  { regression: 'Grouping is missing for related checkboxes', manual: 'Decide whether these checkboxes answer one question. If yes, log the grouping issue.' });
rule('forms.autocomplete', '1.3.5', 'Forms', 'Minor', 'Input purpose is not identified.',
  'Fields collecting personal data use the matching autocomplete value.', 'Add autocomplete (for example "email", "tel", "name").',
  'The field looks like it collects personal data and has no autocomplete attribute.',
  { manual: 'Confirm the field collects the user\'s own name, email, phone or address.' });

// ---------------------------------------------------------------- ARIA and ids
rule('aria.broken-ref', '4.1.2', 'ARIA', 'Serious', 'ARIA attribute refers to an id that does not exist.',
  'Every id in aria-labelledby, aria-describedby and similar attributes exists on the page.', 'Fix the id, or remove the attribute.',
  'The attribute references an id that is not in the document, so the name or description is lost.',
  { bug: '{attr} on {selector} refers to the missing id "{id}".' });
rule('aria.hidden-focusable', '4.1.2', 'ARIA', 'Serious', 'aria-hidden content can receive keyboard focus.',
  'Nothing inside aria-hidden="true" is focusable.', 'Remove aria-hidden, or take the element out of the tab order (tabindex="-1" or inert).',
  'A keyboard-focusable element sits inside aria-hidden="true", so a screen reader user lands on something with no name or role.',
  { regression: 'Hidden content is read by screen reader' });
rule('aria.role-no-keyboard', '2.1.1', 'ARIA', 'Critical', 'Interactive ARIA role without keyboard support.',
  'Elements with interactive roles are focusable and operable by keyboard.', 'Use the native element, or add tabindex="0" and key handlers.',
  'The element has an interactive role but is not focusable.',
  { bug: 'The element with role="{role}" ("{name}") is not keyboard focusable.' });
rule('aria.redundant-role', '', 'ARIA', 'Minor', 'Unnecessary ARIA role.',
  'Use native HTML semantics instead of repeating them in ARIA.', 'Remove the redundant role attribute.',
  'The role attribute repeats the element\'s native role.', { level: 'Best practice' });
rule('aria.nested-interactive', '4.1.2', 'ARIA', 'Serious', 'Interactive control nested inside another.',
  'Links and buttons do not contain other focusable controls.', 'Move the inner control outside, or merge the two.',
  'A link or button contains another focusable element, which screen readers expose inconsistently and may focus twice.',
  { regression: 'Profile image receives multiple focus in screen reader read mode' });
rule('ids.duplicate-referenced', '4.1.2', 'ARIA', 'Serious', 'Duplicate id used by a label or ARIA reference.',
  'Ids used in for, aria-labelledby, aria-describedby or headers are unique.', 'Make the ids unique.',
  'The id appears more than once and is referenced, so the wrong element may supply the name.');
rule('ids.duplicate', '', 'ARIA', 'Minor', 'Duplicate id values.',
  'Ids are unique in the page.', 'Make the ids unique.',
  'The same id is used on several elements. It is not referenced by labels or ARIA, so no user impact was confirmed.',
  { level: 'Best practice' });

// ---------------------------------------------------------------- Hidden content
rule('hidden.exposed', '1.3.2', 'Screen Reader', 'Serious', 'Hidden content is read by screen reader.',
  'Content that is hidden visually (collapsed panels, inactive tabs, off-screen items) is also hidden from assistive technology.',
  'Hide it with display:none, the hidden attribute, inert or aria-hidden="true" while it is collapsed.',
  'The content cannot be seen (collapsed, transparent or clipped) but is still in the accessibility tree.',
  { regression: 'Hidden content is read by screen reader', manual: 'With {sr} in browse mode, arrow through this area and confirm whether the hidden text is read.' });
rule('hidden.visible-aria-hidden', '1.3.1', 'Screen Reader', 'Moderate', 'Visible text is hidden from screen readers.',
  'Visible, meaningful content is available to assistive technology.', 'Remove aria-hidden from meaningful content.',
  'Visible text sits inside aria-hidden="true".',
  { manual: 'Confirm the same information is available to screen reader users elsewhere.' });

// ---------------------------------------------------------------- Modals
rule('hover.content', '1.4.13', 'Keyboard', 'Serious', 'Content shown on hover or focus cannot be dismissed, hovered or does not stay.',
  'Content that appears on hover or focus can be dismissed with Escape, can itself be hovered, and stays until dismissed.',
  'Close the tooltip on Escape, keep it open while the pointer is over it, and do not hide it on a timer.',
  'The tooltip was opened by hovering or focusing its trigger, and one of the three WCAG 1.4.13 conditions did not hold.',
  { bug: 'The tooltip of "{name}" {problem}.' });
rule('modal.name', '4.1.2', 'Modals', 'Serious', 'Missing accessible name for the modal dialog.',
  'Dialogs have an accessible name from aria-labelledby or aria-label.', 'Point aria-labelledby at the dialog title.',
  'The dialog element has no accessible name.',
  { regression: 'Missing accessible name for the modal dialog', bug: 'The modal dialog ({selector}) has no accessible name.' });
rule('modal.focus-in', '2.4.3', 'Modals', 'Serious', 'Focus does not move into the modal dialog when it opens.',
  'Opening a dialog moves focus inside it.', 'Call focus() on the dialog or its first control when it opens.',
  'After the dialog opened, keyboard focus was still outside it.',
  { bug: 'When the "{name}" dialog opens, keyboard focus stays on the page behind it.' });
rule('modal.focus-escape', '2.4.3', 'Modals', 'Serious', 'Focus moves to the background content while the modal dialog is activated.',
  'While a modal dialog is open, Tab and Shift+Tab stay inside it.', 'Use <dialog>.showModal(), or make the background inert.',
  'Tabbing inside the open dialog moved focus to an element behind it.',
  { regression: 'Focus moves to the background content while modal dialog is activated', bug: 'Focus moves to the background content ("{to}") while the "{name}" modal dialog is open.' });
rule('modal.focus-return', '2.4.3', 'Modals', 'Moderate', 'Focus does not return after the modal dialog closes.',
  'Closing a dialog returns focus to the control that opened it.', 'Store the trigger and call focus() on it when closing.',
  'After closing the dialog, focus was not on the control that opened it.', { confidence: 'probable' });
rule('modal.escape', '2.1.1', 'Modals', 'Moderate', 'Modal dialog does not close with Escape.',
  'Dialogs close with Escape unless there is a reason not to.', 'Handle the Escape key.',
  'Pressing Escape left the dialog open.',
  { manual: 'Confirm whether this dialog is meant to close with Escape and that a keyboard-operable close control exists.' });
rule('modal.background', '4.1.2', 'Modals', 'Moderate', 'Background is not hidden while the modal dialog is open.',
  'While a modal is open, the content behind it is inert or hidden from assistive technology.', 'Use showModal(), or aria-modal="true" with inert on the background.',
  'The open dialog has no aria-modal="true", is not a native modal, and the background is neither inert nor aria-hidden.',
  { manual: 'With a screen reader in browse mode, confirm the background cannot be read while the dialog is open.' });

// ---------------------------------------------------------------- Page level
rule('page.title-missing', '2.4.2', 'Page', 'Serious', 'Incorrect Page Title.',
  'Every page has a <title> that describes it.', 'Add a descriptive <title>.', 'The page has no <title>, or it is empty.',
  { regression: 'Incorrect Page Title', bug: 'The page has no title.' });
rule('page.title-review', '2.4.2', 'Page', 'Moderate', 'Incorrect Page Title.',
  'The title describes the page and is unique within the site.', 'Use the pattern "Page name - Section - Site name".',
  'The title is generic, repeats on other pages, or shares no words with the main heading.',
  { regression: 'Incorrect Page Title', manual: 'Compare the title with the page content. If it does not describe this page, log "Incorrect Page Title".' });
rule('lang.missing', '3.1.1', 'Page', 'Serious', 'Page language is not set.',
  '<html> has a valid lang attribute.', 'Add lang="en" (or the page language) to <html>.', 'The <html> element has no lang attribute, or it is empty.');
rule('lang.invalid', '3.1.1', 'Page', 'Serious', 'Page language value is not valid.',
  '<html lang> is a valid language tag.', 'Use a valid tag such as "en" or "hi".', 'The lang value is not a well-formed language tag.');
rule('lang.parts', '3.1.2', 'Page', 'Moderate', 'Language change is not marked up.',
  'Text in another language carries its own lang attribute.', 'Add lang="hi" (or the right language) to the element.',
  'Text in Devanagari script appears on a page whose language is not a Devanagari-script language, without a lang attribute on it or an ancestor.',
  { confidence: 'probable', bug: 'The text "{name}" is in a different language from the page and has no lang attribute.' });
rule('landmarks.main', '', 'Landmarks', 'Moderate', 'Page has no main landmark.',
  'The page has one <main> landmark.', 'Wrap the primary content in <main>.', 'No <main> or role="main" was found.', { level: 'Best practice' });
rule('landmarks.unnamed', '', 'Landmarks', 'Minor', 'Repeated landmarks are not labelled.',
  'When a landmark type appears more than once, each has a unique accessible name.', 'Add aria-label, for example "Main navigation" and "Footer navigation".',
  'Several landmarks of the same type have no name or share the same name.', { level: 'Best practice' });
rule('landmarks.bypass', '2.4.1', 'Landmarks', 'Moderate', 'No skip link found.',
  'Users can bypass repeated blocks (skip link, landmarks or headings).', 'Add a "Skip to main content" link as the first focusable element.',
  'The first focusable elements do not include a working skip link. Landmarks or headings may still satisfy this criterion.',
  { manual: 'Confirm that a skip link, landmarks or headings let keyboard users bypass the header and navigation.' });

// ---------------------------------------------------------------- Dynamic content and screen reader
rule('dynamic.search-not-announced', '4.1.3', 'Dynamic Content', 'Serious', 'Search results are not being announced by the screen reader.',
  'When results update without a page load, the result count or status is exposed in a live region (role="status") or focus moves to the results.',
  'Add a role="status" element and update its text with the number of results.',
  'After the search ran the page content changed, no live region changed, and focus did not move into the results.',
  { regression: 'Search results are not being announced by the screen reader', confidence: 'probable', bug: 'After searching for "{query}", the results update is not exposed to screen readers (no live region update, and focus does not move).' });
rule('dynamic.pagination-not-announced', '4.1.3', 'Dynamic Content', 'Serious', 'Dynamic content is not being rendered to screen reader users.',
  'When pagination loads new results without a page load, the change is announced (live region) or focus moves to the new results.',
  'Move focus to the results heading, or update a role="status" region with the new page number.',
  'Pressing "next" changed the content without a page load, no live region changed, and focus stayed on the pagination control.',
  { regression: 'Dynamic content is not being rendered to the screen reader users', confidence: 'probable', bug: 'Moving to the next page of results is not announced to screen readers.' });
rule('pagination.current', '1.3.1', 'Links', 'Moderate', 'Current page is not exposed in the pagination.',
  'The current page in a pagination control carries aria-current="page".', 'Add aria-current="page" to the current page item.',
  'A pagination control was found and none of its items has aria-current. RBI audit rule based on the ARIA pagination pattern.',
  { level: 'Project', bug: 'The pagination does not expose the current page (aria-current is missing).' });
rule('media.captions', '1.2.2', 'Page', 'Serious', 'Video has no captions track.',
  'Prerecorded video with speech has captions.', 'Add a <track kind="captions"> or burn-in captions.',
  'The video element has no captions or subtitles track. Captions may be burned into the video itself.',
  { manual: 'Play the video. If it has speech or meaningful sound and no captions, log it under 1.2.2.' });
rule('media.autoplay', '1.4.2', 'Page', 'Serious', 'Media plays automatically with sound.',
  'Audio that plays automatically for more than 3 seconds can be paused, stopped or muted.', 'Do not autoplay, or start muted with visible controls.',
  'The media element has autoplay and is not muted.',
  { manual: 'Load the page with sound on. If audio plays for more than 3 seconds with no way to stop it, log it under 1.4.2.' });
rule('forced.focus-missing', '2.4.7', 'Focus', 'Moderate', 'Focus indicator disappears in Windows High Contrast.',
  'The focus indicator is still visible when the system forces its own colours (Windows High Contrast).',
  'Use a real outline for focus (it survives forced colours). If you keep box-shadow, add outline: 2px solid transparent.',
  'With forced colours emulated, the element looked exactly the same focused and unfocused. Box-shadow and background colours are removed in this mode.',
  { level: 'Best practice', bug: 'In Windows High Contrast mode, keyboard focus is not visible on the "{name}" {role}.' });
rule('dynamic.no-live-region', '4.1.3', 'Dynamic Content', 'Moderate', 'Dynamic content is not being rendered to screen reader users.',
  'Status messages are exposed with role="status", role="alert" or aria-live.', 'Add a live region for status updates.',
  'The page has search, filter or pagination controls that update content, and no live region exists anywhere on the page.',
  { regression: 'Dynamic content is not being rendered to the screen reader users', manual: 'Use the filter or search and listen with {sr}: the change must be announced.' });
rule('sr.announcement', '4.1.3', 'Screen Reader', 'Moderate', 'Actual assistive-technology announcement: MANUAL_REVIEW.',
  'What the screen reader says matches what sighted users see.', 'Fix the markup if the announcement is missing, late or wrong.',
  'Programmatic accessibility markup was found for this feature. ' + SR_NOTE,
  { manual: 'Trigger the feature with {sr} running and confirm the announcement is made, is timely and is worded correctly.' });
rule('dates.range', '', 'Screen Reader', 'Minor', 'Incorrect screen reader announcement for date range hyphens.',
  'Date ranges are announced as "... to ...".', 'Write "to" in text, or add visually hidden text for the separator.',
  'A date range uses a hyphen or dash as the separator, which a screen reader may read as "dash" or skip. RBI regression rule.',
  { level: 'Project', regression: 'Incorrect screen reader announcement for date range hyphens', manual: 'Listen to the date range with {sr}. If the separator is read as "dash" or not at all, log the issue.' });
rule('assoc.link-date', '1.3.1', 'Screen Reader', 'Moderate', 'Association is missing between links and dates.',
  'Each date is grouped in the DOM with the link or card it belongs to.', 'Wrap each item (link, date, description) in its own <li> or <article>.',
  'Several dates and several links share one container with no per-item grouping, so the relationship exists only visually. This detection is a heuristic.',
  { regression: 'Association is missing between links and dates', manual: 'Read the list with a screen reader and confirm each date is announced with the right link.' });

// ---------------------------------------------------------------- Carousel
rule('carousel.autoplay', '2.2.2', 'Carousel', 'Serious', 'Auto-rotating carousel has no pause control.',
  'Content that moves automatically for more than 5 seconds can be paused, stopped or hidden.', 'Add a visible, keyboard-operable pause button.',
  'The carousel changed on its own while being observed and no pause, stop or play control was found inside it.',
  { confidence: 'probable', bug: 'The "{name}" carousel rotates automatically and has no pause control.' });
rule('carousel.name', '', 'Carousel', 'Minor', 'Carousel has no accessible name.',
  'A carousel is a named region (aria-roledescription="carousel" with aria-label).', 'Add role="region", aria-roledescription="carousel" and aria-label.',
  'The carousel container has no accessible name.', { level: 'Best practice' });
rule('carousel.hidden-focusable', '2.4.7', 'Carousel', 'Serious', 'Carousel does not move according to keyboard focus.',
  'Slides that are not visible cannot receive focus, or the carousel brings the focused slide into view.',
  'Set inert or display:none on off-screen slides, or scroll the focused slide into view.',
  'Focusable elements sit in slides that are clipped out of view and are not hidden or inert.',
  { regression: 'Focus is not correct while navigating/travelling through content', manual: 'Tab through the carousel and confirm the slide that has focus is always the one on screen.' });

// ---------------------------------------------------------------- Responsive and zoom
rule('responsive.overflow', '1.4.10', 'Responsive', 'Serious', 'Page scrolls horizontally at a small viewport.',
  'At 320 CSS pixels wide, content reflows without horizontal scrolling (data tables, maps and diagrams excepted).',
  'Remove fixed widths; use max-width:100%, flex-wrap and responsive units.',
  'document.documentElement.scrollWidth is larger than clientWidth.',
  { bug: 'At {viewport} the page scrolls horizontally: content is {scrollWidth}px wide in a {clientWidth}px viewport.' });
rule('responsive.truncated', '1.4.10', 'Responsive', 'Serious', 'Content gets truncated in 320x256 viewport.',
  'No text is cut off or lost when the viewport is small.', 'Let the text wrap; remove fixed heights, overflow:hidden and nowrap.',
  'The element clips its own text (its content is larger than its box) at this viewport and did not at desktop width.',
  { regression: 'Content gets truncated in 320x256 viewport', bug: 'At {viewport} the text "{name}" is truncated.' });
rule('responsive.overlap', '1.4.10', 'Responsive', 'Serious', 'Content overlaps at a small viewport.',
  'Text, images and controls do not cover each other.', 'Fix the layout so the items stack instead of overlapping.',
  'Two elements overlap at this viewport and did not at desktop width. Overlap is detected from bounding boxes and can be intentional.',
  { manual: 'Open the screenshot and confirm whether text or controls are covered.' });
rule('responsive.carousel-overlay', '1.4.10', 'Responsive', 'Serious', 'Overlay appears on carousel at 360x256.',
  'Carousel text and controls do not cover each other.', 'Reposition the controls or caption at small viewports.',
  'Elements inside a carousel overlap at this viewport and did not at desktop width.',
  { regression: 'Overlay appears on carousel at 360x256', manual: 'Open the screenshot and confirm whether carousel content is covered.' });
rule('responsive.offscreen', '1.4.10', 'Responsive', 'Serious', 'Interactive control is positioned off-screen.',
  'All controls stay reachable at small viewports.', 'Keep controls inside the viewport or inside a scrollable area.',
  'A visible, focusable control lies entirely outside the page width and outside any scroll container.',
  { manual: 'Confirm the control cannot be reached by scrolling.' });
rule('responsive.hidden-content', '1.4.10', 'Responsive', 'Moderate', 'Content disappears at a small viewport.',
  'Content and functions available at desktop width remain available.', 'Do not hide content at small sizes unless it is offered another way.',
  'Text inside the main content was visible at desktop width and is not rendered at this viewport.',
  { manual: 'Confirm the content is still available some other way (for example behind a menu or "show more").' });
rule('responsive.fixed-cover', '1.4.10', 'Responsive', 'Moderate', 'Fixed or sticky elements cover a large part of the viewport.',
  'Sticky headers and footers leave enough room to read the content.', 'Unstick or shrink the fixed elements at small heights.',
  'Fixed or sticky elements cover a large share of the viewport height.',
  { manual: 'Scroll the page at this size and confirm the content can still be read.' });
rule('responsive.small-target', '2.5.8', 'Responsive', 'Moderate', 'Controls become too small.',
  'Pointer targets are at least 24x24 CSS pixels, or have enough spacing.', 'Increase the size or padding of the control.',
  'Controls smaller than 24x24 CSS pixels were found at this viewport. Inline links in text and well-spaced targets are exempt, so each needs a look.',
  { manual: 'Check the listed controls; if they have no 24px spacing around them, log under 2.5.8.' });
rule('spacing.truncated', '1.4.12', 'Responsive', 'Serious', 'Text is cut off when text spacing is increased.',
  'With line height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em, no content or function is lost.',
  'Remove fixed heights and overflow:hidden from text containers; let them grow with their text.',
  'With the WCAG text-spacing values applied, the element clips its own text, and it did not before.',
  { bug: 'With text spacing increased, the text "{name}" is cut off.' });
rule('spacing.overlap', '1.4.12', 'Responsive', 'Serious', 'Content overlaps when text spacing is increased.',
  'With the WCAG text-spacing values applied, text does not overlap other content.', 'Let containers grow with their text.',
  'With the WCAG text-spacing values applied, two elements overlap that did not before.',
  { manual: 'Open the screenshot and confirm whether text or controls are covered.' });
rule('zoom.overflow', '1.4.4', 'Zoom', 'Moderate', 'Page scrolls horizontally at 200% zoom.',
  'At 200% zoom content stays usable; horizontal scrolling is avoided where possible.', 'Use responsive layout so content reflows.',
  'At the 200% equivalent viewport the page is wider than the viewport.',
  { manual: 'At 200% browser zoom, confirm no content or function is lost and that the scrolling is acceptable.' });
rule('zoom.truncated', '1.4.4', 'Zoom', 'Serious', 'Text is clipped at 200% zoom.',
  'Text can be resized to 200% without loss of content.', 'Let containers grow with their text.',
  'The element clips its own text at the zoomed viewport and did not at 100%.',
  { bug: 'At {viewport} the text "{name}" is clipped.' });
rule('zoom.overlap', '1.4.4', 'Zoom', 'Serious', 'Content overlaps at 200% zoom.',
  'Content does not overlap when zoomed.', 'Fix the layout so items stack.',
  'Two elements overlap at the zoomed viewport and did not at 100%.',
  { manual: 'Open the screenshot and confirm whether text or controls are covered.' });

export const RULES: Record<string, RuleMeta> = R;

/**
 * Looks a rule up. Layout rules are shared: "zoom.x" and "reflow.x" fall back to "responsive.x".
 * Example: ruleFor('zoom.fixed-cover')
 */
export function ruleFor(id: string): RuleMeta | undefined {
  if (R[id]) return R[id];
  const dot = id.indexOf('.');
  const prefix = id.slice(0, dot), rest = id.slice(dot + 1);
  const base = R['responsive.' + rest];
  if (!base) return undefined;
  if (prefix === 'zoom') return { ...base, id, category: 'Zoom', wcag: base.wcag === '1.4.10' ? '1.4.4' : base.wcag, regression: undefined };
  if (prefix === 'reflow') return { ...base, id, category: 'Zoom' };
  return undefined;
}

/** axe rules the custom scanners replace; switched off so the same issue is not reported twice. */
export const AXE_DISABLED = ['color-contrast', 'color-contrast-enhanced'];
