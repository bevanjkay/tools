import type { SignaturePreset } from "./signature-presets.js";

export interface SignaturePerson {
	name: string;
	pronouns: string;
	role: string;
	phone: string;
	email: string;
	/** Optional line under the role, e.g. "Part-time: Tue–Thu". */
	extraLine: string;
}

/** Gmail silently truncates signatures above this many characters. */
export const GMAIL_SIGNATURE_LIMIT = 10_000;

export function emptyPerson(): SignaturePerson {
	return { name: "", pronouns: "", role: "", phone: "", email: "", extraLine: "" };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

export function escapeHtml(text: string) {
	return text.replace(/[&<>"']/g, char => ESCAPES[char]);
}

/** Adds https:// to scheme-less input and rejects any scheme other than http(s). */
export function normalizeWebUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed)
		return "";
	const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return /^https?:\/\//i.test(withScheme) ? withScheme : "";
}

/** Gmail only keeps images served from absolute https URLs. */
export function isHttpsUrl(value: string) {
	try {
		return new URL(value.trim()).protocol === "https:";
	}
	catch {
		return false;
	}
}

// --- Phone numbers ------------------------------------------------------------

const NON_DIGIT_RE = /\D/g;

/** Digits in national form (leading 0), or null when the input is not an Australian number. */
function nationalDigits(input: string) {
	let digits = input.replace(NON_DIGIT_RE, "");
	if (input.trim().startsWith("+61") || (digits.startsWith("61") && digits.length === 11))
		digits = `0${digits.slice(2)}`;
	return digits;
}

function group(digits: string, ...sizes: number[]) {
	const parts: string[] = [];
	let offset = 0;
	for (const size of sizes) {
		parts.push(digits.slice(offset, offset + size));
		offset += size;
	}
	return parts.join(" ");
}

/** Format Australian numbers the way they are usually printed; anything else is returned trimmed. */
export function formatAustralianPhone(input: string) {
	const digits = nationalDigits(input);
	if (digits.length === 10 && digits.startsWith("04"))
		return group(digits, 4, 3, 3);
	if (digits.length === 10 && /^0[2378]/.test(digits))
		return group(digits, 2, 4, 4);
	if (digits.length === 10 && /^1[38]00/.test(digits))
		return group(digits, 4, 3, 3);
	if (digits.length === 6 && digits.startsWith("13"))
		return group(digits, 2, 2, 2);
	return input.trim();
}

/** `tel:` target in E.164 where the number is recognisably Australian. */
export function phoneHref(input: string) {
	const digits = nationalDigits(input);
	if (digits.length === 10 && digits.startsWith("0"))
		return `tel:+61${digits.slice(1)}`;
	return `tel:${input.replace(/[^\d+]/g, "")}`;
}

// --- Rendering ----------------------------------------------------------------

function row(content: string, style = "") {
	return `<tr><td style="padding:0;${style}">${content}</td></tr>`;
}

function link(href: string, text: string, color: string, extraStyle = "") {
	return `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none;${extraStyle}">${text}</a>`;
}

/**
 * Table-only, inline-styled HTML that survives Gmail, Outlook and Spark.
 * Every piece of person or preset data is escaped.
 */
export function renderSignatureHtml(preset: SignaturePreset, person: SignaturePerson) {
	// Font stacks legitimately contain quotes, so escape them like any other attribute value.
	const font = `font-family:${escapeHtml(preset.fontStack)};`;
	const base = `${font}font-size:14px;line-height:20px;color:${preset.textColor};`;
	const muted = `${font}font-size:13px;line-height:18px;color:${preset.mutedColor};`;
	const name = person.name.trim();
	const pronouns = person.pronouns.trim();
	const role = person.role.trim();
	const extra = person.extraLine.trim();
	const phone = person.phone.trim();
	const email = person.email.trim();
	const website = normalizeWebUrl(preset.website);

	const rows: string[] = [];
	if (name) {
		const pronounsHtml = pronouns ? ` <span style="font-weight:normal;color:${preset.mutedColor};font-size:13px;">(${escapeHtml(pronouns)})</span>` : "";
		rows.push(row(`${escapeHtml(name)}${pronounsHtml}`, `${font}font-size:16px;line-height:22px;font-weight:bold;color:${preset.accentColor};`));
	}
	if (role)
		rows.push(row(escapeHtml(role), base));
	if (extra)
		rows.push(row(escapeHtml(extra), muted));

	const contact: string[] = [];
	if (phone)
		contact.push(row(link(phoneHref(phone), escapeHtml(formatAustralianPhone(phone)), preset.textColor), base));
	if (email)
		contact.push(row(link(`mailto:${email}`, escapeHtml(email), preset.textColor), base));
	if (contact.length > 0) {
		contact[0] = contact[0].replace("padding:0;", "padding:8px 0 0 0;");
		rows.push(...contact);
	}

	const org: string[] = [];
	if (website)
		org.push(row(link(website, escapeHtml(preset.websiteLabel.trim() || website.replace(/^https?:\/\//, "")), preset.accentColor), base));
	if (preset.addressLine.trim())
		org.push(row(escapeHtml(preset.addressLine.trim()), muted));
	const socials = preset.socials.flatMap((social) => {
		const url = social ? normalizeWebUrl(social.url) : "";
		return url && social.label.trim() ? [{ label: social.label.trim(), url }] : [];
	});
	if (socials.length > 0)
		org.push(row(socials.map(social => link(social.url, escapeHtml(social.label), preset.mutedColor)).join("&nbsp;&middot;&nbsp;"), muted));
	if (org.length > 0) {
		org[0] = org[0].replace("padding:0;", "padding:8px 0 0 0;");
		rows.push(...org);
	}

	const details = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table>`;

	// Anything but an absolute https URL would not survive Gmail, so leave it out rather than emit a broken image.
	const logo = isHttpsUrl(preset.logoUrl) ? preset.logoUrl.trim() : "";
	const logoCell = logo
		? `<td valign="top" style="padding:0 16px 0 0;vertical-align:top;">${
			website ? `<a href="${escapeHtml(website)}" style="text-decoration:none;">` : ""
		}<img src="${escapeHtml(logo)}" width="${preset.logoWidth}" height="${preset.logoHeight}" alt="${escapeHtml(preset.name)}" border="0" style="display:block;border:0;outline:none;text-decoration:none;width:${preset.logoWidth}px;height:${preset.logoHeight}px;">${
			website ? "</a>" : ""
		}</td>`
		: "";
	const detailsCell = `<td valign="top" style="padding:0 0 0 ${logo ? 16 : 0}px;vertical-align:top;${logo ? `border-left:2px solid ${preset.accentColor};` : ""}">${details}</td>`;

	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${base}"><tr>${logoCell}${detailsCell}</tr></table>`;
}

export function renderSignatureText(preset: SignaturePreset, person: SignaturePerson) {
	const lines: string[] = [];
	const name = person.name.trim();
	if (name)
		lines.push(person.pronouns.trim() ? `${name} (${person.pronouns.trim()})` : name);
	if (person.role.trim())
		lines.push(person.role.trim());
	if (person.extraLine.trim())
		lines.push(person.extraLine.trim());
	if (person.phone.trim())
		lines.push(formatAustralianPhone(person.phone));
	if (person.email.trim())
		lines.push(person.email.trim());
	const website = normalizeWebUrl(preset.website);
	if (preset.name.trim() || website)
		lines.push([preset.name.trim(), website].filter(Boolean).join(" · "));
	if (preset.addressLine.trim())
		lines.push(preset.addressLine.trim());
	return lines.join("\n");
}

// --- Prefill ------------------------------------------------------------------

const PERSON_PARAMS: Record<string, keyof SignaturePerson> = {
	name: "name",
	pronouns: "pronouns",
	role: "role",
	phone: "phone",
	email: "email",
	line: "extraLine",
};

/** Read `?preset=yavic&name=…` style links into a partial person. */
export function parsePrefill(search: string | URLSearchParams) {
	const params = typeof search === "string" ? new URLSearchParams(search) : search;
	const person: Partial<SignaturePerson> = {};
	for (const [param, key] of Object.entries(PERSON_PARAMS)) {
		const value = params.get(param);
		if (value !== null && value !== "")
			person[key] = value;
	}
	return { preset: params.get("preset") || undefined, person };
}

export function buildPrefillQuery(presetId: string, person: SignaturePerson) {
	const params = new URLSearchParams();
	params.set("preset", presetId);
	for (const [param, key] of Object.entries(PERSON_PARAMS)) {
		if (person[key].trim())
			params.set(param, person[key].trim());
	}
	return params.toString();
}
