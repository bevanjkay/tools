export interface SocialLink {
	label: string;
	url: string;
}

export interface SignaturePreset {
	id: string;
	/** Organisation name, used for the logo alt text and plain-text output. */
	name: string;
	/** Absolute https URL; Gmail drops data: URIs and SVG. */
	logoUrl: string;
	/** Displayed size in CSS px; the hosted file should be about twice this. */
	logoWidth: number;
	logoHeight: number;
	/** Name colour and divider; must meet WCAG AA on white. */
	accentColor: string;
	textColor: string;
	mutedColor: string;
	fontStack: string;
	website: string;
	websiteLabel: string;
	addressLine: string;
	socials: SocialLink[];
}

export const SITE_ASSETS = "https://bevanjkay.github.io/tools";

// TODO: replace every preset below with the real brand values (logo URL and
// size, hex colours, font, website, address, socials). The colours here are
// neutral placeholders that pass WCAG AA on white.
const placeholder = {
	logoUrl: `${SITE_ASSETS}/signatures/placeholder-logo.jpg`,
	logoWidth: 96,
	logoHeight: 96,
	accentColor: "#1d4ed8",
	textColor: "#111827",
	mutedColor: "#4b5563",
	fontStack: "Arial, Helvetica, sans-serif",
	addressLine: "",
	socials: [] as SocialLink[],
};

export const PRESETS: SignaturePreset[] = [
	{
		...placeholder,
		id: "reside",
		name: "Reside Church",
		website: "https://example.com", // TODO: website and brand values
		websiteLabel: "example.com",
	},
	{
		...placeholder,
		id: "yavic",
		name: "Youth Alive Victoria",
		website: "https://example.com", // TODO: website and brand values
		websiteLabel: "example.com",
	},
	{
		...placeholder,
		id: "gsci",
		name: "Gateway Stronger Communities",
		website: "https://example.com", // TODO: website and brand values
		websiteLabel: "example.com",
	},
	{
		...placeholder,
		id: "bkd",
		name: "bkd",
		website: "https://bevankay.me", // TODO: brand values
		websiteLabel: "bevankay.me",
	},
];

export const CUSTOM_PRESET_ID = "custom";

export const CUSTOM_SOCIAL_SLOTS = 3;

export function customPreset(): SignaturePreset {
	return {
		...placeholder,
		id: CUSTOM_PRESET_ID,
		name: "",
		logoUrl: "",
		website: "",
		websiteLabel: "",
		socials: Array.from({ length: CUSTOM_SOCIAL_SLOTS }, () => ({ label: "", url: "" })),
	};
}

export function findPreset(id: string | null | undefined) {
	return PRESETS.find(preset => preset.id === id) ?? null;
}
